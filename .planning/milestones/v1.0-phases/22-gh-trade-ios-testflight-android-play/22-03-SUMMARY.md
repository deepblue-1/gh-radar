---
phase: 22-gh-trade-ios-testflight-android-play
plan: 03
subsystem: webapp-auth-public-route
tags: [privacy-policy, 개인정보처리방침, nextjs-rsc, middleware, public-path, playwright, vitest]

requires:
  - phase: 22-gh-trade-ios-testflight-android-play
    provides: "22-02 승인 개인정보처리방침 문안(22-PRIVACY-DRAFT.md status approved · 13절 · 시행일 자리표시 인계)"
provides:
  - "webapp/src/lib/supabase/public-path.ts — PUBLIC_PREFIXES [/login, /auth, /privacy] · isPublicPath (import 없는 순수 모듈)"
  - "미들웨어 공개 판정이 isPublicPath(pathname) 한 줄로 — 경계 비교 유지"
  - "공개 정적 RSC 라우트 /privacy — 승인본 1~13절 · metadata.title 「개인정보처리방침 · GH Trade」"
  - "회귀면: public-path 판정 표 13건 · privacy 페이지 10건 · auth-guards e2e /privacy 2케이스"
affects: [22-07(시행일 채움 · push 게이트), 정식 출시 phase(스토어 방침 URL)]

actuals:
  tokens: 8203     # chars/4 over `git diff 052dce9f HEAD -- webapp/` (이 플랜이 바꾼 6개 파일)
  tasks: 2
  commits: 6       # MEASURED: git rev-list --count 052dce9f..HEAD (SUMMARY 커밋 이전)
plan_head_before: 052dce9fb6cc843c8ff0585be9b9469cacb7387b

tech-stack:
  added: []
  patterns:
    - "미들웨어 판정 로직은 next/server·@supabase/ssr 의존 없는 순수 모듈로 분리해 판정 표(it.each)로 잠근다"
    - "법적 문구 페이지는 승인 초안을 정본으로 두고, 렌더 텍스트를 초안 본문과 기계 대조(공백 정규화)해 옮김 충실도를 확인한다"
    - "폰 폭 WebView 의 넓은 표는 overflow-x-auto 컨테이너 + 표 최소 폭 — 데스크톱 본문 폭(848px)보다 작게 둔다"

key-files:
  created:
    - webapp/src/lib/supabase/public-path.ts
    - webapp/src/lib/supabase/__tests__/public-path.test.ts
    - webapp/src/app/privacy/page.tsx
    - webapp/src/app/privacy/__tests__/page.test.tsx
  modified:
    - webapp/src/lib/supabase/middleware.ts
    - webapp/e2e/specs/auth-guards.spec.ts

key-decisions:
  - "22-03: 시행일은 22-02 인계대로 자리표시 「2026년 ○월 ○일」 을 페이지·테스트에 그대로 둔다 — 22-07 이 push 날짜로 초안·페이지·page.test.tsx 를 함께 채운다"
  - "22-03: 페이지 h1 은 플랜 지시대로 「개인정보처리방침」(초안 제목의 「GH Trade」 접두 제외) · h1 아래 시행일 한 줄 추가 — 그 밖의 문구는 초안과 4073자 일치"
  - "22-03: RED 가 모듈 로드 실패(INVALID_RED)가 아니라 단언에서 실패하도록 isPublicPath 를 동작 불변 refactor 로 먼저 추출하고, 페이지는 빈 골격을 RED 커밋에 넣었다"

