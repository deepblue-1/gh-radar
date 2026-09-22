---
phase: 18-gh-trade-ui-nxt-vi
verified: 2026-09-22T08:20:00Z
round: R2
status: passed
human_verified: "18-UAT-R4.md — 11/11 pass (2026-09-23)"
previous_status: human_needed
score: 11/11 갭 클로징 must-have 검증됨 (원 15개 truth 중 회귀 0)
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-01-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-01-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-02-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-02-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-03-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-03-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-04-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-04-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-05-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-05-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-06-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-06-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-07-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-07-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-08-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-08-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-09-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-09-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-10-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-10-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-11-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-11-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-12-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-12-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-13-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-13-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-14-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-14-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-15-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-15-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-16-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-16-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-17-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-17-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-18-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-18-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-19-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-19-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-20-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-20-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-21-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-21-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-22-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-22-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-23-PLAN.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-23-SUMMARY.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-CONTEXT.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-DISCUSSION-LOG.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-PATTERNS.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-RESEARCH.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-REVIEW.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-UI-SPEC.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-VERIFICATION.md
  - .planning/phases/18-gh-trade-ui-nxt-vi/deferred-items.md
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/store/orders.ts
  - relay/src/ws/__tests__/protocol.test.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/src/ws/protocol.ts
  - relay/tests/rate-cross.test.ts
  - relay/tests/ws-order.test.ts
  - supabase/migrations/20260921120000_dma_orders_modify_offhours.sql
  - supabase/migrations/20260922120000_dma_orders_cancel_price_zero.sql
  - webapp/e2e/overflow.ts
  - webapp/e2e/specs/a11y.spec.ts
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/orderbook.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/app/trading/limit-chaser/[key]/page.tsx
  - webapp/src/app/trading/limit-chaser/new/page.tsx
  - webapp/src/app/trading/limit-chaser/page.tsx
  - webapp/src/app/trading/page.tsx
  - webapp/src/app/trading/vi/page.tsx
  - webapp/src/components/chat/__tests__/chat-fab.test.tsx
  - webapp/src/components/chat/chat-fab.tsx
  - webapp/src/components/chat/fab-clearance.ts
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  - webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/orderbook/order-confirm-dialog.tsx
  - webapp/src/components/orderbook/order-panel.tsx
  - webapp/src/components/orderbook/orderbook-ladder.tsx
  - webapp/src/components/stock/__tests__/orderbook.test.tsx
  - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
  - webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx
  - webapp/src/components/stock/stock-orderbook-section.tsx
  - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/card-grid.test.tsx
  - webapp/src/components/trading/__tests__/card-header.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
  - webapp/src/components/trading/__tests__/quote-grid-10.test.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
  - webapp/src/components/trading/__tests__/stock-add-bar.test.tsx
  - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
  - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/card/quote-grid-10.tsx
  - webapp/src/components/trading/card/stock-info-modal.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/dirty-action-bar.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/workbench/card-grid.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/workbench/stock-add-bar.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/lib/__tests__/alert-tone.test.ts
  - webapp/src/lib/__tests__/breakout-list.test.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/lib/__tests__/queued-window.test.ts
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
  - webapp/src/lib/__tests__/use-vi-server-error.test.ts
  - webapp/src/lib/alert-tone.ts
  - webapp/src/lib/breakout-list.ts
  - webapp/src/lib/isin-labels.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/queued-window.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/trading-focus.ts
  - webapp/src/lib/use-breakout-quotes.ts
  - webapp/src/lib/use-leave-warning.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/use-vi-end-alerts.ts
  - webapp/src/lib/use-vi-server-error.ts
  - webapp/src/styles/globals.css
