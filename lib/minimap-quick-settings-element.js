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

    this.subscriptions.add(
      atom.commands.add("minimap-quick-settings", {
        "core:move-left": () => {
          atom.config.set("minimap.displayMinimapOnLeft", true);
        },
        "core:move-right": () => {
          atom.config.set("minimap.displayMinimapOnLeft", false);
        },
        "core:cancel": () => {
          this.destroy();
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
}

customElements.define(TAG_NAME, MinimapQuickSettingsElement);

function createMinimapQuickSettingsElement() {
  const element = document.createElement(TAG_NAME);
  element.createdCallback();
  return element;
}

module.exports = { createMinimapQuickSettingsElement };
