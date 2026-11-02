/**
 * Phase 37 (D-18) 틱 시각 — `HH:MM:SS.mmm`(KST) ↔ epoch ns(BigInt) 왕복 · lower_bound(수신순).
 */
import { describe, expect, it } from "vitest";
import { KST_OFFSET_NS, dayStartNs, fmtTickTime, lowerBoundRecv, parseTickTime } from "../ticks/tick-time";

const MS = 1_000_000n;
/** KST 시각 → epoch ns (Date.UTC 로 기대값을 따로 만든다 — 구현과 다른 길). */
function kstNs(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number): bigint {
  return BigInt(Date.UTC(y, mo - 1, d, h - 9, mi, s, ms)) * MS;
}

describe("parseTickTime · fmtTickTime", () => {
  it("13:05:07.123 (2026-10-16 KST) = epoch ns", () => {
    expect(parseTickTime("13:05:07.123", "20261016")).toBe(kstNs(2026, 10, 16, 13, 5, 7, 123));
    expect(parseTickTime("13:05:07.123", "2026-10-16")).toBe(kstNs(2026, 10, 16, 13, 5, 7, 123));
  });

  it("밀리초 생략 · 1~2자리 밀리초는 소수 자리", () => {
    expect(parseTickTime("13:05:07", "20261016")).toBe(kstNs(2026, 10, 16, 13, 5, 7, 0));
    expect(parseTickTime("13:05:07.1", "20261016")).toBe(kstNs(2026, 10, 16, 13, 5, 7, 100));
    expect(parseTickTime("13:05:07.12", "20261016")).toBe(kstNs(2026, 10, 16, 13, 5, 7, 120));
    expect(parseTickTime("00:00:00.000", "20261016")).toBe(kstNs(2026, 10, 16, 0, 0, 0, 0));
    expect(parseTickTime("23:59:59.999", "20261016")).toBe(kstNs(2026, 10, 16, 23, 59, 59, 999));
  });

  it("형식이 틀리면 null", () => {
    for (const bad of ["25:00:00.000", "24:00:00", "13:5:7", "13:60:00", "13:00:60", "13:05:07.1234", "13:05", "", "a3:05:07"]) {
      expect(parseTickTime(bad, "20261016")).toBeNull();
    }
    expect(parseTickTime("13:05:07", "2026101")).toBeNull();
    expect(parseTickTime("13:05:07", "20261340")).toBeNull();
  });

  it("fmtTickTime 왕복 · 밀리초 아래는 버린다", () => {
    for (const s of ["08:00:00.000", "13:05:07.123", "19:59:59.999", "00:00:00.001"]) {
      expect(fmtTickTime(parseTickTime(s, "20261016")!)).toBe(s);
    }
    expect(fmtTickTime(kstNs(2026, 10, 16, 9, 1, 2, 3) + 999_999n)).toBe("09:01:02.003");
  });

  it("dayStartNs · KST_OFFSET_NS", () => {
    expect(KST_OFFSET_NS).toBe(32_400_000_000_000n);
    expect(dayStartNs("20261016")).toBe(kstNs(2026, 10, 16, 8, 0, 0, 0));
    expect(dayStartNs("20261016", "2000")).toBe(kstNs(2026, 10, 16, 20, 0, 0, 0));
    expect(() => dayStartNs("2026-13-01")).toThrow(RangeError);
  });
});

describe("lowerBoundRecv", () => {
  // rec 순서 recv: [30, 10, 20, 20, 50] → 수신순 [1, 2, 3, 0, 4]
  const recvNs = BigInt64Array.from([30n, 10n, 20n, 20n, 50n]);
  const recvOrder = Int32Array.from([1, 2, 3, 0, 4]);

  it("recv ≥ t 인 첫 수신순 자리 · 끝을 넘으면 n", () => {
    expect(lowerBoundRecv(recvNs, recvOrder, 0n)).toBe(0);
    expect(lowerBoundRecv(recvNs, recvOrder, 10n)).toBe(0);
    expect(lowerBoundRecv(recvNs, recvOrder, 11n)).toBe(1);
    expect(lowerBoundRecv(recvNs, recvOrder, 20n)).toBe(1);
    expect(lowerBoundRecv(recvNs, recvOrder, 21n)).toBe(3);
    expect(lowerBoundRecv(recvNs, recvOrder, 50n)).toBe(4);
    expect(lowerBoundRecv(recvNs, recvOrder, 51n)).toBe(5);
    expect(lowerBoundRecv(new BigInt64Array(0), new Int32Array(0), 1n)).toBe(0);
  });
});
