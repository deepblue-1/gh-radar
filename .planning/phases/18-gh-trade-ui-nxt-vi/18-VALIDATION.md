---
phase: "18"
slug: "gh-trade-ui-nxt-vi"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
# nyquist_compliant: false — 18-03(DB 마이그레이션 실 반영 · 반영 결과 조회)이 사용자 승인 대기로 미실행이라
# TRADE-07 의 「실 DB CHECK 제약」 샘플이 비어 있다. 자동 게이트(단위·e2e)는 전부 green 이다. 아래 Sign-Off 참조.
nyquist_compliant: false
wave_0_complete: true
created: "2026-09-21"
validated: "2026-09-22"
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 원천: `18-RESEARCH.md` §Validation Architecture (2026-09-21 실측). Task ID·Status 열은 18-13 Task 3 에서 실제 플랜·태스크와 실행 결과로 채웠다(2026-09-22).

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
| 18-01-T1 · 18-03-T1/T2 | 18-01 · 18-03 | 1 · 2 | TRADE-07 | T-18-01 / — | `dma_orders` CHECK 가 `M` 과 G2/G3 `price 0` 을 조건부로만 허용 | migration + relay unit | `pnpm --filter @gh-radar/relay run test -- envelope` | ✅ (`supabase/migrations/20260921120000_dma_orders_modify_offhours.sql`) | ⚠️ 파일·relay 단위 green · **실 DB 반영(18-03) 미실행 — 사용자 승인 대기** |
| 18-01-T1 | 18-01 | 1 | TRADE-07 | T-18-02 / — | `order.modify` 는 `orgOrderNo` 없으면 zod 거부, 세션 계좌 외 주문번호 거부(IDOR) | unit(relay) | `pnpm --filter @gh-radar/relay run test -- protocol` | ✅ (`relay/src/ws/__tests__/protocol.test.ts`) | ✅ green |
| 18-01-T1 | 18-01 | 1 | TRADE-07 | — | `order.modify` → `DirectOrderReq(order_type "M", org_order_no)` 왕복 | unit(relay) | `pnpm --filter @gh-radar/relay run test -- envelope` | ✅ 확장 (`relay/src/dma/__tests__/envelope.test.ts`) | ✅ green |
| 18-01-T2 | 18-01 | 1 | TRADE-07 | — | `pieceCount>1` 일 때만 슬롯 송신 / `krxSession` 빈 값이면 미송신 | unit(relay) | `pnpm --filter @gh-radar/relay run test -- envelope` | ✅ 확장 | ✅ green |
| 18-01-T2 | 18-01 | 1 | TRADE-07 | — | `price 0` 은 `krxSession` G2/G3 일 때만 통과 (4겹 가드 조건부) | unit(relay + webapp) | `pnpm --filter @gh-radar/relay run test -- envelope` / `pnpm --filter @gh-radar/webapp run test -- relay-provider` | ✅ 확장 | ✅ green |
| 18-04-T1 | 18-04 | 2 | TRADE-07 | — | 77 → 라벨/조각입력/확인문구 매핑 5경우 (`undefined`=모름=전부 false) | unit | `pnpm --filter @gh-radar/webapp run test -- queued-window` | ✅ (`webapp/src/lib/__tests__/queued-window.test.ts`) | ✅ green |
| 18-07-T1/T2 | 18-07 | 3 | TRADE-07 | — | 미체결 행 선택 → 정정/취소 활성 · G2/G3·Q-ID 행은 정정 잠김 | unit(RTL) | `pnpm --filter @gh-radar/webapp run test -- manual-order-form` | ✅ (`manual-order-form.test.tsx`) | ✅ green |
| 18-04-T2 | 18-04 | 2 | TRADE-06 | — | 이탈 판정(임계−2%p · 무장/3초 유예) · KST 날짜 키 집합 · 하루 1회 | unit | `pnpm --filter @gh-radar/webapp run test -- breakout-list` | ✅ (`webapp/src/lib/__tests__/breakout-list.test.ts`) | ✅ green |
| 18-08-T1/T3 | 18-08 | 3 | TRADE-06 | — | 76 upsert / 78 전량 교체가 목록 화면에 반영 (재해석 없음) | unit(RTL) | `pnpm --filter @gh-radar/webapp run test -- breakout-strip` | ✅ (`breakout-strip.test.tsx`) | ✅ green |
| 18-04-T3 | 18-04 | 2 | TRADE-06 | — | 돌파 행 구독/해제가 `subscribe`/`unsubscribe` 호출로 나간다 (diff·우선순위) | unit(RTL, 모킹) | `pnpm --filter @gh-radar/webapp run test -- use-breakout-quotes` | ✅ (`webapp/src/lib/__tests__/use-breakout-quotes.test.tsx`) | ✅ green |
| 18-13-T1 | 18-13 | 7 | TRADE-06 | — | 칩 클릭 → 카드 추가(KRX·스위치 OFF·기본값) → 행 「거래중」 · 서버 송신 0 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` (케이스 3) | ✅ (`webapp/e2e/specs/trading-workbench.spec.ts`) | ✅ green |
| 18-05-T1/T3 | 18-05 | 2 | TRADE-08 | — | `vi.set` 에 줄의 거래소가 실린다(KRX/NXT 각각) · `VI_EDIT_EXCHANGE` 부재(저장소 0건) | unit(RTL) + e2e | `pnpm --filter @gh-radar/webapp run test -- vi-settings-rows` · e2e `trading-workbench` 21~23 | ✅ | ✅ green |
| 18-05-T2 | 18-05 | 2 | TRADE-08 | — | 확인 체크 활성 규칙(`isConfirmable`) 불변 · 즉시 `vi.confirm` | unit + e2e | `pnpm --filter @gh-radar/webapp run test -- vi-order-list` · e2e `trading-workbench` 24·25 | ✅ 기존 | ✅ green |
| 18-13-T1 | 18-13 | 7 | TRADE-09 | T-18-65 | 카드 폭 4밴드(699/700·829/830·991/992) × 격자 1/2/3단 × 폰/와이드 잘림 0 — 판정은 `e2e/overflow.ts` 하나 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` (케이스 4·5·17·18·28) | ✅ (옛 `trading-limit-chaser` 9·11·12·13 이식 후 옛 spec 삭제) | ✅ green |
| 18-12-T1 · 18-13-T1 | 18-12 · 18-13 | 6 · 7 | TRADE-09 | T-18-58 | `/trading/limit-chaser`·`/new`·`/[key]`·`/trading/vi` → `/trading(?focus=)` 리다이렉트 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` (케이스 1) | ✅ | ✅ green |
| 18-12-T2 · 18-13-T2 | 18-12 · 18-13 | 6 · 7 | TRADE-09 | T-18-59~61 | 사이드바 「트레이딩」 제목 링크 + 3단(KRX VI·NXT VI·등록 전략 LED 3점) | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- sidebar-tree` | ✅ 재작성 (`sidebar-tree.spec.ts`) | ✅ green |
| 18-13-T2 | 18-13 | 7 | TRADE-09 | — | `/trading` a11y 위반 0 (데스크톱 · 폰 · VI) | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- a11y` | ✅ 케이스 교체 (`a11y.spec.ts`) | ✅ green |
| 18-13-T1 | 18-13 | 7 | TRADE-09 | — | 폰 밴드 더티 바(z-40) vs 하단 고정 공용 패널(z-20) `boundingBox()` 겹침 0 · 패널이 실제로 화면 하단에 붙음 | e2e | `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench` (케이스 7) | ✅ | ✅ green |
| 18-13-T2 | 18-13 | 7 | TRADE-07 · TRADE-09 | T-18-62 | 서버 거부가 카드 인라인 경보(`card-server-error`)·VI 줄 경보(`vi-server-error`) + 로그 양쪽에 (조용한 무시 0) | unit + e2e | `pnpm --filter @gh-radar/webapp run test -- strategy-card-flow use-vi-server-error` · e2e `trading-workbench` 15·27 | ✅ | ✅ green |
| 18-13-T3 | 18-13 | 전체 | 전체 | — | 낡은 `shared/dist` 함정 회피 · 전량 게이트 | build gate | config `build_command` 전문 + `test_command` 전문 + `test:e2e` 전량 | ✅ | ✅ green (relay 500 · webapp 1323 · shared 108 · Playwright 137 pass / 0 fail / 9 skip(서비스키 부재 선재)) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `supabase/migrations/20260921120000_dma_orders_modify_offhours.sql` — `order_type IN ('N','C','M')` + G2/G3 조건부 `price >= 0` (18-01). ⚠️ **파일은 있고 원격 DB 반영(18-03)은 사용자 승인 대기** — 배포 순서의 첫 단계다
- [x] `relay/src/ws/__tests__/protocol.test.ts` — 디렉터리 신설, `order.modify` zod 검증 (18-01)
- [x] `webapp/src/lib/__tests__/breakout-list.test.ts` — 이탈/집합/KST 날짜 키 (18-04)
- [x] `webapp/src/lib/__tests__/queued-window.test.ts` — 77 매핑 5경우 (18-04)
- [x] `webapp/src/lib/__tests__/use-breakout-quotes.test.tsx` — 구독 diff·우선순위 (18-04)
- [x] `webapp/e2e/specs/trading-workbench.spec.ts` — 신설 28케이스(리다이렉트 · 격자 단 수 · 카드 4밴드 잘림 · 칩 클릭 카드 추가 · 더티 바 겹침 · 옛 두 spec 이관) (18-13)
- [x] `webapp/e2e/specs/trading-limit-chaser.spec.ts` · `trading-vi.spec.ts` — **흡수 후 삭제**로 확정(18-13 Task 2 · 대조표는 18-13 SUMMARY)
- [x] 프레임워크 설치: 없음 — 전부 설치돼 있다

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 정정(`order_type "M"`) 실 게이트웨이 왕복 · 통보 `notice_type "M"` 표시 | TRADE-07 | 실 DMA 게이트웨이(장 시간 08:00~20:00 KST · VPN·터널) 필요, mock 은 프레임 형태만 단언 | 장중 실계좌 소량 미체결 1건 → 웹 정정 → WinForms/웹 양쪽 통보·미체결 갱신 관측 (Phase 17 D-25 와 같은 실기 관측 항목, UAT 로 박제) |
| 예약구간 조각 발주 · 시간외종가 G2/G3 실발주 | TRADE-07 | 서버가 창을 판정하므로 mock 으로는 라벨·프레임만 검증 | 해당 시간대에 1조각/1주 실발주 후 처리 시각 관측 |
| 알림음 자동재생 차단 상태 표시 | TRADE-06 | 브라우저 autoplay 정책은 실브라우저 사용자 제스처 의존 | 새 탭에서 `/trading` 진입 → 스피커 아이콘 「클릭해 활성화」 → 클릭 후 첫 돌파 시 단음 재생 확인 |
| VI 확인 체크 전송 거부/타임아웃 왕복 (UI-SPEC backstop E3 error) | TRADE-08 | 스텁 게이트웨이는 33 에 거부·무응답을 흉내 내지 않는다 — 실 서버의 거부 사유와 잠금 해제 시점은 실기에서만 관측된다 | 장중 VI 발동 주문 1건에서 확인 체크 → 거부/지연 시 체크 잠김이 풀리고 행 아래 `role="status"` 문구가 서는지 관측 |

> 위 4항목은 18-13 에서 **UAT 로 인계**했다. 자동 게이트가 green 이라는 사실이 이 항목들을 대신하지 않는다(Phase 17 D-25 와 같은 성격의 실기 관측 이연).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies — **18-03 은 미실행**(원격 DB `supabase db push` · 사용자 승인 대기). 나머지 12개 플랜의 모든 태스크는 자동 검증이 있고 green 이다
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (실행된 태스크 기준)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (`vitest --run` · `playwright test`)
- [x] Feedback latency < 60s (단위: webapp 28s · relay 수 초) / 180s (e2e 전량 2.9분 = 174s)
- [ ] `nyquist_compliant: true` set in frontmatter — **false 유지.** 사유: 18-03 미실행으로 TRADE-07 의 실 DB CHECK 제약(`order_type 'M'` · G2/G3 `price 0` 조건부) 샘플이 없다. relay 단위 테스트는 **스텁 dma_orders** 로만 insert 바디를 본다. 18-03 이 반영·조회 검증되면 true 로 올린다

**Approval:** 자동 게이트 green · Manual-Only 4항목 UAT 인계 · 18-03 반영 후 nyquist 재판정 (2026-09-22, 18-13)
