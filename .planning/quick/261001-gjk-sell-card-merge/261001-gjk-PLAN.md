---
phase: quick-261001-gjk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
autonomous: true
requirements: [GJK-01, GJK-02, GJK-03, GJK-04]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "상따 화면 매도 열(pane sell)의 그룹 카드는 「매도주문」 → 「매수취소」 두 장이다. 제목줄 없는 매도 가격 묶음 카드는 더 없다 (GJK-01)"
    - "「매도주문」 카드는 제목줄(제목 · 상태 문구 · 매도주문 켜기 스위치, 스위치는 제목줄 오른쪽 끝) 아래로 주문가격 → 비교가격 → 매도비율 → 매수잔량 → ○잔량추적 → ○체결 순서이고, 서버가 매도 진입을 래치했을 때만 「잔량추적 기준선」 행이 카드 맨 끝에 붙는다 (GJK-02)"
    - "인라인 편집 Tab 은 매도주문 카드 안 값 행 6개(주문가격 · 비교가격 · 매도비율 · 매수잔량 · 잔량추적 % · 체결)를 위 순서로 돌고 체결 다음 Tab 이면 편집이 끝난다. 매수취소 카드로 넘어가지 않는다 (GJK-02)"
    - "동작은 그대로다 — 매도 에코 OFF 면 주문가격 · 매도비율 행도 opacity .45 한 겹으로 흐리고 누르면 편집이 열린다. 접근성 이름(「매도 주문가격 …」 · 「매도 매도비율 …」) · 시트 제목 · 범위(매도비율 1~100) · lc.set 으로 나가는 cfg 는 바뀌지 않는다 (GJK-03)"
    - "주문가격 · 매도비율 값 버튼도 이제 매도주문 카드의 설명(aria-describedby = 카드 제목 + 상태 문구)을 단다 — 「주문가격 …, 매도주문 감시 중」 (GJK-03)"
    - "모든 상따 그룹 카드는 제목줄을 갖는다 — 그룹 스펙의 제목은 필수이고, 헤더 없는 섹션용 접근성 이름 필드 · pt-1 패딩 분기 · 헤더 조건부 렌더가 코드에서 사라졌다 (GJK-04)"
  artifacts:
    - path: "webapp/src/components/trading/lc/lc-fields.ts"
      provides: "LC_SELL_GROUPS = [sell(매도주문 — 행 6 + 기준선), cancel] · LcGroupSpec.title 필수 · slot 합집합에서 옛 가격 묶음 제거"
      contains: "slot: 'sell'"
    - path: "webapp/src/components/trading/lc/setting-group.tsx"
      provides: "SettingGroup 이 제목줄을 늘 그리고 상단 패딩 pt-2.5 고정 · 값 버튼 설명 id 가 늘 정의됨"
    - path: "webapp/src/components/trading/limit-chaser-form.tsx"
      provides: "파일 머리 ① 의 매도 쪽 구성 설명이 새 카드 구성과 같다 · statusText/groupTitle 의 제목 유무 분기 제거"
  key_links:
    - from: "lc-fields.ts LC_SELL_GROUPS"
      to: "limit-chaser-form.tsx pane('sell', LC_SELL_GROUPS, …) → renderGroup → SettingGroup"
      via: "spec.rows.map(renderRow) — 스펙 행 순서가 곧 화면 행 순서"
      pattern: "pane\\('sell', LC_SELL_GROUPS"
    - from: "lc-fields.ts lcNavigableRows('sell')"
      to: "limit-chaser-form.tsx handleInlineNavigate"
      via: "lcRowByField(field).group.slot → 같은 카드 안 다음/이전 값 행"
      pattern: "lcNavigableRows\\(slot\\)"
---

<objective>
상따(limit-chaser) 트레이딩 화면 매도 열에서 제목줄 없는 「주문가격 · 매도비율」 카드와 그 아래 「매도주문」 카드를 **한 장의 「매도주문」 카드**로 합친다. 순서는 사용자가 정한 그대로다 — 매도주문 on/off(제목줄 그룹 스위치) → 주문가격 → 비교가격 → 매도비율 → 매수잔량 → 잔량추적 → 체결, 래치 때만 나오는 「잔량추적 기준선」은 카드 맨 끝. 매수취소 카드는 그대로 맨 아래다.

