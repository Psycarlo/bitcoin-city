import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Box3, Vector3 } from "three";
import type { OrthographicCamera, PerspectiveCamera, Vector2 } from "three";

import { parseKey } from "@/lib/scene-key";
import type { SceneKey } from "@/lib/scene-key";
import { useCameraStore } from "@/stores/camera-store";
import type { CameraCommand } from "@/stores/camera-store";
import { useViewStore } from "@/stores/view-store";

import { CAMERA_BOUNDS, HOME_POINTS } from "./layout";
import { locate } from "./positions";

const { ACTION } = CameraControlsImpl;
const DEG = Math.PI / 180;

/** Home view: from the south, a little east, close to isometric. */
const HOME: Angles = { azimuth: 28 * DEG, polar: 54 * DEG };
const FULL_TURN = 2 * Math.PI;
/** Distance from the camera to what it looks at; orthographic, so only clipping cares. */
const DISTANCE = 6000;
const MIN_POLAR = 10 * DEG;
const MAX_POLAR = 74 * DEG;
/** Zoom is in pixels per unit: this close, the smallest building is a finger wide. */
const MAX_ZOOM = 14;
/** Zooming out stops at this share of the home zoom. */
const MIN_ZOOM_SHARE = 0.45;
/** A block is brought into view filling the free room, less this share of it… */
const FOCUS_MARGIN = 0.3;
/** …and a transaction at least this close. */
const TX_ZOOM = 4;
/** What is not on show yet (its city is loading) is looked for this often (s)… */
const RETRY_EVERY = 0.25;
/** …for this long (s). */
const RETRY_FOR = 12;
/** Smallest extent a view frames, so a single point gets a finite zoom. */
const MIN_EXTENT = 1;
/** Below this height the view's centre counts as on the ground. */
const GROUND_TOLERANCE = 0.5;
const SMOOTH_TIME = 0.3;
/** How quickly the picture's centre follows the panels when they change (1/s). */
const GLIDE_RATE = 8;
/** Closer than this (px), the centre snaps to where it is going. */
const GLIDE_SNAP = 0.5;
/** Already home, going home again gives a little nod (a share of the zoom)… */
const NOD = 0.06;
/** …that bounces back after this long (ms). */
const NOD_MS = 170;
/** Within these of the home view, it counts as there. */
const HOME_TOLERANCE = { angle: 0.5 * DEG, distance: 2, zoom: 0.01 } as const;

const MOUSE_BUTTONS = {
  left: ACTION.TRUCK,
  middle: ACTION.ZOOM,
  right: ACTION.ROTATE,
  wheel: ACTION.ZOOM,
} as const;

const TOUCHES = {
  one: ACTION.TOUCH_TRUCK,
  three: ACTION.TOUCH_ROTATE,
  two: ACTION.TOUCH_ZOOM_ROTATE,
} as const;

/** Room the UI panels take on each side of the viewport (px). */
export interface Insets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface Size {
  height: number;
  width: number;
}

/** Where the camera looks from, around what it looks at. */
interface Angles {
  azimuth: number;
  polar: number;
}

/** What the camera looks at (on the ground) and how close. */
interface View {
  target: Vector3;
  zoom: number;
}

/** A focus still waiting for its subject to show up. */
interface Pending {
  key: SceneKey;
  /** When to look again, and when to give up (clock time, s). */
  next: number;
  until: number;
}

/** The room the panels leave free in the viewport (px). */
const roomOf = (size: Size, insets: Insets, margin = 0): Size => ({
  height: (size.height - insets.top - insets.bottom) * (1 - margin),
  width: (size.width - insets.left - insets.right) * (1 - margin),
});

