---
phase: 29-dma-multi-server-admin
plan: 10
subsystem: api
tags: [express, supabase, zod, axios, pino, admin, relay-internal-http, supertest]

requires:
  - phase: 29-dma-multi-server-admin
    provides: "29-04 shared 계약 — AdminUsersRaw · AdminUsersOverview · deriveAdminUsersOverview · AppRole"
  - phase: 29-dma-multi-server-admin
    provides: "29-05 RPC admin_users_raw()(service_role 전용 · 7키 jsonb) · 29-01 app_users(email PK · role · dma_user_id)"
provides:
  - "requireAdmin() — app_users role admin 판정(이메일 소문자 · trim) · req.userEmail(requireAuth) · req.adminEmail"
  - "adminRouter: GET /api/admin/users(RPC 1회 → shared 파생) · POST /users · PATCH /users/:email · DELETE /users/:email"
  - "zod 스키마 AdminUserUpsertBody · AdminRolePatchBody · adminEmailParam · AppRoleSchema"
  - "relay-admin-client: assertRelayUrl(사설 대역 가드 복원) · createRelayAdminClient{request · reloadAccess · reloadRegistry} · RelayAdminClient"
  - "requireRelayAdmin(req) — relay 의존 라우트(29-13)용 503 RELAY_UNAVAILABLE 관문"
  - "config relayInternalUrl · relayOrderSecret · relayAdminTimeoutMs(env RELAY_INTERNAL_URL · RELAY_ORDER_SECRET · RELAY_ADMIN_TIMEOUT_MS)"
  - "logger redact *.password · req.body.password · req.headers[\"x-relay-secret\"] · loggerOptions()"
affects: [29-11, 29-12, 29-13, 29-14, 29-26]

actuals:
  tokens: 17418
  tasks: 2
  commits: 2
plan_head_before: e244de5294d2521610cb98c2d46c84b265d34b6f
plan_head_after: dcee36c45e0b4aeedf969eec479e1393f4ffbdde

tech-stack:
  added: []
  patterns:
    - "Admin 라우터는 router.use(requireAuth(), requireAdmin()) 한 번 — 개별 라우트에 관문을 다시 걸지 않는다"
    - "relay 내부 HTTP 응답은 { status, data } — validateStatus 무조건 통과, 네트워크 오류 · 타임아웃은 status 0(throw 없음)"
    - "허용/역할 쓰기 = Express 가 DB 직접 쓰기 → relay access reload best-effort(relayNotified) — 실패해도 200"
    - "조건부 삭제는 조건을 DELETE 문장에 건다(.is('dma_user_id', null)) — 0행일 때만 원인 조회 1회"

key-files:
  created:
    - server/src/middleware/require-admin.ts
    - server/src/routes/admin.ts
    - server/src/schemas/admin.ts
    - server/src/services/relay-admin-client.ts
    - server/tests/fixtures/admin-supabase.ts
    - server/tests/middleware/require-admin.test.ts
    - server/tests/routes/admin.test.ts
    - server/tests/services/relay-admin-client.test.ts
  modified:
    - server/src/types/express.d.ts
    - server/src/middleware/require-auth.ts
    - server/src/app.ts
    - server/src/server.ts
    - server/src/config.ts
    - server/src/logger.ts

key-decisions:
  - "POST /users 도 자기 보호 적용 — 본인 이메일을 admin 아닌 역할로 upsert 하면 409 SELF_LOCKOUT(PATCH 와 같은 강등 경로라서)"
  - "DELETE 없는 이메일은 404 NOT_FOUND(PATCH 와 대칭) · DMA 없음 조건은 DELETE 문장 자체에 걸어 조회-삭제 경합 제거"
  - "relay 클라이언트 경로는 /internal/admin/ 아래만 · 요청자 이메일 빈 값이면 throw — 공유 비밀을 다른 내부 경로로 보내지 않는다"
  - "RELAY_ADMIN_TIMEOUT_MS 는 양의 정수만 — 아니면 12000(NaN 이 axios 에 들어가 무제한 대기가 되지 않게)"
  - "경로 :email 은 Express 5 가 이미 퍼센트 디코딩 — 스키마에서 다시 decode 하지 않는다(이중 디코딩 방지)"

patterns-established:
  - "Admin 오류 코드: FORBIDDEN 403 · SELF_LOCKOUT 409 · HAS_DMA 409 · NOT_FOUND 404 · RELAY_UNAVAILABLE 503 · DB_ERROR 500 · VALIDATION_FAILED 400 — 응답 { error: { code, message } }"
  - "감사 로그 1줄: [admin] admin=<요청자> op=<upsert|role|delete> target=<이메일>"

