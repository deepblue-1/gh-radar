---
phase: quick-260929-vzy
plan: 01
subsystem: relay · webapp (상따 후매수)
status: complete
tags: [limit-chaser, post-buy-auto, relay, flatbuffers, webapp, e2e]
requires:
  - gh-trade master dcaa78b1 (SetLimitChaser post_buy_auto · buy3_schema 2)
provides:
  - RelayLimitChaser.postBuyAuto (양방향 계약)
  - relay LcSetCfg · LC_POST_BUY_AUTO_BUY3_SCHEMA=2 (존재로만 파생)
  - webapp 후매수 제목줄 「자동」 체크 (GroupHeaderCheck)
affects:
  - relay #isTeardown · webapp isDeleteIntent/crudOf/isActiveStrategy/LC_GATE_FIELDS (다섯 항)
  - strategy-log 전이 표 26 → 28
tech-stack:
  added: []
  patterns:
    - "shared 는 새 클라 계약(필수), relay 와이어는 구 탭 관용(LcSetCfg 선택)"
    - "buy3_schema 는 브라우저가 고르지 않는다 — cfg.postBuyAuto 존재로만 1/2"
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - packages/shared/src/relay.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/fanout.test.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/test-fixtures/limit-chaser.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "「자동」 체크는 후매수 제목줄에서 스위치 바로 앞(스위치는 마지막 자식 유지) — 사용자 확정"
  - "자동만 켠 등록은 삭제가 아니다 — relay #isTeardown · 웹 isDeleteIntent 가 같은 다섯 항(P-1)"
  - "자동 켜기는 후매수 켜기와 같은 사전 검증 · relay zod 에는 완결성 규칙을 넣지 않는다(P-2)"
  - "GroupHeaderCheck 는 -ml-2 · gap-1 · 패딩 0 — 본문 344 에서 「후매수」 낱말이 갈리지 않게(실측)"
metrics:
  duration: "21m"
  completed: 2026-09-29
plan_head_before: 6289e4308cf2a82c5295dc6d718b5a97269439dd
estimate:
  tokens: 230000
  tasks: 3
actuals:
  tokens: 446770   # chars/4 over the 25 changed files (diff 자체는 ≈ 25,300)
  tasks: 3
  commits: 7
---

# Phase quick-260929-vzy Plan 01: 후매수 「자동」 체크 relay · 웹앱 Summary

후매수 ☐자동을 붙였다. shared 계약에 `postBuyAuto` 를 더했다. relay 는 `cfg.postBuyAuto` 가 있을 때만 buy3_schema 2 로 `post_buy_auto` 를 싣고, 60 · 64 에코에서 이 값을 디코드한다. 웹앱은 후매수 제목줄에 「자동」 체크를 두고 에코 값을 그대로 보인다. 사람이 매수주문을 끄면 같은 제출에서 자동도 끈다. 자동 켜기는 후매수 켜기와 같은 사전 검증을 거친다. 「자동만 켠 등록」 은 relay 와 웹 양쪽에서 삭제로 보지 않는다(다섯 항).

## 커밋

| # | 해시 | 메시지 | 파일 |
|---|------|--------|------|
| 1 | 127c1028 | chore — relay 생성물 SetLimitChaser post_buy_auto(vtable 132) · dcaa78b1 합성 그대로 | StockDMA.fbs · set-limit-chaser.ts |
| 2 | fb175921 | feat — 트레이서: shared postBuyAuto · buy3_schema 2 파생 · 60/64 디코드 · 제목줄 체크 · e2e vzy-1 | 15 파일 |
| 3 | d261c8d0 | test — 계약 의미 실패 테스트(RED) | envelope/protocol/fanout · limit-chaser · use-lc-field-commit 테스트 |
| 4 | bf36a28f | feat — 자동만 켠 등록은 삭제 아님(GREEN) | fanout.ts · limit-chaser.ts · use-lc-field-commit.ts · limit-chaser.test.ts |
| 5 | eac3a60e | test — 웹 동작 실패 테스트(RED) | limit-chaser-form · strategy-log · setting-group 테스트 |
| 6 | b8db4c3c | fix — lc-tracer cfg 키 수 43 → 44(Task 1 누락분) | lc-tracer.test.tsx |
| 7 | 25ba301d | feat — 웹 동작(GREEN): 마스터 OFF 동반 끔 · 사전 검증 · 비활성 · 로그 · P24-7 | limit-chaser-form · setting-group · strategy-log · e2e spec |

모든 커밋에 Co-Authored-By 줄이 없다(0건 확인). `.planning/` 파일은 이 커밋들에 들어가지 않았다. `relay/src/generated` 변경은 커밋 1 한 건 · 2파일뿐이다. Phase 25 생성물(`cancel-reason.ts` · `evidence-kind.ts`)은 그대로 있다. 동기화 스크립트는 돌리지 않았다.

## RED / GREEN

