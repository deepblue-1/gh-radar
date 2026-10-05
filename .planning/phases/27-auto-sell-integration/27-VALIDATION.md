---
phase: "27"
slug: "auto-sell-integration"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-05"
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4 (relay node · webapp jsdom · shared node) + Playwright 1.59 (webapp e2e) |
| **Config file** | `relay/vitest.config.ts` · `webapp/vitest.config.ts` · shared 기본 · `webapp/playwright.config.ts` |
| **Quick run command** | 표면별 — RESEARCH.md 「Validation Architecture」 의 shared / relay / webapp unit / webapp e2e 명령 그대로 (Phase 25/26 플랜에서 실제로 쓴 형태) |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` 그리고 `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |
| **Estimated runtime** | 표면별 quick ~30~90초 · 전체 ~5분 · e2e 3 spec 별도 |

---

## Sampling Rate

- **After every task commit:** 그 태스크 `<verify>` 의 표면별 quick 명령(아래 표 Automated Command — `-t "Phase 27"` 필터 · verbose)
- **After every plan wave:** Full suite(위 표) — `parallelization: false` 라 플랜마다 순차 실행되고 웨이브 경계 = 플랜 경계
- **Before `/gsd-verify-work`:** Full suite + `pnpm --filter @gh-radar/shared exec vitest run` + server typecheck · `tests/routes/strategy-events.test.ts` + e2e 7 spec(27-09 Task 1) + 동기화 `--check` 0 — 전부 green
- **Max feedback latency:** 단위 ~90 초 · e2e 단일 spec ~180 초(`.next` 캐시로 webServer 타임아웃이면 `rm -rf webapp/.next`)

---

## Per-Task Verification Map

