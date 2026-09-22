---
phase: "18"
slug: "gh-trade-ui-nxt-vi"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
# nyquist_compliant: true — 유일한 차단 사유였던 18-03(DB 마이그레이션 실 반영 · 반영 결과 조회)이 2026-09-22
# 완료돼 TRADE-07 의 「실 DB CHECK 제약」 샘플이 채워졌다. 자동 게이트(단위·e2e)는 전부 green 이다. 아래 Sign-Off 참조.
nyquist_compliant: true
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
| 18-01-T1 · 18-03-T1/T2 | 18-01 · 18-03 | 1 · 2 | TRADE-07 | T-18-01 / — | `dma_orders` CHECK 가 `M` 과 G2/G3 `price 0` 을 조건부로만 허용 | migration + relay unit | `pnpm --filter @gh-radar/relay run test -- envelope` | ✅ (`supabase/migrations/20260921120000_dma_orders_modify_offhours.sql`) | ✅ green — 파일·relay 단위 green · **실 DB 반영(18-03) 완료 2026-09-22**: `migration list --linked` Remote 적용 · 원격 스키마 덤프 전후 diff 가 컬럼 2 · CHECK 3 · COMMENT 2 뿐 |
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

- [x] `supabase/migrations/20260921120000_dma_orders_modify_offhours.sql` — `order_type IN ('N','M','C')` + `price > 0 OR (price = 0 AND krx_session IN ('G2','G3'))` (18-01). ✅ **원격 DB 반영 완료(18-03, 2026-09-22)** — 배포 순서의 첫 단계(DB)는 끝났고 relay→검증→push 가 남았다
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

