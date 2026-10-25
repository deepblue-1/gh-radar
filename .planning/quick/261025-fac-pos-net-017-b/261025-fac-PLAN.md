---
phase: quick-261025-fac
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/accum-report.ts
  - webapp/src/lib/accum-chart.ts
  - webapp/src/components/analytics/accum-chart.tsx
  - webapp/src/components/analytics/accum-detail.tsx
  - webapp/src/lib/accum-report.ts
  - webapp/src/test-fixtures/accum-export.ts
  - webapp/src/lib/__tests__/accum-chart.test.ts
  - webapp/src/lib/__tests__/accum-report.test.ts
  - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
autonomous: true
requirements: [FAC-DATA, FAC-LINE, FAC-RANGE, FAC-TIP, FAC-LEGEND, FAC-RULE, FAC-COMPAT]

estimate:
  tokens: 65000
  raw_tokens: 65000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "payload.pos_net 점이 1개 이상인 행을 펼치면 누적 판에 굵은 --team 포지션 순매수 계단(이월 포함 · strokeWidth 2.2)이 얇은 --muted-fg 그날 누적 계단(strokeWidth 1 · opacity 0.7) 위에 그려지고, 판 제목은 「포지션 순매수 · 그날 누적」 이다"
    - "포지션 선은 앞 점과 cycle 이 다르거나 앞 점 end ≠ 0 이면 끊겨(M) 새로 시작하고, 각 조각은 자기 마지막 점에서 멈춘다. 마지막 조각만 열린 포지션(마지막 점 end 0 — end 배열이 없으면 0)일 때 20:00 까지 이어진다. 09:00 전 점(이월 06:01)은 왼쪽 끝에 붙고 09:00 전 점이 여럿이면 마지막 점만 쓴다(avgPxPathOf 와 같다)"
    - "두 선은 한 y 축(0 포함 · day_cum_net 과 pos_net 값을 합친 범위)을 쓴다 — 이월 13억 종목도 포지션 선이 누적 판 밖으로 나가지 않고 오른쪽 축 글자에 그 끝값이 보인다"
    - "누적 판에 마우스를 올리면 「HH:MM:SS · 순매수 누적 ±X.XX억 · 포지션 순매수 ±Y.YY억(이월 포함)[ · 팀 평단 N원]」 이 뜨고, 그 시각에 포지션 값이 없으면(첫 점 전 · end≠0 점 뒤 · 사이클 사이 · 닫힌 마지막 조각 뒤) 「포지션 —」 이다. 주문 원 툴팁은 그대로다"
    - "pos_net 점이 있는 행의 범례는 「순매수 누적」 자리에 「포지션 순매수(이월 포함)」(굵은 --team 선) · 「그날 순매수 누적(0부터)」(얇은 --muted-fg 선) 두 항목이 들어가 10항목이 되고, 없는 행은 지금 9항목 그대로다"
    - "pos_net 키가 없거나 모양이 어긋난 옛 행은 오류 없이 오늘 차트 그대로다 — payloadOf 가 행을 남기고, 계단은 --team 1.5 · 제목 「순매수 누적」 · 범례 9항목 · 툴팁 문구 그대로"
    - "판정 기준 본문 2 는 「누적 판의 얇은 회색 계단 = 하루 순매수(day) · 굵은 보라 선 = 포지션 순매수(등록 후 · 이월 포함 · 우리 체결 제외 — 목록 · KPI 와 같은 값)」 을 말한다"
  artifacts:
    - path: "packages/shared/src/accum-report.ts"
      provides: "AccumReportPayload 선택 키 pos_net { t_ms, net_krw, cycle, end? } (avg_px 처럼 inline 타입 · index.ts 무변경)"
      contains: "pos_net?:"
    - path: "webapp/src/lib/accum-chart.ts"
      provides: "PosNetPoint · posNetPointsOf(선 단위 모양 방어) · posNetPathOf(끊김 · 09:00 맞춤 · 열린 끝 20:00) · cumRangeOf 두 번째 인자 · cumTipAt 포지션 문구"
      contains: "export function posNetPathOf"
    - path: "webapp/src/components/analytics/accum-chart.tsx"
      provides: "data-slot accum-pos-net-path(그날 계단 뒤 = 위) · 그날 계단 회색 보조 · 판 제목 분기"
      contains: "accum-pos-net-path"
    - path: "webapp/src/components/analytics/accum-detail.tsx"
      provides: "pos_net 점 유무로 범례 분기(LEGEND_POS) · 스켈레톤은 LEGEND 그대로"
      contains: "포지션 순매수(이월 포함)"
    - path: "webapp/src/lib/accum-report.ts"
      provides: "ACCUM_RULE_LINES[1] 문구 개정"
      contains: "굵은 보라 선은 포지션 순매수"
    - path: "webapp/src/test-fixtures/accum-export.ts"
      provides: "합성 kind 'posNet'(end 배열 · end≠0 끊김 · 사이클 끊김 · 열린 끝) · 'posNetCarry'(end 배열 없음 · 06:01/08:40 이월 점 · 13억 · 사이클 끊김)"
      contains: "posNetCarry"
  key_links:
    - from: "webapp/src/components/analytics/accum-chart.tsx"
      to: "webapp/src/lib/accum-chart.ts"
      via: "posNetPointsOf(payload) → cumRangeOf(day_cum_net, posPts) · posNetPathOf(posPts, x, yC, T0, T2000)"
      pattern: "posNetPathOf\\("
    - from: "webapp/src/components/analytics/accum-detail.tsx"
      to: "webapp/src/lib/accum-chart.ts"
      via: "posNetPointsOf(payload).length > 0 → LEGEND_POS"
      pattern: "posNetPointsOf\\("
    - from: "webapp/src/lib/accum-chart.ts cumTipAt"
      to: "webapp/src/lib/accum-chart.ts posNetPointsOf"
      via: "점이 0개면 기존 문구 그대로 · 있으면 스냅샷 시각 tk 의 포지션 값"
      pattern: "포지션 —"
