const { CompositeDisposable, Disposable } = require("atom");

const CanvasDrawer = require("./canvas-drawer");
const { subscribeTo } = require("./event-helpers");

const { createMinimapQuickSettingsElement } = require("./minimap-quick-settings-element");

const SPEC_MODE = atom.inSpecMode();
const TAG_NAME = "atom-text-editor-minimap";

/**
 * Public: The MinimapElement is the view meant to render a {@link Minimap} instance in the DOM.
 *
 * You can retrieve the MinimapElement associated to a Minimap using the `atom.views.getView` method.
 *
 * Note that most interactions with the Minimap package is done through the Minimap model so you should never have to
 * access MinimapElement instances.
 *
 * @example Let minimapElement = atom.views.getView(minimap)
 */
class MinimapElement extends CanvasDrawer {
  //    ##     ##  #######   #######  ##    ##  ######
  //    ##     ## ##     ## ##     ## ##   ##  ##    ##
  //    ##     ## ##     ## ##     ## ##  ##   ##
  //    ######### ##     ## ##     ## #####     ######
  //    ##     ## ##     ## ##     ## ##  ##         ##
  //    ##     ## ##     ## ##     ## ##   ##  ##    ##
  //    ##     ##  #######   #######  ##    ##  ######

  /**
   * DOM callback invoked when a new MinimapElement is created.
   *
   * @access private
   */
  createdCallback() {
    // Core properties

    /** @access private */
    this.minimap = undefined;

    /** @access private */
    this.width = undefined;
    /** @access private */
    this.height = undefined;

    // Subscriptions

    /** @access private */
    this.subscriptions = new CompositeDisposable();
    /** @access private */
    this.visibleAreaSubscription = undefined;
    /** @access private */
    this.quickSettingsSubscription = undefined;
    /** @access private */
    this.dragSubscription = undefined;
    /** @access private */
    this.openQuickSettingSubscription = undefined;

    // Configs

    /** @access private */
    this.displayMinimapOnLeft = undefined;
    /** @access private */
    this.displayQuickSettings = undefined;
    /** @access private */
    this.textOpacity = undefined;
    /** @access private */
    this.displayCodeHighlights = undefined;
    /** @access private */
    this.adjustToSoftWrap = undefined;
    /** @access private */
    this.useHardwareAcceleration = undefined;
    // Elements

    /** @access private */
    this.visibleArea = undefined;
    /** @access private */
    this.controls = undefined;
    /** @access private */
    this.openQuickSettings = undefined;
    /** @access private */
    this.quickSettingsElement = undefined;

    // States

    /** @access private */
    this.attached = undefined;
    /** @access private */
    this.attachedToTextEditor = undefined;
    /** @access private */

    // Other

    /** @access private */
    this.offscreenFirstRow = undefined;
    /** @access private */
    this.offscreenLastRow = undefined;
    /** @access private */
    this.frameRequested = undefined;
    /** @access private */
    this.flexBasis = undefined;

    this.initializeContent();

    this.subscriptions.add(
      atom.config.observe("minimap.displayMinimapOnLeft", (displayMinimapOnLeft) => {
        this.displayMinimapOnLeft = displayMinimapOnLeft;

        this.updateMinimapFlexPosition();
        this.measureHeightAndWidth(true, true);
      }),

      atom.config.observe("minimap.displayQuickSettings", (displayQuickSettings) => {
        this.displayQuickSettings = displayQuickSettings;

        if (this.displayQuickSettings && !(this.openQuickSettings != null)) {
          this.initializeOpenQuickSettings();
        } else if (this.openQuickSettings != null) {
          this.disposeOpenQuickSettings();
        }
      }),

      atom.config.observe("minimap.textOpacity", (textOpacity) => {
        this.textOpacity = textOpacity;

        if (this.attached) {
          this.requestForcedUpdate();
        }
      }),

      atom.config.observe("minimap.displayCodeHighlights", (displayCodeHighlights) => {
        this.displayCodeHighlights = displayCodeHighlights;

        if (this.attached) {
          this.requestForcedUpdate();
        }
      }),

      atom.config.observe("minimap.adjustMinimapWidthToSoftWrap", (adjustToSoftWrap) => {
        this.adjustToSoftWrap = adjustToSoftWrap;

        if (this.attached) {
          this.measureHeightAndWidth();
        }
      }),

      atom.config.observe("minimap.useHardwareAcceleration", (useHardwareAcceleration) => {
        this.useHardwareAcceleration = useHardwareAcceleration;

        if (this.attached) {
          this.requestUpdate();
        }
      }),

      atom.config.observe("language.preferredLineLength", () => {
        if (this.attached) {
          this.measureHeightAndWidth();
        }
      }),

      atom.config.observe("language.softWrap", () => {
        if (this.attached) {
          this.requestUpdate();
        }
      }),

      atom.config.observe("language.showInvisibles", () => {
        if (this.attached) {
          this.requestUpdate();
        }
      }),

      atom.config.observe("editor.invisibles", () => {
        if (this.attached) {
          this.requestUpdate();
        }
      }),

      atom.config.observe("language.softWrapAtPreferredLineLength", () => {
        if (this.attached) {
          this.requestUpdate();
        }
      }),
    );
  }

