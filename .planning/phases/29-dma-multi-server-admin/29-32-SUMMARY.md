---
phase: 29-dma-multi-server-admin
plan: 32
subsystem: api
tags: [wr-07, wr-01, gap-closure, relay, admin, dispatcher, deadline, express, settle, tdd]
status: complete

requires:
  - phase: 29-27
    provides: "relay admin-api 생성 경로 DMA_LINKED 가드 · admin-db-fake 이메일 연결 맵 — 이 플랜은 그 위에 마감 · settle 만 얹는다"
provides:
  - "relay ADMIN_REQUEST_DEADLINE_MS = 10_000 · ADMIN_DEADLINE_MESSAGE — 변경 요청 1건 응답 마감"
  - "AdminDispatcher reconcileUser · changePassword · deleteUser 선택 deadlineAt — 마감에 진 서버는 timeout 으로 접어 먼저 응답 · 반영은 계속 · 끝나면 실제 결과로 record 한 번 더"
  - "유저 삭제 마감 → deleted false · 늦은 완료에도 dma_admin_delete_dma_user 안 부름(다음 삭제 요청이 마저 처리)"
  - "admin-api 변경 라우트 6개가 도착 시각 + 마감을 deadlineAt 으로 넘김 · adminDeadlineMs 주입구(테스트용)"
  - "quote-primary DB 실패 되돌리기 = 응답 뒤 비동기 · 실패 시 error 로그 1줄"
  - "server relayAdminTimeoutMs 기본 15_000 (relay 마감 10초 + 여유 · 브라우저 20초 안)"
  - "planner op 2 = { op: 2, accountNos } · reconcile 경로 op 2 settle = 계획 때 removing 행만(p_user_removed=false)"
affects: [29-34, 29-41, 29-gap-closure]

actuals:
  tokens: 14800
  tasks: 3
  commits: 6

plan_head_before: d88ed4daeb50d402184cc52f292e5e27bd3464e7
plan_head_after: f5bb359d

tech-stack:
  added: []
  patterns:
    - "요청 마감 접기 — 서버별 Promise 를 마감 타이머와 경주시켜 응답만 먼저 보내고, 원 Promise(와 같은 유저 줄 꼬리)는 실제 완료에 묶어 둔다. 접힌 기록 → 실제 기록 순서는 progress.folded 를 기다려 보장"
    - "settle 범위는 계획 시점 스냅샷 — op 가 계획 때 대상 계좌번호를 싣고 집행자는 그것만 정리한다(동시 커밋된 의도 보존)"

key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-32-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-32-task2-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-32-task3-red.json
  modified:
    - relay/src/admin/dispatcher.ts
    - relay/src/admin/admin-api.ts
    - relay/src/admin/planner.ts
    - relay/tests/admin-dispatcher.test.ts
    - relay/tests/admin-api.test.ts
    - relay/tests/admin-planner.test.ts
    - server/src/config.ts
    - server/src/services/relay-admin-client.ts
    - server/tests/services/relay-admin-client.test.ts
    - webapp/src/lib/admin-api.ts

key-decisions:
  - "줄(#serial)에서 마감을 맞은 요청은 의도를 따로 읽어 등록 서버 전부를 timeout 으로 접는다 — 줄 대기도 마감에 포함(응답은 10초 안)"
  - "마감 직전 반영이 끝났으면(progress.finished) 접지 않는다 — 실제 결과가 이긴다. 접힌 기록과 실제 기록은 folded Promise 로 순서 보장"
  - "admin-api 에 adminDeadlineMs 주입구 — 실 소켓 통합 테스트가 10초를 기다리지 않게(기본 ADMIN_REQUEST_DEADLINE_MS)"
  - "quote-primary DB 실패 응답 message 를 「옛 서버로 되돌리는 중」 으로 정정 — 되돌리기가 응답 뒤라 「되돌렸습니다」 는 사실이 아니다(코드 QUOTE_PRIMARY_DB_FAILED 불변 · 소비처 없음)"
  - "WR-01 은 planner 출력 확장(op 2 accountNos)으로 — 계획 시점 스냅샷이 그대로 settle 범위가 된다. RPC · 와이어 무변경"

patterns-established:
  - "Admin 변경 요청 = 마감 안 응답 + 뒤 반영 기록: 화면 칩은 다음 재조회에서 실제 결과로 바뀐다"

