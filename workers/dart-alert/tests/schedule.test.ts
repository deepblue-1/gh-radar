import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WINDOW_END_MIN, WINDOW_START_MIN, isInWindow } from "../src/cadence";

/**
 * Phase 43-07 — 배포 스크립트(scripts/deploy-dart-alert.sh)의 WAKE_SCHEDULER · WAKE_SCHEDULE 두 줄을 직접 읽어
 * 1주일 × 1440분을 전개하고, 수집기 창(D-11 · 평일 07:00 ~ 20:00 · cadence.ts)과 분 단위로 어긋나지 않음을 단언한다
 * (workers/kis-news-sync/tests/schedule.test.ts 꼴).
 *
 * Cloud Scheduler 는 unix-cron · 요일 0=일요일 · 시각은 --time-zone(Asia/Seoul) 벽시계 기준.
 * 이 phase 의 cron 은 `*` · `*\/N` · `a-b` · `a,b` 만 쓴다 — 그 밖의 꼴은 판정기가 throw 한다.
 *
 * 덧붙여 배포 스크립트의 --set-secrets · --set-env-vars 가 config.ts(loadConfig)의 필수 env 이름을 모두 싣는지
 * 본다(43-07 key_link — 이름이 갈리면 Job 이 `missing env` 로 매 깨움 종료 1).
 */

const SCRIPT_PATH = path.resolve(__dirname, "../../../scripts/deploy-dart-alert.sh");
const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");
const CONFIG_SRC = readFileSync(path.resolve(__dirname, "../src/config.ts"), "utf8");

/** 줄 머리의 `NAME=값` · `NAME="값"` 상수 하나(정확히 한 줄이어야 한다 — 리뷰 IN-59) */
function bashConst(src: string, name: string): string {
  const all = [...src.matchAll(new RegExp(`^${name}=(?:"([^"]*)"|(\\S+))$`, "gm"))];
  if (all.length !== 1) throw new Error(`${name}= 줄이 deploy-dart-alert.sh 에 ${all.length}개`);
  return all[0]![1] ?? all[0]![2]!;
}

const DART_SCHEDULERS = [{ name: bashConst(SCRIPT, "WAKE_SCHEDULER"), cron: bashConst(SCRIPT, "WAKE_SCHEDULE") }];

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

/** KST 벽시계 → epoch ms */
function kstMs(y: number, m: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, m - 1, d, h - 9, mi);
}

// 2026-11-16(월) ~ 2026-11-22(일) KST · 10,080분 전개
interface Fire {
  dayIdx: number;
  dayMinute: number;
  weekday: boolean;
  name: string;
  atMs: number;
}

const parsed = DART_SCHEDULERS.map((s) => ({ ...s, c: parseCron(s.cron) }));
const fires: Fire[] = [];
for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
  const dom = 16 + dayIdx;
  const dow = new Date(Date.UTC(2026, 10, dom)).getUTCDay();
  for (let h = 0; h < 24; h++) {
    for (let mi = 0; mi < 60; mi++) {
      for (const s of parsed) {
        const { c } = s;
        if (c.minute.has(mi) && c.hour.has(h) && c.dom.has(dom) && c.month.has(11) && c.dow.has(dow)) {
          fires.push({
            dayIdx,
            dayMinute: h * 60 + mi,
            weekday: dow >= 1 && dow <= 5,
            name: s.name,
            atMs: kstMs(2026, 11, dom, h, mi),
          });
        }
      }
    }
  }
}

const WAKE = "gh-radar-dart-alert-wake";

describe("cron 판정기 자체", () => {
  it("지원 꼴 전개 · 미지원 꼴 throw", () => {
    expect([...expandField("7-19", 0, 23)]).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect([...expandField("*/5", 0, 59)]).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect([...expandField("1-5", 0, 6)]).toEqual([1, 2, 3, 4, 5]);
    expect(() => expandField("L", 0, 59)).toThrow();
    expect(() => expandField("MON", 0, 6)).toThrow();
    expect(() => parseCron("0 0 * *")).toThrow();
  });
});

