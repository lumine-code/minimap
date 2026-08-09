const markerLayers = require("./marker-layers");
const { styleReader } = require("./style-reader");
const CanvasLayer = require("./canvas-layer");

const regexEscape = /[$()*+./?[\\\]^{|}-]/g;

function escapeRegExp(string) {
  return string ? string.replace(regexEscape, "\\$&") : "";
}

const SPEC_MODE = atom.window.isSpecMode();

/**
 * `CanvasDrawer` is responsible for the rendering of a `Minimap` in a `canvas` element.
 *
 * It is the base class of `MinimapElement`, which supplies the model and the display settings the
 * drawing reads.
 */
class CanvasDrawer extends HTMLElement {
  /** Initializes the canvas elements needed to perform the `Minimap` rendering. */
  initializeCanvas() {
    if (SPEC_MODE) {
      // A spy target: updateTokensLayer draws the lines itself, and a spec that
      // wants to know a draw happened has nothing else to hang a spy on.
      this.drawLines = () => {};
    }

    /**
     * The main canvas layer where lines are rendered.
     *
     * @type {CanvasLayer}
     */
    this.tokensLayer = new CanvasLayer();

    /**
     * The marker layers other packages provide, drawn under the text. Created
     * lazily by `ensureMarkers`: the canvas machinery arrives through the
     * marker hub's service, which is wired only after activation -- and the
     * first elements are built during it.
     *
     * @type {MarkerCanvas | null}
     */
    this.markers = null;
    // Seeded empty rather than undefined: with no probes yet the digest is the
    // empty string, and an unseeded field would read that as a change and force
    // a redraw on the first unrelated stylesheet the window attaches.
    this.markerSignature = "";

    if (!this.pendingChanges) {
      /**
       * Stores the changes from the text editor.
       *
       * @type {Object[]}
       * @access private
       */
      this.pendingChanges = [];
    }

    // the maximum number of tokens to render in one line
    this.maxTokensInOneLine = atom.config.get("minimap.maxTokensInOneLine");
  }

  /**
   * Returns the uppermost canvas in the MinimapElement.
   *
   * @returns {HTMLCanvasElement} The html canvas element
   */
  getFrontCanvas() {
    return this.tokensLayer.canvas;
  }

  /**
   * Attaches the canvases into the specified container.
   *
   * @param {HTMLElement} parent The canvases' container
   * @access private
   */
  attachCanvases(parent) {
    this.canvasesContainer = parent;
    this.ensureMarkers();
    this.tokensLayer.attach(parent);
  }

  /**
   * Builds the marker canvas once the hub's toolkit is available.
   *
   * Inserted before the tokens canvas, so the markers sit under the code rather
   * than over it: they are absolutely positioned siblings, and document order
   * is what stacks them.
   *
   * @returns {MarkerCanvas | null}
   * @access private
   */
  ensureMarkers() {
    if (!this.markers && this.canvasesContainer) {
      this.markers = markerLayers.createMarkerCanvas({ className: "minimap-markers" });
      if (this.markers) {
        this.canvasesContainer.insertBefore(
          this.markers.element,
          this.canvasesContainer.firstChild,
        );
      }
    }
    return this.markers;
  }

  /**
   * Changes the size of all the canvas layers at once.
   *
   * @param {number} width The new width for the three canvases
   * @param {number} height The new height for the three canvases
   * @access private
   */
  setCanvasesSize(width, height) {
    this.tokensLayer.setSize(width, height);
  }