  /**
   * DOM callback invoked when a new MinimapElement is attached to the DOM.
   *
   * @access private
   */
  connectedCallback() {
    this.intersectionObserver = new IntersectionObserver((entries) => {
      const { intersectionRect } = entries[entries.length - 1];
      if (intersectionRect.width > 0 || intersectionRect.height > 0) {
        this.measureHeightAndWidth(true, true);
      }
    });

    this.intersectionObserver.observe(this);
    if (this.isVisible()) {
      this.measureHeightAndWidth(true, true);
    }

    const measureDimensions = () => {
      this.measureHeightAndWidth(false, false);
    };
    const resizeObserver = new ResizeObserver(measureDimensions);
    resizeObserver.observe(this);
    window.addEventListener("resize", measureDimensions, { passive: true });

    this.subscriptions.add(
      new Disposable(() => {
        this.intersectionObserver.disconnect();
      }),
      new Disposable(() => {
        resizeObserver.disconnect();
      }),
      new Disposable(() => {
        window.removeEventListener("resize", measureDimensions);
      }),
    );

    this.measureHeightAndWidth();
    this.updateMinimapFlexPosition();
    this.attached = true;
    this.attachedToTextEditor =
      this.closest("atom-text-editor") === this.minimap.getTextEditorElement();

    if (this.attachedToTextEditor) {
      this.minimap
        .getTextEditorElement()
        .setAttribute("with-minimap", this.displayMinimapOnLeft ? "left" : "right");
    }

    this.subscriptions.add(this.subscribeToMediaQuery());
  }

  /**
   * DOM callback invoked when a new MinimapElement is detached from the DOM.
   *
   * @access private
   */
  disconnectedCallback() {
    this.minimap.getTextEditorElement().removeAttribute("with-minimap");
    this.attached = false;
  }

  //       ###    ######## ########    ###     ######  ##     ##
  //      ## ##      ##       ##      ## ##   ##    ## ##     ##
  //     ##   ##     ##       ##     ##   ##  ##       ##     ##
  //    ##     ##    ##       ##    ##     ## ##       #########
  //    #########    ##       ##    ######### ##       ##     ##
  //    ##     ##    ##       ##    ##     ## ##    ## ##     ##
  //    ##     ##    ##       ##    ##     ##  ######  ##     ##

  /**
   * Returns whether the MinimapElement is currently visible on screen or not.
   *
   * The visibility of the minimap is defined by testing the size of the offset width and height of the element.
   *
   * @returns {boolean} Whether the MinimapElement is currently visible or not
   */
  isVisible() {
    return this.offsetWidth > 0 || this.offsetHeight > 0;
  }

