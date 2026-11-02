---
phase: 37-tick-viewer
plan: 10
subsystem: webapp
status: complete
tags: [tick-viewer, fzstd, zstd, signed-url, slider, orderbook, url-state, replaceState, playwright]

requires:
  - phase: 37-01
    provides: "fzstd: 확인 OK(사람 게이트) — fzstd@0.1.1 설치 승인"
  - phase: 37-05
    provides: "buildTickIndex · recvOrderOf · exchangeOrderOf · inversePerm · a3ColumnsOf · lastB6Of · bookAt · bookAmountOf · bookLagMs · parseTickTime · fmtTickTime · lowerBoundRecv · densityOf · viSpansOf · lastB9Of"
  - phase: 37-07
    provides: "GET /api/ticks/open — grid.url(서명 URL · 600초) · grid.bytes"
  - phase: 37-08
    provides: "TickViewerPage loaded 자리 · TickHeader tickLabel prop · tick-url(tickUrlOf) · tick-format(fmtAmountC) · --vi/--vi-bg · tick-indeterminate · e2e 픽스처 mockTickApi"
provides:
  - "의존성 fzstd 0.1.1(정확 고정 · lockfile)"
  - "lib/ticks/tick-session.ts — TickSession · buildTickSession · tickSessionKeyOf (+ a3Of 열)"
  - "lib/ticks/use-tick-grid.ts — useTickGrid · TickGridStatus · __resetTickGridCache · MAX_TICK_SESSIONS · TickGridLoadError"
  - "lib/ticks/use-tick-cursor.ts — useTickCursor · TickCursor · TickOrderMode · PLAY_SPEEDS · TickPlaySpeed · PLAY_MAX_GAP_MS · TICK_URL_THROTTLE_MS · recAtNs · initialRecOf"
  - "components/ticks: TickViewer(HTS_PANES 배열 · 폰 세그먼트) · TickSlider · TickBook(TickBookUnit)"
  - "test-fixtures/tick-grid.ts — tickGridZst · tickGridBytes(컷 13시 KRX)"
  - "e2e 픽스처: tickGridBytes(ex) · tickGridUrl · TICK_GRID_HOST · mockTickApi grid 기록 · expireFirstGrid"
affects: [37-13, 37-14, 37-19]

actuals:
  tokens: 26400       # chars/4 over 실현 diff(webapp + .planning, 105,585자 · lockfile 제외)
  tasks: 3
  commits: 4          # MEASURED: git rev-list --count f7c86598..eff38b25 (SUMMARY 커밋 제외)
plan_head_before: f7c86598f348f21f123d8454f9be7ad0cf553abe
plan_head_after: eff38b25bf6f955948bf7674758de9dd11cc4873

tech-stack:
  added: ["fzstd@0.1.1 (브라우저 zstd 해제 · MIT · 101arrowz)"]
  patterns:
    - "격자 로더 = use-limitup-grid 동형: 모듈 캐시(최근 2) · 진행 중 요청 공유 · 4xx 면 open 1회 재발급 · 그래도 실패면 사람 retry"
    - "URL `t` 는 열기 시점에 한 번만 읽는다 — (isin, d, ex) 키 상태에 담고 열기 · 격자 효과 의존성에서 뺀다"
    - "HTS 칸 = HTS_PANES 배열 한 곳 — 데스크톱 행 · 폰 세그먼트가 같이 늘어난다(37-13 · 37-14 가 원소 추가)"

key-files:
  created:
    - webapp/src/lib/ticks/tick-session.ts
    - webapp/src/lib/ticks/use-tick-grid.ts
    - webapp/src/lib/ticks/use-tick-cursor.ts
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-slider.tsx
    - webapp/src/components/ticks/tick-book.tsx
    - webapp/src/test-fixtures/tick-grid.ts
    - webapp/src/lib/ticks/__tests__/tick-session.test.ts
    - webapp/src/lib/ticks/__tests__/use-tick-grid.test.tsx
    - webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx
    - webapp/src/components/ticks/__tests__/tick-slider.test.tsx
    - webapp/src/components/ticks/__tests__/tick-book.test.tsx
    - .planning/phases/37-tick-viewer/37-10-red-evidence.json
  modified:
    - webapp/package.json
    - pnpm-lock.yaml
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/e2e/fixtures/ticks.ts
    - webapp/e2e/specs/ticks-viewer.spec.ts

