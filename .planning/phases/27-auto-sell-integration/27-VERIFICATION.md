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

> **정본 frontmatter 는 2라운드(27-VERIFICATION-R2.md, 2026-10-10)로 승계됨.** 아래 본문은 1라운드(2026-10-05) 기록 그대로다.

# Phase 27: 자동매도 연동 — gh-trade Phase 28 와이어 계약 반영 Verification Report

**Phase Goal:** gh-trade Phase 28 자동매도가 KB 120 실서버에서 이미 내보내는 와이어를 gh-radar 가 받아서 보여 주고 조작할 수 있게 한다 (ROADMAP Goal ①~⑤: 생성물 동기화 · relay 41/42/43/84 · shared 조립기 · webapp 카드/버튼/`/me` · 배포와 인박스 마감).
**Verified:** 2026-10-05T08:32:38Z
**Status:** human_needed
**Re-verification:** No — initial verification

검증 기준 코드는 배포본 `78486f1b` 다. 동시 Phase 28 세션의 미커밋 편집과 `86cc9148` 이후 커밋은 읽지 않았고 Phase 27 로 귀속하지 않았다. 파일은 `git show 78486f1b:<path>` 와 같은 커밋의 detached worktree 에서 읽었고, worktree 는 검증 뒤 제거했다.

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | ① relay 생성물이 gh-trade master 와 같다: SYNC MARKER `2404509b`, fbs blob `68679e9a`, 신규/변경 .ts 12 · 삭제 0 | ✓ VERIFIED | gh-trade `master:server/src/protocol/StockDMA.fbs` blob = `68679e9a`(독립 조회). `git diff --name-status 465e7372 78486f1b -- relay/src/generated` = fbs 사본 + .ts 12(M 7 · A 5: auto-sell-command-req · limit-feature · member-delta · team-sim · user-settings), D 0. 검증자가 `78486f1b` worktree 에서 `sync-relay-schema.sh --check` 를 직접 실행: 「신규/변경 예정 0 개 · 삭제 예정 없음 · .fbs 사본 최신」 exit 0. 에코 필드 id 72~75 = vtable 148~154(`set-limit-chaser.ts:617-630`). `CancelReason` 10/11, `MsgType` 41/42/43/84/85 생성물에 있음. 85 · 슬롯 90 · kind 15 는 생성물에만 실리고 중계 · 표시 코드는 이 phase 범위에 없음(85 는 debug 드롭). |
| 2  | ② relay: `buy3_schema` 4 파생 · 에코 4필드 서버전용 · 84 사용자별 캐시 + 재생 · 41/42/43 중계 · 54 통과 | ✓ VERIFIED | `lcBuy3SchemaOf`(envelope.ts:1351)는 필드 존재만으로 1→2→3→4 단조 파생, 브라우저가 고르지 않음. `buildSetLimitChaserReq` 는 schema ≥4 + 4필드 모두 있을 때만 요청 4필드를 싣고 에코 4필드는 싣지 않음(:1555-1568). shared `LIMIT_CHASER_SERVER_AUTO_SELL_FIELDS` → `LIMIT_CHASER_SERVER_ONLY_FIELDS`(relay.ts:427-443). hub: `MSG.UserSettingsResp` 명시 case(:1764), `#onUserSettings` 가 캐시는 늘, 팬아웃은 Ready 뒤만(:1907-1911), Ready 마다 43 전송(:1329), quote 연결 84 는 warn 무시(:2004). fanout: 인증 직후 캐시가 있을 때만 `user.settings` 재생(:739-742), `autosell.cmd` → 전략 세션 + `#accountAllowed` 계좌 대조 → 41(:945-957), `user.settings.set` → 42, pending FIFO 미사용. `USER_SETTINGS_RANGES` 11값 한 벌(relay.ts:1384). relay 테스트 `ws-autosell.test.ts` 12건(IDOR · FIFO 비오염 · 84 합성 금지 · 범위 밖 close 4400) 존재. |
| 3  | ③ shared 조립기: kind 11 발동 · 12 정정 · 13 상태 · 14 멈춤, group 9 칸 재해석(첫 토큰 정확 일치), CancelReason 10/11 | ✓ VERIFIED | `strategy-event-text.ts` case 11~14, kind 6 은 `reasonToken` 우선 분기(`AutoSellAuctionOrder` → 회차 본문, 13종 집합 → 주기 본문, `AutoSell*` 집합 밖 → 폴백; group 7↔9 뒤바뀜에도 토큰으로 판정). `AUTO_SELL_REASON_TOKENS` 13종 `Object.hasOwn`. `CANCEL_REASON_LABELS` 10 「매수 우선 취소」 · 11 「동시호가 감축」. `ORDER_GROUP_LABELS[9]`, `strategyEventSide(9)` = sell. `serverMsgBadge` 가 `AutoSell`/`AutoSellCommand` → `[상따]`. 검증자가 `78486f1b` 에서 shared 3개 테스트 파일(text · labels · display)을 실행: 3 files / 158 passed. 실제 저널 행 일치는 아래 human 항목. |
| 4  | ④ 상따 카드 「자동매도」 그룹: 요청 4 + 에코 4, 킬 스위치 · 단일 행 비활성화의 `auto_sell_enabled=false` 에코가 그대로 그려짐 | ✓ VERIFIED | `lc-fields.ts` `LC_SELL_GROUPS` 세 번째 `slot: 'auto-sell'`, 게이트 `autoSellEnabled`, 행 시작조건/비율/방법(choice)/누적/기준(derived). `formFromServer` 가 에코 4필드를 폼으로 되먹임(limit-chaser.ts:707-710) — 웹이 따로 접지 않고 에코를 그림. `lcRangeIssue` 가 켠 cfg 에서만 비율 1~50 · 방법 1~3 요구, relay superRefine 도 동일. `isDeleteIntent`(web) 와 `#isTeardown`(relay) 이 같은 여섯 항 — 자동매도만 켠 등록이 철거로 오인되지 않음. LED: `latch-led.tsx` `autoSell` 4번째, `ArmableLatchKind` 가 타입으로 클릭 불가 보장. |
| 5  | ④ 바로시작/중지(41) 및 카드 「미반영」 해제의 `src="AutoSellCommand"` 분기 | ✓ VERIFIED | `autoSellButtonsOf`(state 2·3 → 중지만, 그 밖 → 바로시작만, 에코 없음 → 둘 다 비활성)가 렌더와 전송 가드(`onAutoSellCommand`, strategy-card.tsx:775-791)에서 같은 `server` 를 읽음. 성공 해제는 `isAutoSellCommandSettled`(Start → state 3 ∧ enabled, Stop → !enabled)로만. 거부는 `isAutoSellCommandRejection`(ERROR ∧ `AutoSellCommand`/`Account` + isin·계좌 일치, 또는 `Relay`)이 `setAutoSellCmd(null)` + `acceptAnswer()`(strategy-card.tsx:652-668). `send` 가 참일 때만 대기, 재전송 없음, 본문 `m` 미파싱. `isLimitChaserServerMessage` 에 `AutoSell`/`AutoSellCommand` 추가. e2e P27-3 존재. 리뷰 WR-01~04 는 이 경로의 주변 결함이며 아래 「리뷰 Warning 판정」 참조. |
| 6  | ④ `/me` 사용자 설정: 금액 만원 단위, `present=false` 면 내장 기본값 표시, 저장 때만 42 | ✓ VERIFIED | `limit-chaser-defaults.tsx` 가 84 캐시 한 곳에서 3상태(`undefined` 불러오는 중 / `present` / 없음)를 칩으로 그림. 42 본문 = `{...userSettingsValuesOf(base), [key]: value}`(캐시 + 바뀐 1칸, :275), 행 확정 때만 `send({t:"user.settings.set"})`(:276), 84 수신 시 자동 송신 없음. 1건 비행 큐, 3초 무응답 시 행 실패 표시, 거부 원문 귀속. `me-client.tsx:301` 에서 섹션 배선. e2e P27-M1 존재. 리뷰 WR-05 · IN-02 · IN-03 은 주변 결함. |
| 7  | ④ 새 전략 폼 84 시딩(D-11): 에코 있으면 에코가 이김, 손댄 칸 보호, 범위 밖 칸 상수 폴백 | ✓ VERIFIED | `limit-chaser-form.tsx:640` 새 전략 = `defaultLimitChaserForm()` 위에 `seedFromUserSettings(userSettings)`; 에코 있으면 `formFromServer`. `seedFromUserSettings` 가 `fitsLcRange` 실패 칸만 상수 폴백(limit-chaser.ts:394-403). 84 늦은 도착 재시딩(`:777-784`). e2e P27-4 존재. |
| 8  | ④ 주문로그 「자동매도」 칩(27-08): 서버 group 9 그대로, 팝업 「매도」 와 겹치지 않음, 창 분리 `kind=auto` | ✓ VERIFIED | `order-log-feed.ts`: `auto: [9]`, 칩 순서 「매도」 뒤, `matchesSide('sell')` 가 group 9 를 제외, 팝업 `auto` → 창 `auto`, `KINDS` 에 `'auto'`. e2e P27-O1 존재. |
| 9  | ④ UI 는 HTML 목업 먼저(사용자 채택 뒤 구현) | ✓ VERIFIED | `reference/mockup-auto-sell-card.html` · `mockup-user-settings.html` 존재. `27-DISCUSSION-LOG.md`: 카드 목업은 2회 수정 후 「이대로 채택」, 사용자 설정은 3변형 제시 후 채택. |
| 10 | ⑤ 배포 순서 relay → webapp(push), 인박스 `status: done` + `done_commit` 경로 지정 커밋 | ✓ VERIFIED | 공개 `/healthz`(검증자 직접 GET): `status:"ok"` · `version:"78486f1b"` · `vpn:true` · `dma:true` · `journal.state:"live"`. `origin/master` = `78486f1b`(검증자가 `git fetch` 로 확인), 따라서 relay 태그 = healthz = push 팁이 같은 커밋. 인박스 노트 frontmatter `status: done` · `done_commit: 78486f1b`; 커밋 `2cdefdc9` 는 그 노트 1경로만 변경. smoke PASS 10 / FAIL 0 / SKIP 2 · 84 `unknown-msg-type` warn 0 · Vercel Ready 는 SUMMARY 기록(VM 로그 · Vercel 대시보드는 검증자가 열람하지 않음; healthz 버전 일치가 독립 교차 증거). |
| 11 | `buy3_schema` 필드 존재 단조 파생 · 브라우저가 스키마를 고르지 못함 · 에코 4필드를 요청에 싣지 않음 (27-01) | ✓ VERIFIED | truth 2 와 같은 코드 근거. `hasAnyAutoSellReqField ∧ schema≠4` 이면 조립기가 경고 후 종전 스키마로 싣는 경로(envelope.ts:1465). |
| 12 | 회귀: 이전 phase(25 · 26) 표면이 깨지지 않음 | ✓ VERIFIED | 권위 증거 = 27-09 Task 1 게이트 @ `86fa3c33`(배포본 `78486f1b` 와 코드 동일): relay 985 · webapp 3325(+1 skip) · shared 300 · server strategy-events 6 · e2e 7 spec 142 passed / 0 failed / 0 flaky · typecheck 0 error. 검증자는 워킹 트리 오염 때문에 전체 스위트를 재실행하지 않았고 shared 158건만 worktree 에서 재확인함. |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Prohibitions (must_haves.prohibitions)