patterns-established:
  - "공개 경로 추가는 public-path.ts 의 PUBLIC_PREFIXES 한 곳 + 통과/차단 표 + e2e 이웃 경로 차단 케이스"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "isPublicPath 순수 모듈 — /privacy · /privacy/… 통과, /privacyx · /privacy-x · /loginx · /authx · / · /trading · /me 차단, PUBLIC_PREFIXES 정확히 3개"
    requirement: MOBILE-02
    verification:
      - kind: unit
        ref: "webapp/src/lib/supabase/__tests__/public-path.test.ts (13 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "미들웨어가 isPublicPath(pathname) 로 판정 — 미인증 /privacy 200, /privacy-x 는 /login?next=%2Fprivacy-x, 기존 보호 경로·/login 분기 불변"
    requirement: MOBILE-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/auth-guards.spec.ts (15 passed — public: 미인증 /privacy · middleware-guard: 미인증 /privacy-x 포함)"
        status: pass
      - kind: other
        ref: "curl http://localhost:3100/privacy → 200 · /privacy-x → 307"
        status: pass
    human_judgment: false
  - id: D3
    description: "/privacy 정적 RSC — h1 1개 · h2 13개 순서 · 2절 표 핵심 행 · 13절 시행일 자리표시 · 미정 표식/부록 0 · mailto · metadata.title"
    requirement: MOBILE-02
    verification:
      - kind: unit
        ref: "webapp/src/app/privacy/__tests__/page.test.tsx (10 tests)"
        status: pass
      - kind: other
        ref: "grep use client|fetch(|useEffect|useState = 0 · 확인 필요 = 0 · 부록 = 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "페이지 문안이 승인본 1~13절과 같다(추가·삭제·완화 없음)"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "일회성 대조 테스트(커밋 안 함) — 렌더 textContent vs 초안 본문(부록 앞) 공백·마크다운 정규화 4073자 일치"
        status: pass
    human_judgment: true
    rationale: "플랜 prohibition 「승인 초안과 다른 문구 금지」 의 검증 방식이 judgment 다. 기계 대조는 통과했지만 법적 문안의 최종 확인은 운영자 몫이다."
  - id: D5
    description: "390px·1280px × 라이트·다크 시각 확인 — 잘림·겹침 없음, 넓은 표는 컨테이너 안 가로 스크롤"
    verification:
      - kind: automated_ui
        ref: "playwright 스크린샷 4장(scratchpad) + scrollWidth 측정 — 390px docW=390(페이지 넘침 없음) · 1280px 표 3개 모두 848 ≤ 848"
        status: pass
    human_judgment: true
    rationale: "시각 적합성(표 열 너비 균형 등 취향)은 사람 판단이다 — 결함(잘림·겹침·불필요 스크롤)은 측정으로 0 확인."

duration: 8min
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 03: `/privacy` 공개 라우트 — 승인 개인정보처리방침 정적 페이지 Summary

**미들웨어 공개 판정을 순수 함수 `isPublicPath` 로 뽑아 `/privacy` 만 경계 안전하게 열고, 22-02 승인본 1~13절을 그대로 옮긴 정적 RSC 페이지(`CenterShell` · 표 가로 스크롤 · mailto)를 단위 23건 + e2e 15건으로 잠갔다 — push 하지 않음(22-07)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-26T17:59:15Z (2026-09-27 02:59 KST)
- **Completed:** 2026-09-26T18:07:18Z (2026-09-27 03:07 KST)
- **Tasks:** 2/2
- **Files modified:** 6 (전부 frontmatter `files_modified` 안 — 범위 밖 웹 변경 0)

## Accomplishments

- `webapp/src/lib/supabase/public-path.ts` 신설 — `PUBLIC_PREFIXES = ["/login", "/auth", "/privacy"]` · `isPublicPath`(prefix 와 같거나 prefix + `/` 로 시작). import 0.
- `middleware.ts` 는 `const isPublic = isPublicPath(pathname);` 한 줄로 바뀌었다. 쿠키 3단 동기화 · `getUser()` · 리다이렉트 · `/login` 로그인 분기는 그대로다.
- `/privacy` 정적 RSC 페이지 — h1 「개인정보처리방침」 → 시행일 한 줄 → 머리말 → 절 1~13(`section-{n}` · h2). 2절 항목표 12행 · 5절 위탁 표 · 6절 국외 이전 표는 `overflow-x-auto` 로 감쌌다. 11절 연락처는 `mailto:alex@jx1.io` 링크다. 클라이언트 지시어 · 데이터 요청 · 훅 · relay 호출이 없고, 색은 토큰만 쓴다.
- 렌더된 페이지 텍스트를 승인 초안 본문(부록 앞)과 기계 대조했다. 공백과 마크다운을 정규화하면 **4073자가 완전히 일치**한다. 차이는 플랜 지시 두 곳(h1 「GH Trade」 접두 · 시행일 한 줄)뿐이다.
- e2e `auth-guards.spec.ts` 에 두 케이스를 더했다. 미인증 `/privacy` 는 URL 유지 + h1 이 보이고, 미인증 `/privacy-x` 는 `/login?next=%2Fprivacy-x` 로 간다.

