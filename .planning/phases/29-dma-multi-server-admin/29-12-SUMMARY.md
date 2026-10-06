---
phase: 29-dma-multi-server-admin
plan: 12
subsystem: auth
tags: [nextjs-middleware, supabase-rpc, role-gate, playwright, vitest]

requires:
  - phase: 29-07
    provides: "원격 my_app_access() RPC · app_users D-20 운영 시드(admin 2 · trader 2) · e2e 전용 시드(e2e@gh-radar.local = admin)"
provides:
  - "webapp/src/lib/supabase/access-gate.ts — decideAccess · PENDING_PATH · ADMIN_PREFIX · VIEWER_BLOCKED_PREFIXES (판정 표 정본 · 순수 모듈)"
  - "middleware 역할 게이트 — 로그인 사용자의 비공개 요청마다 my_app_access RPC 1회"
  - "/pending 승인 대기 화면 (PendingCard)"
  - "e2e P29-G1 · P29-G2"
affects: [29-15, admin-users, admin-servers, sidebar-admin-group]

actuals:
  tokens: 4284
  tasks: 2
  commits: 2
plan_head_before: 76b2e3d3b7f1fa988021d1bef4e9d0e10c312927
plan_head_after: 174ca678146aafa7e3b3fb1527ec39fbd2c29178

tech-stack:
  added: []
  patterns:
    - "판정 표는 import 없는 순수 모듈 한 곳, middleware 는 호출만 (public-path.ts 선례 확장)"
    - "middleware 의 새 리다이렉트는 supabaseResponse 쿠키를 리다이렉트 응답으로 옮긴다"

key-files:
  created:
    - webapp/src/lib/supabase/access-gate.ts
    - webapp/src/lib/supabase/__tests__/access-gate.test.ts
    - webapp/src/app/pending/page.tsx
    - webapp/src/components/auth/pending-card.tsx
    - webapp/e2e/specs/access-gate.spec.ts
  modified:
    - webapp/src/lib/supabase/middleware.ts
    - webapp/src/app/auth/callback/route.ts

key-decisions:
  - "역할 조회 오류는 역할 값보다 우선해 /pending (fail closed) — 오류를 허용으로 위장하지 않는다"
  - "역할 게이트 리다이렉트는 getUser() 가 회전한 세션 쿠키를 리다이렉트 응답에 옮겨 싣는다 (refresh 토큰 재사용 방지)"
  - "/pending 은 공개 prefix 가 아니다 — 미인증은 /login, 역할 보유자는 / 로 간다"

patterns-established:
  - "역할 게이트: middleware → my_app_access RPC 1회 → decideAccess — 새 역할 규칙은 access-gate.ts 판정 표와 단위 표 테스트에만 추가"

requirements-completed: [ADMIN-02]

coverage:
  - id: D1
    description: "판정 표(역할 없음 · 오류 fail closed · admin 접두 · trader · viewer 차단 · 경계 케이스 /administrator · /mentor)"
    requirement: ADMIN-02
    verification:
      - kind: unit
        ref: "webapp/src/lib/supabase/__tests__/access-gate.test.ts (36 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "middleware 가 실 my_app_access RPC 로 판정 — e2e admin 시드는 /pending 에서 홈으로, /scanner 그대로"
    requirement: ADMIN-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/access-gate.spec.ts#P29-G1 승인된 사용자는 /pending 에서 홈으로"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/access-gate.spec.ts#P29-G2 admin 시드는 스캐너를 연다"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/auth-guards.spec.ts (미인증 14건 회귀)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/pending 화면 — 미허용 계정으로 실제 로그인했을 때 안내 한 줄 · 이메일 · 로그아웃 1개가 모바일 · 데스크톱에서 보이고 로그아웃이 /login 으로 간다"
    requirement: ADMIN-02
    verification: []
    human_judgment: true
    rationale: "e2e 계정은 admin 이라 승인 대기 화면을 실제로 렌더할 미허용 세션이 자동 테스트에 없다 — 미허용 gmail 로 한 번 눈으로 확인 필요"

duration: 4min
completed: 2026-10-07
status: complete
---

# Phase 29 Plan 12: 웹 역할 게이트 Summary

**middleware 가 로그인 사용자의 비공개 요청마다 `my_app_access()` RPC 를 1회 불러 순수 판정 `decideAccess` 로 /pending · admin 전용 · viewer 범위를 가르고, 미허용 사용자는 셸 없는 승인 대기 카드만 본다**

