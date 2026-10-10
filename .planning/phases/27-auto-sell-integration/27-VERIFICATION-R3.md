---
phase: 27-auto-sell-integration
verified: 2026-10-10T05:00:00Z
round: 3
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
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
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
covered_digest: "v3:sha256:9bfc8195d030a9541ffacd076a38f72a0447991ab005d10959f3b1edfc6638ab"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "20:00 KST 전에 relay 컨테이너를 바꾸지 않는다 (27-09 prohibition)"
    reason: "사용자가 「푸시 배포 해」(2026-10-05 17:02 KST)로 장중 배포를 명시 지시했다. 27-09-SUMMARY Deviation 4 가 기록하며, 배포 뒤 smoke · healthz · 로그 검증을 모두 통과했고 롤백은 없었다."
    accepted_by: "user (명시 지시 — 1라운드 보고서에서 승계)"
    accepted_at: "2026-10-05T08:02:00Z"
re_verification:
  previous_status: passed
  previous_score: 12/12
  previous_report: 27-VERIFICATION-R2.md
  gaps_closed:
    - "WR-R2-01 — 3초 뒤 늦은 41 거부가 「미반영」을 거두고 거부 원문만 세운다 (b9e03bed). 테스트 2건(AutoSellCommand 늦은 거부 · relay kind autosell.cmd 늦은 거부) + 음성 1건(kind lc.set 은 안 거둠)"
    - "WR-R2-02 — 전략 삭제 · 자동매도 켜짐→꺼짐 전이에서 이미 서 있는 「미반영」을 거둔다 (0948efe5). 테스트 3건(삭제 · 끄기 양성 + 꺼진 채 에코 음성, WR-03 유지)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
warnings:
  - id: WR-R3-01
    severity: low
    item: "늦은 41 거부를 받는 창(autoSellTimedOutRef !== null)에 기한이 없다 — 키를 싣지 않는 relay 거부(i 빈 값)가 무응답 카드의 로그 · 상태줄에 원문으로 선다"
    where: "webapp/src/components/trading/card/strategy-card.tsx:729-757 (코드에서 확인), webapp/src/lib/limit-chaser.ts:991-994"
    status: "advisory — 선행 조건이 겹쳐야 한다: 같은 탭의 다른 카드 41 이 3초 넘게 무응답(41 을 모르는 옛 서버 또는 41 유실)이어야 하고, 그 뒤 relay 가 다른 요청의 조립 · 송신 실패를 i 빈 값으로 보내야 한다. 표시 오염(남의 거부 원문 한 줄 + 「미반영」 조기 해제)이며 fail-visible 방향, 주문 경로 · 데이터 손실 없음. 목표 truth 5 의 대기 중 거부 · 기대 전이 · 3초 미반영과 WR-04 의 키 기반 축(AutoSellCommand · Account 의 i · a 일치)은 그대로 성립"
  - id: WR-R3-02
    severity: low
    item: "41 대기 3초 안에 전략 삭제 · 자동매도 꺼짐 전이가 오면 살아 있는 41 타이머가 뒤에 「미반영」을 다시 세운다 (WR-R2-02 의 타이밍만 바꾼 잔여)"
    where: "webapp/src/components/trading/card/strategy-card.tsx:587-595 · 610 · 866-876 (코드에서 확인)"
    status: "advisory — 41 이 무응답이어야 하고(UAT 기간 실패 경로 0) 삭제 · 끄기가 그 3초 창 안에 와야 한다. 타이머 콜백이 server 를 보지 않는 것이 원인. 삭제 뒤 잔존은 복구 동선이 없으나(두 버튼 잠금) 키 변경 · 재마운트로 풀리고 실패 사실은 error 로그 줄이 이미 영속한다. 주문 경로 영향 없음"
  - id: IN-R3-01..02
    severity: info
    item: "isAutoSellCommandRejection 계약 주석이 「in-flight 창 안에서만」으로 남음 · WR-R2-02 양성 테스트의 경로 폭이 좁음(대기 중 경로 · 켜진 채 런타임 푸시 음성 미고정)"
    where: "27-REVIEW-R3.md"
    status: "info — 처분은 27-REVIEW-R3-DISPOSITION.md 에서 관리(4건 open)"
  - id: WR-R2-IN-UI
    severity: info
    item: "2라운드에서 승계: IN-R2-01..04(처분은 27-REVIEW-R2-DISPOSITION.md) · UI-REVIEW 17/24"
    where: "27-REVIEW-R2.md · 27-UI-REVIEW.md"
    status: "advisory — 변동 없음"
human_verification: []
---