requirements-completed: [ADMIN-05, ADMIN-08]

coverage:
  - id: D1
    description: "relay 요청 마감 10초 — 마감에 진 서버는 timeout(ADMIN_DEADLINE_MESSAGE)으로 접어 먼저 응답, 뒤 반영이 끝나면 실제 결과로 record 2회째 · 마감 전 완료면 record 1회"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D10 요청 마감 10초 (29-32 WR-07) > 마감 접기 — KB120(op 7초 × 2)은 10초에 timeout 으로 접고 KB121 ok 로 먼저 응답 · 뒤 반영이 끝나면 실제 결과로 기록 2회째"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D10 > 마감 전에 모두 끝나면 종전과 같은 결과 · record 1회(늦은 기록 없음)"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D10 > 같은 유저 줄 — 다음 요청은 앞 요청의 뒤 반영이 끝난 뒤에 op 를 보낸다 · 그 대기 시간도 다음 요청의 마감에 포함"
        status: pass
    human_judgment: false
  - id: D2
    description: "유저 삭제가 마감에 걸리면 deleted false 로 응답 · 뒤에서 전 서버 ok 로 끝나도 deleteDmaUser 0 · 다음 삭제 요청이 마저 처리"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D10 > 삭제 마감 → { deleted: false } 응답 · 뒤에서 전 서버 ok 로 끝나도 deleteDmaUser 0 · 다음 삭제 요청이 마저 처리"
        status: pass
    human_judgment: false
  - id: D3
    description: "relay 라우트 — 변경 라우트 6개가 deadlineAt = 도착 + 10_000 · 생성 경로에서 무응답 서버가 있어도 200 + 접힌 결과(502 아님) · 뒤 기록 · reconcile 도 200 + 접힌 결과"
    requirement: ADMIN-08
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#M1 변경 라우트 6개 — deadlineAt = 도착 시각 + 10_000 을 dispatcher 에 넘긴다"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#M2 생성 — 무응답 서버는 마감에 timeout 으로 접혀 200(502 아님) · 뒤 반영이 끝나면 실제 결과 기록 · reconcile 도 200 + 접힌 결과"
        status: pass
    human_judgment: false
  - id: D4
    description: "Express relayAdminTimeoutMs 기본 15000 · env 덮기 · 머리 주석 근거 교체"
    requirement: ADMIN-08
    verification:
      - kind: unit
        ref: "server/tests/services/relay-admin-client.test.ts#relayAdminTimeoutMs — Express 상한 (29-32 WR-07)"
        status: pass
      - kind: integration
        ref: "pnpm --filter @gh-radar/server exec vitest run tests/services/relay-admin-client.test.ts tests/routes/admin-dma.test.ts (84/84)"
        status: pass
    human_judgment: false
  - id: D5
    description: "시세 주 서버 전환 DB 실패 → 500 QUOTE_PRIMARY_DB_FAILED 즉시(되돌리기 미완료여도) · 되돌리기 1회 시작 · 실패 시 error 로그 1줄"
    requirement: ADMIN-05
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#Q6 (29-32) DB 반영 실패 — 되돌리기 switchTo 가 끝나지 않아도 500 이 바로 온다 · 되돌리기 1회 시작"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#Q6 (29-32) 되돌리기 실패 → error 로그 1줄(다음 재적재 보정이 맞춘다) · 응답은 500 그대로"
        status: pass
    human_judgment: false
  - id: D6
    description: "WR-01 — reconcile op 2 settle 은 계획 때 removing 행만(userRemoved=false) · op 2 진행 중 체크한 active 등록 보존 · 줄 선 반영이 op 1 로 다시 올림 · 유저 삭제 settle 전 행 유지"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D11 (29-32 WR-01) op 2 진행 중 다른 계좌에 그 서버 active 체크 → settle 뒤에도 남음 · userRemoved=false · 다음 반영이 op 1 로 다시 올린다"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-planner.test.ts#active [] · removing [A1] · 87 [A1] → op 2 … op 2 는 계획 때 removing 계좌를 싣는다(29-32 WR-01)"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D4 · D8 유저 삭제(settle userRemoved true 회귀)"
        status: pass
    human_judgment: false
  - id: D7
    description: "실서버(KB · 교보 게이트웨이)에서 느린 서버가 있을 때 Admin 화면 칩이 마감 칩 → 다음 재조회 실제 결과로 바뀌는 흐름"
    verification: []
    human_judgment: true
    rationale: "운영 게이트웨이 · Cloud Run 배포가 필요하다(29-41 배포 창). 단위 · 통합 테스트는 가짜 게이트웨이까지만 증명한다"