  /**
   * Attaches the MinimapElement to the DOM.
   *
   * The position at which the element is attached is defined by the `displayMinimapOnLeft` setting.
   *
   * @param {HTMLElement} [parent] The DOM node where attaching the minimap element
   */
  attach(parent) {
    if (this.attached) {
      return;
    }

    const container = parent || this.minimap.getTextEditorElement();
    const minimaps = container.querySelectorAll(TAG_NAME);
    if (minimaps.length) {
      Array.prototype.forEach.call(minimaps, (el) => {
        el.destroy();
        try {
          container.removeChild(el);
        } catch {
          // TODO: ignore for now
          // https://github.com/atom-minimap/minimap/issues/766#issuecomment-762496374
        }
      });
    }
    container.appendChild(this);
  }

  /** Detaches the MinimapElement from the DOM. */
  detach() {
    if (!this.attached || this.parentNode == null) {
      return;
    }
    this.parentNode.removeChild(this);
  }

  /**
   * Toggles the minimap left/right position based on the value of the `displayMinimapOnLeft` setting.
   *
   * @access private
   */
  updateMinimapFlexPosition() {
    this.classList.toggle("left", this.displayMinimapOnLeft);
    if (this.attachedToTextEditor) {
      this.minimap
        .getTextEditorElement()
        .setAttribute("with-minimap", this.displayMinimapOnLeft ? "left" : "right");
    }
  }

  /** Destroys this MinimapElement */
  destroy() {
    if (this.quickSettingsElement) {
      this.quickSettingsElement.destroy();
    }
    this.subscriptions.dispose();
    this.detach();
  }

  //     ######   #######  ##    ## ######## ######## ##    ## ########
  //    ##    ## ##     ## ###   ##    ##    ##       ###   ##    ##
  //    ##       ##     ## ####  ##    ##    ##       ####  ##    ##
  //    ##       ##     ## ## ## ##    ##    ######   ## ## ##    ##
  //    ##       ##     ## ##  ####    ##    ##       ##  ####    ##
  //    ##    ## ##     ## ##   ###    ##    ##       ##   ###    ##
  //     ######   #######  ##    ##    ##    ######## ##    ##    ##

  /**
   * Creates the content of the MinimapElement and attaches the mouse control event listeners.
   *
   * @access private
   */
  initializeContent() {
    this.initializeCanvas();

    this.attachCanvases(this);

    this.createVisibleArea();
    this.createControls();

    this.subscriptions.add(
      subscribeTo(
        this,
        {
          mousewheel: (e) => {
            if (this.minimap.onMouseWheel) {
              this.minimap.onMouseWheel(e);
            }
          },
        },
        { passive: true },
      ),

      subscribeTo(
        this.getFrontCanvas(),
        {
          mousedown: (e) => {
            this.canvasPressed(extractMouseEventData(e));
          },
          touchstart: (e) => {
            this.canvasPressed(extractTouchEventData(e));
          },
        },
        { passive: true },
      ),
    );
  }

  /**
   * Initializes the visible area div.
   *
   * @access private
   */
  createVisibleArea() {
    if (this.visibleArea) {
      return;
    }

    this.visibleArea = document.createElement("div");
    this.visibleArea.classList.add("minimap-visible-area");
    this.appendChild(this.visibleArea);
    this.visibleAreaSubscription = subscribeTo(
      this.visibleArea,
      {
        mousedown: (e) => {
          this.startDrag(extractMouseEventData(e));
        },
        touchstart: (e) => {
          this.startDrag(extractTouchEventData(e));
        },
      },
      { passive: true },
    );

    this.subscriptions.add(this.visibleAreaSubscription);
  }

  /**
   * Creates the controls container div.
   *
   * @access private
   */
  createControls() {
    if (this.controls) {
      return;
    }

    this.controls = document.createElement("div");
    this.controls.classList.add("minimap-controls");
    this.appendChild(this.controls);
  }

