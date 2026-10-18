import { describe, expect, it } from "vitest";
import { clip, formatSearch, slice } from "../src/core/format.js";
import { result } from "./helpers.js";

describe("format", () => {
  it("caps summaries at 800 chars by default, configurable", () => {
    const long = [result({ summary: "s".repeat(3000) })];
    expect(formatSearch("q", long)).toContain(`${"s".repeat(800)}…`);
    expect(formatSearch("q", long)).not.toContain("s".repeat(801));
    expect(formatSearch("q", long, { maxSummaryChars: 2000 })).toContain("s".repeat(2000));
  });

  it("clip leaves short text alone", () => {
    expect(clip("short", 10)).toBe("short");
  });

  it("slice reports the next offset only when text remains", () => {
    expect(slice("abcdef", 4)).toEqual({ text: "abcd", total: 6, nextOffset: 4 });
    expect(slice("abcdef", 4, 4)).toEqual({ text: "ef", total: 6, nextOffset: undefined });
  });
});