# Phase 27: 자동매도 연동 — 재검증 보고서 (3라운드)

**Phase Goal:** gh-trade Phase 28 자동매도가 KB 120 실서버에서 이미 내보내는 와이어를 gh-radar 가 받아서 보여 주고 조작할 수 있게 한다. ① relay 생성물 동기화 ② relay 41/42/43/84/54 중계 ③ shared 문장 조립기(kind 11~14 · group 9 · CancelReason 10/11) ④ webapp 상따 카드 자동매도 칸 · 바로시작/중지 · `/me` 상따 기본설정 ⑤ 배포 relay → webapp + 인박스 done.
**Verified:** 2026-10-10T05:00:00Z
**Status:** passed
**Re-verification:** Yes — 2라운드(`a8a68b65` 기준, passed 12/12) 이후 WR-R2-01/02 수정 커밋 b9e03bed · 0948efe5 가 `strategy-card.tsx` 와 `strategy-card-flow.test.tsx` 를 바꿔 fingerprint 가 낡았다. 현재 HEAD(`22c7cb9f`)로 다시 검증했다. 기존 `27-VERIFICATION.md` · `27-VERIFICATION-R2.md` 는 수정하지 않았다.

## 판정 요약

목표는 달성됐고 2라운드 이후의 변경에서도 유지된다. status 는 `passed`, 점수는 12/12 로 2라운드와 같다.

1. **변경 범위 확인.** `git diff --stat a8a68b65..HEAD` 로 phase 27 이 덮는 소스 중 바뀐 파일은 `strategy-card.tsx`(80줄) 와 그 테스트 `strategy-card-flow.test.tsx`(+134줄) 둘뿐이다. 나머지는 이 phase 의 covered 파일이 아니다(`use-order-log-feed.ts` · relay `tests/admin-snapshot-sink.test.ts` · `tests/pipelines.test.ts`). `relay/src` · `packages/shared/src` · `webapp/src/lib/limit-chaser.ts` · 인박스 노트는 a8a68b65 이후 diff 가 없다. 따라서 truth 1~4 · 6~11 의 2라운드 근거는 그대로 유효하다.
2. **WR-R2-01/02 는 실제로 닫혔다.** 코드를 직접 읽고 테스트를 돌려 확인했다(아래).
3. **3라운드 리뷰의 Warning 2건(WR-R3-01 · WR-R3-02)은 코드를 직접 읽어 지적이 정확함을 확인했다.** 두 건 모두 표시(「미반영」 상태줄) 문제이고 주문 경로 · 데이터에 닿지 않아 2라운드와 같은 기준으로 **advisory** 로 판정했다. status 에는 반영하지 않았다.

## 2라운드 advisory 의 종결 확인

| ID | 판정 | 직접 확인한 근거 |
|----|------|------------------|
| WR-R2-01 | **닫힘** | `strategy-card.tsx:729-737` `lateAutoSellAnswer = autoSellCmdRef.current === null && autoSellTimedOutRef.current !== null && isAutoSellCommandRejection(...)`. `:745-750` 의 `autoSellReply` 블록이 `if (autoSellAnswer) setAutoSellCmd(null)` 로 대기 중 거부에서만 대기를 풀고 `clearAutoSellUnacked()` 는 두 경우 모두 부른다. `acceptAnswer` 는 부르지 않는다(WR-01 유지). 상태줄(`setLastError`)은 `autoSellReply` 면 error 가 아니어도 세운다. 테스트: 늦은 `AutoSellCommand` 거부, 늦은 relay `kind:"autosell.cmd"` 거부, 음성 `kind:"lc.set"`(다른 요청의 답은 안 거둠) |
| WR-R2-02 | **닫힘(타이머 발화 뒤 경로)** | 삭제 갈래 `:582-595` 가 `clearAutoSellUnacked()` 호출, 켜짐→꺼짐 전이 `:610` 이 같은 호출. 둘 다 `prev` 를 소유한 이펙트 안이며 런타임 전용 조기 반환(`:629`)보다 먼저 판정한다. 테스트: 삭제 · 끄기 양성, 꺼진 채(false→false) 에코 음성(WR-03 유지) |
| `clearAutoSellUnacked` 단일 해제 지점 | 사실 | `autoSellTimedOutRef.current = null` · `setAutoSellUnacked(false)` 는 `:445-446` 한 곳. 세우는 곳은 41 타이머 콜백(`:866-876`) 하나 |

## 3라운드 리뷰 Warning 판정 (27-REVIEW-R3.md — Critical 0 · Warning 2 · Info 2)