  /**
   * Initializes the quick settings openener div when the `displayQuickSettings` setting is enabled.
   *
   * @access private
   */
  initializeOpenQuickSettings() {
    if (this.openQuickSettings) {
      return;
    }

    this.openQuickSettings = document.createElement("div");
    this.openQuickSettings.classList.add("open-minimap-quick-settings");
    this.controls.appendChild(this.openQuickSettings);

    this.openQuickSettingSubscription = subscribeTo(this.openQuickSettings, {
      mousedown: (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.quickSettingsElement != null) {
          this.quickSettingsElement.destroy();
          this.quickSettingsSubscription.dispose();
        } else {
          this.quickSettingsElement = createMinimapQuickSettingsElement();
          this.quickSettingsElement.setModel(this);
          this.quickSettingsSubscription = this.quickSettingsElement.onDidDestroy(() => {
            this.quickSettingsElement = null;
          });

          const { top, left, right } = this.getFrontCanvas().getBoundingClientRect();
          this.quickSettingsElement.style.top = `${top}px`;
          this.quickSettingsElement.attach();

          if (this.displayMinimapOnLeft) {
            this.quickSettingsElement.style.left = `${right}px`;
          } else {
            this.quickSettingsElement.style.left = `${left - this.quickSettingsElement.clientWidth}px`;
          }
        }
      },
    });
  }

  /**
   * Disposes the quick settings openener div when the `displayQuickSettings` setting is disabled.
   *
   * @access private
   */
  disposeOpenQuickSettings() {
    if (!this.openQuickSettings) {
      return;
    }

    this.controls.removeChild(this.openQuickSettings);
    this.openQuickSettingSubscription.dispose();
    delete this.openQuickSettings;
  }

  //    ##     ##  #######  ########  ######## ##
  //    ###   ### ##     ## ##     ## ##       ##
  //    #### #### ##     ## ##     ## ##       ##
  //    ## ### ## ##     ## ##     ## ######   ##
  //    ##     ## ##     ## ##     ## ##       ##
  //    ##     ## ##     ## ##     ## ##       ##
  //    ##     ##  #######  ########  ######## ########

  /**
   * Returns the Minimap for which this MinimapElement was created.
   *
   * @returns {Minimap} This element's Minimap
   */
  getModel() {
    return this.minimap;
  }

  /**
   * Defines the Minimap model for this MinimapElement instance.
   *
   * @param {Minimap} minimap The Minimap model for this instance.
   * @returns {Minimap} This element's Minimap
   */
  setModel(minimap) {
    this.minimap = minimap;

    // set minimapElement for Minimap
    this.minimap.minimapElement = this;

    this.subscriptions.add(
      this.minimap.onDidChangeScrollTop(() => {
        this.requestUpdate();
      }),

      this.minimap.onDidChangeScrollLeft(() => {
        this.requestUpdate();
      }),

      this.minimap.onDidDestroy(() => {
        this.destroy();
      }),

      this.minimap.onDidChangeConfig(() => {
        if (this.attached) {
          return this.requestForcedUpdate();
        }
      }),

      this.minimap.onDidChange((change) => {
        this.pendingChanges.push(change);
        this.requestUpdate();
      }),
    );

    if (this.width != null && this.height != null) {
      this.minimap.setScreenHeightAndWidth(this.height, this.width);
    }

    return this.minimap;
  }

  //    ##     ## ########  ########     ###    ######## ########
  //    ##     ## ##     ## ##     ##   ## ##      ##    ##
  //    ##     ## ##     ## ##     ##  ##   ##     ##    ##
  //    ##     ## ########  ##     ## ##     ##    ##    ######
  //    ##     ## ##        ##     ## #########    ##    ##
  //    ##     ## ##        ##     ## ##     ##    ##    ##
  //     #######  ##        ########  ##     ##    ##    ########

  /** Requests an update to be performed on the next frame. */
  requestUpdate() {
    if (this.frameRequested) {
      return;
    }

    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.update();
      this.frameRequested = false;
    });
  }

  /** Requests an update to be performed on the next frame that will completely redraw the minimap. */
  requestForcedUpdate() {
    this.offscreenFirstRow = null;
    this.offscreenLastRow = null;
    this.requestUpdate();
  }

  /**
   * Completely redraws the minimap right away rather than on the next frame.
   *
   * A restyled window has to be answered within the task that restyled it: the theme swap runs
   * inside a View Transition, which cross-fades the window from the rendering it snapshots one
   * frame on, so a canvas that waits for an animation frame to repaint is left out of the fade.
   */
  forceUpdateNow() {
    this.offscreenFirstRow = null;
    this.offscreenLastRow = null;
    this.update();
  }

  /**
   * Performs the actual MinimapElement update.
   *
   * @access private
   */
  update() {
    if (!(this.attached && this.isVisible() && this.minimap)) {
      return;
    }
    const minimap = this.minimap;
    minimap.enableCache();
    const canvas = this.getFrontCanvas();

    const devicePixelRatio = this.minimap.getDevicePixelRatio();
    const visibleAreaLeft = minimap.getTextEditorScaledScrollLeft();
    const visibleAreaTop = minimap.getTextEditorScaledScrollTop() - minimap.getScrollTop();
    const width = Math.min(canvas.width / devicePixelRatio, this.width);
    const visibleWidth = width + visibleAreaLeft;

    if (this.adjustToSoftWrap && this.flexBasis) {
      this.style.flexBasis = `${this.flexBasis}px`;
      this.style.width = `${this.flexBasis}px`;
    } else {
      this.style.flexBasis = null;
      this.style.width = null;
    }

    if (SPEC_MODE) {
      applyStyles(this.visibleArea, {
        width: `${Math.round(visibleWidth)}px`,
        height: `${Math.round(minimap.getTextEditorScaledHeight())}px`,
        top: `${Math.round(visibleAreaTop)}px`,
        "border-left-width": `${Math.round(visibleAreaLeft)}px`,
      });
    } else {
      applyStyles(this.visibleArea, {
        width: `${Math.round(visibleWidth)}px`,
        height: `${Math.round(minimap.getTextEditorScaledHeight())}px`,
        transform: makeTranslate(0, visibleAreaTop, this.useHardwareAcceleration),
        "border-left-width": `${Math.round(visibleAreaLeft)}px`,
      });
    }

    applyStyles(this.controls, { width: `${Math.round(width)}px` });

    {
      const scale = 1 / devicePixelRatio;
      const canvasTransform = makeScale(scale, scale, this.useHardwareAcceleration);
      applyStyles(this.tokensLayer.canvas, { transform: canvasTransform });
    }

    this.updateCanvas();
    minimap.clearCache();
  }

  /**
   * Defines whether to render the code highlights or not.
   *
   * @param {Boolean} displayCodeHighlights Whether to render the code highlights or not
   */
  setDisplayCodeHighlights(displayCodeHighlights) {
    this.displayCodeHighlights = displayCodeHighlights;
    if (this.attached) {
      this.requestForcedUpdate();
    }
  }

  /**
   * A method used to measure the size of the MinimapElement and update internal components based on the new size.
   *
   * @param {boolean} visibilityChanged Did the visibility changed since last measurement
   * @param {[type]} [forceUpdate=true] Forces the update even when no changes were detected. Default is `true`
   * @access private
   */
  measureHeightAndWidth(visibilityChanged, forceUpdate = true) {
    if (!this.minimap) {
      return;
    }

    const safeFlexBasis = this.style.flexBasis;
    this.style.flexBasis = "";

    const wasResized = this.width !== this.clientWidth || this.height !== this.clientHeight;

    this.height = this.clientHeight;
    this.width = this.clientWidth;
    let canvasWidth = this.width;

    if (this.minimap != null) {
      this.minimap.setScreenHeightAndWidth(this.height, this.width);
    }

    if (wasResized || visibilityChanged || forceUpdate) {
      this.requestForcedUpdate();
    }

    if (!this.isVisible()) {
      return;
    }

    if (wasResized || forceUpdate) {
      if (this.adjustToSoftWrap) {
        const lineLength = atom.config.get("language.preferredLineLength");
        const softWrap = atom.config.get("language.softWrap");
        const softWrapAtPreferredLineLength = atom.config.get(
          "language.softWrapAtPreferredLineLength",
        );
        const width = lineLength * this.minimap.getCharWidth();

        if (softWrap && softWrapAtPreferredLineLength && lineLength && width <= this.width) {
          this.flexBasis = width;
          canvasWidth = width;
        } else {
          delete this.flexBasis;
        }
      } else {
        delete this.flexBasis;
      }

      this.updateCanvasesSize(canvasWidth);
    } else {
      this.style.flexBasis = safeFlexBasis;
    }
  }

  updateCanvasesSize(canvasWidth) {
    const devicePixelRatio = this.minimap.getDevicePixelRatio();
    const maxCanvasHeight = this.height + this.minimap.getLineHeight();
    const newHeight = maxCanvasHeight;
    const canvas = this.getFrontCanvas();

    if (canvasWidth == null) {
      canvasWidth = canvas.width / devicePixelRatio;
    }

    if (canvasWidth !== canvas.width || newHeight !== canvas.height) {
      this.setCanvasesSize(canvasWidth * devicePixelRatio, newHeight * devicePixelRatio);
      this.markers.invalidate();
    }
  }

  //    ######## ##     ## ######## ##    ## ########  ######
  //    ##       ##     ## ##       ###   ##    ##    ##    ##
  //    ##       ##     ## ##       ####  ##    ##    ##
  //    ######   ##     ## ######   ## ## ##    ##     ######
  //    ##        ##   ##  ##       ##  ####    ##          ##
  //    ##         ## ##   ##       ##   ###    ##    ##    ##
  //    ########    ###    ######## ##    ##    ##     ######

  /**
   * Callback triggered when the mouse is pressed on the MinimapElement canvas.
   *
   * @param {number} y The vertical coordinate of the event
   * @param {boolean} isLeftMouse Was the left mouse button pressed?
   * @param {boolean} isMiddleMouse Was the middle mouse button pressed?
   * @access private
   */
  canvasPressed({ y, isLeftMouse, isMiddleMouse }) {
    if (isLeftMouse) {
      this.canvasLeftMousePressed(y);
    } else if (isMiddleMouse) {
      this.canvasMiddleMousePressed(y);
      const { top, height } = this.visibleArea.getBoundingClientRect();
      this.startDrag({
        y: top + height / 2,
        isLeftMouse: false,
        isMiddleMouse: true,
      });
    }
  }

  /**
   * Callback triggered when the mouse left button is pressed on the MinimapElement canvas.
   *
   * @param {MouseEvent} e The mouse event object
   * @param {number} e.pageY The mouse y position in page
   * @param {HTMLElement} e.target The source of the event
   * @access private
   */
  canvasLeftMousePressed(y) {
    const deltaY = y - this.getBoundingClientRect().top;
    const row =
      Math.floor(deltaY / this.minimap.getLineHeight()) + this.minimap.getFirstVisibleScreenRow();

    const textEditorElement = this.minimap.getTextEditorElement();

    const textEditorScrollTop =
      textEditorElement.pixelPositionForScreenPosition([row, 0]).top -
      this.minimap.getTextEditorHeight() / 2;

    this.minimap.setTextEditorScrollTop(textEditorScrollTop);
  }

  /**
   * Callback triggered when the mouse middle button is pressed on the MinimapElement canvas.
   *
   * @param {MouseEvent} e The mouse event object
   * @param {number} e.pageY The mouse y position in page
   * @access private
   */
  canvasMiddleMousePressed(y) {
    const { top: offsetTop } = this.getBoundingClientRect();
    const deltaY = y - offsetTop - this.minimap.getTextEditorScaledHeight() / 2;

    const ratio =
      deltaY / (this.minimap.getVisibleHeight() - this.minimap.getTextEditorScaledHeight());

    this.minimap.setTextEditorScrollTop(ratio * this.minimap.getTextEditorMaxScrollTop());
  }

  /**
   * Subscribes to a media query for device pixel ratio changes and forces a repaint when it occurs.
   *
   * @returns {Disposable} A disposable to remove the media query listener
   * @access private
   */
  subscribeToMediaQuery() {
    const mediaQuery = window.matchMedia("screen and (-webkit-min-device-pixel-ratio: 1.5)");
    const mediaListener = () => {
      this.requestForcedUpdate();
    };
    mediaQuery.addEventListener("change", mediaListener);

    return new Disposable(() => {
      mediaQuery.removeEventListener("change", mediaListener);
    });
  }

  //    ########    ####    ########
  //    ##     ##  ##  ##   ##     ##
  //    ##     ##   ####    ##     ##
  //    ##     ##  ####     ##     ##
  //    ##     ## ##  ## ## ##     ##
  //    ##     ## ##   ##   ##     ##
  //    ########   ####  ## ########

  /**
   * A method triggered when the mouse is pressed over the visible area that starts the dragging gesture.
   *
   * @param {number} y The vertical coordinate of the event
   * @param {boolean} isLeftMouse Was the left mouse button pressed?
   * @param {boolean} isMiddleMouse Was the middle mouse button pressed?
   * @access private
   */
  startDrag({ y, isLeftMouse, isMiddleMouse }) {
    if (!this.minimap) {
      return;
    }
    if (!isLeftMouse && !isMiddleMouse) {
      return;
    }

    const initial = {
      dragOffset: y - this.visibleArea.getBoundingClientRect().top,
      offsetTop: this.getBoundingClientRect().top,
    };

    // TODO can we avoid adding and removing the listeners every time?

    const mousemoveHandler = (e) => this.drag(extractMouseEventData(e), initial);
    const dragendHandler = () => this.endDrag();

    const touchmoveHandler = (e) => this.drag(extractTouchEventData(e), initial);

    document.body.addEventListener("mousemove", mousemoveHandler, {
      passive: true,
    });
    document.body.addEventListener("mouseup", dragendHandler, {
      passive: true,
    });
    document.body.addEventListener("mouseleave", dragendHandler, {
      passive: true,
    });

    document.body.addEventListener("touchmove", touchmoveHandler, {
      passive: true,
    });
    document.body.addEventListener("touchend", dragendHandler, {
      passive: true,
    });
    document.body.addEventListener("touchcancel", dragendHandler, {
      passive: true,
    });

    this.dragSubscription = new Disposable(function () {
      document.body.removeEventListener("mousemove", mousemoveHandler);
      document.body.removeEventListener("mouseup", dragendHandler);
      document.body.removeEventListener("mouseleave", dragendHandler);

      document.body.removeEventListener("touchmove", touchmoveHandler);
      document.body.removeEventListener("touchend", dragendHandler);
      document.body.removeEventListener("touchcancel", dragendHandler);
    });
  }

  /**
   * The method called during the drag gesture.
   *
   * @param {number} y The vertical coordinate of the event
   * @param {boolean} isLeftMouse Was the left mouse button pressed?
   * @param {boolean} isMiddleMouse Was the middle mouse button pressed?
   * @param {number} initial.dragOffset The mouse offset within the visible area
   * @param {number} initial.offsetTop The MinimapElement offset at the moment of the drag start
   * @access private
   */
  drag({ y, isLeftMouse, isMiddleMouse }, initial) {
    if (!this.minimap) {
      return;
    }
    if (!isLeftMouse && !isMiddleMouse) {
      return;
    }
    const deltaY = y - initial.offsetTop - initial.dragOffset;

    const ratio =
      deltaY / (this.minimap.getVisibleHeight() - this.minimap.getTextEditorScaledHeight());

    this.minimap.setTextEditorScrollTop(ratio * this.minimap.getTextEditorMaxScrollTop());
  }

  /**
   * The method that ends the drag gesture.
   *
   * @access private
   */
  endDrag() {
    if (!this.minimap) {
      return;
    }
    this.dragSubscription.dispose();
  }
}