---

<objective>
매집감지 보고서 상세 차트 누적 판에 포지션 순매수(payload.pos_net · 이월 포함 · 우리 체결 제외 — 목록 · KPI 의 「등록 후 순매수」 와 같은 뜻)를 주인공 선으로 그리고, 지금 계단(day_cum_net · 그날 0부터)은 회색 보조로 내린다. 스케치 017 B 채택안(`.planning/sketches/017-accum-pos-net-line/README.md` 「Decision (2026-10-25)」)이 잠긴 스펙이다 — 다시 묻지 않는다.

Purpose: 이월 종목에서 지금 차트는 그날 0부터 계단만 보여 포지션 규모(목록 KPI 값)가 차트에서 안 보인다. WinForms 상세 차트와 같은 뜻의 선을 주인공으로 둔다.
Output: shared 선택 키 타입, 순수 기하(points · path · range · tooltip), 차트 레이어 · 제목, 범례 분기, 판정 기준 문구, 합성 픽스처 2종, 테스트.

데이터 계약(gh-trade 인박스 `docs/inbox/from-gh-trade/261024-accum-hidden-carry10.md` 「추가 2026-10-25 — payload.pos_net」): `pos_net = { t_ms[], net_krw[], cycle[] }` 정수 평행 배열(빌 수 있음). 앞으로 `end[]`(점마다 end_reason · row 1/2/3 = 0 · row 4 = 0 아님)가 붙을 수 있다 — 있으면 쓰고 없으면 cycle 로만 끊는다. 옛 행은 키 자체가 없다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/sketches/017-accum-pos-net-line/README.md
@docs/inbox/from-gh-trade/261024-accum-hidden-carry10.md
@packages/shared/src/accum-report.ts
@webapp/src/lib/accum-chart.ts
@webapp/src/components/analytics/accum-chart.tsx
@webapp/src/components/analytics/accum-detail.tsx
@webapp/src/test-fixtures/accum-export.ts

<interfaces>
지금 코드(그대로 읽고 따를 것):
- `packages/shared/src/accum-report.ts` `AccumReportPayload` — 7키 + 선택 키 `avg_px?: { t_ms: number[]; px: number[] }`(inline 타입 · 별도 interface/ index.ts export 없음). `pos_net` 도 같은 방식으로 붙인다. webapp 은 shared 를 `dist` 로 읽으므로 shared 수정 뒤 `pnpm --filter @gh-radar/shared build` 를 먼저 돌린다.
- `webapp/src/lib/accum-report.ts` `payloadOf(row)` — 6키만 검사하고 선택 키(avg_px · pos_net)는 보지 않는다. **무변경**이 정답이다(이미 키 없음에 관대). 모양 방어는 선 단위 함수가 한다(`avgPxPointsOf` 가 선례).
- `webapp/src/lib/accum-chart.ts`:
  - `f1 = (n) => n.toFixed(1)`(모듈 내부) · `isNum` · `fmtEok(won, { signed, digits })`(0 → 「0.00억」 · 음수 MINUS U+2212) · `kstClock(ms)` · `INT_FMT`.
  - `avgPxPointsOf(payload)` / `avgPxPathOf(points, x, range, T0, endMs)` — 09:00(T0) 전 점은 x(T0) 에 붙이고, 다음 점도 T0 전이면 그 점은 건너뛴다(T0 전 여럿이면 마지막만). 열린 끝 = `max(endMs, lastTx)`.
  - `cumRangeOf(cum: AccumReportCumNet): CumRange` — 0 포함 min/max. `yOfCum(range)` · `cumTicksOf(range, y)` · `cumPathOf(cum, x, yC, T2000)` — 첫 점 `M x0,y(0) L x0,y0` · 이후 `H x V y` · 끝 `H x(T2000)`.
  - `stepIndexAt(ts, vs, t)`(t 이하 마지막 유효 점 번호 · 없으면 −1) · `avgPxAt(payload, t)`.
  - `cumTipAt(payload: Pick<AccumReportPayload, 'day_cum_net' | 'avg_px'>, t)` → `{ key: \`c${k}\`, lines: ['HH:MM:SS · 순매수 누적 ±X.XX억[ · 팀 평단 N원]'], circle: null }` · 첫 점 앞 null.
  - `dayBoundsOf(t0ms)` → `{ T0(=09:00), T1530, T1600, T2000(=T0+11h) }`. 보기 창은 `clampView` 로 늘 [T0, T2000] 안.
