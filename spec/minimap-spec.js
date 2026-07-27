describe("minimap", () => {
  let workspaceElement, editor, editorElement, mainModule, minimap, minimapElement;

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

  function findMinimapElement() {
    return editorElement.querySelector("atom-text-editor-minimap");
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
    workspaceElement = atom.views.getView(atom.workspace);
    workspaceElement.style.width = "800px";
    workspaceElement.style.height = "400px";
    jasmine.attachToDOM(workspaceElement);

    // Redraw immediately on buffer changes instead of debouncing through the
    // frozen `setTimeout`.
    atom.config.set("minimap.redrawDelay", 0);

    // The package defers its activation to the shell-environment hook.
    const activation = atom.packages.activatePackage("minimap");
    atom.packages.triggerDeferredActivationHooks();
    atom.packages.triggerActivationHook("core:loaded-shell-environment");
    mainModule = (await activation).mainModule;

    editor = await atom.workspace.open();
    editor.setText(
      Array.from({ length: 60 }, (_, i) => `line ${i} with some content`).join("\n") + "\n",
    );
    editorElement = atom.views.getView(editor);

    await until(() => findMinimapElement(), "the minimap element to attach");
    minimapElement = findMinimapElement();
    minimap = minimapElement.getModel();

    // In spec mode `drawLines` is a plain function only used as a spy target.
    spyOn(minimapElement, "drawLines");
  });

  describe("activation", () => {
    it("attaches a minimap element to the text editor", () => {
      expect(minimapElement).not.toBeNull();
      expect(minimapElement.tagName.toLowerCase()).toBe("atom-text-editor-minimap");
      expect(editorElement.getAttribute("with-minimap")).toBe("right");
    });

    it("associates the minimap model with the editor", () => {
      expect(minimap.getTextEditor()).toBe(editor);
      expect(mainModule.minimapForEditor(editor)).toBe(minimap);
      expect(atom.views.getView(minimap)).toBe(minimapElement);
    });

    it("attaches a minimap to editors opened after activation", async () => {
      const otherEditor = await atom.workspace.open();
      const otherElement = atom.views.getView(otherEditor);
      await until(
        () => otherElement.querySelector("atom-text-editor-minimap"),
        "a minimap on the new editor",
      );
      expect(otherElement.querySelector("atom-text-editor-minimap")).not.toBeNull();
    });

    it("destroys the minimap when the editor is destroyed", async () => {
      editor.destroy();
      await until(() => minimap.isDestroyed(), "the minimap to be destroyed");
      expect(minimap.isDestroyed()).toBe(true);
    });
  });

  describe("minimap:toggle", () => {
    it("removes the minimap element and restores it on the next toggle", async () => {
      atom.commands.dispatch(workspaceElement, "minimap:toggle");
      await until(() => !findMinimapElement(), "the minimap element to detach");
      expect(findMinimapElement()).toBeNull();
      expect(editorElement.hasAttribute("with-minimap")).toBe(false);

      atom.commands.dispatch(workspaceElement, "minimap:toggle");
      await until(() => findMinimapElement(), "the minimap element to re-attach");
      expect(findMinimapElement()).not.toBeNull();
      expect(editorElement.getAttribute("with-minimap")).toBe("right");
    });

    it("makes the editors measure around a minimap that comes back", async () => {
      const { component } = editorElement;
      atom.commands.dispatch(workspaceElement, "minimap:toggle");
      await until(() => !findMinimapElement(), "the minimap element to detach");
      await until(
        () => component.getClientContainerWidth() === clientContainerWidth(component),
        "the editor to settle on its full width",
      );
      const fullWidth = component.getClientContainerWidth();
      await settle();

      atom.commands.dispatch(workspaceElement, "minimap:toggle");
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
      await atom.packages.deactivatePackage("minimap");
      expect(findMinimapElement()).toBeNull();
    });

    it("makes the editors re-measure the width the minimap gave back", async () => {
      // The minimap only ever resizes the client container the editor measures, never the
      // `atom-text-editor` element itself, so an editor that does not pick the width back up keeps
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

      await atom.packages.deactivatePackage("minimap");

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
      const disposable = atom.styles.addStyleSheet(source);
      styleSheets.push(disposable);
      return disposable;
    }

    // The colors the minimap paints with are read from the DOM once and cached, by the drawing
    // loop that is spied on here; seed the cache the way a draw does.
    function readEditorColor() {
      return mainModule.styleReader.retrieveStyleFromDom([".editor"], "color", editorElement);
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
      addStyleSheet("atom-text-editor .editor { color: rgb(12, 34, 56); }");

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
      atom.config.set("minimap.displayCodeHighlights", false);
      atom.config.set("minimap.textOpacity", 1);
      minimapElement.forceUpdateNow.and.callThrough();
      await until(() => tokensLayerHasInk(), "the minimap to paint its tokens");
      expect(tokensLayerHasColor(12, 34, 56)).toBe(false);

      addStyleSheet("atom-text-editor .editor { color: rgb(12, 34, 56); }");
      await null;

      expect(tokensLayerHasColor(12, 34, 56)).toBe(true);
    });

    it("redraws once for a burst of style changes", async () => {
      addStyleSheet("atom-text-editor .editor { color: rgb(12, 34, 56); }");
      addStyleSheet("atom-text-editor .editor { color: rgb(65, 43, 21); }");

      await null;
      expect(minimapElement.forceUpdateNow.calls.count()).toBe(1);
      expect(readEditorColor()).toBe("rgb(65, 43, 21)");
    });

    it("leaves the minimaps alone when the new styles move none of its colors", async () => {
      // These subscriptions fire for every stylesheet attached anywhere in the window.
      addStyleSheet("atom-text-editor .some-other-package { color: rgb(12, 34, 56); }");

      await null;
      expect(minimapElement.forceUpdateNow).not.toHaveBeenCalled();
    });

    it("redraws for a restyle that changes no stylesheet at all", async () => {
      // A theme variant can be nothing more than an attribute on the document root: it is applied
      // through `atom.themes.updateAppearance`, which adds and removes no style element and only
      // reports itself as a change of the active themes.
      addStyleSheet('[ui-variant="pure"] atom-text-editor .editor { color: rgb(12, 34, 56); }');
      await null;
      expect(minimapElement.forceUpdateNow).not.toHaveBeenCalled();

      await atom.themes.updateAppearance(() =>
        document.documentElement.setAttribute("ui-variant", "pure"),
      );

      expect(minimapElement.forceUpdateNow).toHaveBeenCalled();
      expect(readEditorColor()).toBe("rgb(12, 34, 56)");
    });
  });

  describe("configuration", () => {
    it("moves the minimap to the left when displayMinimapOnLeft is enabled", () => {
      atom.config.set("minimap.displayMinimapOnLeft", true);
      expect(minimapElement.classList.contains("left")).toBe(true);
      expect(editorElement.getAttribute("with-minimap")).toBe("left");

      atom.config.set("minimap.displayMinimapOnLeft", false);
      expect(minimapElement.classList.contains("left")).toBe(false);
      expect(editorElement.getAttribute("with-minimap")).toBe("right");
    });

    it("applies the character size settings to the minimap metrics", () => {
      atom.config.set("minimap.charWidth", 2);
      atom.config.set("minimap.charHeight", 4);
      atom.config.set("minimap.interline", 2);

      expect(minimap.getCharWidth()).toBe(2);
      expect(minimap.getCharHeight()).toBe(4);
      expect(minimap.getInterline()).toBe(2);
      expect(minimap.getLineHeight()).toBe(6);
    });

    it("applies the devicePixelRatioRounding setting", () => {
      atom.config.set("minimap.devicePixelRatioRounding", false);
      expect(minimap.getDevicePixelRatio()).toBe(window.devicePixelRatio);

      atom.config.set("minimap.devicePixelRatioRounding", true);
      expect(minimap.getDevicePixelRatio()).toBe(Math.round(window.devicePixelRatio));
    });

    it("emits did-change-config when the character size changes", () => {
      const changeSpy = jasmine.createSpy("did-change-config");
      minimap.onDidChangeConfig(changeSpy);

      atom.config.set("minimap.charHeight", 5);
      expect(changeSpy).toHaveBeenCalled();
    });
  });

  describe("decorations", () => {
    it("decorates a marker and reports it in the decorations API", () => {
      const marker = editor.markBufferRange([
        [2, 0],
        [4, 6],
      ]);
      const decoration = minimap.decorateMarker(marker, { type: "line", color: "#ff0000" });

      expect(decoration).toBeDefined();
      expect(minimap.getDecorations()).toContain(decoration);
      expect(minimap.decorationForId(decoration.getId())).toBe(decoration);

      const byTypeThenRows = minimapElement.getDecorationManagement().decorationsByTypeThenRows();
      expect(byTypeThenRows.line[2]).toContain(decoration);
      expect(byTypeThenRows.line[3]).toContain(decoration);
      expect(byTypeThenRows.line[4]).toContain(decoration);
    });

    it("emits added and removed events", () => {
      const added = jasmine.createSpy("did-add-decoration");
      const removed = jasmine.createSpy("did-remove-decoration");
      minimap.onDidAddDecoration(added);
      minimap.onDidRemoveDecoration(removed);

      const marker = editor.markBufferRange([
        [0, 0],
        [0, 5],
      ]);
      const decoration = minimap.decorateMarker(marker, { type: "line", color: "#00ff00" });
      expect(added).toHaveBeenCalled();

      minimap.removeDecoration(decoration);
      expect(removed).toHaveBeenCalled();
      expect(minimap.getDecorations()).not.toContain(decoration);
    });

    it("removes decorations when their marker is destroyed", () => {
      const marker = editor.markBufferRange([
        [1, 0],
        [1, 5],
      ]);
      const decoration = minimap.decorateMarker(marker, { type: "highlight", color: "#0000ff" });
      expect(minimap.getDecorations()).toContain(decoration);

      marker.destroy();
      expect(minimap.getDecorations()).not.toContain(decoration);
    });

    it("renders line decorations on the canvas", async () => {
      await until(() => minimapElement.isVisible(), "the minimap element to become visible");
      spyOn(minimapElement, "drawLineDecoration");

      const marker = editor.markBufferRange([
        [0, 0],
        [0, 10],
      ]);
      minimap.decorateMarker(marker, { type: "line", color: "#ff0000" });

      await until(
        () => minimapElement.drawLineDecoration.calls.count() > 0,
        "the line decoration to be drawn",
      );
      expect(minimapElement.drawLineDecoration).toHaveBeenCalled();
    });
  });

  describe("quick settings", () => {
    it("opens and closes the quick settings dropdown", async () => {
      await until(() => minimapElement.isVisible(), "the minimap element to become visible");
      expect(minimapElement.openQuickSettings).toBeDefined();

      minimapElement.openQuickSettings.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );

      const quickSettings = workspaceElement.querySelector("minimap-quick-settings");
      expect(quickSettings).not.toBeNull();

      atom.commands.dispatch(quickSettings, "core:cancel");
      expect(workspaceElement.querySelector("minimap-quick-settings")).toBeNull();
    });
  });
});
