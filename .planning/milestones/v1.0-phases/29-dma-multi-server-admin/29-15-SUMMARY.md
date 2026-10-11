---
phase: 29-dma-multi-server-admin
plan: 15
subsystem: webapp
tags: [nextjs, admin, sidebar, sheet, playwright, vitest, radix-toggle-group]
status: complete

requires:
  - phase: 29-10
    provides: "GET/POST/PATCH/DELETE /api/admin/users · requireAdmin(403 FORBIDDEN)"
  - phase: 29-12
    provides: "87 반영 상태 → admin_users_raw 의 snapshot · results (칩 판정 원자료)"
  - phase: 29-13
    provides: "라우트 표 14경로(DMA 프록시 · 서버 레지스트리) — admin-api.ts 가 1:1 로 따른다"
  - phase: 29-04
    provides: "shared AdminUsersOverview · AdminUserView · ReflectTone · REFLECT_LABEL · 요청 바디 타입"
  - phase: 29-07
    provides: "원격 my_app_access · e2e 계정 admin 시드(middleware 가 /admin 통과)"
provides:
  - "webapp/src/lib/admin-api.ts — Admin API 클라이언트 14함수(뒤 플랜은 고치지 않고 부르기만)"
  - "/admin/users 페이지 · UsersClient(목록 · 승인 대기 · selected 상태 · onCreate 자리)"
  - "ReflectChip · ADMIN_CHIP_BASE · ADMIN_TONE_CLASS · ADMIN_BUTTON_PRIMARY/SECONDARY(Admin 칩 · 작은 버튼 결)"
  - "UserRow · ServerOnlyRow · PendingSection · signedUpLabel"
  - "AdminSheet — 640 미만 바텀시트(92dvh 상한) · 이상 우측 440px · 본문 스크롤 · footer 자리"
  - "useAppRole(): AppRole | null | undefined"
  - "사이드바 NAV_ADMIN · NAV_ADMIN_USERS · NAV_ADMIN_SERVERS · SubNavLink"
  - "e2e mockAdminApi(page, { users?, servers?, onRequest? }) · ADMIN_USERS_FIXTURE · ADMIN_SERVERS_FIXTURE · ADMIN_BUSY_MESSAGE · P29-A1 · P29-A2"
affects: [29-17, 29-18, 29-19, 29-26]

actuals:
  tokens: 28824
  tasks: 2
  commits: 2
plan_head_before: c6715dfcbe2523e0267dad835749f4eb6b89545b
plan_head_after: eab206698c3dff1c62e2dfc582cb2ec2cb6ef36e

tech-stack:
  added: []
  patterns:
    - "Admin 화면 데이터 = Express /api/admin/* 만(authFetch) — 브라우저 Supabase 직접 접근 없음(D-07)"
    - "relay 를 거칠 수 있는 Admin 요청은 브라우저 타임아웃 20초(RELAY_TIMEOUT_MS) — 서버 relay 상한 12초보다 길게"
    - "e2e Admin 목 = 메모리 상태 + 요청 기록 — 쓰기가 상태를 바꿔 화면 재조회가 바뀐 목록을 받는다"
    - "사이드바 그룹 하위 링크는 SubNavLink 하나(분석 · Admin)"

key-files:
  created:
    - webapp/src/lib/admin-api.ts
    - webapp/src/lib/__tests__/admin-api.test.ts
    - webapp/src/app/admin/users/page.tsx
    - webapp/src/components/admin/users-client.tsx
    - webapp/src/components/admin/user-row.tsx
    - webapp/src/components/admin/reflect-chip.tsx
    - webapp/src/components/admin/pending-section.tsx
    - webapp/src/components/admin/admin-sheet.tsx
    - webapp/src/components/admin/__tests__/users-client.test.tsx
    - webapp/src/components/admin/__tests__/admin-sheet.test.tsx
    - webapp/src/hooks/use-app-role.ts
    - webapp/src/hooks/__tests__/use-app-role.test.tsx
    - webapp/e2e/fixtures/admin.ts
    - webapp/e2e/specs/admin.spec.ts
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/trading/dma-gate.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "relay 경유 Admin 요청의 브라우저 타임아웃 20초 — apiFetch 기본 8초는 서버 relay 상한 12초보다 짧아, 반영은 됐는데 화면이 실패를 말하는 갈림이 생긴다"
  - "사이드바 Admin 노출은 역할만 본다(useAppRole === admin) — relay 연결 · DMA 매핑과 무관해 트레이딩이 안 보이는 admin 에게도 보인다"
  - "승인 역할 세그먼트는 controlled value 빈 값 — 기본 선택 없음, 실패 뒤 같은 역할을 다시 눌러도 다시 보낸다"
  - "「+ 사용자」 는 29-19 가 잇기 전까지 비활성(onCreate 없으면 disabled) — 누르면 아무 일 없는 버튼을 두지 않는다"
  - "dma-gate 는 제목(「DMA 계정이 연결되지 않았어요」)을 두고 본문 끝 문장만 「관리자에게 연결을 요청하세요.」 로 — 제목을 단언하는 테스트 4곳을 흔들지 않는다"
  - "Button size=sm 의 글자 크기 · 변형 글자색 충돌(tailwind-merge)은 Admin 버튼에서만 재지정으로 피하고 근본 수정은 deferred"