## 테스트 결과

| 검증 | 결과 |
|------|------|
| `vitest --run src/app/privacy/__tests__/page.test.tsx src/lib/supabase/__tests__/public-path.test.ts` | 2 files · 23 passed |
| `pnpm --filter @gh-radar/webapp run typecheck` (tsc + e2e tsconfig) | 통과 · `error TS` 0 |
| `playwright test e2e/specs/auth-guards.spec.ts` | 15 passed (setup 1 + 기존 12 + privacy 2) |
| webapp 전체 단위(`pnpm --filter @gh-radar/webapp run test`) | 124 files · 2431 passed · 1 skipped |
| `curl :3100/privacy` / `curl :3100/privacy-x` (쿠키 없음) | `200` / `307` → `/login?next=%2Fprivacy-x` |
| acceptance grep | `isPublicPath(pathname)` 1 · 미들웨어 `const PUBLIC_PREFIXES` 0 · `/login` 분기 1 · `"/privacy"` 1 · public-path `^import` 0 · page `use client\|fetch(\|useEffect\|useState` 0 · `CenterShell` 3 · 제목 1 · `확인 필요` 0 · `부록` 0 · e2e `privacy` 9 |
| 범위 | `git diff --name-only 1bffb0c1^ HEAD -- webapp/` = 6개 = `files_modified` |

## 스크린샷 4장(시각 확인)

dev 서버 :3100(이미 떠 있던 이 저장소의 `next-server` 재사용 — 새로 띄우거나 kill 하지 않음) · 쿠키 없음 · full-page.

- `/private/tmp/claude-501/-Users-alex-repos-gh-radar/a652772a-7772-4ec2-91e9-e67799f1bb2c/scratchpad/privacy-390-light.png`
- `/private/tmp/claude-501/-Users-alex-repos-gh-radar/a652772a-7772-4ec2-91e9-e67799f1bb2c/scratchpad/privacy-390-dark.png`
- `/private/tmp/claude-501/-Users-alex-repos-gh-radar/a652772a-7772-4ec2-91e9-e67799f1bb2c/scratchpad/privacy-1280-light.png`
- `/private/tmp/claude-501/-Users-alex-repos-gh-radar/a652772a-7772-4ec2-91e9-e67799f1bb2c/scratchpad/privacy-1280-dark.png`

측정: 390px 는 `documentElement.scrollWidth = 390` 이라 페이지가 넘치지 않는다. 표는 각자 컨테이너 안에서 가로로 스크롤된다(640 · 358 · 820 / 상자 358). 1280px 는 표 3개가 모두 848 로 상자에 딱 맞는다.

**시각 결함 1건 수정:** 1280px 에서 6열 국외 이전 표가 848px 본문 폭을 32px 넘어 데스크톱에 쓸모없는 가로 스크롤이 생겼다. 표 최소 폭을 880 → 820px 로 줄여 고쳤다(커밋 `1155286b` 에 포함).

## Task Commits

1. **Task 1: `isPublicPath` 순수 모듈 추출 + `/privacy` 공개 prefix + 판정 표**
   - `1bffb0c1` refactor — 동작 불변 추출(`/login` · `/auth` 그대로) · 미들웨어 1줄 교체
   - `dbc8062e` test (RED) — 판정 표. `/privacy` 3건 + prefix 동일성 1건이 단언에서 실패(`RED_EVIDENCE_OK` · 13 tests · 4 fail)
   - `5be45d01` feat (GREEN) — `"/privacy"` 추가 · D-11 JSDoc
2. **Task 2: `/privacy` 정적 RSC 페이지 + 페이지 테스트 + e2e 2케이스**
   - `5952513c` test (RED) — 페이지 테스트 + 빈 골격 page.tsx. 9건이 단언에서 실패(`RED_EVIDENCE_OK` · 10 tests · 9 fail — 「미정 표식·부록 0」 가드 1건은 빈 페이지에서도 참)
   - `1155286b` feat (GREEN) — 승인본 1~13절 페이지 · 표 최소 폭 수정 포함
   - `3a400d2f` test — auth-guards e2e `/privacy` 공개 · `/privacy-x` 차단