### WR-R3-01 — 늦은 창에 기한이 없다 (확인됨 · advisory)

`lateAutoSellAnswer` 는 `autoSellTimedOutRef.current !== null` 인 동안 열려 있고, 그 ref 를 비우는 곳(`clearAutoSellUnacked` 호출처)에 시간 조건은 없다. `isAutoSellCommandRejection` 의 `Relay` 갈래(`limit-chaser.ts:991-994`)는 전략 키를 보지 않고 모양(`i === ""` ∧ `a` 빈 값 또는 이 계좌)과 `kind`(`"autosell.cmd"` 또는 옛 relay 의 `""`)만 본다. 리뷰가 든 순서가 코드상 그대로 성립한다: 카드 A 의 41 이 무응답으로 타이머가 발화한 뒤, 같은 탭 다른 카드 B 의 41 이 relay 에서 `rejectFrame(reason, "", "", t)` 로 거부되면 A 의 로그 · 상태줄에 B 의 거부 원문이 선다.

**blocking 이 아닌 이유.** (1) 선행 조건이 겹쳐야 한다 — 먼저 41 이 3초 넘게 무응답이어야 하고(41 을 모르는 옛 서버이거나 유실. UAT 기간 relay 41 실패 경로 로그 0), 그 뒤 다른 카드의 relay 측 조립 · 송신 실패가 일어나야 한다. (2) 영향은 표시 한 줄이다 — 잘못 서는 것은 relay 가 실제로 낸 거부 원문이고 주문 · 데이터 경로가 아니다. (3) 같은 relay 갈래의 상관은 2라운드 이전부터 in-flight 창에 맡겨 왔다(`isAutoSellCommandRejection` 주석 「창이 그 상관을 맡는다」) — 이번 수정은 그 창을 「타이머가 발화한 카드」에 한해 시간 제한 없이 넓힌 것이다. (4) 키를 싣는 출처(`AutoSellCommand` · `Account`)는 여전히 i · a 일치를 요구하므로 WR-04 의 카드 간 오염 방지는 키 기반 축에서 유지된다. 목표 truth 5 · WR-04 truth 어느 것도 깨지지 않는다.

**권고 수정(별도 quick, 코드 변경 없음):** 리뷰 제안대로 relay 출처는 타이머 발화 시각 + `LC_ORPHAN_WAIT_MS` 안에서만 늦은 답으로 받고, `isAutoSellCommandRejection` 주석(IN-R3-01)을 함께 고친다.

### WR-R3-02 — 대기 중(3초 안) 삭제 · 꺼짐 전이 뒤 타이머가 「미반영」을 다시 세운다 (확인됨 · advisory)

41 타이머 콜백(`:866-876`)은 `server` 를 보지 않고 무조건 `autoSellTimedOutRef = action` · `setAutoSellUnacked(true)` · error 로그를 남긴다. 삭제 갈래와 켜짐→꺼짐 전이는 `clearAutoSellUnacked()` 만 부르고 대기 중 41(`autoSellCmdRef` · `autoSellCmdTimer`)을 끝내지 않는다. 지울 것이 아직 없을 때 불린 해제는 무동작이고, 3초에 타이머가 「미반영」을 세운다. 삭제 뒤라면 `autoSellButtonsOf(null)` 이 두 버튼을 잠그므로 키 변경 · 재마운트 전까지 남는다. 키 변경 리셋(`:506-507`)은 `setAutoSellCmd(null)` 과 `clearAutoSellUnacked()` 를 둘 다 부르는데 삭제 갈래만 그 짝이 없다는 리뷰의 지적도 코드와 일치한다.

**blocking 이 아닌 이유.** 2라운드 WR-R2-02 와 같은 계열이지만 범위가 더 좁다. 41 이 무응답이어야 하고, 삭제 · 끄기가 그 3초 창 **안에** 와야 한다(이 탭의 폼은 41 대기 중 자동매도 스위치와 그룹 확정을 잠그므로 다른 단말 · 다른 게이트 · 서버발 전이만 해당한다). 낡은 한 줄이 남을 뿐 주문 경로에 영향이 없고, 실패 사실은 error 로그 줄이 이미 영속한다(PC-7 충족). 2라운드가 같은 성격의 잔존을 advisory 로 판정한 기준과 일관된다.

**권고 수정(별도 quick):** 두 수평선에서 대기 중 41 도 `setAutoSellCmd(null)` 로 끝낸다(리뷰 제안). 대기 중 경로 테스트 2건과 켜진 채 런타임 푸시 음성 케이스(IN-R3-02)를 더한다.

### Info

