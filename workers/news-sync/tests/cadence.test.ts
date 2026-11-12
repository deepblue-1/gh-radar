import { describe, it, expect } from "vitest";
import {
  HOT_RANK_MAX,
  REST_BUCKET_COUNT,
  kstDayOfWeek,
  kstMinuteOfDay,
  planRun,
  resolveRunMode,
  restBucketFor,
  selectRunTargets,
  stockBucket,
  type TargetRecord,
} from "../src/pipeline/cadence";
import { buildTargetRecords } from "../src/pipeline/targets";

/**
 * quick-260915-h3p — 장시간 등급 수집 주기.
 * 시각은 전부 UTC Date 로 만든다 (호스트 TZ 비의존).
 */
function kst(y: number, m: number, d: number, h: number, mi: number, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 9, mi, s));
}

// 2026-09-15 = 화요일
const tue = (h: number, mi: number, s = 0) => kst(2026, 9, 15, h, mi, s);

describe("kstMinuteOfDay / kstDayOfWeek", () => {
  it("KST 벽시계 기준 분·요일", () => {
    expect(kstMinuteOfDay(tue(8, 0))).toBe(480);
    expect(kstMinuteOfDay(tue(0, 0))).toBe(0);
    expect(kstMinuteOfDay(tue(23, 59, 59))).toBe(1439);
    expect(kstDayOfWeek(tue(0, 0))).toBe(2);
    expect(kstDayOfWeek(kst(2026, 9, 20, 23, 59))).toBe(0); // 일
    expect(kstDayOfWeek(kst(2026, 9, 19, 0, 0))).toBe(6); // 토
  });
});

describe("resolveRunMode — auto 경계", () => {
  it.each([
    ["07:59", tue(7, 59), "full"],
    ["08:00", tue(8, 0), "tiered"],
    ["19:59", tue(19, 59), "tiered"],
    ["20:00", tue(20, 0), "tiered"],
    ["20:02:59", tue(20, 2, 59), "tiered"],
    ["20:03", tue(20, 3), "full"],
    ["토 10:00", kst(2026, 9, 19, 10, 0), "full"],
    ["일 12:00", kst(2026, 9, 20, 12, 0), "full"],
    ["월 00:00", kst(2026, 9, 14, 0, 0), "full"],
  ] as const)("%s → %s", (_label, now, expected) => {
    expect(resolveRunMode(now, "auto")).toBe(expected);
  });

  it("UTC 2026-09-14T23:00:00Z (= 화 08:00 KST) → tiered", () => {
    expect(resolveRunMode(new Date("2026-09-14T23:00:00Z"), "auto")).toBe("tiered");
  });

  it("override 는 시각보다 우선", () => {
    expect(resolveRunMode(kst(2026, 9, 19, 10, 0), "tiered")).toBe("tiered");
    expect(resolveRunMode(tue(10, 0), "full")).toBe("full");
  });
});

describe("restBucketFor — 3분 슬롯 회전 + 지연 흡수", () => {
  it("연속 슬롯이 +1 mod 3 으로 회전", () => {
    expect(restBucketFor(tue(8, 0))).toBe(1);
    expect(restBucketFor(tue(8, 3))).toBe(2);
    expect(restBucketFor(tue(8, 6))).toBe(0);
  });

  it("같은 3분 슬롯 안의 늦은 시작은 같은 버킷", () => {
    const b = restBucketFor(tue(8, 3, 0));
    expect(restBucketFor(tue(8, 3, 40))).toBe(b);
    expect(restBucketFor(tue(8, 5, 59))).toBe(b);
    expect(restBucketFor(tue(8, 6, 0))).not.toBe(b);
  });

  it("장 마감 경계", () => {
    expect(restBucketFor(tue(20, 0, 0))).toBe(1);
    expect(restBucketFor(tue(20, 2, 30))).toBe(1);
    expect(restBucketFor(tue(19, 57))).toBe(0);
  });
});

