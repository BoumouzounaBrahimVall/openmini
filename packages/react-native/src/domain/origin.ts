/**
 * Pure origin extraction for the allowedDomains check. Deliberately NOT
 * `new URL(url).origin`: React Native's URL polyfill has patchy property
 * support, and this must behave identically in Node tests and on Hermes.
 * No default-port normalization — allowedDomains entries are matched as the
 * literal origins mini-apps will call (specs/manifest.md).
 */
const ORIGIN_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i;

export function originOf(url: string): string | null {
  const match = ORIGIN_PATTERN.exec(url);
  if (!match) return null;
  const [, scheme, host] = match;
  // Userinfo is never part of an origin; a URL carrying it won't match any
  // allow-list entry, which fails safe (blocked).
  return `${(scheme as string).toLowerCase()}://${(host as string).toLowerCase()}`;
}
