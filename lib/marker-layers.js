const { CompositeDisposable, Disposable } = require("lumine");

// Marker holds survive toggling the views; each exact registry payload owns its
// handles until its final service edge or activation retires.
let owner = null;
let current = null;
function isLive(captured, state) {
  return owner === captured && !captured.retired && !state.retired;
}
function isCurrent(captured, state) {
  return isLive(captured, state) && current === state;
}
function refresh(captured) {
  if (owner !== captured || captured.retired) return;
  let next = null;
  for (const edge of captured.edges) if (edge.state.ready && !edge.state.retired) next = edge.state;
  if (current === next) return;
  const previous = current;
  current = next;
  (next ?? previous)?.callbacks.onLayersChanged();
}
function retireState(captured, state) {
  if (state.retired) return;
  state.retired = true;
  captured.states.delete(state.hub);
  const handles = [...state.handles.values()];
  state.handles.clear();
  refresh(captured);
  state.subscriptions.dispose();
  for (const { handle } of handles) handle.dispose();
}
function activate() {
  deactivate();
  owner = { retired: false, states: new Map(), edges: new Set() };
}
function deactivate() {
  const captured = owner;
  owner = null;
  current = null;
  if (!captured) return;
  captured.retired = true;
  captured.edges.clear();
  const states = [...captured.states.values()];
  captured.states.clear();
  for (const state of states) retireState(captured, state);
}
function use(hub, callbacks) {
  const captured = owner;
  if (!captured || captured.retired) return new Disposable();
  let state = captured.states.get(hub);
  const fresh = !state;
  if (!state) {
    state = {
      hub,
      callbacks,
      references: 0,
      ready: false,
      retired: false,
      handles: new Map(),
      subscriptions: new CompositeDisposable(),
      filters: {
        scale: lumine.config.get("minimap.thresholdScale") ?? 1,
      },
    };
    captured.states.set(hub, state);
  }
  const edge = { state };
  state.references++;
  captured.edges.add(edge);
  const lease = new Disposable(() => {
    if (!captured.edges.delete(edge) || state.retired) return;
    if (--state.references === 0) retireState(captured, state);
    refresh(captured);
  });
  if (fresh) {
    const retain = (subscription) => {
      if (!isLive(captured, state)) subscription.dispose();
      else state.subscriptions.add(subscription);
    };
    try {
      retain(
        hub.onDidChangeItems((layer) => {
          if (isCurrent(captured, state)) callbacks.onItemsChanged(layer);
        }),
      );
      if (isLive(captured, state))
        retain(
          hub.onDidChangeLayers(() => {
            if (isCurrent(captured, state)) callbacks.onLayersChanged();
          }),
        );
      if (isLive(captured, state))
        retain(
          lumine.config.onDidChange("minimap.thresholdScale", ({ newValue }) => {
            if (!isLive(captured, state)) return;
            state.filters.scale = newValue ?? 1;
            if (isCurrent(captured, state)) callbacks.onLayersChanged();
          }),
        );
      state.ready = isLive(captured, state);
    } catch (error) {
      lease.dispose();
      throw error;
    }
  }
  refresh(captured);
  return lease;
}
function attach(editor) {
  const captured = owner,
    state = current;
  if (!state || !isCurrent(captured, state) || editor.isDestroyed() || state.handles.has(editor))
    return;
  const handle = state.hub.attach(editor);
  if (!isCurrent(captured, state) || editor.isDestroyed()) {
    handle.dispose();
    return;
  }
  const entry = { handle, subscription: null };
  state.handles.set(editor, entry);
  entry.subscription = editor.onDidDestroy(() => {
    if (state.handles.get(editor) !== entry) return;
    state.handles.delete(editor);
    state.subscriptions.remove(entry.subscription);
    entry.subscription.dispose();
    handle.dispose();
  });
  state.subscriptions.add(entry.subscription);
  handle.update();
}
function* enabledLayersFor(editor) {
  const state = current,
    entry = state?.handles.get(editor);
  if (!entry) return;
  for (const layer of entry.handle.layers()) {
    if (layer.limit && layer.items.length > layer.limit * state.filters.scale) continue;
    yield layer;
  }
}
function detach(editor) {
  for (const state of owner?.states.values() ?? []) {
    const entry = state.handles.get(editor);
    if (!entry) continue;
    state.handles.delete(editor);
    state.subscriptions.remove(entry.subscription);
    entry.subscription.dispose();
    entry.handle.dispose();
  }
}
module.exports = {
  activate,
  deactivate,
  use,
  attach,
  detach,
  enabledLayersFor,
  classNameFor: (props, item) => current?.hub.classNameFor(props, item),
  createMarkerCanvas: (options) => (current ? new current.hub.MarkerCanvas(options) : null),
  get registry() {
    return current?.hub ?? null;
  },
};
