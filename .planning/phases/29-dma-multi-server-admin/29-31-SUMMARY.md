---
phase: 29-dma-multi-server-admin
plan: 31
subsystem: ui
tags: [admin, sheet, radix-dialog, non-modal, touch-target, a11y, use-field-save, gap-closure]
status: complete

requires:
  - phase: 29-26
    provides: "Admin 화면(/admin/users · /admin/servers) 프로덕션 반영 — AdminSheet 골격 · ServerCard · AccountEditor · useFieldSave"
provides:
  - "SheetContent 선택 prop overlay(기본 true — 다른 시트 무변경)"
  - "AdminSheet 데스크톱(≥640) 비모달 패널 — modal=false · 오버레이 없음 · 바깥 상호작용으로 닫히지 않음(닫기 × · Esc)"
  - "users-client 편집 · 생성 시트 상호 배타(비모달에서 겹침 방지)"
  - "모바일(640 미만) 터치 타깃 36px — 계좌 버튼 4곳 · 역할 세그먼트 칸 · 서버 라디오 칩 · 계좌 서버 알약(데스크톱 종전 높이)"
  - "서버 카드 「사용 중」 이유 상시 한 줄 server-in-use-note · Switch aria-describedby · 켜진 모양 유지"
  - "AccountAddForm 중복 계좌 가드 — ACCOUNT_EDITOR_TEXT.duplicate · data-slot=admin-account-dup"
  - "useFieldSave(save, { releaseOn }) — 성공 뒤 재조회 데이터 동일성이 바뀌면 누른 값 해제"
affects: [29-34, 29-38, 29-41]

tech-stack:
  added: []
  patterns:
    - "비모달 시트 = Radix Dialog modal={false} + onInteractOutside preventDefault + 오버레이 opt-out — 목록이 남는 우측 패널"
    - "모바일만 키우는 터치 타깃 = h-9 sm:<종전> (뷰포트 640 경계 — 시트 · 앱 셸과 같은 경계)"
    - "즉시 저장 의도 값 해제 = 성공 시점 재조회 객체를 기억 → 렌더 중 동일성 비교로 파생(효과 · 깜빡임 없음)"

key-files:
  created:
    - webapp/src/components/admin/__tests__/server-card.test.tsx
  modified:
    - webapp/src/components/ui/sheet.tsx
    - webapp/src/components/admin/admin-sheet.tsx
    - webapp/src/components/admin/users-client.tsx
    - webapp/src/components/admin/server-card.tsx
    - webapp/src/components/admin/role-segment.tsx
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/use-field-save.ts
    - webapp/src/components/admin/servers-client.tsx
    - webapp/src/components/admin/__tests__/admin-sheet.test.tsx
    - webapp/src/components/admin/__tests__/users-client.test.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/src/components/admin/__tests__/servers-client.test.tsx
    - webapp/e2e/specs/admin.spec.ts
    - webapp/e2e/specs/admin-servers.spec.ts

key-decisions:
  - "WR-06 서버 쪽 create-only 플래그(p_create_only)는 넣지 않음 — Admin 1명 운영이라 두 Admin 동시 추가 경합이 없고, RPC 시그니처를 바꾸면 오버로드가 생긴다. 화면 가드(정규화 키 · 의도 계좌만)로 닫는다"
  - "비모달 전환으로 데스크톱에서 목록 · 머리 「+ 사용자」 가 시트를 연 채 눌리므로 users-client 의 편집 · 생성 시트를 서로 닫게 했다(플랜은 users-client 무변경이라 했으나 겹침 결함이 이 변경에서 생긴다 — Rule 1)"
  - "useFieldSave releaseOn 은 effect 없이 렌더 중 파생(heldSince 상태 · Object.is) — react-hooks set-state-in-effect 회피 · 재조회 전 깜빡임 없음. 키를 두지 않은 호출자는 종전 동작"
  - "서버 카드 이유 줄은 토글 아래 오른쪽 정렬 한 줄 — host:port 줄과 같은 행에 두면 390 폭에서 주소가 잘린다"

