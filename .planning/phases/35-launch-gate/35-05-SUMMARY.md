---
phase: 35-launch-gate
plan: 05
subsystem: server · webapp sidebar
tags: [launch-gate, admin, express, zod, supertest, sidebar, playwright]
status: complete

requires:
  - phase: 35-launch-gate
    provides: "35-02 launch_orders_for_admin(p_date) · launch_map_for_admin(p_fire, p_days) RPC 계약"
  - phase: 35-launch-gate
    provides: "35-03 shared launch.ts — LaunchOrdersResponse · LaunchMapResponse · LAUNCH_RANGE_DAYS · LaunchFire · LaunchRange"
provides:
  - "GET /api/admin/launch/orders?d=YYYYMMDD — requireAuth → requireAdmin · launch_orders_for_admin 1회 · snake_case 통과"
  - "GET /api/admin/launch/map?fire=q16|n0930&range=10d|20d|all — launch_map_for_admin 1회 · p_days = LAUNCH_RANGE_DAYS"
  - "adminLaunchRouter(관문 /launch 경로 한정) · app.ts 마운트 adminServersRouter 뒤 · adminRouter 앞"
  - "사이드바 Admin › 발사(/admin/launch · item admin-launch) — 「서버」 다음"
affects: [35-06, 35-10, 35-11]

actuals:
  tokens: 7656
  tasks: 3
  commits: 3
plan_head_before: dbce6cee05f0eaa671be089d49e20bf1d8c70e24
plan_head_after: 5b9f6e3557331fc582d0525d961feb200c33dde5

tech-stack:
  added: []
  patterns:
    - "어드민 라우터 추가 = 경로 한정 관문(`router.use('/<seg>', requireAuth(), requireAdmin())`) + adminRouter 앞 마운트 — 요청당 역할 조회 1회"
    - "서비스 모양 검사 `assertArrays(fn, fail, data, keys)` — 객체 아님/키별 배열 아님을 첫 위반 키 cause 로 500"

key-files:
  created:
    - server/src/schemas/admin-launch.ts
    - server/src/services/admin-launch.ts
    - server/src/routes/admin-launch.ts
    - server/tests/routes/admin-launch.test.ts
  modified:
    - server/src/app.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "35-05: 발사 어드민 서비스의 모양 검사를 assertArrays 헬퍼 하나로 — orders(dates·heads·pieces) · map(days·heads·pieces) 가 같은 규칙, 헬퍼는 accum-report 에서 복제(공용화 안 함)"
  - "35-05: server 는 발사 행을 변환하지 않는다 — RPC jsonb 를 `as unknown as Launch*Response` 로 그대로 통과(계산 · camelCase 변환 없음 · D-20)"

requirements-completed: []

coverage:
  - id: D1
    description: "GET /api/admin/launch/orders — 401 · 403(RPC 0회) · 200 RPC 값 그대로(account · dma_user_id 포함) · p_date null/지정 · 400(형식 · 실재 날짜) RPC 0회 · 500 DB_ERROR(오류 · 모양 위반 5종)"
    requirement: "LAUNCH-05"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-launch.test.ts#GET /api/admin/launch/orders"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/admin/launch/map — 기본 q16 · p_days 10 · range 20d=20 · all=null · n0930 · 400 4종 RPC 0회 · 500 오류 · 모양 위반 4종"
    requirement: "LAUNCH-05"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-launch.test.ts#GET /api/admin/launch/map"
        status: pass
    human_judgment: false
  - id: D3
    description: "마운트 순서 — /api/admin/launch/* · /api/admin/users · /api/admin/servers 모두 역할 조회 1회"
    requirement: "LAUNCH-05"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-launch.test.ts#⑧ · server/tests/routes/admin-servers.test.ts · server/tests/routes/admin.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "사이드바 Admin › 발사 — 순서 「… Admin · 사용자 · 서버 · 발사 · My page」 · 비admin 미렌더 · /admin/launch 단독 활성 · E2E 트리 순서"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#AppSidebar — 「Admin › 사용자 · 서버 · 발사」"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts (12 passed)"
        status: pass
    human_judgment: false

duration: 약 5분
completed: 2026-10-27
---

# Phase 35 Plan 05: 발사 어드민 라우트 2개 + 사이드바 진입점 Summary

**35-02 RPC 두 개를 `GET /api/admin/launch/orders` · `/map` 으로 이었다(경로 한정 관문 · RPC 1회 · zod 400 · snake_case 통과 · 배열 모양 검사). 사이드바 Admin 그룹의 「서버」 다음에 「발사」 링크를 달았다.**

## Performance

- **Duration:** 약 5분 (2026-10-27T12:09Z → 12:14Z)
- **Tasks:** 3/3
- **Files:** 신규 4 · 수정 4

## Accomplishments

- **라우트 2개(LAUNCH-05).**
  - `GET /api/admin/launch/orders?d=YYYYMMDD`: `launch_orders_for_admin({ p_date: d ?? null })` 를 부르고 `LaunchOrdersResponse` 를 돌려준다.
  - `GET /api/admin/launch/map?fire=q16|n0930&range=10d|20d|all`: `launch_map_for_admin({ p_fire, p_days: LAUNCH_RANGE_DAYS[range] })` 를 부르고 `LaunchMapResponse` 를 돌려준다. 기본값은 q16 · 10d 다.
  - 응답 타입은 shared `launch.ts` 하나를 server 와 webapp 이 같이 쓴다.
