---
phase: "39"
slug: "trade-diagnosis-chatbot"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-05"
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest — server ^4.1.4(node) · shared ^4 · webapp ^2.1.9(jsdom) + pgTAP(러너 `scripts/verify-dma-orders-price-check.sh --test` · Docker 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`) |
| **Config file** | `server/vitest.config.ts`(include `tests/**` + `src/**` · maxWorkers 기본 2) · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis.test.ts --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_diagnosis.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql` |
| **Estimated runtime** | 태스크 단위 ~30~60초 · 전체 ~5분(동시 세션 없을 때) |

---

## Sampling Rate

- **After every task commit:** 그 태스크 `<verify>` 의 파일 단위 `exec vitest run <파일> --maxWorkers=2`(watch 인 `test` 스크립트 금지) · DB 태스크는 pgTAP 1~2파일
- **After every plan wave:** 건드린 패키지 전체 `exec vitest run --maxWorkers=2` + DB 웨이브면 pgTAP 2파일 — 전체 회귀는 한 세션만(동시 세션 메모리 규칙)
- **Before `/gsd-verify-work`:** Full suite must be green(39-09 Task 1) + `workflow.build_command`
- **Max feedback latency:** 60 seconds(태스크 단위)
- **Spec-less probe fallback:** 건너뜀 — 이 phase 는 요구사항 ID 가 없다(보이는 건너뜀 · 성공 기준 SC-1~SC-5 + D-01~D-12 로 대신)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | SC-4 · D-09 | — | N/A(문서) | 파일 검사 | 43칸 · 토큰 · 「2차 · 이번 구현 제외」 grep 루프 → `NOTE-OK` | ❌ W0(초안 신규) | ✅ green |
| 39-01-02 | 01 | 1 | D-09(costly) | — | N/A | 사용자 검토 | `grep -q "StateTransition = 9" 39-KIND9-NOTE.md` | — | ✅ green |
| 39-01-03 | 01 | 1 | SC-4 · D-11 · D-12 · 결정 1 | — | N/A | 파일 검사 | gh-trade 노트 open · 인박스 done → `SENT-OK` + ROADMAP Phase 39 범위(목록 줄 · 목표 · SC-4 · 미결 ④) 옛 문구 0 · 「해소(D-12)」 → `ROADMAP-OK` | — | ✅ green |
| 39-02-01 | 02 | 1 | SC-4 · D-10 | — | N/A | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-labels.test.ts src/__tests__/strategy-event-text.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run typecheck` | ✅(케이스 추가) | ✅ green |
| 39-02-02 | 02 | 1 | D-10 · Pitfall 6 | — | N/A | unit | shared 전체 + relay 2종 + webapp 주문로그 테스트 | ✅ | ✅ green |
| 39-03-01 | 03 | 1 | SC-2 · D-11 | — | 다른 사용자 계좌 0행 · anon/authenticated EXECUTE 없음 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_diagnosis.test.sql` | ❌ W0 | ✅ green |
| 39-03-02 | 03 | 1 | SC-2 · SC-4 · D-11 | — | 어드민 우회 없음 · dma_user_id/requester 비반환 · 꺼진 서버 제외 | pgTAP | `… dma_diagnosis.test.sql && … dma_strategy_read.test.sql` | ✅(dma_strategy_read 케이스 추가) | ✅ green |
| 39-04-01 | 04 | 1 | SC-1 ② · D-06 · D-07 · D-12 | — | N/A | unit(골든 · 픽스처 `cut1300-krx.ticks.zst`) | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis-market.test.ts tests/routes/ticks.test.ts --maxWorkers=2` | ❌ W0 | ✅ green |
| 39-04-02 | 04 | 1 | D-08 ① · SC-5 | — | 전역 fetch 호출 0 | unit(가짜 tickgw) | `… diagnosis-market.test.ts tests/services/tickgw-client.test.ts` | ❌ W0 | ✅ green |
| 39-04-03 | 04 | 1 | D-08 ② · D-05 | — | 변환 하루 상한 공유 | unit + 스크립트 `--dry` | `… diagnosis-market.test.ts && pnpm --filter @gh-radar/server exec tsx scripts/measure-diagnosis-tokens.ts --dry` | ❌ W0 | ✅ green |
| 39-05-01 | 05 | 2 | SC-3 · D-11 | — | RPC `p_user_id = ctx.userId` | unit(SDK mock) | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis.test.ts src/services/specialists/__tests__/specialists.test.ts src/services/__tests__/chat-service.test.ts --maxWorkers=2` | ❌ W0 | ✅ green |
| 39-05-02 | 05 | 2 | SC-3 · SC-5 · 결정 2 | — | 하루 상한 · refusal 무대체 · 무로그 금지 | unit | `… diagnosis.test.ts src/services/__tests__/chat-orchestrator.test.ts src/services/__tests__/chat-service.test.ts && webapp typecheck` | ❌ W0 / ✅ | ✅ green |
| 39-05-03 | 05 | 2 | SC-2 · D-02 | — | 도구 스키마 계좌 칸 0 · RPC 인자 3개 | unit | `… diagnosis-tools.test.ts diagnosis.test.ts` | ❌ W0 | ✅ green |
| 39-06-01 | 06 | 3 | SC-4 · D-10 | — | N/A | unit + RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/order-log-feed.test.ts src/components/trading/order-log --maxWorkers=2` | ✅(케이스 추가) | ✅ green |
| 39-06-02 | 06 | 3 | D-03 · D-04 | — | 내부 링크는 `/analytics/ticks?` 만 | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/chat --maxWorkers=2` | ✅(케이스 추가) | ✅ green |
| 39-07-01 | 07 | 3 | D-01 · D-03 · SC-2 | — | `req.userId` → ctx 만 | unit | `pnpm --filter @gh-radar/server exec vitest run src/services/__tests__/chat-service.test.ts src/routes/__tests__/chat.route.test.ts src/services/__tests__/chat-orchestrator.test.ts --maxWorkers=2` | ✅(케이스 추가) | ✅ green |
| 39-07-02 | 07 | 3 | D-05 · D-12 · SC-2 | — | 시세 도구 계좌 칸 0 · 4회 상한 | unit | `… diagnosis-tools.test.ts diagnosis.test.ts diagnosis-market.test.ts` | ✅ | ✅ green |
| 39-07-03 | 07 | 3 | SC-3 · SC-1(opt-in) | — | N/A | unit + 스크립트 skip | `… chat-service.test.ts && pnpm --filter @gh-radar/server exec tsx scripts/diagnosis-live.ts` | ✅ / ❌ W0(스크립트) | ✅ green |
| 39-08-01 | 08 | 3 | SC-1 ①② · D-06 | — | N/A | unit | `pnpm --filter @gh-radar/server exec vitest run src/services/specialists/__tests__/diagnosis-knowledge.test.ts --maxWorkers=2` | ❌ W0 | ✅ green |
| 39-08-02 | 08 | 3 | D-04 · D-08 · D-11 | — | 인젝션 방어 절 · 지시/면책 금지 | unit | 같은 파일 | ❌ W0 | ✅ green |
| 39-09-01 | 09 | 4 | 전체 · SC-5 | — | 진단 경로 fetch/axios 0 · relay 무변경 | 회귀 + 대조 | Full suite command + `PREDEPLOY-OK` 대조(토큰 정본 = 저장소 안 `39-KIND9-NOTE.md` · `../gh-trade` 사본은 있을 때만 참고 — 판정 무관) | ✅ | ✅ green |
| 39-09-02 | 09 | 4 | SC-2 · SC-4 · 결정 1 | — | N/A | 배포([BLOCKING]) | `supabase migration list --linked` · `git rev-parse master = origin/master` | — | ✅ green |
| 39-09-03 | 09 | 4 | SC-1 ①② · SC-2 · SC-3 · D-01 · D-04 | — | 다른 사용자 계좌 불가(프로덕션) | 수동 UAT | `supabase migration list --linked` | — | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

프레임워크 설치는 없다(전부 기존). 아래 새 테스트 파일은 별도 Wave 0 플랜이 아니라 각 플랜의 **첫(트레이서) 태스크**가 구현과 함께 만든다 — 트레이서가 끝나면 그 파일이 있다.

- [x] `supabase/tests/dma_diagnosis.test.sql` — SC-2 · kind 9 가시성 (39-03 Task 1 스모크 · Task 2 전체)
- [x] `server/src/services/specialists/__tests__/diagnosis-market.test.ts` — 포맷 골든 · 절단 · 다중 프레임 · 자료 없음 · 변환 분기 · fetch 0 (39-04 Task 1~3)
- [x] `server/src/services/specialists/__tests__/diagnosis.test.ts` — 루프 · 모델 · effort · 마감 · refusal · 상한 · usage (39-05 Task 1~2)
- [x] `server/src/services/specialists/__tests__/diagnosis-tools.test.ts` — 계좌 칸 0 · userId 클로저 · zod · search_stock · 호출 상한 (39-05 Task 3 · 39-07 Task 2)
- [x] `server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts` — 원문 문자열 · 크기 · system 블록 (39-08 Task 1~2)
- [x] 다중 라운드 mock 팩토리 `makeStreamSequence` · `makeToolUseMessage` · `makeEndTurnMessage` · `makeRefusalMessage` · `makeThinkingBlock` — `diagnosis.test.ts` 안 로컬 헬퍼(39-05 Task 1 · 공유 `server/src/services/__tests__/anthropic-mock.ts` 는 export 를 import 만 하고 수정하지 않는다)
- [x] 토큰 실측 스파이크(RESEARCH A1) — `server/scripts/measure-diagnosis-tokens.ts` (39-04 Task 3 · 스크립트 · `--dry` 완료, `countTokens` 실측 1회는 키가 있는 39-09 메인 세션)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| kind 9 노트 초안 검토(칸 배치 · 토큰) | SC-4 · D-09 | 외부 계약(costly) — 사람 판단 | 39-01 Task 2: `open 39-KIND9-NOTE.md` → ① 이대로 ② 고칠 곳 |
| 시험 문항 ①·②(스윕호가변경 임계 3 · 13:10:29.302 단일가 bs 공백 제외) | SC-1 | 실 Anthropic API · 실데이터(11/5 격자 또는 변환) — 비용 · 비결정성 | 39-09 Task 3 A~C · 선택 G(`RUN_DIAGNOSIS_LIVE=1` 스크립트) |
| 다른 사용자 계정으로 같은 질문 → 못 봄 | SC-2 | 프로덕션 계정 · 가시성 데이터 | 39-09 Task 3 D(로컬 증명은 pgTAP · vitest) |
| Cloud Logging 모델별 토큰 | SC-3 | 운영 로그 | 39-09 Task 3 E |
| 주문로그 「상태전이」 칩 · 회색 줄 시각 | D-10 | UI-SPEC 없음 — 눈 확인 | 39-09 Task 3 F(폰 390 · 라이트/다크) |
| 시험 문항 ③(13:10:25 설정 재제출로 선매수 다시 켜짐 · kind 9) | SC-1 ③ · D-11 | gh-trade 서버 kind 9 배포 · 적재 뒤에만 가능 | **처리됨** — 원 문항(11/5)은 kind 9 적재(11/6 17:14~) 전이라 기록 없음 · 대신 11/9 적재 445행 실측 · 39-09 SUMMARY H |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 39s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-06

> 39-09 Task 1 전체 회귀(2026-11-06 15:12 KST): shared 44파일 1149 통과(2 skip) · relay 타입검사 2종 · server 타입검사 · server 53파일 831 통과(재실행 green — 첫 실행 2건은 supertest 소켓 끊김 · 타임아웃 간헐 실패, phase 39 시작 커밋 10e66fb8 에서도 같은 종류 간헐 실패 재현) · webapp 타입검사 · webapp 223파일 5703 통과(1 skip) · pgTAP `dma_diagnosis` 61/61 · `dma_strategy_read` 30/30 · `PREDEPLOY-OK`(이미지 Node v22.23.4 zstd 있음).

## Validation Audit 2026-11-09

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

> 2026-11-09 재실행: shared 라벨·문장 189 · server 진단·챗·틱 165 · webapp 주문로그·챗 139 · pgTAP dma_diagnosis 61/61 · dma_strategy_read 30/30 — 전부 green. 수동 항목(UAT A~F)은 사용자 확인 통과(39-09 SUMMARY).
