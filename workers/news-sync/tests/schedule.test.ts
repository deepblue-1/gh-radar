import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveRunMode, restBucketFor } from "../src/pipeline/cadence";

/**
 * quick-260915-h3p — 배포 스크립트의 스케줄러 cron 을 직접 읽어 1주를 분 단위로 전개하고
 * 동분 중복 발화 0 · 주간 발화 수 · 워커 모드 판정과의 정합을 단언한다.
 *
 * Cloud Scheduler 는 unix-cron 이며 요일 0=일요일, 시각은 --time-zone(Asia/Seoul) 벽시계 기준.
 */

const SCRIPT_PATH = path.resolve(__dirname, "../../../scripts/deploy-news-sync.sh");
const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");

function parseBashArray(src: string, name: string): string[] {
  const m = new RegExp(`declare -a ${name}=\\(([\\s\\S]*?)\\)`).exec(src);
  if (!m) throw new Error(`array ${name} not found in deploy-news-sync.sh`);
  const body = m[1]
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  return (body.match(/"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/^"|"$/g, ""));
}

const NEWS_SCHEDULERS = parseBashArray(SCRIPT, "NEWS_SCHEDULERS").map((entry) => {
  const i = entry.indexOf("|");
  if (i < 0) throw new Error(`bad NEWS_SCHEDULERS entry: ${entry}`);
  return { name: entry.slice(0, i), cron: entry.slice(i + 1) };
});
const OBSOLETE = parseBashArray(SCRIPT, "OBSOLETE_NEWS_SCHEDULERS");

// ── 최소 unix-cron 전개기 ─────────────────────────────────────────
function expandField(tok: string, min: number, max: number, isDow = false): Set<number> {
  const out = new Set<number>();
  const hi = isDow ? 7 : max;
  for (const part of tok.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`unsupported cron token: ${part}`);
    const step = m[2] !== undefined ? Number(m[2]) : 1;
    if (!(step >= 1)) throw new Error(`bad step: ${part}`);
    let lo: number;
    let up: number;
    if (m[1] === "*") {
      lo = min;
      up = max;
    } else if (m[1].includes("-")) {
      [lo, up] = m[1].split("-").map(Number) as [number, number];
    } else {
      lo = Number(m[1]);
      up = m[2] !== undefined ? max : lo;
    }
    if (lo < min || up > hi || lo > up) throw new Error(`out of range: ${part}`);
    for (let v = lo; v <= up; v += step) out.add(isDow && v === 7 ? 0 : v);
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
  if (f[2] !== "*" && f[4] !== "*") {
    throw new Error(`dom and dow both restricted (OR semantics unsupported): ${expr}`);
  }
  return {
    minute: expandField(f[0], 0, 59),
    hour: expandField(f[1], 0, 23),
    dom: expandField(f[2], 1, 31),
    month: expandField(f[3], 1, 12),
    dow: expandField(f[4], 0, 6, true),
  };
}

function kst(y: number, m: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 9, mi));
}

// 2026-09-14(월) ~ 2026-09-20(일) KST, 10,080분 전개
interface Fire {
  weekMinute: number;
  dayIdx: number;
  dayMinute: number;
  name: string;
  at: Date;
}

const parsed = NEWS_SCHEDULERS.map((s) => ({ ...s, c: parseCron(s.cron) }));
const fires: Fire[] = [];
const byMinute = new Map<number, string[]>();
for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
  const dom = 14 + dayIdx;
  const dow = new Date(Date.UTC(2026, 8, dom)).getUTCDay();
  for (let h = 0; h < 24; h++) {
    for (let mi = 0; mi < 60; mi++) {
      const weekMinute = dayIdx * 1440 + h * 60 + mi;
      for (const s of parsed) {
        const { c } = s;
        if (
          c.minute.has(mi) &&
          c.hour.has(h) &&
          c.dom.has(dom) &&
          c.month.has(9) &&
          c.dow.has(dow)
        ) {
          fires.push({ weekMinute, dayIdx, dayMinute: h * 60 + mi, name: s.name, at: kst(2026, 9, dom, h, mi) });
          const arr = byMinute.get(weekMinute) ?? [];
          arr.push(s.name);
          byMinute.set(weekMinute, arr);
        }
      }
    }
  }
}