| `close_price_mode="zero"` 실계좌 시간외종가(G2/G3) 원주문 **취소** 왕복 | TRADE-07 | 실 계좌·실 서버 설정 변경(`close_price_mode` "close"→"zero")이 필요하다. 자동 게이트는 webapp 번역기 · relay zod · 조립기 · 원격 CHECK 4층이 가격 0 취소를 통과시킴을 확인했을 뿐, 실 게이트웨이가 그 취소를 받는지는 보지 못한다 (18-VERIFICATION human_verification #6) | **relay 배포 뒤** 장중 실계좌에서 서버 설정을 "zero" 로 바꾸고 G2/G3 원주문 1건 → 미체결 행 선택 → 취소 → 소켓 유지 · 취소확인 통보 · 미체결 소멸 · `dma_orders` 취소 행(price 0) 기록 관측 |
| 2계좌 환경 VI 「수정」 계좌 불변 | TRADE-08 | 계좌 2개 · 한 계좌로 가동 중인 실 VI 전략이 필요하다. 자동 게이트는 `vi.set.accountNo = server.accountNo` 를 단위·e2e 로 단언했다 (18-VERIFICATION human_verification #7) | 계좌 B 로 KRX VI 가동 → 상태줄을 계좌 A 로 → 줄 아래 「계좌 B · … 에 등록된 VI 예요」 고지 확인 → 「수정」 → 서버 에코의 `accountNo` 가 B 그대로인지 관측 |

> 위 6항목(18-13 인계 4 + 2026-09-22 갭 클로징 인계 2)은 **UAT 로 인계**했다. 자동 게이트가 green 이라는 사실이 이 항목들을 대신하지 않는다(Phase 17 D-25 와 같은 성격의 실기 관측 이연).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 18-03 실행 완료(원격 DB `supabase db push` · `migration list --linked` 로 적용 확인, 2026-09-22). 13개 플랜의 모든 태스크가 자동 검증이 있고 green 이다
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (실행된 태스크 기준)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (`vitest --run` · `playwright test`)
- [x] Feedback latency < 60s (단위: webapp 28s · relay 수 초) / 180s (e2e 전량 2.9분 = 174s)
- [x] `nyquist_compliant: true` set in frontmatter — 18-03 에서 실 DB CHECK 제약(`order_type 'M'` · G2/G3 `price 0` 조건부)과 감사 컬럼 2개를 원격 스키마 덤프로 확인했다. 정책 0개(default-deny)·`GRANT ALL … TO service_role` 은 전후 동일. 증거 원문은 `18-03-SUMMARY.md`

**Approval:** 자동 게이트 green · Manual-Only 4항목 UAT 인계 · 18-03 반영 후 nyquist 재판정 (2026-09-22, 18-13)

**재판정 (2026-09-22, 18-03):** 실 DB 제약 조회 검증 완료 → `nyquist_compliant: true`. Manual-Only 4항목(실 게이트웨이 정정 왕복 등)은 여전히 UAT 인계 상태다

**갭 클로징 재판정 (2026-09-22, 18-23):** 18-VERIFICATION `gaps_found`(13/15) 가 되돌린 10건(CR-01 · CR-02 · 돌파 최신순 · WR-01~07)을 18-14~18-22 가 닫았고, 18-23 이 전량 게이트를 다시 돌렸다 — build_command 전문 `error TS` 0 · relay **516** passed · webapp **1383** passed / 1 skipped · Playwright **141** passed / 0 failed / 9 skipped(서비스키 부재 선재, 18-13 과 같은 9건). 11행 모두 자동 명령이 있고 green 이라 `nyquist_compliant: true` 를 유지한다. Manual-Only 는 4 → **6항목**(18-VERIFICATION #6 · #7 추가). 판정(Complete)은 재검증(gsd-verifier) 몫이다 — 근거는 아래 §Gap Closure.

**배포 순서 (갭 클로징분):** **DB(18-18 · 완료) → relay 배포 → 검증 → webapp push.** **relay 는 아직 미배포다.** 18-14 의 `RelayOrderCancelSchema.price` `nonnegative()` 완화가 relay 에 없으면 브라우저의 가격 0 취소는 여전히 zod 에서 close(4400) 로 끊긴다. 18-17(돌파 최신순 getter · 78 팬아웃)과 18-19(WR-03 요청 종류 축)도 relay 쪽 변경이다. 이 저장소에서 `git push` 는 곧 webapp 프로덕션 배포이므로 relay 배포·검증 전에는 push 하지 않는다.

---

## Gap Closure (2026-09-22 · 18-14~18-23)

> 원천: 18-VERIFICATION `gaps`(CR-01 · CR-02) + advisory(WR-01~07) + 사용자 결정(돌파 최신순). 판정 값은 **닫힘 / 재현 안 됨(회귀 가드) / 보류(defer)** 셋 중 하나이며 각 플랜 SUMMARY 원문을 따른다. 상태 열의 수치는 18-23 전량 게이트(2026-09-22) 기준이다.

| # | 갭 | 플랜-태스크 | 요구사항 | 판정 | 근거 (SUMMARY 원문 요지) | 자동 명령 | 상태 |
|---|----|-------------|----------|------|--------------------------|-----------|------|
| 1 | CR-01 코드 3겹 — 시간외종가(G2/G3) 원주문 가격 0 취소 | 18-14-T1/T2 | TRADE-07 | 닫힘 | webapp `buildOrderFrame` 취소 = 0 이상 정수 · relay `RelayOrderCancelSchema.price` `nonnegative()` · 조립기 `priceFloor` 취소 0. 신규·정정 규칙은 넓어지지 않음. 변이 검사로 수정 전 코드 4건 RED 확인 | `pnpm --filter @gh-radar/relay run test -- ws-order protocol envelope` · `pnpm --filter @gh-radar/webapp run test -- relay-provider` | ✅ green (relay 516 · webapp 1383) |
| 2 | CR-01 원격 DB — `dma_orders_price_check` 취소 가격 0 | 18-14-T1(파일) · 18-18-T1~T3 | TRADE-07 | 닫힘 | 사용자 선택 **`apply`**(2026-09-22). `supabase db push` 로 `20260922120000_dma_orders_cancel_price_zero.sql` 1건 반영, 전후 public 덤프 diff 는 CHECK 1줄 교체뿐 · 정책 0 · RLS · service_role GRANT 불변 | `supabase migration list --linked` (20260922120000 Local=Remote) · `supabase db dump --linked -s public \| grep dma_orders_price_check \| grep -c order_type` = 1 | ✅ green (18-18 조회 검증) |
| 3 | CR-02 — VI 「수정」이 가동 중 전략의 계좌를 옮김 | 18-15-T1/T2 | TRADE-08 | 닫힘 | `viRowAccountOf` 정본 계좌 → `vi.set.accountNo` · 불일치 고지(`vi-row-account`) · 확인 요약 「계좌」 줄. RED 커밋 `db0af86`·`09ee8a7` 에서 수정 전 실패 확인 | `pnpm --filter @gh-radar/webapp run test -- vi-settings-rows` · e2e `trading-workbench -g "VI"` | ✅ green |
| 4 | 돌파 목록 최신 위 (사용자 결정) | 18-17-T1/T2 | TRADE-06 | 닫힘 | relay `sortRateCrossNewestFirst`(getter · 78 팬아웃) + 웹 `sortRateCross` 를 `exchangeTime` 내림차순 한 축으로. RED `2c52844` | `pnpm --filter @gh-radar/relay run test -- rate-cross` · e2e `trading-workbench` **GC1** | ✅ green (GC1 pass) |
| 5 | WR-01 — 시간외종가 창 닫힘 경합 시 지정가 폴백 | 18-16-T1 | TRADE-07 | 닫힘 | 세션 `null` 이면 주문을 만들지 않고 `OFFHOURS_WINDOW_CLOSED_TEXT`, 확인 상세 주문유형은 요청과 같은 `session` 에서 파생. RED `ed54ecf` | `pnpm --filter @gh-radar/webapp run test -- manual-order-form` | ✅ green |
| 6 | WR-02 — 카드 접기/펴기 재마운트로 더티·잠금·에코 상관 소실 | 18-20-T1~T3 | TRADE-09 | 닫힘 | 카드별 고정 호스트 노드 `createPortal` + 한 번 펼친 본문은 `hidden` 유지. 수정 전 코드에서 인스턴스 보존 2케이스·본문 보존 1케이스 RED | `pnpm --filter @gh-radar/webapp run test -- card-grid strategy-card` · e2e `trading-workbench` **GC2** · 케이스 6 | ✅ green (GC2 pass) |
| 7 | WR-03 — relay 취소·정정 대기 교차 정산 | 18-19-T1/T2 | TRADE-07 | 닫힘 | 수정 전 코드로 **6/6 재현**(ws ㊷ 에서 정정이 `cancelled` 로 감) → `PendingOrder.kind` + 통보 종류·`requestKind` 하드 필터. 알고 받아들인 경계: 원주문번호를 실은 체결 「E」가 첫 통보인 정정은 timeout 으로 남음(warn `noticeTypeKind:"N"` 으로 식별) | `pnpm --filter @gh-radar/relay run test -- ws-order` | ✅ green (relay 516) |
| 8 | WR-04 — 받을 카드가 없는 미체결 선택 | 18-22-T1 | TRADE-09 | 닫힘 | `cardForUnfilled` 가 정확 일치 카드를 펼치거나 행의 종목·거래소·상태줄 계좌로 카드를 붙임. 새 7케이스 수정 전 RED(같은 ISIN 첫 카드를 펼치던 경로 포함) | `pnpm --filter @gh-radar/webapp run test -- trading-workbench` · e2e `trading-workbench` **GC4** | ✅ green (GC4 pass) |
| 9 | WR-05 — 같은 종목 두 번째 전략 은닉 | 18-21-T1~T3 | TRADE-09 | 닫힘 | 수정 전 코드 **4/4 재현** → 카드 정체성을 ISIN 에서 카드 id(`wb-card-{n}`)로, 등록 전략 유입·포커스는 전략 키 대조 | `pnpm --filter @gh-radar/webapp run test -- trading-workbench card-grid` · e2e `trading-workbench` **GC3** · `sidebar-tree` | ✅ green (GC3 pass) |
| 10 | WR-06 — 정정 수량이 부분체결 잔량을 따르지 않음 | 18-16-T2 | TRADE-07 | 닫힘 | 같은 주문번호 잔량 감소 시 입력을 잔량으로 내림 · 제출 때 잔량 초과 거부 · 확정 직전 재대조. RED `3e294e3` 4건 | `pnpm --filter @gh-radar/webapp run test -- manual-order-form` | ✅ green |
| 11 | WR-07 — 스냅샷 이후 포커스 요청 무기한 보류 | 18-22-T2 | TRADE-09 | 닫힘 | 수정 전 코드 **2/2 재현** → `limitChaserSnapSeq` + `knowsRegistered(snapSeq, list)`. **플랜과 다르게** 빈 `lc.snap` 은 「아직 모름」으로 다룸(콜드 세션의 빈 첫 스냅샷이 `?focus=` 를 버리던 D-02 회귀 회피). 남는 좁은 틈(등록 전략 0건 사용자의 오래된 키 보류)의 근본 수정은 relay 쪽이라 `deferred-items.md` 로 이연 | `pnpm --filter @gh-radar/webapp run test -- trading-workbench use-relay-socket` · e2e `trading-workbench` · `sidebar-tree` | ✅ green |

**전량 게이트 원문 요약줄 (18-23 Task 1, 2026-09-22):**

- build_command 전문 → exit 0 · `error TS` 0
- `pnpm --filter @gh-radar/relay run test` → `Test Files  20 passed (20)` · `Tests  516 passed (516)` (기준선 500)
- `pnpm --filter @gh-radar/webapp run test` → `Test Files  92 passed (92)` · `Tests  1383 passed | 1 skipped (1384)` (기준선 1323)
- `pnpm --filter @gh-radar/webapp run test:e2e` → `Running 150 tests using 1 worker` · `141 passed (3.4m)` · `9 skipped` · failed 0 (기준선 137) — GC1 · GC2 · GC3 · GC4 모두 pass

**보류(defer) 0건 · 재현 안 됨 0건.** 이연된 것은 갭 항목이 아니라 WR-07 을 닫는 과정에서 드러난 relay 측 개선 1건(`deferred-items.md` — 콜드 세션 인증 경로가 빈 hub 캐시를 `lc.snap []` 로 내림)이다. 18-VERIFICATION human_verification #6 · #7 은 위 Manual-Only 표로 인계했다.