| Prohibition | Status | Evidence |
| ----------- | ------ | -------- |
| generated 를 손으로 고치지 않는다 (27-01) | ✓ RESOLVED | `sync-relay-schema.sh --check` 가 `78486f1b` 기준 변경 예정 0 — 산출물과 바이트 동일. |
| 에코 4필드를 요청에 싣지 않는다 · 브라우저가 `buy3Schema` 를 고르지 못한다 (27-01) | ✓ RESOLVED | envelope.ts:1568 주석 + 조립기가 4필드 add 를 하지 않음; zod 에 에코 키 없음. |
| 85 · kind 15 를 중계 · 표시하지 않는다 (27-01/03) | ✓ RESOLVED | `78486f1b` 에서 85 는 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` debug 드롭, 조립기 kind 15 분기 없음 → 폴백. (`86cc9148` 의 승격은 Phase 28 이며 배포되지 않음.) |
| relay 는 42 성공을 지어내지 않고 54 본문을 해석하지 않는다 (27-02) | ✓ RESOLVED | fanout 은 84 합성 없음(테스트 ③-2), 54 는 기존 `msg` 경로 그대로. |
| 41/42 를 pending FIFO 에 넣지 않는다 · 재전송 없음 (27-02/05) | ✓ RESOLVED | fanout 분기에 FIFO push 없음, 테스트 ②-4. 카드 `send` 거짓이면 대기 미개설. |
| 54 본문(`m`)을 파싱해 분기하지 않는다 (27-03/05) | ✓ RESOLVED | 판정 함수는 `src`/`i`/`a`/`lv` 만 읽음. |
| `origin-tag.tsx` 를 바꾸지 않는다 (27-03) | ✓ RESOLVED | `git diff --name-only 465e7372 78486f1b` 에 없음. |
| 자동매도 그룹에 낙관 반영 없음 (27-04) | ✓ RESOLVED | 값 행은 에코가 올 때까지 서버 값; `autoSellPending` 은 칩 표시만. |
| 15:40 정리 귀속에 자동매도를 넣지 않는다 (27-05) | ✓ RESOLVED | `limitChaserGateDisarmed` · `marketCloseReleaseKeysOf` 변경 파일에 자동매도 항 추가 없음(검증자 grep: 해당 함수 diff 없음). |
| `/me` 는 84 수신만으로 42 를 자동 송신하지 않는다 (27-06) | ✓ RESOLVED | 42 송신은 `dispatchOne`(행 확정) 한 곳. |
| 시딩이 lc.set · 로그 · 강조를 만들지 않는다 (27-07) | ✓ RESOLVED | 시딩은 `useState` 초기값 · 값 패치뿐. |
| relay 검증 전에 push 하지 않는다 · `DMA_HOST` 주입 금지 · 비밀 출력 금지 (27-09) | ✓ RESOLVED | SUMMARY: relay → smoke · healthz · 로그 → push 순서, DMA_HOST 「실행 중 컨테이너 보존」. |
| 20:00 KST 전에 relay 컨테이너를 바꾸지 않는다 (27-09) | PASSED (override) | Override: 사용자 명시 지시(17:02 KST). 검증 전부 통과, 롤백 없음. |
| 실계좌 바로시작 · 중지 · 설정 저장을 시험 목적으로 누르지 않는다 (27-09) | ✓ RESOLVED | SUMMARY 에 시험 조작 기록 없음. 관찰은 human_verification 으로 이월. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `relay/src/generated/**` (13 경로) | gh-trade 산출물 | ✓ VERIFIED | `--check` 0 변경. |
| `relay/src/dma/envelope.ts` | 41/42/43 조립기 · 84 파서 · schema 4 | ✓ VERIFIED | `buildAutoSellCommandReq` · `buildSetUserSettingsReq` · `parseUserSettings` · `lcBuy3SchemaOf`. |
| `relay/src/dma/msg-type.ts` | 화이트리스트 84 | ✓ VERIFIED | `UserSettingsResp: 84` INBOUND, 85 는 OUT_OF_SCOPE(78486f1b 기준). |
| `relay/src/hub/subscription-hub.ts` | 84 캐시 · 43 · 폐기 | ✓ VERIFIED | `:746,:1329,:1764,:1907,:2608`. |
| `relay/src/ws/fanout.ts` · `protocol.ts` | autosell.cmd · user.settings.set · 재생 · zod | ✓ VERIFIED | 위 truth 2. |
| `packages/shared/src/{relay,strategy-event-labels,strategy-event-text,strategy-display}.ts` | 계약 · 조립기 · 라벨 · 배지 | ✓ VERIFIED | shared 158 테스트 재확인. |
| `webapp/src/lib/limit-chaser.ts` | 41 판정 · 시딩 · 54 몫 | ✓ VERIFIED | |
| `webapp/src/components/trading/card/strategy-card.tsx` · `limit-chaser-form.tsx` · `lc/lc-fields.ts` · `card-body.tsx` · `latch-led.tsx` | 카드 그룹 · 버튼 · LED | ✓ VERIFIED | |
| `webapp/src/components/me/limit-chaser-defaults.tsx` + `me-client.tsx` | `/me` 섹션 | ✓ VERIFIED | |
| `webapp/src/lib/order-log-feed.ts` | 자동매도 칩 | ✓ VERIFIED | |
| `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` | status done | ✓ VERIFIED | |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| 카드 폼 버튼 | relay 41 | `onAutoSellCommand` → `send({t:"autosell.cmd"})` → fanout → `buildAutoSellCommandReq` → 세션 | WIRED | 계좌 화이트리스트 대조 포함. |
| 서버 60 에코 | 카드 칩/LED | `lc` 프레임 → `formFromServer`/`server` → `latchLedStateOf`/`cardGroupStatusOf` | WIRED | |
| 서버 84 | `/me` · 새 전략 폼 | hub 캐시 → `user.settings` 프레임 → `useRelaySocket.userSettings` → 섹션/`seedFromUserSettings` | WIRED | Ready 전 84 는 캐시 후 인증 재생. |
| `/me` 행 확정 | 서버 42 | `send({t:"user.settings.set"})` → fanout → `buildSetUserSettingsReq` | WIRED | |
| 서버 54 `AutoSellCommand` | 카드 거부 줄 · 대기 해제 | `isAutoSellCommandRejection` → `setAutoSellCmd(null)` | WIRED | |
| 120 저널 kind 6/11~14 | 주문로그 문장 | RPC → `strategyEventParts` → 「자동매도」 칩 | WIRED (코드) | 실제 행 일치는 human 항목. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| 카드 자동매도 그룹 | `server` (60 에코) | relay `lc` 프레임 ← 게이트웨이 60 | 예 (가짜 게이트웨이 e2e + 배포 후 healthz live) | ✓ FLOWING |
| `/me` 섹션 | `userSettings` | relay `user.settings` ← 게이트웨이 84 | 예 | ✓ FLOWING (실서버 값은 human 항목) |
| 새 전략 폼 시딩 | `userSettings` | 같은 스토어 | 예 | ✓ FLOWING |
| 주문로그 자동매도 줄 | `StrategyEventRow` | 기존 `dma_strategy_events` RPC(DB 변경 0) | 예 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 생성물이 gh-trade master 와 같다 | `sync-relay-schema.sh --check` (RELAY=`78486f1b` worktree) | 신규/변경 0 · 삭제 0 · fbs 최신, exit 0 | ✓ PASS |
| shared 조립기/라벨/배지 | `vitest run strategy-event-text strategy-event-labels strategy-display` @78486f1b | 3 files / 158 passed | ✓ PASS |
| 가동 relay 가 배포본이다 | `curl https://dma.jx1.io/healthz` | `status:ok` · `version:78486f1b` · `journal.state:live` | ✓ PASS |
| origin/master 가 배포본 | `git fetch` + `merge-base --is-ancestor 78486f1b origin/master` | origin/master = 78486f1b | ✓ PASS |
| relay · webapp · e2e 전체 | 27-09 Task 1 게이트 @86fa3c33 (코드 동일) | relay 985 · webapp 3325 · shared 300 · e2e 142 passed | ✓ PASS (재실행 안 함 — 지시에 따라 SUMMARY 기록을 권위 증거로 채택) |

`trade.jx1.io` 루트 HEAD 요청은 HTTP 307 을 돌려줬다(로그인 리다이렉트로 보이며 장애 신호 아님; 화면 확인은 human 항목).

### Probe Execution

이 phase 는 `probe-*.sh` 를 선언하지 않았고 `scripts/*/tests/probe-*.sh` 도 PLAN 에 언급되지 않아 건너뜀.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| (없음) | 27-01 ~ 27-09 `requirements: []` | REQUIREMENTS.md 에 이 phase 로 매핑된 ID 없음 — 계약 정본은 ROADMAP Goal ①~⑤ + CONTEXT D-01~D-17 | n/a | 고아 요구사항 없음 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (이 phase 추가 줄 전체) | — | `TBD`/`FIXME`/`XXX` | — | 0건 (`git diff 465e7372 78486f1b` 추가 줄 grep) |
| (이 phase 추가 줄 전체) | — | `TODO`/`HACK`/`PLACEHOLDER` | — | 0건 |
| `strategy-card.tsx` | 663-667, 782-789 | 41 거부 · 무응답이 lc.set 공용 신호(`acceptAnswer`/`setUnacked`)를 오염 (WR-01) | Warning | 아래 판정 |
| `strategy-card.tsx` | 515-521 | 41 해제가 단일 슬롯 `lastLimitChaserEcho` 에만 묶임 (WR-02) | Warning | 같은 배치의 다른 키 에코가 덮으면 거짓 「미반영」 |
| `strategy-card.tsx` | 503-508, 787 | 41 「미반영」 이 그 키의 아무 에코에나 지워짐 (WR-03) | Warning | 감시 · 매도중에서는 한 틱 뒤 사라짐 |
| `limit-chaser.ts` / `strategy-card.tsx` | 771-779 / 657-674 | `AutoSell`/`AutoSellCommand` 54 가 isin 무관하게 모든 카드에 섬 (WR-04) | Warning | 다종목 작업대에서 남의 거부가 내 상태줄에 섬 |
| `limit-chaser-defaults.tsx` | 287-293, 336-356 | 늦은 84 성공이 실패 표시를 안 지움 (WR-05) | Warning | 저장된 값 옆에 「반영되지 않았어요」 잔존 |
| 그 밖 | — | IN-01~IN-06 | Info | 구조 · 중복 · 문서화 사항, must-have 무관 |

### 리뷰 Warning 판정 (27-REVIEW.md)

검증자가 WR-01~WR-05 의 근거 줄을 `78486f1b` 에서 직접 확인했고 모두 실재한다. 어느 것도 must-have 를 깨지 않는다고 판정한다. 근거는 이렇다.

- **WR-01 / WR-03 (41 이 lc.set 응답 채널을 공유).** 틀린 주문 · 데이터 손실 경로가 없다. 실패는 모두 사용자에게 보이는 「반영 안 됨」 쪽으로 기울고(fail-visible), 재시도는 사용자 조작이다. 27-05 PLAN 이 「그 교차의 일시 오판은 훅 ③ 늦은 에코 전이가 흡수한다」 고 인지하고 수용한 영역이며, D-07 의 「다른 그룹은 바로시작을 막지 않는다」 는 버튼 활성 규칙은 구현대로 성립한다. D-08 의 핵심(기대 전이로만 해제 · 거부는 원문 + 대기 해제 · 3초 무응답은 미반영 + 버튼 해제)도 성립한다. 다만 WR-03 때문에 자동매도 감시 · 매도중에서는 41 무응답 「미반영」 이 한 틱 보이고 사라져 사용자가 실패를 놓칠 수 있다(무로그). 후속 수정 권고.
- **WR-02.** 카드가 여러 장일 때 같은 React 배치에서 남의 키 에코가 이기면 거짓 「미반영」. 서버는 이미 매도중이므로 안전 방향의 오표시다.
- **WR-04.** `SetLimitChaser`/`LimitChaser` 에 원래 있던 구조이고 이번에 자동매도 줄이 얹혀 영향이 커졌다. 표시 오염이며 주문에는 영향이 없다. 상태줄 빨간 거부가 다른 종목 카드에 서는 점은 사용자 판정 사항으로 human 항목에 넣었다.
- **WR-05.** 표시 불일치뿐이다. 계약상 「3초 무응답이면 실패 표시 · 재시도 없음」 은 구현대로다.

권고: 위 WR-01~04 는 후속 quick(또는 `/gsd-plan-phase 27 --gaps`)으로 묶어 처리하는 것이 좋다. 같은 뿌리(41 전용 상태 분리 + 키별 `server` 해제 + isin 필터)라 한 번에 닫힌다. 이 verification 의 status 에는 영향이 없다.

### Human Verification Required

#### 1. 운영 화면 시각 확인

**Test:** trade.jx1.io 에서 `/me` 「상따 기본설정」 칩, 상따 카드 매도 탭 「자동매도」 카드, 카드 헤더 LED 4칩, 주문로그 「자동매도」 칩을 확인한다. 열려 있던 탭 · 앱 WebView 는 새로고침한다(옛 탭은 schema ≤3 으로 보내 자동매도만 켠 등록을 철거할 수 있다).
**Expected:** `/me` 칩이 「불러오는 중」에 머물지 않고 자동매도 카드 · LED 4칩 · 주문로그 칩이 390px · 1280px 에서 한 줄을 지킨다.
**Why human:** 시각 배치와 프로덕션 번들은 로컬 e2e 가 보증하지 않는다. 27-09-SUMMARY D2b 가 사용자 확인 대기로 남김.

#### 2. 첫 거래일(2026-10-06) — WinForms LED · 칩 일치

**Test:** WinForms 에서 자동매도를 켠 종목의 웹 카드 칩과 헤더 「자동」 LED 를 WinForms 와 비교한다.
**Expected:** 대기 · 완료 = 주황, 감시 · 매도중 = 초록, 낱말 동일.
**Why human:** 실서버가 내는 상태 전이는 가짜 게이트웨이로 재현되지 않는다.

#### 3. 첫 거래일 — 실제 저널 행의 문장

**Test:** 주문로그 「자동매도」 칩에서 120 저널의 kind 6 group 9 줄과 kind 11~14 줄을 본다.
**Expected:** 원문 숫자가 아닌 문장(발동 · 정정 · 상태 · 멈춤 · 재개 · 주기 매도 · 동시호가 회차).
**Why human:** 조립기 골든은 합성 행이다. 칸 재해석의 실데이터 일치는 실행 중인 서버로만 확인된다.

#### 4. 첫 거래일 — 54 `[상따]` 배지와 카드 간 혼입(WR-04)

**Test:** 자동매도 사유 54 INFO 줄이 `[상따]` 배지로 서는지, 카드 여러 장일 때 남의 종목 줄이 섞이는지 본다.
**Expected:** `[상따]` + 원문 사유. 혼입이 거슬리면 후속 수정으로 올린다.
**Why human:** 실제 54 빈도 · 다종목 동시 표시는 로컬에서 재현되지 않고, 허용 여부는 사용자 판단이다.

#### 5. 첫 거래일 — `/me` 값 = WinForms 기본값, 41 실사용 관찰

**Test:** `/me` 11값을 WinForms 기본설정창과 비교한다. 사용자가 실제로 바로시작/중지를 쓸 때 칩 전이 또는 거부 원문을 본다.
**Expected:** 값 일치(만원 단위 변환 포함), 바로시작 → 「바로시작 전송…」 → 「매도중」 또는 서버 원문 거부.
**Why human:** 실계좌 버튼을 시험 목적으로 누르지 않는다(27-09 prohibition) — 실사용 중에만 관찰 가능.

### Gaps Summary

must-have 가 깨진 곳은 없다. Goal ①~⑤ 모두 배포본 `78486f1b` 코드에서 확인했다. 생성물은 gh-trade master 와 바이트 동일(`--check` 직접 실행), relay 는 가동 중(`/healthz` version `78486f1b`), webapp 은 `origin/master` 에 올라가 있고 인박스 노트는 `done` 으로 닫혔다. 27-09 의 「20:00 전 relay 교체 금지」 는 사용자 명시 지시로 override 했다.

남은 일은 두 가지다. 하나는 운영 화면과 2026-10-06 첫 거래일 실데이터 관찰(위 human 5건). 다른 하나는 리뷰 Warning WR-01~05 의 후속 수정(권고, 비차단)이다. 참고로 `covered_digest` 는 현재 워킹 트리를 기준으로 계산됐고, 동시 Phase 28 세션이 같은 relay · shared 파일을 계속 수정하므로 이 digest 는 Phase 28 변경 때 stale 로 보일 수 있다(Phase 27 판정 기준은 `78486f1b` 다).

---

_Verified: 2026-10-05T08:32:38Z_
_Verifier: Claude (gsd-verifier)_
