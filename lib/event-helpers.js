const { Disposable } = require("atom");

/**
 * Subscribes to events on a target element and returns a Disposable.
 *
 * @param {HTMLElement} target The element to listen on
 * @param {Object} events An object mapping event names to handler functions
 * @param {Object} [options] addEventListener options (e.g. { passive: true })
 * @returns {Disposable} A disposable that removes all listeners
 */
function subscribeTo(target, events, options) {
  for (const eventName in events) {
    target.addEventListener(eventName, events[eventName], options);
  }
  return new Disposable(() => {
    for (const eventName in events) {
      target.removeEventListener(eventName, events[eventName], options);
    }
  });
}

module.exports = { subscribeTo };
