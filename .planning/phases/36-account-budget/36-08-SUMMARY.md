---
phase: 36-account-budget
plan: 08
subsystem: webapp
tags: [webapp, pnl, admin, me, sidebar, e2e, regression-gate, d-17, d-18, tracer]
status: complete

requires:
  - phase: 36-07
    provides: "GET /api/pnl?account=&range= · GET /api/admin/pnl?group=&range= (RPC jsonb 통과 · /me dma_user_ids 늘 [])"
  - phase: 36-10
    provides: "shared pnl.ts(PnlReport · PnlRange · PnlGroupBy · pnlRangeOf · formatPnlDay · formatPnlRangeCaption) · account-budget.ts 포맷(formatPnlManwon · formatManwon1 · formatManwonFloor · pnlToneOf)"
  - phase: 36-03
    provides: "relay 계좌 상태 budgetKrw · 계좌 패널 요약 줄(account-budget-summary) — ⑤ 백스톱 대상"
provides:
  - "webapp/src/lib/pnl-api.ts — fetchMyPnl · fetchAdminPnl (진행 중 요청 합치기)"
  - "webapp/src/components/pnl/pnl-report.tsx — PnlPeriodControl · PnlGroupCard · PnlReportView(상태 4종) · usePnlReport · PNL_RANGE_LABEL"
  - "webapp/src/components/pnl/pnl-admin-client.tsx — PnlAdminClient(?group · ?range 주소 상태 · 묶음 머리)"
  - "webapp/src/app/admin/pnl/page.tsx — /admin/pnl (metadata 제목 「매매손익 · Admin」)"
  - "/me 5번째 탭 「손익」(ME_TABS { v: 'pnl', label: '손익' })"
  - "사이드바 NAV_ADMIN_PNL 「매매손익」(Admin 하위 맨 뒤)"
  - "E2E — fixtures/pnl.ts(mockPnlApi) · admin-pnl.spec · me.spec 「Phase 36 손익 탭」"
affects: [36-09]

actuals:
  tokens: 24489
  tasks: 3
  commits: 5
plan_head_before: 47bf4b6f1931e005f2805f5bde4bc5f873477c50
plan_head_after: d637a8e57b164fbaff87a07ec9c4a3a4dfa8a005

tech-stack:
  added: []
  patterns:
    - "조회 훅 상태를 그 상태를 만든 키와 함께 둔다(usePnlReport) — 키가 바뀐 첫 렌더(effect 전)는 곧바로 loading. 이전 응답을 새 라벨로 한 프레임 비추지 않는다"
    - "/me · 어드민이 같은 부품(PnlReportView) — 차이는 renderHeader(묶음 머리) 유무뿐"
    - "router.replace 로 쿼리를 바꾸는 클라이언트 페이지의 문서 제목은 서버 metadata 가 정본(주문로그 페이지와 같은 이유)"

key-files:
  created:
    - webapp/src/lib/pnl-api.ts
    - webapp/src/components/pnl/pnl-report.tsx
    - webapp/src/components/pnl/pnl-admin-client.tsx
    - webapp/src/components/pnl/__tests__/pnl-report.test.tsx
    - webapp/src/components/pnl/__tests__/pnl-admin-client.test.tsx
    - webapp/src/app/admin/pnl/page.tsx
    - webapp/e2e/fixtures/pnl.ts
    - webapp/e2e/specs/admin-pnl.spec.ts
  modified:
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/lib/launch-format.ts
    - webapp/e2e/specs/me.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "펼침 기본 복원은 별도 리셋 키 없이 로딩 상태로 처리 — 기간 · 묶음 · 계좌가 바뀌면 카드가 Skeleton 으로 내려갔다 새로 서므로 「첫 묶음 첫 행만 열림」 으로 돌아간다"
  - "/me 계좌 미정 상자를 잔고 · 손익 탭 공용 MeAccountsLoading 으로 뽑음(data-slot 은 탭마다 따로 — me-accounts-loading · me-pnl-accounts-loading)"
  - "계좌별 묶음 증권사 배지 = 계좌 체결에 KB 게이트웨이가 하나라도 있으면 KB(36-07 RPC 정렬 키와 같은 규칙) · launch-format BROKER_LABEL 을 export 해 같은 낱말 한 벌"
  - "계정별 부제는 같은 계좌번호(KB120/KB121)를 한 번만 적는다 · 「미상」 부제는 증권사 낱말 없이 계좌번호만(문구표 그대로)"
  - "화면은 정렬하지 않는다 — 일자 최신순 · 종목 손익 큰 순 · 미상 맨 뒤 · KB → 교보는 RPC 정본"

