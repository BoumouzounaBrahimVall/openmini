import { describe, expect, it } from "vitest";
import { OPENMINI_CLI_VERSION } from "./index.js";

describe("@openmini/cli stub", () => {
  it("exports a version", () => {
    expect(OPENMINI_CLI_VERSION).toBe("0.0.0");
  });
});