Purpose: 1단(두 열)에서 매수 열은 「매수주문」 카드 제목줄 → 주문가격 → 비교가격으로 시작하는데 매도 열은 제목줄 없는 가격 카드로 시작해 두 열의 높이 · 정렬이 어긋나 읽기 힘들다. 합치면 두 열 모두 「제목줄 → 주문가격 → 비교가격」으로 같은 줄에서 시작한다.

Output: 단일 원천 `lc-fields.ts` 의 매도 스펙 병합, 헤더 없는 섹션 렌더 경로 제거(유일한 소비자가 사라져 죽은 코드가 된다), 영향받는 vitest 4개 파일 갱신. e2e 스펙은 옛 slot · 접근성 이름을 참조하지 않는다(계획 시 grep 0건 확인) — 수정 없음, Task 2 의 grep 게이트로 다시 확인한다.

사용자 요청(원문 요지): 「매도옵션의 주문가격/매도비율 카드와 그 하단의 매도주문 카드를 합치자. 순서는 매도주문 on/off → 주문가격 → 비교가격 → 매도비율 → 매수잔량 → 잔량추적 → 체결.」 — GJK-01 · GJK-02 의 정본이다. 순서를 바꾸거나 일부만 옮기지 않는다.

Claude 재량(GJK-04): 합친 뒤 헤더 없는 그룹을 쓰는 스펙이 하나도 남지 않는다. 그 경로(그룹 제목 optional · 섹션 접근성 이름 필드 · pt-1 분기 · 헤더 조건부 렌더 · 설명 id undefined 분기)를 남기면 테스트로만 살아 있는 죽은 분기가 되므로 제거하고, 제목을 필수 필드로 좁혀 타입이 재발을 막게 한다. statusKey · dimGate · gate 의 optional 은 이번 범위 밖이라 그대로 둔다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# 현재 코드 (executor 가 읽을 것 — 범위만)
@webapp/src/components/trading/lc/lc-fields.ts
@webapp/src/components/trading/lc/setting-group.tsx

<interfaces>
<!-- 이미 존재하는 계약. 탐색 없이 그대로 쓴다. -->

lc-fields.ts (현재):
- `LcGroupSpec` — `slot` 합집합(7개, 옛 가격 묶음 포함) · `title?` · `ariaLabel?`(헤더 없는 섹션 전용) · `hint?` · `gate?` · `statusKey?` · `dimGate?` · `dimWhenOff: boolean` · `collapsible: boolean` · `headerCheck?` · `rows`.
- `LC_SELL_GROUPS` 현재 = [옛 가격 묶음(제목 · 게이트 없음, statusKey sell, dimGate sellEnabled, dimWhenOff false, 행 = sellOrderPrice(id lc-sell-order-price) · sellOrderRatio(id lc-sell-order-ratio, range 1~100)), sell(제목 매도주문, gate/statusKey/dimGate sellEnabled, dimWhenOff true, 행 = sellWatchPrice · sellWatchQty · checkValue sellQtyTrackEnabled/sellQtyTrackRatio · checkValue sellTradeQtyEnabled/sellMinTradeQty · derived sellQtyTrackBaseline), cancel].
- `lcNavigableRows(slot)` — 그 그룹의 value/checkValue 행을 스펙 순서대로. Tab 연속 편집이 이것만 쓴다(같은 카드 안).
- `lcRowDimOf(group, row, values)` — 행 흐림은 `group.dimGate` 만 본다(`dimWhenOff` 는 안 본다).
- `lcRowA11yNameOf` — 접두 = `row.a11yPrefix ?? group.title ?? ''`. 두 옮길 행은 `a11yPrefix: '매도'` 라 이름 불변.
- `lcRangeIssue` — ALL_GROUPS 행 순서로 첫 범위 위반을 고른다. 병합 뒤에도 sellOrderRatio(1~100)가 sellQtyTrackRatio(1~90)보다 앞이라 상대 순서 불변.

