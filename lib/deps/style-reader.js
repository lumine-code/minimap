/** @babel */

const dotRegexp = /\.+/g;
const rgbExtractRegexp = /rgb(a?)\((\d+), (\d+), (\d+)(, (\d+(\.\d+)?))?\)/;
const hueRegexp = /hue-rotate\((-?\d+)deg\)/;

export class StyleReader {
  constructor() {
    this.domStylesCache = new Map();
    this.dummyNode = undefined;
    this.targetNode = undefined;
  }

  retrieveStyleFromDom(scopes, property, targetNode, getFromCache = true) {
    if (scopes.length === 0) {
      return "";
    }

    const key = scopes.join(" ");
    let cachedData = this.domStylesCache.get(key);

    if (cachedData !== undefined) {
      if (getFromCache) {
        const value = cachedData[property];
        if (value !== undefined) {
          return value;
        }
      }
    } else {
      cachedData = {};
    }

    this.ensureDummyNodeExistence(targetNode);
    const value = this.computeStyleFromDom(scopes, property);

    if (value !== "") {
      cachedData[property] = value;
      this.domStylesCache.set(key, cachedData);
    }

    return value;
  }

  /**
   * Reads a style from the DOM, bypassing the cache.
   *
   * The dummy node must have been created first, as the scopes are resolved by building a matching
   * node structure inside it.
   *
   * @param {string[]} scopes An array of scopes to match
   * @param {string} property The CSS property to read
   * @returns {string} The computed value of `property`
   * @access private
   */
  computeStyleFromDom(scopes, property) {
    const dummyNode = this.dummyNode;
    let parent = dummyNode;

    for (let i = 0, len = scopes.length; i < len; i++) {
      const scope = scopes[i];
      const node = document.createElement("span");
      node.className = scope.replace(dotRegexp, " ");
      parent.appendChild(node);
      parent = node;
    }

    const style = window.getComputedStyle(parent);
    let value = style.getPropertyValue(property);

    const filter = style.getPropertyValue("-webkit-filter");
    if (filter.includes("hue-rotate")) {
      value = rotateHue(value, filter);
    }

    dummyNode.innerHTML = "";
    return value;
  }

  ensureDummyNodeExistence(targetNode) {
    if (this.targetNode !== targetNode || this.dummyNode === undefined) {
      this.dummyNode = document.createElement("span");
      this.dummyNode.style.visibility = "hidden";
      targetNode.appendChild(this.dummyNode);
      this.targetNode = targetNode;
    }
  }

  /**
   * Tells whether any of the cached styles now resolves to a different value.
   *
   * The styles are re-read from the DOM without touching the cache, so that a caller can tell an
   * actual restyle apart from the stylesheet churn any package can cause at any time.
   *
   * @returns {boolean} Whether a cached style has changed
   */
  hasDOMStylesCacheChanged() {
    if (this.dummyNode === undefined) {
      return false;
    }

    for (const [key, cachedData] of this.domStylesCache) {
      const scopes = key.split(" ");
      for (const property in cachedData) {
        if (this.computeStyleFromDom(scopes, property) !== cachedData[property]) {
          return true;
        }
      }
    }

    return false;
  }

  invalidateDOMStylesCache() {
    this.domStylesCache.clear();
  }
}

function rotateHue(value, filter) {
  const match = value.match(rgbExtractRegexp);
  if (match === null) {
    return "";
  }

  const [, , rStr, gStr, bStr, , aStr] = match;
  const hueMatch = filter.match(hueRegexp);
  if (hueMatch === null) {
    return "";
  }

  const [, hueStr] = hueMatch;
  let [r, g, b, a, hue] = [rStr, gStr, bStr, aStr, hueStr].map(Number);
  [r, g, b] = rotate(r, g, b, hue);

  if (isNaN(a)) {
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}

function rotate(r, g, b, angle) {
  const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const lumR = 0.2126;
  const lumG = 0.7152;
  const lumB = 0.0722;
  const hueRotateR = 0.143;
  const hueRotateG = 0.14;
  const hueRotateB = 0.283;
  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  matrix[0] = lumR + (1 - lumR) * cos - lumR * sin;
  matrix[1] = lumG - lumG * cos - lumG * sin;
  matrix[2] = lumB - lumB * cos + (1 - lumB) * sin;
  matrix[3] = lumR - lumR * cos + hueRotateR * sin;
  matrix[4] = lumG + (1 - lumG) * cos + hueRotateG * sin;
  matrix[5] = lumB - lumB * cos - hueRotateB * sin;
  matrix[6] = lumR - lumR * cos - (1 - lumR) * sin;
  matrix[7] = lumG - lumG * cos + lumG * sin;
  matrix[8] = lumB + (1 - lumB) * cos + lumB * sin;
  return [
    clamp(matrix[0] * r + matrix[1] * g + matrix[2] * b),
    clamp(matrix[3] * r + matrix[4] * g + matrix[5] * b),
    clamp(matrix[6] * r + matrix[7] * g + matrix[8] * b),
  ];
}

function clamp(num) {
  return Math.ceil(Math.max(0, Math.min(255, num)));
}