key-decisions:
  - "fzstd 는 이어붙인 zstd 프레임을 모두 푼다(스트리밍 Decompress · 한 번에 decompress 둘 다 실측) — 브라우저는 splitZstdFrames 를 거치지 않는다. 37-12 · 37-15 의 당일 캐시 append 도 그대로 이어붙여 fzstd 에 흘리면 된다"
  - "URL 쓰기는 history.replaceState(null, …) — Next 15 가 useSearchParams 에 동기화하도록 state 는 null(Next 내부 state 를 넘기면 동기화를 건너뛴다)"
  - "열기 직후 커서는 URL 에 쓰지 않는다 — 열기만으로 URL 이 바뀌지 않게. 첫 이동부터 250ms 스로틀(앞 1 + 뒤 1)"
  - "Space 는 버튼 · 링크에 포커스가 있으면 그 요소에 맡긴다(▶ 버튼 클릭 뒤 Space = 같은 토글) · 입력창 · textarea · select · contenteditable 에서는 키를 전혀 가로채지 않는다"
  - "호가 바 길이 = 20단(매도+매수) 최대값 대비(스케치 019 ladderHTML 과 같다) · 0 아닌 단은 최소 2%"
  - "슬라이더 끌기 rAF 스로틀은 TickSlider 안에 둔다(누르기 첫 점은 즉시) — 커서 훅의 seekNs 는 즉시 반영"
  - "폰 판정은 CSS 뷰포트 640px(max-[640px] · min-[641px]) — JS 폭 측정 없음"

requirements-completed: [D-00, D-18]

duration: ~45min
completed: 2026-11-02
---

# Phase 37 Plan 10: 뷰어 골격 — 격자 다운로드 · 해제 · 세션 · 슬라이더 카드 · 키 · 호가 10단 · URL 딥링크 Summary

**열린 종목의 서명 URL 격자를 브라우저가 직접 받아 fzstd 0.1.1 로 스트리밍 해제하고, 레코드 인덱스 · 순열 · A3 열 · 마지막 B6/B9 · 밀도 · VI 를 한 번에 만든다. 그 위에 슬라이더 카드(‹ ▶ › · 08~20 밀도 · VI 눈금 · 속도 · 시각 점프), 창 키(← → Shift Space), 그 틱의 호가 10단(주|금액)을 올렸다. 틱을 옮기면 URL `t` 가 replaceState 로 바뀌어 새로고침해도 같은 시각에 선다.**

## Performance

- **Duration:** 약 45분
- **Tasks:** 3/3 (Task 1 tracer · Task 2 TDD RED → GREEN · Task 3 e2e)
- **Files:** 생성 13 · 수정 5

## 측정값 (output 요청)

| 항목 | 값 |
|------|----|
| fzstd 버전 | `0.1.1` 정확 고정(`"fzstd": "0.1.1"` · lockfile `fzstd@0.1.1`) |
| 컷 13시 KRX 압축 바이트 | 247,536B → 해제 6,017,984B · 11,990 레코드 |
| fzstd 스트리밍 해제(Node 24 · 64KB 청크) | 39.0ms — 결과가 `zlib.zstdDecompressSync` 와 바이트 동일 |
| fzstd 다중 프레임(두 프레임 이어붙임 · 7,777B 청크) | 동일 바이트 복원(스트리밍 · 한 번에 둘 다) |
| buildTickSession(jsdom · 해제 바이트 입력) | 20.5~23.2ms |
| useTickGrid 전 경로(가짜 fetch 7청크 → fzstd → 세션 · jsdom) | 106.7ms |

(성능은 vitest 안 `performance.now()` 1회 — 첫 측정은 JIT 예열 포함. 실패 조건 아님.)

## Accomplishments