  /** Performs an update of the rendered `Minimap` based on the changes registered in the instance. */
  updateCanvas() {
    const firstRow = this.minimap.getFirstVisibleScreenRow();
    const lastRow = this.minimap.getLastVisibleScreenRow();

    const devicePixelRatio = this.minimap.getDevicePixelRatio();
    const lineHeight = this.minimap.getLineHeight() * devicePixelRatio;
    const charHeight = this.minimap.getCharHeight() * devicePixelRatio;
    const charWidth = this.minimap.getCharWidth() * devicePixelRatio;
    const { width: canvasWidth } = this.tokensLayer.getSize();
    const editor = this.minimap.getTextEditor();
    const editorElement = this.minimap.getTextEditorElement();

    // TODO avoid closure: https://stackoverflow.com/a/46256398/7910299
    const getTokenColorClosure = this.displayCodeHighlights
      ? (scopes) => getTokenColor(scopes, editorElement, this.textOpacity)
      : () => getDefaultColor(editorElement, this.textOpacity);

    updateTokensLayer(
      this.tokensLayer,
      firstRow,
      lastRow,
      this.offscreenFirstRow,
      this.offscreenLastRow,
      this.pendingChanges,
      lineHeight,
      charHeight,
      charWidth,
      canvasWidth,
      editor,
      editor.getScreenLineCount(),
      getInvisibleRegExp(editor),
      getTokenColorClosure,
      this.maxTokensInOneLine,
    );

    if (SPEC_MODE) {
      // call the spy for drawLines which is used inside updateTokensLayer
      this.drawLines(firstRow, lastRow);
    }

    this.drawMarkers(firstRow, lastRow, lineHeight / devicePixelRatio);

    this.pendingChanges = [];

    /**
     * The first row in the last render of the offscreen canvas.
     *
     * @type {number}
     * @access private
     */
    this.offscreenFirstRow = firstRow;
    /**
     * The last row in the last render of the offscreen canvas.
     *
     * @type {number}
     * @access private
     */
    this.offscreenLastRow = lastRow;
  }

  /**
   * Draws the marker layers for the visible rows.
   *
   * A layer speaks in screen rows, and a minimap row is a fixed height, so a
   * range is one rectangle rather than one per row. Colours, widths and
   * stacking come from the same style probe scrollmap uses, which is what lets
   * a layer package ship one stylesheet for both maps.
   *
   * @param {number} firstRow The first visible screen row
   * @param {number} lastRow The last visible screen row
   * @param {number} lineHeight The height of a row in CSS pixels
   * @access private
   */
  drawMarkers(firstRow, lastRow, lineHeight) {
    const markers = this.ensureMarkers();
    const width = this.width;
    const height = this.height + lineHeight;
    if (!markers || !(width > 0) || !(height > 0)) {
      return;
    }

    const regions = [];
    for (const layer of markerLayers.enabledLayersFor(this.minimap.getTextEditor())) {
      for (const item of layer.items) {
        const start = item.row;
        const end = item.end ?? item.row;
        if (end < firstRow || start > lastRow) {
          continue;
        }
        const top = Math.max(start, firstRow);
        const bottom = Math.min(end, lastRow);
        regions.push({
          y: (top - firstRow) * lineHeight,
          height: (bottom - top + 1) * lineHeight,
          className: markerLayers.classNameFor(layer.props, item),
        });
      }
    }

    markers.draw(regions, width, height);
  }

  /**
   * Whether the marker styles would draw differently than they last did.
   *
   * Re-reads the probes without writing the cache, so a stylesheet that never
   * touched a marker costs a layout read and nothing else.
   *
   * @returns {boolean}
   * @access private
   */
  markerStylesChanged() {
    if (!this.markers) {
      return false;
    }
    const signature = this.markers.signature(this.width, this.height);
    if (signature === this.markerSignature) {
      return false;
    }
    this.markerSignature = signature;
    return true;
  }

  //    ########  ########     ###    ##      ##
  //    ##     ## ##     ##   ## ##   ##  ##  ##
  //    ##     ## ##     ##  ##   ##  ##  ##  ##
  //    ##     ## ########  ##     ## ##  ##  ##
  //    ##     ## ##   ##   ######### ##  ##  ##
  //    ##     ## ##    ##  ##     ## ##  ##  ##
  //    ########  ##     ## ##     ##  ###  ###

