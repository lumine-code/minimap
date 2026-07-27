const { StyleReader } = require("../lib/style-reader");

describe("StyleReader", () => {
  let styleReader, target, styleSheets;

  function addStyleSheet(source) {
    const disposable = atom.styles.addStyleSheet(source);
    styleSheets.push(disposable);
    return disposable;
  }

  beforeEach(() => {
    styleReader = new StyleReader();
    styleSheets = [];
    target = document.createElement("div");
    jasmine.attachToDOM(target);
  });

  afterEach(() => {
    for (const disposable of styleSheets) {
      disposable.dispose();
    }
  });

  it("reads a style from the DOM and caches it", () => {
    addStyleSheet(".foo { color: rgb(1, 2, 3); }");
    expect(styleReader.retrieveStyleFromDom([".foo"], "color", target)).toBe("rgb(1, 2, 3)");

    // The cache is what keeps the drawing loop from hitting the DOM once per token.
    addStyleSheet(".foo { color: rgb(4, 5, 6); }");
    expect(styleReader.retrieveStyleFromDom([".foo"], "color", target)).toBe("rgb(1, 2, 3)");

    styleReader.invalidateDOMStylesCache();
    expect(styleReader.retrieveStyleFromDom([".foo"], "color", target)).toBe("rgb(4, 5, 6)");
  });

  describe("hasDOMStylesCacheChanged()", () => {
    it("is false when nothing has been read yet", () => {
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(false);
    });

    it("is false while the cached styles resolve to the same values", () => {
      addStyleSheet(".foo { color: rgb(1, 2, 3); } .bar { background-color: rgb(4, 5, 6); }");
      styleReader.retrieveStyleFromDom([".foo"], "color", target);
      styleReader.retrieveStyleFromDom([".bar"], "background-color", target);

      // Any package can attach a stylesheet to the window at any time; only the styles that were
      // actually read count as a change.
      addStyleSheet(".baz { color: rgb(7, 8, 9); }");
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(false);
    });

    it("is true once a cached style resolves differently", () => {
      addStyleSheet(".foo { color: rgb(1, 2, 3); } .bar { background-color: rgb(4, 5, 6); }");
      styleReader.retrieveStyleFromDom([".foo"], "color", target);
      styleReader.retrieveStyleFromDom([".bar"], "background-color", target);

      addStyleSheet(".bar { background-color: rgb(7, 8, 9); }");
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(true);
    });

    it("is true for a restyle that changes no stylesheet at all", () => {
      // A theme variant can be nothing more than an attribute on the document root.
      addStyleSheet(".foo { color: rgb(1, 2, 3); } [spec-variant] .foo { color: rgb(4, 5, 6); }");
      styleReader.retrieveStyleFromDom([".foo"], "color", target);

      target.setAttribute("spec-variant", "");
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(true);
    });

    it("leaves the cache as it is", () => {
      addStyleSheet(".foo { color: rgb(1, 2, 3); }");
      styleReader.retrieveStyleFromDom([".foo"], "color", target);

      addStyleSheet(".foo { color: rgb(4, 5, 6); }");
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(true);
      // The caller decides what to do about it: until the cache is invalidated, the minimap keeps
      // painting with the colors it last drew with.
      expect(styleReader.retrieveStyleFromDom([".foo"], "color", target)).toBe("rgb(1, 2, 3)");
    });
  });
});