- **마운트(app.ts 123~125행).** `adminServersRouter`(123) → `adminLaunchRouter`(124) → `adminRouter`(125) 순서다. 관문은 `adminLaunchRouter.use("/launch", requireAuth(), requireAdmin())` 하나다. `/launch` · `/users` · `/servers` 요청 모두 역할 조회가 1회다(supertest 로 기록).
- **사이드바(LAUNCH-06 일부).** `NAV_ADMIN_LAUNCH = { href: "/admin/launch", label: "발사" }` 를 두고 `SubNavLink item="admin-launch"` 를 「서버」 다음에 렌더한다. 노출 조건은 기존 Admin 그룹과 같다(role admin). 페이지 자체는 35-06 몫이다.

## 테스트 수

- `server/tests/routes/admin-launch.test.ts`: **29건**
  - orders 14건: ① 401 · ② 403 · ③ 200 deep-equal · ④ p_date · ⑤ 400 3종 · ⑥ 500 · ⑦ 모양 위반 5종 · ⑧ /users 역할 조회 1회
  - map 15건: 401/403 · 기본 · params 4종 · 400 4종 · 500 · 모양 위반 4종
- 회귀: admin-servers.test(Task 1 · 합 51 passed), admin.test(Task 2 · 합 62 passed)
- `app-sidebar.test.tsx`: 90 passed. 「/admin/launch → 발사만 활성」 1건을 새로 넣었고, 순서 · href · item · 비admin null · for 루프 2곳에 「발사」를 더했다.
- `sidebar-tree.spec.ts`: 12 passed(Playwright `--workers=1`). `TREE_LINKS` 에서 「서버」 다음에 「발사」를 넣었다. `slice(0,3)` · `slice(3)` 사용처는 앞 3개(홈 · 검색 · 트레이딩)만 갈라 쓰므로 영향이 없다. `ADMIN_SUB_ITEMS` 접두 선택자 `[data-sidebar-item^="admin-"]` 는 그대로 맞는다.

## Task Commits

1. **Task 1 (tracer): 주문 내역 경로 server 한 줄** — `fd40c758` (feat)
2. **Task 2: 경계 지도 라우트** — `87c8af32` (feat)
3. **Task 3: 사이드바 Admin › 발사** — `5b9f6e35` (feat)

## Decisions Made

- 모양 검사 헬퍼 `assertArrays` 를 서비스 파일 안에 두었다. 두 RPC 가 같은 규칙(객체 + 키 3개 배열)이라 한 번만 썼고, 헬퍼를 accum-report 와 공용화하지는 않았다.
- trader 403 은 기존 errorHandler 코드 `FORBIDDEN` 으로 단언했다(admin-servers.test 와 같다).

## Deviations from Plan

None - plan executed exactly as written.

(테스트를 더 넣은 것만 플랜과 다르다. ⑤ 에 7자리 `2026101`, ⑦ 에 heads 누락 · dates null · 배열 · null, map 400 에 대문자 `Q16` · `krx` 를 더했다. 동작 범위는 같다.)

## Issues Encountered

- **webapp typecheck 오류 2건(이 플랜과 무관).**
  - `relay/tests/helpers/frames.ts:490` TS2554: 알려진 기존 오류다.
  - `relay/tests/helpers/frames.ts:1618` TS2554(Expected 28 arguments, but got 24): 다른 세션이 아직 커밋하지 않은 `relay/src/generated/stock-dma/journal-record.ts` 변경(+44행, Phase 36)이 `createJournalRecord` 인자 수를 바꿔서 생겼다. 이 플랜은 relay 를 건드리지 않았다.
  - 위 두 건을 빼면 webapp typecheck 오류는 0건이다. server typecheck 는 0건이다.

## Next Phase Readiness

- 35-06(웹 페이지)은 `authFetch<LaunchOrdersResponse>("/api/admin/launch/orders?d=…")` · `authFetch<LaunchMapResponse>("/api/admin/launch/map?fire=…&range=…")` 로 그대로 받으면 된다.
- 사이드바 링크는 이미 `/admin/launch` 를 가리킨다. 페이지가 생길 때까지는 404 다(middleware `/admin` 접두 = admin 만).
- 배포(server Cloud Run 새 revision)는 메인 세션 몫이다.

## Self-Check: PASSED

- 생성 파일 4개가 모두 디스크에 있다.
- 커밋 fd40c758 · 87c8af32 · 5b9f6e35 가 모두 HEAD 의 조상이다.
- acceptance:
  - app.ts 마운트 줄 123 < 124 < 125
  - `adminLaunchRouter.use("/launch", requireAuth(), requireAdmin());` 1건
  - `LAUNCH_RANGE_DAYS[range]` · `"launch_map_for_admin"` 있음
  - `NAV_ADMIN_LAUNCH` · `item="admin-launch"`(763행)가 `item="admin-servers"`(754행)보다 뒤
  - 단위 · E2E 순서 「… 서버 · 발사 · My page」
