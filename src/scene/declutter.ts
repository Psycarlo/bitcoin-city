/** Room kept between two labels (px). */
const GAP = 3;

/** Every label on screen that may give way to a more important one. */
const labels = new Set<HTMLElement>();

/**
 * Ref for a label (`Html` content) that hides when it would sit on a more
 * important one. Its importance goes in `data-priority` (higher wins); while
 * covered it carries `data-covered="true"`, for its styles to fade it out.
 */
export const declutterRef = (element: HTMLElement | null) => {
  if (!element) {
    return;
  }
  labels.add(element);
  return () => {
    labels.delete(element);
  };
};

/** Classes that hide a covered label and let clicks through it (add a transition to fade). */
export const COVERED_CLASSES =
  "data-[covered=true]:pointer-events-none data-[covered=true]:opacity-0";

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right + GAP &&
  b.left < a.right + GAP &&
  a.top < b.bottom + GAP &&
  b.top < a.bottom + GAP;

/**
 * Keeps the labels from the most important down, covering any that would
 * touch one already kept. Measures the page, so it runs a few times a second
 * rather than every frame.
 */
export const declutterLabels = () => {
  const ranked = [...labels]
    .map((element) => ({
      box: element.getBoundingClientRect(),
      element,
      priority: Number(element.dataset.priority ?? 0),
    }))
    .toSorted((a, b) => b.priority - a.priority);
  const kept: Box[] = [];
  for (const { box, element } of ranked) {
    // Labels that are not laid out take no room.
    const placed = box.width > 0 && box.height > 0;
    const covered = placed && kept.some((other) => overlaps(box, other));
    if (placed && !covered) {
      kept.push(box);
    }
    const value = String(covered);
    if (element.dataset.covered !== value) {
      element.dataset.covered = value;
    }
  }
};
