---
phase: 35-launch-gate
plan: 08
subsystem: webapp admin
tags: [launch-gate, admin, nextjs, react, svg, playwright, vitest, rtl, regression-gate, pgtap]
status: complete

requires:
  - phase: 35-launch-gate
    provides: "35-07 LaunchGateChart · launch-map.ts(mapNextOffsetOf · launchDateLabelOf)"
  - phase: 35-launch-gate
    provides: "35-06 LaunchClient(?tab · ?d · ?fire) · AVAILABLE_TABS · fetchLaunchMap · mockLaunchApi · --launch-* 토큰"
  - phase: 35-launch-gate
    provides: "35-02 · 35-04 pgTAP(launch_gate 60 · launch_gate_apply 38) · 35-03 shared launchDaysOf · launchPanelStatsOf · LAUNCH_ORDER"
provides:
  - "/admin/launch?tab=map 「경계 지도」 탭 — LaunchMapTab(받기 · 상태) · LaunchMapView(순수): 프리셋 칩 · 범위 글 · 세그먼트 · 범례 · 요약 카드 4 · 4패널 · 푸터"
  - "?range 쿼리(10d 기본 · 20d · all · 잘못된 값 replace 로 지움) · 탭 · 칩 · 세그먼트 전환은 다른 쿼리 보존"
  - "launch-map.ts launchRangeOf · launchRangeParamOf"
  - "LaunchFireSeg — 주문 내역 · 경계 지도 두 탭이 쓰는 발사 기준 세그먼트(launch-orders-tab.tsx export)"
  - "e2e launchMapFixture(첨부 조각 + 합성 Q16/N 머리) · mockLaunchApi 기본 map 핸들러 · api.maps()"
  - "35-09 배포 전제 — 전 워크스페이스 회귀 게이트 결과 표(아래 「회귀 게이트」)"
affects: [35-09, 35-10, 35-11]

actuals:
  tokens: 12753
  tasks: 3
  commits: 4
plan_head_before: 7eb35a09fe31c04f7ab4668e8e3818469679beb0
plan_head_after: 2f635e25cb7ce82421d80fa0e2ace28e8776d212

tech-stack:
  added: []
  patterns:
    - "지도 탭 받기 = fire · range 를 키로 한 alive effect — 칩 · 세그먼트 하나 = 요청 1건(진행 중 요청 합침은 35-06 launch-api 그대로)"
    - "탭 사이 공용 쿼리(fire)는 공용 부품(LaunchFireSeg)으로 — 두 탭의 세그먼트 모양 · 키가 갈라지지 않게"
    - "SVG 눈금 글은 오른쪽 끝 24px 안이면 text-anchor end — 좁은 오른쪽 여백에서 긴 µs 글이 잘리지 않게"

key-files:
  created:
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  modified:
    - webapp/src/components/admin/launch-client.tsx
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/lib/launch-map.ts
    - webapp/src/lib/__tests__/launch-map.test.ts
    - webapp/e2e/specs/admin-launch.spec.ts
    - webapp/e2e/fixtures/launch.ts

key-decisions:
  - "35-08: 지도 패널 조각은 (서버, 시장) + 발사 거래소(LAUNCH_FIRES[fire].fire_exchange)로 거른다 — 지도 RPC 가 이미 발사 기준으로 거르지만 LaunchMapPiece 에 fire_base 가 없어 거래소만 방어적으로 본다"
  - "35-08: 요약 카드 「접수된 가장 이른 · 거부된 가장 늦은」 = shared launchPanelStatsOf 의 min_accept · max_reject(패널 머리 집계와 한 벌) · 다음 첫 조각 = mapNextOffsetOf(최신 머리) · null 이면 「—」"
  - "35-08: 범례 · 요약 카드 · 패널 · 푸터는 응답이 있고 days 가 비지 않을 때만 — 컨트롤 줄(칩 · 세그먼트)은 로딩 · 오류 · 빈 상태에서도 남긴다"
  - "35-08: 「구분 없음(백필)」 범례는 n0930 응답 조각 중 side null 이 하나라도 있을 때만(q16 은 side 를 쓰지 않아 띄우지 않는다)"

