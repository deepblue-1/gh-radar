---
phase: 29-dma-multi-server-admin
plan: 11
subsystem: relay
tags: [relay, admin, internal-http, fan-out, dispatcher, zod, aes-gcm, dual-write, audit-log, fake-gateway]
status: complete

requires:
  - phase: 29-04
    provides: "planServerOps · planPasswordOps · shared interpretAdminResult · normalizeAccountNo · isValidAccountNoInput · AdminServerResult · AdminServerLiveStatus"
  - phase: 29-05
    provides: "의도 RPC 7종 + dma_admin_record_results · P0001 업무 거부 코드 규약"
  - phase: 29-06
    provides: "encryptDmaPassword(plain, aad, key) · AppAccess(reload · entryOf · revoked 이벤트 → fanout 결선)"
  - phase: 29-08
    provides: "AdminConn.command() · currentSnapshot() · health() · ServerPipeline.admin · 스텁 게이트웨이 admin 모드(defaultAdminHandler)"
provides:
  - "relay /internal/admin/* 9경로(생성 · 비밀번호 · 계좌 put/remove · 유저 삭제 · 다시 반영 · registry/access reload · servers/status) — 29-23 quote-primary 만 남음"
  - "AdminIntentStore(RPC 1:1 래퍼 · IntentError) · AdminDispatcher(reconcileUser · changePassword · deleteUser)"
  - "createAdminRouter(deps) · AdminApiDeps { store, dispatcher, registry, access, pipelines, credKey, quoteStatus, now? } · maskDmaUserId"
  - "OrderApiDeps.admin?: { router } — 관문 뒤 · 404 앞 마운트"
  - "테스트 대역 tests/helpers/admin-db-fake.ts(AdminDbFake — 29-05 RPC 의미 메모리 대역)"
affects: [29-13, 29-14, 29-21, 29-23, 29-24, 29-25]

actuals:
  tokens: 29032
  tasks: 3
  commits: 3
plan_head_before: 277ccbc88009dddf78182d0a1912a092e4ec7950
plan_head_after: 40dd92cdae4bea8784e89310f3389f8a92bd6f74

tech-stack:
  added: []
  patterns:
    - "서버 간 병렬 · 서버 안 순차 · 첫 실패에서 그 서버만 멈춤 — 결과는 레지스트리 순 배열"
    - "같은 DMA 유저의 반영은 relay 안에서 Promise 꼬리로 줄 세운다(#serial) — 두 Admin 요청의 op 가 한 서버 FIFO 에서 섞이지 않게"
    - "감사 로그의 route 는 경로 패턴 문자열(실경로엔 dmaUserId · 계좌번호가 있다)"
    - "settle · record 실패는 응답을 실패로 바꾸지 않는다 — 서버는 이미 반영됐고 다음 다시 반영이 87 대조로 정리"

key-files:
  created:
    - relay/src/admin/intent-store.ts
    - relay/src/admin/dispatcher.ts
    - relay/src/admin/admin-api.ts
    - relay/tests/admin-api.test.ts
    - relay/tests/admin-dispatcher.test.ts
    - relay/tests/helpers/admin-db-fake.ts
  modified:
    - relay/src/order/order-api.ts
    - relay/src/index.ts

