---
phase: quick-261021-amg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/accum-report.ts
  - webapp/src/lib/accum-chart.ts
  - webapp/src/lib/__tests__/accum-chart.test.ts
  - webapp/src/components/analytics/accum-chart.tsx
  - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
  - webapp/src/components/analytics/accum-detail.tsx
  - webapp/src/components/analytics/__tests__/accum-report.test.tsx
  - .planning/phases/34-accum/34-UI-SPEC.md
autonomous: true
requirements: [AMG-CONTRACT, AMG-LINE, AMG-LEGEND, AMG-SPEC]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "payload.avg_px 가 있는 상세를 펼치면 가격 판에 빨간(--up) 점점선 「팀 평단」 계단이 가격 선 위 · 주문 원 아래 층에 그려진다. 다음 점까지 수평을 유지하고 값이 바뀌는 점에서 수직으로 꺾이며, px 0 점에서 끊긴 뒤 다음 양수 점에서 새로 시작한다. 열린 마지막 조각은 max(마지막 체결 칸 시각, 마지막 점 시각)까지 수평으로 이어진다(가격 선이 마지막 체결 칸에서 끝나는 규칙과 같다)"
    - "09:00 미만 점(이월 종목 06:01 row 2)은 x = 09:00 에 붙고, 09:00 전 점이 여럿이면 마지막 점만 쓴다. 같은 ms 두 점(종료 값 → 0)은 배열 순서대로 처리한다(정렬하지 않는다)"
    - "평단이 보이는 창의 가격 범위 밖이면 가격 판 위/아래 끝(range.hi / range.lo)에 붙어 그려진다(WinForms AccumChartPanel 처럼 클램프). 가격 축 글자 · 가격 선 · 원 위치(priceRangeOf · D-14 축 맞춤)는 평단이 있든 없든 같다"
    - "avg_px 가 없거나(10/21 이전 export 행) 모양이 어긋나면 평단 선만 빠진다. 차트 · KPI 줄 · 사이클 표 · 손익 줄은 전과 같다(payloadOf 6키 검증 무변경 — 행을 버리지 않는다)"
    - "범례는 9항목 「가격(10초) · 팀 평단 · 팀 매수 · 팀 매도 · 팀매수 시작 · 순매수 누적 · 등록 · 청산·종료 · 등록 전」 이다. 로딩 스켈레톤의 범례 칸도 LEGEND 길이에서 나와 9칸이다(스켈레톤 전체 14)"
    - "평단 선은 pointer-events none 이고 <title> 이 없다. 휠 · 끌기 · 핀치 · 원/막대/세로선 툴팁은 그대로다"
  artifacts:
    - path: "packages/shared/src/accum-report.ts"
      provides: "AccumReportPayload.avg_px 선택 키 { t_ms: number[]; px: number[] } + 계약 주석(7키)"
      contains: "avg_px?:"
    - path: "webapp/src/lib/accum-chart.ts"
      provides: "avgPxPointsOf(모양 방어 · 배열 순서 유지) · avgPxPathOf(계단 · 0 끊기 · 09:00 맞춤 · 가격축 클램프 · 끝 연장) — 기존 함수 무변경, 추가만"
      contains: "export function avgPxPathOf"
    - path: "webapp/src/components/analytics/accum-chart.tsx"
      provides: "가격 레이어 안 가격 선 다음 · 원 앞 path[data-slot=accum-team-avg-path]"
      contains: "accum-team-avg-path"
    - path: "webapp/src/components/analytics/accum-detail.tsx"
      provides: "LEGEND 「팀 평단」 항목(가격(10초) 바로 뒤 · --up 점선 견본)"
      contains: "'팀 평단'"
  key_links:
    - from: "webapp/src/components/analytics/accum-chart.tsx AccumChart"
      to: "webapp/src/lib/accum-chart.ts avgPxPathOf · avgPxPointsOf · lastTradeMsOf"
      via: "avgPxPathOf(avgPxPointsOf(payload), x, pRange, bounds.T0, lastTradeMsOf(payload.price) ?? bounds.T2000)"
      pattern: "avgPxPathOf\\(avgPxPointsOf\\(payload\\)"
    - from: "webapp/src/lib/accum-chart.ts avgPxPathOf"
      to: "yOfPrice(range) — 가격 판 같은 y 축, [range.lo, range.hi] 클램프"
      via: "Math.min(range.hi, Math.max(range.lo, p))"
      pattern: "range\\.lo"
    - from: "webapp/src/components/analytics/accum-detail.tsx 로딩 스켈레톤"
      to: "LEGEND 배열"
      via: "LEGEND.map — 범례 칸 수가 LEGEND 길이에서 나온다(새 항목 = 스켈레톤 칸 +1)"
      pattern: "LEGEND\\.map"