limit-chaser-form.tsx (현재):
- `renderGroup(spec)` 은 `dimRows={false}` 로 SettingGroup 을 부른다 → 컨테이너 흐림(`dimWhenOff`)은 쓰이지 않고, 매도주문 카드는 접기(fold)가 없어 요약 줄 흐림도 없다. 따라서 옮긴 두 행의 `dimWhenOff` false → true 변화는 화면에 영향 0.
- `statusText={spec.title ? statusOf(spec.statusKey) : undefined}` (1457행 부근) · CheckValueRow `groupTitle={group.title ?? ''}` (1391행 부근) · 파일 머리 ① 8~9행 「매도 쪽 = [주문가격 · 매도비율] → 매도주문 → 매수취소(맨 아래)」.
- `handleInlineNavigate` — `lcRowByField(field)?.group.slot` → `lcNavigableRows(slot)`.

setting-group.tsx (현재):
- `GroupTitleIdContext` JSDoc(128~136행) 끝 문장이 제목 없는 섹션을 말한다.
- `SettingGroup` JSDoc(346~364행) 첫 두 ★ 가 헤더 조건부 · pt-1(G-21-R3-5)을 말한다.
- 본문: `describedBy = spec.title ? … : undefined` · `aria-label={spec.ariaLabel}` · `spec.title ? 'pt-2.5' : 'pt-1'` · `{spec.title ? (<div data-slot="lc-group-header">…</div>) : null}`.
- CheckValueRow 는 `data-slot="lc-check-row"` 래퍼 안에 값 버튼(`data-lc-field={valueId}`)을 둔다 · DerivedRow 는 `data-slot="lc-derived"`.

테스트 헬퍼:
- setting-group.test.tsx: `groupOf(slot: LcGroupSpec['slot'])` · `idOf(row)`(value/checkValue → id, check → checkId, 그 밖 null).
- limit-chaser-form.test.tsx: `group(slot)` · `pane(side)` · `row(id)` · `opacityLayers(el)` · `props({ server: echo({...}), groupStatus })`.
- inline-navigation.test.tsx: `row(id)` · `input(id)` · `editingId()` · `key(el, 'Tab')` · `props({ tab: 'sell', server: echo({ sellEntryLatched: true }) })`.
</interfaces>
</context>

