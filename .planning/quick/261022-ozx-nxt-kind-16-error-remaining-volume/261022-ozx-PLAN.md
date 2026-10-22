---
phase: quick-261022-ozx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/accum-signal.ts
  - packages/shared/src/strategy-event.ts
  - packages/shared/src/__tests__/accum-signal.test.ts
  - webapp/src/components/trading/workbench/accum-strip.tsx
  - webapp/src/components/trading/__tests__/accum-strip.test.tsx
  - webapp/src/lib/__tests__/accum-list.test.ts
autonomous: true
requirements: [OZX-MAP, OZX-COL, OZX-CLARIFY, OZX-TEST]

estimate:
  tokens: 50000
  raw_tokens: 50000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "kind 16 행의 errorVolume 은 AccumSignal.nxtBuyKrw, remainingVolume 은 AccumSignal.nxtSellKrw 로 값 보정 없이 그대로 옮겨진다. 옛 행(두 칸 0 · message 꼬리 없음)은 0 · 0 이다"
    - "message 끝 `|nxt=…` 꼬리는 읽지 않는다 — 꼬리 값이 칸과 달라도 nxtBuyKrw · nxtSellKrw 는 칸 값이고, 꼬리가 붙어도 sinceDate · regTime · thMaxMcapKrw 는 전과 같게 풀린다"
    - "작업대 「매집」 패널 펼친 표에서 「팀 순매수」 바로 다음 열이 「NXT 순매수」이고, 값은 nxtBuyKrw − nxtSellKrw 를 팀 순매수와 같은 억 포맷(fmtEok signed) · 같은 부호 색(netClass)으로 보인다. 0(옛 행 · NXT 없는 종목)은 팀 순매수 0 과 똑같이 「0.0억」 flat 색이고, 청산 행은 팀 순매수처럼 부호 색이 없다"
    - "「팀 순매수」 머리 title 이 「KRX+NXT 합산」 이고(열 이름은 그대로), 칩 title 은 「… · 팀 순매수(KRX+NXT) +12.3억 · NXT 순매수 +0.5억 · 평단 …」 순서다. 칩에 보이는 글자(이름 · 팀 순매수 · 배지)는 바뀌지 않는다"
    - "작업대 본문 <700(wb) 밴드에서 NXT 순매수 열은 평단 · 구간 · 순수량 · 갱신 열처럼 접히고(hidden · @min-[700px]/wb:table-cell), 종목 셀 보조 줄 끝에 「 · NXT ±x.x억」 이 붙는다"
    - "NXT 수량은 타입 · 표 · title · 보조 줄 어디에도 없다(사용자 결정 — 금액만)"
  artifacts:
    - path: "packages/shared/src/accum-signal.ts"
      provides: "AccumSignal.nxtBuyKrw · nxtSellKrw + 매퍼 2줄 + 머리 주석(합산 · NXT 두 칸 · nxt 꼬리 미사용)"
      contains: "nxtBuyKrw: row.errorVolume"
    - path: "packages/shared/src/strategy-event.ts"
      provides: "kind 16 칸 재해석 주석에 errorVolume=nxt_buy_krw · remainingVolume=nxt_sell_krw · 합산 · `|nxt=` 꼬리(읽지 않음)"
      contains: "errorVolume=nxt_buy_krw"
    - path: "webapp/src/components/trading/workbench/accum-strip.tsx"
      provides: "AccumView.nxtNet · 표 「NXT 순매수」 열(data-col=nxt · colNarrow) · 머리 title · 칩 title · 보조 줄 · 12열 주석"
      contains: "data-col=\"nxt\""
    - path: "packages/shared/src/__tests__/accum-signal.test.ts"
      provides: "NXT 칸 매핑 · 꼬리 미사용 · 옛 행 0 단언"
    - path: "webapp/src/components/trading/__tests__/accum-strip.test.tsx"
      provides: "NXT 순매수 열 위치 · 값 · 색 · 0 · 청산 · 밴드 접기 · 보조 줄 · title 단언"
  key_links:
    - from: "packages/shared/src/accum-signal.ts accumSignalOf"
      to: "StrategyEventRow.errorVolume / remainingVolume (strategy-event.ts 매퍼 :317-318 — 이미 Number 화)"
      via: "nxtBuyKrw: row.errorVolume · nxtSellKrw: row.remainingVolume"
      pattern: "nxtSellKrw: row\\.remainingVolume"
    - from: "webapp/src/components/trading/workbench/accum-strip.tsx views memo"
      to: "AccumTable 의 data-col=\"nxt\" 셀 · chipTitle · 보조 줄"
      via: "AccumView.nxtNet = sig.nxtBuyKrw − sig.nxtSellKrw"
      pattern: "nxtNet"
    - from: "webapp (빌드된 @gh-radar/shared dist)"
      to: "packages/shared/src/accum-signal.ts"
      via: "webapp 은 packages/shared/dist 를 읽는다(git 미추적 · ignore) — webapp 테스트 · 타입체크 전 반드시 `pnpm --filter @gh-radar/shared build`"
      pattern: "@gh-radar/shared"