**Task 2 RED (d261c8d0)** — 실제로 실패한 테스트는 5건이다.
- relay `⑰-auto-b`: 「거부 통지」 대기가 타임아웃났다. 당시 `#isTeardown` 은 게이트 4종만 봤다. 그래서 자동만 켠 등록이 철거로 판정됐고, 폴백 시장 "K" 로 게이트웨이까지 나갔다.
- web `isDeleteIntent({게이트 4종 OFF, postBuyAuto:true})` 가 true 였다(기대값 false). `isActiveStrategy` 는 false 였다(기대값 true).
- web `LC_GATE_FIELDS` 에 postBuyAuto 가 없었다. 미등록 상태에서 `commit('postBuyAuto', true)` 는 `'sent'` 가 아니라 `'local'` 이었다.
- 나머지(envelope ③-auto · ⑤-auto, protocol ①-auto · ①-auto-b, fanout ⑰-auto · ⑰-auto-c)는 RED 시점에 이미 통과했다. Task 1 트레이서가 buy3_schema 파생 · 디코드 · zod 선택 필드를 이미 구현해 두었기 때문이다. 이 테스트들은 계약을 고정하는 특성 테스트다.

**Task 3 RED (eac3a60e)** — 실제로 실패한 테스트는 7건이다.
- form ①: 매수주문을 끄는 cfg 에 postBuyAuto 가 true 로 남았다. 동반 끔이 없었다.
- form ③: 금액 0 에서 자동을 켜자 전송이 1건 나갔다. 사전 검증이 없었다.
- form ④: 구서버 에코에서 체크가 disabled 가 아니었다.
- log ⑰-6: 전이 표 원소가 26개였다(기대값 28).
- log ①: `TRANSITION_TEXT.postBuyAutoOn` 이 undefined 였다. 발화 에코가 「서버 반영 완료」 로 오귀속됐다. 첫 스냅샷 줄에 자동 조각이 없었다.
- form ② · ⑤, setting-group ②-auto, log ② 는 RED 시점에 이미 통과했다(특성 테스트). Task 1 이 슬롯 · 컴포넌트를 먼저 만들었다. 54 사유 줄은 기존 라우팅을 그대로 탄다.

GREEN 뒤에는 모두 통과한다.

## 테스트 수 (전 → 후)

- relay `vitest run`: 30 파일 · 721 → **731 passed**(+10), 실패 0.
- webapp `vitest run`: 136 파일 · 3031 passed + 1 skipped → **3049 passed + 1 skipped**(+18), 실패 0. skipped 1건은 이번 작업 전부터 있던 것이다.
- typecheck: shared build · relay typecheck · relay typecheck:tests · webapp typecheck(앱 + e2e) 모두 green.
- e2e(실 relay + 스텁 게이트웨이 + 실브라우저): `vzy-1` 통과, `P24-7`(네 밴드 · 제목줄 측정 확장) 통과. 각 실행에서 auth setup 1건이 함께 돌았다.
- a11y: 「/trading 상따 매수 카드 axe 매트릭스」(본문 344 · 992 × 라이트 · 다크 × 접힘 · 펼침) critical/serious 0, 통과.

## 수기 사본 점검 (D-04)

- `relay/src/dma/msg-type.ts`: SetLimitChaser 의 필드나 슬롯 수를 나열하는 곳이 없다. MsgType 번호(10 · 60)만 있다. 변경 없음.
- `relay/src/hub/subscription-hub.ts`: `case MSG.SetLimitChaserResp` 가 `parseLimitChaserEcho` 에 위임만 한다. 변경 없음.
- `relay/src/dma/envelope.ts` 주석 수정 목록:
  - 「45슬롯 테이블」 → 「65슬롯 테이블(`startObject(65)`)」
  - 조립 필드 산식에 「+ 선택 1(`post_buy_auto` — 입력에 있을 때만) = 최대 46 필드」 추가
  - buy3_schema 문장 → 「1 또는 2 — `postBuyAuto` 존재로만 파생」
  - `readLimitChaser` 「활성 55필드」 → 「활성 56필드(+ `postBuyAuto`)」
  - buy3Schema 「relay 가 늘 1 로 보내지만」 → 「1 또는 2 로 보내지만」
- 테스트 사본: `frames.ts` 에 `FakeLimitChaserInput.postBuyAuto` · `addPostBuyAuto` 를 더하고 56필드 주석을 고쳤다. `fake-gateway.ts` 의 `SetLimitChaserRequest` 에 `postBuyAuto` 를 더하고 buy3Schema 문서를 「1 또는 2」 로 고쳤다.

## 위치 해석 (D-05)과 되돌리는 법

「자동」 은 후매수 제목줄에서 제목 · 상태 흐름의 오른쪽, 후매수 스위치 **바로 앞**에 있다. 스위치는 제목줄의 마지막 자식으로 남는다(Phase 16 D-05 오터치 방어, 여섯 그룹 스위치 세로 정렬). 사용자가 이 배치를 확정했다. 체크를 「스위치 오른쪽」 으로 옮기려면 `webapp/src/components/trading/lc/setting-group.tsx` `SettingGroup` 제목줄에서 `{headerCheck}` 와 `{switchNode}` 두 노드의 순서만 바꾸면 된다. 그 경우 e2e `vzy-1` 의 위치 단언과 `P24-7` 의 「스위치가 마지막 자식」 단언도 같이 고쳐야 한다.