IN-R3-01(계약 주석이 낡음) · IN-R3-02(테스트 경로 폭)는 동작에 영향이 없는 정합 권고다.

## Goal Achievement — Observable Truths

ROADMAP 에 Success Criteria 목록이 없어 2라운드의 12개 truth(Goal ①~⑤ + CONTEXT D-id)를 그대로 재판정했다.

| # | Truth | Status | Evidence (이번 라운드) |
|---|-------|--------|------------------------|
| 1 | ① relay 생성물이 gh-trade master 와 같다 | ✓ VERIFIED | `relay/src` 의 a8a68b65 이후 diff 없음(`git diff --stat a8a68b65..HEAD -- relay/src` 빈 출력). 2라운드의 본문 동일성 근거 유효 |
| 2 | ② relay 41/42/43/84/54 중계 · buy3_schema 파생 | ✓ VERIFIED | 상동 — relay 소스 변경 없음. 호출자 게이트 relay 52파일 1263/1263 통과 |
| 3 | ③ shared 조립기 kind 11~14 · group 9 · CancelReason 10/11 | ✓ VERIFIED | `packages/shared/src` 변경 없음. 호출자 게이트 shared 18파일 435/435 통과. UAT 3 실데이터 924/924 |
| 4 | ④ 상따 카드 「자동매도」 그룹 · LED 4번째 칩 | ✓ VERIFIED | `lc-fields.ts` · `latch-led.tsx` 등 변경 없음. UAT 2 실서버 0~4 전이 227건 |
| 5 | ④ 바로시작/중지(41) · 카드 「미반영」 해제의 `AutoSellCommand` 분기 (behavior-dependent) | ✓ VERIFIED | `strategy-card.tsx` 를 직접 읽음: `onAutoSellCommand` 가 `autoSellButtonsOf(server)` 가드 → `send` 참일 때만 대기 → 3초 타이머가 전용 `autoSellUnacked` + error 로그. 거부 갈래는 `acceptAnswer` 미호출(WR-01). 기대 전이 `settleAutoSell`(WR-02), 54 isin · 계좌 축 필터(WR-04), 늦은 거부 · 삭제 · 끄기 해제(WR-R2-01/02). **`strategy-card-flow.test.tsx` 90/90 통과(이번 실행, 12.7s)** — 대기 중 거부 · 기대 전이 · 3초 미반영 · 늦은 거부 · 삭제 · 끄기 · 꺼진 채 에코 음성 포함. 경계 밖 두 틈은 WR-R3-01/02 advisory |
| 6 | ④ `/me` 사용자 설정 | ✓ VERIFIED | `limit-chaser-defaults.tsx` · `me-client.tsx` 변경 없음. UAT 5 |
| 7 | ④ 새 전략 폼 84 시딩(D-11) | ✓ VERIFIED | `limit-chaser-form.tsx` 변경 없음 |
| 8 | ④ 주문로그 「자동매도」 칩 | ✓ VERIFIED | `order-log-feed.ts` 변경 없음(인접 `use-order-log-feed.ts` 는 phase 27 covered 아님 · quick-261010-h22 소관) |
| 9 | ④ UI 는 HTML 목업 먼저 | ✓ VERIFIED | `reference/mockup-*.html` 존재, 변동 없음 |
| 10 | ⑤ 배포 relay → webapp, 인박스 `status: done` | ✓ VERIFIED | `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` 변경 없음(`status: done` · `done_commit: 78486f1b`) |
| 11 | `buy3_schema` 단조 파생 · 에코 4필드 요청 미탑재 | ✓ VERIFIED | relay 소스 변경 없음 |
| 12 | 회귀: 이전/이후 phase 와 공존 | ✓ VERIFIED | 호출자 전체 게이트(idle machine): relay 1263/1263 · webapp 163파일 3774 pass / 1 skip · shared 435/435. 전체 스위트는 재실행하지 않았다 |

**Score:** 12/12 truths verified (behavior-unverified 0 · override 1)

### behavior-dependent truth 확인

| 불변식 | 증거 |
|--------|------|
| 41 거부 · 무응답이 lc.set 판정(`answerSeq` · `ackTimer`)을 오염하지 않음 (WR-01) | 늦은 거부 경로도 `acceptAnswer` 를 부르지 않는다(`:745-750` 직접 확인) + 테스트가 `lastCard.unacked === false` 단언. 90/90 통과 |
| 41 무응답 「미반영」이 아무 에코로나 지워지지 않고 전이로만 거둬짐 (WR-03) | 꺼진 채(false→false) 에코 음성 테스트 통과, 켜짐→꺼짐 **전이**로만 거둠(`:610`) |
| 다른 카드의 41 거부 · 자동매도 사유 54 가 내 카드에 서지 않음 (WR-04) | 키 기반 출처(`AutoSellCommand` · `Account`)는 i · a 일치 필수 — 유지. relay 출처의 늦은 창 확대만 WR-R3-01 로 기록(advisory) |
| 다른 요청(lc.set 등)의 relay 거부가 41 「미반영」을 거두지 않음 | 음성 테스트 통과(`kind:"lc.set"`) |