  /**
   * Routine used to render changes in specific ranges for one layer.
   *
   * @param {CanvasLayer} layer The layer to redraw
   * @param {Object[]} intactRanges An array of the ranges to leave intact
   * @param {number} firstRow FirstRow the first row of the range to update
   * @param {number} lastRow LastRow the last row of the range to update
   * @param {Function} method The render method to use for the lines drawing
   * @access private Unused (inlined the code for performance reasons)
   */
  // redrawRangesOnLayer (layer, intactRanges, firstRow, lastRow, method) {
  //   const devicePixelRatio = this.minimap.getDevicePixelRatio()
  //   const lineHeight = this.minimap.getLineHeight() * devicePixelRatio
  //
  //   layer.clearCanvas()
  //
  //   if (intactRanges.length === 0) {
  //     method.call(this, firstRow, lastRow, 0)
  //   } else {
  //     for (let j = 0, len = intactRanges.length; j < len; j++) {
  //       const intact = intactRanges[j]
  //
  //       layer.copyPartFromOffscreen(
  //         intact.offscreenRow * lineHeight,
  //         (intact.start - firstRow) * lineHeight,
  //         (intact.end - intact.start) * lineHeight
  //       )
  //     }
  //     drawLinesForRanges(method, intactRanges, firstRow, lastRow)
  //   }
  //
  //   layer.resetOffscreenSize()
  //   layer.copyToOffscreen()
  // }

  /**
   * Renders the lines between the intact ranges when an update has pending changes.
   *
   * @param {Function} method The render method to use for the lines drawing
   * @param {Object[]} intactRanges The intact ranges in the minimap
   * @param {number} firstRow The first row of the rendered region
   * @param {number} lastRow The last row of the rendered region
   * @access private Unused (inlined the code for performance reasons)
   */
  // drawLinesForRanges (method, ranges, firstRow, lastRow) {
  //   let currentRow = firstRow
  //   for (let i = 0, len = ranges.length; i < len; i++) {
  //     const range = ranges[i]
  //
  //     method.call(this, currentRow, range.start, currentRow - firstRow)
  //
  //     currentRow = range.end
  //   }
  //   if (currentRow <= lastRow) {
  //     method.call(this, currentRow, lastRow, currentRow - firstRow)
  //   }
  // }
}

//    ########  ########     ###    ##      ##
//    ##     ## ##     ##   ## ##   ##  ##  ##
//    ##     ## ##     ##  ##   ##  ##  ##  ##
//    ##     ## ########  ##     ## ##  ##  ##
//    ##     ## ##   ##   ######### ##  ##  ##
//    ##     ## ##    ##  ##     ## ##  ##  ##
//    ########  ##     ## ##     ##  ###  ###

/**
 * Performs an update of the tokens layer using the pending changes array.
 *
 * @param {CanvasLayer} tokensLayer
 * @param {number} firstRow FirstRow the first row of the range to update
 * @param {number} lastRow LastRow the last row of the range to update
 * @param {number} offscreenFirstRow
 * @param {number} offscreenLastRow
 * @param {Array<>} pendingChanges
 * @param {number} lineHeight This.minimap.getLineHeight() * devicePixelRatio
 * @param {number} charHeight This.minimap.getCharHeight() * devicePixelRatio
 * @param {number} charWidth This.minimap.getCharWidth() * devicePixelRatio
 * @param {number} canvasWidth This.tokensLayer.getSize().width
 * @param {TextEditor} editor This.minimap.getTextEditor()
 * @param {(t: Token) => string} getTokenColorClosure
 * @param {number} maxTokensInOneLine This.maxTokensInOneLine
 * @access private
 */