requirements-completed: [ADMIN-02, ADMIN-08]

coverage:
  - id: D1
    description: "requireAdmin — 미인증 401 · 승인 대기/trader/이메일 없는 토큰 403 FORBIDDEN · 대문자 이메일 admin 통과 · 조회 오류 500 DB_ERROR"
    requirement: "ADMIN-08"
    verification:
      - kind: integration
        ref: "server/tests/middleware/require-admin.test.ts#requireAdmin"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/admin/users — RPC admin_users_raw 1회 → shared deriveAdminUsersOverview 결과 그대로 · RPC 오류/계약 위반 500"
    requirement: "ADMIN-08"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin.test.ts#GET /api/admin/users"
        status: pass
    human_judgment: false
  - id: D3
    description: "허용/역할 쓰기 POST · PATCH · DELETE — 정규화 · 400/404/409(SELF_LOCKOUT · HAS_DMA) · upsert/update/조건부 delete"
    requirement: "ADMIN-02"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin.test.ts#POST/PATCH/DELETE /api/admin/users"
        status: pass
    human_judgment: false
  - id: D4
    description: "relay 통보 best-effort — 클라이언트 없음/타임아웃/500 → 200 relayNotified false + warn(비밀 없음), 실제 클라이언트로 x-admin-email · X-Relay-Secret 확인"
    requirement: "ADMIN-02"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin.test.ts#relay 통보 — best-effort"
        status: pass
    human_judgment: false
  - id: D5
    description: "relay-admin-client — 사설 대역 가드 표 · 헤더 · 타임아웃 · status 0 · 경로 제한"
    verification:
      - kind: integration
        ref: "server/tests/services/relay-admin-client.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "pino redact — 요청 바디 password · x-relay-secret 헤더 · 중첩 password 가 [REDACTED]"
    verification:
      - kind: unit
        ref: "server/tests/routes/admin.test.ts#로그 위생 (RESEARCH Pitfall 13)"
        status: pass
    human_judgment: false
  - id: D7
    description: "실 relay(29-11 /internal/admin/access/reload)와의 왕복 · 실제 Cloud Run 환경 결선"
    verification: []
    human_judgment: true
    rationale: "relay 쪽 라우트는 29-11 이 만들고 server 재배포는 29-26 이 한다 — 이 플랜에서는 계약(경로 · 헤더 · 응답 모양)만 로컬 가짜 relay 로 맞췄다"

duration: 7min
completed: 2026-10-07
status: complete
---

# Phase 29 Plan 10: Express Admin 트레이서 · 허용/역할 쓰기 · relay 클라이언트 Summary

**Express 에 admin 역할 관문(requireAdmin → app_users 1회 조회)과 /api/admin/users 읽기(RPC 1회 → shared 파생) · 쓰기(upsert · 역할 · DMA 없는 사용자 삭제 + 자기 보호)를 세우고, 16-16 에서 지운 relay 내부 HTTP 클라이언트를 사설 대역 가드 무변경으로 Admin 전용으로 복원해 쓰기 뒤 access reload 를 best-effort 로 통보한다**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-06T16:29:56Z
- **Completed:** 2026-10-06T16:37:29Z
- **Tasks:** 2
- **Files modified:** 14 (신규 8 · 수정 6)

## Accomplishments

- `requireAdmin()` — `requireAuth` 가 싣는 `req.userEmail` 을 소문자 · trim 으로 정규화해 `app_users` 를 service role 로 1회 조회, admin 만 통과(`req.adminEmail`). 조회 오류는 403 으로 위장하지 않고 500 `DB_ERROR`.
- `GET /api/admin/users` — RPC `admin_users_raw` 1회 → `deriveAdminUsersOverview` 그대로. 테스트가 응답을 shared 파생 결과와 직접 비교해 「server 는 파생 한 번만」 을 잠근다.
- 허용/역할 쓰기 3종 + 자기 보호 + relay best-effort 통보(`relayNotified`) + 감사 로그 1줄.
- `relay-admin-client.ts` — 이력 `b93681b6^:server/src/services/relay-client.ts` 의 `SUBNET_PREFIX` · `isRelaySubnetHost` · `isLoopbackHost` · `assertRelayUrl` 본문 무변경 복원, `X-Relay-Secret` · `x-admin-email` · 타임아웃 · `{ status: 0 }` 계약. `server.ts` 는 두 env 가 다 있을 때만 만들고 가드 실패는 부팅 throw.
- pino redact 에 비밀번호 · relay 공유 비밀 경로 추가.

