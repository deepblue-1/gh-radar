---
phase: 14
slug: ai-analyst-chatbot
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
updated: 2026-07-02
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 이 phase 는 **이식(port) 중심** — 프레임워크(vitest/Playwright) 전부 기설치, Wave 0 신규 설치 불요.
> 각 구현 task 는 `tdd="true"` + `<behavior>` 로 테스트를 코드와 함께 생성(임베디드 Wave 0).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (서버)** | vitest ^4.1.4 (server) + supertest ^7.2.2 (라우트) |
| **Framework (웹앱)** | vitest ^2.1.9 + @testing-library/react (component) + Playwright ^1.59.1 (E2E) |
| **Config file** | server/vitest.config.* · webapp/vitest.config.* · webapp/playwright.config.* (전부 존재) |
| **Quick run (서버)** | `pnpm --filter server test <pattern>` |
| **Quick run (웹앱)** | `pnpm --filter webapp test <pattern>` |
| **Full suite** | `pnpm --filter server test && pnpm --filter webapp test --run && pnpm --filter webapp exec playwright test chat.spec` |
| **Estimated runtime** | 서버 유닛 ~15s · 웹앱 유닛 ~10s · E2E ~30s |

**공용 mock 픽스처:** `server/src/services/__tests__/anthropic-mock.ts` (P02 Task 3) — makeStreamMock / makeToolUseFinalMessage / makeEndTurnFinalMessage / makeCreateResponse. P04/P05/P06 서버 테스트가 재사용.

---

## Sampling Rate

- **After every task commit:** 해당 패키지 quick run (`pnpm --filter <pkg> test <pattern>`)
- **After every plan wave:** 서버+웹앱 full unit + typecheck/build
- **Before `/gsd-verify-work`:** unit 전부 green + Playwright chat E2E green + production smoke(POST /api/chat SSE 첫 토큰 + 401 미인증)
- **Max feedback latency:** ~60초 (quick run 기준)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | CHAT-01 | T-14-01/13 | 타인 대화 RLS 차단 | grep(migration) | `grep -c "CREATE POLICY" .../20260702170000_*.sql` == 8 | ➕ 생성 | ⬜ |
| 14-01-02 | 01 | 1 | CHAT-01 | T-14-01 | RLS production 적용 | manual(checkpoint) | pg_policies 8행 | N/A | ⬜ |
| 14-02-01 | 02 | 1 | CHAT-01 | — | SSE 계약 컴파일 | typecheck | `pnpm --filter @gh-radar/shared exec tsc --noEmit` | ➕ | ⬜ |
| 14-02-02 | 02 | 1 | CHAT-01 | T-14-04a/14 | kill-switch/모델키 | typecheck | `pnpm --filter server exec tsc --noEmit` | ✅ config.ts | ⬜ |
| 14-02-03 | 02 | 1 | CHAT-01 | — | mock 픽스처 | typecheck | `pnpm --filter server exec tsc --noEmit` | ➕ | ⬜ |
| 14-03-01 | 03 | 2 | CHAT-01 | T-14-02 | 무효토큰 401 | unit | `pnpm --filter server test require-auth` | ➕ | ⬜ |
| 14-03-02 | 03 | 2 | CHAT-01 | T-14-05a | 입력 검증(≤1000자) | typecheck | `pnpm --filter server exec tsc --noEmit` | ➕ | ⬜ |
| 14-03-03 | 03 | 2 | CHAT-01 | T-14-01 | WHERE user_id 소유권 | unit | `pnpm --filter server test chat-history` | ➕ | ⬜ |
| 14-04-01 | 04 | 2 | CHAT-01 | T-14-03/05 | 매매금지·환각금지 프롬프트 | grep+typecheck | `pnpm --filter server exec tsc --noEmit` | ➕ | ⬜ |
| 14-04-02 | 04 | 2 | CHAT-01 | T-14-04b | 전문가 max_tokens≤700·루프없음 | unit | `pnpm --filter server test specialists` | ➕ | ⬜ |
| 14-04-03 | 04 | 2 | CHAT-01 | T-14-04b | web_search max_uses:3 | unit | `pnpm --filter server test specialists` | ➕ | ⬜ |
| 14-05-01 | 05 | 3 | CHAT-01 | T-14-03b | tool dispatch + quote/limitup code guard(D-08) | unit(5) | `pnpm --filter server test chat-orchestrator` | ➕ | ⬜ |
| 14-06-01 | 06 | 4 | CHAT-01 | T-14-04/06 | sanitize/prune/retry/캐싱 | unit | `pnpm --filter server test chat-service` | ➕ | ⬜ |
| 14-06-02 | 06 | 4 | CHAT-01 | T-14-01/02/07 | 인증/keepalive/done | unit(supertest) | `pnpm --filter server test chat.route` | ➕ | ⬜ |
| 14-06-03 | 06 | 4 | CHAT-01 | — | 라우터 결선 | test+build | `pnpm --filter server test` | ✅ app.ts | ⬜ |
| 14-07-01 | 07 | 2 | CHAT-01 | — | markdown 설치 | typecheck | `pnpm --filter webapp exec tsc --noEmit` | ✅ package.json | ⬜ |
| 14-07-02 | 07 | 2 | CHAT-01 | T-14-02c/08 | Bearer + SSE 파싱 | unit | `pnpm --filter webapp test chat-sse` | ➕ | ⬜ |
| 14-07-03 | 07 | 2 | CHAT-01 | — | provider/api | typecheck | `pnpm --filter webapp exec tsc --noEmit` | ➕ | ⬜ |
| 14-08-01 | 08 | 3 | CHAT-01 | T-14-02b | 로그인 게이트 + FAB 종목명 라벨(stockContext) | component | `pnpm --filter webapp test chat-fab` | ➕ | ⬜ |
| 14-08-02 | 08 | 3 | CHAT-01 | T-14-09 | D-03 자동 이어가기 + 전송/abort/면책 | component(4)+typecheck | `pnpm --filter webapp test chat-sheet` | ➕ | ⬜ |
| 14-08-03 | 08 | 3 | CHAT-01 | — | layout/nav 마운트 | build | `pnpm --filter webapp build` | ✅ layout/sidebar | ⬜ |
| 14-09-01 | 09 | 4 | CHAT-01 | T-14-10 | 마크다운 XSS 방어(표) | component | `pnpm --filter webapp test message-render` | ➕ | ⬜ |
| 14-09-02 | 09 | 4 | CHAT-01 | T-14-05c | 국내색상 up/down | component | `pnpm --filter webapp test message-render` | ➕ | ⬜ |
| 14-09-03 | 09 | 4 | CHAT-01 | T-14-05c | oklch 회피 차트 | build | `pnpm --filter webapp build` | ➕ | ⬜ |
| 14-10-01 | 10 | 5 | CHAT-01 | T-14-11 | 삭제 확인 | component | `pnpm --filter webapp test conversation-list` | ➕ | ⬜ |
| 14-10-02 | 10 | 5 | CHAT-01 | T-14-01b | /chat route guard | build | `pnpm --filter webapp build` | ➕ | ⬜ |
| 14-11-01 | 11 | 6 | CHAT-01 | T-14-02d | E2E 로그인게이트+스트리밍 | e2e | `pnpm --filter webapp exec playwright test chat.spec` | ➕ | ⬜ |
| 14-11-02 | 11 | 6 | CHAT-01 | T-14-04d/06b/12 | production 401+SSE+웹서치POC | manual(checkpoint) | curl 401 + SSE 첫토큰 | N/A | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ➕ 생성 예정(Wave 임베디드)*