---

<objective>
gh-trade Phase 37(인박스 `docs/inbox/from-gh-trade/261022-accum-nxt-team-burst.md`)로 kind 16 `AccumSignal` 저널 행의 0 고정 두 칸이 NXT 팀 금액을 싣는다 — `error_volume` = NXT 팀 매수 금액(`nxt_buy_krw`), `remaining_volume` = NXT 팀 매도 금액(`nxt_sell_krw`). 기존 buy_*/sell_*(따라서 netKrw · 평단 · netQty)는 이제 KRX+NXT 합산이다. 이 플랜은 그 두 칸을 `AccumSignal` 에 이름으로 풀고, 작업대 「매집」 패널 표에 「NXT 순매수」 열을 「팀 순매수」 바로 다음에 세운다.

사용자 결정(오케스트레이터 전달 · 고정): NXT 는 **금액만** 다룬다 — NXT 수량 필드를 만들지 않고 message 의 `|nxt=` 꼬리를 파싱하지 않는다.

Purpose: 트레이더가 매집 종목의 팀 순매수 가운데 NXT 몫을 작업대에서 바로 본다. 「팀 순매수」 가 합산값임을 title 로 분명히 한다.
Output: shared 타입 · 매퍼 · 주석 갱신, 작업대 표 12열, 단위 테스트(shared · webapp), 타입체크 · 린트 통과, 경로 지정 커밋.

범위 밖(건드리지 않는다): relay(생성물 재동기화는 gh-trade 가 따로 · `relay/src/generated/**` 포함) · DB/마이그레이션 · server · `/analytics/**` 페이지 · NXT 수량 · `|nxt=` 파싱 · 인박스 노트(오케스트레이터가 닫는다 — 실행자는 노트를 수정 · 커밋하지 않는다).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@docs/inbox/from-gh-trade/261022-accum-nxt-team-burst.md
@packages/shared/src/accum-signal.ts
@webapp/src/components/trading/workbench/accum-strip.tsx

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 뽑아 둔 계약. -->

packages/shared/src/accum-signal.ts (177줄)
- 머리 주석 :1-15 — 「칸이 정본이다 — message 는 칸에 없는 값(since · reg · th 세 번째 조각)만 읽고 st/end/cyc/carry/row/our/warn 는 칸과 대조하지 않는다」(:6-7) · 「입력은 이미 숫자화된 StrategyEventRow … 값 보정이 없다」(:13).
- `export type AccumSignal` :22-80 — buyQty :39 · buyKrw :40 · sellQty :41 · sellKrw :42 · netQty :43 · netKrw :44-45(「팀 순매수 금액(매수 − 매도 · 음수 가능)」) · avgPx :46-47.
- `accumSignalOf(row)` :133-176 — 순수 이름 바꾸기. netKrw 는 파생이 아니라 칸(`netKrw: row.condThreshold` :155)이다.
- `parseAccumMessage` :97-106 — split("|") + k=v Map. 새 nxt 키는 무시된다(코드 변경 없음).

packages/shared/src/strategy-event.ts
- kind 16 문서 주석 :58-73(`AccumSignal: 16` :74 위). 「칸 재해석(…):」 목록은 `a=b · c=d` 꼴(예: `limitBidQty=buy_krw · bid1Qty=sell_krw`). message 꼴 줄 :72 `message=\`since=YYYYMMDD|reg=HHMMSS|…|th=<net>/<same>/<mcap>|warn=<0|1>\``.
- 행 매퍼 :317-318 `errorVolume: Number(r.error_volume)` · `remainingVolume: Number(r.remaining_volume)` — 이미 숫자. 변경 없음.

