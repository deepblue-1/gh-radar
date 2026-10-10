---
phase: 27-auto-sell-integration
verified: 2026-10-10T03:10:00Z
round: 2
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/27-auto-sell-integration/27-01-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-01-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-02-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-02-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-03-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-03-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-04-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-04-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-05-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-05-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-06-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-06-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-07-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-07-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-08-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-08-SUMMARY.md
  - .planning/phases/27-auto-sell-integration/27-09-PLAN.md
  - .planning/phases/27-auto-sell-integration/27-09-SUMMARY.md
  - docs/inbox/from-gh-trade/261004-auto-sell-wire.md
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/strategy-display.ts
  - packages/shared/src/strategy-event-labels.ts
  - packages/shared/src/strategy-event-text.ts
  - packages/shared/src/strategy-event.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/generated/StockDMA.fbs
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/protocol.ts
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/constants.ts
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/latch-led.tsx
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/lib/lc-ranges.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/order-log-feed.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-relay-socket.ts
covered_digest: "v3:sha256:4baeb13cf52afbf98b976c9a0489e83f611e684ae2a306b8e4dc54a38d584b74"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "20:00 KST 전에 relay 컨테이너를 바꾸지 않는다 (27-09 prohibition)"
    reason: "사용자가 「푸시 배포 해」(2026-10-05 17:02 KST)로 장중 배포를 명시 지시했다. 27-09-SUMMARY Deviation 4 가 기록하며, 배포 뒤 smoke · healthz · 로그 검증을 모두 통과했고 롤백은 없었다."
    accepted_by: "user (명시 지시 — 1라운드 보고서에서 승계)"
    accepted_at: "2026-10-05T08:02:00Z"
re_verification:
  previous_status: human_needed
  previous_score: 12/12
  previous_report: 27-VERIFICATION.md (2026-10-05, 낡음 — 덮어쓰지 않음)
  gaps_closed:
    - "human 5건 — 27-UAT.md 5/5 pass (2026-10-06 첫 거래일, ca216f15). 운영 화면 · WinForms LED 색 · 저널 924행 조립기 전수 924/924 · 54 i/a 축 · /me 11값 사용자 눈 대조"
    - "리뷰 WR-01~05 — 5/5 닫힘 (def26175 · 1b08002a · 5fd3b29a · 5d51b609 · a901b8c5). 1라운드가 「후속 수정 권고」로 남겼던 41 전용 상태 분리 · 키별 server 해제 · isin 필터가 그대로 구현됨"
    - "리뷰 IN-01~06 — 6/6 닫힘 (cf6323ed · 22312908 · 2d21c033 · 6d54e068/4f0d1c86 · 44d2c28e · a652152b). 27-REVIEW-R2.md 가 diff 단위로 재판정"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
warnings:
  - id: WR-R2-01
    severity: low
    item: "3초 무응답 뒤 늦게 도착한 41 거부가 「미반영」을 거두지 않는다 — 거부 원문과 「서버 응답을 기다리고 있어요」가 동시에 선다 (WR-03 수정이 만든 회귀)"
    where: "webapp/src/components/trading/card/strategy-card.tsx:696-697 · 709-715 · 832-842 (코드에서 확인)"
    status: "advisory — 표시 모순 한 줄. 주문 경로 · 데이터 손실 없음, fail-visible 방향, 서버 state 가 start 가능이면 바로시작 버튼이 열려 있어 다시 누르면 거둬진다. 목표 truth 5 의 대기 중 거부 · 기대 전이 해제 · 3초 미반영은 그대로 성립"
  - id: WR-R2-02
    severity: low
    item: "무응답 41 「미반영」이 전략 삭제(server null) · 자동매도 끄기 뒤에도 키 변경 전까지 남는다. 삭제 뒤에는 두 버튼이 모두 잠겨 사용자가 걷을 수도 없다 (WR-03 수정이 만든 회귀)"
    where: "webapp/src/components/trading/card/strategy-card.tsx:537-548 · 570-582 · 484-497, webapp/src/lib/limit-chaser.ts:1008-1012 (코드에서 확인)"
    status: "advisory — 무응답 41 이 먼저 있어야 하고(UAT 기간 relay 41 실패 경로 로그 0), 그 뒤 삭제/끄기를 해야 한다. 상태줄 한 줄이 낡을 뿐 주문 경로에 영향 없음. 실패 사실은 error 로그 줄로 이미 영속"
  - id: IN-R2-01..04
    severity: info
    item: "isLimitChaserArmRejection 이 relay kind 태그를 안 봄 · /me 42 다중 위반 칸 교착 · lc-ranges.ts 머리 주석 · IN-05 fix 보고서의 계층 불변식 문장 부정확"
    where: "27-REVIEW-R2.md"
    status: "info — 처분은 27-REVIEW-R2-DISPOSITION.md 에서 관리(6건 open)"
  - id: UI-REVIEW
    severity: info
    item: "27-UI-REVIEW.md 17/24 — 바로시작 · 중지 비활성 사유 비노출(D-05 의도), 글자 크기 척도 난립, 바로시작 상승색 채움"
    where: "27-UI-REVIEW.md"
    status: "advisory — 시각 위계 권고. 네 표면은 UAT 1 에서 사용자 눈으로 pass"
