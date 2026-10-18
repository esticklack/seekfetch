import { describe, expect, it } from "vitest";
import { InputError } from "../src/core/errors.js";
import { buildQuery, validateQuery } from "../src/core/query.js";

describe("buildQuery", () => {
  it("returns the base query untouched without filters", () => {
    expect(buildQuery("  rust async  ")).toBe("rust async");
  });

  it("maps every filter to its operator", () => {
    expect(
      buildQuery("mcp server", {
        sites: ["github.com", "npmjs.com"],
        excludeSites: ["reddit.com"],
        lang: ["en", "es"],
        after: "2026-01-01",
        before: "2026",
      }),
    ).toBe("mcp server site:github.com OR site:npmjs.com -site:reddit.com lang:en,es after:2026-01-01 before:2026");
  });

  it("ignores blank entries", () => {
    expect(buildQuery("q", { sites: [" ", ""], lang: [] })).toBe("q");
  });

  it("rejects malformed dates", () => {
    expect(() => buildQuery("q", { after: "yesterday" })).toThrow(InputError);
  });
});

describe("validateQuery", () => {
  it("accepts exactly 128 characters, counting code points", () => {
    expect(() => validateQuery("é".repeat(128))).not.toThrow();
  });

  it("rejects 129 characters and empty queries", () => {
    expect(() => validateQuery("a".repeat(129))).toThrow(/129 characters/);
    expect(() => validateQuery("   ")).toThrow(InputError);
  });
});
