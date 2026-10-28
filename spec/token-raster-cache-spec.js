const TokenRasterCache = require("../lib/token-raster-cache");

describe("minimap token raster cache", () => {
  let cache, context, paint;
  beforeEach(() => {
    cache = new TokenRasterCache();
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 400;
    context = canvas.getContext("2d");
    paint = jasmine.createSpy("paint").and.callFake((target, first, last, offset) => {
      target.clearRect(0, offset * 2, 16, (last - first) * 2);
      target.fillStyle = "#ff0000";
      target.fillRect(0, offset * 2, 16, (last - first) * 2);
    });
  });
  afterEach(() => cache.clear());

  it("reuses colored pixels across distant viewport changes", () => {
    cache.draw(context, 0, 20, 0, 16, 2, paint);
    cache.draw(context, 1000, 1020, 0, 16, 2, paint);
    context.clearRect(0, 0, 16, 400);
    cache.draw(context, 0, 20, 0, 16, 2, paint);
    expect(paint).toHaveBeenCalledTimes(2);
    expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([255, 0, 0, 255]);
  });

  it("repaints changed colors and invalidates shifted rows", () => {
    cache.draw(context, 0, 20, 0, 16, 2, paint);
    paint.calls.reset();
    cache.invalidate([{ start: 5, end: 6, screenDelta: 0 }]);
    cache.draw(context, 0, 20, 0, 16, 2, paint);
    expect(paint.calls.mostRecent().args.slice(1)).toEqual([5, 7, 5]);
    paint.calls.reset();
    cache.invalidate([{ start: 10, end: 10, screenDelta: 2 }]);
    cache.draw(context, 0, 20, 0, 16, 2, paint);
    expect(paint.calls.mostRecent().args.slice(1)).toEqual([10, 20, 10]);
  });

  it("releases evicted canvases within a byte allowance", () => {
    cache.draw(context, 0, 128, 0, 2048, 8, () => {});
    const first = cache.tiles.get(0).canvas;
    cache.draw(context, 128, 384, 0, 2048, 8, () => {});
    expect(cache.bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(cache.tiles.size).toBe(2);
    expect(first.width).toBe(0);
    cache.clear();
    expect(cache.bytes).toBe(0);
  });

  it("retains direct drawing for fractional row pixels", () => {
    expect(cache.draw(context, 0, 20, 0, 16, 2.5, paint)).toBeFalse();
    expect(paint).not.toHaveBeenCalled();
    expect(cache.tiles.size).toBe(0);
  });
});