function updateTokensLayer(
  tokensLayer,
  firstRow,
  lastRow,
  offscreenFirstRow,
  offscreenLastRow,
  pendingChanges,
  lineHeight,
  charHeight,
  charWidth,
  canvasWidth,
  editor,
  editorScreenLineCount,
  invisibleRegExp,
  getTokenColorClosure,
  maxTokensInOneLine,
) {
  // NOTE: this method is the hot function of Minimap. Do not refactor. The code is inlined delibarately.

  const intactRanges = computeIntactRanges(
    firstRow,
    lastRow,
    pendingChanges,
    offscreenFirstRow,
    offscreenLastRow,
  );

  // redrawRangesOnLayer
  const context = tokensLayer.context;

  tokensLayer.clearCanvas();

  if (intactRanges.length === 0) {
    drawLines(
      firstRow,
      lastRow,
      0,
      lineHeight,
      charHeight,
      charWidth,
      canvasWidth,
      context,
      editor,
      editorScreenLineCount,
      invisibleRegExp,
      getTokenColorClosure,
      maxTokensInOneLine,
    );
  } else {
    for (let j = 0, len = intactRanges.length; j < len; j++) {
      const intact = intactRanges[j];

      tokensLayer.copyPartFromOffscreen(
        intact.offscreenRow * lineHeight,
        (intact.start - firstRow) * lineHeight,
        (intact.end - intact.start) * lineHeight,
      );
    }
    // drawLinesForRanges
    let currentRow = firstRow;
    for (let i = 0, len = intactRanges.length; i < len; i++) {
      const range = intactRanges[i];

      drawLines(
        currentRow,
        range.start,
        currentRow - firstRow,
        lineHeight,
        charHeight,
        charWidth,
        canvasWidth,
        context,
        editor,
        editorScreenLineCount,
        invisibleRegExp,
        getTokenColorClosure,
        maxTokensInOneLine,
      );

      currentRow = range.end;
    }
    if (currentRow <= lastRow) {
      drawLines(
        currentRow,
        lastRow,
        currentRow - firstRow,
        lineHeight,
        charHeight,
        charWidth,
        canvasWidth,
        context,
        editor,
        editorScreenLineCount,
        invisibleRegExp,
        getTokenColorClosure,
        maxTokensInOneLine,
      );
    }
  }

  tokensLayer.resetOffscreenSize();
  tokensLayer.copyToOffscreen();
}

const whitespaceTokenRegex = /^\s+$/;

/**
 * Draws a single token on the given context.
 *
 * @param {CanvasRenderingContext2D} context The target canvas context
 * @param {string} text The token's text content
 * @param {string} color The token's CSS color
 * @param {number} x The x position of the token in the line
 * @param {number} y The y position of the line in the minimap
 * @param {number} charWidth The width of a character in the minimap
 * @param {number} charHeight The height of a character in the minimap
 * @returns {number} The x position at the end of the token
 * @access private
 */
function drawToken(context, text, color, x, y, charWidth, charHeight) {
  context.fillStyle = color;

  let chars = 0;
  for (let j = 0, len = text.length; j < len; j++) {
    const char = text[j];
    if (char === " ") {
      if (chars > 0) {
        context.fillRect(x - chars * charWidth, y, chars * charWidth, charHeight);
      }
      chars = 0;
    } else {
      chars++;
    }
    x += charWidth;
  }
  if (chars > 0) {
    context.fillRect(x - chars * charWidth, y, chars * charWidth, charHeight);
  }
  return x;
}

/**
 * Draws lines on the corresponding layer.
 *
 * The lines range to draw is specified by the `firstRow` and `lastRow` parameters.
 *
 * @param {number} firstRow The first row to render
 * @param {number} lastRow The last row to render
 * @param {number} offsetRow The relative offset to apply to rows when rendering them
 * @param {number} lineHeight This.minimap.getLineHeight() * devicePixelRatio
 * @param {number} charHeight This.minimap.getCharHeight() * devicePixelRatio
 * @param {number} charWidth This.minimap.getCharWidth() * devicePixelRatio
 * @param {number} canvasWidth This.tokensLayer.getSize().width
 * @param {CanvasRenderingContext2D} context This.tokensLayer.context
 * @param {TextEditor} editor This.minimap.getTextEditor()
 * @param {number} editorScreenLineCount
 * @param {RegExp} invisibleRegExp
 * @param {(t: Token) => string} getTokenColorClosure
 * @param {number} maxTokensInOneLine This.maxTokensInOneLine
 * @access private
 */