patterns-established:
  - "AdminSheet 데스크톱 = 비모달 패널(목업 A .panel) · 폰 = 모달 바텀시트 + 스크림"
  - "끌 수 없는 컨트롤은 흐리지 않고(disabled:opacity-100) 이유를 상시 한 줄 + aria-describedby 로"

requirements-completed: [ADMIN-09, ADMIN-10]

coverage:
  - id: D1
    description: "데스크톱 Admin 시트 비모달 — 오버레이 0개 · 바깥 pointerdown/focus 로 안 닫힘 · Esc/× 는 닫음 · 폰은 종전 모달"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/admin-sheet.test.tsx#데스크톱(≥640) → 비모달 패널 · 오버레이 0개 · 목록(바깥) pointerdown · focus 로 닫히지 않는다 · Esc 는 닫는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/admin-sheet.test.tsx#폰(<640) → 모달 바텀시트 · 오버레이 1개 · 바깥 pointerdown 이 닫는다(종전)"
        status: pass
      - kind: integration
        ref: "webapp/src/components/admin/__tests__/users-client.test.tsx#데스크톱 — 시트를 연 채 다른 행을 누르면 시트가 그 사용자로 바뀐다 · 오버레이 없음 · 생성 시트와 겹치지 않는다"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A3b 데스크톱 비모달 — 오버레이 없음 · 행 사이 이동 (1080)"
        status: unknown
    human_judgment: true
    rationale: "e2e P29-A3b 가 워크트리에서 미실행(비밀 파일 가드로 Supabase 테스트 env 없음) — 메인 세션 · 29-41 전체 회귀에서 실행해 green 을 확인해야 한다"
  - id: D2
    description: "모바일 터치 타깃 36px 이상(계좌 버튼 · 역할 세그먼트 · 라디오 칩) · 데스크톱 종전 높이"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/server-card.test.tsx#주문/시세 라디오 칩 = 폰 h-9(36px) · 데스크톱 sm:h-8(32px, 종전)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A3c 터치 타깃 — 계좌 버튼 · 역할 세그먼트 높이 (390/1080)"
        status: unknown
      - kind: e2e
        ref: "webapp/e2e/specs/admin-servers.spec.ts#P29-S1 (390/1080) 라디오 칩 높이"
        status: unknown
    human_judgment: true
    rationale: "실측 높이는 Playwright 만 잴 수 있는데 워크트리에서 미실행 — 클래스 계약만 단위로 고정됐다"
  - id: D3
    description: "서버 카드 「사용 중」 이유 상시 한 줄 · aria-describedby · 켜진 모양(흐림 없음) · 비해당 서버는 줄 없음"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/server-card.test.tsx#ServerCard — 끌 수 없는 이유 상시 한 줄 (UI-REVIEW-6) (4건)"
        status: pass
    human_judgment: false
  - id: D4
    description: "WR-06 계좌 추가 중복 가드 — 정규화 같은 키 의도 계좌면 안내 줄 · 추가 비활성 · PUT 0건 · 87 전용 계좌는 막지 않음"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#이미 있는 의도 계좌(정규화 같은 키) → 「이미 있는 계좌」 한 줄 · 「추가」 비활성 · 제출해도 PUT 0건 · 증권사를 바꾸면 줄이 사라진다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#87 에만 있는 계좌(의도 없음)와 같은 번호는 막지 않는다 — 의도 계좌로 새로 올린다"
        status: pass
    human_judgment: false
  - id: D5
    description: "IN-03 releaseOn — 시세 주 서버 · 주문 서버 라디오가 성공 뒤 재조회 값을 따름(재조회 전엔 누른 값 유지)"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/servers-client.test.tsx#ServersClient — 성공 뒤 재조회 값이 정본 (IN-03 · releaseOn) (2건)"
        status: pass
    human_judgment: false

actuals:
  tokens: 12500
  tasks: 3
  commits: 6
