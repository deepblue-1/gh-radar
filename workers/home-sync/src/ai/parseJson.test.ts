import { describe, expect, it } from "vitest";
import { extractJsonObject } from "./parseJson";

describe("extractJsonObject", () => {
  it("strips ```json fences and preamble around the object", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("returns null when no JSON object is present", () => {
    expect(extractJsonObject("no json")).toBeNull();
  });
});
