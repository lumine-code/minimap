/** @babel */

import { CompositeDisposable, Emitter } from "atom";

import * as Main from "./main";
import element from "./decorators/element";
import { subscribeTo, addDisposableEventListener } from "./deps/event-helpers";

const TAG_NAME = "minimap-quick-settings";

/** @access private */
class MinimapQuickSettingsElement extends HTMLElement {
  static initClass() {
    element(this, TAG_NAME);
  }

  createdCallback() {
    // Build DOM structure manually (replaces SpacePenDSL.Babel)
    const root = document.createElement("div");
    root.className = "select-list popover-list minimap-quick-settings";

    this.hiddenInput = document.createElement("input");
    this.hiddenInput.type = "text";
    this.hiddenInput.className = "hidden-input";
    root.appendChild(this.hiddenInput);

    this.list = document.createElement("ol");
    this.list.className = "list-group mark-active";

    this.separator = document.createElement("li");
    this.separator.className = "separator";
    this.list.appendChild(this.separator);

    this.codeHighlights = document.createElement("li");
    this.codeHighlights.className = "code-highlights";
    this.codeHighlights.textContent = "code-highlights";
    this.list.appendChild(this.codeHighlights);

    root.appendChild(this.list);

    const btnGroup = document.createElement("div");
    btnGroup.className = "btn-group";

    this.onLeftButton = document.createElement("button");
    this.onLeftButton.className = "btn btn-default";
    this.onLeftButton.textContent = "On Left";
    btnGroup.appendChild(this.onLeftButton);

    this.onRightButton = document.createElement("button");
    this.onRightButton.className = "btn btn-default";
    this.onRightButton.textContent = "On Right";
    btnGroup.appendChild(this.onRightButton);

    root.appendChild(btnGroup);
    this.appendChild(root);
  }

  setModel(minimap) {
    this.selectedItem = null;
    this.minimap = minimap;
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.plugins = {};
    this.itemsActions = new WeakMap();

    this.codeHighlights.classList.toggle(
      "active",
      this.minimap.displayCodeHighlights,
    );

    this.itemsActions.set(this.codeHighlights, () => {
      atom.config.set(
        "minimap.displayCodeHighlights",
        !this.minimap.displayCodeHighlights,
      );
    });

    this.subscriptions.add(
      Main.onDidAddPlugin(({ name, plugin }) => {
        return this.addItemFor(name, plugin);
      }),
      Main.onDidRemovePlugin(({ name, plugin }) => {
        return this.removeItemFor(name, plugin);
      }),
      Main.onDidActivatePlugin(({ name, plugin }) => {
        return this.activateItem(name, plugin);
      }),
      Main.onDidDeactivatePlugin(({ name, plugin }) => {
        return this.deactivateItem(name, plugin);
      }),

      atom.commands.add("minimap-quick-settings", {
        "core:move-up": () => {
          this.selectPreviousItem();
        },
        "core:move-down": () => {
          this.selectNextItem();
        },
        "core:move-left": () => {
          atom.config.set("minimap.displayMinimapOnLeft", true);
        },
        "core:move-right": () => {
          atom.config.set("minimap.displayMinimapOnLeft", false);
        },
        "core:cancel": () => {
          this.destroy();
        },
        "core:confirm": () => {
          this.toggleSelectedItem();
        },
      }),

      subscribeTo(this.codeHighlights, {
        mousedown: (e) => {
          e.preventDefault();
          atom.config.set(
            "minimap.displayCodeHighlights",
            !this.minimap.displayCodeHighlights,
          );
        },
      }),

      subscribeTo(
        this.hiddenInput,
        {
          focusout: (e) => {
            this.destroy();
          },
        },
        { passive: true },
      ),

      subscribeTo(this.onLeftButton, {
        mousedown: (e) => {
          e.preventDefault();
          atom.config.set("minimap.displayMinimapOnLeft", true);
        },
      }),

      subscribeTo(this.onRightButton, {
        mousedown: (e) => {
          e.preventDefault();
          atom.config.set("minimap.displayMinimapOnLeft", false);
        },
      }),

      atom.config.observe("minimap.displayCodeHighlights", (bool) => {
        this.codeHighlights.classList.toggle("active", bool);
      }),

      atom.config.observe("minimap.displayMinimapOnLeft", (bool) => {
        this.onLeftButton.classList.toggle("selected", bool);
        this.onRightButton.classList.toggle("selected", !bool);
      }),
    );

    this.initList();
  }

  onDidDestroy(callback) {
    return this.emitter.on("did-destroy", callback);
  }

  attach() {
    const workspaceElement = atom.views.getView(atom.workspace);
    workspaceElement.appendChild(this);
    this.hiddenInput.focus();
  }

  destroy() {
    this.emitter.emit("did-destroy");
    this.subscriptions.dispose();
    this.parentNode.removeChild(this);
  }

  initList() {
    this.itemsDisposables = new WeakMap();
    for (const name in Main.plugins) {
      this.addItemFor(name, Main.plugins[name]);
    }
  }

  toggleSelectedItem() {
    const fn = this.itemsActions.get(this.selectedItem);
    if (typeof fn === "function") {
      fn();
    }
  }

  selectNextItem() {
    this.selectedItem.classList.remove("selected");
    if (this.selectedItem.nextSibling != null) {
      this.selectedItem = this.selectedItem.nextSibling;
      if (this.selectedItem.matches(".separator")) {
        this.selectedItem = this.selectedItem.nextSibling;
      }
    } else {
      this.selectedItem = this.list.firstChild;
    }
    this.selectedItem.classList.add("selected");
  }

  selectPreviousItem() {
    this.selectedItem.classList.remove("selected");
    if (this.selectedItem.previousSibling != null) {
      this.selectedItem = this.selectedItem.previousSibling;
      if (this.selectedItem.matches(".separator")) {
        this.selectedItem = this.selectedItem.previousSibling;
      }
    } else {
      this.selectedItem = this.list.lastChild;
    }
    this.selectedItem.classList.add("selected");
  }

  addItemFor(name, plugin) {
    const item = document.createElement("li");
    const action = () => {
      Main.togglePluginActivation(name);
    };

    if (plugin.isActive()) {
      item.classList.add("active");
    }

    item.textContent = name;

    this.itemsActions.set(item, action);
    this.itemsDisposables.set(
      item,
      addDisposableEventListener(item, "mousedown", (e) => {
        e.preventDefault();
        action();
      }),
    );

    this.plugins[name] = item;
    this.list.insertBefore(item, this.separator);

    if (!(this.selectedItem != null)) {
      this.selectedItem = item;
      this.selectedItem.classList.add("selected");
    }
  }

  removeItemFor(name, plugin) {
    try {
      this.list.removeChild(this.plugins[name]);
    } catch (error) {}

    delete this.plugins[name];
  }

  activateItem(name, plugin) {
    this.plugins[name].classList.add("active");
  }

  deactivateItem(name, plugin) {
    this.plugins[name].classList.remove("active");
  }
}

MinimapQuickSettingsElement.initClass();

export function createMinimapQuickSettingsElement() {
  const element = document.createElement(TAG_NAME);
  element.createdCallback();
  return element;
}