describe("stockBucket — 코드 해시 버킷", () => {
  it("결정적이고 0..2 범위", () => {
    for (const c of ["005930", "000660", "035720", "A1", ""]) {
      const b = stockBucket(c);
      expect(stockBucket(c)).toBe(b);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(REST_BUCKET_COUNT);
    }
  });

  it("대표 코드 버킷 잠금 (해시가 바뀌면 조용히 재배치되지 않게)", () => {
    // 구현(FNV-1a + fmix32) 후 실측한 값. 세 대표 코드가 모두 버킷 0 이라
    // 버킷 1·2 에 떨어지는 코드(005380 · 035420)도 함께 잠가 세 버킷 값을 모두 고정한다.
    expect(stockBucket("005930")).toBe(0);
    expect(stockBucket("000660")).toBe(0);
    expect(stockBucket("035720")).toBe(0);
    expect(stockBucket("005380")).toBe(1);
    expect(stockBucket("035420")).toBe(2);
  });

  it("연속 코드 000100..000999 (900개) 버킷별 270~330", () => {
    const counts = [0, 0, 0];
    for (let i = 100; i <= 999; i++) {
      counts[stockBucket(String(i).padStart(6, "0"))]++;
    }
    for (const n of counts) {
      expect(n).toBeGreaterThanOrEqual(270);
      expect(n).toBeLessThanOrEqual(330);
    }
  });
});

// rank 1..100 + 관심종목 4개(rank 5 · rank 70 · top_movers 밖 2개)
function fixtureRecords(): TargetRecord[] {
  const recs: TargetRecord[] = [];
  for (let r = 1; r <= 100; r++) {
    recs.push({
      code: String(100000 + r),
      name: `mover-${r}`,
      rank: r,
      watched: r === 5 || r === 70,
    });
  }
  recs.push({ code: "900001", name: "watch-only-1", rank: null, watched: true });
  recs.push({ code: "900002", name: "watch-only-2", rank: null, watched: true });
  return recs;
}

const RANK70_CODE = String(100000 + 70);

describe("selectRunTargets — 등급 구성", () => {
  it("hot = rank≤30 ∪ watched → 33개, rest 69개", () => {
    const recs = fixtureRecords();
    const { selected, counts } = selectRunTargets(recs, "tiered", 0);
    expect(counts.total).toBe(102);
    expect(counts.hot).toBe(33);
    expect(counts.restTotal).toBe(69);
    expect(selected.length).toBe(33 + counts.restSelected);
    // hot 이 앞에 온다
    const hotCodes = new Set(selected.slice(0, 33).map((t) => t.code));
    for (const t of recs) {
      const isHot = t.watched || (t.rank !== null && t.rank <= HOT_RANK_MAX);
      if (isHot) expect(hotCodes.has(t.code)).toBe(true);
    }
  });

  it("rank 70 관심종목은 hot 에만 있고 rest 로 다시 선택되지 않는다", () => {
    const recs = fixtureRecords();
    for (let b = 0; b < REST_BUCKET_COUNT; b++) {
      const { selected } = selectRunTargets(recs, "tiered", b);
      expect(selected.filter((t) => t.code === RANK70_CODE)).toHaveLength(1);
      expect(selected.findIndex((t) => t.code === RANK70_CODE)).toBeLessThan(33);
    }
  });

  it("버킷 0·1·2 rest 3세트는 서로소이고 합집합이 rest 전체", () => {
    const recs = fixtureRecords();
    const restSets = [0, 1, 2].map((b) => {
      const { selected } = selectRunTargets(recs, "tiered", b);
      return selected.slice(33).map((t) => t.code);
    });
    const all = restSets.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(69);
    for (const s of restSets) expect(s.length).toBeGreaterThan(0);
    const restExpected = recs
      .filter((t) => !t.watched && t.rank !== null && t.rank > HOT_RANK_MAX)
      .map((t) => t.code)
      .sort();
    expect([...all].sort()).toEqual(restExpected);
  });

  it("rank null (관심종목 아님) 은 rest 로 취급", () => {
    const code = "777777";
    const recs: TargetRecord[] = [{ code, name: "n", rank: null, watched: false }];
    const b = stockBucket(code);
    const hit = selectRunTargets(recs, "tiered", b);
    expect(hit.counts).toEqual({ total: 1, hot: 0, restTotal: 1, restSelected: 1 });
    expect(hit.selected.map((t) => t.code)).toEqual([code]);
    const miss = selectRunTargets(recs, "tiered", (b + 1) % REST_BUCKET_COUNT);
    expect(miss.selected).toEqual([]);
  });

  it("모든 선택 결과에서 code 유일 (중복 입력 방어 포함)", () => {
    const recs = fixtureRecords();
    recs.push({ ...recs[0] }); // 중복 code
    for (const mode of ["tiered", "full"] as const) {
      for (let b = 0; b < REST_BUCKET_COUNT; b++) {
        const { selected } = selectRunTargets(recs, mode, b);
        expect(new Set(selected.map((t) => t.code)).size).toBe(selected.length);
      }
    }
  });

  it("full 모드는 records 전체", () => {
    const recs = fixtureRecords();
    const { selected, counts } = selectRunTargets(recs, "full", null);
    expect(selected.map((t) => t.code)).toEqual(recs.map((t) => t.code));
    expect(counts.total).toBe(102);
    expect(counts.hot + counts.restSelected).toBe(102);
  });
});