requirements-completed: [ADMIN-09, ADMIN-10]

coverage:
  - id: D1
    description: "admin-api 14함수 — 경로(인코딩) · 메서드 · JSON 바디 · Content-Type · Bearer · relay 경유 20초 · 세션 없음 UNAUTHENTICATED"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/admin-api.test.ts (7건)"
        status: pass
    human_judgment: false
  - id: D2
    description: "트레이서 /admin/users 목록 — 행 4(웹 3 + 서버에만 1) · 「DMA 연결 없음」 · 「KB121 · 실패 · BUSY」 + message 툴팁 · 반영됨 키만 · 「웹 유저 없음」 aria-disabled · 하단 안내 2문장 · 390/1080 잘림 없음"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/users-client.test.tsx#UsersClient — 목록 (D-14 · 목업 A)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A1 (390 · 1080)"
        status: pass
    human_judgment: false
  - id: D3
    description: "승인 대기 — 0 이면 섹션 없음 · 「승인」 → viewer/trader/admin(기본 선택 없음) → POST { email, role } 1회 → 재조회 → 사용자 목록으로 · 실패는 행 안 한 줄"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/users-client.test.tsx#UsersClient — 승인 대기"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A2"
        status: pass
    human_judgment: false
  - id: D4
    description: "사이드바 Admin › 사용자 · 서버 — admin 만 · 분석 뒤 · My page 앞 · 하위 항목이 활성 · 레일 접두 일치 · trader/viewer/null/모름 미렌더 · useAppRole 판정"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#AppSidebar — 「Admin › 사용자 · 서버」"
        status: pass
      - kind: unit
        ref: "webapp/src/hooks/__tests__/use-app-role.test.tsx (4건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts (트리 순서 · 매핑 없음) · admin.spec.ts#P29-A2 사이드바"
        status: pass
    human_judgment: false
  - id: D5
    description: "AdminSheet — 640 미만 bottom · 92dvh 상한 · 이상 right · sm:max-w-[440px] · 닫기 · footer 영역"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/admin-sheet.test.tsx (4건)"
        status: pass
    human_judgment: false
  - id: D6
    description: "AdminSheet 실제 화면 모양(바텀시트 높이감 · 우측 패널) · 칩 · 행의 시각 정합(목업 A)"
    verification: []
    human_judgment: true
    rationale: "AdminSheet 를 쓰는 화면은 29-17 부터 생긴다 — 이 플랜은 구조만 단위로 잠갔다. 목록 시각은 스크린샷(아래)으로 확인했지만 목업 대비 최종 판정은 사람 몫"

duration: 16min
completed: 2026-10-07
---

# Phase 29 Plan 15: /admin/users 목록 · 승인 대기 · 사이드바 Admin · AdminSheet Summary

**admin 이 사이드바 「Admin › 사용자」 로 들어가 사용자 · DMA 연결 · 서버별 반영 칩(목업 A)을 보고, 가입한 사용자를 역할을 골라 한 번에 승인한다. Express `/api/admin/*` 14경로 클라이언트(`admin-api.ts`)와 반응형 시트 골격(`AdminSheet`)이 29-17 · 29-18 · 29-19 의 바닥으로 섰다.**

## Performance

- **Duration:** 약 16분
- **Started:** 2026-10-06T17:30:25Z
- **Completed:** 2026-10-06T17:46:38Z
- **Tasks:** 2 (트레이서 1 · TDD 1)
- **Files:** 신규 14 · 수정 4

## Accomplishments

