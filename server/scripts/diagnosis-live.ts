/**
 * Phase 39 (39-07 · SC-1 · 오케스트레이터 결정 4) — 시험 문항 실 API 확인(opt-in).
 *
 * 실 Opus 호출 + 실 DB 를 쓴다(비용 ≈ $0.5/회). 기본 CI · vitest 에 넣지 않는다 — `server/scripts/` 는
 * vitest include(`tests/**` · `src/**`) 밖이다. `RUN_DIAGNOSIS_LIVE=1` 이 아니면 안내만 찍고 exit 0
 * (무거운 모듈은 플래그 확인 뒤 동적 import — 플래그 없이 돌리면 네트워크 호출 0).
 *
 * 실행(메인 세션 · 39-09):
 *   RUN_DIAGNOSIS_LIVE=1 DIAGNOSIS_LIVE_USER_ID=<uuid> pnpm --filter @gh-radar/server exec tsx -r dotenv/config scripts/diagnosis-live.ts
 *   선택: DIAGNOSIS_LIVE_QUESTION="…"(기본 「11/5 13:10 금양그린파워 선매수 왜 나갔어?」)
 *
 * tickgw 는 VPC 안이라 로컬에서 결선하지 않는다 — 지난 날짜(저장 격자 · 요청 변환) 경로만 탄다.
 * 키 · 비밀 값은 출력하지 않는다.
 *
 * 판정(시험 문항 ①②):
 *   LIVE-PASS ①②  — 진단문에 「스윕호가변경」 ∧ (「160,463」 ∨ 「160463」) ∧ (「단일가」 ∨ 「bs 공백」 ∨ 「b_」)  → exit 0
 *   LIVE-WAIT       — 진단문에 「변환 중」(지난 날짜 격자 변환이 막 걸림) — 몇 분 뒤 다시                       → exit 3
 *   LIVE-FAIL       — 그 밖(빠진 항목을 찍는다)                                                              → exit 1
 *   그 밖 exit: 64 = DIAGNOSIS_LIVE_USER_ID 없음/형식 오류 · 2 = ANTHROPIC_API_KEY 없음
 */

if (process.env.RUN_DIAGNOSIS_LIVE !== "1") {
  console.log("RUN_DIAGNOSIS_LIVE=1 일 때만 실행합니다(실 API 비용 발생) — 건너뜀.");
  process.exit(0);
}

const DEFAULT_QUESTION = "11/5 13:10 금양그린파워 선매수 왜 나갔어?";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 판정 — 빠진 항목 목록(빈 배열 = 통과). */
function missingItems(text: string): string[] {
  const missing: string[] = [];
  if (!text.includes("스윕호가변경")) missing.push("스윕호가변경");
  if (!(text.includes("160,463") || text.includes("160463"))) missing.push("160,463");
  if (!(text.includes("단일가") || text.includes("bs 공백") || text.includes("b_"))) {
    missing.push("단일가|bs 공백|b_");
  }
  return missing;
}

async function main(): Promise<number> {
  const userId = process.env.DIAGNOSIS_LIVE_USER_ID ?? "";
  if (!UUID_RE.test(userId)) {
    console.error("DIAGNOSIS_LIVE_USER_ID 가 없거나 uuid 형식이 아닙니다.");
    return 64;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY 없음 — 실행 보류.");
    return 2;
  }
  const question = process.env.DIAGNOSIS_LIVE_QUESTION?.trim() || DEFAULT_QUESTION;

  // 플래그 확인 뒤에만 무거운 모듈을 연다(supabase 클라이언트 · Anthropic SDK · 변환 트리거).
  const { loadConfig } = await import("../src/config.js");
  const { supabase } = await import("../src/services/supabase.js");
  const { createTickConvertTrigger } = await import("../src/services/tick-convert-trigger.js");
  const { consultDiagnosisSpecialist } = await import(
    "../src/services/specialists/diagnosis/diagnosis-specialist.js"
  );

  const cfg = loadConfig();
  // server.ts 와 같은 구성 — TICK_CONVERT_JOB 이 있을 때만 변환 트리거를 만든다.
  const tickConvertTrigger = cfg.tickConvertJob ? createTickConvertTrigger({ job: cfg.tickConvertJob }) : undefined;

  console.log(`질문: ${question}`);
  console.log(`모델: ${cfg.chatDiagnosisModel} · effort ${cfg.chatDiagnosisEffort} · 변환 트리거 ${tickConvertTrigger ? "있음" : "없음"}`);

  const started = Date.now();
  const out = await consultDiagnosisSpecialist(
    supabase,
    { question },
    { userId, deps: { tickConvertTrigger, tickRequestDailyCap: cfg.tickRequestDailyCap } },
  );
  const elapsedMs = Date.now() - started;
  const text = out.display ?? out.text;

  console.log("\n───── 진단문 ─────");
  console.log(text);
  console.log("──────────────────");
  console.log(`걸린 시간: ${(elapsedMs / 1000).toFixed(1)}초`);
  console.log(`usage: ${JSON.stringify(out.usage)}`);

  const missing = missingItems(text);
  if (missing.length === 0) {
    console.log("LIVE-PASS ①②");
    return 0;
  }
  if (text.includes("변환 중")) {
    console.log("LIVE-WAIT 변환 대기 — 몇 분 뒤 다시");
    return 3;
  }
  console.log(`LIVE-FAIL ${missing.join(" · ")}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`LIVE-FAIL 예외: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