covered_digest: "v1:sha256:40aaa74a626a1a2750635d901cdb7bec9ad5cd48c691333381c2c0311195cd2e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/15
  gaps_closed:
    - "truth #8 (CR-01) — 시간외종가(G2/G3) 원주문 취소가 webapp 번역기 · relay zod · 조립기 · DB CHECK 4겹을 전부 통과한다"
    - "truth #10 (CR-02) — VI 설정 「수정」이 등록된 전략의 계좌(server.accountNo)를 정본으로 써서, 상태줄 계좌로 가동 중인 VI 를 조용히 옮기지 않는다"
  gaps_remaining: []
  regressions: []
gaps: []
advisory:
  - finding: "WR-07 을 닫은 규칙(knowsRegistered = snapSeq>0 ∧ 목록 비어있지 않음)은 계획이 원래 제시한 규칙(snapSeq>0 만으로 확정)과 다르게, relay 콜드 세션이 인증 직후 빈 lc.snap([]) 을 먼저 보내는 사실 때문에 '등록 전략이 0건인 사용자'의 오래된 포커스 키(예: 전략이 삭제된 뒤 남은 옛 사이드바 링크·북마크)는 여전히 무기한 보류된다. 그 사용자가 이후 같은 키(같은 isin·거래소·계좌)로 새 전략을 등록하면 사용자 조작 없이 카드가 펼쳐지는 WR-07 원래 결함이 그 좁은 경로 하나에서 재현될 수 있다"
    category: other
    reason: "코드 직독(trading-workbench.tsx knowsRegistered)과 deferred-items.md 의 자기신고로 확인됨 — relay 인증 경로가 hub 캐시를 아직 모른 채 빈 lc.snap 을 먼저 내리는 것이 근본 원인이라 webapp 단독으로는 완전히 닫을 수 없다. 영향 범위가 '등록 전략 0건 사용자 + 이후 같은 키 재등록'이라는 좁은 교집합으로 한정되고, 근본 수정안(relay 가 64 이전에는 인증 경로 lc.snap 을 보내지 않음)이 deferred-items.md 에 구체적으로 기록돼 있어 goal-blocking 갭이 아니라 advisory 로 판단한다"
    evidence_status: "코드 읽기로 확인, relay 배포 없이는 자동 테스트로 이 틈 자체를 닫을 수 없음(상태 표현이 relay 계약에 있음)"