duration: 10min
completed: 2026-10-10
---

# Phase 29 Plan 32: Admin 요청 마감 10초 · 시세 되돌리기 비동기 · reconcile settle 범위 축소 Summary

**relay Admin 변경 요청이 10초 마감에 느린 서버를 `timeout`(「10초 안에 끝나지 않아 먼저 응답했어요 — 서버 반영은 계속돼요」)으로 접어 200 으로 먼저 응답하고 실제 결과는 뒤에 다시 기록하며(Express 15초), 시세 전환 DB 실패 되돌리기는 응답 뒤로 미루고, reconcile op 2 settle 은 계획 때 removing 이던 행만 지운다**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-10T14:07:43Z
- **Completed:** 2026-10-10T14:17:47Z
- **Tasks:** 3
- **Files modified:** 13 (소스 6 · 테스트 4 · RED 증거 3)

## Accomplishments

- **WR-07 트레이서(Task 1):** `AdminDispatcher` 에 요청 단위 마감. 서버별 Promise 는 마감 타이머와 경주한다. 마감에 진 서버는 응답 배열에서 `timeout` + `ADMIN_DEADLINE_MESSAGE` 로 접어 기록하고 먼저 응답한다. 진행 중 44 와 서버 FIFO 는 건드리지 않는다. 반영이 끝나면 실제 결과로 `dma_admin_record_results` 를 한 번 더 부른다.
  - 같은 유저 줄(`#serial`)은 실제 완료에 묶여 있다. 다음 요청은 앞 반영이 끝난 뒤에 op 를 보내고, 그 대기 시간도 자기 마감에 들어간다.
  - 유저 삭제가 마감에 걸리면 `deleted: false` 로 응답한다. 늦게 끝나도 DB 삭제는 하지 않는다.
  - admin-api 의 변경 라우트 6개는 도착 시각 + 10초를 `deadlineAt` 으로 넘긴다. Express 기본 타임아웃은 15초다.
- **Task 2:** `POST /servers/:key/quote-primary` 에서 DB 반영이 실패하면 500 `QUOTE_PRIMARY_DB_FAILED` 를 바로 던진다. 옛 서버로의 `switchTo` 는 `void` + then/catch 로 응답 뒤에 띄운다. 이 라우트의 응답 상한은 이제 전환 1회 + RPC 다.
- **WR-01(Task 3):** planner 의 op 2 가 계획 때 87 에 있던 removing 계좌번호(`accountNos`)를 싣는다. 비삭제 경로에서 op 2 가 ok 면 `settle(…, 그 계좌들, false)` 를 부른다. 그래서 op 2 진행 중에 다른 계좌에서 같은 서버를 active 로 체크해도 그 행은 남고, 줄 서 있던 반영이 op 1 로 다시 올린다.

## Task Commits

1. **Task 1: 트레이서 — 요청 마감 10초 · 뒤 기록 · Express 15초**
   - RED `6cc3ef80` (test) · GREEN `30e2d679` (feat)
   - 트레이서 게이트: verify 2종 재실행 green → 확장으로 진행
2. **Task 2: 시세 전환 DB 실패 되돌리기 비동기** — RED `10c43e13` (test) · GREEN `b6b4421f` (feat)
3. **Task 3: WR-01 reconcile op 2 settle = removing 행만** — RED `2d9cb259` (test) · GREEN `f5bb359d` (feat)

REFACTOR 커밋은 없다(정리할 것이 없었다).

**Plan metadata:** 이 SUMMARY 커밋 · STATE/ROADMAP 커밋(아래 최종 보고 참고)

## TDD Gate Compliance

| Task | RED | RED 증거 | GREEN |
|------|-----|---------|-------|
| 1 | `6cc3ef80` | `.red/29-32-task1-red.json` RED_EVIDENCE_OK(상수 target) | `30e2d679` |
| 2 | `10c43e13` | `.red/29-32-task2-red.json` RED_EVIDENCE_OK | `b6b4421f` |
| 3 | `2d9cb259` | `.red/29-32-task3-red.json` RED_EVIDENCE_OK(junit) | `f5bb359d` |

