import { describe, expect, it } from "vitest";
import { originOf } from "./origin.js";

describe("originOf", () => {
  it("extracts scheme://host, keeping explicit ports", () => {
    expect(originOf("https://api.example.com/v1/x?q=1")).toBe(
      "https://api.example.com",
    );
    expect(originOf("http://127.0.0.1:8081/echo")).toBe(
      "http://127.0.0.1:8081",
    );
  });

  it("lowercases scheme and host", () => {
    expect(originOf("HTTPS://API.Example.COM/path")).toBe(
      "https://api.example.com",
    );
  });

  it("returns null for non-URLs", () => {
    expect(originOf("not a url")).toBeNull();
    expect(originOf("/relative/path")).toBeNull();
    expect(originOf("")).toBeNull();
  });
});
