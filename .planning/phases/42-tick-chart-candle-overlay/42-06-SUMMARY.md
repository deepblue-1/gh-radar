---
phase: 42-tick-chart-candle-overlay
plan: 06
subsystem: webapp/ticks
tags: [tick-viewer, candle-chart, value-band, caption, tdd]

requires:
  - phase: 42-01
    provides: "Candles · CandleUnit · candleIdxAt · candlesOf"
  - phase: 42-02
    provides: "cumAvgAt"
  - phase: 42-03
    provides: "CandleMaValue · MaStatus"
provides:
  - "lib/ticks/candle-readout.ts — CandleBandSrc · CandleBand · candleBandAt · CandleCaptionInput · candleCaptionOf"
  - "components/ticks/candle-chart-band.tsx — CandleChartBand · CANDLE_BAND_H"
  - "components/ticks/candle-chart-caption.tsx — CandleChartCaption"
  - "tick-chart-band.tsx Head · Row · Kv · Rest export"
affects: [42-10, 42-11]

tech-stack:
  added: []
  patterns:
    - "값 띠 값은 기존 계산(teamKpiAt · tickBandAt · cumAvgAt · candleIdxAt)을 불러 조립만 한다 — 정의 복제 없음"
    - "패널과 같은 글자가 필요한 수익률 포맷은 fmtRet 식을 그대로 복제하고 테스트가 패널 DOM 글자와 대조한다"

key-files:
  created:
    - webapp/src/lib/ticks/candle-readout.ts
    - webapp/src/lib/ticks/__tests__/candle-readout.test.ts
    - webapp/src/components/ticks/candle-chart-band.tsx
    - webapp/src/components/ticks/__tests__/candle-chart-band.test.tsx
    - webapp/src/components/ticks/candle-chart-caption.tsx
    - webapp/src/components/ticks/__tests__/candle-chart-caption.test.tsx
  modified:
    - webapp/src/components/ticks/tick-chart-band.tsx

key-decisions:
  - "둘째 칸 2줄(평단 · 수익률)은 팀 체결이 하루에 없어도 「—」 로 늘 그린다 — 3 · 4줄(누적) 자리가 위로 당겨지지 않게"
  - "누적 수익률의 「그 시각 가격」 = tickBandAt 의 px(t 이하 마지막 가격) — 띠 첫 칸 가격 정의와 같다"
  - "봉 없는 시각의 첫 칸 머리는 「{N}분봉」(봉 시작 시각 없이) · 커서 자체가 없으면 「봉」"
  - "일별 종가 실패 안내는 첫 error 선 자리에 한 번만 끼운다(입력 순서 유지)"

requirements-completed: [SC-3, SC-4, SC-5]

