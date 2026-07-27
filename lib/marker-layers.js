const { LayerHost } = require("@lumine-code/marker-host");

// Layers that read as a gutter mark are on by default. The ones that paint a
// wide translucent band -- occurrences, selections -- are not: on a scrollbar
// strip they are a hint beside the code, on a minimap they are a wash over the
// code itself, and a user who wants them can say so per map.
const DISABLED_BY_DEFAULT = ["cursors", "highlight", "references", "search-panel"];

let host = null;

// Hosted per editor rather than per Minimap: `minimapForEditor` recreates a
// destroyed Minimap for the same editor, and a layer's state -- its cache, its
// in-flight work -- has to outlive that.
function activate({ onItemsChanged, onLayersChanged }) {
  host = new LayerHost({
    name: "minimap",
    disabledKey: "minimap.disabledLayers",
    thresholdScaleKey: "minimap.thresholdScale",
    onItemsChanged,
    onLayersChanged,
  });
  return host;
}

function deactivate() {
  host?.destroy();
  host = null;
}

function attach(editor) {
  return host?.attach(editor);
}

function detach(editor) {
  host?.detach(editor);
}

function setFor(editor) {
  return host?.setFor(editor);
}

function providers() {
  return host ? [...host.providers.values()] : [];
}

function isDisabled(name) {
  return host ? host.isDisabled(name) : false;
}

function toggleLayer(name) {
  const disabled = [...(atom.config.get("minimap.disabledLayers") ?? [])];
  const index = disabled.indexOf(name);
  if (index === -1) {
    disabled.push(name);
  } else {
    disabled.splice(index, 1);
  }
  atom.config.set("minimap.disabledLayers", disabled);
}

// The service: a layer package provides one descriptor, and both overview maps
// build their own layers from it.
function consumeMarkerLayer(provider) {
  return host.addProvider(provider);
}

module.exports = {
  DISABLED_BY_DEFAULT,
  activate,
  attach,
  consumeMarkerLayer,
  deactivate,
  detach,
  isDisabled,
  providers,
  setFor,
  toggleLayer,
};
