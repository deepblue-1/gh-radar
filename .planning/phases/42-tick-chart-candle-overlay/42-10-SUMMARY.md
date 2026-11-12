---
phase: 42-tick-chart-candle-overlay
plan: 10
subsystem: ui
tags: [tick-viewer, candle-chart, wiring, moving-average, returns, view-sync, localStorage, vitest]

requires:
  - phase: 42-04
    provides: "autoUnitOf · CandlePriceLayer 선택 props ma · team · unitLabel · ownInTitle"
  - phase: 42-05
    provides: "CandleReturnLayer · CandleLowerLayers"
  - phase: 42-06
    provides: "candleBandAt · candleCaptionOf · CandleChartBand · CandleChartCaption"
  - phase: 42-07
    provides: "CandleChartTitle(봉 단위 메뉴 · 이동평균 칩 · 확대 버튼)"
  - phase: 42-08
    provides: "useViewSync · 뷰어 switchView · onViewChange"
  - phase: 42-09
    provides: "봉 차트 조작 · 겹침 골격(확대 버튼 이름 · 값 점 · 구간 합계)"
provides:
  - "candle-chart.tsx 결선 — 봉 단위(기억 · 자동) · 이동평균 켜진 선 · 일별 종가 한 번 · 수익률 판 · 아래 세 판 · 값 띠 · 캡션 · 제목 줄 · 보기 창 주고받기"
  - "CandleChartProps.stockCode? · initialView? · onViewChange? · TickViewerProps.stockCode?"
  - "tick-viewer-page 두 자리 stockCode={view.resp.stock?.code ?? null}"
affects: [42-11]

actuals:
  tokens: 12200
  tasks: 3
  commits: 6
plan_head_before: c867774d724d1c6cc62ee86e8622ea66017cceef
plan_head_after: 7e78fa707c92e922db9fb7606240effc92e1ad2f

tech-stack:
  added: []
  patterns:
    - "봉 차트 결선은 한 컴포넌트 안 — 단위 · 창은 뷰어 상태로 올리지 않고 기억(useSyncExternalStore) · 보기 창(ref + useViewSync)만 주고받는다"
    - "값 띠 · 값 점은 candleBandAt 하나 — 아래 판 값은 그 안의 band.tick(선 차트 tickBandAt) 그대로"

key-files:
  created: []
  modified:
    - webapp/src/components/ticks/candle-chart.tsx
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/src/components/ticks/__tests__/candle-chart.test.tsx
    - webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx

key-decisions:
  - "수익률 눈금 점 = 커서가 창 안이면 day 그대로 · 창 밖이면 커서 점 없이 다시 센 day(dayReturnPointsOf(…, −1)) — 창 왼쪽 끝으로 이어지는 열 샘플 값은 남겨 빈 창(체결 없는 10초 창)에서도 선이 눈금 밖으로 사라지지 않는다(42-05 의 「창 안 점만」 을 커서 점만 빼는 쪽으로 좁힘)"
  - "값 띠 rec = 현재 틱이면 커서 rec(패널과 같은 글자) · 마우스 · 터치면 그 시각 이하 마지막 가격 점 rec — 수익률 값 점도 그 시각 값"
  - "카드 아래 캡션은 Task 1 에서 함께 결선했다(일별 종가 받는 중 · 실패 · 코드 없음 안내가 Task 1 behavior 라서) — Task 2 는 누적 · 폰 범례 · 순서를 테스트로 잠갔다"
  - "A5 / Q4(플래너 가정 그대로): NXT 화면 일 이동평균도 KRX 일봉 종가(stock_daily_ohlcv) — 캡션에 따로 밝히지 않음 · 42-11 UAT 에서 사용자 확인"
  - "E6 loading(플래너 가정 그대로): 받는 동안 일 선 없음 · 캡션 항목 없음 · 띠 그 값 「—」(maValuesOf NaN · maStatusOf loading → 안내 없음)"

patterns-established:
  - "봉 차트에 새 선택 입력을 붙일 때는 기본값을 구조분해에서 준다(stockCode = null) — 기존 호출부 · 테스트가 그대로 돈다"

requirements-completed: [SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, SC-7]

