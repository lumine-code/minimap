const path = require("node:path");

describe("minimap with no grammar", () => {
  let editor, main;
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
    jasmine.attachToDOM(lumine.workspace.getElement());
    lumine.config.set("minimap.autoToggle", true);
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.nullGrammar);
    main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    await flushMicrotasks();
  });
  afterEach(async () => {
    editor?.destroy();
    await lumine.packages.deactivatePackage("minimap");
    lumine.config.unset("minimap.autoToggle");
  });

  it("does not create a model, frees an existing model and recreates only on resume", () => {
    expect(main.minimapForEditor(editor)).toBeUndefined();
    expect(main.editorsMinimaps.has(editor)).toBe(false);
    const grammar = lumine.grammars.grammarForScopeName("text.plain");
    editor.setGrammar(grammar);
    const model = main.editorsMinimaps.get(editor);
    expect(model).toBeDefined();
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(model.destroyed).toBe(true);
    expect(main.editorsMinimaps.has(editor)).toBe(false);
    expect(editor.getElement().querySelector("lumine-text-editor-minimap")).toBeNull();
    editor.setGrammar(grammar);
    expect(main.editorsMinimaps.get(editor)).not.toBe(model);
  });
});
