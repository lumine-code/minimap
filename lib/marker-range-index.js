// Hub snapshots keep their identity until the items change. A viewport can
// move many times over one snapshot, so index blocks on its second read. A
// snapshot replaced on every edit only pays for the ordinary scan.
const snapshots = new WeakMap();
const BLOCK_SIZE = 128;

function candidateItemsInRange(items, firstRow, lastRow) {
  let bounds = null;
  if (items.length >= BLOCK_SIZE * 4) {
    if (snapshots.has(items)) {
      bounds = snapshots.get(items);
      if (!bounds) {
        bounds = [];
        for (let offset = 0; offset < items.length; offset += BLOCK_SIZE) {
          let start = Infinity;
          let end = -Infinity;
          const limit = Math.min(offset + BLOCK_SIZE, items.length);
          for (let index = offset; index < limit; index++) {
            const item = items[index];
            start = Math.min(start, item.row);
            end = Math.max(end, item.end ?? item.row);
          }
          bounds.push(start, end);
        }
        snapshots.set(items, bounds);
      }
    } else {
      snapshots.set(items, null);
    }
  }

  if (!bounds) return items;

  let allIntersect = true;
  for (let block = 0; block < bounds.length; block += 2) {
    if (bounds[block] > lastRow || bounds[block + 1] < firstRow) {
      allIntersect = false;
      break;
    }
  }
  // Preserve the ordinary draw loop when indexing cannot exclude any block.
  if (allIntersect) return items;

  const candidates = [];
  for (let offset = 0; offset < items.length; offset += BLOCK_SIZE) {
    const block = (offset / BLOCK_SIZE) * 2;
    if (bounds[block] > lastRow || bounds[block + 1] < firstRow) continue;
    const limit = Math.min(offset + BLOCK_SIZE, items.length);
    for (let index = offset; index < limit; index++) {
      // Keep authored order, including overlapping ranges with equal z-index.
      candidates.push(items[index]);
    }
  }
  return candidates;
}

module.exports = candidateItemsInRange;
