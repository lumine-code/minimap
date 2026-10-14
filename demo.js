// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
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
        return Boolean(
          state.editor.getLineCount() > 120 &&
          document.querySelector("lumine-text-editor-minimap, minimap-element, .minimap"),
        );
      },
    },
  ],
  async cleanup() {},
};