## 2라운드 이후 변경에 대한 회귀 확인

| 변경 | 확인 | 결과 |
|------|------|------|
| b9e03bed · 0948efe5 (WR-R2-01/02 수정) | 코드 직접 읽기 + 테스트 90/90. 새 테스트 6건(양성 5 · 음성 1~2) | 회귀 없음 · WR-R3-01/02 advisory 2건 신규 |
| quick-261010-h22 (`use-order-log-feed.ts` kind 15 틈 메우기 · relay 테스트) | phase 27 covered 파일 아님. 호출자 게이트(webapp 3774 · relay 1263)로 공존 확인 | 이상 없음 |

## Required Artifacts · Key Links · Data-Flow

2라운드 표와 동일하다. a8a68b65 이후 `strategy-card.tsx` 외 covered 소스의 diff 가 없다. 카드의 `onAutoSellCommand → send autosell.cmd` 와 54 거부 → 「미반영」 해제 링크는 이번에 코드로 재확인했다(WIRED). 하드코딩 빈 값 · 정적 폴백 없음.

## Behavioral Spot-Checks (이번 실행)

| 동작 | 명령 | 결과 |
|------|------|------|
| 카드 41 흐름 전체 | `cd webapp && npx vitest run src/components/trading/__tests__/strategy-card-flow.test.tsx` | 1파일 90/90 통과 (12.73s, 3라운드 리뷰어가 과부하로 못 본 전체 파일 녹색을 확인) |
| 전체 회귀 | 호출자 제시 게이트 | 인용 (재실행 안 함) |

3라운드 리뷰가 부하 때문에 확인하지 못한 「4 failed」(vitest Timeout)는 과부하 산물이었고, 현재는 90/90 이다.

## Probe Execution

SKIPPED — 이 phase 는 probe 를 선언하지 않았다.

## Prohibitions

2라운드 판정 유지. 변동 없음(20:00 KST 전 relay 컨테이너 변경 금지는 override 승계, 나머지 RESOLVED). WR-R3-01 은 「54 본문을 파싱해 분기하지 않는다」를 어기지 않는다(본문 `m` 미파싱, `src` · `i` · `a` · `kind` 만 읽음).

## Requirements Coverage

REQUIREMENTS.md 에 Phase 27 로 매핑된 ID 없음, 플랜 9개 모두 `requirements: []`. 고아 요구사항 0.

## Anti-Patterns

`strategy-card.tsx` 에서 `TBD` · `FIXME` · `XXX` 0건(grep). 부채 마커 게이트 통과.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `strategy-card.tsx` | 729-757 | 늦은 41 거부 창에 기한 없음 (WR-R3-01) | ⚠️ Warning (advisory) | 위 판정 |
| `strategy-card.tsx` | 587-595 · 610 · 866-876 | 대기 중 해제 뒤 타이머가 「미반영」 재설정 (WR-R3-02) | ⚠️ Warning (advisory) | 위 판정 |
| `limit-chaser.ts` | 960-977 | 계약 주석 낡음 (IN-R3-01) | ℹ️ Info | 정합 |

## Human Verification Required

없음. `27-UAT.md` 5/5 pass 유지. 새로 올릴 항목은 없다.

## Gaps Summary

FAILED truth 도 없고 `gaps:` 는 비어 있다. status 는 `passed`.

비차단 후속: WR-R3-01 · WR-R3-02 · IN-R3-01 · IN-R3-02 는 모두 WR-R2-01/02 수정이 해제 조건을 「타이머가 이미 발화한 상태」 하나에만 붙인 같은 뿌리다. 한 quick 으로 묶어 닫을 수 있다(`27-REVIEW-R3-DISPOSITION.md` 에서 4건 open 관리). 그 quick 이 `strategy-card.tsx` 를 또 바꾸면 fingerprint 가 다시 낡는다는 점은 감안할 것.

작업 트리: verifier 는 이 보고서 외에 파일을 수정하지 않았고 커밋하지 않았다.

---

_Verified: 2026-10-10T05:00:00Z_
_Verifier: Claude (gsd-verifier) — 3라운드_