<!-- planner-discipline-allow: sell-price -->
<!-- planner-discipline-allow: 매도 가격 설정 -->
<!-- planner-discipline-allow: 가격 섹션 -->

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 매도주문 한 카드 — 스펙 병합 → 폼 렌더 · Tab 순서까지 한 경로 (GJK-01 · GJK-02 · GJK-03)</name>
  <files>webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/lc/__tests__/lc-fields.test.ts, webapp/src/components/trading/lc/__tests__/setting-group.test.tsx, webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx</files>
  <behavior>
    - lc-fields: `LC_SELL_GROUPS` slot 순서 = sell → cancel (옛 두 단언 줄 — lc-fields.test.ts 63행 · setting-group.test.tsx 60행 — 을 새 기대로)
    - setting-group 스펙: 매도주문 카드 행 kind = value · value · value · value · checkValue · checkValue · derived, idOf = lc-sell-order-price · lc-sell-watch-price · lc-sell-order-ratio · lc-sell-watch-qty · lc-sell-qty-track-ratio · lc-sell-min-trade-qty · null
    - setting-group 스펙: `lcNavigableRows('sell')` id = 위 6개 값 id 그대로(기준선 제외)
    - setting-group 스펙: 스위치 이름 테스트의 옛 가격 묶음 단언 3줄 → 매도주문 카드 제목 「매도주문」 · gate sellEnabled 단언으로 교체(테스트 제목의 「매도 가격 섹션은 제목 · 스위치 없음」 꼬리도 뺀다)
    - setting-group 렌더: 옛 「헤더 없음 · 접근성 이름」 테스트와 「제목 없는 묶음 pt-1」 it.each 를 지우고, 대신 「모든 그룹 카드(매수 4 + 매도 2)는 제목줄(lc-group-header)이 있고 section 에 aria-label 이 없으며 상단 패딩이 pt-2.5 다」 한 테스트를 둔다 — 헤더 없는 카드 재발 방지
    - setting-group ⑦ a11y: renderTwoColumns 의 세 번째(옛 가격 묶음) SettingGroup 을 지우고 주문가격 SettingRow(lc-sell-order-price · 127,400원)를 매도주문 SettingGroup 안 맨 앞으로 옮긴다. 「제목 없는 … 설명을 달지 않는다」 테스트는 「체크 버튼은 설명을 달지 않는다 · 매도주문 카드 안 주문가격 행은 카드 설명을 단다」로 바꿔 주문가격 버튼의 accessible description = 「매도주문 감시 중」을 단언한다
    - limit-chaser-form ⑦: 매도 pane 섹션 = lc-group-sell · lc-group-cancel. 옛 「매도 가격 … 접근성 이름」 테스트를 「매도주문 한 카드」 테스트로 교체 — 래치 에코(sellEntryLatched true)로 렌더하면 group('sell') 에 제목줄과 스위치 「매도주문 켜기」가 있고, lc-group-rows 직속 자식을 (자기 data-lc-field ?? 안쪽 [data-lc-field] 값 ?? data-slot) 로 읽으면 lc-sell-order-price · lc-sell-watch-price · lc-sell-order-ratio · lc-sell-watch-qty · lc-sell-qty-track-ratio · lc-sell-min-trade-qty · lc-derived 순서다
    - limit-chaser-form ⑩ 흐림: 매도 에코 OFF 테스트 제목을 「매도주문 행(주문가격 · 매도비율 포함)」으로 바꾸고 lc-sell-order-ratio 도 opacityLayers 1 을 단언한다
    - limit-chaser-form 44px 테스트: 행 수 25 는 그대로, 내역 주석만 「매도주문 4」로(옛 「매도 가격 2 · 매도주문 2」)
    - inline-navigation: 매도주문 Tab 테스트가 lc-sell-order-price 에서 시작해 lc-sell-order-price → lc-sell-watch-price → lc-sell-order-ratio → lc-sell-watch-qty → lc-sell-qty-track-ratio → lc-sell-min-trade-qty → null 이다(루프 상한을 7 로, 테스트 제목도 새 순서로)
  </behavior>
  <action>
RED 먼저 — 위 behavior 대로 테스트 4개 파일을 고친다(테스트 제목 · 주석은 한글, 주변 밀도에 맞춘다). 옛 가격 묶음을 가리키는 단언은 전부 새 구조 단언으로 바꾸고 삭제만 하지 않는다(재발 방지 테스트 1개 추가 포함). `cd webapp && npx vitest run` 으로 네 파일을 돌려 새 단언이 실패하는 것을 확인하고 실패 메시지 한 줄을 SUMMARY 용으로 적어 둔다.

GREEN — `lc-fields.ts` 의 `LC_SELL_GROUPS` 만 고친다(per 사용자 요청 ①②). 첫 원소(제목 없는 가격 묶음 그룹 객체)를 통째로 지우고, 그 안의 행 객체 두 개를 **필드 값 하나 바꾸지 않고**(id · label · unit · desc · a11yPrefix · range 그대로) `slot: 'sell'` 그룹의 rows 로 옮긴다 — 주문가격(sellOrderPrice) 행을 rows 맨 앞에, 매도비율(sellOrderRatio) 행을 비교가격(sellWatchPrice) 행 바로 뒤에 둔다. 결과 rows = 주문가격 · 비교가격 · 매도비율 · 매수잔량 · 잔량추적(checkValue) · 체결(checkValue) · 기준선(derived, 맨 끝 그대로). 매도주문 그룹 머리 속성(title 매도주문 · gate/statusKey/dimGate sellEnabled · dimWhenOff true · collapsible false)은 건드리지 않는다. 행 위 한 줄 주석이 필요하면 「주문가격 · 매도비율도 매도주문의 값이다(quick-261001-gjk — 제목줄 아래 한 카드)」 정도로 짧게.

