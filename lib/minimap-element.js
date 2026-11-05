const { CompositeDisposable, Disposable } = require("lumine");

const CanvasDrawer = require("./canvas-drawer");
const { subscribeTo } = require("./event-helpers");

const SPEC_MODE = lumine.window.isSpecMode();
const TAG_NAME = "lumine-text-editor-minimap";
const appliedStyles = new WeakMap();

/**
 * Public: The MinimapElement is the view meant to render a {@link Minimap} instance in the DOM.
 *
 * You can retrieve the MinimapElement associated to a Minimap using the `lumine.views.getView` method.
 *
 * Note that most interactions with the Minimap package is done through the Minimap model so you should never have to
 * access MinimapElement instances.
 *
 * @example Let minimapElement = lumine.views.getView(minimap)
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
    this.destroyed = false;
    this.attachmentSubscriptions = null;
    /** @access private */
    this.visibleAreaSubscription = undefined;
    /** @access private */
    this.dragSubscription = undefined;

    // Configs

    /** @access private */
    this.displayMinimapOnLeft = undefined;
    /** @access private */
    this.textOpacity = undefined;
    /** @access private */
    this.displayCodeHighlights = undefined;
    /** @access private */
    this.useHardwareAcceleration = undefined;
    // Elements

    /** @access private */
    this.visibleArea = undefined;

    // States

    /** @access private */
    this.attached = undefined;
    /** @access private */

    // Other

    /** @access private */
    this.offscreenFirstRow = undefined;
    /** @access private */
    this.offscreenLastRow = undefined;
    /** @access private */
    this.frameRequested = undefined;
    this.pendingMarkerUpdate = null;

    this.initializeContent();

    this.subscriptions.add(
      lumine.config.observe("minimap.displayMinimapOnLeft", (displayMinimapOnLeft) => {
        this.finishWidthResize(false);
        this.displayMinimapOnLeft = displayMinimapOnLeft;

        this.updateMinimapFlexPosition();
        this.measureHeightAndWidth(true, true);
      }),

      lumine.config.observe("minimap.textOpacity", (textOpacity) => {
        this.textOpacity = textOpacity;

        if (this.attached) {
          this.requestForcedUpdate();
        }
      }),

      lumine.config.observe("minimap.displayCodeHighlights", (displayCodeHighlights) => {
        this.displayCodeHighlights = displayCodeHighlights;

        if (this.attached) {
          this.requestForcedUpdate();
        }
      }),

      lumine.config.observe("minimap.width", (width) => {
        this.configuredWidth = width;
        if (!this.widthResize) this.applyWidth(width, true);
      }),

      lumine.config.observe("minimap.useHardwareAcceleration", (useHardwareAcceleration) => {
        this.useHardwareAcceleration = useHardwareAcceleration;

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
    if (this.destroyed || !this.minimap || this.attached) return;
    const window = this.ownerDocument.defaultView;
    const owner = (this.attachmentSubscriptions = new CompositeDisposable());
    this.attached = true;
    const owns = () => !this.destroyed && this.attachmentSubscriptions === owner && this.attached;
    const intersectionObserver = new window.IntersectionObserver((entries) => {
      if (!owns() || entries.length === 0) return;
      const { intersectionRect } = entries[entries.length - 1];
      if (intersectionRect.width > 0 || intersectionRect.height > 0) {
        this.measureHeightAndWidth(true, true);
      }
    });

    this.intersectionObserver = intersectionObserver;
    owner.add(new Disposable(() => intersectionObserver.disconnect()));
    if (!owns()) return;
    intersectionObserver.observe(this);
    if (this.isVisible()) {
      this.measureHeightAndWidth(true, true);
    }

    const measureDimensions = () => {
      if (!owns()) return;
      this.measureHeightAndWidth(false, false);
    };
    const resizeObserver = new window.ResizeObserver(measureDimensions);
    owner.add(new Disposable(() => resizeObserver.disconnect()));
    if (!owns()) return;
    resizeObserver.observe(this);
    window.addEventListener("resize", measureDimensions, { passive: true });

    owner.add(
      new Disposable(() => {
        window.removeEventListener("resize", measureDimensions);
      }),
    );

    this.measureHeightAndWidth();
    this.updateMinimapFlexPosition();
    this.minimap
      .getTextEditorElement()
      .setAttribute("with-minimap", this.displayMinimapOnLeft ? "left" : "right");

    owner.add(this.subscribeToMediaQuery(owner));
  }

  /**
   * Preserve attachment ownership while an editor moves between connected panes.
   *
   * @access private
   */
  connectedMoveCallback() {
    if (!this.destroyed && this.attached) {
      this.measureHeightAndWidth(true, true);
    }
  }

  /** DOM callback invoked when a MinimapElement is detached from the DOM. */
  disconnectedCallback() {
    this.finishWidthResize(false);
    this.minimap?.getTextEditor?.()?.requestHighlightingForScreenRows?.(this, 0, 0);
    this.attached = false;
    this.cancelMarkerUpdate();
    this.frameWindow?.cancelAnimationFrame(this.requestedFrame);
    this.requestedFrame = null;
    this.frameRequested = false;
    const owner = this.attachmentSubscriptions;
    this.attachmentSubscriptions = null;
    owner?.dispose();
    this.endDrag();
    if (!this.minimap) return;
    const editor = this.minimap.getTextEditorElement();
    if (!editor.querySelector(TAG_NAME)) editor.removeAttribute("with-minimap");
  }

  adoptedCallback() {
    this.finishWidthResize(false);
    this.cancelMarkerUpdate();
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
   * Attaches the MinimapElement into its text editor.
   *
   * Which side it lands on is the `displayMinimapOnLeft` setting; the element
   * only ever lives inside the editor it maps.
   */
  attach() {
    if (this.destroyed || this.attached) {
      return;
    }

    const container = this.minimap.getTextEditorElement();
    const minimaps = container.querySelectorAll(TAG_NAME);
    if (minimaps.length) {
      Array.prototype.forEach.call(minimaps, (el) => {
        el.destroy();
        try {
          container.removeChild(el);
        } catch {
          // TODO: ignore for now
          // https://github.com/lumine-minimap/minimap/issues/766#issuecomment-762496374
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
    // The config observers this runs from are registered in `createdCallback`,
    // which is before `setModel`: the first call has no editor to mark yet, and
    // `connectedCallback` sets the attribute once there is one.
    if (!this.minimap) {
      return;
    }
    this.minimap
      .getTextEditorElement()
      .setAttribute("with-minimap", this.displayMinimapOnLeft ? "left" : "right");
  }

  /** Destroys this MinimapElement */
  destroy() {
    if (this.destroyed) return;
    this.finishWidthResize(false);
    this.minimap?.getTextEditor?.()?.requestHighlightingForScreenRows?.(this, 0, 0);
    this.destroyed = true;
    this.cancelMarkerUpdate();
    this.frameWindow?.cancelAnimationFrame(this.requestedFrame);
    this.requestedFrame = null;
    this.frameRequested = false;
    this.endDrag();
    this.subscriptions.dispose();
    this.detach();
    this.attachmentSubscriptions?.dispose();
    this.attachmentSubscriptions = null;
    this.markers?.destroy();
    this.markers = null;
    this.tokenRasterCache?.clear();
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

    const canvases = this.ownerDocument.createElement("div");
    canvases.className = "minimap-canvases";
    this.appendChild(canvases);
    this.attachCanvases(canvases);

    this.createVisibleArea();
    this.createResizeHandle();

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

  createResizeHandle() {
    this.resizeHandle = this.ownerDocument.createElement("div");
    this.resizeHandle.className = "minimap-resize-handle";
    this.resizeHandle.setAttribute("role", "separator");
    this.resizeHandle.setAttribute("aria-orientation", "vertical");
    this.resizeHandle.setAttribute("aria-label", "Resize minimap");
    this.resizeHandle.setAttribute("aria-valuemin", "1");
    this.resizeHandle.tabIndex = 0;
    this.appendChild(this.resizeHandle);
    this.subscriptions.add(
      subscribeTo(this.resizeHandle, {
        pointerdown: (event) => this.startWidthResize(event),
        lostpointercapture: () => this.finishWidthResize(false),
        keydown: (event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          event.stopPropagation();
          this.finishWidthResize(false);
          const direction = this.displayMinimapOnLeft ? 1 : -1;
          const delta = (event.key === "ArrowRight" ? 10 : -10) * direction;
          lumine.config.set("minimap.width", this.constrainWidth(this.configuredWidth + delta));
        },
      }),
    );
  }

  applyWidth(width, measure = false) {
    this.style.setProperty("--minimap-width", `${width}px`);
    this.resizeHandle.setAttribute("aria-valuenow", String(width));
    if (measure && this.attached) this.measureHeightAndWidth();
  }

  constrainWidth(width) {
    const editorWidth = this.minimap.getTextEditorElement().getBoundingClientRect().width;
    return Math.round(Math.max(1, Math.min(Math.max(1, editorWidth - 40), width)));
  }

  startWidthResize(event) {
    if (this.destroyed || !this.attached || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    this.finishWidthResize(false);
    const document = this.ownerDocument;
    const window = document.defaultView;
    const resize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: this.getBoundingClientRect().width,
      width: this.configuredWidth,
      direction: this.displayMinimapOnLeft ? 1 : -1,
      window,
      frame: null,
      layout: lumine.workspace.beginLayoutDrag(),
    };
    this.widthResize = resize;
    this.classList.add("resizing");
    const move = (event) => {
      if (this.widthResize !== resize || event.pointerId !== resize.pointerId) return;
      event.preventDefault();
      if ((event.buttons & 1) === 0) return this.finishWidthResize(true);
      resize.width = this.constrainWidth(
        resize.startWidth + (event.clientX - resize.startX) * resize.direction,
      );
      if (resize.frame != null) return;
      resize.frame = window.requestAnimationFrame(() => {
        resize.frame = null;
        if (this.widthResize === resize) this.applyWidth(resize.width);
      });
    };
    const end = (event) => {
      if (event.pointerId === resize.pointerId) this.finishWidthResize(event.type === "pointerup");
    };
    resize.events = new CompositeDisposable(
      subscribeTo(document, { pointermove: move, pointerup: end, pointercancel: end }, true),
      subscribeTo(
        document,
        {
          keydown: (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            this.finishWidthResize(false);
          },
        },
        true,
      ),
      subscribeTo(window, { blur: () => this.finishWidthResize(false) }),
    );
    try {
      this.resizeHandle.setPointerCapture(resize.pointerId);
    } catch {
      // Synthetic pointer events have no active pointer to capture.
    }
  }

  finishWidthResize(commit) {
    const resize = this.widthResize;
    if (!resize) return;
    this.widthResize = null;
    resize.window.cancelAnimationFrame(resize.frame);
    resize.events.dispose();
    this.classList.remove("resizing");
    if (this.resizeHandle.hasPointerCapture(resize.pointerId))
      this.resizeHandle.releasePointerCapture(resize.pointerId);
    try {
      if (commit) lumine.config.set("minimap.width", resize.width);
      this.applyWidth(this.configuredWidth, true);
    } finally {
      resize.layout.dispose();
    }
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

    this.visibleArea = this.ownerDocument.createElement("div");
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
    if (this.minimap && this.minimap !== minimap)
      this.minimap.getTextEditor()?.requestHighlightingForScreenRows?.(this, 0, 0);
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
          this.measureHeightAndWidth();
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
    if (this.destroyed || this.frameRequested) {
      return;
    }

    this.frameRequested = true;
    this.frameWindow = this.ownerDocument.defaultView;
    this.requestedFrame = this.frameWindow.requestAnimationFrame(() => {
      this.requestedFrame = null;
      if (!this.destroyed) this.update();
      this.frameRequested = false;
    });
  }

  // Marker items are published in the shared document read phase. Paint just
  // their canvas after the remaining reads, without delaying the result by
  // another animation frame or advancing the token and viewport schedules.
  requestMarkerUpdate() {
    if (this.destroyed || !this.attached || this.pendingMarkerUpdate) return;
    const document = this.ownerDocument;
    const read = lumine.views.readDocument(() => {
      if (this.pendingMarkerUpdate !== read) return;
      const paint = lumine.views.updateDocument(() => {
        if (this.pendingMarkerUpdate !== paint) return;
        this.pendingMarkerUpdate = null;
        if (
          this.destroyed ||
          !this.attached ||
          this.ownerDocument !== document ||
          !this.layoutVisible ||
          !this.minimap ||
          this.offscreenFirstRow == null ||
          this.offscreenLastRow == null
        )
          return;
        this.drawMarkers(
          this.offscreenFirstRow,
          this.offscreenLastRow,
          this.minimap.getLineHeight(),
        );
      });
      this.pendingMarkerUpdate = paint;
    });
    this.pendingMarkerUpdate = read;
  }

  cancelMarkerUpdate() {
    this.pendingMarkerUpdate?.dispose();
    this.pendingMarkerUpdate = null;
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
    if (this.destroyed || !(this.attached && this.layoutVisible && this.minimap)) {
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

    {
      const scale = 1 / devicePixelRatio;
      const canvasTransform = makeScale(scale, scale, this.useHardwareAcceleration);
      applyStyles(this.tokensLayer.canvas, { transform: canvasTransform });
    }

    this.updateCanvas();
    // Raster rows are cached at whole-row origins. Carry the remaining
    // fraction on their shared container so tokens and markers glide together
    // instead of stepping a whole minimap row at a time.
    const canvasOffset = this.offscreenFirstRow * minimap.getLineHeight() - minimap.getScrollTop();
    applyStyles(this.canvasesContainer, {
      transform: makeTranslate(0, canvasOffset, this.useHardwareAcceleration),
    });
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
    if (this.destroyed || !this.minimap) {
      return;
    }

    const width = this.clientWidth;
    const height = this.clientHeight;

    const wasResized = this.width !== width || this.height !== height;
    const pixelRatioChanged =
      this.canvasDevicePixelRatio !== this.minimap.getDevicePixelRatio() ||
      this.canvasWindowPixelRatio !== this.ownerDocument.defaultView.devicePixelRatio;

    this.height = height;
    this.width = width;
    this.layoutVisible = this.width > 0 || this.height > 0;

    if (this.minimap != null) {
      this.minimap.setScreenHeightAndWidth(this.height, this.width);
    }

    if (wasResized || pixelRatioChanged || visibilityChanged || forceUpdate) {
      this.requestForcedUpdate();
    }

    if (!this.isVisible()) {
      return;
    }

    if (wasResized || pixelRatioChanged || forceUpdate) {
      this.updateCanvasesSize(this.width);
    }
  }

  updateCanvasesSize(canvasWidth) {
    const devicePixelRatio = this.minimap.getDevicePixelRatio();
    this.canvasDevicePixelRatio = devicePixelRatio;
    this.canvasWindowPixelRatio = this.ownerDocument.defaultView.devicePixelRatio;
    const maxCanvasHeight = this.height + this.minimap.getLineHeight();
    const newHeight = maxCanvasHeight;
    const canvas = this.getFrontCanvas();

    if (canvasWidth == null) {
      canvasWidth = canvas.width / devicePixelRatio;
    }

    const pixelWidth = Math.trunc(canvasWidth * devicePixelRatio);
    const pixelHeight = Math.trunc(newHeight * devicePixelRatio);
    if (pixelWidth !== canvas.width || pixelHeight !== canvas.height) {
      this.setCanvasesSize(pixelWidth, pixelHeight);
      this.markers?.invalidate();
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
    const row = Math.floor((deltaY + this.minimap.getScrollTop()) / this.minimap.getLineHeight());

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
  subscribeToMediaQuery(owner) {
    const mediaQuery = this.ownerDocument.defaultView.matchMedia(
      "screen and (-webkit-min-device-pixel-ratio: 1.5)",
    );
    const mediaListener = () => {
      if (this.destroyed || this.attachmentSubscriptions !== owner) return;
      this.measureHeightAndWidth(false, true);
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
    if (this.destroyed || !this.minimap) {
      return;
    }
    if (!isLeftMouse && !isMiddleMouse) {
      return;
    }
    this.endDrag();

    const initial = {
      dragOffset: y - this.visibleArea.getBoundingClientRect().top,
      offsetTop: this.getBoundingClientRect().top,
    };

    const document = this.ownerDocument;

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
    if (this.destroyed || !this.minimap) {
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
    const subscription = this.dragSubscription;
    this.dragSubscription = null;
    subscription?.dispose();
  }
}

if (!customElements.get(TAG_NAME)) customElements.define(TAG_NAME, MinimapElement);

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

  const previous = appliedStyles.get(element);
  // CSSOM normalizes transforms and whitespace. Remember both forms so an
  // unchanged frame avoids an attribute mutation, but external inline edits
  // still get reconciled on the next update.
  if (previous?.requested === cssText && element.style.cssText === previous.applied) return;
  element.style.cssText = cssText;
  appliedStyles.set(element, { requested: cssText, applied: element.style.cssText });
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
