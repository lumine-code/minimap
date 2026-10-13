describe("minimap in editor windows", () => {
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