coverage:
  - id: D1
    description: "값 띠 값 — 봉 칸(candleIdxAt · 등락률) · 이동평균 그 봉 값 · 평단/수익률 = teamKpiAt(toBe) · tick = tickBandAt(toEqual) · 누적 평단/수익률(px 0 · [] 처리)"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/candle-readout.test.ts (15 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "캡션 글자 — 당일 없음 · 미등록 · 포지션 없음 · KRX/NXT 누적 문구 · short-days · short-bars · error 한 번 · loading/ok 없음"
    requirement: SC-5
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/candle-readout.test.ts (-t candleCaptionOf 4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "값 띠 A 4칸 높이 고정(88 · 137) · 봉 칸 · 이동평균 줄(데스크톱 이름 · 폰 title/aria-label) · 띠 수익률 글자 = TickTeamPanel tick-team-ret 글자 · 셋째 · 넷째 칸 innerHTML = TickChartBand"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-chart-band.test.tsx (11 passed)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-chart.test.tsx (29 passed · 수정 없음)"
        status: pass
    human_judgment: false
  - id: D4
    description: "카드 아래 캡션 줄 — 없으면 null · 폰 우리 범례가 항목 앞 · 데스크톱 범례 없음 · 긴 안내가 flex-wrap 루트 직속(잘림 클래스 없음)"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/candle-chart-caption.test.tsx (4 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "가격 7자리 · 이동평균 6개 · 「단순 240」 에서 칸 높이 불변(잘림만) · 폰 360 에서 가장 긴 안내 줄바꿈"
    verification: []
    human_judgment: true
    rationale: "UI-SPEC backstop 시각 확인 — 결선(42-10) 뒤 42-11 UAT 에서 실기기로 확인(이 플랜은 Playwright 금지)"

estimate:
  tokens: 60000
  tasks: 3
actuals:
  tokens: 9600
  tasks: 3
  commits: 5
plan_head_before: f49f70b878aff34219bb5c36522a8fccf4d57c58
plan_head_after: 22e1102b9d7d577f82635a3c45429aca3515c097

duration: 25min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 06: 값 띠 · 캡션 Summary

**봉 차트 값 띠 A 4칸(봉 · 당일 팀 · 10분 · 누적, 데스크톱 88 · 폰 137 고정)과 카드 아래 캡션 줄을 만들었다. 값 계산(`candleBandAt`)은 기존 `teamKpiAt` · `tickBandAt` · `cumAvgAt` · `candleIdxAt` 를 그대로 부르고, 현재 틱일 때 띠 수익률 글자가 팀 거래정보 패널 `tick-team-ret` 글자와 같다는 것을 컴포넌트 테스트가 DOM 끼리 대조해 잠갔다.**

## Performance

- **Duration:** 약 25분
- **Completed:** 2026-11-12
- **Tasks:** 3
- **Files:** 새 파일 6개, 수정 1개

## 뒤 플랜(42-10 결선)이 읽는 실제 시그니처

`webapp/src/lib/ticks/candle-readout.ts`
```ts
export interface CandleBandSrc {
  session: TickSession;
  candles: Candles;                    // 지금 단위 봉(candlesOf)
  ma: readonly CandleMaValue[];        // 켜진 선만 · 칩 순서
  cumAvg: readonly PricePoint[];       // cumAvgPointsOf(accum, isToday)
  tick: TickBandSource;                // 선 차트와 같은 입력(team · cum · price · turnover · basePx · mcap · T0)
}
export interface CandleBand {
  tick: TickBand; unit: CandleUnit;
  candle: { start; o; h; l; c; amt; chgPct: number | null } | null;
  ma: { key: string; name: string; color: number; v: number | null }[];
  avgPx: number | null; ret: number | null;          // teamKpiAt(session.team, session, rec)
  hasCumAvg: boolean; cumAvg: number | null; cumRet: number | null;  // 비율(0.1 = +10%)
}
export function candleBandAt(src: CandleBandSrc, t: number, rec: number): CandleBand;
export interface CandleCaptionInput {
  accum: TickOpenResponse['accum'] | null | undefined;
  isToday: boolean; hasCum: boolean; nxt: boolean;
  ma: readonly { name: string; status: MaStatus }[];
}
export function candleCaptionOf(input: CandleCaptionInput): string[];
```
- `t` = 마우스 · 터치 시각, 없으면 커서 ms. `rec` = 커서 rec(마우스 시각의 rec 가 아님). 패널과 같은 글자를 내려면 패널과 같은 커서 rec 를 넘긴다.
- `hasCum` = pos_net 점이 있나(선 차트 `cumLegendOf` 의 `hasCum` 과 같은 뜻). `ma` 는 캡션에 넣을 선(켜진 선)을 칩 순서대로 넘긴다.

`webapp/src/components/ticks/candle-chart-band.tsx`
```ts
export const CANDLE_BAND_H = { desktop: 88, phone: 137 } as const;
export function CandleChartBand({ band, live, phone }: { band: CandleBand | null; live: boolean; phone: boolean }): JSX.Element;
```
- data-slot: `candle-chart-band`(`data-live` · `data-dims`) · `candle-band-cell`(`data-cell` = `candle` · `team` · `slot` · `turnover`) · `candle-band-head` · `candle-band-ma` · `candle-band-ma-item` · `candle-band-ret`.

`webapp/src/components/ticks/candle-chart-caption.tsx`
```ts
export function CandleChartCaption({ phone, ownLegend, items }: { phone: boolean; ownLegend: boolean; items: readonly string[] }): JSX.Element | null;
```
- data-slot: `candle-chart-caption` · `candle-caption-own`(폰 범례 둘) · `candle-caption-item`.

`webapp/src/components/ticks/tick-chart-band.tsx` — `Head` · `Row` · `Kv` · `Rest` 앞에 `export` 만 더했다(`git diff --numstat b72dcd0f` = 4 / 4).

계약 변경 없음. 42-01 「Artifacts」 의 이름을 그대로 썼다. data-slot `candle-band-head` · `candle-band-ma-item` · `candle-caption-own` 은 테스트용으로 새로 더한 것이다.

## 테스트 수

| 파일 | 테스트 |
|---|---|
| `candle-readout.test.ts` | 15(기준 12 이상) |
| `candle-chart-band.test.tsx` | 11(기준 8 이상) |
| `candle-chart-caption.test.tsx` | 4(기준 4 이상) |
| 기존 `tick-chart.test.tsx` | 29(수정 없음) |

플랜 검증: 네 파일을 한 번에 돌려 59개 통과. `pnpm --filter @gh-radar/webapp run typecheck` 통과, 새 파일과 수정 파일 eslint 출력 없음. 지키는 파일(`tick-chart.ts` · `team-model.ts` · `tick-chart-tip.ts` · `own-model.ts` · `tick-chart.test.tsx` · `tick-team-panel.tsx`)은 `b72dcd0f` 대비 diff 가 없다.

## Task Commits

1. **Task 1 RED:** `8b86994b`(test) / **GREEN:** `52355f68`(feat)
2. **Task 2 RED:** `db56d228`(test) / **GREEN:** `346d90b0`(feat)
3. **Task 3:** `22e1102b`(feat, TDD 아님)

REFACTOR 커밋은 없다. 정리할 것이 없었다.

## TDD Gate Compliance

- **Task 1 RED (`8b86994b`):** 대상은 「candleBandAt — 첫 칸 「봉」 > 5분봉 10:15 칸 안 시각(10:16:52) → …」. 뼈대가 `candle: null` 을 돌려 `expected null not to be null` 단언에서 실패했다. 전체 실행에서는 15개 중 12개가 실패했고, 3개(전제 · rec −1 null · 누적 [] false)는 뼈대로도 참이라 통과했다. vitest TAP 리포터가 여러 줄 메시지를 이스케이프 없이 찍어 전체 출력은 분류기가 Malformed TAP 으로 거부했다. 그래서 같은 명령에 `-t 10:16:52` 로 대상만 다시 돌려 `gsd-tools check tdd-red-evidence` 에서 **RED_EVIDENCE_OK**(target_test_failed)를 받았다. 의미 판정: import 는 성공했고 계획한 단언에서 실패했다. 유효하다.
- **Task 2 RED (`db56d228`):** 대상은 「데스크톱 — 루트 h-[88px] · 칸 비율 …」. 뼈대 루트의 className 이 빈 문자열이라 `expected '' to contain 'h-[88px]'` 로 실패했다. `-t 1.5fr` 대상 실행으로 **RED_EVIDENCE_OK**. 전체 11개 중 10개가 실패했다. 의미 판정은 유효하다(로드 · 픽스처 오류 아님).
- GREEN 커밋은 각각 자기 RED 커밋의 후손이다. 증거 파일(`.red/`)은 커밋하지 않았다.

## Deviations from Plan

없음. 플랜대로 실행했다. 위 key-decisions 4건은 플랜이 열어 둔 세부(빈 상태 머리 글자 · 2줄 표시 조건 · 가격 정의 · 오류 안내 자리)를 정한 것이고 동작 범위는 바꾸지 않았다.

## Known Stubs

없음. 세 산출물 모두 실제 값으로 그린다. 차트 카드에 결선하는 일(어느 시각 · 어느 rec · 켜진 선 상태를 넘길지)은 플랜이 42-10 몫으로 정해 두었다. 그래서 지금은 화면에 나오지 않는다.

## Issues Encountered

- 워크트리라 `pnpm install --frozen-lockfile` · `pnpm --filter @gh-radar/shared build` 를 먼저 돌렸다(둘 다 git 무시 대상). env 파일은 필요 없었다.
- 프로젝트에 prettier 가 없어 포맷 검사는 eslint 로만 했다.

## Next Phase Readiness

- 42-10 은 `CandleChart` 안에서 `candleBandAt({ session, candles, ma: 켜진 선 값, cumAvg, tick: 선 차트와 같은 입력 }, bandT, cursorRec)` 을 `CandleChartBand` 에 넘긴다. 그다음 `candleCaptionOf({ accum, isToday, hasCum, nxt: session.ex === 'NXT', ma: 켜진 선 상태 })` 를 `CandleChartCaption` 의 `items` 로 넘긴다.
- 폰 우리 범례 조건은 선 차트 `ownLegend` 와 같은 식(하루에 우리 점이 하나라도 있음)으로 넘긴다.

## Self-Check: PASSED

- 새 파일 6개와 수정 파일 1개가 모두 있다.
- 커밋 `8b86994b` · `52355f68` · `db56d228` · `346d90b0` · `22e1102b` 가 모두 HEAD 의 조상이다.
- 세 태스크의 acceptance_criteria grep 을 다시 확인했다. export 두 함수, teamKpiAt · tickBandAt, 문구 2개, `it(` 15 · 11 · 4, `h-[88px]` · `h-[137px]` · `candle-band-ret`, 테스트의 `tick-team-ret`, `flex flex-wrap gap-x-3 gap-y-1`, `candle-caption-item` 모두 통과했다. 띠 부품 export 4줄과 numstat 4/4 도 맞다.
