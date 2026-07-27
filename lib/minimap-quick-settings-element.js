const { CompositeDisposable, Emitter } = require("atom");

const { subscribeTo } = require("./event-helpers");
const markerLayers = require("./marker-layers");

const TAG_NAME = "minimap-quick-settings";

/** @access private */
class MinimapQuickSettingsElement extends HTMLElement {
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

    // Marker layers first, then a separator, then the settings that are the
    // minimap's own.
    this.layerItems = document.createElement("li");
    this.layerItems.className = "separator";
    this.list.appendChild(this.layerItems);

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
    this.minimap = minimap;
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.itemsActions = new WeakMap();

    this.codeHighlights.classList.toggle("active", this.minimap.displayCodeHighlights);

    this.itemsActions.set(this.codeHighlights, () => {
      atom.config.set("minimap.displayCodeHighlights", !this.minimap.displayCodeHighlights);
    });

    this.addLayerItems();
    this.selectItem(
      this.list.firstChild === this.layerItems ? this.codeHighlights : this.list.firstChild,
    );

    this.subscriptions.add(
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
          atom.config.set("minimap.displayCodeHighlights", !this.minimap.displayCodeHighlights);
        },
      }),

      subscribeTo(
        this.hiddenInput,
        {
          focusout: () => {
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
  }

  // One row per registered marker layer, toggling this map's own disabled list:
  // a layer can be on here and off on the scrollbar strip.
  addLayerItems() {
    for (const props of markerLayers.providers()) {
      const item = document.createElement("li");
      item.textContent = props.description ? `${props.name} — ${props.description}` : props.name;
      item.classList.toggle("active", !markerLayers.isDisabled(props.name));

      const action = () => {
        markerLayers.toggleLayer(props.name);
        item.classList.toggle("active", !markerLayers.isDisabled(props.name));
      };
      this.itemsActions.set(item, action);
      this.subscriptions.add(
        subscribeTo(item, {
          mousedown: (e) => {
            e.preventDefault();
            action();
          },
        }),
      );

      this.list.insertBefore(item, this.layerItems);
    }
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

  selectItem(item) {
    this.selectedItem?.classList.remove("selected");
    this.selectedItem = item;
    this.selectedItem.classList.add("selected");
  }

  toggleSelectedItem() {
    const fn = this.itemsActions.get(this.selectedItem);
    if (typeof fn === "function") {
      fn();
    }
  }

  selectNextItem() {
    this.step("nextSibling", "firstChild");
  }

  selectPreviousItem() {
    this.step("previousSibling", "lastChild");
  }

  step(direction, wrapTo) {
    if (!this.selectedItem) {
      return;
    }
    let next = this.selectedItem[direction] ?? this.list[wrapTo];
    if (next?.matches(".separator")) {
      next = next[direction] ?? this.list[wrapTo];
    }
    if (next) {
      this.selectItem(next);
    }
  }
}

customElements.define(TAG_NAME, MinimapQuickSettingsElement);

function createMinimapQuickSettingsElement() {
  const element = document.createElement(TAG_NAME);
  element.createdCallback();
  return element;
}

module.exports = { createMinimapQuickSettingsElement };