coverage:
  - id: D1
    description: "봉 단위 기억 · 자동(창마다 autoUnitOf) · 고정 단위 유지 · 판 제목 · svg 이름 단위 글자"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-chart.test.tsx describe 「결선 · 가격 판」 (10분봉(자동) · 15분봉)"
        status: pass
    human_judgment: false
  - id: D2
    description: "이동평균 켜진 선만 칩 순서 · 끄면 선 · 판 제목 이름이 같이 사라짐 · 칩 클릭이 저장소에 기억"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "candle-chart.test.tsx 「기본 구성 → 이동평균 선 2개 …」 · chart-kind-switch.test.tsx 「칩 「단순 5」 누름 …」"
        status: pass
    human_judgment: false
  - id: D3
    description: "일별 종가 (코드, 날짜)마다 한 번 · 받는 중 선 · 안내 없음 · 실패 안내 · 코드 없음 「종가가 모자라」 · 일 칩 없으면 요청 0"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "candle-chart.test.tsx 「결선 · 가격 판」 일 칩 4건"
        status: pass
    human_judgment: false
  - id: D4
    description: "수익률 판 · 아래 세 판 · 값 띠(제목 줄 아래) · 수익률 값 점 · 띠 수익률 = 팀 패널 글자"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "candle-chart.test.tsx describe 「결선 · 수익률 · 띠 · 캡션」 · 「패널」 (3건)"
        status: pass
    human_judgment: false
  - id: D5
    description: "누적(과거 · 등록 · avg_px) 선 · 띠 줄 · 캡션 문구 · NXT 합산 · 당일 · 미등록이면 그 몫만 빠짐"
    requirement: SC-5
    verification:
      - kind: unit
        ref: "candle-chart.test.tsx 「과거 + accum …」 · 「NXT …」 · 「당일(isToday) …」"
        status: pass
    human_judgment: false
  - id: D6
    description: "제목 줄 CandleChartTitle(데스크톱 한 줄 · 폰 두 줄) · 선 ↔ 봉 어느 쪽이든 보던 창 유지 · 「전체」 이름 · 구간 지움 · 다시 열면 세 기억 유지 · 창은 처음"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx describe 「D-24 양쪽 · 기억」 (6 passed)"
        status: pass
      - kind: unit
        ref: "candle-chart.test.tsx 「조작」 · 「겹침」 (42-09 테스트 · Task 3 에서 수정 없이 통과)"
        status: pass
    human_judgment: false
  - id: D7
    description: "실기기에서 마우스 이동 · 휠이 매끄럽고(SC-7 체감) 폰 두 줄 제목 · 캡션 줄바꿈 · 전환 깜박임이 없다"
    verification: []
    human_judgment: true
    rationale: "체감 성능 · 시각 판단 — 이 플랜은 Playwright 금지 · 42-11 UAT 에서 실기기로 확인"

duration: 35min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 10: 봉 차트 결선 Summary

**봉 차트(`candle-chart.tsx`)에 Wave 2 부품을 모두 이었다 — 기억한 봉 단위(「자동」 은 창마다 칸 폭 4px 규칙) · 켜진 이동평균 선 · 일 이동평균 앞 거래일 종가 한 번 받기 · 수익률 판 · 아래 세 판 · 값 띠 · 카드 아래 캡션 · `CandleChartTitle` 제목 줄 · `useViewSync` 보기 창 주고받기. 뷰어 · 페이지는 종목 코드와 보기 창을 봉 차트까지 넘긴다. 띠 수익률 = 팀 패널 글자, 선 ↔ 봉 어느 방향이든 보던 창 유지가 컴포넌트 끝-끝 테스트로 잠겼다.**

## Performance

- **Duration:** 약 35분
- **Started:** 2026-11-12T14:00Z 무렵
- **Completed:** 2026-11-12T14:34:05Z
- **Tasks:** 3(각 RED → GREEN)
- **Files modified:** 5

## 최종 `CandleChartProps`

