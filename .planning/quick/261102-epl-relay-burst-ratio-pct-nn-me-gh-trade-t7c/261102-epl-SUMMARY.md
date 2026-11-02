---
phase: quick-261102-epl
plan: 01
subsystem: relay · shared · webapp (상따 호가 사다리 · /me 상따 기본설정)
tags: [gh-trade-handoff, burst-ratio, user-settings, orderbook-ladder]
status: complete
requires:
  - gh-trade quick-261101-t7c (StockDMA.fbs 말미 append — QuoteState.burst_ratio_pct · UserSettings.burst_ratio_pct · 마커 b6d3f3ef)
provides:
  - RelayQuote.brp (59 버스트 비율 판정 · 거래소별 · 부재 0)
  - RelayUserSettingsValues.burstRatioPct? (84 늘 실림 · 42 는 1~100 일 때만 슬롯)
  - burstMarkOf · BurstMark tone · OrderbookLadder burstThresholdPct
  - BURST_RATIO_DEFAULT_PCT · burstRatioPctOf · burstRatioThresholdOf
  - /me 「버스트 상한가 · 판정 비율」 칸
affects:
  - relay hub samePriceSection (가격 섹션 서명 14필드)
  - UserSettingsNumericKey 파생(선택 숫자 키 포함)
tech-stack:
  added: []
  patterns:
    - "선택 42 슬롯 규율(값 있을 때만 add*) — 선매수 2필드 선례와 같되 웹은 0 을 싣지 않는다"
    - "표시값(shown)과 저장 조립값(values) 분리 — 84 0 일 때 표시 70 · 42 부재 동시 성립"
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/quote-state.ts
    - relay/src/generated/stock-dma/user-settings.ts
    - packages/shared/src/relay.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/hub.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/ws-autosell.test.ts
    - relay/tests/fanout.test.ts
    - webapp/src/lib/user-settings-server.ts
    - webapp/src/lib/__tests__/user-settings-server.test.ts
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder.test.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/__tests__/quote-grid-10.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/me/limit-chaser-defaults.tsx
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
    - webapp/e2e/specs/me.spec.ts
    - docs/inbox/from-gh-trade/261101-burst-ratio-pct.md
decisions:
  - "사다리 기준 = userSettingsForAccount(카드 계좌 서버 84) → burstRatioThresholdOf — 다른 서버(primary) 값으로 대신 쓰지 않는다(Pitfall 14)"
  - "UserSettingsNumericKey 를 -? · NonNullable 로 파생 — 선택 숫자 키(burstRatioPct)도 범위 표 · 숫자 행 키에 포함"
  - "구 서버에서 70 확정 시 3초 실패는 그대로 둔다(서버 120·119 배포 뒤 해소)"
metrics:
  duration: "약 50분"
  completed: 2026-11-02
estimate:
  tokens: 150000
actuals:
  tokens: 29400
  tasks: 3
  commits: 4
plan_head_before: b9186d50e71e7cee6ab09af0de4bab016d0b50f3
plan_head_after: f405d1c65bb16664e4e3549ee2ea136444401958
---

# Quick 261102-epl: 버스트 비율 판정 웹 반영 Summary

59 `burst_ratio_pct` 를 relay `RelayQuote.brp` 로 거래소별로 나르고(hub 가격 섹션 비교 포함) 상따 호가 사다리에 WinForms 동형 4갈래(빨간 「버스트 NN%」 · 회색 「NN%」 · 종전 「버스트」 · 없음)로 그리며, 84/42 `burstRatioPct` 왕복(웹은 1~100 일 때만 싣고 0 은 부재)과 /me 「버스트 상한가 · 판정 비율」 칸 · 카드 계좌 서버 84 기준 배선을 끝냈다.

## 커밋

| Task | 해시 | 메시지 |
|------|------|--------|
| 1 (tracer) | 994ae31b | feat(relay,webapp): 버스트 비율 판정 59 brp — 디코드 · 가격 섹션 동등 비교 · 상따 호가 사다리 「버스트 NN%」/회색 「NN%」 (생성물 재동기화 포함) |
| 2 | f4a27153 | feat(relay,shared,webapp): 버스트 판정 비율 84/42 — 디코드(부재 0) · 값 있을 때만 42 슬롯 · zod 1~100 · /me 42 는 1~100 일 때만 |
| 3 | a441b9be | feat(webapp): /me 「버스트 상한가 · 판정 비율」 칸 · 호가 사다리 기준을 카드 계좌 서버 84 로 |
| 3F | f405d1c6 | docs(inbox): 261101 버스트 비율 판정 인계 처리 완료 (done_commit a441b9be) |