patterns-established:
  - "큰 값 백스톱 E2E 는 셀 요소의 scrollWidth ≤ clientWidth 로 잰다(폰 390 · lg 1024 두 폭)"

requirements-completed: []

coverage:
  - id: D1
    description: "/me 「손익」 탭 — 5탭 순서 · 배지 없음 · 고른 계좌 fetchMyPnl(계좌, '30') · 칩/기간 변경 재조회 · 기간 주소 미기록 · 계좌 미정 로딩 상자"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx (B1 · B7 · B7b)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts P36-pnl-1 · P36-pnl-2 · PEY-1"
        status: pass
    human_judgment: false
  - id: D2
    description: "공통 부품 — 요약 행(18/600 손익색) · 일자 행 · 펼침(행마다 따로 · 첫 행 기본) · 종목명 폴백 · 상태 4종 · 기간 컨트롤"
    verification:
      - kind: unit
        ref: "webapp/src/components/pnl/__tests__/pnl-report.test.tsx (9 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/admin/pnl — 기본 user/30 · 계좌별 전환 · 잘못된 키만 지움 · 묶음 머리(미상 · 증권사 배지) · 오류 재시도 · 문서 제목"
    verification:
      - kind: unit
        ref: "webapp/src/components/pnl/__tests__/pnl-admin-client.test.tsx (7 tests)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-pnl.spec.ts P36-AP1~5"
        status: pass
    human_judgment: false
  - id: D4
    description: "사이드바 Admin 하위 「사용자 · 서버 · 발사 · 매매손익」 · /admin/pnl 활성 · trader 미노출"
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts TREE_LINKS"
        status: pass
    human_judgment: false
  - id: D5
    description: "UI E2 overflow 백스톱 — 「123,456,789만」 이 매매손익 데스크톱 매수 칸 · 요약 칸 · 폰 아랫줄 · 계좌 패널 요약 줄에서 잘리지 않음(390 · 1024)"
    verification:
      - kind: e2e
        ref: "me.spec P36-pnl-3 · P36-pnl-4 · P36-pnl-5 · admin-pnl.spec P36-AP1 · P36-AP4"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-10-28
---

# Phase 36 Plan 08: 일자별 매매손익 화면(/me 손익 탭 · /admin/pnl) + 전체 회귀 게이트 Summary

**/me 5번째 탭 「손익」 과 /admin/pnl(계정별 | 계좌별)이 한 벌의 부품(기간 컨트롤 · 요약 행 · 일자 행 펼침 · 상태 4종)으로 36-07 손익 API 를 그린다. 사이드바에 「매매손익」 을 더했고, Phase 36 전체 회귀 게이트(unit · pgTAP 4 · E2E)는 모두 green 이다.**

## Performance

- **Duration:** 약 26분
- **Started:** 2026-10-27T15:43:44Z
- **Completed:** 2026-10-27T16:09:58Z (KST 10-28 01:10)
- **Tasks:** 3 (Task 1 트레이서 · Task 2 RED → GREEN · Task 3 E2E + 회귀 게이트)
- **Files:** 신규 8 · 수정 7

## Accomplishments