/** The view that fits the points in the room, looking from the given angles. */
const frameView = (
  points: readonly Vector3[],
  { azimuth, polar }: Angles,
  room: Size
): View => {
  const forward = new Vector3()
    .setFromSphericalCoords(1, polar, azimuth)
    .negate();
  const right = new Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
  const up = new Vector3().crossVectors(right, forward);
  const across = points.map((point) => point.dot(right));
  const upwards = points.map((point) => point.dot(up));
  const [minAcross, maxAcross] = [Math.min(...across), Math.max(...across)];
  const [minUp, maxUp] = [Math.min(...upwards), Math.max(...upwards)];
  const zoom = Math.min(
    Math.max(1, room.width) / Math.max(MIN_EXTENT, maxAcross - minAcross),
    Math.max(1, room.height) / Math.max(MIN_EXTENT, maxUp - minUp)
  );
  // Centre of the points on screen, slid along the line of sight down to
  // the ground, which looks the same.
  const target = new Vector3()
    .addScaledVector(right, (minAcross + maxAcross) / 2)
    .addScaledVector(up, (minUp + maxUp) / 2);
  target.addScaledVector(forward, -target.y / forward.y);
  return { target, zoom };
};

const cornersOf = ({ max, min }: Box3) =>
  [min.x, max.x].flatMap((x) =>
    [min.y, max.y].flatMap((y) =>
      [min.z, max.z].map((z) => new Vector3(x, y, z))
    )
  );

/** The angle equal to `wanted` that is the shortest turn away from `current`. */
const nearestTurn = (current: number, wanted: number) =>
  wanted + FULL_TURN * Math.round((current - wanted) / FULL_TURN);

/**
 * Puts the point the camera turns around back on the ground, by sliding the
 * camera along its line of sight (the picture stays the same). Panning and
 * zooming to the cursor move that point off the ground, which would make the
 * view swing around a point in the air when turned.
 */
const settleOnGround = (controls: CameraControlsImpl) => {
  const target = controls.getTarget(new Vector3(), true);
  if (Math.abs(target.y) < GROUND_TOLERANCE) {
    return;
  }
  const position = controls.getPosition(new Vector3(), true);
  const sight = target.clone().sub(position);
  if (sight.y >= 0) {
    return;
  }
  const shift = sight.multiplyScalar(-target.y / sight.y);
  void controls.setLookAt(
    position.x + shift.x,
    position.y + shift.y,
    position.z + shift.z,
    target.x + shift.x,
    0,
    target.z + shift.z,
    false
  );
};

/** The parts of camera-controls' zooming that `stackZoomSteps` swaps out. */
interface ZoomInternals {
  _changedZoom: number;
  _dollyControlCoord: Vector2;
  _zoom: number;
  _zoomEnd: number;
  _zoomInternal: (delta: number, x: number, y: number) => void;
}

/**
 * camera-controls scales each wheel or pinch step from the zoom it is passing
 * through rather than the one it is heading to, so the steps of a quick
 * scroll overwrite each other instead of adding up, and zooming feels sluggish.
 * Scales from where it is heading instead (as its dolly already does).
 */
const stackZoomSteps = (controls: CameraControlsImpl) => {
  const internals = controls as unknown as ZoomInternals;
  internals._zoomInternal = (delta, x, y) => {
    void controls.zoomTo(
      internals._zoomEnd * 0.95 ** (delta * controls.dollySpeed),
      true
    );
    // What is left to zoom, which zooming to the cursor shifts the view by.
    internals._changedZoom = internals._zoomEnd - internals._zoom;
    internals._dollyControlCoord.set(x, y);
  };
};

/**
 * Moves the centre of the picture (what the camera looks at, turns and zooms
 * around) to the middle of the room the panels leave free, gliding there when
 * the panels change, by shifting the camera's view.
 */
