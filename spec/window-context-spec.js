describe("minimap in editor windows", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    lumine.config.set("minimap.redrawDelay", 0);
    await lumine.packages.activatePackage("minimap");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("minimap");
    await lumine.workspace.discardEditorWindows();
  });
  it("keeps its model and binds frames, pixels and drag events to the new document", async () => {
    const editor = await lumine.workspace.open();
    editor.setText("alpha\n".repeat(100));
    await conditionPromise(() => !!editor.getElement().querySelector("lumine-text-editor-minimap"));
    const view = editor.getElement().querySelector("lumine-text-editor-minimap");
    const model = view.getModel();
    const extra = await lumine.workspace.detachItem(editor, { show: true });
    const nativeWindow = extra.getDocument().defaultView;
    expect(editor.getElement().querySelector("lumine-text-editor-minimap")).toBe(view);
    expect(view.getModel()).toBe(model);
    expect(view.ownerDocument).toBe(extra.getDocument());
    spyOnProperty(nativeWindow, "devicePixelRatio", "get").and.returnValue(1.25);
    model.setDevicePixelRatioRounding(false);
    expect(model.getDevicePixelRatio()).toBe(1.25);
    await conditionPromise(() => !view.frameRequested);
    const frame = spyOn(nativeWindow, "requestAnimationFrame").and.callThrough();
    view.requestForcedUpdate();
    expect(frame).toHaveBeenCalled();
    const resizeEdge = view.getBoundingClientRect().left;
    const initialWidth = lumine.config.get("minimap.width");
    const resizePointer = (target, type, x, buttons = 1) =>
      target.dispatchEvent(
        new nativeWindow.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          buttons,
          clientX: x,
        }),
      );
    resizePointer(view.resizeHandle, "pointerdown", resizeEdge);
    expect(view.widthResize.window).toBe(nativeWindow);
    resizePointer(extra.getDocument(), "pointermove", resizeEdge - 20);
    await conditionPromise(() => view.offsetWidth === initialWidth + 20);
    expect(lumine.config.get("minimap.width")).toBe(initialWidth);
    resizePointer(extra.getDocument(), "pointerup", resizeEdge - 20, 0);
    expect(lumine.config.get("minimap.width")).toBe(initialWidth + 20);
    expect(view.widthResize).toBeNull();
    const drag = spyOn(view, "drag");
    view.startDrag({ y: 10, isLeftMouse: true });
    extra
      .getDocument()
      .body.dispatchEvent(new nativeWindow.MouseEvent("mousemove", { clientY: 20, buttons: 1 }));
    expect(drag).toHaveBeenCalled();
    extra.getDocument().body.dispatchEvent(new nativeWindow.MouseEvent("mouseup"));
    expect(view.dragSubscription).toBeNull();
    await lumine.workspace.attachWindow(extra);
    expect(view.ownerDocument).toBe(document);
    expect(view.attached).toBe(true);
  });
});