human_verification: []
---

# Phase 27: 자동매도 연동 — 재검증 보고서 (2라운드)

**Phase Goal:** gh-trade Phase 28 자동매도가 KB 120 실서버에서 이미 내보내는 와이어를 gh-radar 가 받아서 보여 주고 조작할 수 있게 한다. ① relay 생성물 동기화 ② relay 41/42/43/84/54 중계 ③ shared 문장 조립기(kind 11~14 · group 9 · CancelReason 10/11) ④ webapp 상따 카드 자동매도 칸 · 바로시작/중지 · `/me` 상따 기본설정 ⑤ 배포 relay → webapp + 인박스 done.
**Verified:** 2026-10-10T03:10:00Z
**Status:** passed
**Re-verification:** Yes — 1라운드(2026-10-05, 배포본 78486f1b 기준)가 낡아 현재 master HEAD(`bb24767f`)로 새로 검증했다. 1라운드 보고서 `27-VERIFICATION.md` 는 덮어쓰지 않았다.

## 판정 요약

목표는 달성됐고 현재 코드에서도 유지된다. 1라운드가 `human_needed` 로 남긴 사유는 모두 닫혔다.

1. **사람 확인 5건**: `27-UAT.md` 5/5 pass, issues 0. 10-06 첫 거래일 실데이터로 닫혔다 — 저널 group 9 + kind 11~14 전수 924행이 조립기를 통과해 문장 924/924 · 폴백 0, 자동매도 상태 0~4 전이 227건 관찰, `/me` 11값은 WinForms 기본설정창과 사용자 눈 대조 일치.
2. **리뷰 Warning/Info 11건**: 1라운드 WR-01~05 · IN-01~06 이 모두 닫혔다(27-REVIEW-R2.md 의 diff 판정을 코드로 재확인).
3. **Phase 28 · 29 의 같은 파일 수정**: relay 세션 라우팅(29-16 `#strategySession` 계좌 우선)과 hub 의 primary 원천 판정(`#fromPrimary`), 85 중계 승격이 들어왔지만 Phase 27 의 truth 를 깨는 drift 는 없다.

27-REVIEW-R2.md 가 새로 올린 Warning 2건(WR-R2-01 · WR-R2-02)은 **코드를 직접 읽어 지적이 정확함을 확인**했다. 둘 다 WR-03 수정의 부작용으로 「미반영」이 거둬지는 경로가 좁아진 회귀다. 다만 phase 목표를 깨지 않고 주문 경로에 닿지 않으며 표시 한 줄의 문제다. **advisory** 로 판정해 `warnings:` 에 기록하고 status 에는 반영하지 않았다.

## Goal Achievement — Observable Truths

ROADMAP 에 Success Criteria 목록은 없다. Goal ①~⑤ 와 CONTEXT D-id 에서 뽑은 1라운드의 12개 truth 를 그대로 재판정했다.

