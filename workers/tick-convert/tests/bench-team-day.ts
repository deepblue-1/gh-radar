/**
 * 팀 하루 요약 메모리 · 시간 실측(quick 261103-j4d 결정 4) — vitest 가 줍지 않는다(.test 아님). 64만 레코드 규모 격자에서
 * shared `teamDaySummaryOf` 1회의 소요와 최대 RSS 를 잰다. 상한: NXT 64만 기준 계산 ≤ 30초 · 최대 RSS 증가 ≤ 1.5GiB.
 *
 * 합성 격자 = 컷 13시 픽스처(cut1300-nxt / cut1300-krx)를 풀어 레코드 수가 N 이상이 될 때까지 이어 붙인 바이트 —
 * 값의 의미는 없다(같은 seq · 시각이 반복된다) · 규모(레코드 수 · 바이트)만 맞춘다. recv_ns 가 되감기므로 수신순 정렬 경로도 탄다.
 *
 * 실행(최대 RSS 는 /usr/bin/time 의 maximum resident set size — 기준선과의 차이 = 계산 몫):
 *   pnpm --filter @gh-radar/tick-convert exec /usr/bin/time -l node --import tsx tests/bench-team-day.ts --ex NXT --records 640000
 *   pnpm --filter @gh-radar/tick-convert exec /usr/bin/time -l node --import tsx tests/bench-team-day.ts --ex NXT --records 640000 --no-compute
 * 출력 한 줄: ex · records · raw bytes · compute ms · fills · maxRSS(MiB · process.resourceUsage).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { buildTickIndex, concatBytes, teamDaySummaryOf, type TickExchange } from "@gh-radar/shared";

const FIXTURES = path.resolve(__dirname, "../../../packages/shared/src/__fixtures__/ticks");

function argOf(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(): void {
  const argv = process.argv.slice(2);
  const ex = (argOf(argv, "--ex") ?? "NXT") as TickExchange;
  if (ex !== "NXT" && ex !== "KRX") throw new Error(`--ex NXT|KRX (받은 값 ${ex})`);
  const want = Number(argOf(argv, "--records") ?? "640000");
  const compute = !argv.includes("--no-compute");

  const z = zlib.zstdDecompressSync(readFileSync(path.join(FIXTURES, ex === "NXT" ? "cut1300-nxt.ticks.zst" : "cut1300-krx.ticks.zst")));
  const unit = new Uint8Array(z.buffer, z.byteOffset, z.byteLength);
  const perUnit = buildTickIndex(unit, ex === "NXT" ? "nxt" : "krx").n;
  const copies = Math.ceil(want / perUnit);
  const raw = concatBytes(Array.from({ length: copies }, () => unit));
  const records = perUnit * copies;

  let ms = 0;
  let fills = -1;
  let pnl: number | null = null;
  if (compute) {
    const t0 = performance.now();
    const s = teamDaySummaryOf(raw, ex);
    ms = Math.round(performance.now() - t0);
    fills = s.fills;
    pnl = s.pnl?.total_val ?? null;
  }
  const maxRssMiB = Math.round(process.resourceUsage().maxRSS / 1024);
  console.log(
    `[bench-team-day] ex=${ex} records=${records} raw_bytes=${raw.length} compute=${compute} ms=${ms} fills=${fills} ` +
      `pnl=${pnl} maxRSS_MiB=${maxRssMiB}`,
  );
}

main();