- **격자 열기(트레이서):** `open.grid.url` → `fetch` → `body.getReader()` 청크 → `Decompress.push` → 빈 청크 `final` → `concatBytes` → `buildTickSession`. 진행률 = 받은 압축 바이트 / `grid.bytes`. 서명 URL 4xx 이면 `fetchTickOpen` 을 한 번만 다시 불러 새 URL 로 재시도한다. 그래도 실패하거나 5xx 면 「격자를 받지 못했어요 · 다시 시도」 를 띄운다(자동 재시도 없음). 세션 캐시는 최근 2개이고, 같은 키의 동시 요청은 받기 1회를 나눠 쓴다.
- **페이지 결선:** `loaded` 자리는 받는 동안 「격자 받는 중 · N% · 레코드 · 크기」 진행 바를, ready 면 `TickViewer` 를 보인다. 머리 `tickLabel` 에는 현재 틱 `HH:MM:SS.mmm · #seq` 를 올린다. **URL `t` 는 (isin, d, ex) 키 상태에 열기 시점 한 번만 담는다.** 열기 · 격자 효과 의존성에는 `t` 가 없다. 그래서 replaceState → Next 동기화 → 재렌더가 와도 다시 열지 않는다(단위 시험으로 잠금).
- **커서:** 정본은 `rec`, 자리는 표시 순서(기본 거래소순)다. 초기값은 `t` → 수신순 lower_bound, `t` 가 없으면 08:00 이후 첫 틱이다. 키는 ← → 한 행 · Shift 10행 · 처음/끝에서 멈춤이다. 재생은 1× = 실제 수신 간격(2초 상한) · 10× = 1/10 · 최대 = rAF 프레임마다 한 틱이고, 끝에 닿으면 멈춘다.
- **슬라이더 카드:** ‹ ▶/⏸ › · 트랙(`role="slider"` · `aria-valuetext` = 현재 시각) · 밀도 막대 144개(√ 정규화) · VI 시작 주황 눈금 + 구간 옅은 띠 · 손잡이(수신 시각 비율) · 08/12/16/20 축 · 속도 칩 · 시각 입력(실패 시 `--destructive` 테두리) · 「점프」 · `showEnd` 일 때 「끝으로」 · 키 안내(폰 숨김).
- **호가 10단:** 매도 10→1 · 매수 1→10 순서다. 「주 | 금액」 으로 머리 · 바 기준 · 바닥 줄(총잔량 ↔ 합산 금액)이 같이 바뀐다. 선택 틱이 A3 면 그 가격 행에 점과 테두리를 단다. 캡션은 「호가 기준 seq N · Δms 전/뒤」 이고, B6 가 없으면 「호가 없음」 이다. 색은 orderbook-ladder 토큰 그대로다.
- **배치:** 슬라이더 카드 → HTS 행(`HTS_PANES` — 지금은 호가 300px 한 칸). 폰(≤ 640px)은 세그먼트 골격(지금 「호가」 한 버튼 — 37-13 · 37-14 가 원소를 더한다)이다.

## Task Commits

1. **Task 1 (tracer): 뷰어 트레이서 — 서명 URL → fzstd 해제 → 세션 → 시각 점프 → 호가 10단 → URL t** — `9d301ca1` (feat)
   - 트레이서 게이트(interactive · end-of-phase · 자동 verify 만): verify 명령 그대로 재실행 → typecheck(+e2e tsconfig) 통과 · 12/12 → 확장 진행.
2. **Task 2 RED: 커서 키 · 재생 · 슬라이더 · 호가 주|금액 실패 테스트** — `d263df68` (test)
3. **Task 2 GREEN: 슬라이더 카드 · 키 · 재생 속도 · 호가 주|금액 · 폰 세그먼트 골격** — `3cbcbcb3` (feat)
4. **Task 3: e2e 격자 열기 · 키 · 딥링크 새로고침 제자리 · 만료 재발급** — `eff38b25` (test)

## TDD Gate Compliance