## Performance

- **Duration:** 약 4분(실행 구간 — 컨텍스트 읽기 제외)
- **Started:** 2026-10-06T16:57:48Z
- **Completed:** 2026-10-06T17:01:43Z
- **Tasks:** 2
- **Files modified:** 7 (신규 5 · 수정 2)

## Accomplishments

- `access-gate.ts` — import 없는 순수 판정 모듈. 규칙 순서: ① 오류 · 역할 없음 → `/pending`(자기 자신은 통과) ② 역할 있음 + `/pending` → `/` ③ `/admin` 접두 비 admin → `/` ④ viewer + `/trading` · `/analytics` · `/chat` · `/me` → `/` ⑤ 통과. 접두는 경계 비교.
- `middleware.ts` — 미인증 · `/login` 분기 뒤 `user && !isPublic` 에서 RPC 1회 → `decideAccess` → 리다이렉트. 미인증 · 공개 prefix 경로는 종전 그대로(auth-guards 14건 green).
- `/pending` — 앱 셸 없는 모바일 우선 가운데 카드(360 폭): 「관리자 승인을 기다리고 있어요 — 승인되면 바로 열려요」 · 로그인 이메일 · 로그아웃 버튼 1개(`useAuth().signOut` — hard redirect `/login`). 토스트 · 힌트 없음.
- 실 로그인 e2e: e2e 계정(29-07 e2e 전용 시드로 admin)이 `/pending` → `/`, `/scanner` 유지.

## 판정 표 (단위 테스트로 고정 · 36건)

| 역할 | `/pending` 으로 | `/` 로 | 통과 |
|---|---|---|---|
| 없음 / 조회 오류 | `/` · `/trading` · `/admin/users` · `/me` · (오류면 admin 이라도) | — | `/pending` 자체 |
| admin | — | `/pending` | `/admin` · `/admin/users` · `/admin/servers` · `/trading` · `/me` |
| trader | — | `/pending` · `/admin` · `/admin/users` | `/` · `/trading` · `/analytics/limitup` · `/chat` · `/me` · `/scanner` · `/administrator`(경계 밖) |
| viewer | — | `/pending` · `/trading` · `/trading/order-log` · `/analytics/limitup` · `/chat` · `/me` · `/admin/users` | `/` · `/scanner` · `/search` · `/stocks/005930` · `/themes` · `/watchlist` · `/mentor`(경계 밖) |

경계 케이스는 변이 검사로 확인했다 — `matchesPrefix` 를 `startsWith(prefix)` 로 바꾸면 `/administrator` · `/mentor` 두 건이 실패하고, 원복 뒤 36건 green.

## middleware 지연 측정 (RESEARCH A5)

- 추가되는 것은 요청당 PostgREST RPC 1왕복이다. 로컬 Mac → 원격 Supabase 로 e2e 세션 토큰을 써서 `POST /rest/v1/rpc/my_app_access` 를 12회 불렀다(첫 회 워밍업 제외 11회): **min 17 · p50 20 · max 47 ms**, 응답 `200 "admin"`.
- dev 서버 전후 페이지 응답 비교는 하지 않았다 — Turbopack dev 의 컴파일 편차(수백 ms)가 20ms 를 덮어 의미 있는 대조가 안 된다. Vercel(운영) ↔ Supabase 지연은 배포 뒤 확인할 몫이다.

## Task Commits

1. **Task 1: 트레이서 — decideAccess · middleware my_app_access 1회 · /pending · 실 로그인 e2e** - `fe6768e7` (feat)
2. **Task 2: 판정 표 전부 · OAuth 콜백 주석** - `174ca678` (test)

트레이서 피드백 게이트: interactive · `end-of-phase` · `<automated>` 만 → 커밋 뒤 typecheck + `access-gate.spec.ts` 재실행 green → 확장 진행.

## Files Created/Modified

- `webapp/src/lib/supabase/access-gate.ts` - 판정 표 정본(`decideAccess` · 상수 3개 · 로컬 `AccessRole`)
- `webapp/src/lib/supabase/__tests__/access-gate.test.ts` - 트레이서 4건 + 판정 표 `it.each` 32건
- `webapp/src/lib/supabase/middleware.ts` - 책임 4번(역할 게이트) · RPC 1회 · 쿠키 이관 리다이렉트
- `webapp/src/app/pending/page.tsx` - 셸 없는 승인 대기 라우트
- `webapp/src/components/auth/pending-card.tsx` - 안내 · 이메일 · 로그아웃 카드(client)
- `webapp/e2e/specs/access-gate.spec.ts` - P29-G1 · P29-G2 (프로젝트 storageState 로그인)
- `webapp/src/app/auth/callback/route.ts` - 머리 주석만 「[Phase 29 D-01] 역할 판정은 middleware 가 매 요청」 으로 교체(코드 무변경)

