---
phase: 42-tick-chart-candle-overlay
plan: 03
subsystem: webapp-lib
tags: [ticks, candle-chart, moving-average, localStorage, useSyncExternalStore, supabase, css-tokens]

requires:
  - phase: 09.2
    provides: "stock_daily_ohlcv 브라우저 직접 읽기 경로(daily-ohlcv-api.ts · RLS anon + authenticated)"
provides:
  - "candle-ma.ts — 이동평균 정의 · 계산(봉 단순 · 봉 지수 · 일 단순) · 이름 · 검증 · 상태 · 경로"
  - "daily-closes.ts fetchPrevCloses · use-prev-closes.ts usePrevCloses — 앞 거래일 종가 (코드, 날짜)마다 한 번"
  - "candle-prefs.ts — 저장 키 3 · parse/검사 · 색 배정 · 더하기/켜고 끄기/지우기 · 읽기/쓰기/구독"
  - "use-candle-prefs.ts — useChartKind · useCandleUnitPref · useMaConfig"
  - "globals.css --ma-1 ~ --ma-6(라이트 · 다크 hex)"
affects: [42-04, 42-06, 42-07, 42-08, 42-10]

actuals:
  tokens: 14700
  tasks: 3
  commits: 6
plan_head_before: 28959b35b35790d1a80c3c05c85b608b8c71642e
plan_head_after: 4cd85937c55b3effe24e2decf8073779081d68b2

tech-stack:
  added: []
  patterns:
    - "브라우저 기억 = 순수 lib(read/write/subscribe · 원문 문자열 캐시) + use-*.ts 훅(useSyncExternalStore · 서버 스냅숏 = 기본)"
    - "저장 실패한 쓰기는 이 탭 메모리(unsaved Map)로 정본 유지 — 다음 성공 쓰기에서 저장소로 복귀"
    - "이동평균 값 = Float64Array(NaN = 값 없음) · 경로 끊김 = NaN 또는 (간격 ≥ 30분 && 간격 > 한 단위)"

key-files:
  created:
    - webapp/src/lib/ticks/candle-ma.ts
    - webapp/src/lib/ticks/daily-closes.ts
    - webapp/src/lib/ticks/use-prev-closes.ts
    - webapp/src/lib/ticks/candle-prefs.ts
    - webapp/src/lib/ticks/use-candle-prefs.ts
    - webapp/src/lib/ticks/__tests__/candle-ma.test.ts
    - webapp/src/lib/ticks/__tests__/daily-closes.test.ts
    - webapp/src/lib/ticks/__tests__/candle-prefs.test.ts
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts

key-decisions:
  - "저장 쓰기 실패 시 같은 탭에서는 고른 값을 메모리로 기억해 화면이 따라가게 했다 — 알림만 보내고 저장소를 다시 읽으면 사생활 모드에서 스위치가 먹지 않기 때문(UI E1 「화면 상태는 그대로」)"
  - "usePrevCloses 는 enabled 가 꺼져도 받아 둔 배열을 돌려준다(다시 켤 때 요청 0) · 실패(error)는 같은 (코드, 날짜)에서 다시 받지 않는다 · 취소된 늦은 응답은 버린다"
  - "isValidMaSpec 은 unknown 을 받는 타입 가드 — parseMaConfig 가 저장 원문 항목을 그대로 검사한다"
  - "use-prev-closes.ts 에 42-01 색인의 PrevCloses 이름을 PrevClosesState 별칭으로 함께 export"

patterns-established:
  - "RED 뼈대: 계약 이름 · 타입 · 상수만 두고 함수는 틀린 값을 돌려 단언으로 실패시킨 뒤 GREEN 에서 채운다"

requirements-completed: [SC-1, SC-3]

