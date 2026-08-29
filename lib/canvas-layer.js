/** @access private */
class CanvasLayer {
  constructor(document) {
    if (!document?.defaultView) {
      throw new TypeError("CanvasLayer requires a live Document");
    }
    /**
     * The onscreen canvas.
     *
     * @type {HTMLCanvasElement}
     */
    this.canvas = document.createElement("canvas");

    const desynchronized = false; // TODO Electron 9 has color issues #786

    /**
     * The onscreen canvas context.
     *
     * @type {CanvasRenderingContext2D}
     */
    this.context = this.canvas.getContext("2d", { desynchronized });
    this.canvas.webkitImageSmoothingEnabled = false;
    this.context.imageSmoothingEnabled = false;

    /**
     * The offscreen canvas.
     *
     * @type {HTMLCanvasElement}
     * @access private
     */
    this.desynchronized = desynchronized;
    this.createOffscreenCanvas(document);
  }

  createOffscreenCanvas(document) {
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenContext = this.offscreenCanvas.getContext("2d", {
      desynchronized: this.desynchronized,
    });
    this.offscreenCanvas.webkitImageSmoothingEnabled = false;
    this.offscreenContext.imageSmoothingEnabled = false;
  }

  setDocument(document) {
    if (this.canvas.ownerDocument !== document) {
      throw new Error("The visible minimap canvas must be adopted before its surface is rebound");
    }
    if (this.offscreenCanvas.ownerDocument === document) return;
    this.createOffscreenCanvas(document);
    this.resetOffscreenSize();
  }

  attach(parent) {
    if (this.canvas.parentNode) {
      return;
    }

    parent.appendChild(this.canvas);
  }

  setSize(width = 0, height = 0) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.context.imageSmoothingEnabled = false;
    this.resetOffscreenSize();
  }

  getSize() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  resetOffscreenSize() {
    this.offscreenCanvas.width = this.canvas.width;
    this.offscreenCanvas.height = this.canvas.height;
    this.offscreenContext.imageSmoothingEnabled = false;
  }

  copyToOffscreen() {
    if (this.canvas.width > 0 && this.canvas.height > 0) {
      this.offscreenContext.drawImage(this.canvas, 0, 0);
    }
  }

  copyFromOffscreen() {
    if (this.offscreenCanvas.width > 0 && this.offscreenCanvas.height > 0) {
      this.context.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  copyPartFromOffscreen(srcY, destY, height) {
    if (this.offscreenCanvas.width > 0 && this.offscreenCanvas.height > 0) {
      this.context.drawImage(
        this.offscreenCanvas,
        0,
        srcY,
        this.offscreenCanvas.width,
        height,
        0,
        destY,
        this.offscreenCanvas.width,
        height,
      );
    }
  }

  clearCanvas() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

module.exports = CanvasLayer;