```ts
export interface CandleChartProps {
  session: TickSession;
  accum?: TickOpenResponse['accum'];
  isToday?: boolean;
  cursorRec: number;
  onSeekMs: (ms: number) => void;
  onJumpRec: (rec: number) => void;
  listingShares?: number | null;
  height?: 420 | 303;
  own?: OwnModel | null;
  onOwnJump?: (rec: number, back?: number) => void;
  onOwnFillLine?: (fillId: number) => void;
  titleAddon?: (phone: boolean) => ReactNode;
  stockCode?: string | null;          // 42-10 — 일 이동평균 종가 요청(없으면 요청 0 · 「종가가 모자라」)
  initialView?: ChartViewSnap;        // 42-10 — 마운트 때 한 번
  onViewChange?: (v: ChartViewSnap) => void; // 42-10 — 반영 뒤에만
  className?: string;
}
```

`TickViewerProps.stockCode?: string | null` 를 더했고, 뷰어는 `<CandleChart … stockCode initialView={switchView ?? undefined} onViewChange={onViewChange} />` 로 넘긴다(선 차트와 같은 값 · 같은 콜백). `tick-viewer-page.tsx` 의 `<TickViewer>` 두 자리(당일 live · 과거 격자)에 `stockCode={view.resp.stock?.code ?? null}` 를 넣었다.

## 결선 메모

- **봉 단위:** `unit = unitPref === 'auto' ? autoUnitOf(view.t1 − view.t0, plotW) : unitPref` → `candlesOf(session, unit)`(42-01 캐시 · (세션, 단위)마다 1회). 단위 · 창은 봉 차트 안에만 있고 뷰어 상태로 올리지 않는다(휠마다 뷰어 재렌더 없음 — 42-08 렌더 횟수 테스트 그대로 통과).
- **이동평균:** `maOn = maCfg.lines.filter(on)` · `ma = maOn.map(…maValuesOf(spec, candles.c, prev))` 둘 다 `useMemo` — `CandlePriceLayer` 에 메모된 `ma` 를 넘긴다(42-04 핸드오프). 판 제목 `unitLabel = candleUnitLabelOf(unit, unitPref === 'auto')` · `ownInTitle = ownLegend`(선 차트와 같은 식).
- **일별 종가:** `usePrevCloses(stockCode, session.date, hasDayLine)` — `hasDayLine` = 일 칩이 하나라도 있음(켜짐 무관). 캡션은 켜진 선의 `maStatusOf` 만 넘긴다.
- **수익률 판:** `day` · `cumRet` · `scales` 모두 `useMemo`(키에 마우스 · 터치 상태 없음 — SC-7). 눈금 점은 key-decisions 첫 줄 참고.
- **값 띠 · 값 점:** `bandVal = candleBandAt({ session, candles, ma, cumAvg, tick: {…} }, bandT, bandRec)` 하나로 띠와 값 점을 같이 만든다. 42-09 의 `tickBandAt` 값 점은 `bandVal.tick` 으로 바꿨고, 가격 판 점은 `bandVal.candle.c`, 수익률 판 점은 `scales.yDay(ret)`(`--team`) · `scales.yCum(cumRet)`(`--muted-fg`)이다.
- **카드 순서:** 제목 줄(`CandleChartTitle`) → 값 띠(`CandleChartBand`) → 차트 래퍼 → 구간 합계 줄 → 캡션 줄(`CandleChartCaption` — 폰 우리 범례 포함) → (데스크톱) 안내 줄.
- **보기 창:** `const { pending } = useViewSync(ctl, initialView, onViewChange)` · svg `visibility: pending ? 'hidden' : undefined`.

## 테스트 수

| 파일 | 이 플랜 전 | 이 플랜 뒤 | 새 테스트 |
|---|---|---|---|
| `candle-chart.test.tsx` | 20 | 36 | 「결선 · 가격 판」 7 · 「결선 · 수익률 · 띠 · 캡션」 6 · 「패널」 3 |
| `chart-kind-switch.test.tsx` | 7 | 13 | 「D-24 양쪽 · 기억」 6 |

- `-t 결선` 13 통과(기준 5 이상) · `-t 패널` 3 통과.
- 표본 실행(이 플랜이 건드린 파일 + 이웃 11개, `--maxWorkers=2`): **160 passed**. `tick-chart.test.tsx` · `tick-chart-view-sync.test.tsx` · `tick-viewer-live.test.tsx` 는 수정 없이 통과.
- webapp `typecheck` 통과 · 변경 파일 eslint 경고 0.
- **Ticks suite 전체(`src/lib/ticks src/components/ticks src/styles`)는 돌리지 않았다** — 오케스트레이터 지시(다른 세션과 동시 실행 · 메모리 보호: 건드린 파일과 이웃만)에 따랐다. 병합 뒤 오케스트레이터 전체 실행 몫.