## Decisions Made

- 역할 조회 오류는 역할 값보다 우선한다(오류 + admin → `/pending`). 조회 실패를 허용으로 위장하지 않는다.
- RPC 가 돌려준 문자열은 `AccessRole` 로 캐스팅만 한다 — 값 범위는 `app_users.role` CHECK 가 보장한다.
- `/pending` 은 공개 prefix 에 넣지 않았다 — 미인증은 `/login` 으로 간다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 역할 게이트 리다이렉트에 세션 쿠키 이관**
- **Found during:** Task 1
- **Issue:** `getUser()` 가 이 요청에서 access 토큰을 회전하면 새 쿠키는 `supabaseResponse` 에만 실린다. 새 리다이렉트(`NextResponse.redirect`)를 그대로 반환하면 브라우저가 이미 소비된 refresh 토큰을 다음 요청에 다시 보내 세션이 끊길 수 있다. 종전 `/login` 리다이렉트는 드물게 지나는 경로였지만, 역할 게이트는 승인된 사용자의 `/pending` · viewer 차단 등 일상 경로에서 리다이렉트한다.
- **Fix:** 리다이렉트 응답에 `supabaseResponse.cookies.getAll()` 을 옮겨 싣는다. 종전 두 리다이렉트(미인증 · `/login`)는 범위 밖이라 건드리지 않았다.
- **Files modified:** webapp/src/lib/supabase/middleware.ts
- **Verification:** typecheck · P29-G1(리다이렉트 경로) green
- **Committed in:** fe6768e7

**2. [수용 기준 맞춤] middleware 머리 주석에서 RPC 이름 제거**
- **Found during:** Task 1 수용 기준 확인
- **Issue:** `grep -c "my_app_access" middleware.ts` = 1 기준인데 머리 주석에도 이름이 있어 2.
- **Fix:** 주석을 「본인 역할 RPC(아래 호출)」 로 바꿔 호출부 1곳만 남겼다.
- **Committed in:** fe6768e7

---

**Total deviations:** 2 (Rule 2 1건 · 기준 맞춤 1건)
**Impact on plan:** 세션 안정성 보강 1건. 범위 확장 없음.

## TDD 메모 (Task 2)

Task 1 의 action 이 규칙 ①~⑤ 전부를 구현하도록 지시했으므로 Task 2 표 테스트는 처음부터 green 이었다(플랜 문구 「어긋나면 수정」 대로 수정 없음). RED 대신 변이 검사(경계 비교 제거 → 2건 실패 → 원복)로 표 테스트가 실제로 물린다는 것을 확인했다. Task 2 는 `test(29-12)` 단일 커밋이다.

## Issues Encountered

- master 는 GSD 보호 브랜치(`git.base-branch --is-protected master` = true)지만, 이 저장소는 `branching_strategy: none` 이고 오케스트레이터가 master 순차 실행 · 일반 커밋을 지시했으며 29-01~29-11 도 master 에 커밋됐다 — 지시대로 master 에 커밋했다. push 는 하지 않았다(push = webapp 운영 배포).

## Known Stubs

None — `PendingCard` 의 이메일 자리 `" "` 은 세션 로딩 중 높이 유지용이고 로딩 뒤 실제 이메일로 채워진다.

## User Setup Required

None - 원격 시드는 29-07 에서 끝났다.

## Next Phase Readiness

- Admin 화면(29-15~) · 사이드바 Admin 그룹이 이 게이트 위에 선다 — `/admin/*` 은 이미 admin 만 통과.
- **배포 주의:** 이 커밋이 push 되는 순간 운영 webapp 이 게이트를 싣는다. 원격 시드(alex · ezmesya admin · dma_credentials 보유자 trader · e2e admin)는 29-07 에서 확인됐으므로 기존 사용자는 잠기지 않는다. 그 밖의 기존 가입자는 의도대로 승인 대기로 간다.
- 수동 확인 1건(D3): 미허용 gmail 로 로그인해 `/pending` 카드 · 로그아웃을 눈으로 확인.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*

## Self-Check: PASSED