- **RED** `d263df68` — 대상 `use-tick-cursor.test.tsx > useTickCursor — 키 > → = 표시 순서(거래소순) 다음 행 · ← = 이전 · Shift+→ = 10행`. JUnit 리포터로 단독 실행했고 exit 1, `expected +0 to be 1` 이 나왔다. `gsd-tools check tdd-red-evidence` 판정은 **RED_EVIDENCE_OK(target_test_failed)** 다. 증거 파일은 `37-10-red-evidence.json` 이다.
  - semanticAssessment: 대상 테스트가 실행됐고, 계획한 단언(→ 한 번 = 다음 행)에서 실패했다. 원인은 Task 1 커서에 창 keydown 처리가 없다는 계획된 미구현이다. import · 문법 · 픽스처 오류가 아니다(슬라이더는 `null` 뼈대로 두어 import 가 아닌 단언 실패가 되게 했다). 전체 RED 실행에서는 커서 7건과 슬라이더 7건이 단언 실패했다. 호가 7건은 Task 1 에서 이미 구현돼 통과했다.
- **GREEN** `3cbcbcb3` — 커서 10 · 슬라이더 7 · 호가 7 · 세션 5 모두 통과.
- **REFACTOR** — 없음.

## Verification

- Task 1 verify: `shared build && webapp typecheck && vitest tick-session · use-tick-grid --maxWorkers=2` → exit 0 · **2 파일 12 테스트 통과**
- Task 2 verify: `… vitest use-tick-cursor · tick-slider · tick-book · tick-session` → 통과(커서 10 · 슬라이더 7 · 호가 7 · 세션 5)
- 회귀: `vitest src/lib/ticks src/components/ticks` → **10 파일 96 테스트 통과**. 37-08 페이지 흐름 25건도 포함된다(격자 열림 뒤에도 `data-slot="tick-body"` 를 유지한다).
- eslint(`src/lib/ticks` · `src/components/ticks` · 픽스처 · e2e 두 파일) exit 0 · `typecheck:e2e` 통과.
- 수락 기준 grep: `"fzstd": "0.1.1"`(package.json) · `fzstd@0.1.1`(lockfile) · `export function buildTickSession` · `history.replaceState` · `role="slider"` · `Shift` · `합산 금액` · `cut1300-krx.ticks.zst`(e2e 픽스처) — 전부 OK.
- **e2e 미실행 — 오케스트레이터가 메인 트리에서 실행.** 이 worktree 에는 webapp env(`.env.local` · `.env.test.local`)가 없고 비밀 가드가 복사를 막는다. 실행할 명령:
  `cd webapp && pnpm exec playwright test e2e/specs/ticks-viewer.spec.ts --workers=1`
  - 새 절 5개(「틱 전문 뷰어 본문」 describe): 열기 · 키 · 딥링크 · 점프 · 만료
  - 37-08 진입 절의 단언을 고쳤다(「레코드 48,210건」 → 호가 10단 열림 + 격자 요청 1회). 이제 진입 · 변환 절도 격자를 실제로 받는다.

## Deviations from Plan

### Auto-fixed / 보강

**1. [Rule 2 - 계약 보강] `TickSession.a3Of`(rec → A3 열 색인)와 `buildTickSession` 의 선택 인자 `isin`**
- 호가 10단의 「선택 A3 가격 행」 표식은 rec 에서 A3 체결가로 가는 O(1) 조회가 필요하다. 세션 키 `${d}|${ex}|${isin}` 는 캐시 키와 같아야 해서 isin 을 받는다(생략하면 '').
- Commit `9d301ca1`

**2. [Rule 3 - 막힘] 테스트 픽스처 헬퍼 `webapp/src/test-fixtures/tick-grid.ts` 추가(플랜 files 밖)**
- 단위 시험 다섯 개가 같은 컷 픽스처 바이트를 읽는다. `limitup-export.ts` 와 같은 자리 · 같은 방식(`node:fs` + `__dirname`)이다.
- Commit `9d301ca1`

