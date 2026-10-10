---
phase: 29-dma-multi-server-admin
plan: 34
subsystem: api
tags: [wr-04, in-03, gap-closure, relay, admin, dispatcher, express, webapp, skip-disabled, tdd]
status: complete

requires:
  - phase: 29-32
    provides: "요청 마감 deadlineAt · 접힌 결과 · 삭제 마감 → deleted false — 이 플랜은 그 위에 skipped 사유 · skipDisabled 만 얹는다"
  - phase: 29-31
    provides: "useFieldSave releaseOn (IN-03) — 역할 세그먼트에 붙인다"
provides:
  - "relay SKIPPED_DISABLED_DELETE_MESSAGE · SKIPPED_DISABLED_RECONCILE_MESSAGE — 꺼진 · 없는 등록 서버 skipped 의 맥락별 사유"
  - "relay SKIPPED_SETTLED_MESSAGE · deleteUser(dma, admin, { deadlineAt?, skipDisabled? }) — 꺼진 서버는 op 없이 그 서버 의도만 settle(전 행) · deleted = 켜진 서버 전부 ok + 꺼진 서버 settle 성공"
  - "relay DELETE /internal/admin/dma-users/:dma?skipDisabled=1 (값 1 만 참 · 감사 줄 skipDisabled)"
  - "Express DELETE /api/admin/users/:email?skipDisabled=1 → relay 같은 쿼리 · relayAdminClient.deleteDmaUser(dma, admin, { skipDisabled })"
  - "webapp deleteAdminUser(email, { skipDisabled? }) · USER_SHEET_TEXT.disabledServersNote · disabledServerKeysOf · 확인 설명 안내 문장"
  - "webapp chipOfResult 가 warn 의 사유 message 도 싣고 BusyLines 가 「<서버> 미반영: <사유>」 한 줄(data-tone warn)"
  - "역할 세그먼트 useFieldSave releaseOn = user (IN-03 마무리)"
affects: [29-41, 29-gap-closure, 29-verification]

actuals:
  tokens: 7943
  tasks: 3
  commits: 6

plan_head_before: 8059c256caacbaa81329efb9b6f42e44f9044605
plan_head_after: 3fc128ded08439152f8ca2798825cdcca1b7d4da

tech-stack:
  added: []
  patterns:
    - "결과 사유는 relay 가 정본 문장으로 싣고(해요체 상수) Express 는 그대로 · 화면은 칩 title + 한 줄로만 보인다"
    - "위험 정책 전환은 확인 다이얼로그 문장 + 쿼리 플래그 1개(값 1 만 참) — 새 다이얼로그 · 토스트 없이(D-15)"
    - "deleted 판정에서 「꺼진 서버 settle 성공」 을 ok 와 같게 세는 집합(settledDisabled) — 문구 비교로 판정하지 않는다"

key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-34-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-34-task1-red-webapp.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-34-task2-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-34-task2-red-webapp.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-34-task3-red.json
  modified:
    - relay/src/admin/dispatcher.ts
    - relay/src/admin/admin-api.ts
    - relay/tests/admin-dispatcher.test.ts
    - relay/tests/admin-api.test.ts
    - server/src/routes/admin.ts
    - server/src/services/relay-admin-client.ts
    - server/tests/routes/admin-dma.test.ts
    - webapp/src/lib/admin-api.ts
    - webapp/src/lib/__tests__/admin-api.test.ts
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/user-sheet.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/src/components/admin/__tests__/user-sheet.test.tsx

key-decisions:
  - "skipped 사유는 맥락 2개(유저 삭제 · 그 밖 반영) + settle 결과 1개 상수 — #applyServer 는 settleUserOnOk 여부로 삭제 문구를 고른다(비밀번호 변경도 「그 밖 반영」)"
  - "skipDisabled 갈래는 deleteUser 의 fanOut 콜백에서 #applyServer 앞에 둔다 — 꺼진 서버는 pipelines 조회조차 하지 않아 44 가 구조적으로 0건"
  - "꺼진 서버 settle 이 실패하면 그 서버는 종전 삭제 사유(SKIPPED_DISABLED_DELETE_MESSAGE) 그대로 · deleted false — #settle 이 성공 여부를 돌려준다"
  - "쿼리 값은 1 만 참(relay · Express 둘 다) · 거짓이면 dispatcher 옵션에 키조차 없다(종전 요청 · 29-32 M1 단언 불변)"
  - "webapp 은 꺼진 등록 서버가 없으면 deleteAdminUser(email) 1인자 그대로 — 요청 · 문구 종전 보장"
  - "꺼진 등록 서버 판정 = 의도 계좌 servers 의 키 중 개요 servers 에서 enabled true 가 아닌 것(레지스트리에 없는 키 포함 — relay 판정과 같다)"
  - "warn 줄은 「<서버> 미반영: <사유>」 — 사유 문장이 할 일을 이미 말하므로 BUSY 줄의 「— 정리 뒤 …」 꼬리를 붙이지 않는다"