---

<objective>
gh-trade quick-261021-3rf 가 accum_flow export payload 에 7번째 키 `avg_px` 를 넣었다. 그 시각 등록 포지션의 팀 평단을 분 단위 계단으로 싣고, 0 은 「등록 포지션 없음」이다.
매집감지 상세 가격 차트에 이 값을 WinForms AccumChartPanel 과 같은 모양의 「팀 평단」 빨간 점점선으로 그리고, 범례에 항목을 하나 더한다.
계약 정본은 `docs/inbox/from-gh-trade/261020-accum-flow-export.md:113`(`avg_px` 줄)이다.

Purpose: 트레이더가 가격 선과 팀 매수 원 사이에서 팀 평단이 어디인지(현재가가 평단 위/아래인지 · 사이클이 언제 끊겼는지)를 차트에서 바로 본다.
Output: shared 선택 키 1개 · 순수 기하 함수 2개와 단위 테스트 · SVG path 1개 · 범례 1항목 · 테스트 기대값 갱신 · 34 UI-SPEC 반영. 수정 파일은 정확히 8개다.

오케스트레이터 제약(locked — 이 quick 은 CONTEXT.md 가 없어 D 번호 대신 C 번호로 적는다):
- C-1 범위 상한: 수정 파일 8개 이하(테스트 포함), 새 의존성 없음. 다른 차트 요소(가격 선 · 원 · 세로선 · 음영 · 누적 · 10분 막대 · 축)는 바꾸지 않는다.
- C-2 검증: 관련 vitest 만 `--maxWorkers=2`, tsc, eslint, playwright 는 accum-report spec 만 `--workers=1`. 전체 e2e 는 돌리지 않는다.
- C-3 커밋: 메시지는 한글, Co-Authored-By 를 넣지 않는다. `git add` 는 경로를 지정한다(`-A` · `.` 금지).
- C-4 push · 배포는 하지 않는다. executor 는 커밋까지만 한다(push 는 메인 세션 몫).
- C-5 기존 코드 패턴을 따른다: 주석 밀도, 한글 주석, 34 결정 번호 표기(D-14 등). 새 코드 주석에는 `quick-261021-amg` 를 붙인다.

플래너 재량 결정(근거 포함):
- **payloadOf 는 코드도 파일도 건드리지 않는다.** payloadOf 는 지금도 6키만 검사하고 나머지 키는 통과시킨다. 그래서 avg_px 가 결측이거나 모양이 어긋나도 행이 버려지지 않는다(「행 전체를 버리지 않음 — 기존 6키 검증은 그대로」가 이미 성립한다).
  선 단위 모양 검사는 `avgPxPointsOf` 가 맡는다. pnl 을 `pnlOf` 가 따로 방어하는 기존 방식(`webapp/src/lib/accum-report.ts:358-361` 주석)과 같다.
  이렇게 하면 accum-report.ts 와 그 테스트가 파일 수에서 빠져 C-1 의 8개 상한을 지킨다. 「payloadOf 가 행을 남긴다」는 단언은 accum-chart.test.ts 에 둔다.
- **shared 는 새 인터페이스 이름을 내보내지 않는다.** `avg_px` 모양을 AccumReportPayload 안에 인라인으로 적는다. 이름을 내보내면 `packages/shared/src/index.ts` 가 9번째 파일이 되기 때문이다. webapp 은 `Pick<AccumReportPayload, 'avg_px'>` 로 받는다.
- **열린 마지막 조각의 끝 = max(마지막 체결 칸 시각, 마지막 점 시각)**: 가격 선은 마지막 체결 칸(`lastTradeMsOf`)에서 끝나고 연장하지 않는다. 평단도 가격 판 요소라 그 끝에 맞춘다. 창 끝이나 20:00 까지 연장하지 않는다(누적 계단의 T2000 연장은 누적 판 규칙이다).
- **e2e**: e2e 픽스처(`webapp/e2e/fixtures/accum-report.ts`)에는 avg_px 가 없다. spec 을 고치면 9번째 파일이 되므로 spec 은 회귀 실행만 한다. 「avg_px 없음 → 선 없음」은 jsdom 렌더 테스트가 실측 export 픽스처(10/14 · avg_px 없음)로 잠근다.
- 인박스 노트 `261020-accum-flow-export.md` 는 이미 `status: done` 이라 이 quick 에서 손대지 않는다(C-1 파일 수).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/inbox/from-gh-trade/261020-accum-flow-export.md

## 실행 규칙 (모든 태스크 공통)

- 같은 트리(`/Users/alex/repos/gh-radar`, master)에서 순차로 실행한다. worktree 격리는 하지 않는다.
  다른 세션이 같은 트리를 쓸 수 있으므로 커밋 직전마다 `git status -sb` 를 확인하고, 아래 8개 경로만 지정해서 add 한다.
  내가 고칠 파일에 남의 미커밋 hunk 가 이미 있으면 커밋하지 말고 멈춰서 보고한다.
