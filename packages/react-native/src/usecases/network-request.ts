/**
 * network.request semantics per specs/bridge-protocol.md: origin allow-list
 * checked BEFORE any I/O, HTTP errors are data (ok:true with the status),
 * transport failures are HOST_ERROR.
 */
import { HostApiError } from "../domain/host-errors.js";
import { originOf } from "../domain/origin.js";
import { networkRequestPayload, parseWith } from "../domain/payloads.js";

export async function networkRequest(
  payload: unknown,
  allowedDomains: string[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const request = parseWith(networkRequestPayload, payload);
  const origin = originOf(request.url);
  if (origin === null) {
    throw new HostApiError("INVALID_PAYLOAD", "url is not a valid URL");
  }
  if (!allowedDomains.includes(origin)) {
    throw new HostApiError(
      "NETWORK_DOMAIN_BLOCKED",
      `${origin} is not in allowedDomains`,
    );
  }
  const controller = new AbortController();
  const timer =
    request.timeoutMs !== undefined
      ? setTimeout(() => controller.abort(), request.timeoutMs)
      : undefined;
  try {
    const response = await fetchImpl(request.url, {
      method: request.method ?? "GET",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: response.status, headers, body: await response.text() };
  } catch (cause) {
    throw new HostApiError(
      "HOST_ERROR",
      cause instanceof Error ? cause.message : "network request failed",
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