**3. [Rule 2 - 해석] 시각 입력은 TickSlider 안에 둔다**
- Task 1 에서는 TickViewer 에 임시 입력 줄을 두었다. Task 2 에서 그 입력을 슬라이더 카드로 옮겼다(스케치 019 `.tr` 와 같은 한 줄). 슬라이더 트랙의 접근성 이름은 「틱 시각 슬라이더」 로, 입력은 「틱 시각」 으로 나눴다.
- Commit `3cbcbcb3`

**4. [Rule 2 - 견고성] e2e 열기 응답 메타를 실제 픽스처에 맞춤**
- `tickOpenFixture` grid 의 `bytes` · `records` · `a3_count` 를 그 거래소 픽스처 실측값(KRX 11,990/3,089 · NXT 11,474/3,219)으로 바꿨다. 그래야 진행률(받은 바이트/bytes)이 실제와 맞는다. NXT URL 에는 NXT 픽스처 바이트를 준다.
- Commit `eff38b25`

---

**Total deviations:** 4(보강 · 해석). 범위 확대 없음.

## Known Stubs

없음. 다만 아래 둘은 의도한 빈 자리다(스텁 아님 — 뒤 플랜이 원소를 더한다).
- `HTS_PANES` 에 「호가」 한 칸만 있어 폰 세그먼트도 버튼 하나다. 전문 · 버스트 · 팀은 37-13 · 37-14 가 배열에 더한다.
- `TickSlider showEnd` 는 꺼져 있다. 당일 경로 37-19 가 켠다.

## Known Limitations

- URL `t` 는 밀리초까지다(`HH:MM:SS.mmm` 계약). 같은 밀리초에 수신된 틱이 여럿이면 새로고침 뒤에는 그 밀리초의 **수신순 첫 틱**에 선다. 시각은 같고 seq 는 다를 수 있다. 플랜 truth 「t = 그 시각 이후 첫 틱 · 수신순 lower_bound」 그대로이고, e2e 도 「같은 시각」 을 단언한다.
- 한선 10/14 급(≈27만 레코드) 해제 · 세션 시간은 아직 재지 않았다. 컷(1.2만) 기준 선형이면 해제 ≈ 0.9s · 세션 ≈ 0.5s 대다. 끊김이 보이면 Worker 로 옮긴다(RESEARCH A10).

## Issues Encountered

- `.planning/WINDOWS.md` 장부에 「e2e 미실행」 을 append 하려 했지만 `gsd-tools windows append` 가 「Ledger counts disagree with entries: 4/0/13/17 vs 3/0/14/17」 로 거부했다. 37-08 과 같은 기존 장부 집계 불일치이고, 이 플랜 밖의 문제라 고치지 않았다.
- 시각 확인(실화면)은 못 했다. env 가 없어 dev 서버를 띄울 수 없었다. 1280 가로 넘침 0 은 e2e(`expectNoHorizontalScroll`)에 단언으로 넣었다.

## Threat Flags

없음 — 새 표면은 이미 위협 모델에 있는 서명 URL 직접 받기(T-37-SC · Storage → 브라우저)뿐이다. fzstd 는 37-01 사람 확인 뒤 `--save-exact` 로 설치했다.

## Next Phase Readiness

- 37-13: `HTS_PANES` 에 `{ id: 'msg', label: '전문', desktop: 'min-[641px]:flex-1', render }` · `{ id: 'side', label: '버스트 · 팀', desktop: 'min-[641px]:w-[330px] min-[641px]:flex-none', render }` 를 더한다. 렌더 문맥(`PaneCtx`)에 `session` · `cursor`(rec · pos · mode · setMode · jumpToRec)가 있다.
- 37-14: 차트는 `TickViewer` 의 슬라이더 카드 위에 둔다. 커서 이동은 `cursor.seekNs` / `jumpToRec` 를 쓴다.
- 37-19: `TickSlider` 에 `showEnd` · `onEnd` 를 넘긴다. 당일 append 바이트는 이어붙인 zstd 프레임이어도 fzstd 가 그대로 푼다.

## Self-Check: PASSED

- FOUND: 생성 13 · 수정 5 파일 전부 존재
- FOUND: `9d301ca1` · `d263df68` · `3cbcbcb3` · `eff38b25` (HEAD 조상)
