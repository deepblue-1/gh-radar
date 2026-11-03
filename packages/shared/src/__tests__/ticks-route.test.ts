/**
 * Phase 37 변환 Job 라우팅 프리미티브 — 전문 → (ISIN 키 · 거래소) · 15% 판정 · 종목·일 등락률 추적.
 * 정본: RESEARCH Pattern 11(태그별 ISIN 오프셋 — packets.py 레이아웃의 isin 필드 오프셋) ·
 *       gh-trade tickana/batch.py:209-247 detect_isins(base = px − chg · pct '1'/'2' · 정수 곱셈) ·
 *       tickana/teamflow.py:246-258 prepare_frame(기준가 = px − 부호×chg 의 최빈값) · docs/analysis/team-flow.md §5.
 * 합성 페이로드는 RawPacketFixtures.h 꼴의 ASCII 고정폭 바이트(공백 채움)다.
 */
import { describe, it, expect } from "vitest";
import {
  ISIN_OFFSET,
  tagOf,
  isinKeyOf,
  exchangeLabelOf,
  hits15,
  DayRateTracker,
} from "../ticks/route";
import { LAYOUTS } from "../ticks/layouts";

const ISIN = "KR7101360006";

/** 공백 채운 len 바이트 전문 — 앞 tag+infoCat, at 오프셋에 text. */
function payload(tag: string, infoCat: string, len: number, at?: number, text?: string): Uint8Array {
  const b = new Uint8Array(len).fill(32);
  const head = tag + infoCat;
  for (let i = 0; i < head.length && i < len; i++) b[i] = head.charCodeAt(i);
  if (at !== undefined && text !== undefined) {
    for (let i = 0; i < text.length && at + i < len; i++) b[at + i] = text.charCodeAt(i);
  }
  return b;
}

describe("ISIN_OFFSET — 레이아웃 isin 필드 오프셋과 같다", () => {
  it("A3/B6 17 · R8 15 · B9/C3 5 · A0 27", () => {
    expect(ISIN_OFFSET).toEqual({ A3: 17, B6: 17, R8: 15, B9: 5, C3: 5, A0: 27 });
  });

  it("LAYOUTS 의 isin 필드 오프셋과 한 칸도 다르지 않다", () => {
    for (const l of LAYOUTS.values()) {
      const f = l.fields.find((x) => x.name === "isin");
      expect({ tag: l.tag, off: f?.offset }).toEqual({ tag: l.tag, off: ISIN_OFFSET[l.tag] });
    }
  });
});

describe("tagOf · isinKeyOf · exchangeLabelOf", () => {
  it("tagOf = 앞 2바이트 ASCII", () => {
    expect(tagOf(payload("A3", "01S", 186))).toBe("A3");
    expect(tagOf(payload("IA", "000", 40))).toBe("IA");
  });

  it.each([
    ["A3", "01S", 186, 17],
    ["B6", "01Q", 590, 17],
    ["R8", "01S", 116, 15],
    ["B9", "01S", 414, 5],
    ["C3", "01S", 400, 5],
    ["A0", "01S", 632, 27],
  ] as const)("%s 오프셋에서 12자 ISIN", (tag, ic, len, off) => {
    expect(isinKeyOf(payload(tag, ic, len, off, ISIN))).toBe(ISIN);
  });

  it("길이가 레이아웃과 달라도 같은 태그면 같은 오프셋(규격 변경 전문도 「기타」 행으로 남는다)", () => {
    expect(isinKeyOf(payload("A3", "01S", 190, 17, ISIN))).toBe(ISIN);
    expect(isinKeyOf(payload("A0", "01S", 631, 27, ISIN))).toBe(ISIN);
    expect(isinKeyOf(payload("B6", "51Q", 600, 17, ISIN))).toBe(ISIN);
  });

  it("모르는 태그(IA 등)는 null", () => {
    expect(isinKeyOf(payload("IA", "000", 100, 17, ISIN))).toBeNull();
    expect(isinKeyOf(payload("I2", "000", 100, 5, ISIN))).toBeNull();
  });

  it("오프셋+12 가 길이를 넘으면 null", () => {
    expect(isinKeyOf(payload("A3", "01S", 28, 17, ISIN))).toBeNull();
    expect(isinKeyOf(payload("B9", "01S", 16, 5, ISIN))).toBeNull();
    expect(isinKeyOf(new Uint8Array([65]))).toBeNull();
  });

  it("[A-Z0-9]{12} 가 아니면 null(공백 · 소문자)", () => {
    expect(isinKeyOf(payload("A3", "01S", 186))).toBeNull();
    expect(isinKeyOf(payload("A3", "01S", 186, 17, "kr7101360006"))).toBeNull();
    expect(isinKeyOf(payload("A3", "01S", 186, 17, "KR710136000 "))).toBeNull();
  });

  it("exchangeLabelOf — 정보구분 첫 글자 '0' → KRX · '5' → NXT · 그 밖 null", () => {
    expect(exchangeLabelOf(payload("A3", "01S", 186))).toBe("KRX");
    expect(exchangeLabelOf(payload("B6", "51Q", 590))).toBe("NXT");
    expect(exchangeLabelOf(payload("B9", "01S", 414))).toBe("KRX");
    expect(exchangeLabelOf(payload("C3", "51Q", 400))).toBe("NXT");
    expect(exchangeLabelOf(payload("A3", "91S", 186))).toBeNull();
    expect(exchangeLabelOf(new Uint8Array([65, 51]))).toBeNull();
  });
});