webapp/src/lib/teamflow-report.ts (변경 없음 · 사용만)
- `fmtEok(won, { signed: true })` — 0 → 「0.0억」 · 50_000_000 → 「+0.5억」 · −250_000_000 → 「−2.5억」(U+2212). 1_230_000_000 → 「+12.3억」.
- `toneOf(won)` → 'up' | 'down' | 'flat'(억 1자리 반올림 0 이면 flat). accum-strip 의 `netClass(won)` = TONE_CLASS[toneOf(won)] → `text-[var(--up|down|flat)]`.

webapp/src/components/trading/workbench/accum-strip.tsx (608줄)
- 머리 주석 :3-29(:4 「「더보기」 11열 표」 · ② :14 거래소 미표시 · ⑦ :26-27 팀 수익률 · ⑧ :28).
- `interface AccumView` :90-106 · views memo :182-210(여기서 파생 값 계산 — profit :206 이 선례).
- `chipTitle(v)` :330-335 — 「${head} · 팀 순매수 ${fmtEok(netKrw)} · 평단 … · 구간 … · 갱신 …${warn}」.
- 칩 `AccumChip` :382-429 — :389 `fmtNet` · :413 순매수 span(모든 밴드 · 폰 전용 줄이 아님).
- `AccumTable` :433-608 — 주석 :433-437(11열 · <700 접기 규칙) · `colNarrow = 'hidden @min-[700px]/wb:table-cell'` :447 · th/td 클래스 :448-450(모두 whitespace-nowrap) · 머리 :456-468(팀 순매수 :459 → 평단 :460) · 보조 줄 :520-526(`${clock} · 평단 ${avg} · ${band}` · `mono block truncate` · `@min-[700px]/wb:hidden`) · 팀 순매수 셀 :532-534(`cn(td, 'mono text-right font-bold', !ended && netClass(v.sig.netKrw))`).
- 표는 CSS grid 가 아니라 HTML `<table>`(shadcn `Table` → `.tbl-wrap relative w-full overflow-x-auto`). 격자 템플릿 문자열은 없다 — 폭 방어는 th/td whitespace-nowrap + colNarrow 접기 + 컨테이너 가로 스크롤뿐이다. 밴드 경계(700 · wb)는 globals.css §2.2b 정본, 새 경계를 만들지 않는다.
- `TableHead` 는 `React.ComponentProps<"th">` 를 그대로 넘긴다 → `title` prop 사용 가능. 내용이 있으므로 columnheader 접근 이름은 여전히 글자(「팀 순매수」).

