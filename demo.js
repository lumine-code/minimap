// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
const readbacks = new WeakMap();

function hasVisibleCanvasPixels(canvas) {
  if (!canvas?.isConnected || !canvas.width || !canvas.height) return false;
  const window = canvas.ownerDocument.defaultView;
  const bounds = canvas.getBoundingClientRect();
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.right <= 0 ||
    bounds.bottom <= 0 ||
    bounds.left >= window.innerWidth ||
    bounds.top >= window.innerHeight
  )
    return false;
  for (let element = canvas; element; element = element.parentElement) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0)
      return false;
  }
  let readback = readbacks.get(canvas);
  if (!readback) {
    const element = canvas.ownerDocument.createElement("canvas");
    readback = { element, context: element.getContext("2d", { willReadFrequently: true }) };
    readbacks.set(canvas, readback);
  }
  if (readback.element.width !== canvas.width) readback.element.width = canvas.width;
  if (readback.element.height !== canvas.height) readback.element.height = canvas.height;
  readback.context.clearRect(0, 0, canvas.width, canvas.height);
  readback.context.drawImage(canvas, 0, 0);
  const { data } = readback.context.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] > 0) return true;
  return false;
}

module.exports = {
  version: 1,
  dependencies: ["language-javascript", "tree-view", "marker"],
  viewport: { width: 1200, height: 760 },
  async before() {},
  async prepare(context) {
    const { lumine, state, fixture, open } = context;
    state.editor = await open("Signal Lab/src/signal.js");
    await lumine.project.setPaths([fixture("Signal Lab")]);
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Navigate a long source file using the minimap.",
      timeout: 60000,
      async run(context) {
        const { lumine } = context;
        {
          if (!document.querySelector("lumine-text-editor-minimap"))
            lumine.commands.dispatch(lumine.workspace.getElement(), "minimap:toggle");
        }
      },
      ready({ state }) {
        const minimap = state.editor.getElement().querySelector("lumine-text-editor-minimap");
        return Boolean(
          state.editor.getLineCount() > 120 && hasVisibleCanvasPixels(minimap?.getFrontCanvas?.()),
        );
      },
    },
  ],
  async cleanup() {},
};