- 이 quick 디렉터리의 산출물(PLAN · SUMMARY)은 executor 가 add 하지 않는다. 오케스트레이터의 docs 커밋이 맡는다.
- 커밋 메시지는 한글로 쓰고 접두는 `test(quick-261021-amg):` · `feat(quick-261021-amg):` 이다.
  **Co-Authored-By 줄을 절대 넣지 않는다.** 사용자 CLAUDE.md 가 시스템 기본 서명보다 우선하며, 본문에도 그 문구를 쓰지 않는다. push 하지 않는다(C-3 · C-4).
- 테스트는 동시 세션 메모리 보호를 위해 `--maxWorkers=2` 를 붙이고 지정 파일만 돌린다. playwright 는 Task 2 에서 accum-report spec 하나만 `--workers=1` 로 돌린다(C-2).
- shared 는 webapp 이 `dist` 로 읽는다(`packages/shared/package.json` types = dist). shared 를 고친 뒤에는 `pnpm --filter @gh-radar/shared build` 를 먼저 돌린다.
- 수정 허용 파일은 frontmatter `files_modified` 의 8개뿐이다. 다음 파일은 손대지 않는다: `webapp/src/lib/accum-report.ts`(payloadOf), `packages/shared/src/index.ts`, `webapp/src/test-fixtures/*`, `webapp/e2e/**`, 인박스 노트.

## 계약 요약 (인박스 :113 — 다시 탐색하지 말 것)

`avg_px` = `{t_ms[], px[]}` 이다(2026-10-21 추가 키이며, 그 전 export 행에는 없다).
- px 는 buy_krw ÷ buy_qty 를 반올림한 원이다. **0 = 등록 포지션 없음이고, 선을 끊는다.**
- 값이 바뀐 분의 다음 분 경계마다 점이 생긴다. 사이클이 끝나면 종료 시각에 0 점이 찍힌다. 등록 전에는 점이 없다.
- 이월 종목은 06:01 row 2 가 첫 점일 수 있다.
- `t_ms` 는 비감소다. 같은 ms 에 두 점(종료 값 → 0)이 있을 수 있고, 배열 순서가 정본이다. 점이 없으면 `[]`/`[]` 이다.
- 불변식: 마지막 사이클이 열려 있으면 마지막 점 = `pos_avg_px` 이다.

## 인터페이스 (플래너가 읽음 — 이 줄 번호로 바로 가라)

`webapp/src/lib/accum-chart.ts`
- 12-23 import: `AccumReportPayload` 는 이미 import 되어 있다. `isNum` 도 import 되어 있다(시그니처 `(v: number | null | undefined) => v is number` 라서 unknown 요소는 `as number` 로 캐스트한다. payloadOf 와 같은 방식).
- 29 `ACCUM_CHART` = { R 56, TOP 16, H1 200, … }
- 83 `export type PricePoint = [t: number, px: number]`
- 124-129 `PriceRange { min, max, lo, hi }`
- 135-155 `priceRangeOf(points, orders, view)`: **무변경.** 평단을 축 맞춤에 넣지 않는다.
- 167-171 `yOfPrice(range)` → `TOP + ((range.hi − p) / span) × H1`
- 173 `const f1 = (n) => n.toFixed(1)`
- 179-196 `pricePathOf`: 끊기 `M` · 좌표 소수 1자리 문법. 196 줄 뒤, 198 줄 「데이터 레이어」 구분 주석 앞이 새 함수 자리다.
- 586-590 `lastTradeMsOf(price): number | null`

`webapp/src/components/analytics/accum-chart.tsx`
- 9-36 import 목록(알파벳 순). 49-58 머리 주석의 레이어 목록 ①~⑧ 이 있다.
- 92 `bounds = dayBoundsOf(...)` · 95 `pRange` · 98 `priceD` 가 계산되는 자리다.
- 230-260 `<g data-slot="accum-price-layer" clipPath=…-px>`: 232-239 가격 path → 242-259 원 map 순서다.

`webapp/src/components/analytics/accum-detail.tsx`
- 40 머리 주석에 「범례(8 · 견본 span aria-hidden)」 가 있다.
- 109-113 스켈레톤이 `LEGEND.map` 으로 범례 칸을 만든다(파생 확인함).
- 304-316 견본 상수 `HLINE` 과 `LEGEND` 배열.