describe("buildTargetRecords — 순수 조립", () => {
  it("중복 mover 는 작은 rank · watch 전용은 rank null · 마스터 밖은 제외", () => {
    const recs = buildTargetRecords(
      [
        { code: "000001", rank: 40 },
        { code: "000001", rank: 7 },
        { code: "000002", rank: 12 },
        { code: "999999", rank: 1 }, // 마스터에 없음
      ],
      ["000002", "000003", "000003", "888888"], // 888888 마스터에 없음
      [
        { code: "000001", name: "one" },
        { code: "000002", name: "two" },
        { code: "000003", name: "three" },
      ],
    );
    const byCode = new Map(recs.map((r) => [r.code, r]));
    expect(recs).toHaveLength(3);
    expect(byCode.get("000001")).toEqual({ code: "000001", name: "one", rank: 7, watched: false });
    expect(byCode.get("000002")).toEqual({ code: "000002", name: "two", rank: 12, watched: true });
    expect(byCode.get("000003")).toEqual({ code: "000003", name: "three", rank: null, watched: true });
    expect(byCode.has("999999")).toBe(false);
    expect(byCode.has("888888")).toBe(false);
  });

  it("rank null mover 는 rank null 로 남는다", () => {
    const recs = buildTargetRecords(
      [{ code: "000001", rank: null }],
      [],
      [{ code: "000001", name: "one" }],
    );
    expect(recs).toEqual([{ code: "000001", name: "one", rank: null, watched: false }]);
  });
});

describe("planRun — 단일 진입점", () => {
  it("화 08:03 → tiered · restBucket 2 · hot ∪ 버킷 2", () => {
    const recs = fixtureRecords();
    const plan = planRun(tue(8, 3), "auto", recs);
    expect(plan.mode).toBe("tiered");
    expect(plan.restBucket).toBe(2);
    const expected = selectRunTargets(recs, "tiered", 2);
    expect(plan.selected).toEqual(expected.selected);
    expect(plan.counts).toEqual(expected.counts);
    const rest = plan.selected.slice(33);
    for (const t of rest) expect(stockBucket(t.code)).toBe(2);
  });

  it("토요일 → full · restBucket null · 전체", () => {
    const recs = fixtureRecords();
    const plan = planRun(kst(2026, 9, 19, 10, 0), "auto", recs);
    expect(plan.mode).toBe("full");
    expect(plan.restBucket).toBeNull();
    expect(plan.selected).toHaveLength(recs.length);
  });
});