human_verification:
  - test: "실 게이트웨이(스텁이 아닌 실 KIS 접속)로 정정(`order.modify`) 왕복 — 접수 → 서버 정정 통지(`M`) → 카드/공용 패널 반영까지 실기 관측"
    expected: "정정이 실제로 체결소에 전달되고 통지가 카드에 정확히 반영된다"
    why_human: "실 KIS 접속 필요, 자동 게이트 범위 밖(round 1 과 동일 — relay 미배포로 여전히 미해소)"
  - test: "예약(장전) 발주·시간외종가(G2/G3) 실발주 — 실제 시장 시간대에 조각수 분할 예약 주문과 시간외종가 주문을 넣어 체결/거부 왕복 확인"
    expected: "예약 주문이 09:00(NXT 08:00) 정시에 접수되고, 시간외종가 주문이 참고 종가로 체결된다"
    why_human: "실 시장 시간대·실 게이트웨이 의존이라 스텁으로 재현 불가(round 1 과 동일)"
  - test: "알림음 자동재생 차단 상태에서 상태줄 아이콘이 「클릭해 활성화」로 바뀌고, 사용자 제스처 클릭 안에서 `resume()` 이 실제로 소리를 트는지 브라우저에서 확인"
    expected: "차단 상태 아이콘 표시 → 클릭 → 오디오 컨텍스트 resume → 이후 알림음 정상 재생"
    why_human: "브라우저 자동재생 정책은 헤드리스 테스트 환경에서 실제 차단 상태를 재현하기 어렵다(round 1 과 동일)"
  - test: "VI 확인 체크(`ConfirmVIOrderReq 33`) 전송 후 서버가 거부/타임아웃하는 실 왕복 — 체크 잠금이 풀리고 행 인라인 `role=\"status\"` 가 뜨는지"
    expected: "거부/타임아웃 시 체크 잠금 해제 + 기존 `vi-order-list` 오류 문구 인라인 표시"
    why_human: "18-05 PLAN 의 해당 truth 가 `verification: backstop` 으로 명시적으로 실기 확인을 요구한다(round 1 과 동일)"
  - test: "정본 목업(`18-workbench-mockup.html` 7차·`18-orderbook-tab-mockup.html` 6차)과 실제 구현 화면의 시각적 일치 여부(라이트/다크, 4밴드) 육안 대조 — 갭 클로징으로 바뀐 부분(카드 접기/펴기 재마운트 제거, VI 줄 불일치 고지 문구, 시간외종가 「0」→「시간외종가」 표기) 포함"
    expected: "구현 화면이 정본 목업과 레이아웃·색·문구가 일치하고, 갭 클로징이 추가한 문구·상태 표시도 목업 톤과 맞는다"
    why_human: "시각적 비교는 grep/코드 판독으로 판정할 수 없다(round 1 과 동일 + 갭 클로징 신규 표시 추가분)"
  - test: "CR-01 실계좌 재현/수정 확인 — relay 배포 뒤 `close_price_mode=\"zero\"` 설정에서 시간외종가 원주문 취소가 실제로 접수·정산되는지"
    expected: "가격 0 취소 프레임이 close(4400) 없이 게이트웨이까지 나가고 취소확인으로 정산된다"
    why_human: "코드 3층(webapp·relay zod·조립기)과 원격 DB CHECK 는 이번 라운드에서 코드 직독·relay 단위 테스트(516 pass)·`supabase migration list --linked`(20260922120000 Remote 적용 확인)로 검증했지만, **relay 자체가 아직 프로덕션에 배포되지 않았다** — 배포 전에는 실계좌 왕복을 관측할 수 없다"
  - test: "CR-02 2계좌 환경 실기 확인 — 계좌 B 로 가동 중인 VI 를 상태줄 A 에서 「수정」해도 계좌가 B 로 유지되는지, 불일치 고지 문구가 뜨는지"
    expected: "「수정」 뒤에도 서버 전략 계좌가 정본으로 유지되고, 상태줄과 다르면 줄 아래 고지가 보인다"
    why_human: "e2e 픽스처는 계좌 1개뿐이라 단위 테스트(`viRowAccountOf` 4케이스 + 10케이스)로 로직은 검증했지만 2계좌 실 세션 재현은 자동 게이트 범위 밖이다(round 1 human_verification #7 승계)"
---

# Phase 18: gh-trade 신규 기능 UI — 통합 트레이딩 작업대(상따+VI+돌파감지) · 예약/시간외종가 발주 · NXT VI Re-Verification Report (R2)

**Phase Goal:** 서버가 새로 제공하는 세 기능(돌파감지 76/78 · 예약/장전/시간외종가 창 힌트 77 · 거래소별 VI)을 웹에서 쓸 수 있되, 상따와 VI 를 `/trading` 한 페이지로 합친 다종목 트레이딩 작업대로 만든다.

**Verified:** 2026-09-22T08:20:00Z
**Status:** human_needed
**Re-verification:** Yes — 18-14~18-23 갭 클로징 라운드 이후

## 요약

라운드 1(`18-VERIFICATION.md`, gaps_found · 13/15)이 지목한 두 Critical(CR-01 · CR-02)과 7건의 Warning(WR-01~07), 그리고 18-08 이후 사용자 결정으로 확정된 돌파 목록 정렬 축 정정을 이번 갭 클로징 라운드(18-14~18-23, 총 10개 플랜)가 다뤘다. 이 재검증은 SUMMARY.md 의 주장을 그대로 받아들이지 않고, 관련 소스 파일을 직접 읽고, relay·webapp 전량 테스트·타입체크·핵심 e2e 스펙을 이 세션에서 **직접 재실행**해 확인했다.