- `webapp/src/components/analytics/accum-chart.tsx`: `cRange = cumRangeOf(payload.day_cum_net)` (~125) · `cumD` (~128) · `<path data-slot="accum-cum-path" stroke="var(--team)" strokeWidth={1.5}>`(~254, 공용 clipPath `clipId` 그룹 안) · 누적 축 `<g data-slot="accum-cum-axis" fill="var(--team)">`(~368 · 색 그대로 둔다) · 판 제목 `<text x={L} y={C_TOP - 8} fill="var(--team)" fontWeight={600}>순매수 누적</text>`(~380) · 툴팁 `cumTipAt(payload, t)`(~163) · `noCum`(day_cum_net 빔 → 「팀 체결 없음」 글자 · 그대로 둔다). 평단 path 는 `pointerEvents="none"` 선례.
- `webapp/src/components/analytics/accum-detail.tsx`: `LEGEND`(~307, 9항목 · `HLINE = 'inline-block h-0.5 w-2.5 rounded-full'`) · 로딩 스켈레톤(~109)이 `LEGEND.map` 으로 줄 높이를 잡는다(payload 를 모르니 그대로 LEGEND) · `ChartBody({ row, payload })`(~331)가 범례를 그린다 · `LEGEND_ROW` 줄바꿈 클래스 그대로.
- 테스트 하네스: `accum-detail.test.tsx` 는 `detailOver.set(ISIN, accumSyntheticDetail(kind))` → `expand(ISIN)` → `chartOf(sec)` / `textsOf(svg)`. jsdom 폭 640 · `getBoundingClientRect` 폭 0 이라 `fireEvent.pointerMove(svg, { clientX, clientY, pointerType: 'mouse' })` 의 clientX 가 곧 SVG x 다. 누적 판 y = 240~352.
- 단위 테스트 `accum-chart.test.ts`: `T0 = accumKstMs(ACCUM_DATE, '09:00:00')` · `at(hms)` · `M = 60e3` · `cmds(d)` · 평단 테스트의 `xm = (t) => (t - T0) / M`(분 = px) 문법.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — pos_net 한 줄을 shared 타입 → 기하 → 차트 레이어까지 (포지션 계단 · 회색 그날 계단 · 합친 축 · 판 제목)</name>
  <files>packages/shared/src/accum-report.ts, webapp/src/lib/accum-chart.ts, webapp/src/components/analytics/accum-chart.tsx, webapp/src/test-fixtures/accum-export.ts, webapp/src/components/analytics/__tests__/accum-detail.test.tsx</files>
  <read_first>
    - .planning/sketches/017-accum-pos-net-line/README.md 「Decision (2026-10-25)」 · index.html 변형 B(dayStyle/posStyle 값)
    - webapp/src/lib/accum-chart.ts 230~300(avgPxPointsOf · avgPxPathOf) · 374~437(cumRangeOf · cumPathOf)
    - webapp/src/components/analytics/accum-chart.tsx 108~175 · 236~300 · 360~385
    - webapp/src/test-fixtures/accum-export.ts 225~358(accumSyntheticDetail)
  </read_first>
  <behavior>
    - (f1) `posNet` 픽스처(한선엔지니어링)를 펼치면 SVG 에 `[data-slot="accum-pos-net-path"]` 1개 — stroke `var(--team)` · stroke-width `2.2` · fill none · d 안 `M` 이 정확히 3개(end≠0 끊김 1 · 사이클 끊김 1 + 시작) · d 의 마지막 `H` 값이 `accum-cum-path` d 의 마지막 `H` 값(= x(T2000))과 같다.
    - (f1) 같은 행에서 `accum-cum-path` 는 stroke `var(--muted-fg)` · stroke-width `1` · stroke-opacity `0.7` 이고, 문서 순서상 포지션 path 가 그날 path 뒤(= 위)에 온다. 판 글자에 「포지션 순매수 · 그날 누적」 이 있고 「순매수 누적」 단독 글자는 없다.
    - (f2) 실측 천일고속(CHEONIL · pos_net 없음)은 `accum-pos-net-path` 가 없고 `accum-cum-path` 는 stroke `var(--team)` · stroke-width `1.5` · stroke-opacity 속성 없음 · 판 제목 「순매수 누적」 그대로.
  </behavior>
  <action>
RED 먼저: accum-detail.test.tsx 에 describe 「quick-261025-fac 포지션 순매수 선(스케치 017 B)」 를 만들고 behavior (f1) · (f2) 를 쓴다 → 실패 확인 → 커밋 「test(quick-261025-fac): 누적 판 포지션 순매수 선 실패 테스트」.