patterns-established:
  - "Admin 결과 칩: err 는 「실패 · BUSY: 원문 — 다음 할 일」, warn 은 사유가 있을 때만 「미반영: 사유」 — 같은 자리 · 톤만 다르다"

requirements-completed: [ADMIN-05, ADMIN-09]

coverage:
  - id: D1
    description: "꺼진 · 없는 등록 서버의 skipped 에 맥락별 사유 — 다시 반영 「사용이 꺼진 서버 — 켜면 「다시 반영」 으로 맞춰요」 · 유저 삭제 「사용이 꺼진 서버 — 켜고 다시 삭제하거나, DB 등록만 지우고 삭제」 · 다른 서버 결과 무변화 · 꺼진 서버 44 0건"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D12 꺼진 서버 skipped 사유 (29-34 WR-04) (3건)"
        status: pass
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D7 skipped(레지스트리에서 꺼짐) · offline(연결 없음 · 87 미수신)은 그 서버만"
        status: pass
    human_judgment: false
  - id: D2
    description: "화면 — skipped + 사유 → warn 칩 「미반영」 title = 사유 · 계좌 영역 아래 「KB121 미반영: <사유>」 한 줄(data-tone warn) · 사유 없는 skipped 는 종전 · 사용자 삭제 결과 칩 · 줄도 같은 함수"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#(29-34 WR-04) skipped + 사유 → warn 칩 「미반영」 title = 사유 · 계좌 영역 아래 「KB121 미반영: <사유>」 한 줄 · 사유 없는 skipped 는 줄 없음"
        status: pass
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-sheet.test.tsx#(29-34 WR-04) 삭제 결과의 꺼진 서버 skipped + 사유 → warn 칩(title = 사유) · 「KB121 미반영: <사유>」 줄"
        status: pass
    human_judgment: false
  - id: D3
    description: "relay 「DB 등록만 지우고 삭제」 — skipDisabled 면 꺼진 서버 44 0건 · settle(전 행) · skipped + SKIPPED_SETTLED_MESSAGE · 켜진 서버 ok 면 deleted true / 켜진 서버 BUSY 면 deleted false(DMA 유저 행 유지) / settle 실패면 종전 사유 · deleted false / 옵션 없으면 종전"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D13 DB 등록만 지우고 삭제 — skipDisabled (29-34 WR-04) (5건)"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#K1 꺼진 KB121 등록 사용자 — 쿼리 없으면 deleted false + 사유 · ?skipDisabled=1 이면 KB121 44 0건 · settle · deleted true · 감사 skipDisabled"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#K2 쿼리 해석 — skipDisabled=1 만 참 · true · 0 · 없음은 dispatcher 옵션에 skipDisabled 키가 없다"
        status: pass
    human_judgment: false
  - id: D4
    description: "Express ?skipDisabled=1 → relay DELETE …?skipDisabled=1 그대로 → deleted 면 app_users 행 삭제 · 그 밖 값은 쿼리 없이"
    requirement: ADMIN-05
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#(29-34 WR-04) ?skipDisabled=1 → relay DELETE …/dma-users/kim01?skipDisabled=1 그대로 → deleted → 행 삭제 · 그 밖 값은 쿼리 없이"
        status: pass
      - kind: integration
        ref: "pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts tests/services/relay-admin-client.test.ts (85/85)"
        status: pass
    human_judgment: false
  - id: D5
    description: "webapp 확인 다이얼로그 — 꺼진 등록 서버가 있으면 「꺼진 서버(KB121)의 등록은 DB 에서만 지워요 — 서버를 켜면 「서버에만 있음」 으로 보여요」 · 확인 → deleteAdminUser(email, { skipDisabled: true }) → ?skipDisabled=1 / 없으면 문구 · 요청 종전"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-sheet.test.tsx#(29-34 WR-04) 꺼진 서버(KB121)에 등록된 사용자 → 확인 설명에 「DB 에서만 지워요」 안내 · 확인 → skipDisabled 요청"
        status: pass
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-sheet.test.tsx#(29-34 WR-04) 꺼진 등록 서버가 없으면 확인 문구 · 요청 종전(skipDisabled 없음)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/admin-api.test.ts#(29-34 WR-04) deleteAdminUser(email, { skipDisabled: true }) → ?skipDisabled=1 · false · 생략은 쿼리 없음"
        status: pass
    human_judgment: false
  - id: D6
    description: "IN-03 — 역할 세그먼트가 저장 성공 뒤 재조회 값을 따른다(재조회 전엔 누른 값 유지)"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-sheet.test.tsx#(29-34 IN-03) 저장 성공 뒤 재조회 값이 정본 — trader → viewer 성공 · 재조회 전 viewer 유지 · 재조회 role admin(다른 Admin) → admin"
        status: pass
    human_judgment: false
  - id: D7
    description: "운영 — 꺼진 서버(KB121 · KYOBO127)를 다시 켰을 때 87 대조가 그 유저를 「서버에만 있음」 으로 보이는 흐름과 실화면 확인 다이얼로그 문장"
    verification: []
    human_judgment: true
    rationale: "실 게이트웨이 · relay/server 배포(29-41 배포 창)가 필요하다. 「서버에만 있음」 표시는 기존 87 파생(D-23 ⑤)이 맡고 이 플랜은 그 전제(꺼진 서버 users.toml 무접촉)만 테스트로 고정했다"