REQUIREMENTS 매핑 ID 없음 — Requirement 열은 ROADMAP Goal(G①~G⑤) + CONTEXT D-id. `security_enforcement: false` 라 Threat Ref 는 「—」, Secure Behavior 는 기능 방어선만 적는다.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | G① · G② · 결손 ② | — | 에코 전용 4필드 요청 미적재 · schema 파생만 | tracer(sync check + typecheck + relay/webapp full + relay 왕복 + 웹 lc.set) | `sync-relay-schema.sh --check`(마커 2404509b · blob 68679e9a) · typecheck 체인 · `relay run test && webapp run test` · `vitest run tests/fanout.test.ts -t "autosell"` · `webapp exec vitest run lc-tracer.test.tsx -t "Phase 27"` | ✅(단언 갱신 · ⑰-autosell · lc-tracer Phase 27 신규 케이스) | ⬜ pending |
| 27-01-02 | 01 | 1 | G② · G④ · D-04 · 결손 ① | — | 자동만 켠 등록 ≠ 삭제/철거(`isDeleteIntent` ↔ `#isTeardown` 한 커밋) · LED 클릭 불가 | unit + e2e | typecheck 체인 · `relay exec vitest run tests/fanout.test.ts && webapp exec vitest run latch-led.test.tsx card-header.test.tsx strategy-log.test.tsx limit-chaser.test.ts` · `playwright test trading-workbench.spec.ts -g "P27-1"` | ✅(LED 3→4칩 단언 갱신 · P27-1 신규 케이스) | ⬜ pending |
| 27-01-03 | 01 | 1 | G② · D-04 · Pitfall 1·2·4·5·7 | — | 자동만 켠 등록 ≠ 삭제/철거 · 85 debug 드롭 | unit | `relay exec vitest run src/dma/__tests__/envelope.test.ts tests/hub.test.ts tests/fanout.test.ts tests/protocol.test.ts -t "Phase 27"` · `webapp exec vitest run limit-chaser.test.ts latch-led.test.tsx card-header.test.tsx strategy-log.test.tsx -t "Phase 27"` | ✅ | ⬜ pending |
| 27-02-01 | 02 | 2 | G② · D-09(relay 몫) | — | 41 ISIN/계좌/거래소 가드 · present 미적재 | unit | `relay exec vitest run src/dma/__tests__/envelope.test.ts -t "Phase 27 요청 조립기"` | ✅ | ⬜ pending |
| 27-02-02 | 02 | 2 | G② · Pitfall 4·10·11 | — | 41 계좌 화이트리스트(IDOR) · 세션 없음 거부 · 84 지어내기 0 · 54 새 src 3종 무해석 통과 | integration | `relay exec vitest run tests/ws-autosell.test.ts tests/protocol.test.ts tests/fanout.test.ts tests/hub.test.ts -t "Phase 27"` · `relay run test` | ❌ W0(`tests/ws-autosell.test.ts` — 이 태스크가 만든다) | ⬜ pending |
| 27-03-01 | 03 | 2 | G③ · D-14(색) · D-15 · D-16 · D-17 | — | 토큰 정확 일치 · 프로토타입 키 방어 | unit | `shared exec vitest run src/__tests__/strategy-event-labels.test.ts src/__tests__/strategy-display.test.ts -t "Phase 27"` · shared 전체 + relay/webapp/server typecheck | ✅ | ⬜ pending |
| 27-03-02 | 03 | 2 | G③ · D-15 · 조립기 규약 · WR-05 | — | 본문 · reason 꼬리 파싱 금지 | unit(골든) | `shared exec vitest run src/__tests__/strategy-event-text.test.ts -t "Phase 27"` · server strategy-events 라우트 | ✅(픽스처 `STRATEGY_AUTO_SELL_ROWS` 이 태스크가 만든다) | ⬜ pending |
| 27-04-01 | 04 | 3 | G④ · D-01 · D-02 · D-03 · Pitfall 5 | — | 켜는 확정만 범위 검사(소켓 종료 차단) · 끄기 미판정 | unit | `webapp exec vitest run lc-fields.test.ts use-lc-field-commit.test.tsx card-body.test.tsx -t "Phase 27"` | ✅ | ⬜ pending |
| 27-04-02 | 04 | 3 | G④ · D-01 · D-02 · D-03 | — | 낙관 반영 없음 | component + e2e | `webapp exec vitest run setting-group.test.tsx limit-chaser-form.test.tsx -t "Phase 27"` · `webapp run test` · `playwright test trading-workbench.spec.ts -g "P27-"` | ✅(P27-2 신규 케이스) | ⬜ pending |
| 27-05-01 | 05 | 4 | G④ · D-05 · D-07 · D-08 · D-09 · 결손 ③ | — | 54 본문 미판독 · 15:40 귀속 무변경 | unit | `webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/lib/__tests__/strategy-log-feed.test.tsx -t "Phase 27"` | ✅ | ⬜ pending |
| 27-05-02 | 05 | 4 | G④ · D-06 · D-08 · D-09 | — | 재전송 0 · 기대 전이로만 해제 · 거부 출처 3종(AutoSellCommand · Account · Relay) 표시 가드 OR · 렌더/전송 가드 같은 `server` | component(fake timer) | `webapp exec vitest run strategy-card.test.tsx strategy-card-flow.test.tsx` | ✅ | ⬜ pending |
| 27-05-03 | 05 | 4 | G④ · D-05 · D-07 · D-08 | — | 확인창 없음 · 상호 배제 | component + e2e | `webapp exec vitest run limit-chaser-form.test.tsx card-body.test.tsx -t "Phase 27"` · `webapp run test` · `playwright test trading-workbench.spec.ts -g "P27-"` | ✅(P27-3 신규 케이스) | ⬜ pending |
| 27-06-01 | 06 | 4 | G④ · 84 3상태 | — | 지어낸 기본값 0 | unit | `webapp exec vitest run relay-socket.test.ts numpad.test.ts -t "Phase 27"` | ✅ | ⬜ pending |
| 27-06-02 | 06 | 4 | G④ · D-10 · D-13 · 인박스 Q1/Q2 | — | present=false 자동 42 0 | component | `webapp exec vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx src/components/trading/__tests__/me-client.test.tsx -t "Phase 27"` | ❌ W0(`components/me/__tests__/limit-chaser-defaults.test.tsx` — 이 태스크가 만든다) | ⬜ pending |
| 27-06-03 | 06 | 4 | G④ · D-12 · Pitfall 8 | — | 42 = 84 캐시 + 1칸 · 1건 비행 · 재전송 0 | component + e2e | `webapp exec vitest run limit-chaser-defaults.test.tsx` · `webapp run test` · `playwright test me.spec.ts -g "P27-M1"` | ✅(Task 2 이후) | ⬜ pending |
| 27-07-01 | 07 | 5 | G④ · D-11 · Pitfall 9 | — | 범위 밖 칸 상수 폴백 | unit | `webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts -t "Phase 27 84 시딩"` | ✅ | ⬜ pending |
| 27-07-02 | 07 | 5 | G④ · D-11 | — | 시딩 전송 0 · 에코 우선 | component + e2e | `webapp exec vitest run limit-chaser-form.test.tsx` · `webapp run test` · `playwright test trading-workbench.spec.ts -g "P27-"` | ✅(P27-4 신규 케이스) | ⬜ pending |
| 27-08-01 | 08 | 3 | G④ · D-14 · 정보성 Q5·Q8 | — | — | unit | `webapp exec vitest run order-log-feed.test.ts order-log-filters.test.tsx -t "Phase 27"` | ✅ | ⬜ pending |
| 27-08-02 | 08 | 3 | G④ · D-14 | — | — | e2e | `playwright test e2e/specs/order-log.spec.ts` · `webapp run test` | ✅(P27-O1 신규 케이스) | ⬜ pending |
| 27-09-01 | 09 | 6 | G⑤ | — | 배포 명령 미실행 | gate | `--check` 0 · 전체 typecheck + relay/webapp/shared/server test · e2e 7 spec | ✅ | ⬜ pending |
| 27-09-02 | 09 | 6 | G⑤ | — | 메인 세션만 배포 · DMA_HOST 미주입 | manual(checkpoint) | — (아래 Manual-Only) | — | ⬜ pending |
| 27-09-03 | 09 | 6 | G⑤ · 인박스 done | — | 경로 지정 커밋 | cli | frontmatter `status: done` · 8자 `done_commit` · HEAD 파일 = 노트 1개 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 항목은 별도 웨이브가 아니라 **그것을 처음 쓰는 태스크의 RED 단계**에서 만든다(tdd="true" · 테스트 먼저). 그래서 `<automated>MISSING — Wave 0 …` 센티널을 쓴 태스크는 없다.