- **트레이서(/me 「손익」):** 계좌 칩 → `fetchMyPnl(account, range)` → `GET /api/pnl` → 기간 컨트롤 · 요약 행 · 일자 행 펼침. 기간은 탭 안 로컬 상태(기본 30일 · 주소에 싣지 않음). 계좌 미정이면 잔고 탭과 같은 「계좌 정보를 불러오는 중이에요…」.
- **공통 부품 `pnl-report.tsx`:** `PnlPeriodControl`(7일 | 30일 | 90일 + 「이달」 알약 + 「9/28 ~ 10/27」 캡션) · `PnlGroupCard`(머리 · 요약 · lg 7열 머리 · 일자 행 · 펼침) · `PnlReportView`(loading Skeleton · error 「다시 시도」 · empty · data) · `usePnlReport`.
- **/admin/pnl:** `PageHeader` 「매매손익」 + 「계정별 | 계좌별」 세그먼트 · `?group` · `?range` 가 진실 원본(`router.replace` · 잘못된 키만 지움) · 계정별 머리(dma_user_id · 「미상」) · 계좌별 머리(증권사 배지 + 계좌번호 · 부제 id · 계좌명).
- **사이드바:** `NAV_ADMIN_PNL` 「매매손익」 — Admin 하위 맨 뒤 · 모바일 탭바 미포함.
- **E2E:** /me 손익 탭 5건 · /admin/pnl 5건 · 사이드바 순서 · 조 단위 값 백스톱(⑤ 대체 없이 실제 계좌 상태 프레임 `budgetKrw` 로 검증).

## Task Commits

1. **Task 1 (트레이서): /me 손익 탭** — `1ea9d1ee` (feat)
2. **Task 2: /admin/pnl · 사이드바** — RED `e5ba93c4` (test) → GREEN `d8199d6d` (feat)
3. **회귀 게이트 중 발견한 결함 수정** — `bd2c307f` (fix)
4. **Task 3: E2E · 사이드바 순서 · 큰 값 백스톱** — `d637a8e5` (test)

## 회귀 게이트

| # | 명령 | 결과 |
|---|------|------|
| 1 | `pnpm --filter @gh-radar/shared build` | exit 0 |
| 2 | `pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 --reporter=dot` | 25 파일 · 787 passed · failed 0 |
| 3 | `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| 4 | `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| 5 | `pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 --reporter=dot` | 59 파일 · 1737 passed · failed 0 |
| 6 | `pnpm --filter @gh-radar/server run typecheck` | exit 0 |
| 7 | `pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 --reporter=dot` | 1회차 634 passed · **1 failed**(아래) → 재실행 45 파일 · 635 passed · failed 0 |
| 8 | `pnpm --filter @gh-radar/webapp run typecheck` (tsc + tsconfig.e2e) | exit 0 |
| 9 | `pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 --reporter=dot` | 189 파일 · 4893 passed · 1 skipped(기존) · failed 0 |
| 10 | pgTAP `dma_journal_apply.test.sql` | 1..96 · not ok 0 · RESULT PASS |
| 11 | pgTAP `dma_journal_schema.test.sql` | 1..114 · not ok 0 · RESULT PASS |
| 12 | pgTAP `dma_pnl_daily.test.sql` | 1..39 · not ok 0 · RESULT PASS |
| 13 | pgTAP `dma_strategy_read.test.sql` | 1..28 · not ok 0 · RESULT PASS |
| 14 | `playwright test me.spec admin-pnl.spec sidebar-tree.spec admin.spec --workers=1` | **80 passed** · failed 0 |
| 15 | `playwright test trading-workbench.spec --grep "카드 컨테이너\|4c\.\|18\. 폰 밴드" --workers=1` | 4 passed · failed 0 |