plan_head_before: f45d11cebad2244f836fed94978572243caced3f
plan_head_after: c9c719d28d5e04463aebd1a87f218785cdda3568

duration: 10min
completed: 2026-10-10
---

# Phase 29 Plan 31: Admin 데스크톱 비모달 시트 · 모바일 터치 타깃 · 사용 중 이유 줄 · 계좌 중복 가드 · 즉시 저장 해제 Summary

**데스크톱 Admin 시트를 Radix `modal={false}` + 오버레이 opt-out + 바깥 상호작용 무시로 목업 A 의 비모달 우측 패널로 바꾸고, 폰 컨트롤을 `h-9 sm:<종전>` 으로 36px 로 키우며, 끌 수 없는 서버 카드에 상시 이유 줄 · `aria-describedby` 를 달고, 계좌 추가 중복을 화면에서 막고, `useFieldSave` 에 `releaseOn` 을 더해 서버 라디오가 재조회 값을 따르게 했다.**

## Performance

- **Duration:** 약 10분(측정 07:55Z → 08:05Z)
- **Started:** 2026-10-10T07:55:02Z
- **Completed:** 2026-10-10T08:05Z
- **Tasks:** 3/3
- **Files modified:** 15(소스 8 · 테스트 7)

## Accomplishments

- **UI-REVIEW-2 · D-14 「목록은 남는다」** — 640 이상에서 `AdminSheet` 가 비모달 패널이다. 스크림 · blur 가 없고(`[data-slot="sheet-overlay"]` 0개), 포커스 트랩 · 바깥 aria-hidden 이 없으며, 목록의 다른 행을 누르면 시트가 닫히지 않고 그 사용자로 바뀐다. 닫기는 × · Esc. 640 미만 바텀시트는 종전 모달 + 스크림. `SheetContent overlay` 는 opt-in(기본 true)이라 chat-sheet · 앱 셸 drawer 는 무변경. deferred-items 29-17 「데스크톱 Admin 시트의 배경 흐림」 이 닫혔다.
- **UI-REVIEW-3** — 계좌 「제거」 · 「+ 계좌 추가」 · 추가 폼 「취소」/「추가」(`ACCOUNT_BUTTON = h-9 px-2.5 sm:h-7`), 역할 세그먼트 칸(`ADMIN_SEGMENT_ITEM` `h-9 sm:h-7` — 생성 시트 · 승인 세그먼트도 같은 상수), 서버 라디오 칩(`h-9 sm:h-8`), 계좌 서버 알약(`min-h-9 sm:min-h-0`)이 폰에서 36px, 데스크톱은 종전 28 · 32.
- **UI-REVIEW-6** — 주문/시세 서버(서버 값이든 누른 의도든) 카드는 토글 아래 「주문 서버 · 시세 주 서버는 끌 수 없어요」 한 줄(`server-in-use-note` · `useId`)을 늘 보이고 Switch 가 `aria-describedby` 로 가리킨다. 그때만 `disabled:opacity-100` 으로 켜진 모양을 유지(커서 not-allowed · `title` 유지). 저장 경로가 없어 잠긴 다른 경우는 종전 흐림.
- **WR-06** — `AccountAddForm` 이 의도 계좌 키 집합(`editable` 의 `accountKeyOf`)을 받아, 입력의 정규화 키가 있으면 「이미 있는 계좌 — 위 계좌 줄에서 서버를 고르세요」(`admin-account-dup` · role=alert 아님) · 「추가」 비활성 · 제출해도 PUT 0건. 87 전용 계좌(의도 없음)는 막지 않는다.
- **IN-03** — `useFieldSave(save, { releaseOn })`: 성공 시점의 `releaseOn` 을 기억하고 렌더의 `releaseOn` 동일성이 바뀌면(성공 뒤 첫 재조회 도착) `value` 를 놓는다. 성공 직후 · 재조회 전에는 누른 값 유지(깜빡임 없음), 새 조작 · 실패는 해제 대기를 지운다. `servers-client` 의 시세 주 서버(`releaseOn = state.data`) · 주문 서버(`releaseOn = 그 증권사 servers`)에 붙였다. 역할 세그먼트(user-sheet)는 29-34 몫.

