/**
 * Expo config plugin for @openmini/react-native.
 *
 * Deliberately an identity today: everything the module needs is carried by
 * standard autolinking (the podspec and android/ gradle module), and the
 * openmini:// scheme is registered at WKWebView-configuration time — never
 * in Info.plist — while Android serves via the reserved
 * appassets.androidplatform.net domain. No AndroidManifest or Info.plist
 * changes are required.
 *
 * It exists so hosts can already list the package in `plugins` (app.json):
 * if a future version DOES need native config during `expo prebuild`, it
 * lands here without a breaking setup change. CI runs prebuild + native
 * compiles for both platforms to prove this keeps holding.
 */
// eslint-disable-next-line no-undef -- CommonJS by contract: Expo require()s config plugins
module.exports = (config) => config;
