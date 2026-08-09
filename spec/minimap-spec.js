const { styleReader } = require("../lib/style-reader");

describe("minimap", () => {
  let workspaceElement, editor, editorElement, mainModule, markerMain, minimap, minimapElement;

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  // The runner freezes `setTimeout`, so asynchronous expectations are polled on
  // animation frames instead of wall-clock time.
  async function until(predicate, description) {
    for (let i = 0; i < 600; i++) {
      if (predicate()) {
        return;
      }
      await nextFrame();
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function untilPresent(get, description = "an element") {
    await until(() => get(), description);
    return get();
  }

  function findMinimapElement() {
    return editorElement.querySelector("lumine-text-editor-minimap");
  }

  function clientContainerWidth(component) {
    return component.refs.clientContainer.offsetWidth;
  }

  // An editor re-arms its resize observer a tick after each measurement, and re-observing delivers
  // one callback: specs that check whether a measurement is refreshed at all have to let that
  // settle first, or the pending callback refreshes it for them.
  async function settle() {
    for (let i = 0; i < 3; i++) {
      await nextFrame();
    }
  }

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    workspaceElement.style.width = "800px";
    workspaceElement.style.height = "400px";
    jasmine.attachToDOM(workspaceElement);

    // Redraw immediately on buffer changes instead of debouncing through the
    // frozen `setTimeout`.
    lumine.config.set("minimap.redrawDelay", 0);

    // The map draws layers the marker hub computes, so the specs run against
    // the real hub package -- bundled with the editor, so the name resolves
    // in the workspace and in CI alike.
    const markerPack = await lumine.packages.activatePackage("marker");
    markerMain = markerPack.mainModule;

    // The package defers its activation to the shell-environment hook.
    const activation = lumine.packages.activatePackage("minimap");
    lumine.packages.triggerDeferredActivationHooks();
    lumine.packages.triggerActivationHook("core:loaded-shell-environment");
    mainModule = (await activation).mainModule;

    editor = await lumine.workspace.open();
    editor.setText(
      Array.from({ length: 60 }, (_, i) => `line ${i} with some content`).join("\n") + "\n",
    );
    editorElement = lumine.views.getView(editor);

    await until(() => findMinimapElement(), "the minimap element to attach");
    minimapElement = findMinimapElement();
    minimap = minimapElement.getModel();

    // In spec mode `drawLines` is a plain function only used as a spy target.
    spyOn(minimapElement, "drawLines");
  });

  describe("activation", () => {
    it("attaches a minimap element to the text editor", () => {
      expect(minimapElement).not.toBeNull();
      expect(minimapElement.tagName.toLowerCase()).toBe("lumine-text-editor-minimap");
      expect(editorElement.getAttribute("with-minimap")).toBe("right");
    });

    it("associates the minimap model with the editor", () => {
      expect(minimap.getTextEditor()).toBe(editor);
      expect(mainModule.minimapForEditor(editor)).toBe(minimap);
      expect(lumine.views.getView(minimap)).toBe(minimapElement);
    });

    it("attaches a minimap to editors opened after activation", async () => {
      const otherEditor = await lumine.workspace.open();
      const otherElement = lumine.views.getView(otherEditor);
      await until(
        () => otherElement.querySelector("lumine-text-editor-minimap"),
        "a minimap on the new editor",
      );
      expect(otherElement.querySelector("lumine-text-editor-minimap")).not.toBeNull();
    });

    it("destroys the minimap when the editor is destroyed", async () => {
      editor.destroy();
      await until(() => minimap.isDestroyed(), "the minimap to be destroyed");
      expect(minimap.isDestroyed()).toBe(true);
    });
  });

  describe("minimap:toggle", () => {
    it("removes the minimap element and restores it on the next toggle", async () => {
      lumine.commands.dispatch(workspaceElement, "minimap:toggle");
      await until(() => !findMinimapElement(), "the minimap element to detach");
      expect(findMinimapElement()).toBeNull();
      expect(editorElement.hasAttribute("with-minimap")).toBe(false);

      lumine.commands.dispatch(workspaceElement, "minimap:toggle");
      await until(() => findMinimapElement(), "the minimap element to re-attach");
      expect(findMinimapElement()).not.toBeNull();
      expect(editorElement.getAttribute("with-minimap")).toBe("right");
    });

    it("makes the editors measure around a minimap that comes back", async () => {
      const { component } = editorElement;
      lumine.commands.dispatch(workspaceElement, "minimap:toggle");
      await until(() => !findMinimapElement(), "the minimap element to detach");
      await until(
        () => component.getClientContainerWidth() === clientContainerWidth(component),
        "the editor to settle on its full width",
      );
      const fullWidth = component.getClientContainerWidth();
      await settle();

      lumine.commands.dispatch(workspaceElement, "minimap:toggle");
      await until(() => findMinimapElement(), "the minimap element to re-attach");

      await until(
        () => component.getClientContainerWidth() < fullWidth,
        "the editor to re-measure around the minimap",
      );
      expect(component.getClientContainerWidth()).toBe(clientContainerWidth(component));
    });
  });

  describe("deactivation", () => {
    it("removes all minimap elements", async () => {
      await lumine.packages.deactivatePackage("minimap");
      expect(findMinimapElement()).toBeNull();
    });

    it("makes the editors re-measure the width the minimap gave back", async () => {
      // The minimap only ever resizes the client container the editor measures, never the
      // `lumine-text-editor` element itself, so an editor that does not pick the width back up keeps
      // rendering short of its right edge until the pane is resized.
      const { component } = editorElement;
      await until(() => minimapElement.isVisible(), "the minimap element to become visible");
      await until(
        () => component.getClientContainerWidth() === clientContainerWidth(component),
        "the editor to settle on the width left by the minimap",
      );
      const widthWithMinimap = component.getClientContainerWidth();
      expect(widthWithMinimap).toBeLessThan(editorElement.offsetWidth);
      await settle();

      await lumine.packages.deactivatePackage("minimap");

      await until(
        () => component.getClientContainerWidth() > widthWithMinimap,
        "the editor to re-measure without the minimap",
      );
      expect(component.getClientContainerWidth()).toBe(clientContainerWidth(component));
    });
  });

  describe("rendering", () => {
    it("is visible and sized within the editor", async () => {
      await until(() => minimapElement.isVisible(), "the minimap element to become visible");
      expect(minimapElement.offsetWidth).toBeGreaterThan(0);
      expect(minimapElement.offsetHeight).toBeGreaterThan(0);
    });

    it("redraws the canvas when the buffer changes", async () => {
      await until(() => minimapElement.isVisible(), "the minimap element to become visible");
      await until(() => minimapElement.drawLines.calls.count() > 0, "an initial draw");

      minimapElement.drawLines.calls.reset();
      editor.setTextInBufferRange(
        [
          [0, 0],
          [0, 0],
        ],
        "some new text ",
      );

      await until(() => minimapElement.drawLines.calls.count() > 0, "a redraw after the edit");
      expect(minimapElement.drawLines).toHaveBeenCalled();
    });

    it("scrolls the editor when the canvas is pressed", async () => {
      await until(() => minimapElement.isVisible(), "the minimap element to become visible");
      spyOn(minimap, "setTextEditorScrollTop");

      const canvas = minimapElement.getFrontCanvas();
      const { top, left } = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new MouseEvent("mousedown", {
          button: 0,
          bubbles: true,
          clientX: Math.round(left) + 2,
          clientY: Math.round(top) + 20,
        }),
      );

      expect(minimap.setTextEditorScrollTop).toHaveBeenCalled();
    });
  });

  describe("style changes", () => {
    let styleSheets;

    function addStyleSheet(source) {
      const disposable = lumine.styles.addStyleSheet(source);
      styleSheets.push(disposable);
      return disposable;
    }

    // The colors the minimap paints with are read from the DOM once and cached, by the drawing
    // loop that is spied on here; seed the cache the way a draw does.
    function readEditorColor() {
      return styleReader.retrieveStyleFromDom([".editor"], "color", editorElement);
    }

    function tokensLayerPixels() {
      const { canvas } = minimapElement.tokensLayer;
      return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    }

    function tokensLayerHasInk() {
      const data = tokensLayerPixels();
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          return true;
        }
      }
      return false;
    }

    // Tokens are drawn as filled rectangles, so their color lands on the canvas exactly. Only the
    // edges are blended, and an interior pixel is enough to tell which palette painted them.
    function tokensLayerHasColor(r, g, b) {
      const data = tokensLayerPixels();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === r && data[i + 1] === g && data[i + 2] === b && data[i + 3] > 0) {
          return true;
        }
      }
      return false;
    }

    beforeEach(async () => {
      styleSheets = [];
      await until(() => minimapElement.isVisible(), "the minimap element to become visible");
      readEditorColor();
      spyOn(minimapElement, "forceUpdateNow");
    });

    afterEach(() => {
      for (const disposable of styleSheets) {
        disposable.dispose();
      }
      document.documentElement.removeAttribute("ui-variant");
    });

    it("re-reads the colors in the same task as the style change", async () => {
      // A theme switch attaches its stylesheets inside a View Transition and the window cross-fades
      // from there, so a minimap that waits on a timer only paints its new colors once the fade is
      // over. The update is coalesced on a microtask instead, not debounced.
      addStyleSheet("lumine-text-editor .editor { color: rgb(12, 34, 56); }");

      await null;
      expect(minimapElement.forceUpdateNow).toHaveBeenCalled();
      expect(readEditorColor()).toBe("rgb(12, 34, 56)");
    });

    it("repaints the canvas in the same task, without waiting for a frame", async () => {
      // The other expectations here stop at the call. This one follows it through to the pixels,
      // which is where the frame that `requestAnimationFrame` used to cost would show up: the
      // transition has snapshotted the window by then, and the minimap fades in holding the old
      // palette.
      // With the code highlights off the tokens are drawn in the editor's own color, which is the
      // one this block restyles; with them on they take their color from each token's own scopes.
      // At full opacity that color reaches the canvas unpremultiplied, so it can be matched exactly.
      lumine.config.set("minimap.displayCodeHighlights", false);
      lumine.config.set("minimap.textOpacity", 1);
      minimapElement.forceUpdateNow.and.callThrough();
      await until(() => tokensLayerHasInk(), "the minimap to paint its tokens");
      expect(tokensLayerHasColor(12, 34, 56)).toBe(false);

      addStyleSheet("lumine-text-editor .editor { color: rgb(12, 34, 56); }");
      await null;

      expect(tokensLayerHasColor(12, 34, 56)).toBe(true);
    });

    it("redraws once for a burst of style changes", async () => {
      addStyleSheet("lumine-text-editor .editor { color: rgb(12, 34, 56); }");
      addStyleSheet("lumine-text-editor .editor { color: rgb(65, 43, 21); }");

      await null;
      expect(minimapElement.forceUpdateNow.calls.count()).toBe(1);
      expect(readEditorColor()).toBe("rgb(65, 43, 21)");
    });

    it("leaves the minimaps alone when the new styles move none of its colors", async () => {
      // These subscriptions fire for every stylesheet attached anywhere in the window.
      addStyleSheet("lumine-text-editor .some-other-package { color: rgb(12, 34, 56); }");

      await null;
      expect(minimapElement.forceUpdateNow).not.toHaveBeenCalled();
    });

    it("redraws for a restyle that changes no stylesheet at all", async () => {
      // A theme variant can be nothing more than an attribute on the document root: it is applied
      // through `lumine.themes.updateAppearance`, which adds and removes no style element and only
      // reports itself as a change of the active themes.
      addStyleSheet('[ui-variant="pure"] lumine-text-editor .editor { color: rgb(12, 34, 56); }');
      await null;
      expect(minimapElement.forceUpdateNow).not.toHaveBeenCalled();

      await lumine.themes.updateAppearance(() =>
        document.documentElement.setAttribute("ui-variant", "pure"),
      );

      expect(minimapElement.forceUpdateNow).toHaveBeenCalled();
      expect(readEditorColor()).toBe("rgb(12, 34, 56)");
    });
  });

  describe("configuration", () => {
    it("moves the minimap to the left when displayMinimapOnLeft is enabled", () => {
      lumine.config.set("minimap.displayMinimapOnLeft", true);
      expect(minimapElement.classList.contains("left")).toBe(true);
      expect(editorElement.getAttribute("with-minimap")).toBe("left");

      lumine.config.set("minimap.displayMinimapOnLeft", false);
      expect(minimapElement.classList.contains("left")).toBe(false);
      expect(editorElement.getAttribute("with-minimap")).toBe("right");
    });

    it("applies the character size settings to the minimap metrics", () => {
      lumine.config.set("minimap.charWidth", 2);
      lumine.config.set("minimap.charHeight", 4);
      lumine.config.set("minimap.interline", 2);

      expect(minimap.getCharWidth()).toBe(2);
      expect(minimap.getCharHeight()).toBe(4);
      expect(minimap.getInterline()).toBe(2);
      expect(minimap.getLineHeight()).toBe(6);
    });

    it("applies the devicePixelRatioRounding setting", () => {
      lumine.config.set("minimap.devicePixelRatioRounding", false);
      expect(minimap.getDevicePixelRatio()).toBe(window.devicePixelRatio);

      lumine.config.set("minimap.devicePixelRatioRounding", true);
      expect(minimap.getDevicePixelRatio()).toBe(Math.round(window.devicePixelRatio));
    });

    it("emits did-change-config when the character size changes", () => {
      const changeSpy = jasmine.createSpy("did-change-config");
      minimap.onDidChangeConfig(changeSpy);

      lumine.config.set("minimap.charHeight", 5);
      expect(changeSpy).toHaveBeenCalled();
    });
  });

  describe("marker layers", () => {
    let specStyle, layerDisposable;

    function markerCanvasRows() {
      const { canvas } = minimapElement.markers;
      const context = canvas.getContext("2d");
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const lineHeight = minimap.getLineHeight() * minimap.getDevicePixelRatio();
      const rows = new Set();
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) {
          continue;
        }
        const pixel = (i - 3) / 4;
        rows.add(Math.floor(Math.floor(pixel / canvas.width) / lineHeight));
      }
      return [...rows].sort((a, b) => a - b);
    }

    async function registerLayer(props) {
      layerDisposable = markerMain.consumeMarkerLayer(props);
      // The layer's own throttle, then the frame the element redraws on.
      advanceClock(30);
      await until(
        () => markerCanvasRows().length > 0 || props.expectNothing,
        "a marker to be drawn",
      );
    }

    beforeEach(() => {
      specStyle = document.createElement("style");
      specStyle.textContent = ".marker.marker-speclayer { background-color: rgb(255, 0, 0); }";
      document.head.appendChild(specStyle);
    });

    afterEach(() => {
      layerDisposable?.dispose();
      specStyle.remove();
    });

    it("draws a layer's rows, and a range as one band", async () => {
      await registerLayer({
        name: "speclayer",
        getItems: () => [{ row: 2 }, { row: 5, end: 7 }],
      });

      expect(markerCanvasRows()).toEqual([2, 5, 6, 7]);
    });

    // The whole point of the contract: rows, not text-buffer markers.
    it("creates no markers on the buffer", async () => {
      const before = editor.getMarkerCount();

      await registerLayer({ name: "speclayer", getItems: () => [{ row: 2 }] });

      expect(editor.getMarkerCount()).toBe(before);
    });

    it("moves a marker when a fold moves its screen row", async () => {
      await registerLayer({
        name: "speclayer",
        getItems: ({ editor: e }) => [{ row: e.screenRowForBufferRow(20) }],
      });
      expect(markerCanvasRows()).toEqual([20]);

      editor.foldBufferRange([
        [1, 0],
        [10, 0],
      ]);
      advanceClock(30);
      await until(() => markerCanvasRows()[0] !== 20, "the marker to follow the fold");

      expect(markerCanvasRows()).toEqual([editor.screenRowForBufferRow(20)]);
    });

    it("draws nothing for a layer the user disabled on this map", async () => {
      lumine.config.set("minimap.disabledLayers", ["speclayer"]);

      await registerLayer({
        name: "speclayer",
        expectNothing: true,
        getItems: () => [{ row: 2 }],
      });

      expect(markerCanvasRows()).toEqual([]);
      // Hidden, not unregistered: the items are still there to come back to.
      expect(minimapElement.markers).toBeDefined();
      lumine.config.set("minimap.disabledLayers", []);
      advanceClock(30);
      await until(() => markerCanvasRows().length > 0, "the marker to come back");
    });

    it("stops drawing when the layer is unregistered", async () => {
      await registerLayer({ name: "speclayer", getItems: () => [{ row: 2 }] });

      layerDisposable.dispose();
      layerDisposable = null;
      await until(() => markerCanvasRows().length === 0, "the markers to be cleared");
    });
  });

  describe("minimap:toggle-layers", () => {
    it("lists the registered layers and code highlights, and toggles them", async () => {
      const disposable = markerMain.consumeMarkerLayer({
        name: "speclayer",
        description: "Spec layer",
        getItems: () => [],
      });

      lumine.commands.dispatch(workspaceElement, "minimap:toggle-layers");
      const view = await untilPresent(() => document.querySelector(".minimap-view"));
      await until(() => view.textContent.includes("speclayer"), "the layer to be listed");
      // Not a provided layer, but the same question, so the same list.
      expect(view.textContent).toContain("code-highlights");

      lumine.commands.dispatch(workspaceElement, "minimap:toggle-layers");
      disposable.dispose();
    });

    // Each map keeps its own list: switching a layer off here leaves the
    // scrollbar strip alone.
    it("writes only the minimap's own disabled list", () => {
      lumine.config.set("minimap.disabledLayers", []);
      lumine.config.set("scrollmap.disabledLayers", []);

      mainModule.markerLayers.picker().toggle({ name: "speclayer" });

      expect(lumine.config.get("minimap.disabledLayers")).toContain("speclayer");
      expect(lumine.config.get("scrollmap.disabledLayers")).not.toContain("speclayer");
    });
  });
});
