const path = require("node:path");

describe("Minimap runtime lifetime audit", () => {
  let main, editor, view, model, registries, leases, observed, toolkit, Registry, LayerPicker;
  beforeEach(async () => {
    const workspace = lumine.views.getView(lumine.workspace);
    workspace.style.width = "800px";
    workspace.style.height = "400px";
    jasmine.attachToDOM(workspace);
    const marker = await lumine.packages.activatePackage("marker");
    toolkit = marker.mainModule.provideMarkerRegistry();
    Registry = marker.mainModule.registry.constructor;
    ({ LayerPicker } = require(path.join(marker.path, "lib/picker")));
    await lumine.packages.deactivatePackage("marker");
    lumine.config.set("minimap.autoToggle", true);
    main = (await lumine.packages.activatePackage("minimap")).mainModule;
    editor = await lumine.workspace.open();
    editor.setText(Array(50).fill("controlled minimap").join("\n"));
    await conditionPromise(() =>
      lumine.views.getView(editor).querySelector("lumine-text-editor-minimap"),
    );
    view = lumine.views.getView(editor).querySelector("lumine-text-editor-minimap");
    model = view.getModel();
    registries = [];
    leases = [];
    observed = [];
  });
  afterEach(async () => {
    view.dragSubscription?.dispose();
    for (const lease of leases) lease.dispose();
    await lumine.packages.deactivatePackage("minimap");
    for (const entry of observed) entry.disconnect();
    for (const registry of registries) registry.destroy();
    editor.destroy();
    lumine.config.unset("minimap.autoToggle");
  });
  function service() {
    const registry = new Registry();
    registries.push(registry);
    const payload = {
      ...toolkit,
      attach: (target) => registry.attach(target),
      providers: () => [...registry.providers.values()],
      onDidChangeItems: (cb) => registry.onDidChangeItems(cb),
      onDidChangeLayers: (cb) => registry.onDidChangeLayers(cb),
      createPicker: (options) => new LayerPicker({ registry, ...options }),
    };
    return { registry, payload };
  }
  function provide(payload) {
    const lease = lumine.packages.serviceHub.provide("marker.registry", "1.0.0", payload);
    leases.push(lease);
    return lease;
  }
  it("keeps the newest real picker and marker hold when an older provider disappears", () => {
    const older = service(),
      newer = service();
    const first = provide(older.payload);
    main.markerLayers.attach(editor);
    const oldPicker = main.markerLayers.picker();
    provide(newer.payload);
    main.markerLayers.attach(editor);
    const picker = main.markerLayers.picker();
    spyOn(picker, "destroy").and.callThrough();
    first.dispose();
    expect(main.markerLayers.picker()).toBe(picker);
    expect(picker.destroy).not.toHaveBeenCalled();
    expect(newer.registry.sets.get(editor)?.refs).toBe(1);
    expect(older.registry.sets.has(editor)).toBe(false);
    expect(oldPicker).not.toBe(picker);
  });
  it("shares a payload hold until its final real service edge disappears", () => {
    const { registry, payload } = service();
    const first = provide(payload);
    main.markerLayers.attach(editor);
    const picker = main.markerLayers.picker();
    const second = provide(payload);
    main.markerLayers.attach(editor);
    expect(main.markerLayers.picker()).toBe(picker);
    expect(registry.sets.get(editor)?.refs).toBe(1);
    first.dispose();
    expect(main.markerLayers.picker()).toBe(picker);
    expect(registry.sets.get(editor)?.refs).toBe(1);
    second.dispose();
    expect(registry.sets.has(editor)).toBe(false);
    expect(registry.destroyed).toBe(false);
  });
  it("retires the native intersection observer on every actual DOM detach", () => {
    view.detach();
    const Original = window.IntersectionObserver;
    spyOn(window, "IntersectionObserver").and.callFake(function (callback) {
      const observer = new Original(callback);
      spyOn(observer, "disconnect").and.callThrough();
      observed.push(observer);
      return observer;
    });
    view.attach();
    const first = observed[0];
    view.detach();
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    view.attach();
    const second = observed[1];
    view.destroy();
    expect(second.disconnect).toHaveBeenCalledTimes(1);
    expect(first.disconnect).toHaveBeenCalledTimes(1);
  });
  it("ends native body drag listeners when the view is destroyed mid gesture", () => {
    view.visibleArea.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientY: 10 }),
    );
    view.destroy();
    const scroll = spyOn(model, "setTextEditorScrollTop");
    document.body.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, button: 0, clientY: 20 }),
    );
    expect(scroll).not.toHaveBeenCalled();
  });
  it("publishes model retirement before a did-destroy observer reenters destroy", () => {
    let calls = 0;
    model.onDidDestroy(() => {
      if (++calls === 1) model.destroy();
    });
    model.destroy();
    expect(calls).toBe(1);
    expect(model.isDestroyed()).toBe(true);
  });
  it("does not create a model through a retired package handle", () => {
    main.deactivate();
    const returned = main.minimapForEditor(editor);
    if (returned) returned.destroy();
    expect(returned).toBeUndefined();
    expect(main.editorsMinimaps?.size ?? 0).toBe(0);
  });
  it("applies the configured opacity to an actual computed rgba theme color", () => {
    leases.push(
      lumine.styles.addStyleSheet("lumine-text-editor { color: rgba(20, 80, 140, 0.3); }"),
    );
    lumine.config.set("minimap.textOpacity", 0.5);
    view.setDisplayCodeHighlights(false);
    require("../lib/style-reader").styleReader.invalidateDOMStylesCache();
    expect(view.isVisible()).toBe(true);
    const context = view.tokensLayer.context;
    context.fillStyle = "#ff00ff";
    view.forceUpdateNow();
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const pixels = probe.getContext("2d");
    pixels.fillStyle = context.fillStyle;
    pixels.fillRect(0, 0, 1, 1);
    const actual = Array.from(pixels.getImageData(0, 0, 1, 1).data);
    pixels.clearRect(0, 0, 1, 1);
    pixels.fillStyle = "rgba(20, 80, 140, 0.5)";
    pixels.fillRect(0, 0, 1, 1);
    expect(actual).toEqual(Array.from(pixels.getImageData(0, 0, 1, 1).data));
    lumine.config.unset("minimap.textOpacity");
  });
  it("preserves a newer toggle from a real model destruction observer", () => {
    model.onDidDestroy(() => main.toggle());
    main.toggle();
    const current = lumine.views.getView(editor).querySelector("lumine-text-editor-minimap");
    expect(current).not.toBeNull();
    expect(current?.getModel().isDestroyed()).toBe(false);
    expect(main.minimapForEditor(editor)).toBe(current?.getModel());
  });
  it("releases its exact editor registration when an editor's model is manually destroyed", () => {
    model.destroy();
    const registrations = [];
    const subscribe = editor.onDidDestroy.bind(editor);
    spyOn(editor, "onDidDestroy").and.callFake((callback) => {
      const registration = subscribe(callback);
      spyOn(registration, "dispose").and.callThrough();
      registrations.push(registration);
      return registration;
    });
    const replacement = main.minimapForEditor(editor);
    replacement.destroy();
    expect(registrations.length).toBeGreaterThan(0);
    for (const registration of registrations) expect(registration.dispose).toHaveBeenCalled();
    expect(editor.isDestroyed()).toBe(false);
  });
  it("disposes an actual registry subscription returned after allocation retires its consumer", () => {
    const { registry, payload } = service();
    let subscription;
    payload.onDidChangeItems = (callback) => {
      subscription = registry.onDidChangeItems(callback);
      spyOn(subscription, "dispose").and.callThrough();
      main.deactivate();
      return subscription;
    };
    provide(payload);
    expect(subscription.dispose).toHaveBeenCalledTimes(1);
    expect(registry.destroyed).toBe(false);
  });
  it("does not recreate native configuration subscriptions through a copied retired grammar callback", () => {
    model.destroy();
    let copied;
    const subscribe = editor.onDidChangeGrammar.bind(editor);
    spyOn(editor, "onDidChangeGrammar").and.callFake((callback) => {
      copied = callback;
      return subscribe(callback);
    });
    const replacement = main.minimapForEditor(editor);
    replacement.destroy();
    const registrations = [];
    const observe = lumine.config.observe.bind(lumine.config);
    spyOn(lumine.config, "observe").and.callFake((...args) => {
      const registration = observe(...args);
      registrations.push(registration);
      return registration;
    });
    try {
      copied(editor.getGrammar());
      expect(registrations.length).toBe(0);
    } finally {
      for (const registration of registrations) registration.dispose();
    }
  });
});

describe("Minimap style probe ownership", () => {
  it("moves its singleton probe between real target elements without leaving old probes", () => {
    const { StyleReader } = require("../lib/style-reader");
    const reader = new StyleReader();
    const first = document.createElement("div"),
      second = document.createElement("div");
    jasmine.attachToDOM(first);
    jasmine.attachToDOM(second);
    reader.retrieveStyleFromDom(["controlled.first"], "color", first, false);
    const oldProbe = reader.dummyNode;
    reader.retrieveStyleFromDom(["controlled.second"], "color", second, false);
    expect(reader.dummyNode).toBe(oldProbe);
    expect(oldProbe.parentNode).toBe(second);
    expect(first.childElementCount).toBe(0);
    expect(second.childElementCount).toBe(1);
  });
});
