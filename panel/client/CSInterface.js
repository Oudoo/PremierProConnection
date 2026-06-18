/*
 * Minimal CSInterface shim for CEP panels.
 *
 * This provides the small slice of Adobe's CSInterface API this panel needs:
 *   • new CSInterface()
 *   • csInterface.evalScript(script, callback)   → run ExtendScript in the host
 *   • csInterface.getHostEnvironment()            → app name / version
 *   • csInterface.getSystemPath(type)             → useful paths
 *
 * It wraps window.__adobe_cep__, which the CEP runtime injects. If you hit any
 * gaps, drop in Adobe's full CSInterface.js from the CEP-Resources repo
 * (github.com/Adobe-CEP/CEP-Resources) — this file is API-compatible for the
 * methods above.
 */
(function (global) {
  "use strict";

  function CSInterface() {}

  CSInterface.prototype.hostEnvironment = (function () {
    try {
      return JSON.parse(global.__adobe_cep__.getHostEnvironment());
    } catch (e) {
      return null;
    }
  })();

  CSInterface.prototype.getHostEnvironment = function () {
    try {
      this.hostEnvironment = JSON.parse(global.__adobe_cep__.getHostEnvironment());
    } catch (e) {}
    return this.hostEnvironment;
  };

  /**
   * Evaluate an ExtendScript string in the host (Premiere). The result of the
   * script (a string) is passed to `callback`. ExtendScript "undefined" comes
   * back as the literal string "undefined".
   */
  CSInterface.prototype.evalScript = function (script, callback) {
    if (typeof callback !== "function") {
      callback = function () {};
    }
    global.__adobe_cep__.evalScript(script, callback);
  };

  CSInterface.prototype.getApplicationID = function () {
    var env = this.getHostEnvironment();
    return env ? env.appId : "";
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    try {
      var path = decodeURI(global.__adobe_cep__.getSystemPath(pathType));
      // Strip file:// scheme on macOS-style URIs.
      return path.replace(/^file\:\/+/, "/").replace(/^\/([A-Za-z]:)/, "$1");
    } catch (e) {
      return "";
    }
  };

  // System path constants (subset).
  global.SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication",
  };

  global.CSInterface = CSInterface;
})(typeof window !== "undefined" ? window : this);
