import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

const STRIPE_PX = 16;
const SHADOW_PX = 256;
/** Share of the texture on each side left for the shadow to fade out. */
export const SHADOW_INSET = 0.2;
const SHADOW_BLUR = 0.09;
const ANISOTROPY = 8;

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas is not available");
  }
  return { canvas, context };
};

/** Corrugated metal: stripes across u, one light and one dark per repeat. */
export const createCorrugatedTexture = (light: string, dark: string) => {
  const { canvas, context } = canvasOf(STRIPE_PX * 2, 2);
  context.fillStyle = light;
  context.fillRect(0, 0, STRIPE_PX, 2);
  context.fillStyle = dark;
  context.fillRect(STRIPE_PX, 0, STRIPE_PX, 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = ANISOTROPY;
  return texture;
};

/**
 * Soft drop shadow of a tile: a blurred white square with transparent edges,
 * tinted by the material colour. Its solid core spans the middle 60%.
 */
export const createSoftShadowTexture = () => {
  const { canvas, context } = canvasOf(SHADOW_PX, SHADOW_PX);
  const inset = SHADOW_PX * SHADOW_INSET;
  // Draw the square off the canvas and keep only its blurred shadow.
  context.shadowColor = "#ffffff";
  context.shadowBlur = SHADOW_PX * SHADOW_BLUR;
  context.shadowOffsetX = SHADOW_PX * 2;
  context.fillStyle = "#ffffff";
  context.fillRect(
    inset - SHADOW_PX * 2,
    inset,
    SHADOW_PX - inset * 2,
    SHADOW_PX - inset * 2
  );
  return new CanvasTexture(canvas);
};