- **트레이서(Task 1):** `admin-api.ts` → `UsersClient` → `/admin/users`. 행은 이니셜 · 이메일 · 역할 칩 · `DMA <id>`(없으면 「DMA 연결 없음」) · 「· 계좌 N」 · 서버별 `ReflectChip` 이다. 「서버에만 있음」 행은 DMA id 제목 · 「웹 유저 없음」 점선 칩 · `aria-disabled` 로 그린다. Playwright `P29-A1` 이 390 · 1080 에서 green 이고 잎 잘림도 없다. 트레이서 `<verify>` 를 한 번 더 돌려 green 을 확인한 뒤 확장했다.
- **승인 대기(Task 2):** 「승인 대기 N」 섹션을 목록 위에 두었다. 「승인」 을 누르면 역할 세그먼트(viewer · trader · admin, 기본 선택 없음)가 열리고, 고르는 순간 `POST /api/admin/users { email, role }` 1회 → 재조회가 일어나 그 행이 사용자 목록으로 옮겨진다. 실패는 그 행에 한 줄로 보인다(토스트 없음).
- **사이드바(Task 2):** 「Admin」(`/admin/users`) + 하위 「사용자」 · 「서버」 를 「분석」 뒤 · My page 앞에 두었다. 노출은 `useAppRole() === "admin"` 만 보고, 활성은 하위 항목이 켠다. 레일에서는 `/admin` 접두 일치로 아이콘이 켜진다. 모바일 탭바는 건드리지 않았다.
- **AdminSheet(Task 2):** 640 미만은 바텀시트(92dvh 상한 · 손잡이), 그 이상은 우측 440px 패널이다. 머리(제목 = 접근 이름 · 닫기) · 스크롤 본문 · 고정 footer 자리로 이루어진다.
- **dma-gate:** 본문 끝 문장을 「관리자에게 연결을 요청하세요.」 로 바꿨다.

## admin-api 함수 표 (29-13 라우트 표 1:1)

| 함수 | 메서드 · 경로 | 타임아웃 |
|---|---|---|
| `fetchAdminUsers()` | GET `/api/admin/users` | 기본 8초 |
| `upsertAdminUser(body)` | POST `/api/admin/users` | dma 있으면 20초 |
| `patchAdminRole(email, role)` | PATCH `/api/admin/users/:email` | 기본 |
| `deleteAdminUser(email)` | DELETE `/api/admin/users/:email` | 20초 |
| `connectAdminDma(email, dma)` | POST `/api/admin/users/:email/dma` | 20초 |
| `changeDmaPassword(dma, password)` | POST `/api/admin/dma-users/:dma/password` | 20초 |
| `putDmaAccount(dma, { account, servers })` | PUT `/api/admin/dma-users/:dma/accounts` | 20초 |
| `removeDmaAccount(dma, broker, accountNo)` | DELETE `/api/admin/dma-users/:dma/accounts/:broker/:accountNo` | 20초 |
| `reconcileDmaUser(dma)` | POST `/api/admin/dma-users/:dma/reconcile` | 20초 |
| `fetchAdminServers()` | GET `/api/admin/servers` | 20초(relay 상태 조회) |
| `upsertAdminServer(body)` | POST `/api/admin/servers` | 기본 |
| `patchAdminServer(key, body)` | PATCH `/api/admin/servers/:key` | 기본 |
| `setOrderServer(key)` | PUT `/api/admin/servers/:key/order-server` | 기본 |
| `setQuotePrimary(key)` | PUT `/api/admin/servers/:key/quote-primary` | 20초 |

응답 타입: `AdminWriteResponse { ok, relayNotified }` · `AdminCreateUserResponse`(+ `results?`) · `AdminDeleteUserResponse { ok, deleted, relayNotified, results? }` · `AdminConnectDmaResponse` · shared `AdminCommandResponse` · `AdminUsersOverview` · `AdminServersOverview`.

## Task Commits

1. **Task 1: 트레이서 — admin-api · UsersClient 목록 · ReflectChip · /admin/users · e2e P29-A1** — `82f32060` (feat)
2. **Task 2: 승인 대기 · 사이드바 Admin 그룹 · AdminSheet 골격 · dma-gate 문구 · e2e P29-A2** — `eab20669` (feat)

TDD 관측(Task 2): 테스트를 먼저 썼다(admin-sheet · 승인 대기 3건 · 사이드바 Admin 5건). 그 상태에서 8건 실패와 admin-sheet 모듈 없음을 확인한 뒤 구현했다. 플랜 지시대로 RED/GREEN 을 나누지 않고 한 커밋으로 묶었다.

