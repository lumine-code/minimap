const { StyleReader } = require("../lib/style-reader");

describe("StyleReader", () => {
  let styleReader, target, styleSheets;

  function addStyleSheet(source) {
    const disposable = lumine.styles.addStyleSheet(source);
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
    it("keeps editor-specific CSS independent while reusing each target's cached colors", () => {
      const second = document.createElement("div");
      target.className = "first-editor";
      second.className = "second-editor";
      jasmine.attachToDOM(second);
      addStyleSheet(
        ".first-editor .token { color: rgb(1, 2, 3); } .second-editor .token { color: rgb(4, 5, 6); }",
      );
      expect(styleReader.retrieveStyleFromDom(["token"], "color", target)).toBe("rgb(1, 2, 3)");
      expect(styleReader.retrieveStyleFromDom(["token"], "color", second)).toBe("rgb(4, 5, 6)");
      const compute = spyOn(styleReader, "computeStyleFromDom").and.callThrough();
      for (let i = 0; i < 3; i++) {
        expect(styleReader.retrieveStyleFromDom(["token"], "color", target)).toBe("rgb(1, 2, 3)");
        expect(styleReader.retrieveStyleFromDom(["token"], "color", second)).toBe("rgb(4, 5, 6)");
      }
      expect(compute).not.toHaveBeenCalled();
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(false);
    });

    it("detects a restyle of another cached editor and restores the probe's current owner", () => {
      const second = document.createElement("div");
      second.className = "second-editor";
      jasmine.attachToDOM(second);
      addStyleSheet(
        ".token { color: rgb(1, 2, 3); } .second-editor .token { color: rgb(4, 5, 6); }",
      );
      styleReader.retrieveStyleFromDom(["token"], "color", second);
      styleReader.retrieveStyleFromDom(["token"], "color", target);
      addStyleSheet(".second-editor .token { color: rgb(7, 8, 9); }");
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(true);
      expect(styleReader.dummyNode.parentNode).toBe(target);
      expect(styleReader.retrieveStyleFromDom(["token"], "color", second)).toBe("rgb(4, 5, 6)");
      styleReader.invalidateDOMStylesCache();
      expect(styleReader.retrieveStyleFromDom(["token"], "color", second)).toBe("rgb(7, 8, 9)");
      expect(styleReader.retrieveStyleFromDom(["token"], "color", target)).toBe("rgb(1, 2, 3)");
    });

    it("preserves compound classes and nested scope boundaries in lookups and restyle probes", () => {
      addStyleSheet(
        ".foo.bar > .baz { color: rgb(1, 2, 3); } .foo > .bar.baz { color: rgb(4, 5, 6); }",
      );
      expect(styleReader.retrieveStyleFromDom(["foo bar", "baz"], "color", target)).toBe(
        "rgb(1, 2, 3)",
      );
      expect(styleReader.retrieveStyleFromDom(["foo", "bar baz"], "color", target)).toBe(
        "rgb(4, 5, 6)",
      );
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(false);
      addStyleSheet(".foo.bar > .baz { color: rgb(7, 8, 9); }");
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(true);
      expect(styleReader.retrieveStyleFromDom(["foo bar", "baz"], "color", target, false)).toBe(
        "rgb(7, 8, 9)",
      );
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(false);
    });

    it("keeps cached scope paths independent of a caller's array and clears every lookup on invalidation", () => {
      addStyleSheet(".foo { color: rgb(1, 2, 3); } .bar { color: rgb(4, 5, 6); }");
      const scopes = [".foo"];
      styleReader.retrieveStyleFromDom(scopes, "color", target);
      scopes[0] = ".bar";
      expect(styleReader.retrieveStyleFromDom(scopes, "color", target)).toBe("rgb(4, 5, 6)");
      expect(styleReader.hasDOMStylesCacheChanged()).toBe(false);
      addStyleSheet(".foo { color: rgb(7, 8, 9); }");
      styleReader.invalidateDOMStylesCache();
      expect(styleReader.retrieveStyleFromDom([".foo"], "color", target)).toBe("rgb(7, 8, 9)");
    });

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