## 라우트 표

| 메서드 · 경로 | 바디 | 성공 | 거부 |
|---|---|---|---|
| GET `/api/admin/users` | — | 200 `AdminUsersOverview`(users · pending · serverOnly · servers) | 401 · 403 · 500 `DB_ERROR` |
| POST `/api/admin/users` | `{ email, role }` | 200 `{ ok: true, relayNotified }` | 400 `VALIDATION_FAILED` · 409 `SELF_LOCKOUT` · 500 |
| PATCH `/api/admin/users/:email` | `{ role }` | 200 `{ ok: true, relayNotified }` | 400 · 404 `NOT_FOUND` · 409 `SELF_LOCKOUT` · 500 |
| DELETE `/api/admin/users/:email` | — | 200 `{ ok: true, relayNotified }` | 400 · 404 `NOT_FOUND` · 409 `SELF_LOCKOUT` · 409 `HAS_DMA` · 500 |

모든 라우트: `requireAuth()` → `requireAdmin()`(라우터 단위). 쓰기 성공 뒤 relay `POST /internal/admin/access/reload`(헤더 `X-Relay-Secret` · `x-admin-email` = 요청자) — 실패해도 200 · `relayNotified: false`.

## 오류 코드 표

| 코드 | HTTP | 문구 | 언제 |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | 로그인이 필요합니다. / 세션이 만료되었습니다. | 토큰 없음 · 무효 (기존 requireAuth) |
| `FORBIDDEN` | 403 | 관리자만 사용할 수 있어요. | 이메일 없음 · 표에 없음 · trader · viewer |
| `VALIDATION_FAILED` | 400 | `<path>: <zod message>` | 역할 enum · 이메일 형식 · ≤ 254 · 빈 body |
| `NOT_FOUND` | 404 | 허용 목록에 없는 사용자예요. | PATCH/DELETE 대상 행 없음 |
| `SELF_LOCKOUT` | 409 | 본인의 관리자 권한은 내리거나 지울 수 없어요. | 본인 admin 강등(POST · PATCH) · 본인 삭제 |
| `HAS_DMA` | 409 | DMA 연결이 있는 사용자는 DMA 삭제 경로로 지워야 해요. | DELETE 대상에 `dma_user_id` 있음(29-13 이 relay 경로로 대체) |
| `RELAY_UNAVAILABLE` | 503 | relay 연결이 설정되지 않아 처리할 수 없어요. | `requireRelayAdmin(req)` — 클라이언트 없음(29-13 DMA 프록시용) |
| `DB_ERROR` | 500 | 고정 문구(원문은 warn 로그 cause 에만) | RPC · app_users 질의 오류 · RPC 계약 위반 |

## Task Commits

1. **Task 1: 트레이서 — requireAdmin → GET /api/admin/users → admin_users_raw → deriveAdminUsersOverview** - `605b3b64` (feat)
2. **Task 2: 허용/역할 쓰기 · 자기 보호 · relay 클라이언트 복원 · 즉시 반영 통보 · 로그 redact** - `dcee36c4` (feat)

트레이서 게이트: Task 1 `<verify>`(automated 전용) 재실행 green → 확장. Task 2(tdd) 는 테스트를 먼저 써서 RED(모듈 없음으로 2파일 실패) 확인 뒤 구현 → GREEN, 플랜 지시대로 한 커밋.

## Files Created/Modified

- `server/src/middleware/require-admin.ts` — admin 역할 관문
- `server/src/routes/admin.ts` — adminRouter(GET/POST/PATCH/DELETE) · `requireRelayAdmin` · `notifyAccess` · 감사 로그
- `server/src/schemas/admin.ts` — zod 입력 스키마(이메일 정규화)
- `server/src/services/relay-admin-client.ts` — 사설 대역 가드 · axios 팩토리
- `server/src/types/express.d.ts` · `server/src/middleware/require-auth.ts` — `req.userEmail` · `req.adminEmail`
- `server/src/app.ts` — `/api/admin` 결선 · `AppDeps.relayAdmin` → `app.locals.relayAdmin`
- `server/src/server.ts` · `server/src/config.ts` — env 3종 · 조건부 클라이언트 생성
- `server/src/logger.ts` — `loggerOptions()` 분리 · redact 3경로
- `server/tests/fixtures/admin-supabase.ts` — app_users 메모리 표 · rpc 목 (두 테스트 파일 공유)
- `server/tests/middleware/require-admin.test.ts` · `server/tests/routes/admin.test.ts` · `server/tests/services/relay-admin-client.test.ts`