const centreInRoom = (
  camera: OrthographicCamera | PerspectiveCamera,
  size: Size,
  insets: Insets,
  delta: number
) => {
  const goalX = (insets.right - insets.left) / 2;
  const goalY = (insets.bottom - insets.top) / 2;
  const { view } = camera;
  let [x, y] = [goalX, goalY];
  if (
    view?.enabled &&
    view.fullWidth === size.width &&
    view.fullHeight === size.height
  ) {
    const blend = 1 - Math.exp(-GLIDE_RATE * delta);
    x = view.offsetX + (goalX - view.offsetX) * blend;
    y = view.offsetY + (goalY - view.offsetY) * blend;
    if (Math.hypot(goalX - x, goalY - y) < GLIDE_SNAP) {
      [x, y] = [goalX, goalY];
    }
    if (x === view.offsetX && y === view.offsetY) {
      return;
    }
  }
  camera.setViewOffset(size.width, size.height, x, y, size.width, size.height);
};

const box = new Box3();

interface CameraRigProps {
  /**
   * What the camera is steered from: the canvas and the HTML over it, so
   * dragging or zooming over a label moves the camera as well.
   */
  frame: HTMLElement | null;
  insets: Insets;
  /**
   * Room a panel takes over the picture without moving it (the details):
   * what is brought into view is framed in what it leaves.
   */
  panel: Insets;
}

/**
 * Orthographic map camera: drag to pan, right-drag (or two fingers) to turn,
 * wheel or pinch to zoom towards the pointer. Carries out the UI's camera
 * commands: a block is framed whole, a transaction brought close. One not on
 * show yet (its block's city is still loading) is looked for a little while.
 */