테스트
- `webapp/src/lib/__tests__/accum-chart.test.ts`: import 3-50, `accumKstMs(ymd, 'HH:MM:SS')` · `accumDetailRows()` · `CHEONIL` 을 쓸 수 있다. 마지막 describe 는 529-562 다.
- `webapp/src/components/analytics/__tests__/accum-detail.test.tsx`: `expand(isin)` · `detailOver.set(isin, row)` · `accumDetailFixture(CHEONIL).row!` 패턴은 286-297(h2b), 가격 레이어 단언 패턴은 94-128(c1), 범례 단언은 238-243(h1)에 있다. 「AccumChart — 데이터 레이어」 describe 는 131-169 다.
- `webapp/src/components/analytics/__tests__/accum-report.test.tsx:432-433`: 「KPI 줄 1 · 범례 8칸 · 프리셋 3칸 · 차트 1」 과 `toHaveLength(13)` 이 있다.

`packages/shared/src/accum-report.ts`
- 4 머리 주석 「payload 6키」 · 140-148 `AccumReportPayload`(주석 「상세 payload 6키(이 순서)」).

`.planning/phases/34-accum/34-UI-SPEC.md`
- 180 색 표 `.px path` 행 · 286 A5 범례 행 · 413 스켈레톤 범례 칸 수 · 422 범례 견본 목록 · 438 레이어 5 · 444 축 규칙 가격 y · 555 · 558 커버리지 표 범례 개수.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: avg_px → 계단 경로 → 가격 판 SVG 한 줄 관통(shared 선택 키 · 순수 기하 2함수 · 렌더 · 테스트)</name>
  <files>packages/shared/src/accum-report.ts, webapp/src/lib/accum-chart.ts, webapp/src/lib/__tests__/accum-chart.test.ts, webapp/src/components/analytics/accum-chart.tsx, webapp/src/components/analytics/__tests__/accum-detail.test.tsx</files>
  <behavior>
    아래에서 x = (t − T0) ÷ 60000(분 = px), T0 = accumKstMs(ACCUM_DATE, '09:00:00'), range = { min 100, max 120, lo 100, hi 120 } 이다. 이때 y(110) = 116.0, y(120) = 16.0, y(100) = 216.0 이다. 시각은 T0 기준 분으로 적는다.
    - avgPxPointsOf 는 다음 입력에서 모두 [] 를 낸다: avg_px 가 없음(`{}`), null, 숫자 5, 배열, `{t_ms:'x', px:[]}`, `{t_ms:[1], px:'y'}`.
    - avgPxPointsOf 정상 입력: `{t_ms:[a,b,b,c], px:[110,120,0,NaN]}` → [[a,110],[b,120],[b,0]] 이다. NaN · null 요소는 건너뛰고, 같은 ms 순서는 유지하며, 정렬하지 않는다. 길이가 다르면 짧은 쪽까지만 본다.
    - 실측 천일고속 행(`accumDetailRows()` 의 CHEONIL · avg_px 없음)과 그 payload 에 `avg_px: 'bad'` 를 붙인 행 모두에서 payloadOf(`@/lib/accum-report`)는 null 이 아니고, avgPxPointsOf 는 [] 다. 행은 남고 선만 빠진다는 단언이다.
    - avgPxPathOf 계단 + 끊기: [[+60,110],[+120,120],[+180,0]], endMs = +300 → 'M60.0,116.0H120.0V16.0H180.0'
    - 0 뒤 재시작 + 열린 끝 연장: [[+60,110],[+120,0],[+180,100]], endMs = +300 → 'M60.0,116.0H120.0M180.0,216.0H300.0'
    - 같은 ms 두 점(종료 값 → 0): [[+60,110],[+120,120],[+120,0]] → 'M60.0,116.0H120.0V16.0H120.0'
    - 09:00 미만 점: [[−180,105],[−179,110],[+60,120]], endMs = +120 → 'M0.0,116.0H60.0V16.0H120.0'. 앞 점은 건너뛰고 마지막 09:00 전 점만 T0 에 붙는다. [[−180,110],[−180,0]] → '' 이다.
    - 가격축 클램프: [[+60,50],[+120,500]], endMs = +180 → 'M60.0,216.0H120.0V16.0H180.0'
    - 끝 규칙: [[+60,110]], endMs = +30 → 'M60.0,116.0H60.0' 이다(마지막 점보다 앞으로 가지 않는다). [] → '' · [[+60,0]] → '' 이다. 음수 px 는 0 과 같이 끊는다: [[+60,110],[+120,−1]] → 'M60.0,116.0H120.0'.
    - 렌더(c8): CHEONIL 상세 payload 에 avg_px = { t_ms: [t0+1h, t0+2h, t0+3h], px: [200000, 201000, 0] }(t0 = 그 행 price.t0_ms)를 붙여 펼친다.
      그러면 `[data-slot="accum-team-avg-path"]` 가 하나 있고 `accum-price-layer` 안에 있다. d 는 /^M[\d.]+,[\d.]+H[\d.]+V[\d.]+H[\d.]+$/ 이고 NaN 이 없다.
      속성은 stroke="var(--up)" · stroke-dasharray="1 2" · pointer-events="none" · fill="none" 이고, title 자식은 0개다.
      문서 순서는 가격 path → 평단 path → 첫 circle 이다.
    - 렌더(c9): 실측 CHEONIL(avg_px 없음)을 펼치면 평단 path 가 없고, 가격 path 와 원 수(45)는 그대로다.
    - 렌더(c10): avg_px 가 `{ t_ms: 'x', px: null }` 이면 평단 path 가 없고 차트 svg · 가격 path 가 있으며, 「그날 체결 자료 없음」 은 없다.
  </behavior>
  <action>
    순서는 RED(테스트) → GREEN(구현)이다. C-1 · C-5 를 따른다.

    1. shared(`packages/shared/src/accum-report.ts`):
       - AccumReportPayload 의 cycles 뒤에 **선택 키** `avg_px?:` 를 넣는다. 모양은 인라인 `{ t_ms: number[]; px: number[] }` 이고, 이름 있는 인터페이스는 만들지 않는다(index.ts 무변경).
       - JSDoc 은 한 블록이다. 내용: 2026-10-21 gh-trade quick-261021-3rf 추가, 그 전 export 행에는 없음. 열 지향 같은 길이, t_ms 비감소. 같은 ms 두 점(종료 값 → 0)이 가능하며 배열 순서가 정본. px = buy_krw ÷ buy_qty 반올림 원. **0 = 등록 포지션 없음(선을 끊는다).** 이월 종목은 06:01 row 2 가 첫 점일 수 있음. 점이 없으면 []/[].
       - 머리 주석 4 줄의 「payload 6키」 와 140 줄 인터페이스 주석의 「6키(이 순서)」 를 「7키(이 순서 · avg_px 는 선택 키)」 로 고친다.
       - 그 뒤 `pnpm --filter @gh-radar/shared build` 를 돌린다.

    2. RED — `webapp/src/lib/__tests__/accum-chart.test.ts`:
       - 끝에 describe 「accum-chart — 팀 평단 계단 (quick-261021-amg · WinForms AccumChartPanel 동형)」 을 더하고 behavior 의 points · path 항목을 그대로 단언한다.
       - import 에 avgPxPathOf · avgPxPointsOf(`@/lib/accum-chart`), payloadOf(`@/lib/accum-report`), AccumDetailRow 타입을 더한다. 기존 it 는 건드리지 않는다.

    3. RED — `webapp/src/components/analytics/__tests__/accum-detail.test.tsx`:
       - 「AccumChart — 데이터 레이어」 describe 끝에 it (c8) · (c9) · (c10) 을 behavior 대로 더한다.
       - 행 덮어쓰기는 h2b 의 `detailOver.set(CHEONIL, { ...base, payload: { ...base.payload!, avg_px: … } as unknown as AccumDetailRow['payload'] })` 패턴을 쓴다.
       - 실패를 확인한 뒤 두 테스트 파일만 경로를 지정해 add 하고 `test(quick-261021-amg): 팀 평단 계단 경로 · avg_px 모양 방어 · 가격 판 렌더 단언` 으로 커밋한다.

    4. GREEN — `webapp/src/lib/accum-chart.ts` 는 **추가만 한다.** 기존 줄은 한 줄도 지우거나 바꾸지 않는다. 다른 차트 요소는 바꾸지 않는다(C-1). 196 줄(pricePathOf 끝)과 198 줄 구분 주석 사이에 두 함수를 넣는다.
       - `export function avgPxPointsOf(payload: Pick<AccumReportPayload, 'avg_px'>): PricePoint[]`
         - payload.avg_px 를 unknown 으로 받는다. 배열이 아닌 객체가 아니거나 t_ms · px 가 배열이 아니면 [] 를 낸다.
         - n = 두 길이의 최소다. 요소를 `isNum(v as number)` 로 걸러 [t, px] 를 **배열 순서 그대로** 담는다. 정렬하지 않는다.
         - JSDoc 에 적을 것: payloadOf 는 6키만 보고 이 키는 보지 않는다(pnl 의 pnlOf 와 같은 방식). 그래서 결측 · 모양 불량이면 이 함수가 [] 를 내서 **선만 생략**되고 행 · 차트는 그대로다.
       - `export function avgPxPathOf(points: readonly PricePoint[], x: (t: number) => number, range: PriceRange, T0: number, endMs: number): string`
         - y = yOfPrice(range) 에 넣기 전에 px 를 `Math.min(range.hi, Math.max(range.lo, p))` 로 클램프한다. 이것이 가격축 안 클램프(WinForms 동형)이고, 축 맞춤(priceRangeOf · D-14)은 평단을 넣지 않는다.
         - 시각 tx = max(t, T0) 다(09:00 미만은 09:00). 점 k 의 t 가 T0 미만이고 점 k+1 도 T0 미만이면 점 k 를 건너뛴다.
         - px 가 0 이하이면: 열린 조각이 있을 때만 `H{x}` 를 붙이고 닫는다.
         - px 가 양수이면: 열려 있으면 `H{x}V{y}` 를, 닫혀 있으면 `M{x},{y}` 를 붙이고 연다.
         - 끝까지 돈 뒤 열린 조각이 있으면 `H{x(max(endMs, 마지막으로 처리한 점의 tx))}` 를 붙인다.
         - 좌표는 f1(소수 1자리)이고, 점이 없으면 '' 다.
         - 창 ±30분 자르기는 하지 않는다(점이 분 단위 수백 개라서 그렇다. 계단은 창 시작 값이 앞 점에 달려 있고, 클립이 자른다 — cumPathOf 와 같은 이유).
         - JSDoc 은 한글로 쓰고 규칙을 항목별로 적는다. 끝 규칙의 근거도 적는다: 가격 선이 마지막 체결 칸에서 끝나므로 같은 끝을 쓴다.

    5. GREEN — `webapp/src/components/analytics/accum-chart.tsx`:
       - import 목록에 avgPxPathOf · avgPxPointsOf(ACCUM_CHART 다음)와 lastTradeMsOf(labelRowsOf 다음)를 끼워 넣는다(삽입만).
       - priceD 아래에서 `const avgD = avgPxPathOf(avgPxPointsOf(payload), x, pRange, bounds.T0, lastTradeMsOf(payload.price) ?? bounds.T2000);` 를 계산한다.
       - `accum-price-layer` g 안에서 가격 path 바로 뒤 · 원 map 앞에 path 를 그린다. 조건은 avgD 가 '' 가 아닐 때다.
       - path 속성: data-slot="accum-team-avg-path" · d={avgD} · fill="none" · stroke="var(--up)" · strokeWidth={1.25} · strokeDasharray="1 2" · pointerEvents="none". `<title>` 은 넣지 않는다.
       - 머리 주석 레이어 목록의 ⑤ 뒤에 「⑤' 팀 평단 계단(--up 1.25 `1 2` 점점선 · 0 에서 끊김 · 가격 판 안 클램프 · pointer-events none · title 없음 — quick-261021-amg)」 을 더한다. 230 줄 JSX 주석에도 평단을 더한다. 주석 밖의 기존 줄은 지우지 않는다.
       - aria-label 은 바꾸지 않는다.
       - vitest 가 통과하면 shared · accum-chart.ts · accum-chart.tsx 세 경로만 add 하고 `feat(quick-261021-amg): 매집감지 상세 가격 판 팀 평단 계단 — payload.avg_px · --up 점점선 · 0 끊김 · 가격축 안 클램프` 로 커밋한다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp typecheck && grep -q 'avg_px?:' packages/shared/src/accum-report.ts && grep -q 'export function avgPxPathOf' webapp/src/lib/accum-chart.ts && grep -q 'data-slot="accum-team-avg-path"' webapp/src/components/analytics/accum-chart.tsx && D1=$(git diff 61e15f3c -- webapp/src/lib/accum-chart.ts) && test -n "$D1" && test "$(printf '%s\n' "$D1" | grep -v '^---' | grep -c '^-')" = 0 && D2=$(git diff 61e15f3c -- webapp/src/components/analytics/accum-chart.tsx) && test -n "$D2" && test "$(printf '%s\n' "$D2" | grep -v '^---' | grep '^-' | grep -cvE '^-[[:space:]]*(\*|//|\{/\*)')" = 0 && N=$(git diff --name-only 61e15f3c -- webapp/src/lib/accum-report.ts packages/shared/src/index.ts webapp/src/test-fixtures webapp/e2e) && test -z "$N"</automated>
  </verify>
  <done>
    - avg_px 가 있는 상세에서 가격 판에 --up 점점선 계단이 가격 선과 원 사이 층에 그려진다. avg_px 가 없거나 모양이 어긋난 상세는 평단 선만 없고 나머지는 같다.
    - accum-chart.ts 는 추가만 했다(삭제 줄 0). accum-chart.tsx 의 삭제 줄은 주석뿐이다. payloadOf · index.ts · 픽스처 · e2e 는 무변경이다.
    - RED(test) → GREEN(feat) 커밋 2건이다.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 범례 「팀 평단」 + 스켈레톤 기대값 + 34 UI-SPEC 반영 + accum-report e2e 회귀</name>
  <files>webapp/src/components/analytics/accum-detail.tsx, webapp/src/components/analytics/__tests__/accum-detail.test.tsx, webapp/src/components/analytics/__tests__/accum-report.test.tsx, .planning/phases/34-accum/34-UI-SPEC.md</files>
  <behavior>
    - (h1) 범례 children 텍스트 = ['가격(10초)', '팀 평단', '팀 매수', '팀 매도', '팀매수 시작', '순매수 누적', '등록', '청산·종료', '등록 전'] 이다. 모든 항목에 aria-hidden 견본 span 이 있고, 상세 안 `<i>` 는 0 개다.
    - 로딩 스켈레톤 `[data-slot="skeleton"]` 은 14 개다(KPI 1 · 범례 9 · 프리셋 3 · 차트 1).
  </behavior>
  <action>
    순서는 RED → GREEN 이다.

    1. RED — 테스트 기대값을 먼저 고친다.
       - `accum-detail.test.tsx` h1(238-243): 제목의 범례 개수를 9 로 바꾸고, 기대 배열의 '가격(10초)' 바로 뒤에 '팀 평단' 을 넣는다.
       - `accum-report.test.tsx:432-433`: 주석의 범례 칸 수를 9 로, 기대값 13 을 14 로 바꾼다.
       - 두 테스트가 실패하는지 확인한다(커밋은 GREEN 과 합쳐 하나로 한다 — 기대값 갱신만이라 RED 커밋을 따로 두지 않는다).

    2. GREEN — `webapp/src/components/analytics/accum-detail.tsx`:
       - LEGEND 배열의 「가격(10초)」 항목 바로 뒤에 `{ label: '팀 평단', swatch: … }` 한 줄을 **삽입**한다.
       - 견본 class 는 `'inline-block h-0 w-2.5 border-t-2 border-dotted border-[var(--up)]'` 이다(10×2 빨간 점선 — 가격 판 평단 선과 같은 색).
       - 스켈레톤은 LEGEND.map 에서 나오므로 따로 고치지 않는다.
       - 머리 주석 40 줄의 범례 개수를 9 로 고친다. 그 밖의 줄(CAPTION · 프리셋 · 스켈레톤 · PRESETS)은 바꾸지 않는다.

    3. `.planning/phases/34-accum/34-UI-SPEC.md` 를 Edit 로 해당 줄만 고친다(Write 금지):
       - 286 A5 범례 행: 항목 수를 9 로 바꾸고, 「가격(10초)」 뒤에 「팀 평단」 을 넣는다.
       - 422 범례 견본 목록: 가격 견본 뒤에 「팀 평단 10×2 `--up` 점선(`border-t-2 border-dotted`)」 을 넣는다.
       - 438 레이어 5 끝에 붙일 문구: 「 · 그 위 팀 평단 계단 `--up` 1.25 `1 2` 점점선(payload.avg_px 선택 키 · 0 에서 끊김 · 열린 마지막 조각은 마지막 체결 칸까지 · 09:00 이전 점은 09:00 · 가격 판 안으로 클램프 · `pointer-events: none` · `<title>` 없음 — quick-261021-amg · WinForms AccumChartPanel 동형)」
       - 444 축 규칙 가격 y 줄 끝에 붙일 문구: 「 팀 평단은 넣지 않는다 — 판 안 클램프만(quick-261021-amg).」
       - 180 색 표 `.px path` 행 다음에 행 하나를 더한다: `.avg path` | `--up`(1.25 · `1 2` 점점선) | 팀 평단 계단 · 범례 「팀 평단」.
       - 범례 개수 표기(현재 8 — 413 · 555 · 558)를 9 로 맞춘다.
       - 다른 절은 건드리지 않는다.

    4. vitest · typecheck · eslint 를 통과시킨다.

    5. accum-report e2e 를 `--workers=1` 로 회귀 실행한다. 픽스처에 avg_px 가 없으므로 평단 선이 없는 상태로 기존 단언이 전부 통과해야 한다.
       - webServer 기동이 NextFontGoogleFontFileReplacer 반복으로 타임아웃 나면 `rm -rf webapp/.next` 뒤 한 번 다시 돌린다.
       - 환경 문제(인증 setup · 샌드박스 포트 차단)로 못 돌리면 그 사유를 SUMMARY 에 「e2e 미실행: 사유」로 명시한다. 생략을 성공으로 적지 않는다.

    6. 커밋: 이 태스크의 네 경로만 지정해 add 하고 `feat(quick-261021-amg): 매집감지 상세 범례 「팀 평단」 · 스켈레톤 9칸 · 34 UI-SPEC A5 · A6 반영` 으로 커밋한다.
       push 하지 않는다(C-4).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/lib/__tests__/accum-report.test.ts src/components/analytics/__tests__/accum-detail.test.tsx src/components/analytics/__tests__/accum-report.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp exec eslint src/lib/accum-chart.ts src/components/analytics/accum-chart.tsx src/components/analytics/accum-detail.tsx src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx src/components/analytics/__tests__/accum-report.test.tsx && grep -q "label: '팀 평단'" webapp/src/components/analytics/accum-detail.tsx && grep -q 'accum-team-avg-path\|팀 평단 계단' .planning/phases/34-accum/34-UI-SPEC.md && ! grep -qE '범례\(8항목|8범례|범례 8|범례 8항목' .planning/phases/34-accum/34-UI-SPEC.md && D3=$(git diff 61e15f3c -- webapp/src/components/analytics/accum-detail.tsx) && test -n "$D3" && test "$(printf '%s\n' "$D3" | grep -v '^---' | grep '^-' | grep -cvE '^-[[:space:]]*(\*|//|\{/\*)')" = 0 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/accum-report.spec.ts --workers=1</automated>
  </verify>
  <done>
    - 범례가 9 항목이고 「팀 평단」 이 「가격(10초)」 바로 뒤에 있다. 로딩 스켈레톤은 14 칸이다.
    - 34-UI-SPEC 의 A5 · 범례 견본 · 레이어 5 · 축 규칙 · 색 표에 팀 평단이 반영되었고, 범례 개수 표기가 모두 9 다.
    - 지정 vitest 4 파일 · typecheck · eslint · accum-report e2e(`--workers=1`)가 통과했다. 또는 e2e 미실행 사유가 SUMMARY 에 명시되었다.
    - feat 커밋 1건이다.
  </done>