GREEN:
1. shared `AccumReportPayload` 에 avg_px 뒤 선택 키 `pos_net?: { t_ms: number[]; net_krw: number[]; cycle: number[]; end?: number[] }` 를 inline 으로 단다(별도 interface · index.ts export 추가 안 함). JSDoc: 2026-10-25 gh-trade 추가 선택 키라 옛 행엔 없음 · 정수 평행 배열 · 점 = row 1/2/3/4(row 5 없음) · 이월 날은 06:01 row 2 가 첫 점 · cycle 이 바뀐 곳에서 끊음 · `end`(점마다 end_reason · 0 = 열림)는 후속 선택 배열 · day_cum_net 과 다른 선. 인터페이스 머리 주석 「상세 payload 7키(… avg_px 는 선택 키)」 를 「avg_px · pos_net 은 선택 키」 로 고친다. 그 뒤 shared build.
2. accum-chart.ts 평단 함수들 뒤에 추가:
   - `export interface PosNetPoint { t: number; net: number; cycle: number; end: number }`.
   - `export function posNetPointsOf(payload: Pick<AccumReportPayload, 'pos_net'>): PosNetPoint[]` — avgPxPointsOf 와 같은 선 단위 방어: 키 없음 · 객체 아님 · 배열 자체 → []; t_ms · net_krw · cycle 중 하나라도 배열 아니면 []; n = 세 길이 최소; t · net · cycle 중 하나라도 유한 수 아니면 그 점 건너뜀; `end` 가 배열이 아니면(없음 포함) 모든 점 end 0, 배열이면 그 자리 값이 유한 수일 때만 그 값 · 아니면(짧음 포함) 0. 배열 순서 그대로(정렬 안 함). payloadOf 는 손대지 않는다(주석에 그 이유를 avg_px 처럼 적는다).
   - `export function posNetPathOf(points: readonly PosNetPoint[], x, yC, T0: number, T2000: number): string` — cumPathOf 와 같은 H-다음-V 계단이되: 각 점 k 의 끊김 여부 brk = (앞 유효 점 없음) 또는 (cycle 이 앞 점과 다름) 또는 (앞 점 end ≠ 0) — **앞 점은 건너뛴 점을 포함한 원래 순서의 앞 점**으로 판정한다. 09:00 전 점은 avgPxPathOf 와 똑같이: 다음 점도 T0 전이면 건너뛰고, 그리는 점의 시각은 max(t, T0). 그릴 때 brk 이거나 아직 열린 조각이 없으면 `M x,y`, 아니면 `H x V y`(좌표는 f1). 조각은 자기 마지막 점에서 끝난다(0선 시작 `L` 없음 · 각 조각 끝 연장 없음). 다 돈 뒤 마지막 점의 end 가 0 이면 `H x(max(T2000, lastTx))` 로 20:00 까지 잇는다. 점이 없으면 ''. 창 ±30분 자르기 없음(클립이 자른다 — cumPathOf 와 같은 이유). JSDoc 에 규칙 · 스케치 017 B · 숨김 구간 한계(end 배열 없는 동안 같은 사이클 청산→재등장은 이어져 보임)를 적는다.
   - `cumRangeOf(cum, pos: readonly PosNetPoint[] = [])` — 기존 루프 뒤 pos 의 net 도 min/max 에 넣는다(0 포함 그대로). 인자 하나 호출은 결과 불변. 09:00 전 건너뛴 점 값도 포함한다(차이가 작아 단순함 우선 — 주석 한 줄).