key-decisions:
  - "유저 삭제는 의도 계좌를 전부 removing 으로 보고 planServerOps 로 계획한다 — 87 전용 계좌가 없으면 op 2, 있으면 의도 계좌 op 4 만(유저 · 87 전용 계좌 유지 · D-23 ⑤ 금지가 플랜 문장 「서버마다 op 2」 보다 우선)"
  - "유저 삭제의 settle 은 그 서버가 끝까지 ok 일 때만 p_user_removed=true — DB 등록 행이 active 라 removing 전용 settle 이 닿지 않기 때문. 중간 실패면 아무것도 지우지 않고 다음 삭제가 87 대조로 남은 것만 보낸다"
  - "비밀번호 변경 · 다시 반영 · 삭제 모두 대상 서버 = DB 등록 서버(의도 행)뿐 — 87 에만 그 유저가 있는 서버에는 보내지 않는다"
  - "dual-write 대상 = 옛 dma_credentials 에서 dma_user_id 가 같은 행 중 접근 맵 entryOf(user_id).dmaUserId 가 지금도 같은 웹 사용자만. AppAccess 에 새 메서드 없이 끝냈다"
  - "op 1 비밀번호를 꺼내지 못하면(행 없음 · 옛 AAD · 변조) 그 서버는 failed + 「저장된 비밀번호를 읽지 못했습니다 — 비밀번호를 다시 설정하세요」 — 틀린 비밀번호를 서버에 싣지 않는다"
  - "x-admin-email 누락 400 코드 = ADMIN_EMAIL_REQUIRED · 레지스트리에 없는 서버 키 = 400 VALIDATION_FAILED(FK 500 이 되기 전) · IntentError INTERNAL = 500"
  - "DELETE /dma-users/:dma 응답 = { results, deleted } — deleted=false 면 일부 서버 실패로 DB 삭제 보류. 성공 뒤 access.reload() 1회(D-04 — 연결이 사라진 웹 사용자 wss 회수)"
  - "access/reload 의 changed = 이번 재적재로 회수된 사용자가 있었는가(AppAccess 는 회수 외 변화를 알려 주지 않는다)"
  - "servers/status: conn = 저널 · admin 어느 쪽이든 TCP 를 맺었는가(둘 다 disabled 면 off) · journal live/replaying=ok · admin ready=ok, connecting/logging_in=connecting · quote 는 quoteStatus.serverKey() 와 같은 서버만(부팅 때 시세 주 서버 고정)"
  - "dmaUserId 마스킹 = 앞 2자 + *** + (길이) — 2자 이하는 앞자리도 싣지 않는다"

patterns-established:
  - "relay Admin 경로 오류 = order-api errorHandler 한 벌 — 라우터 끝 매퍼가 ZodError → 400 VALIDATION_FAILED, IntentError → 409(INTERNAL 500)로 바꿔 넘긴다"

requirements-completed: [ADMIN-05, ADMIN-08, ADMIN-11]

coverage:
  - id: D1
    description: "트레이서 — POST /internal/admin/dma-users → zod · 정규화 · KB 5/6 · 교보 빈 값 → AAD dmaUserId 암호화 → 생성 RPC → 서버 2대 op 1 → 86 → 서버별 결과 배열 · record 1회 · DMA_USER_EXISTS 409"
    requirement: ADMIN-05
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#트레이서 T1~T4 (실 http.Server + 실 AdminConn ↔ 가짜 게이트웨이 2대)"
        status: pass
    human_judgment: false
  - id: D2
    description: "변경 경로 — 계좌 서버 교체(op 3/op 1 · op 4/op 2 → settle) · op 4 code 8 ok / 9 failed · 87 전용 계좌 보호 · LAST_ACCOUNT · 유저 삭제 부분 실패 · 비밀번호 dual-write · 다시 반영 무변경 · timeout/offline/skipped"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts (14건 · 실 planner · FakeConn = defaultAdminHandler)"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#변경 경로 P1~P6"
        status: pass
    human_judgment: false
  - id: D3
    description: "운영 보조 — registry/access reload { ok, changed } · 502 RELOAD_FAILED · 실 AppAccess revoked 이벤트 · servers/status 칩 · 감사 로그(원문 없음) · 삭제 뒤 접근 맵 재적재"
    requirement: ADMIN-11
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#운영 보조 S1~S4"
        status: pass
    human_judgment: false
  - id: D4
    description: "관문 뒤 마운트 · 401 회귀 · relay 전체 회귀 · index 결선 부팅"
    requirement: ADMIN-08
    verification:
      - kind: integration
        ref: "relay/tests/order-api.test.ts · relay/tests/journal-boot.test.ts · pnpm --filter @gh-radar/relay run test (44 files · 1162 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Express(29-13) 프록시와의 실제 왕복 · 운영 relay 배포 뒤 실서버(gh-trade role 2) 반영"
    verification: []
    human_judgment: true
    rationale: "Express 프록시는 29-13, 배포는 29-25 빅뱅 — 이 플랜은 계약과 동작을 스텁 게이트웨이 · 메모리 RPC 로만 증명했다"