**Plan metadata:** 이 SUMMARY 커밋(docs: complete plan)

## Files Created/Modified

- `webapp/src/lib/supabase/public-path.ts` — 공개 prefix 상수와 경계 판정 함수(순수 모듈)
- `webapp/src/lib/supabase/middleware.ts` — 로컬 상수를 지우고 `isPublicPath` import · 머리 주석 3번 항목만 새 모듈을 가리키게 고침
- `webapp/src/lib/supabase/__tests__/public-path.test.ts` — 통과 표 5 · 차단 표 7 · prefix 동일성 1
- `webapp/src/app/privacy/page.tsx` — 개인정보처리방침 RSC 페이지 · `metadata`
- `webapp/src/app/privacy/__tests__/page.test.tsx` — 절 제목 13개 순서 · 항목표 · 시행일 자리표시 · 미정/부록 0 · mailto · metadata
- `webapp/e2e/specs/auth-guards.spec.ts` — `/privacy` 2케이스 · 머리 「검증:」 2줄 · 루트 케이스 주석 갱신

## Decisions Made

- 시행일은 22-02 인계대로 자리표시 「2026년 ○월 ○일」 을 페이지(h1 아래 한 줄 · 13절)와 테스트에 그대로 옮겼다. 22-07 이 push 날짜로 초안 frontmatter `effective_date` · 13절 · `page.tsx` 의 `EFFECTIVE_DATE` · `page.test.tsx` 의 `EFFECTIVE_DATE_PLACEHOLDER` 를 함께 채운다.
- 초안 제목은 「GH Trade 개인정보처리방침」 이지만, 플랜 behavior·metadata 대로 h1 을 「개인정보처리방침」 으로 뒀다(서비스 이름은 헤더 로고와 탭 제목 「· GH Trade」 에 있다).
- 초안 머리말의 `https://trade.jx1.io`(백틱)와 11절 기관 주소는 링크로 만들지 않고 텍스트로 옮겼다. 문구 추가를 피하려는 선택이다. 링크는 플랜이 지시한 연락처 mailto 하나뿐이다.
- 목록은 초안의 번호 목록(1. 2. …)을 `list-decimal` 로, `-` 목록(11절)을 `list-disc` 로 옮겼다. 플랜의 「목록은 `list-disc`」 를 번호 목록에까지 적용하면 초안의 번호가 사라지므로 번호를 살렸다.

## Deviations from Plan

### 1. [Rule 3 - Blocking] 시행일 단언은 날짜가 아니라 자리표시다

- **발견:** Task 2 behavior 「13절에 초안 `effective_date` 날짜 문자열이 있다」
- **문제:** 승인 초안의 `effective_date` 는 `TBD-22-07-push` 이고 13절은 「2026년 ○월 ○일」 이다. 날짜가 22-07 push 전까지 정해지지 않는다(22-02 인계).
- **처리:** 페이지와 테스트 모두 자리표시 「2026년 ○월 ○일」 을 그대로 쓰고 단언한다. 테스트 머리 주석에 22-07 이 함께 바꾼다고 적었다.
- **커밋:** `5952513c` · `1155286b`

### 2. [Rule 3 - Blocking] RED 유효성(#3770)을 위해 커밋 순서를 조정했다

- **문제:** 모듈이 없는 상태의 RED 는 로드 실패라 `check tdd-red-evidence` 가 INVALID_RED 로 판정한다.
- **처리:** Task 1 은 `isPublicPath` 를 동작 불변 refactor(`1bffb0c1`)로 먼저 추출하고, 그 뒤 RED(`dbc8062e`) → GREEN(`5be45d01`) 순서로 커밋했다. Task 2 는 RED 커밋에 빈 골격 `page.tsx`(metadata 빈 값 · 빈 article)를 넣었다. 두 RED 모두 `RED_EVIDENCE_OK` 를 받았다.
- **참고:** vitest `tap-flat` 출력에는 node `--test` 형 `# tests/# pass/# fail` 요약 줄이 없다. 그래서 `ok`/`not ok` 줄 수로 요약을 파생해 레코드에 붙였다(scratchpad `red-record.cjs` · `red1.json` · `red2.json`).

