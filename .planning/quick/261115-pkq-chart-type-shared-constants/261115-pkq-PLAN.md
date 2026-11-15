---
phase: quick-261115-pkq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer) — 공유 상수 모듈 + 「타임라인」 제목 한 값을 두 차트에 끝까지 연결
  - webapp/src/components/ticks/chart-typography.ts
  - webapp/src/components/ticks/tick-chart.tsx
  - webapp/src/components/ticks/candle-chart-title.tsx
  # Task 2 — 값 띠 글자 · 구간 칩 SVG 글자 크기 (chart-typography.ts · tick-chart.tsx 다시 고침 + 아래)
  - webapp/src/components/ticks/tick-chart-band.tsx
  - webapp/src/components/ticks/candle-chart-band.tsx
  - webapp/src/components/ticks/candle-chart.tsx
autonomous: true
requirements: ["261115-pkq"]

estimate:
  tokens: 40000
  raw_tokens: 40000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "선 차트 · 봉 차트의 「타임라인」 제목 글자, 값 띠 글자, 구간 칩 SVG 글자 크기가 webapp/src/components/ticks/chart-typography.ts 의 상수 3개(CHART_TITLE_TEXT · CHART_BAND_TEXT · CHART_PILL_FONT_SIZE) 한 곳에서 나온다 — 두 차트 파일 6곳에 그 값이 다시 적혀 있지 않다 (Phase 42 UI-REVIEW 3번)"
    - "렌더 결과는 바이트 단위로 같다 — 제목 h2 className 은 그대로 「m-0 text-[12.5px] font-bold text-[var(--fg)]」, 띠 루트 cn 첫 인자는 그대로 「grid border-b border-[var(--border-subtle)] text-[11.5px] leading-[14px] tabular-nums」, 구간 칩 <text> 의 font-size 는 그대로 10.5 (동작 변경 0)"
    - "Tailwind 클래스는 상수 안에 완전한 리터럴 문자열로 있다(조각 조립 없음) — Tailwind v4 자동 감지가 .ts 파일에서 그대로 읽는다"
    - "기존 ticks 컴포넌트 테스트 23파일 · 318건이 기대값 수정 없이 통과하고 webapp typecheck 가 통과한다"
    - "범위 밖은 그대로다 — 팀 주문 묶음 상자 머리(tick-chart.tsx TickGroupBox 의 text-[11.5px] font-bold) · 다른 카드 제목 · 확대 버튼 클래스 · 구간 칩 폭 추정식 · 보호 lib 파일(webapp/src/lib/ticks/*) · 테스트 파일은 손대지 않는다"
  artifacts:
    - path: "webapp/src/components/ticks/chart-typography.ts"
      provides: "선 · 봉 차트 공유 글자 상수 3개 — CHART_TITLE_TEXT · CHART_BAND_TEXT · CHART_PILL_FONT_SIZE"
      contains: "CHART_PILL_FONT_SIZE"
  key_links:
    - from: "webapp/src/components/ticks/tick-chart.tsx 「타임라인」 h2 · 구간 칩 <text>"
      to: "chart-typography.ts CHART_TITLE_TEXT · CHART_PILL_FONT_SIZE"
      via: "import { CHART_PILL_FONT_SIZE, CHART_TITLE_TEXT } from './chart-typography'"
      pattern: "CHART_TITLE_TEXT"
    - from: "webapp/src/components/ticks/candle-chart-title.tsx TITLE_H2"
      to: "chart-typography.ts CHART_TITLE_TEXT"
      via: "import { CHART_TITLE_TEXT } from '@/components/ticks/chart-typography'"
      pattern: "CHART_TITLE_TEXT"
    - from: "webapp/src/components/ticks/tick-chart-band.tsx · candle-chart-band.tsx 띠 루트 cn 첫 인자"
      to: "chart-typography.ts CHART_BAND_TEXT"
      via: "import { CHART_BAND_TEXT } from './chart-typography'"
      pattern: "CHART_BAND_TEXT"
    - from: "webapp/src/components/ticks/candle-chart.tsx 구간 칩 <text>"
      to: "chart-typography.ts CHART_PILL_FONT_SIZE"
      via: "import { CHART_PILL_FONT_SIZE } from './chart-typography'"
      pattern: "CHART_PILL_FONT_SIZE"