## 스크린샷 (커밋 안 함 — `shots/` 는 추적 제외)

- `.planning/phases/29-dma-multi-server-admin/shots/29-15/admin-users-390.png` — 폰 390 목록(다크)
- `.planning/phases/29-dma-multi-server-admin/shots/29-15/admin-users-1080.png` — 데스크톱 1080 목록(다크)
- `.planning/phases/29-dma-multi-server-admin/shots/29-15/admin-users-pending-1080.png` — 승인 대기 + 사이드바 Admin(다크)
- `.planning/phases/29-dma-multi-server-admin/shots/29-15/admin-users-pending-light-390.png` · `…-light-1080.png` — 역할 세그먼트를 연 상태(라이트)

## Decisions Made

결정은 frontmatter `key-decisions` 에 정리했다. 요지는 두 가지다.

- **타임아웃 정합:** relay 를 거치는 요청은 20초를 쓴다.
- **역할만 보는 Admin 노출:** 숨김은 권한이 아니다. 실제 차단은 middleware 와 `requireAdmin` 이 한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 정합성] relay 경유 Admin 요청의 브라우저 타임아웃 20초**
- **Found during:** Task 1
- **Issue:** `apiFetch` 기본 8초가 Express 의 relay 상한 12초보다 짧다. 서버가 아직 서버별 결과를 모으는 중에 브라우저가 먼저 끊으면, 반영은 됐는데 화면은 실패를 말한다.
- **Fix:** relay 를 부를 수 있는 경로에 `RELAY_TIMEOUT_MS = 20_000` 을 쓴다. 단위 테스트로 고정했다.
- **Commit:** 82f32060

**2. [Rule 1 - 시각 결함] Admin 작은 버튼의 글자 크기 · 색**
- **Found during:** Task 2 (스크린샷)
- **Issue:** `Button size="sm"` 의 `text-[var(--t-caption)]` 을 tailwind-merge 가 색으로 읽는다. 그래서 변형 글자색이 지워지고 크기는 부모 값을 물려받는다(「승인」 이 16px 로 커졌고, 라이트에서는 파랑 위 검정 글자가 될 수 있다).
- **Fix:** Admin 버튼에만 `ADMIN_BUTTON_PRIMARY/SECONDARY`(12px/600 + 변형 글자색)를 다시 준다. 라이트 본문면에서 사라지던 「+ 사용자」 면은 `--card` 로 바꿨다. 공용 Button 의 근본 수정은 `deferred-items.md` 로 넘겼다(모든 sm 사용처의 시각이 바뀐다).
- **Commit:** eab20669

**3. [Rule 3 - 막힘] files_modified 밖 파일 3개**
- **Found during:** Task 2
- **Issue:** 세 가지가 계획 밖 파일을 요구했다. ① e2e 계정이 admin 이라 `sidebar-tree.spec.ts` 의 트리 순서 · 「매핑 없음 = `[data-sidebar-item]` 0개」 단언에 Admin 항목이 걸린다. ② 그 spec 이 dma-gate 옛 문장을 단언한다. ③ behavior 의 `useAppRole` 3규칙을 잠글 테스트 파일이 목록에 없다.
- **Fix:** `sidebar-tree.spec.ts` 의 `TREE_LINKS` 에 Admin · 사용자 · 서버를 넣었다. 「매핑 없음」 은 Admin 하위를 뺀 하위 항목 0개 + Admin 보임으로 바꿨고, 문구 단언도 새 문장으로 고쳤다. `src/hooks/__tests__/use-app-role.test.tsx` 를 새로 만들었다.
- **Commit:** eab20669

**4. [Rule 2 - 정리] 사이드바 하위 링크 `SubNavLink` 로 통합**
- **Found during:** Task 2
- **Issue:** 「분석」 하위 두 줄이 같은 마크업 사본이었고, Admin 하위 두 줄을 더하면 사본이 넷이 된다.
- **Fix:** `SubNavLink` 하나로 묶었다. 「분석」 의 기존 단위 · e2e 테스트가 그대로 green 이다.
- **Commit:** eab20669

### 해석

