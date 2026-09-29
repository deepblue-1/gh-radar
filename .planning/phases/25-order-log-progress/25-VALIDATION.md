---
phase: "25"
slug: "order-log-progress"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-29"
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 출처: `25-RESEARCH.md` §Validation Architecture (2026-09-29). Per-Task 표는 플래너가 PLAN.md 를 만들 때 채운다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest(relay `vitest run` · server/shared `exec vitest run` · webapp `vitest --run`) + pgTAP(로컬 Postgres 17 컨테이너, `scripts/verify-dma-orders-price-check.sh --test`) + Playwright(webapp e2e, 로컬 relay + fake-gateway) |
| **Config file** | `relay/vitest.config.*` · `webapp/vitest.config.*` · `webapp/playwright.config.ts` (기존) |
| **Quick run command** | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts tests/journal-writer.test.ts` (작업 대상 파일만 지정) |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/server exec vitest run && pnpm --filter @gh-radar/shared exec vitest run && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql` |
| **Estimated runtime** | ~180 seconds (pgTAP 컨테이너 기동 포함, e2e 제외) |

---

## Sampling Rate

- **After every task commit:** Run 해당 파일 quick run(Per-Task 표의 파일 단위 명령) + 관련 패키지 typecheck
- **After every plan wave:** Run Full suite command
- **Before `/gsd-verify-work`:** Full suite + pgTAP + e2e(trading-workbench · me · a11y) green. 실장 첫 거래일 UAT(펼침 타임라인 vs 게이트웨이 로그 · 진행률 표시) 체크포인트 — Phase 19 D-14 「첫 거래일 실장 대조」 동형
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-XX-XX | — | — | (플래너가 PLAN.md 작성 시 채움 — 아래 요구사항→테스트 표를 기준으로) | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### 요구사항 → 테스트 표 (RESEARCH §Validation Architecture 전사)

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| 확정-DB | 원문 멱등 적재(같은 배치 2회 = applied 0) · 커서 strategy 칸만 전진 · 저널 커서 불변 · 반환 rows 에 dma_user_id 없음 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql` | ❌ W0 |
| 확정-DB | 가시성: 계좌 매핑 사용자만 주문 이벤트 · kind1·2 는 그 게이트웨이 매핑 보유자 전원 · 계좌 빈 주문 이벤트는 0행 · anon/authenticated EXECUTE 불가 | pgTAP | 같은 러너, 같은 파일 | ❌ W0 |
| 확정-DB | 주문별 UNION: 같은 ms 는 journal → strategy · org_order_no 매칭 · 남의 계좌 0행 | pgTAP | 같은 러너 | ❌ W0 |
| 확정-relay | 로그인 since 2개 · pending 플래그 2 · 둘 다 caught 여야 live · 구 서버(전략 0) 즉시 live · 전략 갭 → drop + 재로그인 since 유지 · strategy_resync 시 기록기 비움 | unit(FakeCodec) | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts` | ✅ 확장 |
| 확정-relay | 전략 기록기: RPC 이름·커서 칸·반환 매핑 · 실패 재시도 같은 배치 · 스트림 로그 문맥 | unit(supabase-stub) | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-writer.test.ts` | ✅ 확장 |
| 확정-relay | `journal.events` 푸시: 주문 이벤트 계좌 필터 · 시세 이벤트 게이트웨이 매핑 보유자 전원 · 추가 게이트웨이는 그 access | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts` | ✅ 확장 |
| 확정-relay (fbs 뒤) | 79/80 새 필드 파싱 · 5 빌더 strategy since · 83 파서 · 81/82 debug 드롭 · MSG 값 = 생성 enum | unit | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts src/dma/__tests__/codec.test.ts` | ✅ 확장 |
| 진행률 relay (fbs 뒤) | 83: 허용 계좌 필터 · dma_user_id 제거 · isReady 전 캐시만 · 인증 직후 snap · 세션 교체 후 캐시 없음 · 남 계좌 0 · 빈 전이만 전송 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts tests/fanout.test.ts` | ✅ 확장 |
| 통합 (fbs 뒤) | fake-gateway 관찰자 → 80(두 스트림) → Supabase stub → journal.events 도달 · 83 → unf.progress | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-gateway.test.ts tests/fake-gateway.test.ts` | ✅ 확장 |
| 확정-server | 라우트 2: 401 · 400(날짜·orderNos 형식/개수) · RPC 인자 = req.userId 만 · bare array | unit(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/orders.test.ts tests/routes/strategy-events.test.ts` | ✅/❌ W0 |
| D-09/D-10 | 기획서 예시 12줄 문장 기대값 · kind 4 Queued 세 갈래(`immediate_fill_qty` 0 / 일부 / 전량) · 모르는 enum 원문 · 스냅 길이<3 · has_remaining false 면 남은 거래량 없음 · 오차 부호 · 시초 상한가 | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts` | ❌ W0 |
| D-09 | `HH:MM:SS.mmm` KST · 자정 00 | unit | 같은 파일 | ❌ W0 |
| D-01~D-04 | 행 클릭 펼침/닫힘 · 다중 펼침 · 묶음 members 전달 · 타임라인 ms 정렬(통보→전략) · running sum/전량 · 푸시 이어붙임 · lastSeq 상승 디바운스 재조회 · 실패/빈 문구 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/today-orders-card.test.tsx src/lib/__tests__/order-notices.test.ts` | ✅ 확장 |
| 별건 3 | 방향 미상 「주문」 · result_code -2 「접수 불명」 · R 방향 참고 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/order-notices.test.ts src/lib/__tests__/orders-api.test.ts` | ✅ 확장 |
| D-05~D-08 | 탭 등록·복원(3곳) · 필터(종목/거래소/구분 6값) · 배지 카운트 · 핀 · 맨 아래 따라감 · 창 분리 URL 쿼리 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/shared-panels.test.tsx src/components/trading/__tests__/card-tabs.test.tsx src/lib/__tests__/relay-socket.test.ts` | ✅ 확장 + ❌ W0(`order-log-*.test.tsx`) |
| D-11~D-13 | 진행률 없는 행 보조행 없음 · 90% up · 0주 남음 100% · 음수 0 · 미체결 사라지면 보조행 없음 · snap 교체 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/orderbook/__tests__/account-panel*.test.tsx src/lib/__tests__/queue-progress.test.ts` | ❌ W0 |
| 반응형·잘림 | 주문로그 탭 공용 패널/카드/창 분리 · 오늘 주문 펼침 390px · 진행률 r3 — 잘림 0 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts -g "주문로그\|펼침\|진행률"` | ✅ 확장 |
| a11y | 펼침 `aria-expanded` · progressbar · 탭 | e2e(axe) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/a11y.spec.ts` | ✅ 확장 |

---

## Wave 0 Requirements

- [ ] `supabase/tests/dma_strategy_apply.test.sql` — 적재·커서·가시성·UNION·REVOKE
- [ ] Postgres 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 로컬 확보(사용자 확인 후 `docker pull` — pgTAP 러너는 이미지를 받지 않고 멈춘다)
- [ ] `packages/shared/src/__tests__/strategy-event-text.test.ts` + 기획서 하루 픽스처(○○전자 12451~12455)
- [ ] `server/tests/routes/strategy-events.test.ts`
- [ ] `webapp/src/components/trading/order-log/__tests__/*.test.tsx` · `webapp/src/lib/__tests__/queue-progress.test.ts`
- [ ] (fbs 뒤) `relay/tests/helpers/frames.ts` 전략 이벤트·83 빌더 · `fake-gateway.ts` 관찰자 배치에 strategy 필드

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실장 첫 거래일 펼침 타임라인 vs 게이트웨이 로그 대조 | D-01~D-03 | 실제 gh-trade StrategyEvent 는 fake-gateway 가 아닌 실서버에서만 생성 | 배포 후 첫 거래일 장중 오늘 주문 행 펼침 → 게이트웨이 로그 순서·ms·누적과 대조 (Phase 19 D-14 동형) |
| 진행률 보조행 라이브 갱신·단일가/VI 구간 정지 | D-11~D-13 | QueueProgress 1초 스로틀은 실서버 사용자 세션에서만 관측 | 대기 주문 1건 걸고 마이페이지·작업대 공용 패널·카드 탭 3표면에서 막대·N주 남음 갱신 확인, VI 구간 값 멈춤 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