AccumSignal 객체 리터럴 픽스처(필드 추가 시 타입체크가 깨지는 곳 — webapp tsconfig include = src/**):
- packages/shared/src/__tests__/accum-signal.test.ts :69-107 `toEqual({...})`(전체 필드) · 행 픽스처 `accumRow` :16-63(errorVolume :51 · remainingVolume :52 = 0)
- webapp/src/components/trading/__tests__/accum-strip.test.tsx `sig()` :50-90
- webapp/src/lib/__tests__/accum-list.test.ts 픽스처 :~40-75(thMaxMcapKrw: null :72)
- 그 밖(trading-workbench · use-accum-signals 테스트 · server · relay · e2e)은 AccumSignal 리터럴을 만들지 않는다(grep 확인).
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — kind 16 error/remaining_volume → AccumSignal.nxtBuyKrw/nxtSellKrw → 작업대 표 「NXT 순매수」 열(한 경로)</name>
  <files>packages/shared/src/accum-signal.ts, packages/shared/src/__tests__/accum-signal.test.ts, webapp/src/components/trading/workbench/accum-strip.tsx, webapp/src/components/trading/__tests__/accum-strip.test.tsx, webapp/src/lib/__tests__/accum-list.test.ts</files>
  <behavior>
    - shared: 행 errorVolume 312_000_000 · remainingVolume 87_000_000 → nxtBuyKrw 312_000_000 · nxtSellKrw 87_000_000(바뀌어 들어가면 실패)
    - shared: message 에 `|nxt=1/2/3/4` 꼬리(칸과 다른 값)가 붙어도 nxtBuyKrw · nxtSellKrw 는 칸 값이고 sinceDate '2026-10-16' · regTime '10:15:23' · thMaxMcapKrw 500_000_000_000 그대로
    - shared: 옛 행(errorVolume 0 · remainingVolume 0 · 꼬리 없는 NOTE_MESSAGE) → nxtBuyKrw 0 · nxtSellKrw 0 · buyKrw/sellKrw/netKrw 는 칸 그대로
    - webapp: sig({ nxtBuyKrw: 80_000_000, nxtSellKrw: 30_000_000 }) 표를 펼치면 columnheader 글자 순서에서 「NXT 순매수」 가 「팀 순매수」 바로 다음 · 행의 [data-col="nxt"] 글자 「+0.5억」 · 클래스에 text-[var(--up)]
  </behavior>
  <action>
1) packages/shared/src/accum-signal.ts — `AccumSignal` 타입에 필드 2개를 `netKrw` 바로 뒤(avgPx 앞)에 추가한다: `nxtBuyKrw: number`(문서: 「NXT 팀 매수 금액(원) — buyKrw 안에 든 NXT 몫 · 칸 errorVolume · gh-trade Phase 37 · 옛 행 0」), `nxtSellKrw: number`(문서: 「NXT 팀 매도 금액(원) — sellKrw 안에 든 NXT 몫 · 칸 remainingVolume · 옛 행 0」). `netKrw` 문서 끝에 「· KRX+NXT 합산」 을 붙이고, buyQty 위에 한 줄 문서 「buy_* · sell_* · net_* · 평단은 KRX+NXT 합산(gh-trade Phase 37 부터)」 를 단다. `accumSignalOf` 반환 객체에서 `netKrw: row.condThreshold,` 바로 다음 줄에 `nxtBuyKrw: row.errorVolume,` · `nxtSellKrw: row.remainingVolume,` 를 넣는다(값 보정 없음 — 입력이 이미 Number 화됨). 파생 NXT 순매수는 타입에 넣지 않는다(재량 결정: 이 매퍼는 순수 이름 바꾸기이고 netKrw 도 파생이 아니라 칸이다 — 파생은 화면이 한다). message 의 nxt 키는 조회하지 않는다(사용자 결정 — 금액은 칸이 정본, 수량은 쓰지 않음). NXT 수량 필드는 만들지 않는다. 머리 주석 갱신은 Task 2 가 한다.

2) packages/shared/src/__tests__/accum-signal.test.ts — `accumRow` 기본값 errorVolume 0 → 312_000_000, remainingVolume 0 → 87_000_000(픽스처의 다른 어떤 값과도 겹치지 않는다 — 「43칸이 모두 서로 다른 값」 주석이 이제 참). 첫 `toEqual` 기대 객체에 `nxtBuyKrw: 312_000_000, nxtSellKrw: 87_000_000` 를 netKrw 다음에 추가. 같은 describe 에 테스트 2개 추가: (a) 「NXT 칸 — errorVolume = NXT 매수 금액 · remainingVolume = NXT 매도 금액 · message 의 nxt 꼬리는 읽지 않는다」 — message 를 NOTE_MESSAGE 에 `|nxt=1/2/3/4` 를 이어 붙인 값으로 주고 behavior 의 단언 전부. (b) 「옛 행 — 두 칸 0 · 꼬리 없음 → 0 · 0」 — errorVolume 0 · remainingVolume 0 · message NOTE_MESSAGE 로 nxt 두 값 0 과 buyKrw 1_518_000_000 · sellKrw 284_000_000 · netKrw 1_234_000_000 그대로임을 단언.

3) 타입체크용 픽스처 — webapp/src/components/trading/__tests__/accum-strip.test.tsx 의 `sig()` 와 webapp/src/lib/__tests__/accum-list.test.ts 의 AccumSignal 픽스처에 `nxtBuyKrw: 0, nxtSellKrw: 0,` 를 추가한다(webapp tsconfig 가 src/** 를 포함하므로 빠지면 타입체크가 깨진다 — accum-list.test.ts 는 이 두 줄 말고 건드리지 않는다).

4) webapp/src/components/trading/workbench/accum-strip.tsx —
   a. `AccumView` 에 `nxtNet: number` 추가(문서: 「NXT 팀 순매수 금액(원) = nxtBuyKrw − nxtSellKrw · 팀 순매수(netKrw · KRX+NXT 합산) 안에 든 NXT 몫」). views memo 반환 객체에서 `profit` 옆에 `nxtNet: sig.nxtBuyKrw - sig.nxtSellKrw` 를 계산한다.
   b. `AccumTable` 머리 — 「팀 순매수」 TableHead(:459) 바로 다음에 `<TableHead scope="col" className={cn(th, colNarrow, 'text-right')}>NXT 순매수</TableHead>` 를 넣는다(평단 앞).
   c. `AccumTable` 행 — 팀 순매수 셀(:532-534) 바로 다음에 `data-col="nxt"` TableCell 을 넣는다. className 은 팀 순매수 셀과 같은 포맷 · 색 규칙에 colNarrow 만 더한다: `cn(td, colNarrow, 'mono text-right font-bold', !ended && netClass(v.nxtNet))`, 내용 `fmtEok(v.nxtNet, { signed: true })`. 0(옛 행 · NXT 없는 종목)은 팀 순매수 0 과 똑같이 fmtEok 가 내는 「0.0억」 + flat 색 — 새 자리표시(빈 칸 · 대시)를 만들지 않는다. 열이 <700 에서 접히는 이유: 폰 밴드는 이미 7열이라 한 열 더하면 가로 스크롤이 늘어난다(평단 · 구간 · 순수량 · 갱신과 같은 보조 열 대우). 접힌 밴드의 보조 줄 표기는 Task 2.

5) webapp/src/components/trading/__tests__/accum-strip.test.tsx — 새 describe 「AccumStrip — NXT 순매수 (quick-261022-ozx)」 를 ⑩ describe 앞에 만들고 behavior 의 webapp 단언을 테스트 1개로 쓴다(머리 순서는 `screen.getAllByRole('columnheader')` 의 textContent 배열에서 indexOf('NXT 순매수') === indexOf('팀 순매수') + 1).

이 태스크가 끝나면 커밋한다 — 이 태스크 파일 5개만 경로 지정 `git add`(절대 `git add -A` · `git add .` 금지 — 다른 세션이 같은 트리를 쓴다). 커밋 메시지는 한글, 제목 `feat(quick-261022-ozx): 매집 표 NXT 순매수 열 — kind 16 error/remaining_volume → nxtBuyKrw/nxtSellKrw`, Co-Authored-By 트레일러를 넣지 않는다(사용자 규칙). push 하지 않는다(push = webapp 프로덕션 배포 — 메인 세션 몫). 커밋 직전 `git status -sb` 로 브랜치(master)와 스테이징 범위를 다시 확인한다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/accum-signal.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/accum-strip.test.tsx src/lib/__tests__/accum-list.test.ts --maxWorkers=2 && grep -q 'nxtBuyKrw: row.errorVolume' packages/shared/src/accum-signal.ts && grep -q 'nxtSellKrw: row.remainingVolume' packages/shared/src/accum-signal.ts && grep -q 'data-col="nxt"' webapp/src/components/trading/workbench/accum-strip.tsx && grep -q 'nxtNet: sig.nxtBuyKrw - sig.nxtSellKrw' webapp/src/components/trading/workbench/accum-strip.tsx</automated>
  </verify>
  <done>shared 빌드 · accum-signal 테스트(기존 + NXT 2건) · accum-strip/accum-list 테스트 통과. kind 16 행의 두 칸이 AccumSignal 이름으로 풀리고, 펼친 표에서 「팀 순매수」 다음 열에 nxtBuyKrw − nxtSellKrw 가 팀 순매수와 같은 포맷 · 색으로 보인다. 5개 파일만 담은 feat 커밋 1개(한글 · 트레일러 없음 · push 안 함).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 확장 — 합산 표기(머리 title · 칩 title) · 폰 보조 줄 · 0/청산/음수 · 계약 주석 · 타입체크 · 린트</name>
  <files>webapp/src/components/trading/workbench/accum-strip.tsx, webapp/src/components/trading/__tests__/accum-strip.test.tsx, packages/shared/src/accum-signal.ts, packages/shared/src/strategy-event.ts</files>
  <behavior>
    - 기본 sig()(NXT 0) → [data-col="nxt"] 「0.0억」 + text-[var(--flat)] · 클래스에 hidden 과 @min-[700px]/wb:table-cell
    - nxtBuyKrw 10_000_000 · nxtSellKrw 260_000_000 → 「−2.5억」 + text-[var(--down)]
    - 청산 행(state 3 · endReason 1) + NXT +0.5억 → 글자 「+0.5억」 · 클래스에 text-[var(--up)] 없음
    - 「팀 순매수」 columnheader title === 'KRX+NXT 합산' · 「NXT 순매수」 columnheader title 에 '팀 순매수에 포함'
    - 칩 title 에 '팀 순매수(KRX+NXT) +12.3억 · NXT 순매수 +0.5억 · 평단 10,120' 이 들어 있고, 칩 안 보이는 글자에는 NXT 가 없다(within(chip).queryByText(/NXT/) === null)
    - 보조 줄 = '10:16:05 · 평단 10,120 · 9,900~10,300 · NXT 0.0억'(기본) · NXT +0.5억 행은 ' · NXT +0.5억' 으로 끝남
  </behavior>
  <action>
1) webapp/src/components/trading/workbench/accum-strip.tsx —
   a. 합산 표기(열 이름은 바꾸지 않는다): 「팀 순매수」 TableHead 에 `title="KRX+NXT 합산"`, 「NXT 순매수」 TableHead 에 `title="NXT 팀 매수 − 매도 금액 · 팀 순매수에 포함"`.
   b. `chipTitle` — 「팀 순매수 ${…}」 를 「팀 순매수(KRX+NXT) ${fmtEok(v.sig.netKrw, { signed: true })} · NXT 순매수 ${fmtEok(v.nxtNet, { signed: true })}」 로 바꾸고 그 뒤 「 · 평단 …」 이하 · 매도경보 꼬리는 그대로 둔다. 함수 위 주석의 title 꼴 설명도 같이 고친다. 칩의 보이는 글자(:389 fmtNet · :413 순매수 span)는 바꾸지 않는다 — 칩은 폰 전용 줄이 아니라 모든 밴드의 스트립이고(max-w-[18rem] · 이름 8rem 잘림), NXT 0 종목마다 「0.0억」 이 붙으면 칩이 좁아진다. 오케스트레이터가 말한 「mobile line(:389 · :413)」 은 이 파일에서 폰 밴드 전용 줄인 보조 줄(accum-row-subline)로 해석한다(아래 c) — 요약에 이 해석을 적는다.
   c. 폰 보조 줄(:520-526) — 글자 끝에 「 · NXT ${fmtEok(v.nxtNet, { signed: true })}」 를 붙인다(예: 「10:16:05 · 평단 10,120 · 9,900~10,300 · NXT +0.5억」). 클래스는 그대로(mono block truncate · @min-[700px]/wb:hidden). 바로 위 JSX 주석을 「숨긴 갱신 · 평단 · 구간 · NXT 순매수 열의 사실」 로 고친다.
   d. 주석 — 파일 머리 :4 「11열 표」 → 「12열 표」. 머리에 ⑨ 항목 추가: 「⑨ NXT 순매수(quick-261022-ozx · 인박스 261022-accum-nxt-team-burst · gh-trade Phase 37) — 팀 순매수 바로 다음 열 · 값 = nxtBuyKrw − nxtSellKrw(kind 16 error_volume − remaining_volume) · 팀 순매수와 같은 억 포맷 · 부호 색 · 0(옛 행 · NXT 없는 종목)은 「0.0억」 그대로. 팀 순매수(netKrw)는 KRX+NXT 합산 — 열 이름 대신 머리 · 칩 title 로 알린다. <700 에서 접히고 보조 줄 끝에 「NXT ±x.x억」. 거래소 표시(②)가 아니다 — 행 exchange 는 여전히 KRX. 금액만(수량 없음 · 사용자 결정).」 `AccumTable` 위 주석(:433-437)을 12열 목록(종목 · 현재가 · 등락률 · 팀 순매수 · NXT 순매수 · 평단 · 팀 수익률 · 매집 구간 · 순수량 · 상태 · 갱신 · 액션)과 <700 숨김 목록(NXT 순매수 · 평단 · 구간 · 순수량 · 갱신) · 보조 줄 꼴 「HH:MM:SS · 평단 N · lo~hi · NXT ±x.x억」 로 고친다. :431 구획 주석 「11열」 → 「12열」.

2) webapp/src/components/trading/__tests__/accum-strip.test.tsx —
   a. 기존 ③ 접기 테스트(:231 「평단 · 구간 · 순수량 · 갱신 열은 <700 숨김 …」): 열 루프 배열에 'nxt' 를 더하고, 보조 줄 기대값을 '10:16:05 · 평단 10,120 · 9,900~10,300 · NXT 0.0억' 으로 바꾸고, 테스트 이름에 NXT 순매수를 넣는다.
   b. Task 1 의 「NXT 순매수」 describe 에 behavior 의 나머지 단언을 테스트 3~4개로 추가한다(0 · 음수 · 청산 / 머리 title / 칩 title + 칩 글자에 NXT 없음 / 비 0 보조 줄 끝).
   c. 파일 머리 「잠그는 것」 목록에 ⑪ 「NXT 순매수(quick-261022-ozx) — 팀 순매수 다음 열 · nxtBuyKrw − nxtSellKrw · 같은 억 포맷 · 부호 색 · 0 「0.0억」 · 청산 무색 · <700 접힘 + 보조 줄 끝 · 머리 title 「KRX+NXT 합산」 · 칩 title 「팀 순매수(KRX+NXT) … · NXT 순매수 …」 · 칩 글자 무변경」 을 추가하고, ③ 의 colNarrow 목록에 NXT 순매수를 더한다.

3) packages/shared/src/accum-signal.ts 머리 주석(:1-15) — 문단 추가: 「quick-261022-ozx — 인박스 `261022-accum-nxt-team-burst`(gh-trade Phase 37 · NXT 팀 주문 합산): buy_* · sell_*(따라서 netKrw · netQty · avgPx)는 KRX+NXT 합산이고 exchange 는 "KRX" 그대로(뜻만 합산 포지션). 0 고정이던 두 칸이 NXT 몫 금액이다 — errorVolume = nxt_buy_krw → `nxtBuyKrw` · remainingVolume = nxt_sell_krw → `nxtSellKrw`(옛 행 0). message 끝 `|nxt=<buy_krw>/<sell_krw>/<buy_qty>/<sell_qty>` 는 읽지 않는다 — 금액은 칸이 정본이고 수량은 쓰지 않는다(사용자 결정).」 그리고 :6-7 「st/end/cyc/carry/row/our/warn 는 칸과 대조하지 않는다」 목록에 nxt 를 더한다.

4) packages/shared/src/strategy-event.ts kind 16 문서 주석(:58-73) — 「칸 재해석」 목록 끝(condMetric 항목 뒤)에 「· errorVolume=nxt_buy_krw · remainingVolume=nxt_sell_krw(gh-trade Phase 37 · NXT 팀 주문 몫 금액 · 옛 행 0 · 인박스 261022-accum-nxt-team-burst)」 를 붙이고, 한 줄 「buy_*/sell_*/net_* 는 KRX+NXT 합산 · exchange "KRX" 는 합산 포지션 뜻」 을 더한다. message 꼴 줄 끝에 「[|nxt=<buy_krw>/<sell_krw>/<buy_qty>/<sell_qty>](Phase 37 부터 · 읽지 않음)」 을 덧붙인다. 코드(매퍼 :317-318)는 바꾸지 않는다.

5) 검증을 돌린 뒤 이 태스크 파일 4개만 경로 지정 `git add` 로 커밋한다(절대 -A · . 금지 · 커밋 직전 `git status -sb` 재확인). 한글 메시지, 제목 `feat(quick-261022-ozx): 매집 패널 팀 순매수 합산 표기 · NXT 칩 title · 폰 보조 줄 · kind 16 계약 주석`, Co-Authored-By 없음, push 안 함. 인박스 노트 `docs/inbox/from-gh-trade/261022-accum-nxt-team-burst.md` 는 수정 · 스테이징하지 않는다(오케스트레이터가 닫는다).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared typecheck && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/accum-signal.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/accum-strip.test.tsx src/lib/__tests__/accum-list.test.ts src/lib/__tests__/use-accum-signals.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp exec eslint src/components/trading/workbench/accum-strip.tsx src/components/trading/__tests__/accum-strip.test.tsx src/lib/__tests__/accum-list.test.ts && grep -qF '팀 순매수(KRX+NXT)' webapp/src/components/trading/workbench/accum-strip.tsx && grep -qF 'title="KRX+NXT 합산"' webapp/src/components/trading/workbench/accum-strip.tsx && grep -qF 'errorVolume=nxt_buy_krw' packages/shared/src/strategy-event.ts && grep -qF 'remainingVolume=nxt_sell_krw' packages/shared/src/strategy-event.ts && grep -q 'quick-261022-ozx' packages/shared/src/accum-signal.ts && ! grep -qF 'get("nxt")' packages/shared/src/accum-signal.ts && ! grep -qE 'nxt(Buy|Sell)Qty' packages/shared/src/accum-signal.ts webapp/src/components/trading/workbench/accum-strip.tsx && test "$(grep -c '12열' webapp/src/components/trading/workbench/accum-strip.tsx)" -ge 3</automated>
  </verify>
  <done>shared 빌드 · 타입체크, shared/webapp 관련 테스트 4묶음, webapp 타입체크(e2e tsconfig 포함), eslint 통과. 「팀 순매수」 가 합산임을 머리 · 칩 title 이 말하고, NXT 순매수가 폰 밴드 보조 줄에도 있고, 0 · 음수 · 청산이 팀 순매수와 같은 규칙으로 보인다. 계약 주석 2곳이 NXT 두 칸 · 합산 · 꼬리 미사용을 적는다. 4개 파일만 담은 feat 커밋 1개(한글 · 트레일러 없음 · push 안 함).</done>