describe("dart-alert Scheduler (scripts/deploy-dart-alert.sh WAKE_SCHEDULER · WAKE_SCHEDULE)", () => {
  it("① Scheduler 하나 = gh-radar-dart-alert-wake · 「*/5 7-19 * * 1-5」", () => {
    expect(DART_SCHEDULERS).toEqual([{ name: WAKE, cron: "*/5 7-19 * * 1-5" }]);
  });

  it("② 모든 깨움이 수집기 창(isInWindow) 안이다 — 밤 · 주말 깨움 0", () => {
    expect(fires.length).toBeGreaterThan(0);
    const outside = fires.filter((f) => !isInWindow(f.atMs)).map((f) => `${f.name} @ ${new Date(f.atMs).toISOString()}`);
    expect(outside).toEqual([]);
    expect(fires.filter((f) => !f.weekday)).toEqual([]);
    for (const f of fires) {
      expect(f.dayMinute).toBeGreaterThanOrEqual(WINDOW_START_MIN);
      expect(f.dayMinute).toBeLessThan(WINDOW_END_MIN);
    }
  });

  it("③ 평일 창 안 5분 경계(07:00 · 07:05 … 19:55)마다 빠짐없이 깨운다", () => {
    for (let d = 0; d < 5; d++) {
      const fired = new Set(fires.filter((f) => f.dayIdx === d).map((f) => f.dayMinute));
      for (let m = WINDOW_START_MIN; m < WINDOW_END_MIN; m += 5) {
        expect(fired.has(m), `weekday ${d} minute ${m}`).toBe(true);
      }
      expect(fired.size).toBe((WINDOW_END_MIN - WINDOW_START_MIN) / 5);
    }
    // 1주일 깨움 수 = 평일 5일 × 156번
    expect(fires.length).toBe(5 * ((WINDOW_END_MIN - WINDOW_START_MIN) / 5));
  });

  it("④ --task-timeout=14h(50400초) ≥ 창 13시간 · --max-retries=0 · --parallelism=1", () => {
    const m = /^\s+--task-timeout=(\d+)h\s*\\$/m.exec(SCRIPT);
    expect(m).not.toBeNull();
    const timeoutSec = Number(m![1]) * 3600;
    expect(timeoutSec).toBe(50_400);
    expect(timeoutSec).toBeGreaterThanOrEqual((WINDOW_END_MIN - WINDOW_START_MIN) * 60);
    expect(SCRIPT).toMatch(/^\s+--max-retries=0\s*\\$/m);
    expect(SCRIPT).toMatch(/^\s+--parallelism=1\s*\\$/m);
  });
});

describe("배포 스크립트 env ↔ config.ts(loadConfig) 이름", () => {
  const required = [...CONFIG_SRC.matchAll(/req\("([A-Z0-9_]+)"\)/g)].map((m) => m[1]);
  const secretsLine = /--set-secrets="([^"]+)"/.exec(SCRIPT)?.[1] ?? "";
  const secretEnvs = secretsLine.split(",").map((kv) => kv.split("=")[0]);
  const envVarsLine = /^ENV_VARS="\^@\^([^"]+)"/m.exec(SCRIPT)?.[1] ?? "";
  const plainEnvs = envVarsLine.split("@").map((kv) => kv.split("=")[0]);

  it("필수 env 6개가 config.ts 에 있다(파싱 확인 · OPENDART_API_KEY_2 포함 — 261113-rn7)", () => {
    expect(new Set(required)).toEqual(
      new Set(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENDART_API_KEY", "OPENDART_API_KEY_2", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]),
    );
  });

  it("필수 env 가 --set-secrets 또는 --set-env-vars 에 모두 실린다", () => {
    const shipped = new Set([...secretEnvs, ...plainEnvs]);
    expect(required.filter((k) => !shipped.has(k))).toEqual([]);
  });

  it("비밀 5개는 Secret :latest 로만 싣는다(이름 고정 · 키 2 = gh-radar-opendart-key-2)", () => {
    expect(secretsLine.split(",").sort()).toEqual(
      [
        "OPENDART_API_KEY=gh-radar-opendart-key:latest",
        "OPENDART_API_KEY_2=gh-radar-opendart-key-2:latest",
        "SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest",
        "TELEGRAM_BOT_TOKEN=gh-radar-telegram-bot-token:latest",
        "TELEGRAM_CHAT_ID=gh-radar-telegram-chat-id:latest",
      ].sort(),
    );
  });

  it("Job 기본 env 에 모드(DART_ALERT_MODE)를 넣지 않는다 — 기본 auto · 수동 모드는 실행에만", () => {
    expect(plainEnvs).toEqual(["SUPABASE_URL", "DART_ALERT_DAILY_BUDGET", "APP_VERSION", "LOG_LEVEL"]);
    expect(CONFIG_SRC).toContain('"DART_ALERT_DAILY_BUDGET"');
  });
});