describe("hits15(pct, chg, px) — 119 배치 탐지와 같은 정수식 · DayRateTracker.add 와 같은 인자 순서", () => {
  it("정확히 +15% 는 포함", () => {
    expect(hits15("2", 1500, 11500)).toBe(true);
  });
  it("+15% 바로 아래는 아님", () => {
    expect(hits15("2", 1499, 11499)).toBe(false);
  });
  it("상한('1')도 상승으로 본다", () => {
    expect(hits15("1", 3000, 13000)).toBe(true);
  });
  it("pct 가 '1'/'2' 가 아니면 false", () => {
    expect(hits15("3", 5000, 20000)).toBe(false);
    expect(hits15("5", 5000, 20000)).toBe(false);
  });
  it("base ≤ 0 이면 false", () => {
    expect(hits15("2", 1000, 1000)).toBe(false);
    expect(hits15("2", 1500, 1000)).toBe(false);
  });
  it("임계를 바꿀 수 있다(정수 경계)", () => {
    expect(hits15("2", 2000, 12000, 20)).toBe(true);
    expect(hits15("2", 1999, 11999, 20)).toBe(false);
  });
});

describe("DayRateTracker — 종목·일 기준가(최빈값) · 등락률 · 15% 도달", () => {
  it("기준가 = px − 부호×chg 의 최빈값(부호 '1'/'2' +1 · '4'/'5' −1 · 그 밖 0)", () => {
    const t = new DayRateTracker();
    expect(t.base()).toBeNull();
    t.add("2", 500, 10500); // 10000
    t.add("5", 200, 9800); // 10000
    t.add("3", 0, 10000); // 10000
    t.add("2", 600, 11000); // 10400 (한 번)
    expect(t.base()).toBe(10000);
  });

  it("동률이면 더 작은 값(pandas mode().iat[0])", () => {
    const t = new DayRateTracker();
    t.add("2", 100, 10200); // 10100
    t.add("2", 100, 10100); // 10000
    expect(t.base()).toBe(10000);
  });

  it("highRate · lastRate 는 기준가 대비 퍼센트 원값 · hit15 는 add 중 한 번이라도 hits15", () => {
    const t = new DayRateTracker();
    t.add("2", 1000, 11000);
    t.add("2", 1000, 11000);
    expect(t.hit15).toBe(false);
    t.add("1", 3000, 13000);
    t.add("2", 2000, 12000);
    expect(t.base()).toBe(10000);
    expect(t.highRate()).toBeCloseTo(30, 10);
    expect(t.lastRate()).toBeCloseTo(20, 10);
    expect(t.hit15).toBe(true);
  });

  it("빈 추적기는 null", () => {
    const t = new DayRateTracker();
    expect(t.highRate()).toBeNull();
    expect(t.lastRate()).toBeNull();
    expect(t.hit15).toBe(false);
  });
});
