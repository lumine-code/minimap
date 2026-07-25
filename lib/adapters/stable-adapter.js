/** @babel */

/** @access private */
export default class StableAdapter {
  constructor(textEditor) {
    this.textEditor = textEditor;
    this.textEditorElement = atom.views.getView(this.textEditor);
  }

  enableCache() {
    this.useCache = true;
  }

  clearCache() {
    this.useCache = false;
    delete this.heightCache;
    delete this.scrollTopCache;
    delete this.scrollLeftCache;
    delete this.maxScrollTopCache;
  }

  onDidChangeScrollTop(callback) {
    return this.textEditorElement.onDidChangeScrollTop(callback);
  }

  onDidChangeScrollLeft(callback) {
    return this.textEditorElement.onDidChangeScrollLeft(callback);
  }

  getHeight() {
    if (this.editorDestroyed()) {
      return 0;
    }

    if (this.useCache) {
      if (!this.heightCache) {
        this.heightCache = this.textEditorElement.getHeight();
      }
      return this.heightCache;
    }
    return this.textEditorElement.getHeight();
  }

  getScrollTop() {
    if (this.editorDestroyed()) {
      return 0;
    }

    if (this.useCache) {
      if (!this.scrollTopCache) {
        this.scrollTopCache = this.computeScrollTop();
      }
      return this.scrollTopCache;
    }
    return this.computeScrollTop();
  }

  computeScrollTop() {
    if (this.editorDestroyed()) {
      return 0;
    }

    const scrollTop = this.textEditorElement.getScrollTop();
    const lineHeight = this.textEditor.getLineHeightInPixels();
    let firstRow = this.textEditorElement.getFirstVisibleScreenRow();

    if (Number.isNaN(firstRow)) {
      return 0;
    }

    const component = this.textEditorElement.component;
    if (!component || !component.renderedScreenLineForRow(firstRow)) {
      return scrollTop;
    }

    let lineTop = this.textEditorElement.pixelPositionForScreenPosition([firstRow, 0]).top;

    if (lineTop > scrollTop) {
      firstRow -= 1;
      if (!component.renderedScreenLineForRow(firstRow)) {
        return scrollTop;
      }
      lineTop = this.textEditorElement.pixelPositionForScreenPosition([firstRow, 0]).top;
    }

    const lineY = firstRow * lineHeight;
    const offset = Math.min(scrollTop - lineTop, lineHeight);
    return lineY + offset;
  }

  setScrollTop(scrollTop) {
    if (this.editorDestroyed()) {
      return;
    }

    this.textEditorElement.setScrollTop(scrollTop);
  }

  getScrollLeft() {
    if (this.editorDestroyed()) {
      return 0;
    }

    if (this.useCache) {
      if (!this.scrollLeftCache) {
        this.scrollLeftCache = this.textEditorElement.getScrollLeft();
      }
      return this.scrollLeftCache;
    }
    return this.textEditorElement.getScrollLeft();
  }

  getMaxScrollTop() {
    if (this.editorDestroyed()) {
      return 0;
    }

    if (this.maxScrollTopCache != null && this.useCache) {
      return this.maxScrollTopCache;
    }

    // Use the raw value from the editor, which already includes the extra scroll space
    // added by the scrollPastEnd setting. No compensation is applied here: the
    // minimap scroll ratio uses this as its denominator, so the minimap proportionally
    // tracks the full scroll range and only reaches its own maximum when the editor
    // is fully in the scroll-past-end zone (last line at the top of the viewport).
    const maxScrollTop = this.textEditorElement.getMaxScrollTop
      ? this.textEditorElement.getMaxScrollTop()
      : this.textEditorElement.getScrollHeight() - this.getHeight();

    if (this.useCache) {
      this.maxScrollTopCache = maxScrollTop;
    }

    return maxScrollTop;
  }

  editorDestroyed() {
    return (
      !this.textEditor ||
      this.textEditor.isDestroyed() ||
      !this.textEditorElement.component ||
      !this.textEditorElement.getModel() ||
      !this.textEditorElement.parentNode
    );
  }
}