---

<objective>
틱뷰어 선 차트 · 봉 차트가 같은 글자 크기 3가지를 공유 상수 하나에서 가져오게 정리한다. 동작 변경 0 — 렌더되는 클래스 문자열 · SVG 속성은 바이트 단위로 같아야 한다.

Purpose: Phase 42 UI-REVIEW 3번 — 「상속 부품 때문에 타이포 스케일이 계약보다 넓다 … 봉 차트 전용 파일에 값을 다시 적어 두었다(선 차트에서 가져온 것이 아니라 복제). 선 차트 값이 바뀌면 전환할 때 화면이 튄다. 수정: 두 차트가 공유하는 상수 하나로 모은다(동작 변경 없음).」 UI-SPEC §Typography 는 이미 이 값들을 「상속」 으로 적고 있으므로 PLAN · SUMMARY 밖의 문서 변경은 없다.

대상 값 3개 × 2곳 = 6곳 (2026-11-15 HEAD 실측 줄 번호 — 옆 세션 커밋으로 밀렸으면 grep 으로 다시 찾는다):
- 「타임라인」 제목 h2 글자: tick-chart.tsx:659 · candle-chart-title.tsx:73
- 값 띠 루트 글자 · 줄 높이: tick-chart-band.tsx:72 · candle-chart-band.tsx:57
- 구간 칩 SVG 글자 크기: tick-chart.tsx:1008 · candle-chart.tsx:879

Output: 새 상수 모듈 `webapp/src/components/ticks/chart-typography.ts` 1개 + 두 차트 파일 5개가 그 상수를 import. 커밋 2개(태스크마다 1개). push · 배포 없음(메인 세션 몫).

파일 이름 결정(Claude 재량): 오케스트레이터 예시는 `chart-type.ts` 였으나 같은 디렉터리의 `chart-kind-switch.tsx` 가 「선 차트 | 봉 차트」 종류를 다루고 있어 `chart-type` 은 「차트 종류」 나 TS 타입 모듈로 읽힐 수 있다. 글자(typography) 상수임이 이름에서 드러나도록 `chart-typography.ts` 로 한다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@webapp/src/components/ticks/candle-chart-title.tsx
@webapp/src/components/ticks/candle-chart-band.tsx

# 큰 파일은 통째로 읽지 말고 아래 구간만 Read(offset/limit) 한다
# - webapp/src/components/ticks/tick-chart.tsx: import 블록 1 ~ 70줄 · 「타임라인」 제목 650 ~ 662줄 · 구간 칩 995 ~ 1013줄
# - webapp/src/components/ticks/candle-chart.tsx: import 블록 80 ~ 95줄 · 구간 칩 868 ~ 884줄
# - webapp/src/components/ticks/tick-chart-band.tsx: 1 ~ 6줄(import) · 55 ~ 75줄(띠 루트)

# 실행 환경 규칙 (오케스트레이터 · 사용자 규칙)
# - main tree 에서 순차 실행. 옆 세션이 master 에 동시에 커밋할 수 있다 — `git add -A` 금지, 아래 files 경로만 지정해 stage.
# - 커밋 메시지는 한국어, Co-Authored-By 줄을 넣지 않는다(사용자 전역 규칙이 시스템 기본 attribution 보다 우선).
# - push 하지 않는다(push = webapp 프로덕션 배포 · 메인 세션 몫).
# - vitest 는 --maxWorkers=2 (동시 세션 메모리 고갈 방지). e2e · 전체 회귀 금지.
# - 보호 파일(손대지 않음): webapp/src/lib/ticks/tick-chart.ts · team-model.ts · tick-chart-tip.ts · own-model.ts,
#   webapp/src/hooks/use-chart-view.ts · use-chart-width.ts, webapp/src/lib/touch-inspect.ts 와 그 테스트들, 그리고 모든 __tests__ 파일(기대값 수정 금지).