## Task Commits

TDD 로 각 태스크를 RED → GREEN 두 커밋으로 남겼다.

1. **Task 1 (트레이서): 데스크톱 Admin 시트 비모달 패널**
   - RED `bd1cb42c` test(29-31): Admin 데스크톱 시트 비모달 실패 테스트 — 오버레이 0개 · 바깥 클릭 무시 · 행 사이 이동
   - GREEN `5588b95d` fix(29-31): Admin 데스크톱 시트 비모달 패널 — 목록이 남고 행 사이를 오간다
2. **Task 2: 모바일 터치 타깃 36px · 사용 중 이유 한 줄**
   - RED `8f0fd425` test(29-31): Admin 모바일 터치 타깃 · 사용 중 이유 한 줄 실패 테스트
   - GREEN `98a5b7ce` fix(29-31): Admin 모바일 터치 타깃 36px · 사용 중 토글 이유 한 줄
3. **Task 3: WR-06 계좌 추가 중복 가드 · IN-03 releaseOn**
   - RED `44d0969c` test(29-31): 계좌 추가 중복 · 즉시 저장 재조회 정본 실패 테스트
   - GREEN `c9c719d2` fix(29-31): 계좌 추가 중복 막기 · 즉시 저장 값이 재조회를 따르게

REFACTOR 커밋 없음(정리할 것이 없었다). GREEN 커밋 형식은 플랜이 지정한 `fix(29-31)` 를 따랐다.

## TDD Gate Compliance

| Task | RED | GREEN | RED 증거(의미 판정) |
|------|-----|-------|------|
| 1 | `bd1cb42c` | `5588b95d` | 데스크톱 케이스가 `expect(overlays()).toHaveLength(0)` 에서 「got 1」 로 실패 — 계획한 단언(오버레이가 그려짐)이 원인. 폰 케이스는 종전 동작 회귀 가드라 RED 에서도 통과가 맞다 |
| 2 | `8f0fd425` | `98a5b7ce` | 3건 실패: 이유 줄 `null` · 시세 의도 카드 이유 줄 없음 · 라디오 칩 클래스에 `h-9`/`sm:h-8` 없음. 비해당 서버 2건은 회귀 가드라 통과 |
| 3 | `44d0969c` | `c9c719d2` | 중복 줄 `null`(계획한 단언) · servers-client 2건은 「재조회 전 누른 값 유지」 단언은 통과하고 마지막 「재조회 뒤 KB120 checked」 `waitFor` 에서 실패 — IN-03 결함 그 자체 |

RED 는 vitest verbose 출력의 대상 테스트 실패로 판정했다(`gsd_run check tdd-red-evidence` 기록 파일은 만들지 않음 — 이 플랜은 `type: execute` 이고 phase `tdd_mode` 가 꺼져 있다). 어느 RED 도 import · 문법 · 픽스처 오류가 아니었다.

## Files Created/Modified