function drawLines(
  firstRow,
  lastRow,
  offsetRow,
  lineHeight,
  charHeight,
  charWidth,
  canvasWidth,
  context,
  editor,
  editorScreenLineCount,
  invisibleRegExp,
  getTokenColorClosure,
  maxTokensInOneLine,
) {
  // NOTE: this method is the hot function of Minimap. Do not refactor. The code is inlined delibarately.

  if (firstRow > lastRow) {
    return;
  }

  let lastLine, x;
  let y = offsetRow * lineHeight - lineHeight;

  // eachTokenForScreenRows
  lastRow = Math.min(lastRow, editorScreenLineCount);

  for (let line = firstRow; line < lastRow; line++) {
    const editorTokensForScreenRow = editor.tokensForScreenRow(line);
    const numToken = editorTokensForScreenRow.length;
    const numTokenToRender = Math.min(numToken, maxTokensInOneLine);

    if (lastLine !== line) {
      x = 0;
      let lineDiff;
      if (typeof lastLine !== "number") {
        lineDiff = 1;
      } else {
        lineDiff = line - lastLine;
      }
      const yDiff = lineHeight * lineDiff;
      y += yDiff;
      lastLine = line;
      context.clearRect(x, y, canvasWidth, yDiff);
    }

    for (let iToken = 0; iToken < numTokenToRender; iToken++) {
      const token = editorTokensForScreenRow[iToken];
      const tokenText = token.text.replace(invisibleRegExp, " ");
      const tokenScopes = token.scopes;

      if (x > canvasWidth) {
        continue;
      }

      if (whitespaceTokenRegex.test(tokenText)) {
        x += tokenText.length * charWidth;
      } else {
        x = drawToken(
          context,
          tokenText,
          getTokenColorClosure(tokenScopes),
          x,
          y,
          charWidth,
          charHeight,
        );
      }
    }
  }

  context.fill();
}

/**
 * Returns the regexp to replace invisibles substitution characters in editor lines.
 *
 * @param {TextEditor} editor
 * @returns {RegExp} The regular expression to match invisible characters
 * @access private
 */
function getInvisibleRegExp(editor) {
  const invisibles = editor.getInvisibles();
  const regexp = [];
  if (invisibles.cr != null) {
    regexp.push(invisibles.cr);
  }
  if (invisibles.eol != null) {
    regexp.push(invisibles.eol);
  }
  if (invisibles.space != null) {
    regexp.push(invisibles.space);
  }
  if (invisibles.tab != null) {
    regexp.push(invisibles.tab);
  }

  if (regexp.length !== 0) {
    return RegExp(
      regexp
        .filter((s) => {
          return typeof s === "string";
        })
        .map(escapeRegExp)
        .join("|"),
      "g",
    );
  } else {
    return null;
  }
}

//     ######   #######  ##        #######  ########   ######
//    ##    ## ##     ## ##       ##     ## ##     ## ##    ##
//    ##       ##     ## ##       ##     ## ##     ## ##
//    ##       ##     ## ##       ##     ## ########   ######
//    ##       ##     ## ##       ##     ## ##   ##         ##
//    ##    ## ##     ## ##       ##     ## ##    ##  ##    ##
//     ######   #######  ########  #######  ##     ##  ######

/**
 * Returns the opacity value to use when rendering the `Minimap` text.
 *
 * @returns {Number} The text opacity value Unused (inlined)
 */
// getTextOpacity () { return this.textOpacity }

/**
 * Returns the default text color for an editor content.
 *
 * The color value is directly read from the `TextEditorView` computed styles.
 *
 * @param {TextEditorElement} editorElement
 * @param {number} textOpacity
 * @returns {string} A CSS color
 */
function getDefaultColor(editorElement, textOpacity) {
  const color = styleReader.retrieveStyleFromDom([".editor"], "color", editorElement, true);
  return transparentize(color, textOpacity);
}

/**
 * Returns the text color for the passed-in scopes
 *
 * The color value is read from the DOM by creating a node structure that match the token `scope` property.
 *
 * @param {string[]} scopes An array of scopes for a `TextEditor` token (token.scopeDescriptor || token.scopes)
 * @param {TextEditorElement} editorElement
 * @param {number} textOpacity
 * @returns {string} The CSS color for the provided token
 */
function getTokenColor(scopes, editorElement, textOpacity) {
  const color = styleReader.retrieveStyleFromDom(scopes, "color", editorElement, true);

  return transparentize(color, textOpacity);
}

/**
 * Converts a `rgb(...)` color into a `rgba(...)` color with the specified opacity.
 *
 * @param {string} color The CSS RGB color to transparentize
 * @param {number} opacity The opacity amount
 * @returns {string} The transparentized CSS color
 * @access private
 */
function transparentize(color, opacity) {
  // assumes that color is in form of `rgb(content)` with no spaces around the given value
  return `rgba(${color.slice(4, -1)}, ${opacity})`;
}