duration: 11min
completed: 2026-10-07
---

# Phase 29 Plan 11: relay Admin 내부 HTTP · 서버별 fan-out 디스패처 Summary

**`/internal/admin/*` 9경로가 공유 비밀 관문 뒤에서 Admin 변경을 받는다. 처리 순서는 비밀번호 암호화(AAD = dmaUserId) → 의도 RPC → 서버마다 병렬 `planServerOps` → admin 연결 `command()` → 86 해석 → settle → 서버별 결과 배열 · 결과 기록이다. 부분 실패는 그 서버 결과에만 남고, 87 에만 있는 계좌 · 유저에는 어떤 op 도 가지 않는다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-10-06T16:43:26Z
- **Completed:** 2026-10-06T16:54:15Z
- **Tasks:** 3 (트레이서 1 · TDD 2)
- **Files:** 신규 6 · 수정 2

## Accomplishments

- **트레이서(Task 1):** `POST /internal/admin/dma-users` 하나로 HTTP → zod → 암호화 → `dma_admin_create_dma_user` → 스텁 게이트웨이 2대(KB120 · KB121)에 op 1 각 1건 → 86 → `{ results: [{ server, outcome: "ok", usersRev: "2" }, …] }` → `dma_admin_record_results` 1회까지 이어진다. 트레이서 `<verify>` 를 한 번 더 돌려 통과를 확인한 뒤 확장했다.
- **변경 경로(Task 2):** 비밀번호 변경은 암호문을 교체하고 옛 표에 dual-write 한 뒤, 87 에 그 유저가 있는 서버에만 op 1(비밀번호만)을 보낸다. 계좌 put/remove 는 removing → op 4/op 2 → settle 순서다. 유저 삭제는 전 서버가 ok 일 때만 DB 에서 지운다. 「다시 반영」 은 의도와 87 이 같으면 44 를 하나도 보내지 않는다.
- **운영 보조(Task 3):** 레지스트리 · 접근 맵을 즉시 재적재하는 경로, 서버 카드 칩용 상태 조회, 감사 로그 1줄을 더했다. 유저 삭제 뒤에는 접근 맵을 재적재해 그 웹 사용자의 wss 를 회수한다(D-04).

## relay 내부 HTTP 계약 (확정본 — Express 29-13 이 1:1 프록시)

공통 조건: 모든 경로가 `X-Relay-Secret` 관문 뒤에 있다(없으면 401 `UNAUTHORIZED_RELAY`). `x-admin-email` 이 없으면 400 `ADMIN_EMAIL_REQUIRED`, 바디는 16kb 까지다. 검증 실패는 400 `VALIDATION_FAILED`, 업무 거부는 409 `{ error: { code, message } }` 다.

| 메서드 · 경로 | 바디 | 성공 응답 | 거부 |
|---|---|---|---|
| POST `/internal/admin/dma-users` | `{ email, dmaUserId, password, account, servers }` | 200 `{ results }` | 400 · 409 `NO_APP_USER` · `DMA_USER_EXISTS` · `SERVER_BROKER_MISMATCH` · `NO_SERVERS` |
| POST `/internal/admin/dma-users/:dma/password` | `{ password }` | 200 `{ results }` | 400 · 409 `NO_DMA_USER` |
| PUT `/internal/admin/dma-users/:dma/accounts` | `{ account, servers }` | 200 `{ results }` | 400 · 409 `NO_DMA_USER` · `SERVER_BROKER_MISMATCH` · `NO_SERVERS` |
| DELETE `/internal/admin/dma-users/:dma/accounts/:broker/:accountNo` | — | 200 `{ results }` | 400 · 409 `NO_SUCH_ACCOUNT` · `LAST_ACCOUNT` |
| DELETE `/internal/admin/dma-users/:dma` | — | 200 `{ results, deleted }` | 400 · 409 `NO_DMA_USER` |
| POST `/internal/admin/dma-users/:dma/reconcile` | — | 200 `{ results }` | 400 |
| POST `/internal/admin/registry/reload` | — | 200 `{ ok: true, changed }` | 502 `RELOAD_FAILED`(직전 레지스트리 유지) |
| POST `/internal/admin/access/reload` | — | 200 `{ ok: true, changed }` | 502 `RELOAD_FAILED`(직전 접근 맵 유지) |
| GET `/internal/admin/servers/status` | — | 200 `{ servers: { [key]: { conn, journal, admin, quote } } }` | — |
| POST `/internal/admin/servers/:key/quote-primary` | — | 29-23 이 더한다 | — |