- `webapp/src/components/ui/sheet.tsx` — `SheetContent` 선택 prop `overlay`(기본 true)
- `webapp/src/components/admin/admin-sheet.tsx` — 데스크톱 `modal={false}` · `overlay={false}` · `onInteractOutside` preventDefault, 머리 주석 D-14 비모달 문단
- `webapp/src/components/admin/users-client.tsx` — `openUser`(생성 시트 닫고 선택) · 「+ 사용자」 가 편집 시트를 닫음
- `webapp/src/components/admin/server-card.tsx` — 이유 줄 · `aria-describedby` · `disabled:opacity-100`(inUse 만) · 라디오 칩 `h-9 sm:h-8`
- `webapp/src/components/admin/role-segment.tsx` — `ADMIN_SEGMENT_ITEM` `h-9 sm:h-7`
- `webapp/src/components/admin/account-editor.tsx` — `ACCOUNT_BUTTON` · `SERVER_PILL` 최소 높이 · `existingKeys` 중복 가드 · `ACCOUNT_EDITOR_TEXT.duplicate`
- `webapp/src/components/admin/use-field-save.ts` — `releaseOn` 옵션 · IN-03 머리 주석
- `webapp/src/components/admin/servers-client.tsx` — 시세 · 주문 `useFieldSave` 에 `releaseOn`
- `webapp/src/components/admin/__tests__/server-card.test.tsx` (신규) — 이유 줄 4건 · 라디오 칩 클래스 1건
- `webapp/src/components/admin/__tests__/admin-sheet.test.tsx` — 비모달 · 폰 모달 2건
- `webapp/src/components/admin/__tests__/users-client.test.tsx` — 시트 연 채 행 전환 · 생성 시트 배타 1건
- `webapp/src/components/admin/__tests__/account-editor.test.tsx` — 중복 계좌 PUT 0건 · 87 전용 허용 2건
- `webapp/src/components/admin/__tests__/servers-client.test.tsx` — 재조회 정본 2건
- `webapp/e2e/specs/admin.spec.ts` — P29-A3b(비모달 행 이동) · P29-A3c(390/1080 높이)
- `webapp/e2e/specs/admin-servers.spec.ts` — P29-S1 에 라디오 칩 높이 · KB120 이유 줄 · 토글 opacity 1

## Decisions Made

- WR-06 서버 쪽 create-only 플래그는 넣지 않았다 — 갭 문장의 「필요하면」 단서이고, Admin 1명 운영에서 두 Admin 동시 추가 경합은 없으며 RPC 시그니처를 바꾸면 오버로드가 생긴다.
- `releaseOn` 해제는 effect 가 아니라 렌더 중 파생이다(성공 시점 객체를 상태로 기억 → `Object.is` 비교). 재조회 전 깜빡임이 없고 set-state-in-effect 를 피한다.
- 서버 카드 이유 줄은 토글 아래 오른쪽 정렬 독립 줄 — host:port 와 한 행에 두면 390 폭에서 주소가 잘린다(약 110px + 240px > 카드 안쪽 330px).
- 문구는 G-1 경계대로 기존 `SERVER_CARD_TEXT.inUse` 를 그대로 썼다(「주문 서버」 → 「기본 주문 서버」 교체와 이 플랜 테스트 단언 갱신은 29-38).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 비모달 데스크톱에서 편집 시트 · 생성 시트가 겹쳐 열림**
- **Found during:** Task 1
- **Issue:** 모달일 때는 시트가 목록 · 머리 버튼을 막아 생기지 않던 조합 — 편집 시트를 연 채 「+ 사용자」 를 누르거나, 생성 시트를 연 채 행을 누르면 같은 자리(우측 440)에 시트 두 개가 겹친다.
- **Fix:** `users-client.tsx` 에 `openUser`(생성 시트 닫고 선택) · 「+ 사용자」 클릭이 선택을 비움. 플랜 ③은 users-client 무변경이라 했지만 이 결함은 Task 1 변경이 만든다. 이 웨이브에서 users-client 를 다른 플랜이 건드리지 않음을 확인했다.
- **Files modified:** webapp/src/components/admin/users-client.tsx, webapp/src/components/admin/__tests__/users-client.test.tsx
- **Verification:** users-client 통합 테스트(옛 코드로 되돌려 실행 → 실패 확인 후 복원 → 통과)
- **Committed in:** `5588b95d`