**결론: 11개 갭 클로징 항목(CR-01 코드 3겹·CR-01 원격 DB·CR-02·돌파 최신순·WR-01~07) 전부가 코드베이스에서 실물로 확인됐다.** 원 15개 truth 중 회귀는 0건이다(relay 516/516 · webapp 1383 passed·1 skipped · typecheck 전량 클린 · e2e 전체 스위트 141 passed·0 failed·9 skipped(4.6m, 18-23 수치와 정확히 일치) · GC1~GC4 전부 포함). WR-07 은 계획과 다르게(빈 `lc.snap` 을 "아직 모름"으로 처리) 닫혔고, 그 결과 등록 전략이 0건인 사용자의 오래된 포커스 키가 무기한 보류되는 좁은 잔여가 남는다 — 이는 goal 을 막는 갭이 아니라 advisory 로 판단한다(아래 근거).

**gaps_found 로 되돌릴 근거는 없다.** 그러나 `passed` 로도 판정하지 않는다 — round 1 에서 이미 존재했고 이번 라운드로도 해소되지 않는 human_verification 항목(실 게이트웨이 왕복, 실 시장 시간대 발주, 오디오 자동재생, VI 확인 backstop, 목업 육안 대조) 이 그대로 남아 있고, 여기에 CR-01·CR-02 의 **배포 의존적** 실계좌/2계좌 실기 확인 2건이 이어진다 — **relay 가 아직 프로덕션에 배포되지 않았다**(18-14/17/19 의 relay 변경, 18-18 의 DB 변경만 원격 반영됨). 그래서 상태는 `human_needed` 다.

## Goal Achievement — 갭 클로징 11개 항목 재검증

