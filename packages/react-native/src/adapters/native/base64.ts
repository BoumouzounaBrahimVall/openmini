const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2] ?? "";
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)] ?? "";
    out +=
      b === undefined
        ? "="
        : (ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)] ?? "");
    out += c === undefined ? "=" : (ALPHABET[c & 63] ?? "");
  }
  return out;
}
