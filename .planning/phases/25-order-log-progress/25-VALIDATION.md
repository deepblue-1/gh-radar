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
| 25-01-T1 | 01 | 1 | 이미 확정된 것(와이어 v0.1 · relay 두 스트림 · journal.events) · D-05 · D-09 · D-10 | T-25-01 · 02 · 04 · 05 | 주문 이벤트 계좌 필터 · 시세 kind 1·2 공개 · dma_user_id 부재 | integration(실 TCP 관찰자 → ws) + unit + component | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts -t "Phase 25 트레이서" --reporter=verbose` · `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts` · `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts src/components/trading/order-log` | ✅ 확장(journal-push · relay-socket) + ❌ W0(태스크 RED 가 생성: strategy-event-text.test.ts · order-log-list.test.tsx) | ⬜ pending |
| 25-01-T2 | 01 | 1 | 확정-DB(테이블 · 커서 칸 · 적용 RPC) | T-25-02 · 03 | 멱등 · 전략 커서만 전진 · anon/authenticated EXECUTE 불가 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql` | ❌ W0(태스크 RED 가 생성) · 이미지 precondition | ⬜ pending |
| 25-02-T1 | 02 | 2 | 확정-relay(갭 · resync · 구 게이트웨이 · 두 pending · since epoch 짝) | T-25-08 · 09 | 옛 epoch since 금지 | unit(FakeCodec) + integration(실 TCP) | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts tests/journal-writer.test.ts tests/journal-gateway.test.ts` | ✅ 확장 | ⬜ pending |
| 25-02-T2 | 02 | 2 | 확정-relay(`/healthz` 전략 칸 · 부팅 결선) | T-25-10 · 11 | 본문 식별자 없음 · 503 판정 분리 | unit + boot(실 프로세스) | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-status.test.ts tests/journal-observer.test.ts tests/journal-boot.test.ts` | ✅ 확장 | ⬜ pending |
| 25-03-T1 | 03 | 2 | 확정-DB(조회 RPC 2 · 가시성) · D-01 · D-02 | T-25-12 · 13 · 14 | IDOR · 행 id 계좌 고정 · 시세 공개 kind | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql` | ❌ W0(태스크 RED 가 생성) | ⬜ pending |
| 25-03-T2 | 03 | 2 | D-01 · D-02(`GET /api/orders/:id/events`) | T-25-12 · 15 · 16 | userId 고정 · orderNos 상한 | unit(supertest) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/order-timeline.test.ts` · `pnpm --filter @gh-radar/server exec vitest run tests/routes/orders.test.ts` | ✅ 확장(orders.test) + ❌ W0(order-timeline.test) | ⬜ pending |
| 25-03-T3 | 03 | 2 | D-07(`GET /api/strategy-events`) | T-25-12 · 17 | 날짜 실재 검사 | unit(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/strategy-events.test.ts tests/routes/orders.test.ts` | ❌ W0(태스크 RED 가 생성) | ⬜ pending |
| 25-04-T1 | 04 | 2 | D-09 · D-10(표시명 표 · 시세 이벤트 · 모르는 값) | T-25-18 · 19 | 문구 파싱 금지 | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-labels.test.ts src/__tests__/strategy-event-text.test.ts` | ❌ W0(labels test) + ✅(25-01 text test) | ⬜ pending |
| 25-04-T2 | 04 | 2 | D-09(주문 이벤트 전 종류 · 펼침 표면 · 하루 흐름 골든) | T-25-18 | — | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts src/__tests__/strategy-event-labels.test.ts` | ✅ | ⬜ pending |
| 25-05-T1 | 05 | 2 | 별건 3(판정) | T-25-21 · 22 · 23 | 문구 인자 없음 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/order-notices.test.ts src/lib/__tests__/orders-api.test.ts src/lib/__tests__/trading-alerts.test.ts` | ✅ 확장 | ⬜ pending |
| 25-05-T2 | 05 | 2 | 별건 3(칩) | T-25-21 | — | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/today-orders-card.test.tsx src/lib/__tests__/order-notices.test.ts` | ✅ 확장 | ⬜ pending |
| 25-06-T1 | 06 | 2 | 진행률 relay(83 파서 · hub · PC-12) | T-25-24 · 25 · 26 | 허용 계좌 필터 · 식별자 제거 · 세션 교체 정리 | unit | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts src/dma/__tests__/codec.test.ts tests/hub.test.ts` | ✅ 확장 | ⬜ pending |
| 25-06-T2 | 06 | 2 | 진행률 relay(팬아웃 · 인증 스냅) | T-25-24 | — | integration(실 세션) | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "unf.progress" --reporter=verbose` | ✅ 확장 | ⬜ pending |
| 25-06-T3 | 06 | 2 | D-11 ~ D-13(스토어 · 클램프) | T-25-28 | 재정규화 없음 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/queue-progress.test.ts src/lib/__tests__/relay-socket.test.ts` | ❌ W0(queue-progress.test — 태스크 RED 가 생성) | ⬜ pending |
| 25-07-T1 | 07 | 3 | D-07 · D-08(피드 · 필터 · 쿼리 · 스크롤 고정) | T-25-29 · 31 | 쿼리 화이트리스트 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/order-log-feed.test.ts src/lib/__tests__/use-stick-to-bottom.test.tsx src/lib/__tests__/use-order-log-feed.test.tsx` | ❌ W0(태스크 RED 가 생성) | ⬜ pending |
| 25-07-T2 | 07 | 3 | D-05 · D-08(목록 · 필터줄 · 패널) | — | — | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/order-log` | ✅(25-01 list test) + ❌ W0(filters · panel test) | ⬜ pending |
| 25-07-T3 | 07 | 3 | D-06 · D-07(탭 결선 · 배지 · 브라우저 종단) | T-25-32 | — | component + e2e | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/shared-panels.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/order-log` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/order-log.spec.ts` | ✅ 확장 + ❌ W0(order-log.spec — 태스크가 생성) | ⬜ pending |
| 25-08-T1 | 08 | 3 | D-01 · D-02 · D-03(순수 함수) | T-25-35 | 문구 파싱 금지 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/order-timeline.test.ts src/lib/__tests__/order-notices.test.ts src/lib/__tests__/orders-api.test.ts` | ❌ W0(order-timeline.test) + ✅ 확장 | ⬜ pending |
| 25-08-T2 | 08 | 3 | D-03 · D-04(펼침 UI · 디바운스) | T-25-34 | 폴링 없음 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/today-orders-card.test.tsx src/components/trading/__tests__/order-timeline.test.tsx` | ✅ 확장 + ❌ W0(order-timeline.test.tsx) | ⬜ pending |
| 25-08-T3 | 08 | 3 | D-01 ~ D-04 · 별건 3 · E2 백스톱 | — | — | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts -g "P25-E"` | ✅ 확장 | ⬜ pending |
| 25-09-T1 | 09 | 3 | D-11 ~ D-13(보조행 컴포넌트) | T-25-38 | — | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/orderbook/__tests__/unfilled-progress.test.tsx` | ❌ W0(태스크 RED 가 생성) | ⬜ pending |
| 25-09-T2 | 09 | 3 | 이미 확정된 것(B안 3표면 + r3) | T-25-37 · 39 | — | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/orderbook` | ✅ 확장 | ⬜ pending |
| 25-09-T3 | 09 | 3 | B안 브라우저 · E8 백스톱 | — | — | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/unfilled-progress.spec.ts` | ❌ W0(태스크가 생성) | ⬜ pending |
| 25-10-T1 | 10 | 4 | D-06(카드 탭) | — | — | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/card-tabs.test.tsx src/components/trading/order-log src/components/trading/__tests__/strategy-card.test.tsx` | ✅ 확장 | ⬜ pending |
| 25-10-T2 | 10 | 4 | D-07(창 분리) | T-25-40 · 42 | 쿼리 교정 | component | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/order-log/__tests__/order-log-window.test.tsx src/lib/__tests__/order-log-feed.test.ts` | ❌ W0(order-log-window.test) | ⬜ pending |
| 25-10-T3 | 10 | 4 | a11y · E5/E6 백스톱 | — | — | e2e(axe) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/order-log.spec.ts` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/a11y.spec.ts` | ✅ 확장 | ⬜ pending |
| 25-11-T1 · T2 | 11 | 5 | [BLOCKING] 원격 스키마 적용(결정 · 사용자 `supabase db push`) | T-25-43 · 45 | 서브에이전트 원격 적용 금지 | manual(checkpoint) | — (사용자 실행 · 결과 붙임) | — | ⬜ pending |
| 25-11-T3 | 11 | 5 | 원격 REVOKE 확인 | T-25-44 · 46 | anon 401/403 · 키 출력 금지 | CLI(curl 읽기 전용) | `test -f .planning/phases/25-order-log-progress/25-11-SUMMARY.md && grep -Eq "(401\|403)" …` | — | ⬜ pending |
| 25-12-T2 | 12 | 6 | 배포 준비 게이트(배포 커밋 대조 · 전체) | T-25-47 · 50 | 배포 명령 미실행 | full suite + pgTAP + e2e | `sync-relay-schema.sh --check` · Full suite command · pgTAP 3파일 · Playwright 5 spec | ✅ | ⬜ pending |
| 25-12-T1 · T3 | 12 | 6 | 배포 순서 · 첫 거래일 UAT | T-25-48 · 49 · 51 · 52 | 메인 세션 배포만 | manual(checkpoint) | — | — | ⬜ pending |
| 25-13-T1 | 13 | 7 | 갭 closure — 25-06 「세션 교체 뒤 옛 진행률 없음」(WR-02) · D-13 보존 | T-25-53 · 54 | 초기화 스냅은 그 userId 에게만 · `#onQueueProgress`/`#onReady` 무변경 | integration(실 ws · 실 WsFanout) + unit + 웹 스토어(무변경 증명) | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "P4 세션 교체" --reporter=verbose` · `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "잔량진행률 83" --reporter=verbose` · `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts -t "unf.progress"` | ✅ 확장 | ⬜ pending |
| 25-13-T2 | 13 | 7 | 교체 경계(무진행률 무프레임 · 사용자 격리 · 교체 뒤 억제/재충전/옛 세션 무시) · 배포 준비 게이트 | T-25-53 · 55 · 57 | 배포 명령 미실행 | unit + full relay + 웹 단위 + e2e | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "WR-02" --reporter=verbose` · `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test` · `pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/unfilled-progress.spec.ts` | ✅ 확장 | ⬜ pending |
| 25-13-T3 | 13 | 7 | relay 배포(메인 세션 · 20:00 KST 이후 · relay 먼저 → push) | T-25-56 · 57 · 58 · 59 | 메인 세션 배포만 · DMA_HOST/DMA_KYOBO_HOST 미주입 | manual(checkpoint) | — | — | ⬜ pending |

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

> 플래너 배치(2026-09-29): Wave 0 스캐폴드는 **그 파일을 쓰는 태스크의 RED 단계**가 먼저 만든다(모든 코드 태스크가 `tdd="true"` · 행동 먼저). 위 Per-Task 표의 「❌ W0(태스크 RED 가 생성)」 표기가 그 소유 태스크다. Postgres 이미지는 25-01 Task 2 · 25-03 Task 1 의 `<precondition>` + `user_setup` 으로 막는다. fbs 뒤 항목(frames.ts 전략/83 빌더 · fake-gateway strategy 필드)은 gh-trade G1 통보(2026-09-29 · blob `f08677d9…`)로 게이트가 풀려 25-01(전략) · 25-06(83) 이 만든다. spec-less probe fallback 은 요구 ID 가 없어 **건너뜀(기록된 선택)** — must_haves 는 CONTEXT D-01~D-13 · 「이미 확정된 것」 · UI-SPEC UI Considerations(explicit 38 · backstop 4 · dismissed 8)에서 직접 뽑았다.

- [ ] `supabase/tests/dma_strategy_apply.test.sql` — 적재·커서·가시성·UNION·REVOKE
- [ ] `supabase/tests/dma_strategy_read.test.sql` — 조회 RPC 2 가시성 매트릭스 · 같은 ms 순서 · REVOKE (25-03 T1)
- [ ] `packages/shared/src/__tests__/strategy-event-labels.test.ts` · `order-timeline.test.ts` · `webapp/src/lib/__tests__/order-log-feed.test.ts` · `use-stick-to-bottom.test.tsx` · `use-order-log-feed.test.tsx` · `order-timeline.test.ts` · `webapp/src/components/orderbook/__tests__/unfilled-progress.test.tsx` · `webapp/e2e/specs/order-log.spec.ts` · `unfilled-progress.spec.ts`
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
