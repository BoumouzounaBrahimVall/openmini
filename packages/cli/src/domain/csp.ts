/**
 * Build-time Content-Security-Policy — the enforceable half of
 * `allowedDomains` (decision #7). A copy of the template in
 * specs/package-format.md §4; sync is ENFORCED by csp.spec-sync.test.ts.
 */
export function buildCsp(allowedDomains: string[]): string {
  const connect = ["'self'", ...allowedDomains].join(" ");
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self'",
    `connect-src ${connect}`,
  ].join("; ");
}

export interface CspInjection {
  html: string;
  /** True when an authored CSP meta tag was replaced (pack warns about it). */
  replacedAuthored: boolean;
}

const AUTHORED_CSP = /[ \t]*<meta[^>]+content-security-policy[^>]*>\s*/i;

export function injectCsp(html: string, csp: string): CspInjection {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
  if (AUTHORED_CSP.test(html)) {
    return {
      html: html.replace(AUTHORED_CSP, `    ${meta}\n`),
      replacedAuthored: true,
    };
  }
  const withHead = html.replace(/<head([^>]*)>/i, `<head$1>\n    ${meta}`);
  return {
    html: withHead === html ? `${meta}\n${html}` : withHead,
    replacedAuthored: false,
  };
}