# 기준선 (2026-11-15 HEAD 9f87986c 에서 실측)
# - npm --prefix webapp run typecheck → exit 0 (약 4초)
# - npm --prefix webapp run test -- --maxWorkers=2 src/components/ticks/__tests__ → Test Files 23 passed · Tests 318 passed (약 16초)
# - Tailwind 4(@tailwindcss/postcss · webapp/src/styles/globals.css 의 @import 'tailwindcss' · @source 지정 없음 = 자동 감지) → src 아래 .ts 파일 문자열도 스캔한다. prettier · 커밋 훅 없음.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): 공유 글자 상수 모듈 + 「타임라인」 제목 한 값을 선 · 봉 차트 둘 다에 연결</name>
  <files>webapp/src/components/ticks/chart-typography.ts, webapp/src/components/ticks/tick-chart.tsx, webapp/src/components/ticks/candle-chart-title.tsx</files>
  <read_first>
    - webapp/src/components/ticks/candle-chart-title.tsx (전체 · 73줄 TITLE_H2)
    - webapp/src/components/ticks/tick-chart.tsx 1 ~ 70줄(import 순서 · './tick-chart-band' 형 형제 import) · 650 ~ 662줄(「타임라인」 h2)
  </read_first>
  <action>
    가장 얇은 한 길 — 상수 모듈을 만들고 값 하나(「타임라인」 제목 글자)만 두 차트 모두에 끝까지 연결해, 모듈 위치 · import 경로 · 바이트 동일 조립 방식이 두 차트에서 다 통하는지 먼저 증명한다.

    1. 새 파일 `webapp/src/components/ticks/chart-typography.ts` 를 만든다. 'use client' 지시문은 넣지 않는다(상수만 있는 순수 모듈 — 'use client' 가 없는 tick-chart-band.tsx 에서도 import 한다).
       - 파일 머리 JSDoc(한국어, 코드베이스 주석 말투): 선 차트 · 봉 차트가 같이 쓰는 글자 크기 상수라는 것 · 출처(Phase 42 UI-REVIEW 3번 · UI-SPEC Typography 「상속」) · 「Tailwind 4 자동 감지가 이 .ts 파일의 문자열을 그대로 읽으므로 클래스는 조각으로 조립하지 말고 완전한 리터럴로 둔다」 · 「값을 바꾸면 선 · 봉 두 차트가 함께 바뀐다(전환할 때 화면이 튀지 않게 하려는 것)」.
       - 이 태스크에서는 상수 하나만 둔다: `export const CHART_TITLE_TEXT = 'text-[12.5px] font-bold';` — 정확히 이 한 줄 형태(작은따옴표 · 세미콜론 · `as const` 없음). 바로 위에 한 줄 JSDoc: 「타임라인」 제목 h2 의 글자 크기 · 굵기(색 · 여백은 쓰는 쪽이 붙인다).
    2. `webapp/src/components/ticks/tick-chart.tsx`: 기존 형제 import 묶음(`./tick-chart-band` · `./tick-chart-range` 근처)에 `import { CHART_TITLE_TEXT } from './chart-typography';` 를 알파벳 순서에 맞게 넣는다. 「타임라인」 h2 의 className 을 문자열 속성에서 템플릿 리터럴 표현식으로 바꾼다 — 정확히 className={`m-0 ${CHART_TITLE_TEXT} text-[var(--fg)]`} (앞 m-0 · 상수 · 뒤 색 클래스, 공백 하나씩). cn() 으로 감싸지 않는다 — tailwind-merge 가 임의값 text-[…] 두 개를 충돌로 보고 하나를 지울 수 있어 바이트 동일이 깨질 수 있다. 같은 파일의 팀 주문 묶음 상자 머리(TickGroupBox · 약 190줄의 11.5px 굵은 글자)는 띠 글자가 아니라 툴팁 묶음 표 제목이라 다른 역할 — 손대지 않는다.
    3. `webapp/src/components/ticks/candle-chart-title.tsx`: 이 파일은 형제를 `@/components/ticks/…` 로 import 하는 관례이므로 `import { CHART_TITLE_TEXT } from '@/components/ticks/chart-typography';` 를 기존 `@/components/ticks/candle-unit-menu` import 바로 아래(알파벳 순)에 넣는다. 모듈 수준 `TITLE_H2` 의 h2 className 을 2번과 똑같은 템플릿 리터럴 표현식으로 바꾼다. 나머지(버튼 클래스 · 범례 · 주석)는 그대로.
    4. 확인 뒤 커밋 — 위 3개 경로만 지정해 stage(`git add webapp/src/components/ticks/chart-typography.ts webapp/src/components/ticks/tick-chart.tsx webapp/src/components/ticks/candle-chart-title.tsx`). 커밋 직전 `git status -sb` 로 옆 세션의 남의 변경이 stage 에 섞이지 않았는지 본다. 메시지(한국어 · Co-Authored-By 없음): `refactor(quick-261115-pkq): 틱뷰어 「타임라인」 제목 글자를 선 · 봉 차트 공유 상수로 (동작 변경 0)`.
  </action>
  <verify>
    <automated>grep -qF "export const CHART_TITLE_TEXT = 'text-[12.5px] font-bold';" webapp/src/components/ticks/chart-typography.ts && grep -qF 'className={`m-0 ${CHART_TITLE_TEXT} text-[var(--fg)]`}' webapp/src/components/ticks/tick-chart.tsx && grep -qF 'className={`m-0 ${CHART_TITLE_TEXT} text-[var(--fg)]`}' webapp/src/components/ticks/candle-chart-title.tsx && ! grep -n 'm-0 text-\[12.5px\] font-bold' webapp/src/components/ticks/tick-chart.tsx webapp/src/components/ticks/candle-chart-title.tsx && npm --prefix webapp run typecheck && npm --prefix webapp run test -- --maxWorkers=2 src/components/ticks/__tests__</automated>
  </verify>
  <acceptance_criteria>
    - chart-typography.ts 에 `export const CHART_TITLE_TEXT = 'text-[12.5px] font-bold';` 한 줄이 있다 (HEAD 기준선: 파일 없음).
    - tick-chart.tsx · candle-chart-title.tsx 둘 다 h2 className 이 템플릿 리터럴 `m-0 ${CHART_TITLE_TEXT} text-[var(--fg)]` 이다 — 조립 결과 문자열이 이전 문자열과 같은 순서 · 같은 공백으로 일치.
    - 두 파일에 이전 리터럴 제목 클래스 문자열이 남아 있지 않다 (HEAD 기준선: tick-chart.tsx:659 · candle-chart-title.tsx:73 두 줄 매치 → 이후 0줄).
    - typecheck exit 0, vitest 출력이 `Test Files  23 passed (23)` · `Tests  318 passed (318)` — 파일 수가 23 보다 적으면 경로 필터가 틀린 것(--passWithNoTests 가 숨긴다)이므로 실패로 본다.
    - 테스트 파일 · 보호 lib 파일 diff 0.
  </acceptance_criteria>
  <done>새 모듈 하나에서 나온 「타임라인」 제목 글자 클래스가 선 · 봉 두 차트에 같은 문자열로 렌더되고, 기존 테스트 23파일 · 318건이 그대로 통과한 상태로 커밋 1개가 남는다.</done>