//    ########     ###    ##    ##  ######   ########  ######
//    ##     ##   ## ##   ###   ## ##    ##  ##       ##    ##
//    ##     ##  ##   ##  ####  ## ##        ##       ##
//    ########  ##     ## ## ## ## ##   #### ######    ######
//    ##   ##   ######### ##  #### ##    ##  ##             ##
//    ##    ##  ##     ## ##   ### ##    ##  ##       ##    ##
//    ##     ## ##     ## ##    ##  ######   ########  ######

/**
 * Computes the ranges that are not affected by the current pending changes.
 *
 * @param {number} firstRow The first row of the rendered region
 * @param {number} lastRow The last row of the rendered region
 * @param {number | null} offscreenFirstRow CanvasDrawer.offscreenLastRow
 * @param {number | null} offscreenLastRow CanvasDrawer.offscreenLastRow
 * @returns {Object[]} The intact ranges in the rendered region
 * @access private
 */
function computeIntactRanges(firstRow, lastRow, changes, offscreenFirstRow, offscreenLastRow) {
  // TODO when do they get null?
  if (offscreenFirstRow == null && offscreenLastRow == null) {
    return [];
  }

  // At first, the whole range is considered intact
  let intactRanges = [
    {
      start: offscreenFirstRow,
      end: offscreenLastRow,
      offscreenRow: 0,
    },
  ];

  for (let i = 0, len = changes.length; i < len; i++) {
    const change = changes[i];
    const newIntactRanges = [];

    for (let j = 0, intactLen = intactRanges.length; j < intactLen; j++) {
      const range = intactRanges[j];

      if (change.end < range.start && change.screenDelta !== 0) {
        // The change is above of the range and lines are either
        // added or removed
        newIntactRanges.push({
          start: range.start + change.screenDelta,
          end: range.end + change.screenDelta,
          offscreenRow: range.offscreenRow,
        });
      } else if (change.end < range.start || change.start > range.end) {
        // The change is outside the range but didn't add
        // or remove lines
        newIntactRanges.push(range);
      } else {
        // The change is within the range, there's one intact range
        // from the range start to the change start
        if (change.start > range.start) {
          newIntactRanges.push({
            start: range.start,
            end: change.start - 1,
            offscreenRow: range.offscreenRow,
          });
        }
        if (change.end < range.end) {
          // The change ends within the range
          if (change.bufferDelta !== 0) {
            // Lines are added or removed, the intact range starts in the
            // next line after the change end plus the screen delta
            newIntactRanges.push({
              start: change.end + change.screenDelta + 1,
              end: range.end + change.screenDelta,
              offscreenRow: range.offscreenRow + change.end + 1 - range.start,
            });
          } else if (change.screenDelta !== 0) {
            // Lines are added or removed in the display buffer, the intact
            // range starts in the next line after the change end plus the
            // screen delta
            newIntactRanges.push({
              start: change.end + change.screenDelta + 1,
              end: range.end + change.screenDelta,
              offscreenRow: range.offscreenRow + change.end + 1 - range.start,
            });
          } else {
            // No lines are added, the intact range starts on the line after
            // the change end
            newIntactRanges.push({
              start: change.end + 1,
              end: range.end,
              offscreenRow: range.offscreenRow + change.end + 1 - range.start,
            });
          }
        }
      }
    }
    intactRanges = newIntactRanges;
  }

  return truncateIntactRanges(intactRanges, firstRow, lastRow);
}

/**
 * Truncates the intact ranges so that they doesn't expand past the visible area of the minimap.
 *
 * @param {Object[]} intactRanges The initial array of ranges
 * @param {number} firstRow The first row of the rendered region
 * @param {number} lastRow The last row of the rendered region
 * @returns {Object[]} The array of truncated ranges
 * @access private
 */
function truncateIntactRanges(intactRanges, firstRow, lastRow) {
  let i = 0;
  while (i < intactRanges.length) {
    const range = intactRanges[i];

    if (range.start < firstRow) {
      range.offscreenRow += firstRow - range.start;
      range.start = firstRow;
    }

    if (range.end > lastRow) {
      range.end = lastRow;
    }

    if (range.start >= range.end) {
      intactRanges.splice(i--, 1);
    }

    i++;
  }

  return intactRanges.sort((a, b) => {
    return a.offscreenRow - b.offscreenRow;
  });
}

module.exports = CanvasDrawer;