</task>

</tasks>

<verification>
전체 마무리 게이트(두 태스크 뒤 한 번 돌린다). quick 커밋이 8 경로만 바꿨는지, 서명 줄이 없는지, 작업 트리가 깨끗한지 본다.

L=$(git log 61e15f3c..HEAD --format= --name-only --grep='quick-261021-amg') && F=$(printf '%s\n' "$L" | grep -v '^$' | sort -u) && test -n "$F" && test "$(printf '%s\n' "$F" | wc -l)" -le 8 && ! printf '%s\n' "$F" | grep -vxE 'packages/shared/src/accum-report\.ts|webapp/src/lib/accum-chart\.ts|webapp/src/lib/__tests__/accum-chart\.test\.ts|webapp/src/components/analytics/accum-chart\.tsx|webapp/src/components/analytics/accum-detail\.tsx|webapp/src/components/analytics/__tests__/accum-detail\.test\.tsx|webapp/src/components/analytics/__tests__/accum-report\.test\.tsx|\.planning/phases/34-accum/34-UI-SPEC\.md' && B=$(git log 61e15f3c..HEAD --format=%B --grep='quick-261021-amg') && test -n "$B" && ! printf '%s\n' "$B" | grep -qi 'co-authored-by' && S=$(git status --porcelain -- packages/shared/src/accum-report.ts webapp/src/lib/accum-chart.ts webapp/src/lib/__tests__/accum-chart.test.ts webapp/src/components/analytics/accum-chart.tsx webapp/src/components/analytics/accum-detail.tsx webapp/src/components/analytics/__tests__/accum-detail.test.tsx webapp/src/components/analytics/__tests__/accum-report.test.tsx .planning/phases/34-accum/34-UI-SPEC.md) && test -z "$S"
</verification>