3. accum-chart.tsx: `posPts = posNetPointsOf(payload)` · `hasPos = posPts.length > 0` · `cRange = cumRangeOf(payload.day_cum_net, posPts)` · `posD = hasPos ? posNetPathOf(posPts, x, yC, bounds.T0, bounds.T2000) : ''`. `accum-cum-path` 는 hasPos 면 stroke `var(--muted-fg)` · strokeWidth 1 · strokeOpacity 0.7, 아니면 지금 그대로(`var(--team)` · 1.5 · strokeOpacity 속성을 내지 않음 — undefined). 그 바로 뒤(같은 clip 그룹 · 10분 막대 앞)에 `posD !== ''` 일 때 `<path data-slot="accum-pos-net-path" d={posD} fill="none" stroke="var(--team)" strokeWidth={2.2} strokeLinejoin="round" pointerEvents="none" />`. 판 제목 글자를 hasPos ? 「포지션 순매수 · 그날 누적」 : 「순매수 누적」 으로 분기(색 · 위치 그대로). 누적 축 글자 색 · noCum 글자는 그대로(이월 종목 그날 팀 체결 0 이어도 「팀 체결 없음」 은 사실이라 둔다 — 판단 기록). 컴포넌트 머리 주석 레이어 목록에 포지션 선 한 줄 추가.
4. accum-export.ts: `AccumSyntheticDetailKind` 에 `'posNet'` 추가 · 함수 머리 주석 목록에 설명 추가. `posNet` = `accumSyntheticDetail('multiCycle')` 을 바탕으로 payload.cycles 두 번째 항목만 `cycle: 2` 로 바꾸고(나머지 multiCycle 그대로) `pos_net` 을 붙인다 — 시각은 ACCUM_DATE KST: t = 09:13:00 · 10:00:00 · 11:32:00 · 12:10:00 · 12:40:00 · 13:06:00 · 14:00:00, net_krw = 120_000_000 · 250_000_000 · 60_000_000 · 140_000_000 · 50_000_000 · 110_000_000 · 180_000_000, cycle = 1 · 1 · 1 · 1 · 1 · 2 · 2, end = 0 · 0 · 1 · 0 · 4 · 0 · 0 (11:32 청산 end 1 → 12:10 같은 사이클 재등장은 새 조각 · 12:40 매집 종료 end 4 → 13:06 사이클 2 · 열린 끝).
5. 테스트 GREEN 확인 → 커밋 「feat(quick-261025-fac): 매집감지 누적 판 포지션 순매수 계단 — payload.pos_net · 회색 그날 계단 · 합친 축 · 판 제목」. 스테이징은 이 task 파일 경로를 하나씩 지정(git add -A 금지) · Co-Authored-By 넣지 않음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/accum-detail.test.tsx src/lib/__tests__/accum-chart.test.ts --maxWorkers=2</automated>
  </verify>
  <done>posNet 행 펼침에서 굵은 --team 포지션 계단(3조각 · 열린 끝 20:00)이 회색 그날 계단 위에 그려지고 제목이 바뀐다. 천일고속(키 없음)은 지금 모양 그대로. 기존 accum-chart · accum-detail 테스트 전부 통과. RED · GREEN 커밋 2개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 포지션 툴팁 · 기하 경계 잠금 · 이월 픽스처(end 배열 없음 · 06:01 점 · 13억)</name>
  <files>webapp/src/lib/accum-chart.ts, webapp/src/lib/__tests__/accum-chart.test.ts, webapp/src/test-fixtures/accum-export.ts, webapp/src/components/analytics/__tests__/accum-detail.test.tsx</files>
  <read_first>
    - webapp/src/lib/accum-chart.ts 508~617(stepIndexAt · avgPxAt · orderTipOf · cumTipAt) — Task 1 이 더한 posNetPointsOf · posNetPathOf
    - webapp/src/lib/__tests__/accum-chart.test.ts 304~344 · 608~737(누적 · 평단 · 툴팁 테스트 문법)
  </read_first>
  <behavior>
    단위(accum-chart.test.ts · describe 「포지션 순매수 선(quick-261025-fac · 스케치 017 B)」 — x = xm(분 = px) · yq = (c) => c / 1e8 · T2000 = T0 + 11h → x 660):
    - posNetPointsOf: 키 없음 · null · 'bad' · 숫자 · 배열 · t_ms/net_krw/cycle 중 하나가 배열 아님 → []; 길이 다르면 셋 중 최소까지; t/net/cycle 의 NaN · null 점 건너뜀; end 없음 · end 가 배열 아님 → 전부 end 0; end 가 짧거나 요소가 수 아님 → 그 점 0; 정렬 안 함.
    - 실측 천일(pos_net 없음) · pos_net 불량('bad') → payloadOf 는 행을 남기고 posNetPointsOf 만 [](avg_px 테스트와 같은 모양).
    - posNetPathOf 끊김(end 배열): 점 (분, 원, cycle, end) = (13, 1.2e8, 1, 0) · (60, 2.5e8, 1, 0) · (152, 0.6e8, 1, 1) · (190, 1.4e8, 1, 0) · (220, 0.5e8, 1, 4) · (246, 1.1e8, 2, 0) · (300, 1.8e8, 2, 0) → 'M13.0,1.2H60.0V2.5H152.0V0.6M190.0,1.4H220.0V0.5M246.0,1.1H300.0V1.8H660.0'.
    - posNetPathOf 사이클 끊김 · end 없음 · 09:00 전: (−179, 12.4e8, 1) · (−20, 12.6e8, 1) · (60, 13e8, 1) · (356, 0.5e8, 1) · (370, 1.2e8, 2) · (420, 1.5e8, 2) → 'M0.0,12.6H60.0V13.0H356.0V0.5M370.0,1.2H420.0V1.5H660.0'.
    - posNetPathOf 닫힌 마지막 조각: (60, 1e8, 1, 0) · (120, 0.5e8, 1, 1) → 'M60.0,1.0H120.0V0.5'(연장 없음). 열린 점 하나 (60, 1e8, 1, 0) → 'M60.0,1.0H660.0'. 빈 배열 → ''.
    - cumRangeOf(cum, pos): pos net 13e8 → max 13e8 · pos net −3e8 → min −3e8 · 인자 하나 호출은 기존 기대값 그대로.
    - cumTipAt(pos 있음) — 기존 툴팁 테스트의 payload(day 10:00:00 2.0억 · 10:00:05 2.1억 · 10:30:00 1.94억 · avg_px 10:00 19,800 → 10:30 0)에 pos_net { t: 09:30:00 · 10:00:00 · 10:20:00 · 10:40:00 · 11:00:00, net: 1.5e8 · 1.8e8 · 0.5e8 · 1.2e8 · 1.6e8, cycle: 1 · 1 · 1 · 2 · 2, end: 0 · 0 · 1 · 0 · 0 } 을 더한 것:
      - 09:20 → null(둘 다 점 없음).
      - 09:45 → key 'c-1p0' · '09:30:00 · 순매수 누적 0.00억 · 포지션 순매수 +1.50억(이월 포함)'.
      - 10:10 → key 'c1p1' · '10:00:05 · 순매수 누적 +2.10억 · 포지션 순매수 +1.80억(이월 포함) · 팀 평단 19,800원'.
      - 10:25 → key 'c1p2' · '10:20:00 · 순매수 누적 +2.10억 · 포지션 순매수 +0.50억(이월 포함) · 팀 평단 19,800원'(end≠0 점 그 시각엔 값이 있다).
      - 10:35 → key 'c2p2' · '10:30:00 · 순매수 누적 +1.94억 · 포지션 —'(end≠0 점 뒤 공백 · 평단 0 → 생략).
      - 10:50 → key 'c2p3' · '10:40:00 · 순매수 누적 +1.94억 · 포지션 순매수 +1.20억(이월 포함)'.
      - 사이클 사이(end 없음): pos { t: 09:30:00 · 10:20:00 · 10:40:00, net: 1.5e8 · 0.5e8 · 1.2e8, cycle: 1 · 1 · 2 } 에서 10:35 → '10:30:00 · 순매수 누적 +1.94억 · 포지션 —'.
      - 닫힌 마지막 조각 뒤: pos { t: 09:30:00 · 10:20:00, net: 1.5e8 · 0.5e8, cycle: 1 · 1, end: 0 · 1 } 에서 10:50 → '10:30:00 · 순매수 누적 +1.94억 · 포지션 —'.
      - pos_net 키 없음 · 빈 배열 셋 → 기존 기대값(key 'c1' · 문구)과 완전히 같다.
    컴포넌트(accum-detail.test.tsx · Task 1 describe 안):
    - (f3) `posNetCarry`(동양고속) → 포지션 path d 가 `M{accum-cum-zero 의 x1 을 toFixed(1)},` 로 시작(06:01 건너뜀 · 08:40 점이 왼쪽 끝) · M 2개 · 마지막 H = 그날 path 마지막 H · 누적 축 글자에 「+13.0억」.
    - (f4) `posNet` → 포지션 path 첫 `M x1,…H x2` 의 (x1 + x2)/2 · y 300 에 pointerMove(mouse) → 툴팁이 /^\d\d:\d\d:\d\d · 순매수 누적 [+−]?[\d.,]+억 · 포지션 순매수 [+−]?[\d.,]+억\(이월 포함\)/ 에 맞는다. 주문 원 툴팁 기존 테스트는 손대지 않고 통과.
  </behavior>
  <action>
