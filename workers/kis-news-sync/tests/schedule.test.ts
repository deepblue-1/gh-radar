import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FAST_WINDOW_END_MIN, FAST_WINDOW_START_MIN, resolveCollectorMode } from "../src/pipeline/cadence";

/**
 * Phase 41-08 — 배포 스크립트(scripts/deploy-kis-news-sync.sh)의 KIS_SCHEDULERS 배열을 직접 읽어
 * 1주일 × 1440분을 전개하고, 수집기 모드 판정(D-02)과 분 단위로 어긋나지 않음을 단언한다
 * (news-sync tests/schedule.test.ts 선례).
 *
 * Cloud Scheduler 는 unix-cron · 요일 0=일요일 · 시각은 --time-zone(Asia/Seoul) 벽시계 기준.
 * 이 phase 의 cron 은 `*` · `*\/N` · `a-b` · `a,b` 만 쓴다 — 그 밖의 꼴은 판정기가 throw 한다.
 */

const SCRIPT_PATH = path.resolve(__dirname, "../../../scripts/deploy-kis-news-sync.sh");
const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");

function parseBashArray(src: string, name: string): string[] {
  const m = new RegExp(`declare -a ${name}=\\(([\\s\\S]*?)\\)`).exec(src);
  if (!m) throw new Error(`array ${name} not found in deploy-kis-news-sync.sh`);
  const body = m[1]
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  return (body.match(/"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/^"|"$/g, ""));
}

const KIS_SCHEDULERS = parseBashArray(SCRIPT, "KIS_SCHEDULERS").map((entry) => {
  const i = entry.indexOf("|");
  if (i < 0) throw new Error(`bad KIS_SCHEDULERS entry: ${entry}`);
  return { name: entry.slice(0, i), cron: entry.slice(i + 1) };
});

// ── 작은 cron 판정기(`*` · `*/N` · `a-b` · `a,b` · 숫자) ─────────────────
function expandField(tok: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of tok.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`unsupported cron token: ${part}`);
    const step = m[2] !== undefined ? Number(m[2]) : 1;
    if (!(step >= 1)) throw new Error(`bad step: ${part}`);
    if (m[2] !== undefined && m[1] !== "*") throw new Error(`step only after *: ${part}`);
    let lo: number;
    let hi: number;
    if (m[1] === "*") {
      lo = min;
      hi = max;
    } else if (m[1].includes("-")) {
      [lo, hi] = m[1].split("-").map(Number) as [number, number];
    } else {
      lo = Number(m[1]);
      hi = lo;
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`out of range: ${part}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

interface Cron {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
}

function parseCron(expr: string): Cron {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron must have 5 fields: ${expr}`);
  if (f[2] !== "*" && f[4] !== "*") throw new Error(`dom and dow both restricted: ${expr}`);
  return {
    minute: expandField(f[0], 0, 59),
    hour: expandField(f[1], 0, 23),
    dom: expandField(f[2], 1, 31),
    month: expandField(f[3], 1, 12),
    dow: expandField(f[4], 0, 6),
  };
}

function kst(y: number, m: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 9, mi));
}

// 2026-11-16(월) ~ 2026-11-22(일) KST · 10,080분 전개
interface Fire {
  dayIdx: number;
  dayMinute: number;
  weekday: boolean;
  name: string;
  at: Date;
}

const parsed = KIS_SCHEDULERS.map((s) => ({ ...s, c: parseCron(s.cron) }));
const fires: Fire[] = [];
const byMinute = new Map<number, string[]>();
for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
  const dom = 16 + dayIdx;
  const dow = new Date(Date.UTC(2026, 10, dom)).getUTCDay();
  for (let h = 0; h < 24; h++) {
    for (let mi = 0; mi < 60; mi++) {
      for (const s of parsed) {
        const { c } = s;
        if (c.minute.has(mi) && c.hour.has(h) && c.dom.has(dom) && c.month.has(11) && c.dow.has(dow)) {
          const dayMinute = h * 60 + mi;
          fires.push({ dayIdx, dayMinute, weekday: dow >= 1 && dow <= 5, name: s.name, at: kst(2026, 11, dom, h, mi) });
          const key = dayIdx * 1440 + dayMinute;
          byMinute.set(key, [...(byMinute.get(key) ?? []), s.name]);
        }
      }
    }
  }
}