입력 규칙:
- `dmaUserId` · `:dma` 는 1~8바이트(UTF-8)이고 공백을 넣을 수 없다. 경로 값은 Express 5 가 디코딩하므로 다시 풀지 않는다.
- `account` = `{ broker: KB|KYOBO, accountNo, name?, branchNo?, traderId?, priority? }`. 계좌번호는 trim 뒤 1~12자여야 하고(넘으면 자르지 않고 거부) 정규화된다(" 00123" → "123"). KB 는 branch 5자 · trader 6자, KYOBO 는 저장 전에 둘 다 빈 값으로 바뀐다.
- `servers` 는 1~32개이고 `SERVER_KEY_RE` 형식이어야 한다. 중복은 제거하고, 레지스트리에 없는 키는 400 이다.
- `AdminServerResult.outcome`: `ok`(+usersRev) · `failed`(+code · 서버 한국어 message 원문 · usersRev) · `timeout` · `offline`(admin 연결 없음 · 87 미수신) · `skipped`(레지스트리에서 꺼짐 · 없음).

## 감사 로그 예시 (마스킹)

```json
{"admin":"boss@gmail.com","route":"POST /dma-users","dma":"tr***(8)","servers":[{"server":"KB120","outcome":"ok"},{"server":"KB121","outcome":"ok"}],"message":"[admin-audit] Admin 변경 요청"}
{"admin":"boss@gmail.com","route":"DELETE /dma-users/:dma/accounts/:broker/:accountNo","dma":"tr***(8)","rejected":"LAST_ACCOUNT","message":"[admin-audit] Admin 변경 요청"}
{"admin":"boss@gmail.com","route":"DELETE /dma-users/:dma","dma":"tr***(8)","servers":[{"server":"KB120","outcome":"ok"},{"server":"KB121","outcome":"failed","code":9}],"message":"[admin-audit] Admin 변경 요청"}
{"admin":"boss@gmail.com","route":"POST /registry/reload","ok":true,"changed":true,"message":"[admin-audit] Admin 변경 요청"}
```

감사 로그에는 비밀번호 · 계좌번호 원문 · dmaUserId 원문 · 서버 message 를 싣지 않는다. S4 테스트가 로그 캡처 전체를 문자열로 바꿔 원문이 없음을 확인한다.

## Task Commits

1. **Task 1: 트레이서 — POST /internal/admin/dma-users → 서버별 op 1 → 결과 배열** — `b2992764` (feat)
2. **Task 2: 변경 경로 — 비밀번호 dual-write · 계좌 removing → op 4 · 유저 op 2 · 다시 반영 · 부분 실패** — `ac1a1e45` (feat)
3. **Task 3: 보조 라우트 — 레지스트리 · 접근 맵 재적재 · 서버 상태 · 감사 로그** — `40dd92cd` (feat)

플랜 지시대로 태스크마다 커밋 1개만 만들었다(test 커밋 분리 없음). TDD 관측:
- Task 2 RED: `admin-dispatcher.test.ts` 를 먼저 쓰고 돌리자 `deleteUser` · `changePassword` 5건이 실패했다. reconcile 9건은 Task 1 에서 이미 일반형으로 구현돼 있어 처음부터 통과했다. 경로별 API 테스트 6건은 라우트를 만든 뒤에 썼기 때문에 RED 관측이 없다.
- Task 3 RED: S1~S4 6건을 먼저 쓰고 돌려 6건 실패(경로 404)를 확인한 뒤 GREEN 으로 갔다.