RED 먼저: behavior 의 단위 · 컴포넌트 테스트를 쓰고, 그 전에 accum-export.ts 에 `'posNetCarry'` kind 를 추가한다 — `accumSyntheticDetail('carry')` 바탕에 pos_net(**end 배열 없음**) — 시각 ACCUM_DATE KST t = 06:01:00 · 08:40:00 · 10:00:00 · 14:56:00 · 15:10:00 · 16:00:00, net_krw = 1_240_000_000 · 1_260_000_000 · 1_300_000_000 · 50_000_000 · 120_000_000 · 150_000_000, cycle = 1 · 1 · 1 · 1 · 2 · 2 (payload.cycles 는 carry 그대로 — 차트는 pos_net.cycle 만 본다고 머리 주석에 적는다). 툴팁 테스트가 실패하는 것을 확인(기하 경계 테스트는 Task 1 구현으로 이미 통과해도 된다 — 경계 잠금) → 커밋 「test(quick-261025-fac): 포지션 툴팁 · 끊김 경계 · 이월 픽스처 실패 테스트」.

GREEN — cumTipAt 만 고친다(orderTipOf 무변경):
- 시그니처 Pick 에 'pos_net' 추가. `pos = posNetPointsOf(payload)` 가 비면 **지금 코드 경로 그대로**(문구 · key `c${k}` · null 조건 불변).
- 있으면 스냅샷 방식(판단 기록 — 지금 툴팁이 「t 이하 마지막 사건 시각」 에 맞추는 문법을 두 선으로 넓힌 것): kd = 그날 계단의 stepIndexAt(t), kp = pos 중 시각 ≤ t 인 마지막 번호(시각 > t 를 만나면 멈춤 · 없으면 −1). 둘 다 −1 이면 null. tk = (kd ≥ 0 이면 그날 점 시각, kp ≥ 0 이면 pos 점 시각) 중 큰 값. 그날 글자 = 「순매수 누적 」 + fmtEok(kd ≥ 0 ? 그날 값 : 0, signed · digits 2)(그날 0부터라 첫 주문 전은 0). 포지션 값 = kp < 0 이면 없음; tk > pos[kp].t 이고 (pos[kp].end ≠ 0 또는 (pos[kp+1] 이 있고 그 cycle ≠ pos[kp].cycle)) 이면 없음; 아니면 pos[kp].net. 포지션 글자 = 값 없음이면 「포지션 —」, 있으면 「포지션 순매수 」 + fmtEok(값, signed · digits 2) + 「(이월 포함)」. 줄 = `${kstClock(tk)} · 그날 글자 · 포지션 글자` + (avgPxAt(payload, tk) 가 있으면 ` · 팀 평단 N원`). key = `c${kd}p${kp}`. 이 판정은 posNetPathOf 의 조각 규칙(마지막 점에서 멈춤 · 열린 마지막 조각만 이어짐)과 같은 뜻이어야 한다 — JSDoc 에 둘을 짝으로 적는다.
- accum-chart.tsx 의 `cumTipAt(payload, t)` 호출은 payload 전체를 넘기므로 손댈 것 없다(타입만 맞는지 확인).
- 테스트 GREEN → 커밋 「feat(quick-261025-fac): 누적 판 툴팁 포지션 순매수(이월 포함) · 공백 구간 「포지션 —」」. 경로 지정 스테이징 · Co-Authored-By 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx --maxWorkers=2</automated>
  </verify>
  <done>behavior 의 문구 · key · 경로 문자열이 테스트로 잠기고 통과. pos_net 없는 툴팁 기대값은 한 글자도 안 바뀜. 이월 픽스처에서 포지션 선이 왼쪽 끝에서 시작하고 축에 +13.0억. RED · GREEN 커밋 2개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 범례 두 항목(pos 있을 때만) · 판정 기준 본문 2 문구 · 전체 타입 검사</name>
  <files>webapp/src/components/analytics/accum-detail.tsx, webapp/src/lib/accum-report.ts, webapp/src/lib/__tests__/accum-report.test.ts, webapp/src/components/analytics/__tests__/accum-detail.test.tsx</files>
  <read_first>
    - webapp/src/components/analytics/accum-detail.tsx 95~125(스켈레톤) · 296~387(LEGEND · ChartBody)
    - webapp/src/lib/accum-report.ts 430~441(ACCUM_RULE_LINES)
    - webapp/src/lib/__tests__/accum-report.test.ts 389~398 · webapp/src/components/analytics/__tests__/accum-detail.test.tsx 330~338 · 480~488(RULE_TEXTS)
  </read_first>
  <behavior>
    - (l1) `posNet` 펼침 → `[data-slot="accum-legend"]` 자식 글자가 정확히 ['가격(10초)', '팀 평단', '팀 매수', '팀 매도', '팀매수 시작', '포지션 순매수(이월 포함)', '그날 순매수 누적(0부터)', '등록', '청산·종료', '등록 전'] · 모든 자식에 aria-hidden 견본 span · 포지션 견본 class 에 `bg-[var(--team)]` 와 3px 높이 · 그날 견본 class 에 `bg-[var(--muted-fg)]` 와 1px 높이.
    - (l2) 천일고속 (h1) 기존 9항목 기대값 그대로 통과(손대지 않음).
    - (r1) `ACCUM_RULE_LINES[1]` 이 아래 문구와 글자 그대로 같고, accum-detail 판정 기준 펼침 RULE_TEXTS[2] 도 같은 문구로 통과.
  </behavior>
  <action>