## Decisions Made

frontmatter `key-decisions` 참조. 요지: 자기 보호를 POST 에도 적용, DELETE 의 DMA 없음 조건을 삭제 문장에 걸어 경합 제거, relay 경로를 `/internal/admin/` 로 제한.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] POST /users 자기 강등 차단**
- **Found during:** Task 2
- **Issue:** 플랜은 SELF_LOCKOUT 을 PATCH · DELETE 에만 적었지만, POST upsert 로 본인 이메일을 trader 로 보내면 같은 강등이 일어나 Admin 이 스스로 잠긴다.
- **Fix:** POST 에도 `email === req.adminEmail && role !== "admin"` → 409 `SELF_LOCKOUT`.
- **Files modified:** server/src/routes/admin.ts · server/tests/routes/admin.test.ts
- **Commit:** dcee36c4

**2. [Rule 2 - Missing Critical] relay 클라이언트 경로 · 요청자 이메일 가드**
- **Found during:** Task 2
- **Issue:** `request()` 가 임의 경로를 받으면 같은 공유 비밀로 relay 의 다른 내부 경로(`/internal/orders` 등)를 부를 수 있고, 빈 이메일은 relay 에서 400 이 된다.
- **Fix:** 경로 `/internal/admin/` 접두 · `adminEmail` 비어 있으면 throw(프로그래밍 오류 — 네트워크 실패와 구분).
- **Files modified:** server/src/services/relay-admin-client.ts · 테스트
- **Commit:** dcee36c4

**3. [Rule 3 - Blocking] 테스트 목 공유 파일 + `loggerOptions()` 분리**
- **Found during:** Task 1 · Task 2
- **Issue:** require-admin · admin 라우트 테스트가 같은 app_users 메모리 목을 필요로 했고, redact 검증은 모듈 레벨 `logger` 의 출력 대상을 바꿀 수 없었다.
- **Fix:** `server/tests/fixtures/admin-supabase.ts`(files_modified 밖 테스트 픽스처) 신설, `logger.ts` 의 옵션을 `loggerOptions()` 로 빼 테스트가 같은 옵션 + 메모리 스트림으로 pino 를 만든다(`logger` 동작 불변).
- **Files modified:** server/tests/fixtures/admin-supabase.ts · server/src/logger.ts
- **Commit:** 605b3b64 · dcee36c4

---

**Total deviations:** 3 auto-fixed (Rule 2 ×2, Rule 3 ×1)
**Impact on plan:** 보안 · 정확성 보강과 테스트 인프라 분리. 범위 확장 없음.

## Issues Encountered

None.

## User Setup Required

None — env `RELAY_INTERNAL_URL` · `RELAY_ORDER_SECRET` · `RELAY_ADMIN_TIMEOUT_MS` 주입은 server 재배포 플랜(29-26)의 몫이다. 미주입 상태에서도 server 는 정상 기동하고 쓰기는 `relayNotified: false` 로 성공한다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck` — 통과
- `vitest run tests/routes/admin.test.ts tests/services/relay-admin-client.test.ts tests/middleware/require-admin.test.ts` — 3 files · 59 tests passed
- `vitest run`(server 전체) — 37 files · 371 tests passed
- 수용 기준 grep 전부 통과(requireAdmin 1 · 문구 ≥1 · admin_users_raw ≥1 · /api/admin ≥1 · assertRelayUrl 1 · x-admin-email ≥1 · SELF_LOCKOUT ≥1 · HAS_DMA ≥1 · req.body.password ≥1)
- 스키마 푸시: 해당 없음(목 Supabase) · 보안검사: `security_enforcement: false` 로 생략

## Next Phase Readiness

- 29-11: relay `/internal/admin/access/reload` · `/registry/reload` 가 `{ ok, changed }` 와 `x-admin-email` 필수(없으면 400)를 지키면 이 클라이언트와 바로 맞물린다.
- 29-13: `AdminUserUpsertBody` 에 `dma` 를 넓히고, `requireRelayAdmin(req)` 로 503 을, `relay.request(...)` 의 `status 0 · 5xx` 를 502 `RELAY_FAILED` 로 바꾸며, DELETE 의 `HAS_DMA` 분기를 relay 삭제 경로로 대체한다.
- 29-12: webapp Admin 화면이 위 라우트 · 오류 코드 표를 계약으로 쓴다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*

## Self-Check: PASSED

- 신규 파일 8개 존재 · 커밋 605b3b64 · dcee36c4 가 HEAD 조상 · 스텁 패턴 없음
