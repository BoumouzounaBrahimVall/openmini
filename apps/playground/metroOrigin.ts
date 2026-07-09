/**
 * Origin of the Metro dev server that shipped this bundle — the playground
 * uses it as the conformance ALLOWED_ORIGIN and as the demo registry host,
 * so no extra local server is ever needed. Dev builds only.
 */
import { NativeModules } from 'react-native';

export function metroOrigin(): string | null {
  const scriptURL: string | undefined =
    NativeModules?.SourceCode?.getConstants?.()?.scriptURL;
  const match = scriptURL ? /^https?:\/\/[^/]+/.exec(scriptURL) : null;
  return match ? match[0] : null;
}