## Files Created/Modified

- `relay/src/admin/intent-store.ts` — 29-05 RPC 1:1 래퍼, P0001 → `IntentError`, `dma_users` 암호문 조회, 옛 `dma_credentials` dual-write 2종
- `relay/src/admin/dispatcher.ts` — `reconcileUser` · `changePassword` · `deleteUser`. 서버별 병렬 · 순차 op · settle · 결과 기록 · 유저별 직렬화를 맡는다
- `relay/src/admin/admin-api.ts` — `createAdminRouter`(9경로 · zod · 감사 로그 · 서버 상태 칩) · `maskDmaUserId`
- `relay/src/order/order-api.ts` — `OrderApiDeps.admin?` · 관문 뒤 · 404 앞 마운트 · 머리 주석 갱신
- `relay/src/index.ts` — store · dispatcher · router 생성, registry · access · pipelines · quoteStatus 결선
- `relay/tests/admin-api.test.ts` — 실 HTTP + 실 AdminConn ↔ 스텁 게이트웨이 2대 · 17건
- `relay/tests/admin-dispatcher.test.ts` — 실 planner + FakeConn(defaultAdminHandler) · 14건
- `relay/tests/helpers/admin-db-fake.ts` — 29-05 RPC 의미를 옮긴 메모리 대역

## Decisions Made

frontmatter `key-decisions` 와 같다. 플랜이 정하지 않은 응답 모양 · 코드는 Express(29-10 클라이언트 · 29-13 플랜)가 바로 쓸 수 있게 정했다. `deleted` 필드 · `ADMIN_EMAIL_REQUIRED` · 상태 칩 매핑이 여기에 해당한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 정합성] 유저 삭제는 무조건 op 2 가 아니라 planner 판정을 따른다**
- **Found during:** Task 2
- **Issue:** 플랜 문장은 「DB 등록 서버마다 op 2」 다. 그런데 그 서버의 87 에 의도에 없는 계좌(WinForms 전용 등)가 있으면 op 2 가 그 계좌까지 지운다. 이는 플랜의 금지 조항(「87 에만 있는 계좌 · 유저를 지우는 op 를 보내지 않는다」 · D-23 ⑤)과 충돌한다.
- **Fix:** 의도 계좌를 전부 removing 으로 보고 `planServerOps` 로 계획한다. 87 전용 계좌가 없으면 op 2, 있으면 의도 계좌만 op 4 로 보내고 유저와 87 전용 계좌는 남긴다.
- **Files modified:** relay/src/admin/dispatcher.ts
- **Verification:** admin-dispatcher D4 「87 에만 있는 계좌가 있는 서버는 op 2 대신 의도 계좌 op 4 만」
- **Committed in:** ac1a1e45

**2. [Rule 1 - 버그] 유저 삭제 settle 이 DB 행을 지우지 못하던 문제**
- **Found during:** Task 2 (GREEN 중 D4 실패)
- **Issue:** 삭제 계획의 removing 은 메모리에서만 표시한 값이고 DB 등록 행은 active 다. 그래서 `p_user_removed=false` settle(removing 행만 삭제)은 아무 행도 지우지 못한다. 결과적으로 `SERVERS_REMAIN` 이 영구히 나고, 재시도해도 풀리지 않는다.
- **Fix:** 삭제 모드에서는 서버가 끝까지 ok 일 때만 `p_user_removed=true` 로 그 서버 행 전부를 settle 한다. 중간에 실패하면 아무것도 지우지 않는다.
- **Files modified:** relay/src/admin/dispatcher.ts
- **Verification:** D4 3건 green
- **Committed in:** ac1a1e45