| # | 갭 | 요구사항 | Round 1 상태 | R2 상태 | 근거 |
|---|----|---------|--------------|---------|------|
| 1 | CR-01 코드 3겹 — 시간외종가(G2/G3) 원주문 가격 0 취소 | TRADE-07 | ✗ FAILED (truth #8) | ✓ VERIFIED | `webapp/src/lib/relay-provider.tsx:176-182` 취소 가격 검사가 `Number.isInteger(req.price) && req.price >= 0` 로 종류별 분기됨을 직접 확인. `relay/src/ws/protocol.ts:309-318` `RelayOrderCancelSchema.price: z.number().int().nonnegative()`. `relay/src/dma/envelope.ts:966` `priceFloor = orderType === "C" \|\| krxSession !== null ? 0 : 1`. relay 전량 516/516 재실행 통과(신규·정정 가격 규칙 무변경 회귀 포함) |
| 2 | CR-01 원격 DB — `dma_orders_price_check` 취소 가격 0 | TRADE-07 | ✗ FAILED (truth #8 의 4번째 겹) | ✓ VERIFIED | `supabase/migrations/20260922120000_dma_orders_cancel_price_zero.sql` 원문 확인(취소 갈래 `order_type = 'C'` 포함, `BEGIN`/`COMMIT` 트랜잭션, policy/grant 구문 0). 이 세션에서 직접 `supabase migration list --linked` 재실행 → `20260922120000 \| 20260922120000` (Local=Remote, 적용 확인) |
| 3 | CR-02 — VI 「수정」이 가동 중 전략의 계좌를 옮김 | TRADE-08 | ✗ FAILED (truth #10) | ✓ VERIFIED | `webapp/src/components/trading/workbench/vi-settings-rows.tsx:131-137` `viRowAccountOf` — 등록 계좌(`server.accountNo`)가 정본, 미등록·공란만 상태줄 계좌. `:313` `ViSettingsRow` 가 이 값을 `submit`·`locked`·고지에 공용으로 씀을 직접 확인. webapp 전량 1383 passed 재실행 통과(vi-settings-rows 관련 케이스 포함) |
| 4 | 돌파 목록 최신 위 (2026-09-22 사용자 결정) | TRADE-06 | (round 1 대상 아님 — 18-08 이후 사용자 결정) | ✓ VERIFIED | `relay/src/hub/subscription-hub.ts:229` `sortRateCrossNewestFirst`(getter·78 팬아웃 공용), `webapp/src/lib/use-relay-socket.ts:278-281` 같은 축 주석 확인. e2e GC1 재실행 통과 |
| 5 | WR-01 — 시간외종가 창 닫힘 경합 시 지정가 폴백 | TRADE-07 | ⚠ Advisory | ✓ VERIFIED | `manual-order-form.tsx:94` `OFFHOURS_WINDOW_CLOSED_TEXT`, `:212` `offHoursSessionOf`(거래소 인자 추가), `:434-438` 세션 `null` 이면 반환 확인. webapp 단위·타입체크 재실행 통과 |
| 6 | WR-02 — 카드 접기/펴기 재마운트로 더티·잠금·에코 상관 소실 | TRADE-09 | ⚠ Advisory | ✓ VERIFIED | `card-grid.tsx:54,134-170,246-247` 카드별 고정 호스트 노드 + `createPortal` 구조 확인(`grep -c createPortal` = 3). `strategy-card.tsx:644-645,709` `everOpened` 파생 상태로 본문을 숨김 유지함을 확인. e2e GC2 재실행 통과 |
| 7 | WR-03 — relay 취소·정정 대기 교차 정산 | TRADE-07 | ⚠ Advisory(리뷰 인용만, 미재현) | ✓ VERIFIED | `order-handler.ts:206-208` `PendingOrder.kind`, `:1212-1306` `narrowPending` 이 통보 종류·`requestKind` 를 하드 필터로 씀을 확인. SUMMARY 가 수정 전 코드로 6/6 RED 재현(교차 오정산 실측)을 기록했고, relay 전량 516/516 재실행으로 회귀 없음 확인 |
| 8 | WR-04 — 받을 카드가 없는 미체결 선택 | TRADE-09 | ⚠ Advisory | ✓ VERIFIED | `trading-workbench.tsx:204` `cardForUnfilled`(정확 일치 또는 붙일 카드), `:547` `selectUnfilled` 가 이를 호출함을 확인. e2e GC4 재실행 통과(원주문 칩 확인 포함) |
| 9 | WR-05 — 같은 종목 두 번째 전략 은닉 | TRADE-09 | ⚠ Advisory(리뷰 인용만, 미재현) | ✓ VERIFIED | `trading-workbench.tsx` 카드 정체성이 `wb-card-{n}`(`nextCardId`)로 옮겨졌고 `card-grid.tsx`/`strategy-card.tsx`/`card-header.tsx` 가 `cardId` 를 공용으로 씀을 확인. SUMMARY 가 수정 전 코드로 4/4 RED 재현 기록. e2e GC3 재실행 통과 |
| 10 | WR-06 — 정정 수량이 부분체결 잔량을 따르지 않음 | TRADE-07 | ⚠ Advisory | ✓ VERIFIED | `manual-order-form.tsx:98-107` `modifyQtyOverRemainingText`·`modifyQtyClampedText`·`MODIFY_REMAINING_CHANGED_TEXT`·`MODIFY_TARGET_GONE_TEXT` 4종 export 확인, `:334,402,499-501` 호출부 확인. webapp 단위 재실행 통과 |
| 11 | WR-07 — 스냅샷 이후 포커스 요청 무기한 보류 | TRADE-09 | ⚠ Advisory(리뷰 인용만, 미재현) | ✓ VERIFIED (좁은 잔여는 advisory) | `trading-workbench.tsx:236` `knowsRegistered(snapSeq, limitChasers)` = `snapSeq > 0 ∧ 목록 비어있지 않음`. SUMMARY 가 수정 전 코드로 2/2 RED 재현 기록. **계획과 다르게 닫힘**(아래 advisory 참고) |

**Score:** 11/11 갭 클로징 must-have 검증됨. 원 15개 truth(round 1) 재실행 회귀 0건.

### 원 15개 Truth 회귀 확인 (Quick Regression)

round 1 에서 이미 ✓ VERIFIED 였던 truth #1-7, #9, #11-15 는 이번 세션의 전량 게이트 재실행(아래)으로 회귀 없음을 확인했다 — 개별 재검증은 생략하고 존재·통과 여부만 재확인했다(re-verification 최적화).

### Behavioral Spot-Checks (이 세션에서 직접 재실행)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| relay 단위 테스트 전량 | `pnpm --filter @gh-radar/relay run test` | Test Files 20 passed · Tests **516 passed** (18-23 주장과 일치) | ✓ PASS |
| webapp 단위 테스트 전량 | `pnpm --filter @gh-radar/webapp run test` | Test Files 92 passed · Tests **1383 passed \| 1 skipped** (18-23 주장과 일치) | ✓ PASS |
| shared 빌드 + relay/webapp 타입체크 전량 | `pnpm --filter @gh-radar/shared build && relay typecheck && relay typecheck:tests && webapp typecheck(+e2e tsconfig)` | `error TS` 0 | ✓ PASS |
| e2e `trading-workbench` + `sidebar-tree` | `pnpm run test:e2e -- trading-workbench sidebar-tree` | **39 passed**(GC1·GC2·GC3·GC4 전부 포함, 케이스 1-28 + sidebar 1-5) | ✓ PASS |
| 원격 DB 마이그레이션 반영 확인(읽기 전용) | `supabase migration list --linked` | `20260922120000 \| 20260922120000 \| 2026-09-22 12:00:00`(Local=Remote) | ✓ PASS |
| 저장소 내 TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER 마커 | 갭 클로징이 건드린 14개 핵심 파일 grep | 매치 0건 | ✓ PASS |

**전체 e2e 스위트 재확인:** `pnpm run test:e2e`(150 케이스, a11y·orderbook·me·user-themes·watchlist 전부 포함)를 이 세션에서 직접 재실행해 완료까지 확인했다 — **141 passed · 0 failed · 9 skipped (4.6m)**. 18-23 이 보고한 수치(141/0/9)와 정확히 일치하고, 건너뛴 9건도 같은 선재 skip(서비스키 부재 — `user-themes` 4 · `watchlist` 5)이다. 실패 0건.

### Requirements Coverage (재확인)

| Requirement | R1 상태 | R2 상태 | 근거 |
|-------------|---------|---------|------|
| TRADE-06 | ✓ SATISFIED | ✓ SATISFIED (돌파 최신순 정합 포함) | 스트립/표·이탈 가드·알림 1일1회·relay name/code 보강 + 최신순 정렬 전부 확인 |
| TRADE-07 | ⚠ PARTIAL(CR-01 로 취소 실패) | ✓ SATISFIED | CR-01(코드 3겹+DB) · WR-01 · WR-03 · WR-06 전부 닫힘 확인 |
| TRADE-08 | ⚠ PARTIAL(CR-02 로 계좌 안전성 실패) | ✓ SATISFIED | CR-02 닫힘 확인, VI 발동 스트립·확인 체크는 회귀 없음 |
| TRADE-09 | ✓ SATISFIED | ✓ SATISFIED (WR-02·WR-04·WR-05·WR-07 카드 안전성 보강 포함) | 카드 재마운트 제거·같은 종목 카드 2장·미체결 카드 보장·포커스 보류 한정 전부 확인 |

**참고:** `.planning/REQUIREMENTS.md` 는 18-23 이 이 4개 ID 를 `Gaps Found` → `Pending`(재검증 대기)으로만 되돌려 뒀다. 이 재검증 결과(코드 층위 전량 닫힘 + 자동 게이트 green)에도 불구하고 **relay 가 프로덕션에 미배포**이므로, 이 보고서는 `Complete` 재판정의 근거로 쓰기에 충분하지 않다고 판단한다 — 이는 이 프로젝트의 기존 관행(Phase 16 TRADE-03·Phase 17 TRADE-04/05 가 코드 완료 후에도 실서버 결선 관측 전까지 Pending 유지)과 일치한다. `Complete` 판정은 relay 배포 + human_verification 항목(특히 CR-01/CR-02 실계좌·2계좌 확인) 뒤로 미룬다.

## Anti-Patterns Found

갭 클로징이 건드린 14개 핵심 파일에서 TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER 마커 0건. 스텁·하드코딩 빈 값 패턴도 없음(모든 새 로직이 실제 상태 파생·서버 필드 참조로 구현됨 — 위 코드 인용 참고).

## Human Verification Required

round 1 의 human_verification 5건(실 게이트웨이 정정 왕복 · 예약/시간외종가 실발주 · 오디오 자동재생 · VI 확인 backstop · 목업 육안 대조)은 이번 라운드로 해소되지 않아 그대로 승계한다. 여기에 CR-01·CR-02 가 코드 층위에서 닫힌 것을 반영해 round 1 의 #6·#7 을 "relay 배포 후 실기 확인" 으로 갱신했다(정본은 frontmatter `human_verification` 참고, 총 7건).

## Gaps Summary

**이번 라운드에서 새로 발견된 gap 은 없다.** 갭 클로징 10건(11행)이 코드·테스트·원격 DB 반영까지 전부 확인됐다. 유일한 잔여는 WR-07 이 계획과 다르게 닫히며 남은 좁은 틈(등록 전략 0건 사용자의 오래된 포커스 키)인데, relay 배포가 필요한 근본 수정이 `deferred-items.md` 에 구체적으로 기록돼 있고 영향 범위가 좁아 advisory 로 분류했다(goal 을 막지 않음).

**상태가 `passed` 가 아니라 `human_needed` 인 이유는 오직 하나 — relay 가 아직 프로덕션에 배포되지 않았다.** DB(18-18, 완료) → relay 배포 → 검증 → webapp push 순서가 남아 있고, relay 배포 전에는 CR-01/CR-02/WR-03 의 실계좌 효과를 관측할 수 없다. 배포 순서를 진행하고 human_verification 7건(그중 특히 #6·#7)을 확인하면 TRADE-06~09 를 Complete 로 재판정할 근거가 갖춰진다.

---

_검증 시각: 2026-09-22T08:20:00Z_
_검증자: Claude (gsd-verifier, re-verification round 2)_

## 오케스트레이터 주석 — 18-REVIEW-R2 GC-CR-01 과의 충돌 (2026-09-22)

이 보고서는 「CR-01 원격 DB 층 검증됨」으로 판정했지만, 같은 라운드의 18-REVIEW-R2 **GC-CR-01** 이 그 전제를 뒤집는다. 오케스트레이터가 SQL 3값 논리로 직접 확인했다:

- `CHECK (price > 0 OR (price = 0 AND (order_type = 'C' OR krx_session IN ('G2','G3'))))` 에서 `krx_session` 이 NULL 이면 `krx_session IN (...)` 이 NULL → 식 전체가 NULL → Postgres 는 CHECK 의 NULL 을 **통과**로 본다.
- 따라서 세션 없는 가격 0 신규·정정 행도 DB 에서 거부되지 않는다(18-18 T-18-82 기록은 사실이 아님). 같은 이유로 **옛 CHECK 도 가격 0 취소 행을 원래부터 통과시켰다** — CR-01 의 「DB 층이 막는다」 전제가 틀렸다.
- 실주문 안전은 relay zod · 조립기가 지키고 있으나, DB 최후 방어선은 의도대로 동작하지 않는다.

`migration list --linked` 로 확인한 것은 「적용됨」뿐이며 「의도대로 강제됨」이 아니다. 이 항목과 GC-WR-01~04 는 다음 갭 클로징 라운드 대상이다 — 위 `status: human_needed` 는 코드 게이트·UAT 관점 판정이고, 페이즈 종결 판정이 아니다.