</task>

</tasks>

<threat_model>
security_enforcement=false(.planning/config.json · 사용자 결정 「보안검사 안 함」) — STRIDE 등록부 생략. 이 변경은 신뢰 경계를 새로 만들지 않는다(이미 RLS · RPC 를 지난 kind 16 칸 2개를 표시만 · 새 입력 · 새 호출 · 새 패키지 없음).
</threat_model>

<verification>
- Task 1 · Task 2 의 `<automated>` 가 모두 0 으로 끝난다.
- 커밋 범위(다른 세션이 같은 트리를 써도 이 플랜 커밋만 본다): `F=$(git log -E --format= --name-only --grep='^feat\(quick-261022-ozx\)' -- packages webapp relay server supabase docs) && test -n "$F" && ! printf '%s\n' "$F" | grep -v '^$' | grep -qvE '^(packages/shared/src/(accum-signal|strategy-event)\.ts|packages/shared/src/__tests__/accum-signal\.test\.ts|webapp/src/components/trading/workbench/accum-strip\.tsx|webapp/src/components/trading/__tests__/accum-strip\.test\.tsx|webapp/src/lib/__tests__/accum-list\.test\.ts)$'`
- 트레일러 없음: `B=$(git log -E --format=%B --grep='^feat\(quick-261022-ozx\)') && test -n "$B" && ! printf '%s\n' "$B" | grep -qi 'co-authored-by'`
- 실행 시점에 인박스 노트는 실행자가 건드리지 않았다: `grep -q '^status: open' docs/inbox/from-gh-trade/261022-accum-nxt-team-burst.md && git diff --quiet HEAD -- docs/inbox/from-gh-trade/261022-accum-nxt-team-burst.md`(오케스트레이터가 닫은 뒤에는 이 줄을 다시 돌리지 않는다).
- push 하지 않았다: `git status -sb` 첫 줄에 `ahead` 가 남아 있다(배포는 메인 세션 — DB/relay 변경이 없으므로 순서 제약 없음, webapp push 만).
</verification>

