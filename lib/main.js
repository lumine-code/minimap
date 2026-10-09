const { CompositeDisposable } = require("lumine");
const { createMinimapElement } = require("./minimap-element");
const Minimap = require("./minimap");
const { styleReader } = require("./style-reader");
const markerLayers = require("./marker-layers");

/** The `Minimap` package provides an eagle-eye view of text buffers. */

/**
 * The activation state of the package.
 *
 * @type {boolean}
 * @access private
 */
let active = false;
let activationGeneration = 0;
let autoTogglePending = false;
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
let modelSubscriptions = null;
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

  const generation = ++activationGeneration;

  subscriptionsOfCommands = lumine.commands.add("lumine-workspace", {
    "minimap:toggle": () => {
      toggle();
    },
    "minimap:toggle-layers": {
      description: "Choose which marker layers the minimap draws.",
      didDispatch: () => {
        markerLayers.showPicker();
      },
    },
  });

  editorsMinimaps = new Map();
  subscriptions = new CompositeDisposable();
  modelSubscriptions = new CompositeDisposable();
  active = true;
  markerLayers.activate();

  if (lumine.config.get("minimap.autoToggle")) {
    // Attaching a minimap replays every open editor and builds its model,
    // element, canvas and marker layers. Keep commands and services available
    // synchronously, then perform that initial workspace sweep after the
    // package activation batch has left the stack. An immediate user toggle
    // wins and the generation guard cancels stale work after deactivation.
    // Publish the desired state now so an immediate toggle command means
    // "hide", just as it did when automatic attachment was synchronous.
    toggled = true;
    autoTogglePending = true;
    queueMicrotask(() => {
      if (active && autoTogglePending && toggled && activationGeneration === generation) {
        autoTogglePending = false;
        initSubscriptions();
        styleReader.invalidateDOMStylesCache();
      }
    });
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

  activationGeneration++;
  autoTogglePending = false;
  const models = editorsMinimaps;
  const observed = subscriptions;
  const commands = subscriptionsOfCommands;
  const registeredModels = modelSubscriptions;
  editorsMinimaps = null;
  subscriptions = null;
  subscriptionsOfCommands = null;
  modelSubscriptions = null;
  toggled = false;
  active = false;
  markerLayers.deactivate();
  observed.dispose();
  commands.dispose();
  registeredModels.dispose();
  const retired = [...models.values()];
  models.clear();
  for (const model of retired) model.destroy();
  styleReader.invalidateDOMStylesCache();
}

/** Toggles the minimap display. */
function toggle() {
  // A command or API call made before the deferred default wins: two manual
  // toggles in the same task must not be followed by an unexpected third one.
  autoTogglePending = false;
  if (!active) {
    return;
  }

  if (toggled) {
    toggled = false;
    const models = editorsMinimaps;
    const observed = subscriptions;
    editorsMinimaps = new Map();
    subscriptions = new CompositeDisposable();
    observed.dispose();
    const retired = [...models.values()];
    models.clear();
    for (const model of retired) model.destroy();
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
  if (!active || !textEditor || textEditor.isDestroyed()) {
    return;
  }
  if (!editorsMinimaps) {
    return;
  }

  let minimap = editorsMinimaps.get(textEditor);

  if (minimap === undefined || minimap.destroyed) {
    minimap = new Minimap({ textEditor });
    editorsMinimaps.set(textEditor, minimap);

    const models = editorsMinimaps;
    const owner = modelSubscriptions;
    const registration = new CompositeDisposable();
    const retire = () => {
      if (models.get(textEditor) === minimap) models.delete(textEditor);
      owner.remove(registration);
      registration.dispose();
    };
    owner.add(registration);
    registration.add(
      textEditor.onDidDestroy(() => {
        retire();
        minimap.destroy();
      }),
      minimap.onDidDestroy(retire),
    );
  }

  return minimap;
}

/**
 * Registers to the `observeTextEditors` method.
 *
 * @access private
 */
function initSubscriptions() {
  const models = editorsMinimaps;
  const observed = subscriptions;
  const owns = () => active && editorsMinimaps === models && subscriptions === observed;
  subscriptions.add(
    lumine.workspace.observeTextEditors((textEditor) => {
      if (!owns()) return;
      // Before the element, which reads the set when its model is set.
      markerLayers.attach(textEditor);

      const minimap = minimapForEditor(textEditor);
      const minimapElement = minimapViewProvider(minimap);

      minimapElement.attach();
    }),
    // The variable event combines styles, system accents, typography and theme
    // variants in a microtask, so a relevant repaint joins the cross-fade.
    lumine.themes.onDidChangeVariables(() => {
      if (owns()) updateStyles();
    }),
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
    minimap.getMinimapElement()?.requestUpdate();
  }
}

/** Force update styles of minimap */
function updateStyles() {
  if (!active || !editorsMinimaps) return;
  // Any package can attach a stylesheet to the window at any time, and next to none of them move
  // the colors the minimap paints with; a forced update redraws every minimap in full, so only pay
  // for it when something actually changed.
  // The token cache is not the whole story: a stylesheet that moves only a
  // marker layer's colour leaves it unchanged, and the markers would keep their
  // old palette until something else forced a redraw.
  const tokensMoved = styleReader.hasDOMStylesCacheChanged();
  const markersMoved = [...editorsMinimaps.values()].some((minimap) =>
    minimap.getMinimapElement()?.markerStylesChanged(),
  );
  if (!tokensMoved && !markersMoved) {
    return;
  }

  styleReader.invalidateDOMStylesCache();
  editorsMinimaps.forEach((minimap) => {
    // Redrawn here and now rather than on the next frame: by then the View Transition the swap runs
    // in has snapshotted the window, and a minimap still holding the old palette fades in with it.
    const view = minimap.getMinimapElement();
    if (!view || view.destroyed) return;
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
        markerLayers.attach(editor);
        redraw(editor);
      }
    },
  });
}

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "minimap",
      tips: [
        "{% if keys['minimap:toggle'] %}You can hide the minimap with {{ 'minimap:toggle' | keystroke }}{% else %}The minimap draws git changes, lint messages, and search hits over a bird's-eye view of the file.{% endif %}",
      ],
    };
  },

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