## 검증

- typecheck: shared · relay(src + tests) · webapp(tsc + e2e tsconfig) 전부 통과.
- eslint: limit-chaser-defaults.tsx · card-body.tsx · orderbook-ladder.tsx · user-settings-server.ts 통과.
- 지정 vitest: Task 1 relay 373 · webapp 107 / Task 2 relay 713 · webapp 227 / Task 3 webapp 188 — 전부 통과.
- RED 확인: hub 의 `a.brp === b.brp` 를 잠시 빼면 P2 · Q3b 2건이 실패함을 확인 후 복원.
- e2e: `me.spec.ts -g "P27-M1|P31-5" --workers=1` 4 passed (setup 포함).
- 전체 회귀 1회(순차): shared 26 파일 854 통과 · relay 61 파일 1858 통과 · webapp 195 파일 5132 통과 + 1 skip(기존). 무관 기존 실패 없음.

## Deviations from Plan

1. **[범위 축소 — 불필요] fanout-multi-session · hub-multi-session 테스트 갱신 없음.** 플랜은 toEqual 기대 갱신을 예상했으나 두 파일은 84/42 전체 객체를 toEqual 로 비교하지 않아 그대로 통과했다. fanout.test · ws-autosell.test 만 갱신.
2. **[Rule 3] Task 2 에서 limit-chaser-defaults.tsx 의 인라인/시트 initialValue 에 `?? null` 임시 보강** — UserSettingsNumericKey 확장으로 tsc 가 요구. Task 3 에서 `shown`(burstRatioPct 늘 존재) 도입으로 대체됐다.
3. **[테스트 조정] /me 범위 문구 단언은 `document.body` 로** — 인라인 말풍선(FailureBubble)이 포털로 body 에 서서 섹션 안에서는 보이지 않는다. 입력 `aria-invalid` 도 함께 단언.

## 범위 밖 관찰 (손대지 않음)

- 실행 중 `docs/inbox/from-gh-trade/261102-burst-cancel-ratio.md`(gh-trade quick-261102-enc · kind 7 cancel_reason 12 의 `cond_actual` = 판정 비율 %, 와이어 무변경 · 웹 주문로그 「버스트 상한가 NN%」 선택 반영)가 새로 들어왔다. status open — 별건.
- 다른 세션의 `.planning/ROADMAP.md` · `STATE.md` · `state.json` 수정, `.planning/phases/36-account-budget/.gitkeep` · `.planning/phases/37-tick-viewer/` 는 건드리지 않았다.

## 남은 위험

- 구 서버(84 에 슬롯 없음)에서 사용자가 판정 비율을 확정하면 42 는 나가지만 84 가 값을 싣지 않아 3초 뒤 「반영되지 않았어요」 가 선다(오케스트레이터 결정 3 — 그대로 둠, 서버 120·119 배포 뒤 해소).
- 서버가 1~100 밖 값을 84 에 실으면 웹은 「모름」 으로 보고 70 을 보이며 42 에 싣지 않는다(서버 저장값 유지 — 의도).

## 배포

배포는 메인 세션: relay 먼저 → push(webapp 프로덕션). 이 quick 은 push · 배포하지 않았다. DB 마이그레이션 없음.

## Self-Check: PASSED

- 커밋 994ae31b · f4a27153 · a441b9be · f405d1c6 모두 HEAD 조상.
- 인박스 노트 status done · done_commit a441b9be · 「## gh-radar 처리」 절 존재.

## 후속 (같은 quick · 인박스 261102-burst-cancel-ratio)

- `21e6682d` feat(shared): 주문로그 취소 사유 12 「버스트 상한가 NN%」 — kind 7 `cond_actual` 판정 비율(1~100) · 0 은 종전 문구. 와이어 무변경(gh-trade quick-261102-enc).
- 배포 메모: 4개 코드 커밋은 옆 세션 push(`aca90ca3`)로 webapp 이 relay 보다 먼저 프로덕션에 나갔다. 구 relay zod 는 strip 이라 안전(비율 표시는 relay 배포 뒤 동작).