이 Task 에서는 slot 합집합 · title optional · 섹션 접근성 이름 필드 · setting-group.tsx · limit-chaser-form.tsx 를 건드리지 않는다(Task 2 몫). 옮긴 행의 dimWhenOff 가 false → true 로 바뀌는 것은 화면 영향이 없다 — 폼이 dimRows={false} 로 컨테이너 흐림을 끄고 매도주문은 접기가 없으며, 행 흐림은 lcRowDimOf 가 dimGate(sellEnabled)만 보아 이전과 같다. lc.set cfg · lcRangeIssue 순서 · 접근성 이름 · 시트 제목도 불변이다(interfaces 참조).

다시 네 파일을 돌려 green 을 확인한 뒤, 경로 지정 스테이징(`git add` 에 위 5개 파일만)으로 커밋한다. 커밋 메시지 한글 · Co-Authored-By 트레일러 없음 · push 하지 않음. 예: 「refactor(quick-261001-gjk): 매도 주문가격·매도비율을 매도주문 카드로 합친다」. 커밋 직전 `git status -sb` 로 남의 미커밋 변경이 섞이지 않았는지 본다(동시 세션 경합 방지).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar/webapp && npx vitest run src/components/trading/lc/__tests__/lc-fields.test.ts src/components/trading/lc/__tests__/setting-group.test.tsx src/components/trading/lc/__tests__/inline-navigation.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx</automated>
  </verify>
  <done>네 테스트 파일이 green 이고, LimitChaserForm 렌더에서 매도 pane 이 「매도주문」(제목줄 + 행 6 + 래치 때 기준선) → 「매수취소」 두 카드이며, 인라인 Tab 이 새 6행 순서로 돈다. 커밋 1개(한글 · 트레일러 없음)가 master 에 있다.</done>
</task>

<task type="auto">
  <name>Task 2: 헤더 없는 섹션 경로 제거 · 제목 필수화 · 구성 설명 주석 정리 (GJK-04)</name>
  <files>webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/lc/setting-group.tsx, webapp/src/components/trading/limit-chaser-form.tsx</files>
  <action>
Task 1 로 헤더 없는 그룹 스펙이 하나도 남지 않았다. 그 전용 경로를 지우고 타입으로 재발을 막는다(Claude 재량 — objective 참조). 새로 쓰는 주석에는 옛 slot 이름 · 옛 섹션 접근성 이름 · 「가격 섹션」이라는 말을 쓰지 않는다(아래 grep 게이트가 주석까지 센다) — 필요하면 「헤더 없던 매도 주문가격 · 매도비율 묶음」처럼 개념으로 적는다.

lc-fields.ts —
(1) `LcGroupSpec.slot` 합집합에서 옛 가격 묶음 slot 을 뺀다(6개: buy · pre-buy · extra-buy · post-buy · sell · cancel).
(2) `title` 을 필수 필드로 바꾸고 JSDoc 을 「카드 제목 — 제목줄 · 값 버튼 설명(aria-describedby) · 체크 접근성 이름 접두가 쓴다. 모든 카드가 제목줄을 갖는다(quick-261001-gjk).」 취지로 고친다.
(3) 헤더 없는 섹션용 `ariaLabel` 필드와 그 JSDoc 을 지운다(headerCheck 안의 ariaLabel 은 다른 필드라 그대로 둔다).
(4) `statusKey` JSDoc 의 헤더 없는 묶음 ★ 줄, `dimGate` JSDoc 의 「게이트가 없지만 매도주문 게이트로 흐린다(R9)」 문장을 지운다.
(5) 파일 머리 ★ 첫 항목의 매도 쪽 문장을 「매도 쪽 = 「매도주문」 카드(주문가격 · 비교가격 · 매도비율 · 매수잔량 · ○잔량추적 · ○체결 · 접기 없음 — quick-261001-gjk 로 한 카드) → 매수취소(맨 아래).」 취지로 바꾼다.
(6) `lcRowA11yNameOf` 의 접두를 `row.a11yPrefix ?? group.title` 로(빈 문자열 폴백 제거 — 이제 title 이 늘 있다). 접두가 늘 있으므로 head 계산의 빈 접두 분기는 그대로 둬도 되고 지워도 된다 — 지우면 더 단순하다.