## 54 사유 줄 표면 (D-07)

표면 경로는 기존 라우팅이고 제품 코드 변경은 0이다. `isLimitChaserServerMessage` 가 이미 src `LimitChaser` 를 받는다. `serverMessageLogLine` 은 「[상따] 서버 통지 — 후매수 자동 켬 — …」 를 만든다. 단위 테스트(log ②)와 e2e(`vzy-1` ③)가 이를 고정한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] lc-tracer cfg 키 수 단언 누락**
- **발견:** Task 3 최종 webapp 전량 테스트
- **문제:** Task 1 은 계약을 43 → 44 키로 넓혔다. 그런데 Task 1 검증은 대상 3파일만 돌렸고, `lc-tracer.test.tsx` 의 `toHaveLength(43)` 을 놓쳤다.
- **수정:** 단언을 44 로 바꾸고 주석을 달았다(의미 불변).
- **커밋:** b8db4c3c

**2. [Rule 1 - 시각 결함] 본문 344 에서 제목 「후매수」 가 「후매 / 수」 로 갈림**
- **발견:** Task 3 P24-7 폭 측정 중 스크린샷을 확인하다 발견했다. 기존 단언(넘침 · 잘림)은 이 결함을 잡지 못했다.
- **문제:** 「자동」 체크(56px) + 간격 8 이 흐름 폭을 먹었다. 그래서 fold 폭이 51px 로 줄었고, `overflow-wrap: break-word` 가 낱말 안에서 줄을 바꿨다.
- **수정:** 계획대로 `GroupHeaderCheck` 쪽만 고쳤다. 패딩 px-1 → 0, gap-1.5 → gap-1, `-ml-2` 로 제목줄 gap-2 를 체크 앞에서만 되돌렸다. 체크 → 스위치 간격 8 은 유지했다. 결과로 체크 폭은 46.2 × 32(히트 44 세로)가 되고, fold 는 344 에서 69.4px 가 된다. 「후매수 ›」 가 한 줄에 선다. P24-7 에 「「후매수」 한 덩어리(getClientRects 1)」 단언을 더해 재발을 막았다. 스위치 크기와 위치는 바꾸지 않았다.
- **커밋:** 25ba301d

### 그 밖

- 계획은 커밋 5~7건을 잡았고, 실제로는 7건이다(생성물 1 · 트레이서 1 · RED/GREEN 2쌍 · fix 1).
- `lc.set` 분기의 「게이트 4종 OFF」 주석은 구 탭 경로를 설명한다. 뜻이 같으므로 문장은 그대로 두었다(계획대로). 판정은 `#isTeardown` 한 곳에 있다.

## 이월

- 15:40 해제 귀속(`limitChaserGateDisarmed` · `marketCloseReleaseKeysOf`)은 자동만 켠 전략을 세지 않는다. 그 전략의 에코는 「후매수 자동 해제」 로만 적힌다.

## 배포 메모

- **relay 를 먼저 배포하고, webapp push 는 그 뒤에 한다.** 새 webapp 이 옛 relay 에 붙으면 옛 zod 가 `postBuyAuto` 를 미지 키로 떨어뜨린다. 그러면 buy3_schema 1 로 나가서 서버 값이 유지되고, 에코가 요청과 달라져 자동 체크가 「반영하지 못했어요」 로 되돌아간다.
- 이번 작업에서는 push · 배포를 하지 않았다(메인 세션 몫). 배포된 relay(4c143596) 뒤에는 Phase 25 relay 커밋이 쌓여 있다. relay 를 언제, 무엇과 함께 배포할지는 메인 세션이 정한다.

## Threat 대응 확인

- T-vzy-01 · 02: envelope ③-auto(초과 속성 `buy3Schema: 0` → 1/2 만 나감), protocol ①-auto(브라우저 buy3Schema 떨어뜨림 · 12필드 판정 분리), fanout ⑰-auto(필드 부재 → schema 1 · 서버 유지)가 고정한다.
- T-vzy-03: form ① — 매수주문 끄기 제출 1건에 `postBuyAuto:false` 를 값 동반으로 싣고, 거부되면 두 컨트롤을 함께 되돌린다. shared 입력에서 필수라 컴파일이 누락을 막는다.
- T-vzy-04: fanout ⑰-auto-b — 자동만 켠 등록에 모르는 ISIN 이면 거부되고 게이트웨이로 0바이트가 나간다.
- T-vzy-05: web lib ①② — crud C, 켜진 전략.
- 새 네트워크 표면 · 로그 줄은 없다. Threat Flags 없음.

## Known Stubs

없음.

## Self-Check: PASSED

- 수정 파일 25개가 모두 존재한다. 생성물 2파일과 Phase 25 생성물 2파일(`cancel-reason.ts` · `evidence-kind.ts`)을 확인했다.
- 커밋 7건(127c1028 · fb175921 · d261c8d0 · bf36a28f · eac3a60e · b8db4c3c · 25ba301d)이 `git log` 에 있다. `git rev-list --count 6289e430..HEAD` = 7.
