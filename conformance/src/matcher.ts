/**
 * Back-compat shim: the matcher moved into the portable suite core
 * (suite.ts) so Metro-bundled drivers get it without Node APIs.
 */
export { match, registerToken } from "./suite.js";