### 3. [Rule 1 - Bug] 1280px 에서 6열 표가 넘쳐 가로 스크롤이 생겼다

- **발견:** Task 2 ④ 시각 확인. 표 폭 880 이 본문 상자 848 보다 컸다.
- **처리:** 표 최소 폭을 820px 로 줄였다. 재측정 결과 1280px 에서 표 3개 모두 848 ≤ 848 이고, 390px 에서는 여전히 컨테이너 안에서 스크롤된다.
- **커밋:** `1155286b`

### 4. [계획 편차 — e2e 커밋 분리] e2e 2케이스를 별도 `test(22-03)` 커밋으로 뒀다

- 페이지 GREEN(`1155286b`)과 회귀 e2e(`3a400d2f`)를 나눠 커밋했다. e2e 는 GREEN 뒤에 추가한 회귀 테스트이므로 추가 즉시 통과한다.

---

**Total deviations:** 4개(Rule 3 2 · Rule 1 1 · 커밋 구성 1)
**Impact on plan:** 기능 범위 변화는 없다. 웹 변경은 계획한 6개 파일 안에 있다.

## TDD Gate Compliance

- Task 1: `refactor` `1bffb0c1`(동작 불변 사전 추출) → RED `dbc8062e` → GREEN `5be45d01` — RED_EVIDENCE_OK
- Task 2: RED `5952513c` → GREEN `1155286b` → e2e `3a400d2f` — RED_EVIDENCE_OK
- 위반 없음(`test(22-03)` 커밋이 각 `feat(22-03)` 보다 먼저 있다).

## Known Stubs

| 파일 | 줄 | 내용 | 해소 |
|------|----|------|------|
| `webapp/src/app/privacy/page.tsx` | 22 | `EFFECTIVE_DATE = '2026년 ○월 ○일'` — 시행일 자리표시(22-02 인계 · 의도된 것) | 22-07 이 웹 push 날짜로 채운다. `page.test.tsx` 의 `EFFECTIVE_DATE_PLACEHOLDER` 와 초안 `effective_date` · 13절도 함께 바꾼다 |

WINDOWS 원장(`gsd-tools windows append`)에 이 항목을 추가하려 했지만 실패했다(`Ledger counts disagree with entries: frontmatter 4/0/13/17 but entries yield 3/0/14/17`). 원장 자체의 기존 불일치라 이 플랜 범위 밖이므로 고치지 않았다. 22-07 push 게이트에서 위 표를 직접 확인해야 한다.

## Issues Encountered

- 저장소 기본 규칙상 `master` 는 보호 브랜치로 판정된다(`git.base-branch --is-protected master` = true). 오케스트레이터 지시(순차 실행 · 메인 체크아웃 · branching_strategy none · 22-01/22-02 도 master 커밋)에 따라 master 에 커밋했다.
- **push 하지 않음.** 이 저장소에서 master push 는 곧 webapp 프로덕션 배포다. push 결정은 22-07 몫이다. `/privacy` 는 정적 RSC 라 relay·백엔드 결합이 없고, push 게이트의 백엔드 diff 는 0 이다.

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 22-07: push 전에 시행일 자리표시 4곳(초안 frontmatter · 초안 13절 · `page.tsx` `EFFECTIVE_DATE` · `page.test.tsx` `EFFECTIVE_DATE_PLACEHOLDER`)을 push 날짜로 채운 뒤 page 테스트를 다시 돌린다. push 뒤 `https://trade.jx1.io/privacy` 를 비로그인으로 열어 200 인지 확인한다.
- 스토어 방침 URL 은 `https://trade.jx1.io/privacy` 다(push 후 유효).

---
*Phase: 22-gh-trade-ios-testflight-android-play*
*Completed: 2026-09-27*

## Self-Check: PASSED

- 생성 파일 4개 존재 · 커밋 6개(1bffb0c1 · dbc8062e · 5be45d01 · 5952513c · 1155286b · 3a400d2f) 존재 확인