</task>

<task type="auto">
  <name>Task 2: 값 띠 글자 · 구간 칩 SVG 글자 크기를 같은 모듈 상수로 옮기기</name>
  <files>webapp/src/components/ticks/chart-typography.ts, webapp/src/components/ticks/tick-chart-band.tsx, webapp/src/components/ticks/candle-chart-band.tsx, webapp/src/components/ticks/tick-chart.tsx, webapp/src/components/ticks/candle-chart.tsx</files>
  <read_first>
    - webapp/src/components/ticks/chart-typography.ts (Task 1 결과)
    - webapp/src/components/ticks/tick-chart-band.tsx 1 ~ 6줄 · 55 ~ 75줄(띠 루트 cn)
    - webapp/src/components/ticks/candle-chart-band.tsx 1 ~ 20줄 · 50 ~ 60줄(띠 루트 cn)
    - webapp/src/components/ticks/tick-chart.tsx 990 ~ 1013줄(구간 칩 g data-slot="tick-range-pill")
    - webapp/src/components/ticks/candle-chart.tsx 80 ~ 95줄(형제 import) · 868 ~ 884줄(구간 칩 g data-slot="candle-range-pill")
  </read_first>
  <action>
    1. `chart-typography.ts` 에 상수 2개를 더한다(각각 한 줄 JSDoc).
       - `CHART_BAND_TEXT` — 값 띠 루트(차트 위 높이 고정 4칸 띠)의 글자 크기 · 줄 높이. 값은 tick-chart-band.tsx 72줄 띠 루트 cn 첫 인자 안의 두 타이포 클래스(11.5px 글자 크기 임의값 클래스, 그다음 14px 줄 높이 임의값 클래스)를 원문 그대로 같은 순서 · 공백 하나로 옮긴 작은따옴표 문자열이다. 선언 형태는 `export const CHART_BAND_TEXT = '…';` (as const 없음). 줄 높이는 띠 높이 계산(데스크톱 58 · 88 등)의 전제라는 것을 JSDoc 에 한 구절로 적는다.
       - `CHART_PILL_FONT_SIZE` — 수익률 · 가격 구간 칩(SVG <text>) 글자 크기, 숫자. 선언은 정확히 `export const CHART_PILL_FONT_SIZE = 10.5;`. JSDoc 에 「두 차트의 칩 폭 추정(글자당 6.4 + 10)은 이 크기를 전제로 한다 — 크기를 바꾸면 그 추정도 같이 본다」 를 적는다(추정식 자체는 이번에 옮기지 않는다 — 범위 밖).
    2. `tick-chart-band.tsx` · `candle-chart-band.tsx`: `import { CHART_BAND_TEXT } from './chart-typography';` 를 넣는다(candle-chart-band.tsx 는 기존 `./tick-chart-band` import 바로 위 · 알파벳 순; tick-chart-band.tsx 는 `@/lib/utils` import 아래 빈 줄 뒤 새 형제 import 묶음으로). 띠 루트 div 의 cn 첫 인자 문자열을 템플릿 리터럴로 바꾼다 — 정확히 `grid border-b border-[var(--border-subtle)] ${CHART_BAND_TEXT} tabular-nums` 를 백틱으로 감싼 것. cn 의 둘째 인자(phone ? … : …)와 다른 모든 클래스(Head · Kv · Rest 의 10.5 · 11 · 12px 등)는 그대로 둔다 — 이번 대상이 아니다. candle-chart-band.tsx 머리 JSDoc 14줄(「글자 크기 · 굵기는 선 차트 띠 부품 … 새 크기 없음」)에 「띠 루트 글자 크기 · 줄 높이는 공유 상수 `CHART_BAND_TEXT`(chart-typography.ts)」 한 구절을 덧붙인다 — 클래스 값 자체는 주석에 적지 않는다.
    3. `tick-chart.tsx`: Task 1 에서 넣은 import 를 `import { CHART_PILL_FONT_SIZE, CHART_TITLE_TEXT } from './chart-typography';` 로 넓힌다. 구간 칩(`data-slot="tick-range-pill"`) 안 <text> 의 `fontSize` prop(지금 숫자 10.5)을 `CHART_PILL_FONT_SIZE` 표현식으로 바꾼다. 같은 <text> 의 x · y · textAnchor · fill · fontWeight 600 과 <rect> 는 그대로. TickGroupBox 머리 · 확대 버튼 `btn` 문자열은 손대지 않는다.
    4. `candle-chart.tsx`: 기존 형제 import 묶음(`./candle-chart-band` · `./candle-chart-caption` … `./tick-chart-range`)에 `import { CHART_PILL_FONT_SIZE } from './chart-typography';` 를 알파벳 순서 자리(`./candle-return-layer` 와 `./tick-chart` 사이)에 넣는다. 구간 칩(`data-slot="candle-range-pill"`) 안 <text> 의 `fontSize` prop 을 3번과 똑같이 바꾼다. 나머지 그대로.
    5. 확인 뒤 커밋 — 이 태스크의 5개 경로만 지정해 stage(`git add webapp/src/components/ticks/chart-typography.ts webapp/src/components/ticks/tick-chart-band.tsx webapp/src/components/ticks/candle-chart-band.tsx webapp/src/components/ticks/tick-chart.tsx webapp/src/components/ticks/candle-chart.tsx`), 커밋 직전 `git status -sb` 재확인. 메시지(한국어 · Co-Authored-By 없음): `refactor(quick-261115-pkq): 틱뷰어 값 띠 · 구간 칩 글자 크기도 선 · 봉 차트 공유 상수로 (동작 변경 0)`.
  </action>
  <verify>
    <automated>grep -qF "export const CHART_BAND_TEXT = 'text-[11.5px] leading-[14px]';" webapp/src/components/ticks/chart-typography.ts && grep -qF "export const CHART_PILL_FONT_SIZE = 10.5;" webapp/src/components/ticks/chart-typography.ts && grep -qF '`grid border-b border-[var(--border-subtle)] ${CHART_BAND_TEXT} tabular-nums`' webapp/src/components/ticks/tick-chart-band.tsx && grep -qF '`grid border-b border-[var(--border-subtle)] ${CHART_BAND_TEXT} tabular-nums`' webapp/src/components/ticks/candle-chart-band.tsx && grep -qF 'fontSize={CHART_PILL_FONT_SIZE}' webapp/src/components/ticks/tick-chart.tsx && grep -qF 'fontSize={CHART_PILL_FONT_SIZE}' webapp/src/components/ticks/candle-chart.tsx && ! grep -n 'text-\[11.5px\] leading-\[14px\]' webapp/src/components/ticks/tick-chart-band.tsx webapp/src/components/ticks/candle-chart-band.tsx && ! grep -n 'fontSize={10.5}' webapp/src/components/ticks/tick-chart.tsx webapp/src/components/ticks/candle-chart.tsx && test "$(grep -c 'text-\[11.5px\] font-bold' webapp/src/components/ticks/tick-chart.tsx)" = 1 && npm --prefix webapp run typecheck && npm --prefix webapp run test -- --maxWorkers=2 src/components/ticks/__tests__</automated>
  </verify>
  <acceptance_criteria>
    - chart-typography.ts 에 상수 3개(CHART_TITLE_TEXT · CHART_BAND_TEXT · CHART_PILL_FONT_SIZE)가 모두 완전한 리터럴로 있다 (HEAD 기준선: 파일 없음).
    - 두 띠 파일의 루트 cn 첫 인자가 템플릿 리터럴 `grid border-b border-[var(--border-subtle)] ${CHART_BAND_TEXT} tabular-nums` 이고, 이전 띠 글자 · 줄 높이 클래스 쌍 리터럴이 두 파일에 0줄 (HEAD 기준선: tick-chart-band.tsx:72 · candle-chart-band.tsx:57 두 줄 매치).
    - 두 차트 파일의 구간 칩 <text> 가 fontSize={CHART_PILL_FONT_SIZE} 이고, 숫자 10.5 를 바로 쓴 fontSize 속성이 두 파일에 0줄 (HEAD 기준선: tick-chart.tsx:1008 · candle-chart.tsx:879 두 줄 매치).
    - 보존 확인(HEAD 에서도 통과 — 의도된 범위 밖 보호): tick-chart.tsx 의 TickGroupBox 머리 `text-[11.5px] font-bold` 가 정확히 1줄 그대로 남아 있다.
    - typecheck exit 0, vitest `Test Files  23 passed (23)` · `Tests  318 passed (318)` — 테스트 파일 · 보호 lib 파일 diff 0.
  </acceptance_criteria>
  <done>값 띠와 구간 칩 글자 크기까지 세 값 모두가 chart-typography.ts 한 곳에서 나오고, 두 차트 6곳의 렌더 결과는 이전과 바이트 단위로 같으며, 기존 테스트가 그대로 통과한 상태로 커밋 1개가 더 남는다.</done>
