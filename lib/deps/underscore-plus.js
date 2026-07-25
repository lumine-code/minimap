/** @babel */

const regexEscape = /[$()*+./?[\\\]^{|}-]/g;
export function escapeRegExp(string) {
  if (string) {
    return string.replace(regexEscape, "\\$&");
  } else {
    return "";
  }
}