setting-group.tsx —
(1) `GroupTitleIdContext` JSDoc 끝 문장을 「그룹 밖 렌더는 `undefined` 다.」로.
(2) `SettingGroup` JSDoc 의 첫 두 ★(헤더 조건부 · 제목 유무 상단 패딩 G-21-R3-5)을 「★ 모든 그룹 카드는 제목줄을 갖는다(quick-261001-gjk) — 상단 패딩 pt-2.5.」 한 줄로 바꾼다. 나머지 ★ 는 그대로.
(3) 본문: describedBy 는 제목 유무 분기 없이 statusText 가 있으면 「titleId statusId」, 없으면 titleId. section 의 aria-label 속성 제거. className 의 패딩은 pt-2.5 고정. 제목줄 div(lc-group-header)는 조건 없이 늘 렌더 — 안쪽 구조 · 클래스 · headerCheck/switchNode 순서는 한 글자도 바꾸지 않는다(스위치 마지막 자식 = 오조작 방어 Phase 16 D-05).

limit-chaser-form.tsx —
(1) 파일 머리 ① 의 「매도 쪽 = [주문가격 · 매도비율] → 매도주문 → 매수취소(맨 아래)」를 「매도 쪽 = 매도주문 카드(주문가격 · 비교가격 · 매도비율 · 매수잔량 · 잔량추적 · 체결) → 매수취소(맨 아래)」로.
(2) renderGroup 의 statusText 를 제목 유무 분기 없이 `statusOf(spec.statusKey)` 로.
(3) CheckValueRow 의 groupTitle 을 `group.title` 로(빈 문자열 폴백 제거).
그 밖의 렌더 · 전송 · 흐림 경로는 건드리지 않는다.

그다음 아래 verify 를 돌린다. typecheck 가 남은 `spec.ariaLabel` · 옛 slot 참조를 잡아 주면 그 자리도 같은 취지로 정리한다. trading 전체 vitest 에서 Task 1 에서 못 본 실패(예: 구조를 직접 세는 다른 테스트)가 나오면 새 구조 기대로 고치고 SUMMARY 에 적는다. green 이면 경로 지정 스테이징으로 커밋 — 한글 메시지 · 트레일러 없음 · push 없음. 예: 「refactor(quick-261001-gjk): 헤더 없는 상따 그룹 경로를 지우고 카드 제목을 필수로 한다」. 커밋 직전 `git status -sb` 재확인.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && ! grep -rn "sell-price" webapp/src webapp/e2e && ! grep -rn "매도 가격 설정" webapp/src webapp/e2e && ! grep -rn "가격 섹션" webapp/src/components/trading/lc webapp/src/components/trading/limit-chaser-form.tsx webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx && cd webapp && npx vitest run src/components/trading && pnpm run typecheck && npx eslint src/components/trading/lc/lc-fields.ts src/components/trading/lc/setting-group.tsx src/components/trading/limit-chaser-form.tsx src/components/trading/lc/__tests__/lc-fields.test.ts src/components/trading/lc/__tests__/setting-group.test.tsx src/components/trading/lc/__tests__/inline-navigation.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx</automated>
  </verify>
  <done>옛 slot · 옛 섹션 접근성 이름 · 「가격 섹션」 문구가 webapp 소스 · e2e · 상따 lc 디렉터리에서 0건이다. `LcGroupSpec.title` 이 필수이고 SettingGroup 에 제목 유무 분기가 없다. trading vitest 전량 · typecheck(앱 + e2e tsconfig) · eslint 가 green 이고, 커밋 1개(한글 · 트레일러 없음)가 추가됐다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 폼 → relay `lc.set` | 사람이 확정한 상따 설정이 주문 전략으로 나간다. 이번 변경은 렌더 순서만 바꾸고 전송 경로 · cfg 구성 · 범위 검사는 그대로다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-gjk-01 | T (무결성 — 오조작) | 매도주문 카드 행 순서 · Tab 순서 | medium | mitigate | 같은 「주문가격」 라벨이 매수/매도 두 열에 있다. 접근성 이름 접두(「매수」/「매도」)와 a11yPrefix 를 바꾸지 않고, 매도 행 순서 · Tab 순서 · 설명(aria-describedby)을 form · inline-navigation · setting-group 테스트로 고정한다. 스위치는 제목줄 오른쪽 끝(마지막 자식) 그대로다 |