<success_criteria>
- avg_px 가 있는 매집감지 상세 가격 판에 --up 점점선 팀 평단 계단이 가격 선 위 · 원 아래에 보인다. 0 에서 끊기고, 09:00 전 점은 09:00 에 붙고, 판 안으로 클램프되며, 열린 끝은 마지막 체결 칸까지 간다.
- avg_px 결측 · 불량 행은 평단 선만 없고 상세의 나머지가 전과 같다. payloadOf 는 무변경이다.
- 가격 축 · 가격 선 · 원 · 세로선 · 음영 · 누적 · 10분 막대는 무변경이다. accum-chart.ts 는 추가만 했고, tsx 의 삭제 줄은 주석뿐이다.
- 범례 9 항목, 스켈레톤 14 칸, 34-UI-SPEC 반영.
- 수정 파일 8개 이하, 새 의존성 없음, 한글 커밋 3건(test · feat · feat), Co-Authored-By 없음, push 없음.
</success_criteria>

<output>
Create `.planning/quick/261021-amg-accum-chart-team-avg-price-line/261021-amg-SUMMARY.md` when done.
SUMMARY 에 넣을 것: 커밋 해시 3개, e2e 결과(또는 미실행 사유), 「payloadOf 무변경 — 선 단위 방어는 avgPxPointsOf」 결정 한 줄, 실측 픽스처에는 avg_px 가 없어 라이브 자료 확인은 10/21 이후 적재분으로 메인 세션 UAT 가 맡는다는 한 줄.
</output>
