const { CompositeDisposable, Disposable } = require("atom");

// The renderer-side adapter over the marker hub.
//
// State lives at package level, outside the toggled subscriptions:
// `minimapForEditor` recreates a destroyed Minimap for the same editor and
// `minimap:toggle` off destroys every view, but a hub handle -- the layers,
// their caches, their in-flight work -- has to outlive both, so toggling back
// on finds warm layers. Handles are released only when their editor dies or
// the hub goes away.
let registry = null;
let picker = null;
let handles = null;
let disposables = null;
const filters = { disabled: [], scale: 1 };

function use(hub, { onItemsChanged, onLayersChanged }) {
  registry = hub;
  handles = new Map();
  filters.disabled = atom.config.get("minimap.disabledLayers") ?? [];
  filters.scale = atom.config.get("minimap.thresholdScale") ?? 1;

  picker = registry.createPicker({
    className: "minimap-view",
    emptyMessage: "No minimap layers found",
    disabledKey: "minimap.disabledLayers",
    // Not a layer a package provides, but to a reader it is the same question --
    // what does this map draw -- so it belongs in the same list.
    extras: [
      {
        name: "code-highlights",
        description: "Syntax colors from the active theme",
        isEnabled: () => atom.config.get("minimap.displayCodeHighlights"),
        toggle: () =>
          atom.config.set(
            "minimap.displayCodeHighlights",
            !atom.config.get("minimap.displayCodeHighlights"),
          ),
      },
    ],
  });

  disposables = new CompositeDisposable(
    registry.onDidChangeItems(onItemsChanged),
    registry.onDidChangeLayers(onLayersChanged),
    // The hub keeps every layer's items full-length; which of them this map
    // draws, and past what count they hide, is filtered here at draw time.
    atom.config.onDidChange("minimap.disabledLayers", ({ newValue }) => {
      filters.disabled = newValue ?? [];
      onLayersChanged();
    }),
    atom.config.onDidChange("minimap.thresholdScale", ({ newValue }) => {
      filters.scale = newValue ?? 1;
      onLayersChanged();
    }),
    new Disposable(() => {
      picker?.destroy();
      picker = null;
      for (const handle of handles.values()) {
        handle.dispose();
      }
      handles.clear();
      registry = null;
    }),
  );
  return disposables;
}

// Refcounted once per editor, not once per call: `minimap:toggle` re-runs
// editor observation on every toggle-on, and a second ref would never be
// released.
function attach(editor) {
  if (!registry || handles.has(editor)) {
    return;
  }
  const handle = registry.attach(editor);
  handles.set(editor, handle);
  const subscription = editor.onDidDestroy(() => {
    subscription.dispose();
    disposables.remove(subscription);
    handles.delete(editor);
    handle.dispose();
  });
  disposables.add(subscription);
  handle.update();
}

// The layers this map should draw for one editor, after its own filters.
function* enabledLayersFor(editor) {
  const handle = handles?.get(editor);
  if (!handle) {
    return;
  }
  for (const layer of handle.layers()) {
    if (filters.disabled.includes(layer.name)) {
      continue;
    }
    if (layer.limit && layer.items.length > layer.limit * filters.scale) {
      continue;
    }
    yield layer;
  }
}

function classNameFor(props, item) {
  return registry?.classNameFor(props, item);
}

function createMarkerCanvas(options) {
  return registry ? new registry.MarkerCanvas(options) : null;
}

function showPicker() {
  picker?.show();
}

// For specs: the picker's toggling is the behaviour worth asserting, and it is
// not reachable through the list without driving the select list itself.
function currentPicker() {
  return picker;
}

module.exports = {
  attach,
  classNameFor,
  createMarkerCanvas,
  enabledLayersFor,
  picker: currentPicker,
  showPicker,
  use,
};