RED 먼저: (l1) 를 Task 1 describe 에 추가하고, accum-report.test.ts 의 ACCUM_RULE_LINES 기대 배열 두 번째 줄과 accum-detail.test.tsx 의 RULE_TEXTS 세 번째 줄을 아래 새 문구로 바꾼다 → 실패 확인 → 커밋 「test(quick-261025-fac): 포지션 범례 · 판정 기준 본문 2 실패 테스트」.

새 본문 2(글자 그대로 — 사이 공백 · 가운뎃점 · 괄호 포함):
하루 순매수(day)는 119 pcap 으로 다시 계산한 하루 전체예요 — 등록 전 구간 · 우리 체결 · 상한가 가격 체결 포함(KRX 연속매매 09:00~20:00). 누적 판의 얇은 회색 계단이 이 값이고, 굵은 보라 선은 포지션 순매수(등록 후 · 이월 포함 · 우리 체결 제외 — 목록 · KPI 와 같은 값)예요. 그래서 두 값은 부호까지 다를 수 있고, 팀 매집 보고서의 하루 합계(상한가 가격 제외)와도 달라요.

GREEN:
1. accum-report.ts: `ACCUM_RULE_LINES[1]` 을 위 문구로 교체(나머지 세 줄 · ACCUM_RULE_SOURCE 무변경). 배열 위 주석 「UI-SPEC A9 Copywriting 글자 그대로 — 고치지 않는다」 뒤에 「본문 2 만 quick-261025-fac(스케치 017 B — 누적 판 두 선)로 개정」 을 덧붙인다. payloadOf 는 손대지 않는다. 판단 기록: 문구는 상수라 pos_net 없는 옛 행에도 같은 글이 뜬다 — gh-trade 가 10/01~10/23 accum_flow 를 재생성해 키가 생기므로 받아들인다.
2. accum-detail.tsx: `posNetPointsOf` 를 `@/lib/accum-chart` 기존 import 줄에 더한다. LEGEND 아래에 `POS_LEGEND` 두 항목 — 「포지션 순매수(이월 포함)」 견본 `inline-block h-[3px] w-2.5 rounded-full bg-[var(--team)]`, 「그날 순매수 누적(0부터)」 견본 `inline-block h-px w-2.5 bg-[var(--muted-fg)] opacity-70` — 과, LEGEND 에서 label 「순매수 누적」 항목 자리에 POS_LEGEND 를 끼운 `LEGEND_POS`(flatMap 으로 LEGEND 하나에서 파생 · 순서 고정)를 모듈 상수로 둔다. ChartBody 에서 `legend = posNetPointsOf(payload).length > 0 ? LEGEND_POS : LEGEND` 로 범례를 그린다(LEGEND_ROW · 항목 마크업 그대로). 로딩 스켈레톤은 payload 를 모르니 LEGEND 그대로. 주석에 quick-261025-fac · 스케치 017 B 한 줄.
3. 테스트 GREEN → 아래 verify 전체(4개 테스트 파일 · shared typecheck · webapp typecheck · eslint) 통과 확인 → 커밋 「feat(quick-261025-fac): 매집감지 상세 범례 포지션 순매수 · 그날 누적 두 항목 · 판정 기준 본문 2 개정」. 경로 지정 스테이징 · Co-Authored-By 없음. 배포 · push 하지 않는다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/lib/__tests__/accum-report.test.ts src/components/analytics/__tests__/accum-detail.test.tsx src/components/analytics/__tests__/accum-report.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp exec eslint src/lib/accum-chart.ts src/lib/accum-report.ts src/components/analytics/accum-chart.tsx src/components/analytics/accum-detail.tsx src/test-fixtures/accum-export.ts src/lib/__tests__/accum-chart.test.ts src/lib/__tests__/accum-report.test.ts src/components/analytics/__tests__/accum-detail.test.tsx && grep -q 'pos_net?:' packages/shared/src/accum-report.ts && grep -q 'export function posNetPathOf' webapp/src/lib/accum-chart.ts && grep -q 'data-slot="accum-pos-net-path"' webapp/src/components/analytics/accum-chart.tsx && grep -q '그날 순매수 누적(0부터)' webapp/src/components/analytics/accum-detail.tsx</automated>
  </verify>
  <done>pos 있는 행 범례 10항목 · 없는 행 9항목 그대로 · 판정 기준 본문 2 새 문구가 lib · 컴포넌트 테스트 둘 다에서 통과 · shared/webapp typecheck · eslint 통과. RED · GREEN 커밋 2개(이 플랜 전체 6개).</done>