export const CameraRig = ({ frame, insets, panel }: CameraRigProps) => {
  const controlsRef = useRef<CameraControlsImpl>(null);
  // Read when going home, which must not happen each time the panels move.
  const insetsRef = useRef(insets);
  const panelRef = useRef(panel);
  const nodRef = useRef<ReturnType<typeof setTimeout>>(null);
  const pendingRef = useRef<Pending | null>(null);
  const getState = useThree((state) => state.get);

  useLayoutEffect(() => {
    insetsRef.current = insets;
    panelRef.current = panel;
  }, [insets, panel]);

  const goHome = useCallback(
    (controls: CameraControlsImpl, animate: boolean) => {
      const { target, zoom } = frameView(
        HOME_POINTS,
        HOME,
        roomOf(getState().size, insetsRef.current)
      );
      controls.setBoundary(CAMERA_BOUNDS);
      controls.minZoom = zoom * MIN_ZOOM_SHARE;
      const there = controls.getTarget(new Vector3());
      const home =
        there.distanceTo(target) < HOME_TOLERANCE.distance &&
        Math.abs(controls.camera.zoom / zoom - 1) < HOME_TOLERANCE.zoom &&
        Math.abs(controls.polarAngle - HOME.polar) < HOME_TOLERANCE.angle &&
        Math.abs(
          controls.azimuthAngle -
            nearestTurn(controls.azimuthAngle, HOME.azimuth)
        ) < HOME_TOLERANCE.angle;
      if (animate && home) {
        // Nothing to move: a nod says it heard.
        void controls.zoomTo(zoom * (1 - NOD), true);
        clearTimeout(nodRef.current ?? undefined);
        nodRef.current = setTimeout(() => {
          void controls.zoomTo(zoom, true);
        }, NOD_MS);
        return;
      }
      void controls.rotateTo(
        nearestTurn(controls.azimuthAngle, HOME.azimuth),
        HOME.polar,
        animate
      );
      void controls.dollyTo(DISTANCE, animate);
      void controls.moveTo(target.x, target.y, target.z, animate);
      void controls.zoomTo(zoom, animate);
    },
    [getState]
  );

  /** Brings something into view, if it is on show; tells whether it is. */
  const focus = useCallback(
    (controls: CameraControlsImpl, key: SceneKey) => {
      if (!locate(key, box)) {
        return false;
      }
      const azimuth = controls.azimuthAngle;
      const insetsNow = insetsRef.current;
      const extra = panelRef.current;
      const framed = frameView(
        cornersOf(box),
        { azimuth, polar: controls.polarAngle },
        roomOf(
          getState().size,
          {
            bottom: insetsNow.bottom + extra.bottom,
            left: insetsNow.left + extra.left,
            right: insetsNow.right + extra.right,
            top: insetsNow.top + extra.top,
          },
          FOCUS_MARGIN
        )
      );
      const zoom = Math.min(
        parseKey(key).kind === "tx"
          ? Math.min(framed.zoom, Math.max(controls.camera.zoom, TX_ZOOM))
          : framed.zoom,
        MAX_ZOOM
      );
      // The picture stays centred where it is: the camera looks aside so the
      // subject lands in the middle of what the panel leaves.
      const aside = (extra.right - extra.left) / 2 / zoom;
      const target = framed.target
        .clone()
        .addScaledVector(
          new Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)),
          aside
        );
      void controls.moveTo(target.x, target.y, target.z, true);
      void controls.zoomTo(zoom, true);
      return true;
    },
    [getState]
  );

  /** Focuses now, or keeps looking for a while. */
  const seek = useCallback(
    (key: SceneKey) => {
      const controls = controlsRef.current;
      if (!controls || focus(controls, key)) {
        pendingRef.current = null;
        return;
      }
      const now = getState().clock.elapsedTime;
      pendingRef.current = {
        key,
        next: now + RETRY_EVERY,
        until: now + RETRY_FOR,
      };
    },
    [focus, getState]
  );

  const run = useCallback(
    (command: CameraCommand) => {
      const controls = controlsRef.current;
      if (!controls) {
        return;
      }
      pendingRef.current = null;
      switch (command.kind) {
        case "focus": {
          seek(command.key);
          break;
        }
        case "home": {
          goHome(controls, true);
          break;
        }
        case "rotate": {
          void controls.rotate(command.degrees * DEG, 0, true);
          break;
        }
        case "zoom": {
          void controls.zoomTo(controls.camera.zoom * command.factor, true);
          break;
        }
        default: {
          break;
        }
      }
    },
    [goHome, seek]
  );

  // The first view shows the whole table, then what a shared link picked.
  useEffect(() => {
    if (!controlsRef.current) {
      return;
    }
    stackZoomSteps(controlsRef.current);
    goHome(controlsRef.current, false);
    const { selected } = useViewStore.getState();
    if (selected) {
      seek(selected);
    }
  }, [goHome, seek]);

  useEffect(
    () =>
      useCameraStore.subscribe((state, previous) => {
        if (state.issued && state.issued !== previous.issued) {
          run(state.issued.command);
        }
      }),
    [run]
  );

  useFrame(({ camera, clock, size }, delta) => {
    centreInRoom(camera, size, insets, delta);
    const pending = pendingRef.current;
    const controls = controlsRef.current;
    const now = clock.elapsedTime;
    if (!pending || !controls || now < pending.next) {
      return;
    }
    if (focus(controls, pending.key) || now > pending.until) {
      pendingRef.current = null;
    } else {
      pending.next = now + RETRY_EVERY;
    }
  });

  // The user took over: whatever was awaited is not wanted any more.
  const handleControlStart = useCallback(() => {
    pendingRef.current = null;
    clearTimeout(nodRef.current ?? undefined);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(nodRef.current ?? undefined);
    },
    []
  );

  const handleRest = useCallback(() => {
    if (controlsRef.current) {
      settleOnGround(controlsRef.current);
    }
  }, []);

  return (
    <CameraControls
      dollyToCursor
      domElement={frame ?? undefined}
      makeDefault
      maxPolarAngle={MAX_POLAR}
      maxZoom={MAX_ZOOM}
      minPolarAngle={MIN_POLAR}
      mouseButtons={MOUSE_BUTTONS}
      onControlStart={handleControlStart}
      onRest={handleRest}
      ref={controlsRef}
      smoothTime={SMOOTH_TIME}
      touches={TOUCHES}
    />
  );
};