customElements.define(TAG_NAME, MinimapElement);

function createMinimapElement() {
  const element = document.createElement(TAG_NAME);
  element.createdCallback();
  return element;
}

//    ######## ##     ## ######## ##    ## ########  ######
//    ##       ##     ## ##       ###   ##    ##    ##    ##
//    ##       ##     ## ##       ####  ##    ##    ##
//    ######   ##     ## ######   ## ## ##    ##     ######
//    ##        ##   ##  ##       ##  ####    ##          ##
//    ##         ## ##   ##       ##   ###    ##    ##    ##
//    ########    ###    ######## ##    ##    ##     ######

/**
 * A method that extracts data from a `MouseEvent` which can then be used to process clicks and drags of the minimap.
 *
 * Used together with `extractTouchEventData` to provide a unified interface for `MouseEvent`s and `TouchEvent`s.
 *
 * @param {MouseEvent} mouseEvent The mouse event object
 * @access private
 */
function extractMouseEventData(mouseEvent) {
  return {
    x: mouseEvent.pageX,
    y: mouseEvent.pageY,
    isLeftMouse: mouseEvent.button === 0,
    isMiddleMouse: mouseEvent.button === 1,
  };
}

/**
 * A method that extracts data from a `TouchEvent` which can then be used to process clicks and drags of the minimap.
 *
 * Used together with `extractMouseEventData` to provide a unified interface for `MouseEvent`s and `TouchEvent`s.
 *
 * @param {TouchEvent} touchEvent The touch event object
 * @access private
 */