RED 단계별 판정은 다음과 같다.

- **Task 1** — 전체 실행에서 행동 케이스 3건이 응답 단언(`expected null to deeply equal […]`)에서 실패했다. 원인은 마감 미구현이다. 상수 케이스도 `expected undefined to be 10000` 으로 실패했다.
  - vitest `tap-flat` 은 여러 줄 diff YAML 을 내고, 분류기는 이를 Malformed TAP 으로 거부한다. 그래서 단언이 한 줄인 상수 케이스를 `-t` 로 target 지정했다.
  - stdout 에 섞인 pino gcp 진단 1줄은 reporter 출력이 아니라서 `consoleOutput` 필드로 따로 보존했다.
- **Task 2** — 응답 경주 단언(`expected 'hang' not to be 'hang'`)에서 실패했다. 원인은 라우트가 되돌리기 `switchTo` 를 await 한 것이다.
- **Task 3** — settle 인자 단언에서 실패했다. reconcile op 2 가 ok 면 `(…, [], true)` 로 그 서버 행을 전부 지웠기 때문이다.
  - 여러 줄 diff 문제는 junit 리포터(`--outputFile.junit`)로 해결했고, `reportPath` · `runStartedAt` · `reportModifiedAt` 을 기록했다.

`grep -n "#settle(" relay/src/admin/dispatcher.ts` (acceptance — 넷째 인자 `true` 는 settleUserOnOk 갈래 하나):

```
288:      if (failure === null) await this.#settle(dmaUserId, serverKey, [], true);
290:      await this.#settle(dmaUserId, serverKey, removed, false);
296:  async #settle(dmaUserId: string, serverKey: string, removed: string[], userRemoved: boolean): Promise<void> {
```

## Files Created/Modified

- `relay/src/admin/dispatcher.ts` — 다음을 더했다.
  - 상수 2개 · `Progress` · `#answerBy`(마감 경주 · 접기 · 늦은 실패 로그) · `#recordFinal`(접힌 기록 뒤 실제 기록) · `#sorted`
  - 세 공개 메서드의 선택 `deadlineAt`
  - 삭제가 마감 뒤에 끝났을 때의 DB 삭제 보류
  - op 2 settle 범위 축소 · 머리 주석
- `relay/src/admin/admin-api.ts` — 다음을 더했다.
  - `deadlineOf()` 와 `adminDeadlineMs` 주입구 · 변경 라우트 6개의 `deadlineAt` · 머리 주석의 마감 규약 문단
  - quote-primary 되돌리기를 비동기로 바꾸고 message 를 정정
- `relay/src/admin/planner.ts` — `PlannedOp` op 2 에 `accountNos` 를 더했다.
- `server/src/config.ts` — `relayAdminTimeoutMs` 기본값을 15_000 으로 바꾸고 타입 주석의 근거를 고쳤다.
- `server/src/services/relay-admin-client.ts` — 머리 주석의 옛 「기본 12000」 근거를 「15초 = relay 마감 10초 + 여유 · 브라우저 20초 안」 으로 바꿨다.
- `webapp/src/lib/admin-api.ts` — 주석의 「12초」 를 「15초」 로 고쳤다. `RELAY_TIMEOUT_MS = 20_000` 값은 그대로다.
- 테스트(아래 경로) — dispatcher D10(5건)·D11, admin-api M1·M2·Q6×2, planner op 2 기대값, server 설정 2건을 더했다. FakeConn 에는 `delayMs` 를 더했다.
  - `relay/tests/admin-dispatcher.test.ts` · `relay/tests/admin-api.test.ts` · `relay/tests/admin-planner.test.ts` · `server/tests/services/relay-admin-client.test.ts`

## Decisions Made