- **pgTAP:** 실행함(Docker 29.8.2 · 일회용 로컬 컨테이너 · 원격 접촉 0). 「pgTAP 미실행」 아님.
- **server 1회차 실패 1건:** `tests/routes/admin.test.ts` › 「relay 500 → 200 · relayNotified: false + warn 로그」 가 **5000ms 타임아웃**. 이 플랜은 server 를 건드리지 않았다. 단독 실행 39/39 통과, 전체 재실행 635/635 통과. 그 시각에 다른 세션의 Playwright 가 같이 돌고 있어(아래) CPU 부하로 생긴 타임아웃으로 판단한다. 오케스트레이터가 짚은 `admin-dma.test.ts` 흔들림과는 다른 파일이지만 같은 부류(여러 파일 동시 실행 때만 · 단독 통과)다.
- **E2E 1 · 2회차(무효 처리):** 다른 Claude 세션(메인 트리 `/Users/alex/repos/gh-radar/webapp`)이 같은 시각에 `sidebar-tree.spec` Playwright 를 돌리며 **3100(next dev)과 8090(relay)을 점유**했다. `reuseExistingServer` 때문에 내 실행이 그쪽 dev 서버에 붙어 `/admin/pnl` 이 404 가 나고, relay 8090 을 함께 쓰며 `P32-settings-ui` · `sidebar-tree 1b VI` 가 엇갈려 실패했다. 다른 세션 실행이 끝나 두 포트가 빈 것을 확인한 뒤 다시 돌렸고, 실행 내내 3100 소유자가 이 worktree 뿐인 것을 감시 로그로 확인한 3회차가 위 표의 80 passed 다. 다른 세션 서버는 재사용하지 않았다.

### E2E 백스톱 결과 (UI E2 overflow · 「123,456,789만」)

- **⑤ 대체 없음** — 계좌 상태 픽스처가 `budgetKrw` 를 실을 수 있어(relay 테스트 헬퍼 `FakeAccountStateInput.budgetKrw`) 잔고 탭 요약 줄을 실제 relay 프레임으로 검증했다(P36-pnl-5 · 폰 390 · lg 1024 · `scrollWidth ≤ clientWidth` · 카드 오른쪽 밖 잎 0).
- 매매손익 데스크톱 매수 칸(104px) · 요약 행 매수 칸 · 폰 아랫줄 — /me(P36-pnl-3 · 4) · 어드민(P36-AP1 · AP4) 모두 비잘림 · 페이지 가로 넘침 0.

## Files Created/Modified

- `webapp/src/lib/pnl-api.ts` — `fetchMyPnl` · `fetchAdminPnl`.
- `webapp/src/components/pnl/pnl-report.tsx` — 공통 부품 · 조회 훅.
- `webapp/src/components/pnl/pnl-admin-client.tsx` — /admin/pnl 본문 · 세그먼트 · 묶음 머리.
- `webapp/src/app/admin/pnl/page.tsx` — 페이지 셸 · metadata 제목.
- `webapp/src/components/trading/me-client.tsx` — `ME_TABS` 5번째 「손익」 · `MePnlTab` · `MeAccountsLoading`.
- `webapp/src/components/layout/app-sidebar.tsx` — `NAV_ADMIN_PNL`.
- `webapp/src/lib/launch-format.ts` — `BROKER_LABEL` export.
- 테스트: `pnl-report.test.tsx`(9) · `pnl-admin-client.test.tsx`(7) · `me-client.test.tsx`(+2 · B1 갱신) · `app-sidebar.test.tsx`(+1 · 순서 갱신).
- E2E: `fixtures/pnl.ts` · `specs/admin-pnl.spec.ts`(5) · `specs/me.spec.ts`(+5 · 탭 순서 2곳 갱신) · `specs/sidebar-tree.spec.ts`(TREE_LINKS).

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 요약 행 매수 칸에서 조 단위 값이 옆 칸으로 넘침(lg 1024)**
- **Found during:** Task 3 (admin-pnl P36-AP1 백스톱)
- **Issue:** 요약 행 `lg:grid-cols-[1.2fr_repeat(5,1fr)_0.7fr]` 에서 1fr ≈ 95px 인데 14/600 「123,456,789만」 이 99px. 칸에 `min-w-0` 이 있어 칸이 줄어들고 값이 넘쳤다.
- **Fix:** 요약 칸에서 `min-w-0` 을 빼 칸 최소폭 = 값 폭(fr 칸이 그만큼 넓어지고 나머지가 줄어든다).
- **Files modified:** `webapp/src/components/pnl/pnl-report.tsx`
- **Commit:** `bd2c307f`