## Task Commits

1. **Task 1: 가격 판 결선** — RED `750e2cae` · GREEN `d1b343a4`
2. **Task 2: 수익률 판 · 아래 판 · 띠 · 캡션** — RED `8c10e629` · GREEN `e273edea`
3. **Task 3: 제목 줄 · 보기 창 주고받기 · 뷰어 전달** — RED `19ca12fd` · GREEN `7e78fa70`

REFACTOR 커밋 없음.

## TDD Gate Compliance

세 태스크 모두 `test(42-10)` → `feat(42-10)` 순서. RED 증거는 vitest `tap-flat` 을 `-t` 로 대상 하나만 돌려 `gsd-tools check tdd-red-evidence` 판정을 받았다. 증거 파일은 커밋하지 않았다.

- **Task 1 RED (`750e2cae`):** 대상 「기억 없음 · 하루 전체 → 판 제목 · svg 이름 「10분봉(자동)」 …」 — `expected false to be true`(판 제목 없음) → **RED_EVIDENCE_OK**(target_test_failed). 전체 실행 7 중 6 실패(「일 칩 없음 → 요청 0」 은 결선 전에도 참). semanticAssessment: 모듈 로드 정상, 컨테이너가 `unitLabel` 을 넘기지 않아 계획한 단언에서 실패. 유효.
- **Task 2 RED (`8c10e629`):** 대상 「팀 매수 있는 세션 → 수익률 판 당일 선 …」 — `expected '' to match /^M/`(수익률 판 없음) → **RED_EVIDENCE_OK**. 전체 실행에서 새 테스트 7 실패 · 2 통과(NXT 캡션 · 폰 캡션 순서는 Task 1 이 캡션을 이미 결선해서 참) + 기존 값 점 개수 테스트(5 → 6) 실패. semanticAssessment: 유효.
- **Task 3 RED (`19ca12fd`):** 대상 「봉 차트 제목 줄 = …확대 버튼 5개(데스크톱 한 줄)」 — `expected null not to be null` → **RED_EVIDENCE_OK**. 처음 고른 대상(「선 1분 → 봉 차트 = 1분 …」, `expected '하루 전체' to be '1분'`)은 `waitFor` 오류 메시지에 testing-library 의 여러 줄 꼬리가 붙어 분류기가 Malformed TAP(`invalid_record`)으로 거부했다(`DEBUG_PRINT_LIMIT=0` 재실행도 같음). 같은 태스크의 다른 계획 단언(제목 줄)으로 대상을 바꿔 기록했다 — 보고서는 고치지 않았다. 전체 실행 6 중 4 실패(구간 지움 · 「전체」 이름 은 결선 전에도 참). semanticAssessment: 유효.

## Decisions Made