| # | Truth | Status | Evidence (이번 라운드에 직접 확인) |
|---|-------|--------|------------------------------------|
| 1 | ① relay 생성물이 gh-trade master 와 같다 (auto-sell-command-req · user-settings · 에코 4필드 vtable 148~154 · CancelReason 10/11 · MsgType 41/42/43/84) | ✓ VERIFIED | `relay/src/generated/StockDMA.fbs` 를 gh-trade `master:server/src/protocol/StockDMA.fbs` 와 diff 하면 차이는 SYNC MARKER 머리 7줄뿐(본문 동일, marker 는 Phase 28/29 가 `88fc746d` · 2026-10-07 로 재동기화). 생성물에 `autoSellState` · `autoSellBasisPrice`(`set-limit-chaser.ts:345,360,617`) · `AutoSellBuyFirst = 10` · `AutoSellAuctionTrim = 11` · `AutoSellCommandReq = 41` · `SetUserSettingsReq = 42` · `GetUserSettingsReq = 43` · `UserSettingsResp = 84` 확인. `git status` 상 `relay/src/generated` 미커밋 변경 없음. (1라운드의 「marker 2404509b」 표기는 이후 재동기화로 갱신됐다 — 본문 동일성이 본질) |
| 2 | ② relay: `buy3_schema` 4 파생 · 에코 4필드 서버전용 · 84 사용자별 캐시 + 재생 · 41/42/43 중계 · 54 통과 | ✓ VERIFIED | `lcBuy3SchemaOf`(`envelope.ts:1452`)가 필드 존재만으로 1→2→3→4 단조 파생. 조립기 머리 주석이 에코 4필드를 「싣지 않는다」로 못 박음. fanout `autosell.cmd`(:1237) = 전략 세션 + `#accountAllowed` 계좌 대조 + `buildAutoSellCommandReq`, `user.settings.set`(:1255) = 계좌 대조 없음 · `buildSetUserSettingsReq`, pending FIFO 미사용. hub `case MSG.UserSettingsResp`(:1980, :2270) 캐시 늘 · 팬아웃 Ready 뒤, Ready 때 `buildGetUserSettingsReq()` 전송(:1518), 인증 직후 `getUserSettings` 재생(`fanout.ts:1028`). Phase 29 가 84 를 `#fromPrimary` 원천으로 한정하고 41 의 세션을 `forAccount(accountNo) ?? primaryOf` 로 바꿨으나 대조 순서(세션 없음 → 미준비 → 계좌 밖)와 문구는 종전 그대로. `relay tests/ws-autosell.test.ts` + `envelope.test.ts` **211건 통과(이번 실행)** |
| 3 | ③ shared 조립기: kind 11 발동 · 12 정정 · 13 상태 · 14 멈춤, group 9 칸 재해석(첫 토큰 정확 일치 · kind 6 은 `AutoSellAuctionOrder` 로 회차 분기), CancelReason 10/11 | ✓ VERIFIED | `strategy-event-text.ts` `case 11`~`case 14`(164-170), kind 6 은 `token === "AutoSellAuctionOrder"`(:149) 분기. `strategy-event-labels.ts` `ORDER_GROUP_LABELS[9]="자동매도"`, `CANCEL_REASON_LABELS` 10 「매수 우선 취소」 · 11 「동시호가 감축」. shared 3개 테스트(text · labels · display) **163건 통과(이번 실행)**. 실데이터: UAT 3 가 10-06 저널 924행을 조립기에 통과시켜 문장 924/924 · 폴백 0 |
| 4 | ④ 상따 카드 「자동매도」 그룹: 요청 4 + 에코 4, 킬 스위치 · 단일 행 비활성화의 `auto_sell_enabled=false` 에코가 그대로 그려짐, LED 4번째 칩 | ✓ VERIFIED | `lc-fields.ts` 에 `slot: 'auto-sell'` · `LcStatusKey 'autoSell'` · 소스 `autoSellSoldQty` · `autoSellBasisPrice`, `latch-led.tsx` 4번째 칩. webapp 7개 테스트 파일(card-body · latch-led · strategy-card · strategy-card-flow · limit-chaser-defaults · limit-chaser · lc-tracer) **363건 통과(이번 실행)**. UAT 2 가 실서버 상태 0~4 전이 227건과 WinForms `UpdateAutoSellState` ↔ 웹 `AUTO_SELL_LED` 색 매핑을 코드 대조 |
| 5 | ④ 바로시작/중지(41) · 카드 「미반영」 해제의 `src="AutoSellCommand"` 분기 | ✓ VERIFIED | `onAutoSellCommand`(`strategy-card.tsx:823`)가 `autoSellButtonsOf(server)` 가드(렌더와 같은 `server`) → `send({t:"autosell.cmd",…})` 가 참일 때만 대기 → 3초 타이머가 `autoSellUnacked` 와 error 로그 1줄(WR-01 · WR-03). 41 대기는 lc.set 채널(`answerSeq`/`ackTimer`)과 분리됨 — 거부 갈래가 `acceptAnswer` 를 부르지 않는다(:709-715). 기대 전이는 `settleAutoSell` 이 `lastLimitChaserEcho` · 키별 `server` 두 입력으로 푼다(:537-565, WR-02). 54 표시는 `isServerMessageForStrategy` 로 isin · 계좌 축 필터(WR-04). 테스트 통과(위 363건 안). 대기 중 거부 · 기대 전이 해제 · 3초 미반영 · 버튼 해제 모두 성립. 경계 밖 두 틈(3초 뒤 늦은 거부 · 삭제/끄기 뒤 잔존)은 WR-R2-01/02 advisory |
| 6 | ④ `/me` 사용자 설정: 금액 만원 단위, `present=false` 면 내장 기본값, 저장 때만 42, 84 수신 시 자동 송신 없음 | ✓ VERIFIED | `limit-chaser-defaults.tsx`(`LimitChaserDefaultsSection`) 가 `me-client.tsx:446` 에 배선됨. IN-02 수정으로 42 본문 11칸 전부를 `userSettingsValuesIssue` 로 검사하고 위반이면 보내지 않음. WR-05 수정으로 실패에 시도한 값을 저장해 늦은 84 가 그 값을 실으면 실패를 거둠. 테스트 통과. 실값 대조는 UAT 5 (사용자 눈, WinForms 기본설정창과 일치) |
| 7 | ④ 새 전략 폼 84 시딩(D-11): 에코 있으면 에코가 이김, 손댄 칸 보호, 범위 밖 칸 상수 폴백 | ✓ VERIFIED | `limit-chaser-form.tsx:640` `{...defaultLimitChaserForm(), ...seedFromUserSettings(userSettings)}`, 늦은 84 재시딩(:777). `limit-chaser.test.ts` 통과 |
| 8 | ④ 주문로그 「자동매도」 칩: 서버 group 9 그대로, 팝업 「매도」 와 겹치지 않음 | ✓ VERIFIED | `order-log-feed.ts:118 auto: [9]`. UAT 1 이 칩 대상 저널 924행 실재를 사용자 화면에서 확인(#3 증거) |
| 9 | ④ UI 는 HTML 목업 먼저(사용자 채택 뒤 구현) | ✓ VERIFIED | `reference/mockup-auto-sell-card.html` · `mockup-user-settings.html` 존재. 채택 이력은 `27-DISCUSSION-LOG.md` (1라운드와 동일, 변동 없음) |
| 10 | ⑤ 배포 relay → webapp(push), 인박스 `status: done` + `done_commit` | ✓ VERIFIED | `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` frontmatter `status: done` · `done_commit: 78486f1b`(파일에서 직접 확인, 커밋 `git cat-file -t` = commit). 짝 노트 `261006-autosell-kind12-confirm` 도 `b412ae6e` 로 done. 배포 후 10-06 첫 거래일 운영 사용이 UAT 1~5 pass 로 이어짐 — 배포본이 실제 동작했다는 가장 강한 증거 |
| 11 | `buy3_schema` 필드 존재 단조 파생 · 브라우저가 스키마를 고르지 못함 · 에코 4필드를 요청에 싣지 않음 | ✓ VERIFIED | truth 2 와 같은 코드 근거(`lcBuy3SchemaOf` · `hasAllAutoSellReqFields` · `hasAnyAutoSellReqField`). `lc-tracer.test.tsx` 통과 |
| 12 | 회귀: 이전 phase(25 · 26) 표면이 깨지지 않음 + 이후 phase(28 · 29) 가 같은 파일을 건드린 뒤에도 유지 | ✓ VERIFIED | 요청에 명시된 오늘 게이트를 인용 — `pnpm --filter @gh-radar/relay run test` 1263/1263, `pnpm --filter @gh-radar/webapp run test` 3766 pass + 1 skip. 이번에 targeted 로 shared 163 · relay 211 · webapp 363 을 직접 재실행해 통과 확인. 전체 스위트와 e2e 는 재실행하지 않았다 |

**Score:** 12/12 truths verified (behavior-unverified 0 · override 1)

### behavior-dependent truth 확인

| 불변식 | 증거 |
|--------|------|
| 41 거부 · 무응답이 lc.set 판정(`answerSeq` · `ackTimer`)을 오염하지 않음 (WR-01) | `strategy-card.tsx:709-715` 주석 + 코드(거부 갈래가 `acceptAnswer` 미호출, 무응답은 `setUnacked` 대신 전용 `setAutoSellUnacked`). `strategy-card-flow.test.tsx` 통과(WR-01 · WR-03 케이스 포함) |
| 41 무응답 「미반영」이 아무 에코에나 지워지지 않고 기대 전이로만 거둬짐 (WR-03) | `strategy-card-flow.test.tsx:2086` 케이스 통과 — 런타임 에코로 안 지워짐 · error 로그 1줄 · 늦은 기대 전이에 거둠 |
| 다른 카드의 41 거부 · 자동매도 사유 54 가 내 카드에 서지 않음 (WR-04) | `isServerMessageForStrategy` 코드 확인 + `limit-chaser.test.ts` 통과. 실데이터 쪽은 UAT 4 가 gh-trade 9261fe52 코드에서 i · a 채움을 대조 |
| 84 합성 금지 · 41 계좌 화이트리스트(IDOR) · FIFO 비오염 | relay `ws-autosell.test.ts` 통과(이번 실행) |

모두 테스트 실행 또는 UAT 실데이터로 확인했다. 존재(presence)만으로 올린 항목은 없다.

## 리뷰 R2 Warning 처분 (27-REVIEW-R2.md — Critical 0 · Warning 2 · Info 4)

verifier 가 `strategy-card.tsx` 를 직접 읽어 두 지적이 모두 정확함을 확인했다.

### WR-R2-01 — 늦은 41 거부가 「미반영」을 못 거둔다 (확인됨)

3초 타이머가 먼저 발화하면 `autoSellCmdRef.current = null`(:837), `autoSellTimedOutRef.current = action`(:838), `autoSellUnacked = true`(:840). 이후 서버의 41 거부가 도착하면 `autoSellAnswer`(:696-697)는 `autoSellCmdRef.current !== null` 을 요구하므로 false 다. `mine`(:700)은 true 라서 로그 줄 · `setLastError` 가 서지만 `autoSellTimedOutRef` · `setAutoSellUnacked(false)` 는 `if (autoSellAnswer)` 블록(:709-715) 안에만 있어 불리지 않는다. 결과는 `CardNotices` 에 거부 원문과 「미반영」이 동시에 서는 상태다. relay 발 거부(`src:"Relay"`, i 빈 값)는 `mine` 도 false 라서 원문 줄조차 서지 않는다. 늦은 *성공*만 테스트가 덮는다(`strategy-card-flow.test.tsx:2086`, `:2107`).

**판정: advisory.** 근거는 다섯이다. (1) 표시 모순 한 줄이며 주문 · 데이터 경로가 아니다. (2) fail-visible 방향이다 — 거부는 원문으로 보이고 「미반영」은 거짓 낙관이 아니다. (3) 서버 state 가 start 가능이면 `autoSellButtonsOf` 가 바로시작을 열어 두므로 다시 눌러 거둘 수 있다. (4) 발화 조건은 41 응답이 3초를 넘는 정지 구간이다. UAT 기간(10-06) 에는 relay 41/42 실패 경로 로그가 0 이었다. (5) 목표 truth 5 의 핵심(대기 중 거부 → 원문 + 대기 해제, 기대 전이 해제, 3초 미반영 + 버튼 해제)은 성립한다.

### WR-R2-02 — 무응답 「미반영」이 삭제 · 끄기 뒤에도 남는다 (확인됨)

`autoSellUnacked` 를 거두는 곳은 (a) `settleAutoSell` 의 기대 전이(:541-545), (b) 다음 41 전송(:830-831), (c) 키 변경(:492-493) 셋이다. 삭제 갈래(`server === null`, :570-582)는 `acceptAnswer()` 로 공용 `unacked` 만 내리고 `autoSellUnacked` 는 건드리지 않는다. `autoSellButtonsOf(null)` 은 두 버튼을 모두 막으므로(`limit-chaser.ts:1009`) (b) 도 불가능하다. 따라서 무응답 41 → 전략 삭제 뒤 빈 카드에 「미반영」이 남고 사용자가 걷을 길이 없다. 자동매도 끄기 뒤에는 `autoSellEnabled:false` 에코가 start 의 기대 전이가 아니라서 남지만, 이때는 서버가 있어 바로시작 버튼으로 걷을 수 있다.

**판정: advisory.** 무응답 41 이 선행해야 하고, 낡은 한 줄이 남을 뿐 주문 경로에 영향이 없다. 실패 사실은 error 로그 줄이 이미 영속한다(PC-7 충족). 단 삭제 뒤 잔존은 복구 동선이 없으므로 후속 수정 대상으로 권한다.

**후속 수정 제안(코드 변경 없음, 별도 quick):** 두 건은 뿌리가 같다 — 무응답 「미반영」을 거두는 전이를 늘린다. 리뷰가 제시한 `lateAutoSellAnswer`(무응답 뒤에도 `autoSellTimedOutRef !== null` 이면 같은 거부 판정 적용)와 `settleAutoSell` 에 `!echo.autoSellEnabled || echo.crud === "D"` · 삭제 갈래의 `setAutoSellUnacked(false)` 를 더하면 닫힌다. 테스트는 「무응답 start → 3초 → 늦은 AutoSellCommand ERROR」「무응답 start → 철거 에코」 두 케이스.

## 1라운드 이후 변경에 대한 회귀 확인

| 변경 | 확인 | 결과 |
|------|------|------|
| `fix(27)` 12 커밋 (WR-01~05 · IN-01~06 · IN-04 재판정) | 27-REVIEW-R2.md 가 diff 단위로 판정(WR/IN 11건 전부 닫힘, WR-03 만 회귀 2건 동반). 이번에 WR-01 · 02 · 03 · 04 의 현재 코드를 직접 읽어 재확인 | 닫힘 (회귀 2건 = advisory) |
| Phase 28 (85 LimitFeature 중계 · kind 15 · relay 생성물 재동기화) | 1라운드 prohibition 「85 · kind 15 를 중계 · 표시하지 않는다」는 **Phase 27 범위 한정**이었다. Phase 28 이 범위를 넓혀 명시 `case` 로 승격한 것은 의도된 후속이다. 생성물은 gh-trade master 와 본문 동일. Phase 27 truth(41/42/43/84 · 조립기 11~14)는 영향 없음 | 이상 없음 |
| Phase 29 (relay 서버 레지스트리 · 서버별 세션 · `forAccount ?? primaryOf` · `#fromPrimary`) | 41 은 계좌 축 세션 선택 후 종전 `#accountAllowed` 대조, 42/43/84 는 primary 원천. `ws-autosell.test.ts` · relay 전체 1263/1263 통과 | 이상 없음 |
| quick-261006 (kind12 confirm 인박스) | 웹 무변경 판정(`b412ae6e`), 조립기 코드 변경 없음 | 이상 없음 |

## Required Artifacts

| 영역 | 산출물 | 상태 |
|------|--------|------|
| relay 생성물 | `generated/StockDMA.fbs` + `stock-dma/*.ts` (auto-sell-command-req · user-settings · set-limit-chaser · cancel-reason · msg-type) | ✓ gh-trade master 본문과 동일 |
| relay | `dma/envelope.ts` · `dma/msg-type.ts` · `hub/subscription-hub.ts` · `ws/fanout.ts` · `ws/protocol.ts` | ✓ 실질 구현 · 연결됨 |
| shared | `relay.ts` · `strategy-event-labels.ts` · `strategy-event-text.ts` · `strategy-display.ts` · `strategy-event.ts` · `index.ts` | ✓ (163건 통과) |
| webapp | `limit-chaser.ts` · `lc-ranges.ts` · `lc-fields.ts` · `setting-group.tsx` · `card-body.tsx` · `card-header.tsx` · `strategy-card.tsx` · `latch-led.tsx` · `limit-chaser-form.tsx` · `limit-chaser-defaults.tsx` · `me-client.tsx` · `order-log-feed.ts` · `use-relay-socket.ts` | ✓ (363건 통과) |
| 인박스 | `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` | ✓ `status: done` · `done_commit: 78486f1b` |
| 목업 | `reference/mockup-auto-sell-card.html` · `mockup-user-settings.html` | ✓ 존재 |

## Key Link 확인

| From | To | 상태 |
|------|----|------|
| 카드 폼 버튼 | `onAutoSellCommand` → `send({t:"autosell.cmd"})` → fanout `autosell.cmd` → `buildAutoSellCommandReq` → 세션 | ✓ WIRED (계좌 대조 포함) |
| 서버 60 에코 | `server` / `lastLimitChaserEcho` → `settleAutoSell` · LED · 칩 | ✓ WIRED |
| 서버 84 | hub 캐시 → `user.settings` 프레임 → `useRelaySocket.userSettings` → `/me` 섹션 · `seedFromUserSettings` | ✓ WIRED |
| `/me` 행 확정 | `send({t:"user.settings.set"})` → fanout → `buildSetUserSettingsReq` (42) | ✓ WIRED |
| 서버 54 `AutoSellCommand` | `isAutoSellCommandRejection` → 카드 거부 줄 · 대기 해제 | ✓ WIRED (WR-R2-01 의 늦은 거부 경계 제외) |
| 120 저널 kind 6/11~14 | RPC → `strategyEventParts` → 「자동매도」 칩 | ✓ WIRED (UAT 3 실데이터 924/924) |

## Data-Flow Trace (Level 4)

| 값 | 원천 | 상태 |
|----|------|------|
| 카드 자동매도 그룹 · LED | 게이트웨이 60 → relay `lc` → `server` | ✓ FLOWING (UAT 2 실서버 상태 0~4 전이 227건) |
| `/me` 섹션 · 새 폼 시딩 | 게이트웨이 84 → hub 캐시 → `user.settings` | ✓ FLOWING (UAT 5 값 대조) |
| 주문로그 자동매도 줄 | `dma_strategy_events` → 조립기 | ✓ FLOWING (UAT 3 924행) |

하드코딩 빈 값 · 정적 폴백은 찾지 못했다.

## Behavioral Spot-Checks (이번 실행)

| 동작 | 명령 | 결과 |
|------|------|------|
| shared 조립기 · 라벨 · 배지 | `cd packages/shared && npx vitest run src/__tests__/strategy-event-text.test.ts src/__tests__/strategy-event-labels.test.ts src/__tests__/strategy-display.test.ts` | 3파일 163건 통과 |
| relay 41/42/84 · 조립기 | `cd relay && npx vitest run tests/ws-autosell.test.ts src/dma/__tests__/envelope.test.ts` | 2파일 211건 통과 |
| webapp 카드 · /me · 시딩 · LED | `cd webapp && npx vitest run strategy-card-flow strategy-card limit-chaser-defaults limit-chaser latch-led card-body lc-tracer` | 7파일 363건 통과 |
| 생성물 동기화 | `diff <(git -C gh-trade show master:server/src/protocol/StockDMA.fbs) relay/src/generated/StockDMA.fbs` | 차이 7줄 = SYNC MARKER 머리뿐 |
| 전체 회귀 | 호출자 제시 오늘 게이트 (relay 1263/1263 · webapp 3766 pass + 1 skip) | 인용 (재실행 안 함) |

e2e(Playwright)와 pgTAP 은 재실행하지 않았다. 이 phase 는 DB 변경이 없고(주문로그는 기존 RPC) e2e 는 27-09 게이트 142 passed 와 UAT 실사용이 증거다.

## Probe Execution

SKIPPED — 이 phase 는 `scripts/*/tests/probe-*.sh` 를 선언하지 않았다.

## Prohibitions (must_haves.prohibitions)

1라운드 판정 13건을 현재 코드로 재확인했다. 변동은 하나다.

| Prohibition | Status | 비고 |
|-------------|--------|------|
| generated 를 손으로 고치지 않는다 | ✓ RESOLVED | 본문 gh-trade master 와 동일 |
| 에코 4필드를 요청에 싣지 않는다 · 브라우저가 `buy3Schema` 를 고르지 못한다 | ✓ RESOLVED | `envelope.ts` 주석 + 파생 함수 |
| 85 · kind 15 를 중계 · 표시하지 않는다 (27-01/03) | ✓ 1라운드 시점 RESOLVED → **Phase 28 이 범위를 의도적으로 넘김** | Phase 27 범위 한정 금지였고 Phase 28 가 정식 승격. 위반 아님 |
| relay 는 42 성공을 지어내지 않고 54 본문을 해석하지 않는다 | ✓ RESOLVED | fanout `user.settings.set` 주석 + 테스트 |
| 41/42 를 pending FIFO 에 넣지 않는다 · 재전송 없음 | ✓ RESOLVED | fanout 분기 확인 |
| 54 본문을 파싱해 분기하지 않는다 | ✓ RESOLVED | 판정 함수는 `src`/`i`/`a`/`kind` 만 읽음 (IN-01 은 `kind` 태그 추가, 본문 `m` 은 여전히 미파싱) |
| `/me` 는 84 수신만으로 42 를 자동 송신하지 않는다 | ✓ RESOLVED | 42 송신은 행 확정 한 곳 |
| 20:00 KST 전에 relay 컨테이너를 바꾸지 않는다 | PASSED (override) | 1라운드 override 승계 |
| 실계좌 시험 조작 금지 | ✓ RESOLVED | UAT 도 실사용 관찰만 (시험 클릭 없음) |

## Requirements Coverage

REQUIREMENTS.md 에 Phase 27 로 매핑된 ID 없음(플랜 9개 모두 `requirements: []`, 요구 정본은 ROADMAP Goal ①~⑤ + CONTEXT D-01~D-17). 고아 요구사항 0.

## Anti-Patterns

phase 변경 소스(위 covered 구현 파일 + `lc-fields` · `setting-group` · `order-log-feed` · `latch-led` 등)에서 `TBD` · `FIXME` · `XXX` · `TODO` · `HACK` · `PLACEHOLDER` 0건. 부채 마커 게이트 통과.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `strategy-card.tsx` | 696-715 | 무응답 뒤 늦은 41 거부가 「미반영」을 안 거둠 (WR-R2-01) | ⚠️ Warning (advisory) | 위 판정 |
| `strategy-card.tsx` | 570-582 | 삭제 갈래가 `autoSellUnacked` 를 안 내림 (WR-R2-02) | ⚠️ Warning (advisory) | 위 판정 |
| `limit-chaser.ts` | 931 | `isLimitChaserArmRejection` 이 `kind` 태그 미사용 (IN-R2-01) | ℹ️ Info | 동시 진행 조건이 겹쳐야 닿음 |
| `limit-chaser-defaults.tsx` | 186-192 · 313-318 | 위반 칸 ≥2 면 저장 교착 (IN-R2-02) | ℹ️ Info | 서버가 범위 밖 행을 로드에서 버려 닿기 어려움 |

## Human Verification Required

없음. 1라운드의 5건은 모두 `27-UAT.md` 5/5 pass 로 닫혔다. 새로 올릴 항목은 없다.

## Gaps Summary

FAILED 로 판정한 truth 는 없고 `gaps:` 는 비어 있다. 차단 사유가 없으므로 status 는 `passed` 다.

남은 일은 모두 비차단이다.

1. **advisory 후속 quick 1건 권고:** WR-R2-01 · WR-R2-02 는 WR-03 수정의 같은 뿌리 회귀다(「미반영」을 거두는 전이 부족). 한 번에 닫힌다. 처분은 `27-REVIEW-R2-DISPOSITION.md` 에서 관리(현재 6건 모두 open). 삭제 뒤 잔존(WR-R2-02-①)만은 복구 동선이 없어 우선순위가 높다.
2. **Info 4건 · UI 감사 17/24:** 시각 위계(글자 크기 척도 · 비활성 사유 · 바로시작 색) 권고는 별도 판단 사항이다.
3. **문서 정합 메모(오케스트레이터):** `.planning/ROADMAP.md` 상단 목록의 Phase 27 줄이 아직 `- [ ]` 다(Phase 28 은 `[x]`). 이 검증은 그 파일을 수정하지 않았다 — 완료 처리 때 함께 갱신할 것.

작업 트리 참고. `tasks/lessons.md` 수정과 untracked `shots/` · `ui-reviews/` · `.planning/milestone.lock` 이 있다. verifier 는 코드나 문서를 고치지 않았고 커밋하지 않았다.

---

_Verified: 2026-10-10T03:10:00Z_
_Verifier: Claude (gsd-verifier) — 2라운드_