**2. [Rule 1 - Bug] 기간 · 묶음 · 계좌 전환 첫 프레임에 이전 응답이 새 라벨로 보임**
- **Found during:** Task 3 (me.spec P36-pnl-1 — 「7일 실현손익」 이 range=30 응답으로 먼저 섰다)
- **Fix:** `usePnlReport` 상태에 그 상태를 만든 키 · 시도 번호를 함께 두고, 지금 키와 다르면 곧바로 loading 으로 본다.
- **Files modified:** `webapp/src/components/pnl/pnl-report.tsx`
- **Commit:** `bd2c307f`

**3. [Rule 1 - Bug] /admin/pnl 문서 제목이 루트 「GH Trade」 로 되돌아감**
- **Found during:** Task 3 (admin-pnl P36-AP1)
- **Issue:** 클라이언트 `document.title` 만 달았는데 `router.replace` 가 서버 메타데이터를 다시 적용한다(주문로그 페이지 주석과 같은 현상).
- **Fix:** `page.tsx` 에 `export const metadata = { title: '매매손익 · Admin' }` · AP2 에 전환 뒤 제목 단언 추가.
- **Files modified:** `webapp/src/app/admin/pnl/page.tsx`, `webapp/e2e/specs/admin-pnl.spec.ts`
- **Commit:** `bd2c307f` · `d637a8e5`

**4. [Rule 3 - Blocking] `BROKER_LABEL` 비공개**
- **Issue:** 계좌별 배지가 「`BROKER_LABEL` 낱말」 을 써야 하는데 `launch-format.ts` 안 비공개 상수였다.
- **Fix:** `export` 만 추가(값 무변경 · files_modified 밖 1줄).
- **Commit:** `d8199d6d`

**5. [범위 메모] 기존 E2E 탭 순서 단언 갱신** — `me.spec.ts` 의 4탭 순서 단언 2곳(PEY-1 · 케이스 1)을 5탭으로 고쳤다(플랜 files 안 · 단언 대상만 변경).

---

**Total deviations:** 자동 수정 4건(Rule 1 × 3 · Rule 3 × 1). 범위 확장 없음.

## Issues Encountered

- 다른 세션의 동시 Playwright 가 3100 · 8090 을 점유해 E2E 1 · 2회차가 오염됐다(위 「회귀 게이트」). 포트가 빈 것을 확인하고 3회차를 돌렸다 — 다른 세션 서버는 재사용하지 않았다.
- server `admin.test.ts` 타임아웃 1건(부하 · 재실행 통과).

## TDD Gate Compliance

- Task 2(tdd="true"): RED `e5ba93c4`(pnl-admin-client 모듈 없음으로 import 실패 · 사이드바 「매매손익」 링크 없음 2건 실패 확인) → GREEN `d8199d6d`(107 passed). REFACTOR 커밋 없음.

## User Setup Required

없음.

## Next Phase Readiness

- Phase 36 전 층이 unit · pgTAP · E2E 로 green — 36-09(배포 · `supabase db push` 사용자 승인)로 넘어갈 수 있다.
- 배포 순서 메모(기존 규칙): relay 먼저 · push 나중. 이 플랜은 배포 · push 를 하지 않았다.

## Self-Check: PASSED

- 커밋 5개(1ea9d1ee · e5ba93c4 · d8199d6d · bd2c307f · d637a8e5) HEAD 조상 확인 · 신규 파일 6개 존재 확인.
