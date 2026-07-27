const { CompositeDisposable } = require("atom");
const { createMinimapElement } = require("./minimap-element");
const Minimap = require("./minimap");
const { treeSitterWarning } = require("./performance-monitor");
const { styleReader } = require("./style-reader");
const { coalesce } = require("./utils");
const markerLayers = require("./marker-layers");

/** The `Minimap` package provides an eagle-eye view of text buffers. */

/**
 * The activation state of the package.
 *
 * @type {boolean}
 * @access private
 */
let active = false;
/**
 * The toggle state of the package.
 *
 * @type {boolean}
 * @access private
 */
let toggled = false;
/**
 * The `Map` where Minimap instances are stored with the text editor they target as key.
 *
 * @type {Map}
 * @access private
 */
let editorsMinimaps = null;
/**
 * The composite disposable that stores the package's subscriptions.
 *
 * @type {CompositeDisposable}
 * @access private
 */
let subscriptions = null;
/**
 * The disposable that stores the package's commands subscription.
 *
 * @type {Disposable}
 * @access private
 */
let subscriptionsOfCommands = null;

/** Activates the minimap package. */
function activate() {
  if (active) {
    return;
  }

  subscriptionsOfCommands = atom.commands.add("atom-workspace", {
    "minimap:toggle": () => {
      toggle();
    },
    "minimap:toggle-layers": () => {
      markerLayers.showPicker();
    },
  });

  editorsMinimaps = new Map();
  subscriptions = new CompositeDisposable();
  active = true;

  if (atom.config.get("minimap.autoToggle")) {
    toggle();
  }
}

/**
 * Returns a {MinimapElement} for the passed-in model if it's a {Minimap}.
 *
 * @param {Minimap} model The model for which returning a view
 * @returns {MinimapElement}
 */
function minimapViewProvider(model) {
  if (model instanceof Minimap) {
    let element = model.getMinimapElement();
    if (!element) {
      element = createMinimapElement();
      element.setModel(model);
    }
    return element;
  }
}

/** Deactivates the minimap package. */
function deactivate() {
  if (!active) {
    return;
  }

  if (editorsMinimaps) {
    editorsMinimaps.forEach((value) => {
      value.destroy();
    });
    editorsMinimaps.clear();
  }

  subscriptions.dispose();
  subscriptionsOfCommands.dispose();
  styleReader.invalidateDOMStylesCache();
  toggled = false;
  active = false;
}

/** Toggles the minimap display. */
function toggle() {
  if (!active) {
    return;
  }

  if (toggled) {
    toggled = false;

    if (editorsMinimaps) {
      editorsMinimaps.forEach((minimap) => {
        minimap.destroy();
      });
      editorsMinimaps.clear();
    }
    subscriptions.dispose();
  } else {
    toggled = true;
    subscriptions = new CompositeDisposable();
    initSubscriptions();
  }
  styleReader.invalidateDOMStylesCache();
}

/**
 * Returns the `Minimap` object associated to the passed-in `TextEditor`.
 *
 * @param {TextEditor} textEditor A text editor
 * @returns {Minimap} The associated minimap
 */
function minimapForEditor(textEditor) {
  if (!textEditor) {
    return;
  }
  if (!editorsMinimaps) {
    return;
  }

  let minimap = editorsMinimaps.get(textEditor);

  if (minimap === undefined || minimap.destroyed) {
    minimap = new Minimap({ textEditor });
    editorsMinimaps.set(textEditor, minimap);

    const editorSubscription = textEditor.onDidDestroy(() => {
      if (editorsMinimaps) {
        editorsMinimaps.delete(textEditor);
      }
      if (minimap) {
        // just in case
        minimap.destroy();
      }
      editorSubscription.dispose();
    });
    // dispose the editorSubscription if minimap is deactivated before destroying the editor
    subscriptions.add(editorSubscription);
  }

  return minimap;
}

/**
 * Registers to the `observeTextEditors` method.
 *
 * @access private
 */
function initSubscriptions() {
  // Coalesced rather than debounced: a theme switch attaches its stylesheets inside a View
  // Transition, and the minimap has to re-read them in the same task to be part of the cross-fade.
  // See `coalesce` in `./utils`.
  const updateStylesSoon = coalesce(updateStyles);

  subscriptions.add(
    atom.workspace.observeTextEditors((textEditor) => {
      // Before the element, which reads the set when its model is set.
      markerLayers.attach(textEditor);

      const minimap = minimapForEditor(textEditor);
      const minimapElement = minimapViewProvider(minimap);

      minimapElement.attach();
    }),
    // empty color cache if the theme changes. `onDidChangeActiveThemes` is not redundant with the
    // style element events: a restyle that attaches no stylesheet at all — a theme toggling a
    // variant attribute on the document root through `atom.themes.updateAppearance` — only reports
    // itself there.
    atom.themes.onDidChangeActiveThemes(updateStylesSoon),
    atom.styles.onDidUpdateStyleElement(updateStylesSoon),
    atom.styles.onDidAddStyleElement(updateStylesSoon),
    atom.styles.onDidRemoveStyleElement(updateStylesSoon),
    treeSitterWarning(),
  );
}

/**
 * Redraws one editor's minimap, if it has one.
 *
 * @param {TextEditor} textEditor
 * @access private
 */
function redraw(textEditor) {
  const minimap = editorsMinimaps?.get(textEditor);
  if (minimap) {
    atom.views.getView(minimap).requestUpdate();
  }
}

/** Force update styles of minimap */
function updateStyles() {
  // Any package can attach a stylesheet to the window at any time, and next to none of them move
  // the colors the minimap paints with; a forced update redraws every minimap in full, so only pay
  // for it when something actually changed.
  // The token cache is not the whole story: a stylesheet that moves only a
  // marker layer's colour leaves it unchanged, and the markers would keep their
  // old palette until something else forced a redraw.
  const tokensMoved = styleReader.hasDOMStylesCacheChanged();
  const markersMoved = [...editorsMinimaps.values()].some((minimap) =>
    atom.views.getView(minimap).markerStylesChanged(),
  );
  if (!tokensMoved && !markersMoved) {
    return;
  }

  styleReader.invalidateDOMStylesCache();
  editorsMinimaps.forEach((minimap) => {
    // Redrawn here and now rather than on the next frame: by then the View Transition the swap runs
    // in has snapshotted the window, and a minimap still holding the old palette fades in with it.
    const view = atom.views.getView(minimap);
    view.markers?.invalidate();
    view.forceUpdateNow();
  });
}

/**
 * Consumes the marker hub: every layer's items, computed once per editor and
 * shared with the scrollbar strip, plus the canvas machinery that draws them.
 *
 * @param {Object} registry The `marker.registry` service object
 * @returns {Disposable} Disposed when the hub deactivates
 */
function consumeMarkerRegistry(registry) {
  return markerLayers.use(registry, {
    onItemsChanged: (layer) => {
      redraw(layer.editor);
    },
    onLayersChanged: () => {
      for (const editor of editorsMinimaps?.keys() ?? []) {
        redraw(editor);
      }
    },
  });
}

module.exports = {
  activate,
  deactivate,
  toggle,
  minimapForEditor,
  minimapViewProvider,
  createMinimapElement,
  Minimap,
  consumeMarkerRegistry,
  markerLayers,
  // Created by `activate`, so it is exposed as a getter: a plain property would
  // be captured as null the moment anything required this module.
  get editorsMinimaps() {
    return editorsMinimaps;
  },
};
