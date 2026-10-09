const path = require("node:path");

describe("Minimap computed CSS colors", () => {
  let main, editor, minimap, view, styles, styleReader, workspace, previousWidth, previousHeight;

  beforeEach(async () => {
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    lumine.config.set("minimap.autoToggle", false);
    lumine.config.set("minimap.textOpacity", 0.5);
    const pack = await lumine.packages.activatePackage("minimap");
    main = pack.mainModule;
    ({ styleReader } = require(path.join(pack.path, "lib/style-reader")));
    editor = await lumine.workspace.open();
    editor.setText("xx\n");
    editor.element.classList.add("owned-minimap-color");
    workspace = lumine.workspace.getElement();
    previousWidth = workspace.style.width;
    previousHeight = workspace.style.height;
    workspace.style.width = "800px";
    workspace.style.height = "400px";
    jasmine.attachToDOM(workspace);
    for (let frame = 0; frame < 3; frame++)
      await new Promise((resolve) => requestAnimationFrame(resolve));
    minimap = main.minimapForEditor(editor);
    view = main.createMinimapElement();
    view.setModel(minimap);
    view.setDisplayCodeHighlights(false);
    view.setCanvasesSize(32, 12);
  });

  afterEach(async () => {
    view?.destroy();
    await lumine.packages.deactivatePackage("minimap");
    // This package registers a custom element that requires restart on update;
    // retain its module identities and acquire the current package on activation.
    styles?.dispose();
    editor?.destroy();
    lumine.config.unset("minimap.autoToggle");
    lumine.config.unset("minimap.textOpacity");
    workspace.style.width = previousWidth;
    workspace.style.height = previousHeight;
    main = editor = minimap = view = styles = styleReader = null;
    workspace = previousWidth = previousHeight = null;
  });

  function draw(color, expected) {
    styles = lumine.styles.addStyleSheet(
      `lumine-text-editor.owned-minimap-color .editor { color: ${color}; }`,
      { sourcePath: "owned-minimap-color-fixture" },
    );
    styleReader.invalidateDOMStylesCache();
    const computed = styleReader.retrieveStyleFromDom([".editor"], "color", editor.element);
    expect(computed).not.toBe("");
    expect(minimap.getScreenHeight()).toBeGreaterThan(0);
    expect(editor.tokensForScreenRow(0).length).toBeGreaterThan(0);
    view.updateCanvas();
    expect(Array.from(view.tokensLayer.context.getImageData(0, 0, 1, 1).data)).toEqual(expected);
    return computed;
  }

  it("keeps ordinary RGB colors and the configured text opacity", () => {
    expect(draw("rgb(255, 0, 0)", [255, 0, 0, 128])).toMatch(/^rgb\(/);
  });

  it("draws a native color(srgb) computed color with the configured opacity", () => {
    expect(draw("color(srgb 0 1 0)", [0, 255, 0, 128])).toMatch(/^color\(srgb/);
  });

  it("draws the native computed value of a relative HSL color", () => {
    expect(draw("hsl(from rgb(0, 0, 255) h s l)", [0, 0, 255, 128])).toMatch(/^color\(srgb/);
  });
});