duration: 10min
completed: 2026-10-10
---

# Phase 29 Plan 34: 꺼진 서버 skipped 사유 · 「DB 등록만 지우고 삭제」 · 역할 releaseOn Summary

**relay 가 꺼진 등록 서버의 `skipped` 에 맥락별 사유 문장을 실어 화면 칩 title · 「KB121 미반영: <사유>」 줄이 이유를 보이고, 삭제 확인 다이얼로그가 꺼진 서버를 알린 뒤 `?skipDisabled=1` 로 보내면 relay 는 꺼진 서버에 op 없이 그 서버 의도만 settle 해 켜진 서버가 전부 ok 면 사용자 삭제를 끝내며, 역할 세그먼트는 저장 뒤 재조회 값을 따른다**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-10T14:41:52Z
- **Completed:** 2026-10-10T14:52:14Z
- **Tasks:** 3
- **Files modified:** 18 (소스 6 · 테스트 7 · RED 증거 5)

## Accomplishments

- **WR-04 사유(Task 1 트레이서):** `#applyServer` 가 꺼진 · 없는 서버를 `skipped` + 사유로 돌려준다.
  - 유저 삭제 사유: 「사용이 꺼진 서버 — 켜고 다시 삭제하거나, DB 등록만 지우고 삭제」
  - 그 밖 반영(생성 · 계좌 · 비밀번호 · 다시 반영) 사유: 「사용이 꺼진 서버 — 켜면 「다시 반영」 으로 맞춰요」
  - 화면은 `chipOfResult` 가 warn 의 사유도 칩 `title` 에 싣는다. `BusyLines` 는 BUSY 줄과 같은 자리에 「KB121 미반영: <사유>」 를 warn 톤으로 세운다. 사용자 삭제 결과 칩 · 줄도 같은 함수를 쓰므로 user-sheet 코드 변경은 없었다.
- **WR-04 정책(Task 2):** 「DB 등록만 지우고 삭제」 를 세 층에 세웠다.
  - webapp: 사용자의 등록 서버 중 꺼진 서버(`disabledServerKeysOf`)가 있으면 기존 확인 설명에 「꺼진 서버(KB121)의 등록은 DB 에서만 지워요 — 서버를 켜면 「서버에만 있음」 으로 보여요」 를 더한다. 확인하면 `deleteAdminUser(email, { skipDisabled: true })` 를 보낸다. 새 다이얼로그 · 토스트는 없다.
  - Express: `?skipDisabled=1` 을 relay 에 같은 쿼리로 넘긴다.
  - relay: 꺼진 서버에는 44 를 보내지 않는다. 그 서버 의도 행만 `settle(dma, key, [], true)` 하고 결과는 `skipped` + 「사용이 꺼진 서버 — DB 등록만 지웠어요(켜면 「서버에만 있음」)」 다. 켜진 서버가 전부 ok 이고 꺼진 서버 settle 이 전부 성공하면 `deleted: true` 다.
  - 켜진 서버가 BUSY · timeout · offline 이면 `deleted: false` 이고 DMA 유저 행은 남는다. 29-32 마감 규칙(마감 → deleted false · 늦은 DB 삭제 없음)도 그대로다.
