/**
 * Phase 37 (D-19) LAYOUTS — 파이썬 덤프(`__fixtures__/ticks/layouts.json` · gh-trade packets.LAYOUTS)와 필드 이름 ·
 * 오프셋 · 길이 · 종류까지 같다. checkLayout 은 packets.py check_layout 동형(빈틈 · 겹침 · 합 = 크기 · price 11B · time12 12B).
 */
import { describe, it, expect } from "vitest";
import {
  LAYOUTS,
  checkLayout,
  layoutOf,
  LayoutError,
  type Layout,
} from "../ticks/layouts";
import { readTickJson } from "./helpers/tick-digest";

type Dump = Record<string, [string, number, number, string][]>;

describe("LAYOUTS ↔ 파이썬 덤프 layouts.json", () => {
  const dump = readTickJson<Dump>("layouts.json");

  it("키 집합 · 필드 배열이 deep-equal", () => {
    const ts: Dump = {};
    for (const [k, l] of LAYOUTS) ts[k] = l.fields.map((f) => [f.name, f.offset, f.length, f.kind]);
    expect(ts).toEqual(dump);
  });

  it("필드 수 A3 22 · B6 56 · R8 16 · B9 35 · C3 29 · A0 32", () => {
    expect(
      ["A3:186", "B6:590", "R8:116", "B9:414", "C3:400", "A0:632"].map((k) => {
        const l = LAYOUTS.get(k);
        return [l?.tag, l?.size, l?.fields.length];
      }),
    ).toEqual([
      ["A3", 186, 22],
      ["B6", 590, 56],
      ["R8", 116, 16],
      ["B9", 414, 35],
      ["C3", 400, 29],
      ["A0", 632, 32],
    ]);
  });

  it("layoutOf 는 (태그, 길이)가 정확히 맞을 때만", () => {
    const p = (tag: string, len: number): Uint8Array => {
      const b = new Uint8Array(len).fill(32);
      b[0] = tag.charCodeAt(0);
      b[1] = tag.charCodeAt(1);
      return b;
    };
    expect(layoutOf(p("A3", 186))?.table).toBe("a3");
    expect(layoutOf(p("A0", 632))?.table).toBe("a0");
    expect(layoutOf(p("A3", 185))).toBeNull();
    expect(layoutOf(p("A0", 631))).toBeNull();
    expect(layoutOf(p("IA", 186))).toBeNull();
    expect(layoutOf(new Uint8Array(0))).toBeNull();
  });
});

describe("checkLayout — 합성 레이아웃 실패", () => {
  const base = (fields: Layout["fields"], size: number): Layout => ({ table: "a3", tag: "ZZ", size, fields });

  it("겹침", () => {
    expect(() =>
      checkLayout(
        base(
          [
            { name: "a", offset: 0, length: 4, kind: "str" },
            { name: "b", offset: 3, length: 2, kind: "uint" },
          ],
          5,
        ),
      ),
    ).toThrow(LayoutError);
  });

  it("빈틈", () => {
    expect(() =>
      checkLayout(
        base(
          [
            { name: "a", offset: 0, length: 4, kind: "str" },
            { name: "b", offset: 5, length: 2, kind: "uint" },
          ],
          7,
        ),
      ),
    ).toThrow(/빈틈/);
  });

  it("합 ≠ 크기", () => {
    expect(() => checkLayout(base([{ name: "a", offset: 0, length: 4, kind: "str" }], 5))).toThrow(/필드 합 4/);
  });

  it("price 11B · time12 12B · 컬럼명 중복", () => {
    expect(() => checkLayout(base([{ name: "p", offset: 0, length: 10, kind: "price" }], 10))).toThrow(/price 는 11B/);
    expect(() => checkLayout(base([{ name: "t", offset: 0, length: 11, kind: "time12" }], 11))).toThrow(/time12 는 12B/);
    expect(() =>
      checkLayout(
        base(
          [
            { name: "a", offset: 0, length: 1, kind: "str" },
            { name: "a", offset: 1, length: 1, kind: "str" },
          ],
          2,
        ),
      ),
    ).toThrow(/중복/);
  });

  it("실제 레이아웃 6종은 통과", () => {
    for (const l of LAYOUTS.values()) expect(() => checkLayout(l)).not.toThrow();
  });
});