| T-gjk-02 | T (무결성 — 전송값) | lc.set cfg · lcRangeIssue | low | mitigate | 행 객체 필드를 한 글자도 바꾸지 않고 옮긴다. 매도비율 범위(1~100)와 범위 검사 순서(매도비율 → 잔량추적 %)가 그대로임을 Task 1 action 이 명시하고, 기존 use-lc-field-commit · limit-chaser-form 전송 테스트가 trading vitest 전량에서 green 이어야 한다 |
| T-gjk-03 | I (정보 노출) | 없음 | low | accept | 클라이언트 렌더 구성 변경뿐이다. 새 데이터 · 새 요청 · 새 의존성이 없다 |
</threat_model>

<verification>
- Task 1 · Task 2 의 automated 명령이 모두 통과한다(Task 2 명령이 상위 집합 — grep 게이트 3 · trading vitest 전량 · `pnpm run typecheck`(앱 + e2e tsconfig) · eslint 7파일).
- e2e 는 돌리지 않는다(작은 UI 재배치 — 메모리 규칙). e2e 스펙이 옛 slot · 옛 섹션 접근성 이름을 참조하지 않음은 grep 게이트가 보증하고, e2e 타입은 typecheck 가 본다.
- `git log --format=%B -n 2 | grep -ci "co-authored-by"` 결과가 0 이다.
</verification>

<success_criteria>
- 매도 열 = 「매도주문」(제목줄 → 주문가격 → 비교가격 → 매도비율 → 매수잔량 → 잔량추적 → 체결 → [래치 때 기준선]) → 「매수취소」 두 카드다 (GJK-01 · GJK-02).
- 흐림 · 편집 · 접근성 이름 · 시트 · 전송은 그대로이고, 주문가격 · 매도비율 값 버튼이 매도주문 카드 설명을 새로 단다 (GJK-03).
- 헤더 없는 그룹 경로가 코드에서 사라지고 카드 제목이 타입상 필수다 (GJK-04).
- 커밋 2개(Task 1 · Task 2), 한글 메시지 · 트레일러 없음 · 경로 지정 스테이징 · master. push · 배포는 하지 않는다(push = webapp 프로덕션 배포라 메인 세션 몫).
</success_criteria>

<output>
Create `.planning/quick/261001-gjk-sell-card-merge/261001-gjk-SUMMARY.md` when done. 반드시 포함할 것:
- 매도 열 before/after 구성 한 줄씩(카드 · 행 순서)
- 동작 불변 근거 표: dimWhenOff 변화의 화면 영향 0(dimRows={false} · 접기 없음 · lcRowDimOf 는 dimGate 만) · 접근성 이름 · 범위 검사 순서 · cfg
- 새로 생긴 a11y 차이: 주문가격 · 매도비율 값 버튼의 aria-describedby(「매도주문 {상태}」)
- RED 실패 메시지 원문 한 줄 · trading vitest 통과 수 · typecheck/eslint 결과
- 확인 권장(메인 세션): 1단(본문 ≥685) 두 열에서 매수 「매수주문」 · 매도 「매도주문」 제목줄과 주문가격 · 비교가격 행이 같은 높이에서 시작하는지 브라우저로 한 번 본다(dev 포트 3100 — dev.sh 기준)
</output>