</task>

</tasks>

<verification>
- 두 태스크 커밋이 건드린 파일이 정확히 files_modified 6개 안인지: `git show --name-only --format= <Task1 커밋> <Task2 커밋> | sort -u` → webapp/src/components/ticks/ 아래 chart-typography.ts · tick-chart.tsx · candle-chart-title.tsx · tick-chart-band.tsx · candle-chart-band.tsx · candle-chart.tsx 만. webapp/src/lib · webapp/src/hooks · __tests__ 경로가 하나라도 나오면 실패.
- 세 상수의 쓰는 곳이 6곳인지: `grep -rn "CHART_TITLE_TEXT\|CHART_BAND_TEXT\|CHART_PILL_FONT_SIZE" webapp/src/components/ticks --include='*.tsx' | grep -v "import "` → 6줄(제목 2 · 띠 2 · 칩 2).
- Tailwind 소스 감지: 옮긴 클래스(12.5px 글자 · 11.5px 글자 · 14px 줄 높이)는 chart-typography.ts 안에 완전한 리터럴로 있고(자동 감지 대상 .ts), 12.5px · 11.5px 글자 클래스는 다른 카드 파일에도 리터럴로 계속 쓰여 생성 CSS 가 바뀔 여지가 없다. next build 는 돌리지 않는다(범위 상한).
- e2e · 전체 vitest 회귀 · 배포 · push 는 하지 않는다.
</verification>