- **IN-03(Task 3):** 역할 `useFieldSave` 에 `releaseOn: user` 를 붙였다. 성공 뒤 첫 재조회부터는 재조회 role 이 정본이다.

## Task Commits

1. **Task 1: 트레이서 — 꺼진 서버 skipped 사유 → 화면 칩 · 줄**
   - RED `9219af55` (test) · GREEN `3ffaaafa` (feat)
   - 트레이서 게이트(interactive · end-of-phase · automated-only): verify 2종을 다시 돌려 green → 확장으로 진행
2. **Task 2: 「DB 등록만 지우고 삭제」 — 확인 → skipDisabled → 꺼진 서버 의도만 settle → deleted** — RED `e2b08b23` (test) · GREEN `63a7b090` (feat)
3. **Task 3: 역할 세그먼트 releaseOn (IN-03)** — RED `3883a9e2` (test) · GREEN `3fc128de` (feat)

REFACTOR 커밋은 없다(정리할 것이 없었다).

**Plan metadata:** 이 SUMMARY 커밋 · STATE/ROADMAP 커밋(최종 보고 참고)

## TDD Gate Compliance

| Task | RED | RED 증거 | GREEN |
|------|-----|---------|-------|
| 1 | `9219af55` | `.red/29-34-task1-red.json` · `-webapp.json` RED_EVIDENCE_OK(junit) | `3ffaaafa` |
| 2 | `e2b08b23` | `.red/29-34-task2-red.json` · `-webapp.json` RED_EVIDENCE_OK(junit) | `63a7b090` |
| 3 | `3883a9e2` | `.red/29-34-task3-red.json` RED_EVIDENCE_OK(junit) | `3fc128de` |

RED 단계별 판정은 다음과 같다.

- **Task 1** — relay target(D12 다시 반영)은 결과 배열 deep-equal 에서 실패했다. 원인은 꺼진 서버를 사유 없는 `{ outcome: "skipped" }` 로 돌려준 것이다. 같은 실행의 상수 · 유저 삭제 케이스와 D7 기대값 갱신도 같은 원인이다. webapp target 은 `toHaveAttribute(title)` 에서 실패했다. 원인은 `chipOfResult` 가 err 일 때만 message 를 실은 것이다.
- **Task 2** — relay target(D13 skipDisabled)은 응답 deep-equal 에서 실패했다(옵션 미구현 → 꺼진 서버 사유 skipped · deleted false). webapp target 은 확인 다이얼로그 `toHaveTextContent` 에서 실패했다. 「settle 실패」 케이스는 종전 동작과 결과가 같아 RED 에서도 통과했다(회귀 가드로 둔다).
- **Task 3** — target 은 재조회 rerender 뒤 admin 라디오의 `aria-checked` 단언(테스트 233행)에서 실패했다. 원인은 releaseOn 이 없어 누른 viewer 를 계속 쥔 것이다. 재조회 전 viewer 유지 단언은 통과했다.
- 다섯 증거 모두 vitest junit 리포터(`--outputFile.junit`)로 모았고 `reportPath` · `runStartedAt` · `reportModifiedAt` 을 기록했다(tap-flat multi-line diff 거부 회피).

## Files Created/Modified

- `relay/src/admin/dispatcher.ts` — 상수 3개, `#applyServer` 사유, `deleteUser` 의 `skipDisabled` 갈래(`settledDisabled` 집합), `#isEnabled`, `#settle` 이 boolean 을 돌려주게 바꿈, 머리 주석.
- `relay/src/admin/admin-api.ts` — `DELETE /dma-users/:dma?skipDisabled=1` 해석(`1` 만 참), `audited` 에 extra(감사 `skipDisabled: true`), 머리 주석 계약 문단.
- `server/src/routes/admin.ts` — `DELETE /users/:email` 단독 DMA 갈래가 쿼리를 relay 로 넘기고 감사에 표시, 머리 주석.
- `server/src/services/relay-admin-client.ts` — `deleteDmaUser(dma, admin, opts?)` → `?skipDisabled=1`.
- `webapp/src/lib/admin-api.ts` — `deleteAdminUser(email, { skipDisabled? })`.
- `webapp/src/components/admin/account-editor.tsx` — `chipOfResult` 의 warn 사유, `skippedLineText`, `BusyLines` 의 warn 줄(`data-tone`), 머리 주석.
- `webapp/src/components/admin/user-sheet.tsx` — `USER_SHEET_TEXT.disabledServersNote`, `disabledServerKeysOf`, 확인 설명 · skipDisabled 요청, 역할 `releaseOn`, 머리 주석.
- 테스트 — dispatcher D12(3) · D13(5) · D7 갱신, relay 라우트 K1 · K2, server 1건, webapp admin-api 1건 · account-editor 1건 · user-sheet 4건.

