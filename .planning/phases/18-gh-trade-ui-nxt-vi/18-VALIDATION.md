---
phase: "18"
slug: "gh-trade-ui-nxt-vi"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-21"
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 원천: `18-RESEARCH.md` §Validation Architecture (2026-09-21 실측). Task ID·Status 열은 계획(PLAN.md) 확정 후 채운다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + jsdom + RTL (webapp, `webapp/vitest.config.ts:15-18`, include `src/**/*.test.{ts,tsx}`) · vitest (relay `vitest run`, shared) · Playwright ^1.59.1 (+ @axe-core/playwright) — e2e (`webapp/playwright.config.ts:82`, testDir `./e2e/specs`, webServer `PORT=3100 pnpm dev`, relay 는 spec 픽스처가 8090 으로 띄움) |
| **Config file** | `webapp/vitest.config.ts` · `webapp/playwright.config.ts` · relay vitest 기본 |
| **Quick run command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` (계약 태스크는 `pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests` 까지) |
| **Full suite command** | config `build_command` 전문(`pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck`) + `test_command` 전문(`pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test`) |
| **e2e command** | `pnpm --filter @gh-radar/webapp run test:e2e` |
| **Estimated runtime** | 단위 ~30–60초 · e2e 전량 ~2.5분(Phase 16 실측 2.4분 기준) |

⚠️ **함정 (Phase 16 교훈):** `shared build` 를 생략하면 낡은 `packages/shared/dist` 때문에 typecheck 가 통과한다. `--filter gh-radar-webapp` 은 어떤 프로젝트에도 매치되지 않고 exit 0 이다 — 정본은 `@gh-radar/webapp`. relay `tests/` 는 루트 typecheck 밖이라 `typecheck:tests` 를 반드시 함께 실행한다.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` (+ 해당 워크스페이스 단위 테스트 필터)
- **After every plan wave:** Run config `build_command` 전문 + `test_command` 전문
- **Before `/gsd-verify-work`:** 위 둘 + `pnpm --filter @gh-radar/webapp run test:e2e` 전량 green
- **Max feedback latency:** 60 seconds (단위) · 180 seconds (e2e)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | TRADE-07 | T-18-xx / — | `dma_orders` CHECK 가 `M` 과 G2/G3 `price 0` 을 조건부로만 허용 | migration + relay unit | `pnpm --filter @gh-radar/relay run test -- envelope` | ❌ W0 (`supabase/migrations/…_dma_orders_modify_offhours.sql`) | ⬜ pending |
| TBD | — | — | TRADE-07 | T-18-xx / — | `order.modify` 는 `orgOrderNo` 없으면 zod 거부, 세션 계좌 외 주문번호 거부(IDOR) | unit(relay) | `pnpm --filter @gh-radar/relay run test -- protocol` | ❌ W0 (`relay/src/ws/__tests__/protocol.test.ts`) | ⬜ pending |
| TBD | — | — | TRADE-07 | — | `order.modify` → `DirectOrderReq(order_type "M", org_order_no)` 왕복 | unit(relay) | `pnpm --filter @gh-radar/relay run test -- envelope` | ✅ 확장 (`relay/src/dma/__tests__/envelope.test.ts`) | ⬜ pending |
| TBD | — | — | TRADE-07 | — | `pieceCount>1` 일 때만 슬롯 송신 / `krxSession` 빈 값이면 미송신 | unit(relay) | `pnpm --filter @gh-radar/relay run test -- envelope` | ✅ 확장 | ⬜ pending |
| TBD | — | — | TRADE-07 | — | `price 0` 은 `krxSession` G2/G3 일 때만 통과 (4겹 가드 조건부) | unit(relay + webapp) | `pnpm --filter @gh-radar/relay run test -- envelope` / `pnpm --filter @gh-radar/webapp run test -- relay-provider` | ✅ 확장 | ⬜ pending |
| TBD | — | — | TRADE-07 | — | 77 → 라벨/조각입력/확인문구 매핑 5경우 (`undefined`=모름=전부 false) | unit | `pnpm --filter @gh-radar/webapp run test -- queued-window` | ❌ W0 (`webapp/src/lib/__tests__/queued-window.test.ts`) | ⬜ pending |
| TBD | — | — | TRADE-07 | — | 미체결 행 선택 → 정정/취소 활성 · G2/G3·Q-ID 행은 정정 잠김 | unit(RTL) | `pnpm --filter @gh-radar/webapp run test -- manual-order-form` | ❌ W0 | ⬜ pending |
| TBD | — | — | TRADE-06 | — | 이탈 판정(임계−2%p · 무장/3초 유예) · KST 날짜 키 집합 · 하루 1회 | unit | `pnpm --filter @gh-radar/webapp run test -- breakout-list` | ❌ W0 (`webapp/src/lib/__tests__/breakout-list.test.ts`) | ⬜ pending |
| TBD | — | — | TRADE-06 | — | 76 upsert / 78 전량 교체가 목록 화면에 반영 (재해석 없음) | unit(RTL) | `pnpm --filter @gh-radar/webapp run test -- breakout-strip` | ❌ W0 | ⬜ pending |
| TBD | — | — | TRADE-06 | — | 돌파 행 구독/해제가 `subscribe`/`unsubscribe` 호출로 나간다 (diff·우선순위) | unit(RTL, 모킹) | `pnpm --filter @gh-radar/webapp run test -- use-breakout-quotes` | ❌ W0 (`webapp/src/lib/__tests__/use-breakout-quotes.test.tsx`) | ⬜ pending |
| TBD | — | — | TRADE-06 | — | 칩 클릭 → 카드 추가(KRX·스위치 OFF) → 행 「거래중」 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` | ❌ W0 (`webapp/e2e/specs/trading-workbench.spec.ts`) | ⬜ pending |
| TBD | — | — | TRADE-08 | — | `vi.set` 에 줄의 거래소가 실린다(KRX/NXT 각각) · `VI_EDIT_EXCHANGE` 부재 | unit(RTL) | `pnpm --filter @gh-radar/webapp run test -- vi-settings-rows` | ❌ W0 | ⬜ pending |
| TBD | — | — | TRADE-08 | — | 확인 체크 활성 규칙(`isConfirmable`) 불변 · 즉시 `vi.confirm` | unit | `pnpm --filter @gh-radar/webapp run test -- vi-order-list` | ✅ 기존 | ⬜ pending |
| TBD | — | — | TRADE-09 | — | 카드 폭 4밴드 × 격자 1/2/3단 × 폰/와이드 잘림 0 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` | ❌ W0 (`trading-limit-chaser.spec.ts` 케이스 9·11·12·13 이식) | ⬜ pending |
| TBD | — | — | TRADE-09 | — | `/trading/limit-chaser/new`·`/[key]`·`/trading/vi` → `/trading(?focus=)` 리다이렉트 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` | ❌ W0 | ⬜ pending |
| TBD | — | — | TRADE-09 | — | 사이드바 「트레이딩」 제목 링크 + 3단(KRX VI·NXT VI·상따 종목) | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- sidebar-tree` | ✅ 재작성 (`sidebar-tree.spec.ts`) | ⬜ pending |
| TBD | — | — | TRADE-09 | — | `/trading` a11y 위반 0 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- a11y` | ✅ 케이스 교체 (`a11y.spec.ts:323`) | ⬜ pending |
| TBD | — | 전체 | 전체 | — | 낡은 `shared/dist` 함정 회피 | build gate | config `build_command` 전문 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/migrations/2026MMDD_dma_orders_modify_offhours.sql` — `order_type IN ('N','C','M')` + G2/G3 조건부 `price >= 0` (RESEARCH 표 C-2, TRADE-07 선행 조건; 제약 이름은 실행 전 조회)
- [ ] `relay/src/ws/__tests__/protocol.test.ts` — 디렉터리 신설, `order.modify` zod 검증
- [ ] `webapp/src/lib/__tests__/breakout-list.test.ts` — 이탈/집합/KST 날짜 키
- [ ] `webapp/src/lib/__tests__/queued-window.test.ts` — 77 매핑 5경우
- [ ] `webapp/src/lib/__tests__/use-breakout-quotes.test.tsx` — 구독 diff·우선순위
- [ ] `webapp/e2e/specs/trading-workbench.spec.ts` — 신설(리다이렉트 · 격자 단 수 · 카드 4밴드 잘림 · 칩 클릭 카드 추가)
- [ ] `webapp/e2e/specs/trading-limit-chaser.spec.ts` · `trading-vi.spec.ts` — 삭제 또는 workbench 로 흡수 (계획에서 결정)
- [ ] 프레임워크 설치: 없음 — 전부 설치돼 있다

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 정정(`order_type "M"`) 실 게이트웨이 왕복 · 통보 `notice_type "M"` 표시 | TRADE-07 | 실 DMA 게이트웨이(장 시간 08:00~20:00 KST · VPN·터널) 필요, mock 은 프레임 형태만 단언 | 장중 실계좌 소량 미체결 1건 → 웹 정정 → WinForms/웹 양쪽 통보·미체결 갱신 관측 (Phase 17 D-25 와 같은 실기 관측 항목, UAT 로 박제) |
| 예약구간 조각 발주 · 시간외종가 G2/G3 실발주 | TRADE-07 | 서버가 창을 판정하므로 mock 으로는 라벨·프레임만 검증 | 해당 시간대에 1조각/1주 실발주 후 처리 시각 관측 |
| 알림음 자동재생 차단 상태 표시 | TRADE-06 | 브라우저 autoplay 정책은 실브라우저 사용자 제스처 의존 | 새 탭에서 `/trading` 진입 → 스피커 아이콘 「클릭해 활성화」 → 클릭 후 첫 돌파 시 단음 재생 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (단위) / 180s (e2e)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