coverage:
  - id: D1
    description: "이동평균 세 종류(봉 단순 · 봉 지수 · 일 단순)가 정의식과 같고(toBeCloseTo 9자리) 모자라면 NaN · 이름 · 검증 · 그릴 수 있는지 · 30분 빈 칸 끊김 경로"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/candle-ma.test.ts (18 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "앞 거래일 종가 조회(.lt · 내림차순 · limit 239 · 뒤집기 · 0 제외) + (코드, 날짜)마다 한 번 받는 훅(취소 · 상태)"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/daily-closes.test.ts (9 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "브라우저 기억 키 3 · 깨진 값 기본 · 항목 단위 검사 · 빈 배열 존중 · 색 배정 · 같은 원문 같은 참조 · 쓰기 실패 삼킴 · 훅 서버 렌더 기본"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/candle-prefs.test.ts (18 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "이동평균 색 토큰 --ma-1 ~ --ma-6 이 라이트 · 다크에 UI-SPEC 값(hex)으로 있고 oklch 없음"
    verification:
      - kind: unit
        ref: "webapp/src/styles/__tests__/tds-tokens.test.ts (97 tests)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-11-12
status: complete
---

# Phase 42 Plan 03: 이동평균 · 일별 종가 · 브라우저 기억 · 색 토큰 Summary

**봉 단순 · 봉 지수 · 일 단순 이동평균을 정의식 그대로 계산하는 순수 함수, `stock_daily_ohlcv` 앞 거래일 종가 239개를 (코드, 날짜)마다 한 번 받는 훅, 차트 종류 · 봉 단위 · 이동평균 구성을 기억하는 `localStorage` 저장소와 훅 3개, 이동평균 색 토큰 6개를 테스트로 잠갔다.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-11-12T13:27:19Z
- **Completed:** 2026-11-12T13:36Z
- **Tasks:** 3
- **Files:** 10(새 8 · 수정 2)

## Accomplishments

- `candle-ma.ts` — 정의식 · 「봉은 그날 것만」 · 일 기준은 단순만 · 끊김 규칙이 테스트(18개)로 잠김
- `fetchPrevCloses` · `usePrevCloses` — 서버 변경 없이 기존 브라우저 읽기 경로로 앞 거래일 종가만(그날 장중 행 제외)
- `candle-prefs.ts` · `use-candle-prefs.ts` — UI-SPEC S10 · S3 색 배정 규칙 그대로, 서버 렌더는 기본값
- `--ma-1` ~ `--ma-6` 라이트 · 다크 토큰 + `tds-tokens.test.ts` 기대값

## 뒤 플랜이 쓰는 export 시그니처(계약)

`webapp/src/lib/ticks/candle-ma.ts`
```ts
export type MaBase = 'bar' | 'day';
export type MaKind = 'sma' | 'ema';
export interface MaSpec { base: MaBase; n: number; kind: MaKind }
export const MA_N_MIN = 2; MA_N_MAX = 240; MA_MAX_LINES = 6; PREV_CLOSES_N = 239; MA_GAP_BREAK_MS = 30 * 60_000;
export type PrevClosesState = readonly number[] | 'idle' | 'loading' | 'error' | 'nocode';
export type MaStatus = 'ok' | 'short-bars' | 'short-days' | 'loading' | 'error';
export interface CandleMaValue { key: string; name: string; color: number; values: Float64Array }
export function maKeyOf(spec: MaSpec): string;            // `${base}:${kind}:${n}`
export function maNameOf(spec: MaSpec): string;           // 「단순 5」 · 「지수 20」 · 「일 20」
export function isValidMaSpec(spec: unknown): spec is MaSpec;
export function smaOf(c: Float64Array, n: number): Float64Array;
export function emaOf(c: Float64Array, n: number): Float64Array;
export function daySmaOf(c: Float64Array, prevCloses: readonly number[], n: number): Float64Array;
export function maValuesOf(spec: MaSpec, closes: Float64Array, prev: PrevClosesState): Float64Array;
export function maStatusOf(spec: MaSpec, nBars: number, prev: PrevClosesState): MaStatus;
export function maPathOf(t0: Float64Array, unitMs: number, v: Float64Array,
  x: (t: number) => number, y: (v: number) => number): string;   // 클립은 컴포넌트가
```
- `maStatusOf` 일 기준: `'idle'` · `'loading'` → `loading`(선 없음 · 캡션 없음) · `'error'` → `error` · `'nocode'` → `short-days`.

`webapp/src/lib/ticks/daily-closes.ts`(클라이언트 지시문) · `use-prev-closes.ts`(클라이언트 지시문)
```ts
export async function fetchPrevCloses(code: string, ymd: string /* YYYYMMDD */, n: number, signal?: AbortSignal): Promise<number[]>;
export type PrevCloses = PrevClosesState;
export function usePrevCloses(code: string | null | undefined, ymd: string, enabled: boolean): PrevClosesState;
```
- `enabled` = 일 칩이 하나라도 있음(켜짐 무관). 꺼도 받아 둔 배열은 그대로 돌려준다.

`webapp/src/lib/ticks/candle-prefs.ts`(순수 lib)
```ts
export const TICK_CHART_KIND_KEY = 'gh-radar:tick-chart-kind';
export const TICK_CANDLE_UNIT_KEY = 'gh-radar:tick-candle-unit';
export const TICK_CANDLE_MA_KEY = 'gh-radar:tick-candle-ma';
export type ChartKindPref = 'line' | 'candle';
export type CandleUnitPref = 'auto' | 1 | 5 | 10 | 15 | 30 | 60;
export interface MaLine extends MaSpec { on: boolean; color: number /* 1 ~ 6 */ }
export interface MaConfig { v: 1; lines: readonly MaLine[] }
export const DEFAULT_MA_CONFIG: MaConfig;   // 얼린 객체 · 단순 5(색 1) · 단순 20(색 2) 켜짐
export function parseChartKind(raw: string | null): ChartKindPref;
export function parseCandleUnit(raw: string | null): CandleUnitPref;
export function parseMaConfig(raw: string): MaConfig;
export function nextMaColor(lines: readonly MaLine[]): number | null;
export function addMaLine(cfg: MaConfig, spec: MaSpec): MaConfig;       // 무변화면 같은 객체
export function toggleMaLine(cfg: MaConfig, key: string): MaConfig;     // key = maKeyOf
export function removeMaLine(cfg: MaConfig, key: string): MaConfig;
export function readChartKind(): ChartKindPref;  export function writeChartKind(kind: ChartKindPref): void;
export function readCandleUnit(): CandleUnitPref; export function writeCandleUnit(unit: CandleUnitPref): void;
export function readMaConfig(): MaConfig;        export function writeMaConfig(cfg: MaConfig): void;
export function subscribeCandlePrefs(cb: () => void): () => void;
```

`webapp/src/lib/ticks/use-candle-prefs.ts`(클라이언트 지시문)
```ts
export function useChartKind(): [ChartKindPref, (kind: ChartKindPref) => void];
export function useCandleUnitPref(): [CandleUnitPref, (unit: CandleUnitPref) => void];
export function useMaConfig(): [MaConfig, (cfg: MaConfig) => void];
```

## 테스트 수

| 파일 | 테스트 |
|---|---|
| `candle-ma.test.ts` | 18 |
| `daily-closes.test.ts` | 9 |
| `candle-prefs.test.ts` | 18 |
| `tds-tokens.test.ts` | 97(이 플랜이 12 더함 + 토큰 집합 루프 2개에 6개 추가) |

플랜 검증: 네 파일 한 번에 142 통과 · `pnpm --filter @gh-radar/webapp run typecheck` 통과 · 새 파일 eslint 경고 0.

## Task Commits

1. **Task 1: 이동평균** — RED `820a5de0` · GREEN `38bab5ad`
2. **Task 2: 일별 종가** — RED `a762f80e` · GREEN `0eabd346`
3. **Task 3: 브라우저 기억 + 색 토큰** — RED `cf43aa5c` · GREEN `4cd85937`

REFACTOR 커밋 없음(정리할 것이 없었다).

## TDD Gate Compliance

세 태스크 모두 `test(42-03)` → `feat(42-03)` 순서. RED 증거는 vitest `tap-flat` 출력으로 `gsd_run check tdd-red-evidence` 를 돌려 셋 다 `RED_EVIDENCE_OK`(target_test_failed).

- **Task 1 RED:** 대상 「봉 단순 — smaOf([1,2,3,4,5], 3) = [NaN, NaN, 2, 3, 4]」. 뼈대가 0 배열을 돌려 `[0] 는 NaN 이어야` 단언에서 실패(AssertionError). 18개 중 16개가 계획한 단언에서 실패, 2개(상수 · 봉 기준이 종가 상태와 무관)는 뼈대로도 참이라 통과. 의미 판정: 의도한 이유로 실패 — 유효.
- **Task 2 RED:** 대상 「usePrevCloses > 코드가 없으면 요청 없이 nocode」. 뼈대 훅이 늘 `'idle'` 이라 `expected 'idle' to be 'nocode'`. 전체 실행에서는 9개 중 8개가 단언 실패(「enabled false → idle」 만 우연히 통과). vitest TAP 리포터가 여러 줄 메시지(`toHaveBeenCalledWith` · `waitFor` DOM 덤프)를 이스케이프 없이 찍어 전체 출력은 분류기가 Malformed TAP 으로 거부했다 → 같은 명령에 `-t` 로 대상 하나만 다시 돌려 기록(RED 4단계의 「지원 리포터로 대상 재실행」). 의미 판정: 유효.
- **Task 3 RED:** 대상 「parseChartKind — candle 만 봉 차트 · 모르는 값 · 없음은 선 차트」. 뼈대가 늘 `'line'`. 전체 실행에서 candle-prefs 14개 + 토큰 14개(값 12 · 집합 2) 실패(나머지는 뼈대로도 참). 같은 이유로 `-t` 대상 재실행으로 기록. 의미 판정: 유효.

## Decisions Made

- **저장 실패 시 이 탭 메모리 유지** — 계획 behavior 「setItem 이 throw 해도 … 구독자는 알림」 을 그대로 하면 알림 뒤 다시 읽는 값이 옛 저장값이라 화면이 안 바뀐다. 실패한 쓰기 원문을 모듈 `Map` 에 두고 읽기에서 우선하게 했다(다음 성공 쓰기에서 지움). 테스트가 「실패 뒤에도 이 탭은 고른 값」 을 잠근다.
- `parseCandleUnit(' 5')` 처럼 공백 섞인 값도 「자동」 — 저장값은 정확한 문자열만 인정.
- `parseMaConfig` 는 결과 항목을 다섯 키(`base · n · kind · on · color`)만 남긴 새 객체로 만들고, `writeMaConfig` 도 다섯 키만 저장한다(낯선 키가 흘러들지 않게).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] 저장 쓰기 실패 때 화면이 고른 값을 따르지 않는 문제 예방**
- **Found during:** Task 3
- **Issue:** 계획대로 쓰기 실패를 삼키고 알림만 보내면 `useSyncExternalStore` 가 저장소를 다시 읽어 옛 값을 돌려준다 — 사생활 모드 · 용량 초과에서 「선 차트 | 봉 차트」 스위치가 안 먹는다(UI E1 「화면 상태는 그대로」 위반).
- **Fix:** `candle-prefs.ts` 의 `unsaved` Map — 실패한 쓰기는 이 탭 메모리에 남겨 읽기에서 우선, 성공한 쓰기에서 지움.
- **Files modified:** `webapp/src/lib/ticks/candle-prefs.ts`
- **Commit:** `4cd85937`

**2. [Rule 3 - 막힘] 테스트 mock 의 lint 경고**
- **Found during:** Task 2
- **Issue:** 체인 mock 의 밑줄 매개변수가 `no-unused-vars` 경고 9개.
- **Fix:** `vi.fn<타입>(…)` 으로 타입을 명시하고 매개변수 제거.
- **Files modified:** `webapp/src/lib/ticks/__tests__/daily-closes.test.ts`
- **Commit:** `0eabd346`

**Total deviations:** 2 auto-fixed(Rule 2 하나 · Rule 3 하나). **Impact:** 계약 이름 · 시그니처 변화 없음 — 뒤 플랜에 영향 없음.

## 계약 변경

없음. 42-01 색인의 이름을 모두 그대로 export 했다(`use-prev-closes.ts` 의 `PrevCloses` 는 `PrevClosesState` 별칭).

## Issues Encountered

- 워크트리에 `node_modules` · shared `dist` 가 없어 `pnpm install --frozen-lockfile` · `pnpm --filter @gh-radar/shared build` 를 먼저 돌렸다(둘 다 git 무시 대상).

## Next Phase Readiness

- 42-04(가격 판 이동평균 선) · 42-06(값 띠 · 캡션) · 42-07(조작부 칩 · 더하기 창 · 봉 단위 메뉴) · 42-08(뷰어 `useChartKind` 연결)이 위 시그니처를 그대로 쓰면 된다.
- 일 이동평균 `enabled` 는 「일 칩이 하나라도 있음」 으로 넘길 것(Q2). 종목 코드가 없으면 `null` 을 넘기면 `'nocode'` → `maStatusOf` 가 `short-days`.

## Self-Check: PASSED

- 새 파일 8 · 수정 파일 2 모두 존재
- 커밋 `820a5de0` · `38bab5ad` · `a762f80e` · `0eabd346` · `cf43aa5c` · `4cd85937` 모두 HEAD 조상
- 세 태스크 acceptance_criteria 재실행 전부 통과 · 플랜 검증(네 테스트 파일 + typecheck) 통과