## Decisions Made

- skipDisabled 갈래는 `#applyServer` 앞(fanOut 콜백)에 둔다. 꺼진 서버는 파이프라인 조회조차 하지 않으므로 「꺼진 서버에 44 금지」 가 구조적으로 성립한다.
- deleted 판정은 문구 비교가 아니라 `settledDisabled` 집합으로 한다. settle 이 실패한 꺼진 서버는 종전 삭제 사유로 남고 deleted false 다.
- 쿼리 값은 `1` 만 참이다(relay · Express 둘 다). 거짓이면 dispatcher 옵션에 키를 넣지 않는다 — 종전 요청 · 29-32 M1 단언이 그대로다.
- 꺼진 등록 서버 판정은 의도 계좌의 등록 서버 키 중 개요 `servers` 에서 `enabled === true` 가 아닌 것이다. 레지스트리에 없는 키도 포함한다(relay `#isEnabled` 와 같은 판정).
- warn 줄에는 BUSY 줄의 「— 정리 뒤 …」 꼬리를 붙이지 않는다. 사유 문장이 할 일을 이미 말한다.
- 확인 문장은 기존 `DialogDescription` 한 문자열 뒤에 붙였다. `aria-describedby` 가 그대로 그 문장을 읽는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GREEN 커밋 타입을 plan 예시 `fix` 대신 `feat` 로**
- **Found during:** Task 1
- **Issue:** plan 의 커밋 예시는 `fix(29-34)` 다. 하지만 TDD 게이트(`tdd.md`)와 오케스트레이터 계약은 GREEN 을 `feat(29-34)` 로 찾는다.
- **Fix:** Task 1 GREEN 을 커밋 직후(push 전) 메시지만 `feat` 로 고쳤다(`3ffaaafa`). Task 2 · 3 GREEN 도 `feat` 로 커밋했다.
- **Verification:** `git log --grep="^feat\(29-34\):"` 3건 · `^test\(29-34\):` 3건

---

**Total deviations:** 1 auto-fixed (Rule 3 ×1)
**Impact on plan:** 커밋 메시지 형식만 바꿨다. 코드 범위 확장은 없다.

## Issues Encountered

- server 테스트 실행은 기대된 502 경로의 pino ERROR 로그를 많이 출력한다(종전과 같음). 판정은 vitest 요약(85/85)으로 했다.
- 개요(`deriveAdminUsersOverview`)의 warn 칩은 종전처럼 message 가 null 이다. 시트가 열려 있는 동안은 응답 결과 칩이 개요 칩보다 앞서므로 사유가 보인다. 재조회 뒤 개요 칩에도 사유를 싣는 것은 shared 파생 변경이라 이 플랜 범위 밖이다(필요하면 후속).

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-04 는 세 층 테스트로 고정했다. 29-32(WR-07)와 함께 진실 9 를 닫는다.
- relay · server 배포와 실서버 확인(꺼진 서버를 켰을 때 「서버에만 있음」 표시)은 29-41 배포 창에서 메인 세션이 한다.
- 열린 인박스 노트 `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(order_ip/order_mac)는 이 플랜 범위 밖이라 손대지 않았다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*

## Self-Check: PASSED

- 커밋 6개(9219af55 · 3ffaaafa · e2b08b23 · 63a7b090 · 3883a9e2 · 3fc128de) HEAD 조상 확인 · evaluation-scope(29-34) resolved
- SUMMARY · RED 증거 5파일 존재 확인
- acceptance: `SKIPPED_DISABLED_DELETE_MESSAGE` 3 · `SKIPPED_DISABLED_RECONCILE_MESSAGE` 2 · `skipDisabled` relay admin-api 6 · server routes 5 · webapp lib 4 · user-sheet `releaseOn` 1
- 플랜 verification: relay admin-dispatcher · admin-api(60/60) · relay admin-* · quote-switch 7파일(128/128) · server admin-dma · relay-admin-client(85/85) · webapp admin 컴포넌트 + admin-api 10파일(124/124) green · relay/server/webapp tsc 0