const FAST = "gh-radar-kis-news-sync-fast";
const SLOW_WEEKDAY = "gh-radar-kis-news-sync-slow-weekday";
const SLOW_WEEKEND = "gh-radar-kis-news-sync-slow-weekend";
const inFastWindow = (m: number) => m >= FAST_WINDOW_START_MIN && m < FAST_WINDOW_END_MIN;

describe("cron 판정기 자체", () => {
  it("지원 꼴 전개 · 미지원 꼴 throw", () => {
    expect([...expandField("0-6,20-23", 0, 23)]).toEqual([0, 1, 2, 3, 4, 5, 6, 20, 21, 22, 23]);
    expect([...expandField("*/15", 0, 59)]).toEqual([0, 15, 30, 45]);
    expect([...expandField("0,6", 0, 6)]).toEqual([0, 6]);
    expect(() => expandField("L", 0, 59)).toThrow();
    expect(() => expandField("MON", 0, 6)).toThrow();
    expect(() => parseCron("0 0 * *")).toThrow();
  });
});

describe("kis-news-sync Scheduler (scripts/deploy-kis-news-sync.sh KIS_SCHEDULERS)", () => {
  it("① 배열 3개 = fast · slow-weekday · slow-weekend", () => {
    expect(KIS_SCHEDULERS).toHaveLength(3);
    expect(new Set(KIS_SCHEDULERS.map((s) => s.name))).toEqual(new Set([FAST, SLOW_WEEKDAY, SLOW_WEEKEND]));
  });

  it("② 한 분에 둘이 같이 울리지 않는다", () => {
    const overlaps = [...byMinute.entries()].filter(([, ns]) => ns.length > 1);
    expect(overlaps).toEqual([]);
  });

  it("③ 평일 07:00 ~ 19:59 에는 fast 만 · 5분마다 빠짐없이 울린다", () => {
    for (const f of fires.filter((x) => x.weekday && inFastWindow(x.dayMinute))) expect(f.name).toBe(FAST);
    for (const f of fires.filter((x) => x.name === FAST)) {
      expect(f.weekday).toBe(true);
      expect(inFastWindow(f.dayMinute)).toBe(true);
    }
    for (let d = 0; d < 5; d++) {
      const fired = new Set(fires.filter((f) => f.dayIdx === d && f.name === FAST).map((f) => f.dayMinute));
      for (let m = FAST_WINDOW_START_MIN; m < FAST_WINDOW_END_MIN; m += 5) {
        expect(fired.has(m), `weekday ${d} minute ${m}`).toBe(true);
      }
      expect(fired.size).toBe((FAST_WINDOW_END_MIN - FAST_WINDOW_START_MIN) / 5);
    }
  });

  it("④ 그 밖 평일과 주말에는 slow 만 · 15분마다 빠짐없이 울린다", () => {
    for (let d = 0; d < 7; d++) {
      const weekday = d < 5;
      const dayFires = fires.filter((f) => f.dayIdx === d && !(weekday && inFastWindow(f.dayMinute)));
      for (const f of dayFires) expect(f.name).toBe(weekday ? SLOW_WEEKDAY : SLOW_WEEKEND);
      const fired = new Set(dayFires.map((f) => f.dayMinute));
      for (let m = 0; m < 1440; m += 15) {
        if (weekday && inFastWindow(m)) continue;
        expect(fired.has(m), `day ${d} minute ${m}`).toBe(true);
      }
      expect([...fired].every((m) => m % 15 === 0)).toBe(true);
    }
  });

  it("⑤ 울리는 분마다 resolveCollectorMode(…, 'auto') 가 그 Scheduler 이름과 같다", () => {
    const mismatches = fires
      .map((f) => ({ f, got: resolveCollectorMode(f.at, "auto"), want: f.name === FAST ? "fast" : "slow" }))
      .filter((x) => x.got !== x.want)
      .map((x) => `${x.f.name} @ ${x.f.at.toISOString()} → ${x.got}`);
    expect(mismatches).toEqual([]);
  });

  it("⑥ --task-timeout=14h(50400초) ≥ 빠른 창 13시간", () => {
    const m = /^\s+--task-timeout=(\d+)h\s*\\$/m.exec(SCRIPT);
    expect(m).not.toBeNull();
    const timeoutSec = Number(m![1]) * 3600;
    expect(timeoutSec).toBe(50_400);
    expect(timeoutSec).toBeGreaterThanOrEqual((FAST_WINDOW_END_MIN - FAST_WINDOW_START_MIN) * 60);
  });
});
