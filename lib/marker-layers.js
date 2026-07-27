const { LayerHost } = require("@lumine-code/marker-host");
const { LayerPicker } = require("@lumine-code/marker-host/picker");

let host = null;
let picker = null;

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

  picker = new LayerPicker({
    host,
    className: "minimap-view",
    emptyMessage: "No minimap layers found",
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

  return host;
}

function deactivate() {
  picker?.destroy();
  picker = null;
  host?.destroy();
  host = null;
}

function showPicker() {
  picker?.show();
}

// For specs: the picker's toggling is the behaviour worth asserting, and it is
// not reachable through the list without driving the select list itself.
function currentPicker() {
  return picker;
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

// The service: a layer package provides one descriptor, and both overview maps
// build their own layers from it.
function consumeMarkerLayer(provider) {
  return host.addProvider(provider);
}

module.exports = {
  activate,
  attach,
  consumeMarkerLayer,
  deactivate,
  detach,
  picker: currentPicker,
  setFor,
  showPicker,
};
