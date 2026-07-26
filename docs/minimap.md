# minimap

The minimap's full API: observe minimaps as editors open, decorate them, and register plugins.

|             |                                                     |
| ----------- | --------------------------------------------------- |
| Version     | `1.0.0`                                             |
| Provided by | `provideMinimap()` returning the service object     |
| Consumed by | `consumeMinimap(minimap)`                           |
| Owner       | [`minimap`](https://github.com/lumine-code/minimap) |

**No package consumes this today.** It is the extension point a minimap plugin — git diff stripes, selection highlights, search results — would use.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "minimap": {
      "versions": { "^1.0.0": "consumeMinimap" }
    }
  }
}
```

## Contract

The service is a flat object. Grouped by what you would use it for:

| Member                                                                                                     | Description                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `observeMinimaps(callback)`                                                                                | Called with each existing minimap and every one created later. **The entry point for a decorating plugin.** |
| `onDidCreateMinimap(callback)`                                                                             | Later minimaps only, without the replay.                                                                    |
| `minimapForEditor(editor)`, `minimapForEditorElement(el)`                                                  | Look one up directly.                                                                                       |
| `getActiveMinimap()`                                                                                       | The one for the active editor.                                                                              |
| `standAloneMinimapForEditor(editor)`                                                                       | A minimap not attached to the editor's own view, for embedding elsewhere.                                   |
| `registerPlugin(name, plugin)`, `unregisterPlugin(name)`                                                   | Register a named plugin the user can toggle in the settings.                                                |
| `activatePlugin(name)`, `deactivatePlugin(name)`, `togglePluginActivation(name)`, `deactivateAllPlugins()` | Drive activation yourself.                                                                                  |
| `onDidAddPlugin`, `onDidRemovePlugin`, `onDidActivatePlugin`, `onDidDeactivatePlugin`                      | Follow the plugin registry.                                                                                 |
| `onDidActivate(callback)`, `onDidDeactivate(callback)`                                                     | The minimap package's own lifecycle.                                                                        |
| `minimapClass`                                                                                             | The `Minimap` constructor, for `instanceof` checks.                                                         |
| `minimapViewProvider`, `getConfigSchema()`                                                                 | Internals exposed for tests and settings; not part of a plugin's normal use.                                |

A plugin passed to `registerPlugin` implements `activatePlugin()`, `deactivatePlugin()`, and `isActive()`.

## Minimal example

```js
const { CompositeDisposable, Disposable } = require("atom");

module.exports = {
  consumeMinimap(minimap) {
    const disposables = new CompositeDisposable();
    minimap.registerPlugin("my-plugin", this.plugin);
    disposables.add(
      new Disposable(() => minimap.unregisterPlugin("my-plugin")),
      minimap.observeMinimaps((instance) => this.decorate(instance)),
    );
    return disposables;
  },
};
```

## Behavior

`observeMinimaps` **replays** — it calls back for every minimap that already exists, then for each new one — so a plugin activating after some editors are open still decorates them. `onDidCreateMinimap` does not replay, and using it alone is the usual reason a plugin only works on files opened after it loads.

Register a plugin by name if the user should be able to turn it off: a registered plugin gets its own setting, and the minimap calls `activatePlugin`/`deactivatePlugin` on it. A plugin that only decorates and needs no toggle can skip the registry and just observe.

Names must be unique across every installed plugin; registering a name twice replaces the first.

A stand-alone minimap is not attached to any editor view and is yours to place and destroy.

## Teardown

Unregister your plugin and dispose your `observeMinimaps` subscription. The minimaps themselves belong to the package — do not destroy them — but a stand-alone minimap you asked for is yours to destroy.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