**2. [Rule 3 - Blocking] verify 명령의 `cd /Users/alex/repos/gh-radar` 를 워크트리 루트로 실행**
- **Found during:** Task 1~3 verify
- **Issue:** 플랜 `<automated>` 가 메인 체크아웃 절대 경로로 `cd` 한다 — 그대로 돌리면 이 워크트리가 아니라 메인 트리를 검증한다(worktree-path-safety step 0c 가 막는 경우).
- **Fix:** 같은 명령을 워크트리 루트(`.claude/worktrees/agent-ae491c98afbe1e7d9`)에서 실행했다. 플랜 문장은 고치지 않았다 — 다음 플랜도 같은 경로를 쓰면 같은 처리가 필요하다.
- **Verification:** shared build · webapp typecheck · 지정 vitest 파일 전부 green
- **Committed in:** —(실행 방식)

**3. [Rule 3 - Blocking] 워크트리 의존성 설치**
- **Found during:** Task 1
- **Issue:** 워크트리에 `node_modules` 가 없었다.
- **Fix:** `pnpm install --frozen-lockfile --prefer-offline`(lockfile 그대로 · 새 패키지 없음 · 스토어 재사용 1191 · 다운로드 0)
- **Committed in:** —(산출물 없음 · gitignore)

**4. [자체 보강] 비모달 행 전환의 자동 증거를 RTL 통합 테스트로 추가**
- e2e 가 워크트리에서 돌지 않아(아래 Issues) 트레이서의 통합 주장(시트를 연 채 다른 행 → 그 사용자 · 시트 1개 · 오버레이 0)을 `users-client.test.tsx` 로도 고정했다. 옛 코드에서 실패함을 확인했다.

---

**Total deviations:** 3 auto-fixed(Rule 1 1건 · Rule 3 2건) + 테스트 보강 1건
**Impact on plan:** 겹침 수정은 비모달 전환의 직접 결과라 필요했다. 범위 확장 없음.

## Issues Encountered

- **e2e 미실행(워크트리).** Playwright `auth.setup.ts` 가 `webapp/.env.test.local` · `.env.local`(Supabase 테스트 로그인)을 요구하는데 워크트리에 없고, 메인 체크아웃 파일 복사는 비밀 파일 읽기 가드가 막았다(우회하지 않음 — 29-28 등 선례와 같다). 따라서 아래 e2e 는 **작성만 하고 실행하지 못했다**. 메인 세션 또는 29-41 전체 회귀에서 한 번 돌려야 한다:
  - `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts e2e/specs/admin-servers.spec.ts --workers=1 --reporter=list`
  - 새 케이스: `P29-A3b`(1080 비모달 행 이동) · `P29-A3c`(390 ≥36 · 1080 = 28) · `P29-S1`(390 라디오 칩 ≥36 · 1080 = 32 · KB120 이유 줄 · 토글 opacity 1)
  - 실패하면 볼 곳: P29-A3c 1080 의 「제거」 는 `Button size="sm"`(`h-8`)을 `sm:h-7` 이 덮는다는 전제 — tailwind-merge 가 `h-8` 을 `h-9` 로 갈고 `sm:h-7` 은 따로 둔다(단위 클래스 계약으로는 확인).
- 공유 `.planning/WINDOWS.md` 에는 unrun-verify 를 적지 않았다 — 병렬 워크트리 병합 충돌을 피하려고(Phase 29 의 다른 실행기도 적지 않음). 오케스트레이터가 필요하면 위 e2e 한 줄을 `--kind unrun-verify` 로 올리면 된다.
- 시각 결함: 손댄 표면에서 줄바꿈 · 잘림 · 겹침은 실측하지 못했다(e2e 미실행). 이유 줄 위치는 위 Decisions 의 폭 계산으로 잘림을 피했다.

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 29-34 가 user-sheet 역할 세그먼트에 같은 `releaseOn` 옵션을 붙이면 된다(이 플랜은 그 파일을 건드리지 않았다).
- 29-38 이 「주문 서버」 → 「기본 주문 서버」 문구를 바꿀 때 `server-card.test.tsx` · `admin-servers.spec.ts` 의 `'주문 서버 · 시세 주 서버는 끌 수 없어요'` 단언도 함께 바꿔야 한다.
- 29-41(배포 · 전체 회귀) 전에 위 e2e 를 한 번 실행해 green 을 확인해야 한다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*