<success_criteria>
- kind 16 행 errorVolume · remainingVolume → AccumSignal.nxtBuyKrw · nxtSellKrw(옛 행 0 · `|nxt=` 꼬리 미사용) — shared 테스트가 잠근다.
- 작업대 「매집」 표 12열: 「팀 순매수」 바로 다음 「NXT 순매수」 = nxtBuyKrw − nxtSellKrw, 같은 억 포맷 · 부호 색, 0 「0.0억」, 청산 무색, <700 접힘 + 보조 줄 끝 표기 — webapp 테스트가 잠근다.
- 「팀 순매수」 가 KRX+NXT 합산임을 머리 title · 칩 title 이 알린다. 칩 보이는 글자 무변경. NXT 수량 없음.
- shared · webapp 타입체크 · eslint 통과, feat 커밋 2개(허용 6파일만 · 한글 · 트레일러 없음 · push 없음).
</success_criteria>

<output>
Create `.planning/quick/261022-ozx-nxt-kind-16-error-remaining-volume/261022-ozx-SUMMARY.md` when done. 요약에 적을 것: (1) 파생 NXT 순매수를 타입이 아닌 AccumView 에 둔 이유, (2) 「mobile line」 을 칩이 아닌 폰 보조 줄로 해석한 이유와 칩 title 에만 NXT 를 넣은 점, (3) 0 표기를 팀 순매수 규칙(「0.0억」)에 맞춘 점, (4) 표가 grid 가 아닌 table(가로 스크롤 컨테이너)이라 템플릿 갱신이 없고 colNarrow 로 폰 밴드 열 수를 유지한 점, (5) 인박스 질문 1(NXT 수량 칸 필요?)에 대한 사용자 결정 = 금액만 — 오케스트레이터가 노트 답에 옮긴다.
</output>
