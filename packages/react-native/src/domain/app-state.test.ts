import { describe, expect, it } from "vitest";
import { hostEventForAppState } from "./app-state.js";

describe("hostEventForAppState", () => {
  it("maps active to app.show", () => {
    expect(hostEventForAppState("active")).toBe("app.show");
  });

  it("maps background and inactive to app.hide", () => {
    expect(hostEventForAppState("background")).toBe("app.hide");
    expect(hostEventForAppState("inactive")).toBe("app.hide");
  });

  it("ignores statuses with no mini-app lifecycle meaning", () => {
    expect(hostEventForAppState("unknown")).toBeNull();
    expect(hostEventForAppState("extension")).toBeNull();
  });
});