**3. [Rule 2 - 정합성] 유저 삭제 뒤 접근 맵 즉시 재적재(D-04)**
- **Found during:** Task 3
- **Issue:** DMA 유저가 지워지면 `app_users.dma_user_id` 가 NULL 이 된다. 그런데 relay 접근 맵은 최대 60초 동안 옛 연결을 유지해, 그동안 해당 웹 사용자의 wss 가 열려 있다.
- **Fix:** `deleted` 가 true 이면 `access.reload()` 를 1회 호출한다. 회수된 사용자는 기존 `revoked → fanout.revokeUser` 결선으로 끊긴다.
- **Files modified:** relay/src/admin/admin-api.ts
- **Verification:** S4 `reloads === 1`
- **Committed in:** 40dd92cd

**4. [Rule 3 - 테스트 도구] `tests/helpers/admin-db-fake.ts` 신규(files_modified 밖)**
- **Found during:** Task 1
- **Issue:** 플랜은 「스텁 Supabase 목 RPC」 를 요구한다. 하지만 기존 `supabase-stub.ts` 는 부팅 경로 전용이라 29-05 의도 RPC 의 의미(LAST_ACCOUNT · removing · settle)를 흉내 내지 못한다.
- **Fix:** 29-05 SQL 의미를 그대로 옮긴 메모리 대역 `AdminDbFake` 를 만들었다. 실 `AdminIntentStore` 가 이 대역을 거쳐 RPC 를 부르므로, 인자 모양도 함께 검증된다.
- **Files modified:** relay/tests/helpers/admin-db-fake.ts
- **Committed in:** b2992764

---

**Total deviations:** 4 auto-fixed (정합성 2 · 버그 1 · 테스트 도구 1)
**Impact on plan:** 계약 표와 경로 수는 플랜 그대로다. 1번은 플랜 문장보다 플랜 금지 조항을 우선했다.

## Issues Encountered

None

## Known Stubs

없음.

## User Setup Required

None. 운영 relay 재배포는 29-25 빅뱅 배포 몫이다.

## Next Phase Readiness

- **29-13(Express 프록시):** 위 계약 표를 1:1 로 부르면 된다. 409 는 그대로 넘기고, `status 0` · 5xx 는 502 `RELAY_FAILED` 로 바꾼다. 삭제 응답의 `deleted=false` 는 「일부 서버 실패로 보류」 라는 뜻이다. `servers/status` 응답은 `deriveAdminServersOverview(raw, live.servers)` 의 live 입력으로 쓴다.
- **29-14(87 적재):** dispatcher 는 87 을 DB 에 쓰지 않는다. 칩의 반영 상태는 29-14 가 `admin.on("snapshot")` 으로 `dma_admin_apply_snapshot` 에 적재해야 맞춰진다.
- **29-21:** 비밀번호를 바꿔도 열린 세션의 비밀은 그대로다(D-08). 세션 비밀 교체는 29-21 이 맡는다.
- **29-23:** `POST /internal/admin/servers/:key/quote-primary` 를 같은 라우터에 추가한다. `quoteStatus.serverKey()` 는 지금 부팅 때 값으로 고정돼 있으므로, 전환이 생기면 그 원천을 갈아 끼워야 한다.

## Self-Check: PASSED

- FOUND: relay/src/admin/intent-store.ts · relay/src/admin/dispatcher.ts · relay/src/admin/admin-api.ts · relay/tests/admin-api.test.ts · relay/tests/admin-dispatcher.test.ts · relay/tests/helpers/admin-db-fake.ts
- FOUND commits(HEAD 조상): b2992764 · ac1a1e45 · 40dd92cd
- 인수 기준: createAdminRouter 1 · order-api `/internal/admin` 4 · normalizeAccountNo 2+ · encryptDmaPassword 2+ · settleServer 2 · dma_credentials 2 · LAST_ACCOUNT 6 · 보조 경로 grep 5. relay 전체 44 files · 1162 tests green, typecheck · typecheck:tests green.
- 보안검사: `security_enforcement: false` — 생략. spec-less probe: 건너뜀(29-01 과 같음).

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*
