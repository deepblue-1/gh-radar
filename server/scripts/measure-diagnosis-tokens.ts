/**
 * Phase 39 (39-04 · RESEARCH A1) — 시세 도구 한 줄 포맷의 토큰 실측.
 *
 * 픽스처 `cut1300-krx.ticks.zst`(에코앤드림 KR7101360006 10/16 13:00~ KRX 컷)를 진단 시세 도구와 **같은 포맷 함수**
 * (`formatA3Line` · `formatB6Line`)로 찍어 줄 길이 · 창 레코드 수 분포를 내고, `--dry` 가 아니면 Anthropic
 * `messages.countTokens`(무료 · 모델 호출 아님)로 A3 100줄 · B6 100줄 · 400건 혼합 블록의 토큰 수를 잰다.
 * 400건 블록이 30K 토큰을 넘으면 `MARKET_MAX_RECORDS` 를 `floor(400 × 20000 / 실측)` 으로 낮춘다(D-05 「N · M 은 실측으로」).
 *
 * 실행:  pnpm --filter @gh-radar/server exec tsx -r dotenv/config scripts/measure-diagnosis-tokens.ts [--dry]
 * 키 값은 출력하지 않는다. 키가 없으면 「ANTHROPIC_API_KEY 없음 — 실측 보류」 후 exit 2.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { decodeAny, iterRecords, splitZstdFrames } from "@gh-radar/shared";

import { getChatAnthropicClient } from "../src/services/specialists/anthropic-client.js";
import {
  formatA3Line,
  formatB6Line,
  MARKET_LEGEND,
  MARKET_MAX_RECORDS,
  MARKET_WINDOW_MAX_MS,
} from "../src/services/specialists/diagnosis/diagnosis-market.js";

const MODEL = "claude-opus-5-5";
const DRY = process.argv.includes("--dry");
const FIXTURE = fileURLToPath(
  new URL("../../packages/shared/src/__fixtures__/ticks/cut1300-krx.ticks.zst", import.meta.url),
);

type Line = { table: "a3" | "b6"; exNs: bigint; text: string };

function loadLines(): Line[] {
  const compressed = new Uint8Array(fs.readFileSync(FIXTURE));
  const out: Line[] = [];
  for (const frame of splitZstdFrames(compressed)) {
    const raw = new Uint8Array(zlib.zstdDecompressSync(frame));
    for (const r of iterRecords(raw)) {
      const d = decodeAny(raw.subarray(r.off, r.off + r.len), r.recvNs, "KRX");
      if (d.table !== "a3" && d.table !== "b6") continue;
      const ex = d.table === "a3" ? d.row.trade_time_ns : d.row.proc_time_ns;
      out.push({
        table: d.table,
        exNs: typeof ex === "bigint" ? ex : r.recvNs,
        text: d.table === "a3" ? formatA3Line(d.row) : formatB6Line(d.row),
      });
    }
  }
  return out;
}

const avg = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, x) => a + x, 0) / xs.length);
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/** 1초 간격 시작점마다 [s, s+win) 안 레코드 수(거래소 시각 기준) — 정렬된 분포. */
function windowCounts(lines: Line[], winMs: number): number[] {
  const ts = lines.map((l) => l.exNs).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ts.length === 0) return [];
  const sec = 1_000_000_000n;
  const win = BigInt(winMs) * 1_000_000n;
  const counts: number[] = [];
  let lo = 0;
  let hi = 0;
  for (let s = ts[0]!; s <= ts[ts.length - 1]!; s += sec) {
    while (lo < ts.length && ts[lo]! < s) lo++;
    if (hi < lo) hi = lo;
    while (hi < ts.length && ts[hi]! < s + win) hi++;
    counts.push(hi - lo);
  }
  return counts.sort((a, b) => a - b);
}

const block = (ls: string[]): string => [MARKET_LEGEND, ...ls].join("\n");

async function main(): Promise<void> {
  const lines = loadLines();
  const a3 = lines.filter((l) => l.table === "a3");
  const b6 = lines.filter((l) => l.table === "b6");
  console.log(`픽스처: cut1300-krx.ticks.zst · A3 ${a3.length}건 · B6 ${b6.length}건`);
  console.log(`A3 평균 길이: ${avg(a3.map((l) => l.text.length)).toFixed(1)}자`);
  console.log(`B6 평균 길이: ${avg(b6.map((l) => l.text.length)).toFixed(1)}자`);
  console.log(`범례 길이: ${MARKET_LEGEND.length}자`);
  for (const winMs of [10_000, 30_000, MARKET_WINDOW_MAX_MS]) {
    const c = windowCounts(lines, winMs);
    console.log(
      `${winMs / 1000}초 창 레코드: p50 ${pct(c, 50)} · p90 ${pct(c, 90)} · p99 ${pct(c, 99)} · max ${c[c.length - 1] ?? 0}`,
    );
  }

  const blocks = {
    a3_100: block(a3.slice(0, 100).map((l) => l.text)),
    b6_100: block(b6.slice(0, 100).map((l) => l.text)),
    mixed_400: block(lines.slice(0, MARKET_MAX_RECORDS).map((l) => l.text)),
  };
  for (const [k, v] of Object.entries(blocks)) console.log(`블록 ${k}: ${v.length}자`);

  if (DRY) {
    console.log("--dry: countTokens 를 부르지 않는다");
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log("ANTHROPIC_API_KEY 없음 — 실측 보류");
    process.exit(2);
  }
  const client = getChatAnthropicClient(key);
  const tokens: Record<string, number> = {};
  for (const [k, v] of Object.entries(blocks)) {
    const r = await client.messages.countTokens({ model: MODEL, messages: [{ role: "user", content: v }] });
    tokens[k] = r.input_tokens;
    console.log(`토큰 ${k}: ${r.input_tokens}`);
  }
  const mixed = tokens.mixed_400!;
  console.log(`400건 혼합 블록: ${mixed} 토큰 · 건당 ≈ ${(mixed / MARKET_MAX_RECORDS).toFixed(1)}`);
  if (mixed > 30_000) {
    console.log(`30K 초과 → MARKET_MAX_RECORDS 권고 = floor(400 × 20000 / ${mixed}) = ${Math.floor((400 * 20000) / mixed)}`);
  } else {
    console.log("30K 이하 → MARKET_MAX_RECORDS 400 유지");
  }
}

main().catch((e: unknown) => {
  console.error(`실측 실패: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