</task>

</tasks>

<verification>
- 세 task verify 가 모두 통과한다(마지막 task verify 가 4개 테스트 파일 · 두 typecheck · eslint · 산출물 grep 을 한 번에 돈다).
- 동시 세션 메모리 보호: vitest 는 늘 `--maxWorkers=2`. Playwright · e2e · 전체 회귀는 돌리지 않는다(e2e 픽스처는 pos_net 없는 실측 행이라 제목 「순매수 누적」 · 툴팁 정규식이 그대로 맞는다 — 범위 밖).
- 범위 밖(손대지 않음): server · workers · supabase · e2e · `packages/shared/src/index.ts` · `.planning/phases/34-accum/34-UI-SPEC.md`(스케치 017 README 가 정본 결정).
</verification>

<success_criteria>
- pos_net 점이 있는 행: 굵은 --team 포지션 계단(끊김 · 09:00 맞춤 · 열린 끝만 20:00) 위 / 회색 그날 계단 아래 · 한 축 · 제목 「포지션 순매수 · 그날 누적」 · 범례 두 항목 · 툴팁 포지션 값 또는 「포지션 —」.
- pos_net 없음 · 불량 행: 렌더 · 범례 · 제목 · 툴팁이 오늘과 같다(오류 없음).
- 판정 기준 본문 2 새 문구.
- 커밋 6개(task 마다 test → feat) · 한글 메시지 `(quick-261025-fac)` · Co-Authored-By 없음 · 경로 지정 스테이징 · push/배포 없음.
</success_criteria>

<output>
Create `.planning/quick/261025-fac-pos-net-017-b/261025-fac-SUMMARY.md` when done
</output>
