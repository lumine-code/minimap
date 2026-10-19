describe("marker viewport index", () => {
  const candidateItemsInRange = require("../lib/marker-range-index");
  const scan = (items, first, last) =>
    items.filter((item) => !((item.end ?? item.row) < first || item.row > last));
  const itemsInRange = (items, first, last) =>
    scan(candidateItemsInRange(items, first, last), first, last);

  it("keeps overlapping, unsorted ranges in their authored order", () => {
    const items = Array.from({ length: 1024 }, (_, index) =>
      Object.freeze({ row: (index * 73) % 2000, end: ((index * 73) % 2000) + (index % 400) }),
    );
    items.unshift(Object.freeze({ row: 0, end: 5000 }));
    items.push(Object.freeze({ row: 500, end: 600 }), Object.freeze({ row: 600 }));
    Object.freeze(items);
    for (const [first, last] of [
      [500, 600],
      [600, 600],
      [0, 0],
      [5001, 6000],
      [20, 250],
    ]) {
      const visible = itemsInRange(items, first, last);
      const expected = scan(items, first, last);
      expect(visible).toEqual(expected);
      visible.forEach((item, index) => expect(item).toBe(expected[index]));
    }
  });

  it("uses the replacement snapshot when the provider changes its results", () => {
    const first = Array.from({ length: 1024 }, (_, row) => ({ row }));
    for (let count = 0; count < 3; count++) {
      expect(itemsInRange(first, 0, 1)).toEqual([{ row: 0 }, { row: 1 }]);
    }
    const next = first.map((item) => ({ row: item.row + 100 }));
    expect(itemsInRange(next, 0, 1)).toEqual([]);
    expect(itemsInRange(next, 0, 1)).toEqual([]);
  });

  it("skips offscreen item reads on repeated viewport movement", () => {
    let reads = 0;
    const items = Array.from({ length: 10000 }, (_, row) => ({
      get row() {
        reads++;
        return row;
      },
    }));
    itemsInRange(items, 5000, 5010);
    itemsInRange(items, 5001, 5011);
    reads = 0;
    expect(itemsInRange(items, 5002, 5012)).toEqual(scan(items.slice(5002, 5013), 5002, 5012));
    expect(reads).toBeLessThan(400);
  });

  it("leaves small and newly published snapshots on the ordinary draw path", () => {
    const small = [{ row: 1 }, { row: 3 }];
    const large = Array.from({ length: 1024 }, (_, row) => ({ row }));

    expect(candidateItemsInRange(small, 1, 1)).toBe(small);
    expect(candidateItemsInRange(large, 500, 510)).toBe(large);
    expect(candidateItemsInRange(large, 500, 510).length).toBeLessThan(large.length);
  });

  it("visits every overlapping item in order when all of them cover the viewport", () => {
    const items = Array.from({ length: 1024 }, (_, row) => ({ row, end: 5000 }));

    for (let read = 0; read < 3; read++) {
      expect(candidateItemsInRange(items, 2000, 2500)).toBe(items);
      const visible = itemsInRange(items, 2000, 2500);
      expect(visible).toEqual(items);
      visible.forEach((item, index) => expect(item).toBe(items[index]));
    }
  });
});