---

## Wave 0 Requirements

이 phase 는 프레임워크 전부 기설치 → 별도 Wave 0 설치 plan 없음. 테스트 파일은 각 구현 task 에 `tdd="true"` + `<behavior>` 로 임베디드 생성. 단, 공용 SDK mock 은 다운스트림 다수 테스트가 의존하므로 Wave 1(P02)에서 선생성:

- [x] `server/src/services/__tests__/anthropic-mock.ts` — Anthropic SDK 스트리밍/tool_use mock 픽스처 (P02 Task 3, Wave 1 — P04/P05/P06 의존)
- [ ] `server/src/middleware/__tests__/require-auth.test.ts` (P03)
- [ ] `server/src/services/__tests__/chat-history.test.ts` (P03)
- [ ] `server/src/services/specialists/__tests__/specialists.test.ts` (P04)
- [ ] `server/src/services/__tests__/chat-orchestrator.test.ts` (P05)
- [ ] `server/src/services/__tests__/chat-service.test.ts` (P06 — ww-bot 원본 sanitize/prune 테스트 이식 가능)
- [ ] `server/src/routes/__tests__/chat.route.test.ts` (P06, supertest)
- [ ] `webapp/src/lib/__tests__/chat-sse.test.ts` (P07)
- [ ] `webapp/src/components/chat/__tests__/chat-fab.test.tsx` (P08 Task 1)
- [ ] `webapp/src/components/chat/__tests__/chat-sheet.test.tsx` (P08 Task 2 — D-03 자동 이어가기 4케이스)
- [ ] `webapp/src/components/chat/__tests__/message-render.test.tsx` (P09)
- [ ] `webapp/src/components/chat/__tests__/conversation-list.test.tsx` (P10)
- [ ] `webapp/e2e/specs/chat.spec.ts` (P11, Playwright PORT=3100)

*프레임워크 설치: 불요 (vitest/supertest/Playwright/@testing-library 전부 기설치).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| production db push (RLS 8정책 적용) | CHAT-01 | Supabase 원격 상태 변경 — build/type 은 push 없이 통과(false-positive) | P01 Task 2 checkpoint — `supabase db push` + pg_policies 8행 |
| production SSE 첫 토큰 + 미인증 401 | CHAT-01 | 실서버 스트리밍/네트워크 | P11 Task 2 checkpoint — curl 401 + 유효토큰 SSE 첫토큰 |
| web_search 모델 실측(Haiku vs Sonnet) | CHAT-01 | Anthropic 콘솔 활성화 + 런타임 동작 | P11 Task 2 — 웹서치 질문 POC, 미지원 시 env 폴백 |
| 챗 UI 육안(스트리밍/미니카드/국내색상/면책) | CHAT-01 | 시각 검증 | P11 Task 2 — 프로덕션 로그인 후 FAB 대화 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0/checkpoint dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (checkpoint 는 manual 명시)
- [x] Wave 0 covers all MISSING references (임베디드 tdd + P02 공용 mock)
- [x] No watch-mode flags (`--run` / 단발 pattern)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
