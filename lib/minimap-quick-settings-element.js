const { CompositeDisposable, Emitter } = require("atom");

const { subscribeTo } = require("./event-helpers");

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

    this.selectItem(this.codeHighlights);

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
    if (!this.selectedItem) {
      return;
    }
    this.selectItem(this.selectedItem.nextSibling ?? this.list.firstChild);
  }

  selectPreviousItem() {
    if (!this.selectedItem) {
      return;
    }
    this.selectItem(this.selectedItem.previousSibling ?? this.list.lastChild);
  }
}

customElements.define(TAG_NAME, MinimapQuickSettingsElement);

function createMinimapQuickSettingsElement() {
  const element = document.createElement(TAG_NAME);
  element.createdCallback();
  return element;
}

module.exports = { createMinimapQuickSettingsElement };
