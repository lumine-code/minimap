const TILE_ROWS = 128;
const MAX_BYTES = 16 * 1024 * 1024;

// Retain rasterized row tiles across distant scrolls, independently of the
// front canvas. A byte bound also covers high-DPI and unusually wide maps.
class TokenRasterCache {
  constructor() {
    this.tiles = new Map();
    this.bytes = 0;
  }

  clear() {
    for (const tile of this.tiles.values()) tile.canvas.width = 0;
    this.tiles.clear();
    this.bytes = 0;
  }

  invalidate(changes) {
    for (const { start, end, screenDelta } of changes) {
      const last = screenDelta ? Infinity : end + 1;
      for (const [first, tile] of this.tiles)
        if (first < last && first + TILE_ROWS > start)
          tile.valid.fill(0, Math.max(0, start - first), Math.min(TILE_ROWS, last - first));
    }
  }

  draw(context, first, last, offset, width, lineHeight, paint) {
    if (!Number.isInteger(lineHeight) || lineHeight <= 0 || width <= 0) return false;
    const bytes = width * lineHeight * TILE_ROWS * 4;
    if (bytes > MAX_BYTES) return false;
    for (let row = first; row < last;) {
      const start = Math.floor(row / TILE_ROWS) * TILE_ROWS;
      const end = Math.min(last, start + TILE_ROWS);
      let tile = this.tiles.get(start);
      if (!tile) {
        while (this.bytes + bytes > MAX_BYTES && this.tiles.size) {
          const key = this.tiles.keys().next().value;
          const old = this.tiles.get(key);
          this.bytes -= old.bytes;
          old.canvas.width = 0;
          this.tiles.delete(key);
        }
        const canvas = context.canvas.ownerDocument.createElement("canvas");
        canvas.width = width;
        canvas.height = lineHeight * TILE_ROWS;
        const target = canvas.getContext("2d");
        target.imageSmoothingEnabled = false;
        tile = { canvas, context: target, valid: new Uint8Array(TILE_ROWS), bytes };
        this.bytes += bytes;
      } else this.tiles.delete(start);
      this.tiles.set(start, tile);
      for (let missing = row; missing < end;) {
        if (tile.valid[missing - start]) {
          missing++;
          continue;
        }
        let until = missing + 1;
        while (until < end && !tile.valid[until - start]) until++;
        paint(tile.context, missing, until, missing - start);
        tile.valid.fill(1, missing - start, until - start);
        missing = until;
      }
      context.drawImage(
        tile.canvas,
        0,
        (row - start) * lineHeight,
        width,
        (end - row) * lineHeight,
        0,
        (offset + row - first) * lineHeight,
        width,
        (end - row) * lineHeight,
      );
      row = end;
    }
    return true;
  }
}

module.exports = TokenRasterCache;
