/**
 * Collapses a burst of calls into a single one on the next microtask.
 *
 * Unlike a debounce, the callback still runs within the task that scheduled it, so its work lands
 * before the browser's next rendering opportunity. That matters for the theme: Lumine swaps
 * stylesheets inside a View Transition, which cross-fades the window from its old rendering to its
 * new one in 0.25s. A debounce here re-reads the colors long after that fade is over, which reads
 * as the minimap popping to its new colors on its own.
 *
 * @param {function(...*):void} callback The function to coalesce
 * @returns {function(...*):void} A function that runs `callback` once per microtask
 */
function coalesce(callback) {
  let scheduled = false;

  return (...args) => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      callback(...args);
    });
  };
}

module.exports = { coalesce };