- **줄에서 마감을 맞은 요청:** 의도를 따로 읽어 등록 서버 전부를 timeout 으로 접는다. 응답은 10초 안에 나가고, 반영은 줄이 풀린 뒤 실제로 돈다.
- **경계 경합:** 마감 직전에 반영이 끝났으면 실제 결과가 이긴다(`progress.finished`). 의도를 읽는 사이에 끝난 경우도 같다. 접힌 기록과 실제 기록의 DB 순서는 `progress.folded` 를 await 해서 보장한다.
- **응답 뒤에 반영이 실패하면:** error 로그 1줄만 남긴다. 다음 「다시 반영」 이 87 대조로 맞춘다.
- **WR-01 수정 위치:** planner 출력(계획 시점 스냅샷)으로 고쳤다. DB RPC · 와이어 · `putAccount` 경로는 바꾸지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] webapp 주석의 「12초」 상한 표기 정정**
- **Found during:** Task 1
- **Issue:** `webapp/src/lib/admin-api.ts` 의 ④ 문단과 `RELAY_TIMEOUT_MS` 주석이 서버 상한을 12초로 적고 있다. Express 기본값을 15초로 바꾼 뒤에는 틀린 근거다.
- **Fix:** 두 주석을 15초로 고쳤다. 값(20초)은 계획대로 바꾸지 않았다.
- **Files modified:** webapp/src/lib/admin-api.ts
- **Verification:** `pnpm --filter @gh-radar/webapp run typecheck` 통과
- **Committed in:** `30e2d679`

**2. [Rule 1 - Bug] quote-primary DB 실패 응답 message 정정**
- **Found during:** Task 2
- **Issue:** 되돌리기를 응답 뒤로 옮기면 「…되돌렸습니다」 는 응답 시점에 사실이 아니다.
- **Fix:** message 를 「시세 주 서버를 기록하지 못해 옛 서버로 되돌리는 중입니다」 로 바꿨다. code 는 바꾸지 않았다. server · webapp 에 이 문구를 쓰는 곳이 없다는 것은 grep 으로 확인했다.
- **Files modified:** relay/src/admin/admin-api.ts
- **Committed in:** `b6b4421f`

**3. [Rule 3 - Blocking] admin-api `adminDeadlineMs` 주입구 추가**
- **Found during:** Task 1
- **Issue:** 라우트 통합 테스트는 실 소켓 + 가짜 게이트웨이를 쓴다. 가짜 타이머를 쓸 수 없어서, 10초 마감을 그대로 증명하려면 테스트마다 10초 이상 걸린다.
- **Fix:** 선택 dep `adminDeadlineMs`(기본 `ADMIN_REQUEST_DEADLINE_MS`)를 더했다. 기본값 10_000 은 두 곳에서 증명한다.
  - M1 — `now` 를 주입하고 spy 로 `deadlineAt = NOW + 10_000` 을 확인
  - dispatcher D10 — 가짜 타이머로 실제 10초를 확인
- **Committed in:** `30e2d679`

---

**Total deviations:** 3 auto-fixed (Rule 1 ×2 · Rule 3 ×1)
**Impact on plan:** 셋 다 정확성 · 검증 가능성 보정이고 범위 확장은 없다.

## Issues Encountered

- 처음 RED 증거를 모을 때 실수가 있었다. 임시 증거 디렉터리를 정리하려고 `rm -rf .planning/phases/29-dma-multi-server-admin/.red` 를 실행했는데, 그 안에는 추적 중인 29-06 · 29-08 RED 증거 파일 2개가 있었다.
  - 커밋 전에 `git checkout -- <두 파일>` 로 그 두 파일만 복원했다. 손실은 없다.
  - 이후에는 같은 디렉터리 관례(`.red/29-32-taskN-red.json`)를 따라 증거를 커밋했다.
- 실행 중에 다른 세션이 `d88ed4da`(gh-trade 인박스 order_ip/order_mac 접수)를 커밋했다. 플랜 기준점(`plan_head_before`)이 바로 그 커밋이다. 이 플랜 커밋 사이에 끼어든 다른 커밋은 없다.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-07 · WR-01 은 테스트로 고정했다. WR-04(꺼진 서버 삭제)는 29-34 몫이다. 이 플랜의 마감 접기와 함께 진실 9 를 닫는다.
- 배포(relay · server 의 `RELAY_ADMIN_TIMEOUT_MS` 기본값 반영)와 실서버 확인은 29-41 배포 창에서 메인 세션이 한다. Cloud Run 에 `RELAY_ADMIN_TIMEOUT_MS` 가 12000 으로 명시돼 있으면 그 값이 기본값을 덮으므로, 29-41 에서 env 를 확인해야 한다.
- 열린 인박스 노트 `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(order_ip/order_mac)는 이 플랜 범위 밖이다. 다른 세션이 `d88ed4da` 로 접수했다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*