- **dma-gate 문구:** 플랜은 「DMA 연결이 없어요 — 관리자에게 연결을 요청하세요」 이고, 실제 파일은 제목 「DMA 계정이 연결되지 않았어요」 + 본문 「… 연결이 필요하면 관리자에게 문의해 주세요.」 였다. 제목은 그대로 두고 본문 끝 문장만 「관리자에게 연결을 요청하세요.」 로 바꿨다. 같은 뜻의 제목을 단언하는 단위 · e2e 4곳을 흔들지 않기 위해서다.
- **헤더 설명 위치:** 목업은 「허용 gmail · 역할 · DMA 연결」 을 제목 옆에 두지만, 공용 `PageHeader`(제목 아래 설명) 문법을 따랐다. 섹션 개수도 알약 대신 앱 공용 `SECTION_COUNT` 평문으로 했다(quick-260926-o2u D4).

---

**Total deviations:** 4 auto-fixed (정합성 1 · 시각 1 · 막힘 1 · 정리 1) + 해석 2
**Impact on plan:** 산출물 · 계약 · 이름은 플랜 Artifacts 표 그대로다. 공용 Button 의 근본 결함 하나를 deferred 로 넘겼다.

## Issues Encountered

None.

## Known Stubs

- `webapp/src/components/admin/users-client.tsx` — 행을 누르면 `selected` 만 바뀌고(행 강조) 편집 시트는 아직 열리지 않는다. 29-17 이 이 상태로 `UserSheet`(AdminSheet 안)를 연다(플랜이 의도한 자리).
- `webapp/src/components/admin/users-client.tsx` — 「+ 사용자」 는 `onCreate` 가 없어 비활성이다. 29-19 가 생성 시트로 잇는다(플랜이 의도한 자리).
- `webapp/src/components/admin/admin-sheet.tsx` — 아직 이 골격을 쓰는 화면이 없다(29-17 · 29-18 · 29-19).
- `/admin/servers` — 사이드바 「서버」 링크의 목적지는 29-18 이 만든다. 그 전에는 404 다.

## User Setup Required

None. 원격 스키마 푸시는 해당 없다(`my_app_access` 는 29-07). webapp 배포(push)는 29-26 몫이다.

## Next Phase Readiness

- **29-17:** `UsersClient` 의 `selected` → `UserSheet` 렌더, `load()` 재조회 재사용, `ReflectChip` · `ADMIN_CHIP_BASE` · `ADMIN_TONE_CLASS` 칩 결, `AdminSheet` 의 `footer` 슬롯이 준비돼 있다. e2e 는 `mockAdminApi` 의 `requests` · `onRequest` 로 BUSY · 409 를 덮는다. 픽스처의 kim 은 계좌 2개(KB 계좌 KB121 BUSY 칩)를 갖는다.
- **29-18:** `fetchAdminServers` 와 나머지 서버 함수 4개, `ADMIN_SERVERS_FIXTURE`(KB120 주문 · 시세 주, KYOBO119 주문, KYOBO127 down)를 쓴다. 사이드바 「서버」 는 이미 `/admin/servers` 를 가리킨다.
- **29-19:** `UsersClientProps.onCreate` 자리가 비어 있다. 생성 시트를 users-client 안에서 열도록 바꾸면 된다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — 통과(tsc + e2e tsc)
- `vitest run src/lib/__tests__/admin-api.test.ts src/components/admin/__tests__ src/components/layout/__tests__/app-sidebar.test.tsx` — 82 + 7 통과
- `pnpm --filter @gh-radar/webapp run test` — 154 files · 3636 passed · 1 skipped
- `playwright test e2e/specs/admin.spec.ts e2e/specs/sidebar-tree.spec.ts` — 12 passed(P29-A1 ×2 · P29-A2 · sidebar-tree 8) · `access-gate.spec.ts` 회귀 2 passed
- 인수 기준: fetchAdminUsers 1 · `/api/admin/` 11 · reflect-chip slot 1 · 「웹 유저 없음」 2 · P29-A1 1 · NAV_ADMIN_SERVERS 4 · useAppRole 3 · `sm:max-w-[440px]` 1 · 「관리자에게 연결을 요청하세요」 1 · P29-A2 2
- 스키마 푸시: 해당 없음. 보안검사: `security_enforcement: false` 로 생략. spec-less probe: 건너뜀(29-01 과 같음).

## Self-Check: PASSED

- FOUND: admin-api.ts · users-client.tsx · user-row.tsx · reflect-chip.tsx · pending-section.tsx · admin-sheet.tsx · use-app-role.ts · e2e/fixtures/admin.ts · e2e/specs/admin.spec.ts · app/admin/users/page.tsx
- FOUND commits(HEAD 조상): 82f32060 · eab20669

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*