describe("cron 전개기 자체", () => {
  it("지원 토큰 전개", () => {
    expect([...expandField("0-6/2,22", 0, 23)]).toEqual([0, 2, 4, 6, 22]);
    expect([...expandField("*/3", 0, 59)].length).toBe(20);
    expect([...expandField("5/20", 0, 59)]).toEqual([5, 25, 45]);
    expect([...expandField("0,6", 0, 6, true)]).toEqual([0, 6]);
    expect([...expandField("7", 0, 6, true)]).toEqual([0]);
  });

  it("미지원 토큰 · 일/요일 동시 제한은 throw", () => {
    expect(() => expandField("L", 0, 59)).toThrow();
    expect(() => expandField("MON", 0, 6, true)).toThrow();
    expect(() => expandField("61", 0, 59)).toThrow();
    expect(() => parseCron("0 0 1 * 1")).toThrow();
    expect(() => parseCron("0 0 * *")).toThrow();
  });
});

describe("news-sync 스케줄러 (scripts/deploy-news-sync.sh NEWS_SCHEDULERS)", () => {
  const MARKET = "gh-radar-news-sync-market";
  const CLOSE = "gh-radar-news-sync-market-close";
  const OFF = "gh-radar-news-sync-offhours";
  const WEEKEND = "gh-radar-news-sync-weekend";

  it("① 활성 4개 = market · offhours · weekend · market-close, 폐기 3개와 교집합 0", () => {
    const names = new Set(NEWS_SCHEDULERS.map((s) => s.name));
    expect(names).toEqual(new Set([MARKET, OFF, WEEKEND, CLOSE]));
    expect(NEWS_SCHEDULERS).toHaveLength(4);
    expect(new Set(OBSOLETE)).toEqual(
      new Set([
        "gh-radar-news-sync-morning",
        "gh-radar-news-sync-morning-10h",
        "gh-radar-news-sync-intraday",
      ]),
    );
    for (const o of OBSOLETE) expect(names.has(o)).toBe(false);
  });

  it("② 어떤 분에도 2개 이상 발화하지 않는다", () => {
    const overlaps = [...byMinute.entries()]
      .filter(([, ns]) => ns.length > 1)
      .map(([wm, ns]) => {
        const d = Math.floor(wm / 1440);
        const hh = String(Math.floor((wm % 1440) / 60)).padStart(2, "0");
        const mm = String((wm % 1440) % 60).padStart(2, "0");
        return `day+${d} ${hh}:${mm} ${ns.join(",")}`;
      });
    expect(overlaps, `overlapping fires:\n${overlaps.join("\n")}`).toEqual([]);
  });

  it("③ 주간 발화 수 market 1200 · market-close 5 · offhours 25 · weekend 24", () => {
    const count = (n: string) => fires.filter((f) => f.name === n).length;
    expect(count(MARKET)).toBe(1200);
    expect(count(CLOSE)).toBe(5);
    expect(count(OFF)).toBe(25);
    expect(count(WEEKEND)).toBe(24);
  });

  it("④ 발화 분마다 워커 auto 모드 판정이 cron 의도와 일치", () => {
    const mismatches: string[] = [];
    for (const f of fires) {
      const expected = f.name === MARKET || f.name === CLOSE ? "tiered" : "full";
      const got = resolveRunMode(f.at, "auto");
      if (got !== expected) mismatches.push(`${f.name} @ ${f.at.toISOString()} → ${got}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("⑤ 평일 480~1200분의 3의 배수 분이 전부 발화하고, tiered 발화마다 restBucket 이 +1 mod 3", () => {
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const dayFires = fires.filter((f) => f.dayIdx === dayIdx);
      const fired = new Set(dayFires.map((f) => f.dayMinute));
      for (let m = 480; m <= 1200; m += 3) {
        expect(fired.has(m), `weekday ${dayIdx} minute ${m} not fired`).toBe(true);
      }
      const tiered = dayFires
        .filter((f) => resolveRunMode(f.at, "auto") === "tiered")
        .sort((a, b) => a.weekMinute - b.weekMinute);
      expect(tiered).toHaveLength(241);
      for (let i = 1; i < tiered.length; i++) {
        const prev = restBucketFor(tiered[i - 1].at);
        expect(restBucketFor(tiered[i].at)).toBe((prev + 1) % 3);
      }
    }
  });

  it("⑥ 주 안에서 연속 발화 간격 최댓값 ≤ 120분", () => {
    const minutes = [...byMinute.keys()].sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < minutes.length; i++) {
      maxGap = Math.max(maxGap, minutes[i] - minutes[i - 1]);
    }
    expect(maxGap).toBeLessThanOrEqual(120);
  });
});