function extractTouchEventData(touchEvent) {
  // Use the first touch on the target area. Other touches will be ignored in
  // case of multi-touch.
  const touch = touchEvent.changedTouches[0];

  return {
    x: touch.pageX,
    y: touch.pageY,
    isLeftMouse: true, // Touch is treated like a left mouse button click
    isMiddleMouse: false,
  };
}

//     ######   ######   ######
//    ##    ## ##    ## ##    ##
//    ##       ##       ##
//    ##        ######   ######
//    ##             ##       ##
//    ##    ## ##    ## ##    ##
//     ######   ######   ######

/**
 * Applies the passed-in styles properties to the specified element
 *
 * @param {HTMLElement} element The element onto which apply the styles
 * @param {Object} styles The styles to apply
 * @access private
 */
function applyStyles(element, styles) {
  if (!element) {
    return;
  }

  let cssText = "";
  for (const property in styles) {
    cssText += `${property}: ${styles[property]}; `;
  }

  element.style.cssText = cssText;
}

/**
 * Returns a string with a CSS translation tranform value.
 *
 * @param {number} [x=0] The x offset of the translation. Default is `0`
 * @param {number} [y=0] The y offset of the translation. Default is `0`
 * @param {boolean} [useHardwareAcceleration=false] Use hardware acceleration. Default is `false`
 * @returns {string} The CSS translation string
 * @access private
 */
function makeTranslate(x = 0, y = 0, useHardwareAcceleration = false) {
  if (useHardwareAcceleration) {
    return `translate3d(${x}px, ${y}px, 0)`;
  } else {
    return `translate(${x}px, ${y}px)`;
  }
}

/**
 * Returns a string with a CSS scaling tranform value.
 *
 * @param {number} [x=0] The x scaling factor. Default is `0`
 * @param {number} [y=0] The y scaling factor. Default is `0`
 * @param {boolean} [useHardwareAcceleration=false] Use hardware acceleration. Default is `false`
 * @returns {string} The CSS scaling string
 * @access private
 */
function makeScale(x = 0, y = x, useHardwareAcceleration = false) {
  if (useHardwareAcceleration) {
    return `scale3d(${x}, ${y}, 1)`;
  } else {
    return `scale(${x}, ${y})`;
  }
}

module.exports = { createMinimapElement };
