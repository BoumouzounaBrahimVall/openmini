import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HostApiError } from "../domain/host-errors.js";
import { defineHostApi, normalizeCustomApis } from "./define-host-api.js";

const echo = defineHostApi({
  name: "echoUser",
  request: z.object({ userId: z.string() }),
  response: z.object({ userId: z.string(), greeted: z.boolean() }),
  handler: ({ userId }) => ({ userId, greeted: true }),
});

async function call(
  apis: Parameters<typeof normalizeCustomApis>[0],
  name: string,
  payload: unknown,
  devChecks = true,
): Promise<unknown> {
  const handler = normalizeCustomApis(apis, devChecks)[name];
  if (!handler) throw new Error(`no handler ${name}`);
  return handler(payload);
}

describe("defineHostApi / normalizeCustomApis", () => {
  it("passes validated payloads to the typed handler", async () => {
    await expect(call([echo], "echoUser", { userId: "u1" })).resolves.toEqual({
      userId: "u1",
      greeted: true,
    });
  });

  it("rejects schema-violating requests as INVALID_PAYLOAD", async () => {
    const failing = call([echo], "echoUser", { userId: 42 });
    await expect(failing).rejects.toBeInstanceOf(HostApiError);
    await expect(failing).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
  });

  it("flags schema-violating responses as HOST_ERROR when dev checks are on", async () => {
    const broken = defineHostApi({
      name: "broken",
      response: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: "yes" }) as unknown as { ok: boolean },
    });
    const failing = call([broken], "broken", {});
    await expect(failing).rejects.toBeInstanceOf(HostApiError);
    await expect(failing).rejects.toMatchObject({ code: "HOST_ERROR" });
    // production path trusts the handler
    await expect(call([broken], "broken", {}, false)).resolves.toEqual({
      ok: "yes",
    });
  });

  it("accepts the plain record form unchanged", async () => {
    await expect(
      call({ raw: (p) => p ?? null }, "raw", { a: 1 }),
    ).resolves.toEqual({ a: 1 });
  });

  it("rejects invalid and duplicate names at registration time", () => {
    const bad = defineHostApi({ name: "not a name!", handler: () => null });
    expect(() => normalizeCustomApis([bad], true)).toThrow(/invalid host API/);
    expect(() => normalizeCustomApis([echo, echo], true)).toThrow(/duplicate/);
  });

  it("maps a handler's undefined return to null (protocol result is required)", async () => {
    const quiet = defineHostApi({ name: "quiet", handler: () => undefined });
    await expect(call([quiet], "quiet", {})).resolves.toBeNull();
  });
});