patterns-established:
  - "경계 지도 탭 DOM 계약: data-slot launch-map · launch-controls · launch-range(button[data-range] aria-pressed) · launch-range-text · launch-fire-seg · launch-legend · launch-kpis > launch-kpi[data-gateway][data-market] > [data-kpi=min-accept|max-reject|next] · launch-panels · launch-foot"

requirements-completed: []

coverage:
  - id: D1
    description: "launchRangeOf(11일 「10/12 ~ 10/26 · 11거래일」 · 10일 · 1일 「10/26 · 1거래일」 · [] null) · launchRangeParamOf"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/launch-map.test.ts (40 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "LaunchMapView 렌더 — 칩 3 · 「전체」 선택 · 날짜 입력 0 · 카드 4 순서 · KB 코스닥 10일 −347/−322/−337 · 점 196 · 범례 16:00/09:00:30 · 「구분 없음(백필)」 · 마름모 1 · React 키 겹침 0 · 빈 패널 · 카드 「—」 · 빈 상태 · 오류 · 끝 눈금 오른쪽 맞춤"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-map-tab.test.tsx (13 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/admin/launch?tab=map 실브라우저 — 1280 요청 1건 · 범위 글 · 4패널 순서 · 점 196 · KB 코스닥 카드 · 패널 머리 / 10d→20d→all 요청 1건씩 · URL / n0930 마름모 · 범례 · 다음 −245/−200 · 주문 내역 탭 전환 fire 보존 / 390 SVG 640 · 래퍼 가로 스크롤 · 카드 2열 · 페이지 가로 스크롤 0 / 빈 상태 / 잘못된 range"
    requirement: "LAUNCH-06"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts (P35-M1~M5 + 기존 L1~L6 · 12 passed · --workers=1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "전 워크스페이스 회귀 게이트(shared · relay · server · webapp · E2E 4 spec · pgTAP 7파일 · CLI dry-run 2종)"
    verification:
      - kind: other
        ref: "본문 「회귀 게이트」 표 — 기존 실패 3종 외 green"
        status: pass
    human_judgment: false
  - id: D5
    description: "경계 지도가 첨부 지도 · 채택 목업과 같은 느낌으로 읽히는지(밀도 · 색 · 라이트 테마) — 실데이터 적재 뒤"
    verification:
      - kind: automated_ui
        ref: "playwright:launch-map-1280.png · launch-map-n0930-1280.png · launch-map-390.png · launch-map-n0930-390.png (다크)"
        status: pass
    human_judgment: true
    rationale: "시각 품질은 사람 판단. 스크린샷은 다크 테마 · 목 데이터(첨부 조각 + 합성 머리) 기준이다."

duration: 약 14분
completed: 2026-10-27
---

# Phase 35 Plan 08: 경계 지도 탭 조립 + 전체 회귀 게이트 Summary

**`/admin/launch?tab=map` 「경계 지도」 탭을 열었다. 화면은 프리셋 칩(최근 10일 · 20일 · 전체), 응답 기준 범위 글, 16:00/09:00:30 세그먼트, 범례, 요약 카드 4장, 35-07 패널 4개, 푸터 순서로 그린다. 첨부 데이터로 KB 코스닥 카드가 10일 · −347 · −322 · −337, 4패널 점 합이 196 으로 나와 첨부 지도와 같은 값임을 실브라우저에서 확인했다. 이어서 phase 전체 회귀를 깨끗한 worktree 에서 한 번 돌렸고, 기존 실패 3종 말고는 모두 green 이다.**

## Performance

- **Duration:** 약 14분 (2026-10-27T12:45Z → 12:59Z)
- **Tasks:** 3/3 (Task 1 트레이서 · Task 2 · Task 3 회귀 게이트)
- **Files:** 신규 2 · 수정 7

## Accomplishments

- **지도 탭(D-15 · D-16).** `LaunchMapTab` 은 `fetchLaunchMap(fire, range)` 를 fire · range · 재시도 때만 부른다. `LaunchMapView` 는 순수 렌더다.
  - 컨트롤 줄: 칩 3개(aria-pressed) · 범위 글 · 오른쪽 세그먼트. 시작 · 끝 날짜 입력은 없다(RTL 이 input 0 을 단언).
  - 요약 카드: 「{브로커 시장} · N일」 · 접수된 가장 이른(--launch-ok) · 거부된 가장 늦은(--launch-bad) · 다음 첫 조각(--primary). 값이 없으면 「—」.
  - 패널: LAUNCH_ORDER 순 `LaunchGateChart`. days = 그 조합 조각의 `launchDaysOf`, next = `mapNextOffsetOf(heads, …)`.
  - 상태: 로딩 스켈레톤 · 오류(「발사 기록을 불러오지 못했어요」 + 「다시 시도」) · days [] 이면 「아직 적재된 발사가 없어요 · 첫 적재는 16:00:01」.
- **09:00:30 합패널(D-17).**
  - 범례에 「마름모 = A 매도 · 동그라미 = N 매수」 를 넣고, 거부 문구는 「101·515 거부」 로 바꾼다. side null 조각이 있으면 「구분 없음(백필)」 을 더한다.
  - 다음 첫 조각은 최신 N 머리 값이다. 상수는 코드에도 푸터에도 없다.
  - 푸터는 「N 오프셋은 고정값 — 선은 최신 N 머리 값 · 재전송은 첫 발만 점 · 횟수는 툴팁」 이다.
- **쿼리(D-11 · D-15).** `AVAILABLE_TABS = ['orders', 'map']` 이고 `?range` 를 새로 받는다(기본 10d, 잘못된 값은 replace 로 그 키만 지운다).
  - 탭 · 칩 · 세그먼트 전환은 모두 다른 키를 보존하는 `router.replace` 다. 주문 내역 탭으로 넘어가도 `fire=n0930` 이 남고, 그 탭 세그먼트가 09:00:30 으로 선택돼 있다.
- **폰 390(D-18).** 요약 카드는 2열이다. 각 패널 SVG 폭은 640 고정이고 래퍼 안에서 가로 스크롤한다. 문서 · main 가로 넘침은 0 이다(16:00 · 09:00:30 둘 다).

## 시각 결함 수정

- 09:00:30 지도에서 오른쪽 끝 x 눈금 글(「−20,136」)이 SVG 오른쪽 여백(14px) 밖으로 잘렸다. 끝 24px 안의 눈금 글은 오른쪽 맞춤으로 바꿨다(`af8719a3` · RTL 단언 추가).

## 회귀 게이트

깨끗한 detached worktree(`.claude/worktrees/p35-08-gate` · HEAD `2f635e25`)에서 돌렸다. `pnpm install --frozen-lockfile --prefer-offline` 뒤, 메인 트리의 webapp env 파일을 내용 출력 없이 복사했다. 끝난 뒤 `git worktree remove --force` 로 지웠다.

메인 트리를 쓰지 않은 이유는 다른 세션의 `relay/src/generated/**` 미커밋 변경 때문이다. `&&` 사슬은 기존 실패에서 끊기므로, 명령을 하나씩 돌려 결과를 각각 기록했다. 동시 세션 규칙에 따라 vitest 는 `--maxWorkers=2`, Playwright 는 `--workers=1` 로 돌렸고, 3100 포트가 비어 있어 worktree 자신의 dev 서버로 E2E 를 돌렸다.

| 워크스페이스 | 명령 | 결과 | 시간 |
|---|---|---|---|
| shared | `pnpm --filter @gh-radar/shared build` | exit 0 | 3s |
| shared | `vitest run --maxWorkers=2` | 23 files · **697 passed** | 2s |
| relay | `run typecheck` | exit 0 | 2s |
| relay | `run typecheck:tests` | exit 2 — `tests/helpers/frames.ts:490` TS2554 1건만 (**기존** b7b25391 StockDMA 동기화 · 깨끗한 트리라 :1618 없음) | 4s |
| relay | `vitest run tests/launch-backfill.test.ts tests/accum-backfill.test.ts` | 2 files · **35 passed** | 1s |
| server | `run typecheck` | exit 0 | 2s |
| server | `vitest run --maxWorkers=2` | 43 files · **576 passed** | 10s |
| webapp | `run typecheck`(tsc --noEmit) | exit 2 — `../relay/tests/helpers/frames.ts:490` 1건만 (**기존**) · 그 밖 0 | 11s |
| webapp | `tsc -p tsconfig.e2e.json`(typecheck 의 `&&` 뒤 절반을 따로) | exit 2 — 같은 frames.ts:490 1건만 (**기존**) | 2s |
| webapp | `vitest run --maxWorkers=2` | 186 files · **4815 passed · 1 skipped**(기존 `watchlist-api.test.ts` skip) | 103s |
| webapp E2E | `playwright test admin-launch · sidebar-tree · admin-servers · admin --workers=1` | **50 passed**(setup 포함) · failed 0 | 96s |
| pgTAP | `launch_gate.test.sql` | 1..60 · **ok 60** · not ok 0 | 8s |
| pgTAP | `launch_gate_apply.test.sql` | 1..38 · **ok 38** · not ok 0 | 9s |
| pgTAP | `dma_strategy_apply.test.sql` | 1..30 · **ok 30** · not ok 0 | 8s |
| pgTAP | `dma_strategy_accum_signal.test.sql` | 1..31 · **ok 31** · not ok 0 | 8s |
| pgTAP | `dma_strategy_read.test.sql` | 1..28 · **ok 28** · not ok 0 | 8s |
| pgTAP | `dma_strategy_limit_feature.test.sql` | 1..24 · **ok 24** · not ok 0 | 9s |
| pgTAP | `dma_gateway_identities.test.sql` | 1..42 · ok 26 · **not ok 16 (기존)** — 목록 3 · 4 · 18~21 · 23 · 25~28 · 31~34 · 37, deferred-items.md 와 글자 그대로 같음 | 8s |
| CLI dry-run | `launch-backfill.ts --file packages/shared/src/__fixtures__/launch-pieces-1012-1026.json` | `합계: 조각 196 · 머리 33 · 날짜 11 · 중복 0 · 거부 0` | 1s |
| CLI dry-run | 플랜 verify 그대로 `--file ../docs/inbox/from-gh-trade/261027-launch-gate-admin-attach/pieces.json` + grep | grep 일치(exit 0) | 1s |
| CLI dry-run | `--file launch_pieces_KB120.ndjson --file launch_pieces_KYOBO119.ndjson`(gh-trade 전체) | `합계: 조각 254 · 머리 51 · 날짜 12 · 중복 0 · 거부 0` | <1s |

- pgTAP 은 로컬 일회용 컨테이너(`scripts/verify-dma-orders-price-check.sh --test`)로 **실행했다**. 원격 DB · `supabase db push` 는 건드리지 않았다. 35-09 Task 1 은 「pgTAP 미실행」 분기를 탈 필요가 없다.
- 기존 실패 3종(오케스트레이터 목록과 같다): ① frames.ts:490 TS2554 ② relay 전체 vitest 의 40건(이 게이트 명령은 relay vitest 를 backfill 2파일로 한정하므로 표에 나타나지 않는다) ③ pgTAP dma_gateway_identities 16 not ok. 이 밖의 실패는 0 이다.
- 게이트 명령 안의 webapp vitest 로그에 보이는 `startTests` 스택은 오류 경로를 일부러 태우는 테스트(stock-comovement · order-log-panel 등)의 stderr 다. 실패가 아니다.

## 플랜 · 태스크별 검증 (35-VALIDATION Per-Task Map 채우기용)

| 태스크 | 명령 | 결과 |
|---|---|---|
| 35-08 T1 (tracer) | `shared build && webapp typecheck && playwright admin-launch.spec.ts --workers=1` | shared 0 · typecheck 기존 frames.ts 외 0 · E2E 8 passed(L1~L6 + M1 + setup). 트레이서 게이트에서 다시 돌려 통과한 뒤 확장했다 |
| 35-08 T2 | `… && vitest launch-map.test.ts launch-map-tab.test.tsx --maxWorkers=2 && playwright admin-launch.spec.ts` | vitest 53 passed(40 + 13) · E2E 12 passed(L1~L6 · M1~M5 + setup) · 형제(launch-gate-chart 14 · launch-orders-tab 7) 함께 74 passed |
| 35-08 T3 | 위 「회귀 게이트」 표 3묶음 | 기존 실패 3종 외 green · pgTAP 실행 · CLI dry-run 일치 |
| eslint | 변경 9파일 | 0건 |

## Task Commits

1. **Task 1 (tracer): 경계 지도 탭 한 경로**: `046a82e5` (feat)
2. **Task 2 결함 수정: 09:00:30 합패널 점 React 키 겹침**: `cff27805` (fix)
3. **Task 2 결함 수정: 오른쪽 끝 눈금 글 잘림**: `af8719a3` (fix)
4. **Task 2: 프리셋 · 09:00:30 합패널 · 폰 390 · 빈 상태 테스트**: `2f635e25` (test)

Task 3 은 코드 변경이 없다(회귀 실패가 0 이라 고칠 파일이 없었다). 계획 원장 `7eb35a09..2f635e25` 의 커밋은 4개다. 회귀 중에 Phase 36 세션이 `d9f8ccbc`(36-UI-SPEC)를 master 에 올렸는데, 그 커밋은 이 플랜의 것이 아니어서 `plan_head_after` 를 내 마지막 커밋 `2f635e25` 로 잡았다.

## Decisions Made

- frontmatter key-decisions 4건을 보라.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 09:00:30 합패널 점 React 키 겹침**
- **Found during:** Task 2 (RTL 픽스처에서 A 매도 다리를 실제처럼 wire 0 으로 두자 드러났다)
- **Issue:** 35-07 `LaunchGateChart` 는 점 키를 `p.wire` 로 썼다. 09:00:30 지도는 N 과 A 매도 두 다리를 한 날 행에 그리는데, 둘 다 wire 0 부터 시작해 키가 겹친다. React 는 「Encountered two children with the same key」 경고를 내고, 갱신할 때 점이 중복되거나 빠질 수 있다. e2e 픽스처(N wire 0 + A 매도 wire 0)에서도 같은 일이 생긴다.
- **Fix:** 날 행 안 순번 `j` 를 키로 쓴다. 리스트는 wire 정렬이라 순서가 고정이다. RTL 에 console.error 의 「same key」 0건 단언을 넣었고, 수정을 되돌리면 이 단언이 실패하는 것을 확인했다.
- **Files modified:** webapp/src/components/admin/launch-gate-chart.tsx
- **Commit:** cff27805

**2. [시각 결함] 오른쪽 끝 x 눈금 글 잘림** — 위 「시각 결함 수정」 참고. `af8719a3`.

**3. [Rule 3 - 정리] 발사 기준 세그먼트를 `LaunchFireSeg` 로 추출(launch-orders-tab.tsx · files_modified 밖)**
- **Issue:** 플랜은 지도 탭 세그먼트를 「주문 내역과 같은 꼴」 로 만들라고 했다. 마크업을 복사하면 같은 `?fire` 키를 쓰는 두 탭의 세그먼트가 나중에 갈라질 수 있다.
- **Fix:** 주문 내역 탭의 세그먼트를 `export function LaunchFireSeg` 로 빼서 두 탭이 함께 쓴다. 주문 내역 렌더는 바뀌지 않았다(E2E L1~L6 · RTL 7 회귀 0).
- **Commit:** 046a82e5

**4. [플랜 문구 정정] 패널 머리 단언 문구**
- 플랜 Task 1 은 「경계 4 · 전부 접수 5 · 전부 거부 1」 이라고 적었다. 35-07 이 잠근 실제 문구는 「경계 잡힌 날 4 · 전부 접수 5 · 전부 거부 1」 이라서 E2E 는 그 문구로 단언한다.

**5. [게이트 실행 방식] `&&` 사슬을 명령별로 나눠 실행**
- 플랜 verify 의 첫 명령은 `&&` 사슬이라, 기존 실패(relay typecheck:tests · webapp typecheck)에서 바로 끊긴다. 그래서 각 명령을 따로 돌려 exit code · 결과를 남겼다. webapp `typecheck` 는 `tsc --noEmit && tsc -p tsconfig.e2e.json` 이라서 e2e 절반도 따로 돌렸다.

---

**Total deviations:** 5 (Rule 1 버그 1 · 시각 결함 1 · Rule 3 정리 1 · 문구 정정 1 · 실행 방식 1)
**Impact:** must_haves 문구 · data-slot · 요청 수는 플랜 그대로다. 35-07 패널은 키 · 눈금 정렬 두 곳만 고쳤다.

## Issues Encountered

- 회귀 게이트 중에 다른 세션(Phase 36)이 master 에 커밋했다(`d9f8ccbc`). 이 플랜 파일과 겹치지 않아 영향은 없다.

## Known Stubs

- 없음. e2e · RTL 픽스처의 합성 머리(Q16 NEXT 4값 · N −245/−200)와 합성 A 매도 조각은 테스트 데이터다. 픽스처 주석에 「합성 · 라이브는 kind 18」 이라고 적어 두었다. 화면 코드에는 상수가 없다.

## Next Phase Readiness

- 35-09(배포 · 메인 세션): 이 플랜은 push 하지 않았다. webapp 은 push 가 곧 배포다. pgTAP 7파일을 로컬에서 실행했으므로 db push 전 「pgTAP 미실행」 승인 분기는 필요 없다. 다만 원격 `supabase db push` 자체는 35-09 메인 세션이 사용자 확인 뒤에 한다.
- gh-trade 의 「발사 계획 어드민」 전환(next_offset_us = 계획 첫 조각 시각 · kind 18 학습 열 소멸 가능)에도 화면은 버틴다. 요약 카드 다음 첫 조각은 null 이면 「—」 이고, 패널은 점선을 그리지 않는다(RTL 단언).

## Self-Check: PASSED

- 신규 2파일(`launch-map-tab.tsx` · `launch-map-tab.test.tsx`)이 디스크에 있다.
- 커밋 046a82e5 · cff27805 · af8719a3 · 2f635e25 가 HEAD 의 조상이다.
- acceptance:
  - T1: launch-client 에 `value="map"` 이 있고, launch-map-tab 에 `launch-kpis` · `LaunchGateChart` 가 있다. E2E M1 failed 0, 주문 내역 L1~L6 회귀 0.
  - T2: E2E 에 프리셋 3단 · n0930 마름모 · fire 보존 · 390 · 빈 상태 케이스가 있고 failed 0. RTL 에 범례 두 문구 · 빈 패널 · 카드 「—」 단언이 있고 failed 0.
  - T3: 「회귀 게이트」 표가 있고, 기존 실패 3종 외 green 이다. pgTAP 은 실행했고 CLI dry-run grep 이 일치했다.
- prohibitions:
  - 날짜 입력 부품 0(RTL input 0).
  - `−200` · `−245` 같은 N 오프셋 상수 0. `grep -nE "245|200" launch-map-tab.tsx` 결과는 주석 · 픽스처 밖 0이다.
  - git push 0.
