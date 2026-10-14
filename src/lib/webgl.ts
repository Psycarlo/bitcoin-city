/** Whether the browser can draw the 3D scene (WebGL 2). */
export const supportsWebGL = () => {
  try {
    const context = document.createElement("canvas").getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
};