- [ ] `relay/tests/helpers/frames.ts` — `buildUserSettingsFrame` · `FakeUserSettingsInput` · `FakeLimitChaserInput` 8필드 → 27-01 Task 1
- [ ] `relay/tests/helpers/fake-gateway.ts` — `readSetLimitChaserRequest` 4필드 + `autoSellEchoSlotsEmpty` → 27-01 Task 1 · 41/42 기록 · `readAutoSellCommandRequest` · `readSetUserSettingsRequest` · `sendUserSettings` · `seedUserSettings`(43 자동응답 기본 null) → 27-02 Task 2
- [ ] `webapp/src/test-fixtures/limit-chaser.ts` — `LC_BUY3_ECHO_DEFAULTS` 8필드 중립값 → 27-01 Task 1
- [ ] `relay/tests/ws-autosell.test.ts`(신규) — 41/42 브라우저 → 게이트웨이 통합 → 27-02 Task 2
- [ ] `webapp/e2e/fixtures/relay.ts` — `pushUserSettings` · `seedUserSettings` · 41/42 리더 재수출 → 27-02 Task 2
- [ ] `packages/shared/src/__fixtures__/strategy-day.ts` — `STRATEGY_AUTO_SELL_ROWS`(seq 201~) · `STRATEGY_AUTO_SELL_GOLDEN` → 27-03 Task 2
- [ ] `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx`(신규) — `/me` 「상따 기본설정」 → 27-06 Task 2

*프레임워크 설치 없음 — 기존 vitest/Playwright 인프라가 모든 표면을 덮는다. DB 변경 0 — `supabase db push` 없음.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| relay 프로덕션 배포 · smoke · `/healthz` · 84 로그 확인 · push · Vercel 빌드 | G⑤ | 서브에이전트 배포 차단(메모리) · 장외 시간 창 · 실서버 | 27-09 Task 2 체크포인트 0~9 단계(메인 세션) |
| 웹 「자동」 LED · 카드 칩 색이 WinForms LED 와 같다(대기·완료 주황 · 감시·매도중 초록) | D-03 · D-04 | 실계좌 자동매도 상태는 120 서버에서만 생긴다 · 두 화면 대조 | 첫 거래일 관찰 (a) — WinForms 에서 켠 종목을 웹에서 본다 |
| 120 저널 kind 6 g9 · 11~14 줄이 주문로그 「자동매도」 칩에 문장으로 선다 | D-14 · D-15 | 실데이터(10/5 UAT 이후 저널) | 첫 거래일 관찰 (b) |
| `/me` 값이 WinForms 기본설정창 값과 같다 | D-10 · D-13 | 같은 DMA 계정의 실서버 84 | 첫 거래일 관찰 (d) — 실계좌 버튼 · 저장을 시험 목적으로 누르지 않는다 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (체크포인트 27-09-02 만 manual — Manual-Only 표)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (MISSING 센티널 0 — 신규 테스트 파일은 소유 태스크의 RED 단계)
- [x] No watch-mode flags (shared 는 `exec vitest run` · webapp/relay 는 `vitest run`)
- [x] Feedback latency < 180s (단위 ~90s · e2e 단일 spec ~180s)
- [ ] `nyquist_compliant: true` set in frontmatter (실행 뒤 `/gsd-validate-phase` 가 세운다)

**Approval:** pending