- frontmatter `key-decisions` 5건(눈금 점 · 띠 rec · 캡션 결선 시점 · A5 · E6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 테스트를 칩 클릭 대신 저장소 쓰기로**
- **Found during:** Task 1 RED
- **Issue:** 칩(`CandleMaChips`)은 Task 3 에서 제목 줄을 바꿔야 화면에 나온다 — Task 1 에서는 누를 칩이 없다.
- **Fix:** Task 1 은 `writeMaConfig(toggleMaLine(…))` 로 같은 저장소 변경을 내고, 칩 클릭 → 저장소 on false 는 Task 3 테스트(`chart-kind-switch.test.tsx`)로 옮겨 잠갔다.
- **Commit:** `750e2cae` · `19ca12fd`

**2. [Rule 3 - Blocking] 캡션 결선을 Task 1 로 당김**
- **Found during:** Task 1
- **Issue:** Task 1 behavior(일별 종가 실패 · 코드 없음 안내)를 보이려면 카드 아래 캡션 줄이 있어야 하는데 플랜은 캡션을 Task 2 에 두었다.
- **Fix:** `candleCaptionOf` → `CandleChartCaption` 을 Task 1 GREEN 에서 결선(누적 문구 포함 전체 함수). Task 2 는 누적 · NXT · 당일 · 폰 범례 · 줄 순서를 테스트로 잠갔다.
- **Commit:** `d1b343a4`

**3. [Rule 1 - 테스트 정합] 기존 값 점 개수 5 → 6**
- **Found during:** Task 2 RED
- **Issue:** 42-09 「마우스 세로선 · 값 점」 테스트가 값 점 5개를 단언 — 플랜 Task 2 가 수익률 판 당일 점을 더하므로 6개가 맞다.
- **Fix:** 개수만 6 으로(주석에 수익률 판 당일 점 명시). Task 3 의 「42-09 조작 테스트 수정 없이 통과」 는 제목 줄 교체 기준으로 지켰다(Task 3 에서 조작 · 겹침 테스트는 손대지 않음).
- **Commit:** `8c10e629`

**4. [Rule 1 - 테스트 정합] RED 때 쓴 단언 두 개 정정**
- **Found during:** Task 1 · Task 2 GREEN
- **Issue:** ① 실패 케이스 「봉은 그대로」 를 몸통 경로로 봤는데 하루 전체 1분 칸(< 3px)은 꼬리만 그린다. ② 당일 화면 「캡션 줄 없음」 이라 봤는데 봉 하나뿐인 세션이라 기본 이동평균 「봉이 모자라」 안내가 정상으로 남는다.
- **Fix:** ① 꼬리 경로로 확인 ② 캡션 항목이 이동평균 안내 둘뿐(누적 항목 없음)으로 단언.
- **Commit:** `d1b343a4` · `e273edea`

**Total deviations:** 4 auto-fixed(Rule 3 ×2 · Rule 1 ×2). **Impact:** 순서 조정 · 테스트 단언 정합 — 계약 이름 · 시그니처 · 동작 범위 변화 없음.

## 실행 환경 메모

- 워크트리라 `pnpm install --frozen-lockfile` · `pnpm --filter @gh-radar/shared build` 를 먼저 돌렸다(git 무시 대상). env 복사 불필요(`daily-closes` 는 테스트에서 모의).
- vitest 는 건드린 파일 + 이웃만 `--maxWorkers=2`. Playwright · 전체 스위트 · 배포 · push 없음. STATE.md · ROADMAP.md 는 손대지 않았다(오케스트레이터 몫).
- 워크트리 격리 때문에 계획 커밋 원장(`gsd-plan-head-before-42-10`)을 git dir 에 쓰지 못했다 — 기준 `c867774d` 는 디스패치 기준 해시로 측정했다(`git rev-list --count c867774d..HEAD` = 6).

## Known Stubs

없음. 이 플랜으로 Wave 2 부품이 모두 화면에 이어졌다.

## Next Phase Readiness

- 42-11 UAT: 실기기 체감(SC-7 마우스 이동 · 휠) · 폰 두 줄 제목 · 캡션 줄바꿈 · 전환 깜박임 · A5(NXT 일 이동평균 = KRX 일봉 종가) 사용자 확인.
- 병합 뒤 오케스트레이터가 Ticks suite 전체 · webapp 전체 회귀를 돌린다.

## Self-Check: PASSED

- 수정 파일 5개 존재 · 커밋 `750e2cae` · `d1b343a4` · `8c10e629` · `e273edea` · `19ca12fd` · `7e78fa70` 모두 HEAD 조상.
- Task 1 수용 기준: 다섯 이름 줄 9 · page `stockCode={view.resp.stock?.code ?? null}` 2 · viewer `stockCode` 3 · `-t 결선` 13 통과(≥ 5).
- Task 2 수용 기준: 여섯 이름 각각 2 ~ 3줄 · `dayReturnPointsOf` 3 · `useMemo` 20(≥ 5) · 테스트 `tick-team-ret` 1 · `-t 패널` 3 통과.
- Task 3 수용 기준: `useViewSync(ctl, initialView, onViewChange)` 1 · `CandleChartTitle` 3 · viewer `onViewChange={onViewChange}` 2 · 「D-24 양쪽 · 기억」 6 통과 · 42-09 「조작」 그대로 통과 · `tick-chart.test.tsx` 수정 없이 통과.

---
*Phase: 42-tick-chart-candle-overlay*
*Completed: 2026-11-12*