<success_criteria>
- 선 · 봉 차트의 공유 글자 값 3개가 chart-typography.ts 한 곳에만 값으로 존재하고, 두 차트 파일 5개는 import 로 그 값을 쓴다 (UI-REVIEW 3번 해소).
- 렌더 클래스 · SVG 속성 바이트 동일(동작 변경 0) — 기존 ticks 컴포넌트 테스트 23파일 · 318건이 기대값 수정 없이 통과, typecheck exit 0.
- 커밋 2개(한국어 메시지 · Co-Authored-By 없음 · 경로 지정 stage), push 없음.
</success_criteria>

<output>
Create `.planning/quick/261115-pkq-chart-type-shared-constants/261115-pkq-SUMMARY.md` when done — 반드시 포함: ① 커밋 2개 해시와 각 커밋의 파일 목록 ② 상수 3개 이름 · 값 · 쓰는 곳 6곳 표(파일:줄) ③ typecheck · vitest(23파일 · 318건) 결과 줄 원문 ④ 손대지 않은 범위 밖 항목 한 줄(TickGroupBox 머리 · 다른 카드 제목 · 확대 버튼 클래스 · 칩 폭 추정식) ⑤ 파일 이름을 chart-type.ts 대신 chart-typography.ts 로 한 이유 한 줄 ⑥ 메인 세션 메모: push 하면 webapp 프로덕션 배포가 일어나지만 화면 변화는 0 이다.
</output>
