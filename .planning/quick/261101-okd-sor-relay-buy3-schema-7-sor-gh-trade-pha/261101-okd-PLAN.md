---
phase: quick-261101-okd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - relay/src/generated/StockDMA.fbs
  - relay/src/generated/stock-dma/set-limit-chaser.ts
  - packages/shared/src/lc-change-mask.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/ws/protocol.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/tests/fanout.test.ts
  - relay/tests/protocol.test.ts
  - relay/src/dma/__tests__/lc-change-mask.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/test-fixtures/limit-chaser.ts
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/lib/use-relay-socket.ts  # 조건부(T3 ii RED)
  - webapp/src/lib/relay-provider.tsx  # 조건부
  - webapp/src/components/trading/card/strategy-card.tsx  # 조건부
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx  # 조건부
  - webapp/src/lib/__tests__/relay-socket.test.ts  # 조건부
  - docs/inbox/from-gh-trade/261101-limitchaser-sor.md
autonomous: true
requirements: [SOR-01, SOR-02, SOR-03, SOR-04, SOR-05]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "SOR-01 앞 여섯 조건 + sorBuy·sorSell 둘 다 → buy3_schema 7 · sor 적재. 하나라도 빠지면 6 이하 · 미적재 · warn. 구 탭(sor 없음)은 종전 6"
    - "SOR-02 에코 sorBuy/sorSell 이 lc 프레임에 실리고 KRX→NXT 에코 2건은 키별 lc 2건"
    - "SOR-03 비트 표 52행(50 sor_buy · 51 sor_sell) · gh-trade .h 52줄 대조 실행·초록"
    - "SOR-04 매수주문·매도주문 제목줄 「SOR」 · 매수 켜기 = sor 둘 다 true 한 제출(D-06) · 단독 끄기 · 기본 OFF(D-08) · NXT 미거래 종목 OFF→ON 잠금 · 끄기 허용 · 모름 허용"
    - "SOR-05 KRX 카드는 NXT 키 에코가 같은 렌더 배치로 겹쳐도 제 답을 확정 · 인박스 노트 done"
  artifacts:
    - path: "relay/src/dma/envelope.ts"
      provides: "schema 7 파생 · addSorBuy/addSorSell · 에코 파서"
      contains: "LC_SOR_BUY3_SCHEMA"
    - path: "packages/shared/src/lc-change-mask.ts"
      provides: "비트 50·51"
      contains: "sor_sell"
    - path: "webapp/src/components/trading/limit-chaser-form.tsx"
      provides: "SOR 분기"
      contains: "NXT 미거래 종목"
  key_links:
    - from: "limit-chaser-form.tsx 매수 SOR"
      to: "use-lc-field-commit.ts changed"
      via: "commitField('sorBuy', true, 'toggle', { sorSell: true })"
      pattern: "sorSell: true"
    - from: "relay/src/ws/protocol.ts cfg sor"
      to: "relay/src/dma/envelope.ts"
      via: "fanout {...cfg} 그대로"
      pattern: "addSorBuy\\(b"
---

<objective>
gh-trade Phase 45 인계 노트 docs/inbox/from-gh-trade/261101-limitchaser-sor.md(계약 정본) 처리: relay 가 sor_buy(vt 176) · sor_sell(vt 178)을 buy3_schema 7 로 송수신, 웹 상따 설정에 ○SOR 매수 · 매도(목업 A), 에코 2건 수용. 미러는 서버 — 자기 키 Set 만.

요구 ID(quick 정의): SOR-01 schema 7 송신 · SOR-02 에코 수신 · SOR-03 비트 50·51 · SOR-04 웹 토글 · SOR-05 에코 2건 + 인박스. 잠긴 결정은 CONTEXT 그대로.

범위 상한(HARD): quick-261030-kpg 복제 · 기존 테스트 파일만 확장 · 새 e2e · 리팩터 · 노트의 선택적 개선 · 로그 문장 · DB 없음 · fanout.ts · hub · sweeper 무변경 · 생성물 2개는 커밋만. push · 배포 없음.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/261101-okd-sor-relay-buy3-schema-7-sor-gh-trade-pha/261101-okd-CONTEXT.md
@docs/inbox/from-gh-trade/261101-limitchaser-sor.md

<interfaces>
<!-- HEAD 666616b6 실측 -->
- 생성물(마커 21d692a1): sorBuy()/sorSell() 부재 = false · addSorBuy/addSorSell. createSetLimitChaser 금지.
- shared: lc-change-mask.ts 19~78행 표 · 7~8행 hi 예약 문장. relay.ts 120~130 필드 수 주석 · 346 extraBuyAuto · 519 Input ⚠️. Input 은 파생이라 새 필드 자동 필수. 수정 뒤 shared build.
- relay: envelope.ts 1468 LC_CHANGE_MASK_BUY3_SCHEMA · 1481 LcSetCfg · 1508 lcBuy3SchemaOf · 1647 changeMask warn · 1769 addChangeMask · 2738 에코 파서. protocol.ts 256~261 extraBuyAuto zod. fanout.ts 2071 {...cfg, market, changeMask}.
- relay 테스트: fanout.test.ts 2406 kpg describe(newClientCfg · sendAndRead) · 2109 pushLimitChaserEcho · fake-gateway.ts 573 · 730 · frames.ts 695 · 832 · lc-change-mask.test.ts 24 · 80 · 107~112 · 160 · envelope.test.ts 3351 · 1832 · protocol.test.ts 818~824. gh-trade LimitChaserChangeMask.h 84~85 → 52줄(현 대조 테스트 이미 RED).
- webapp: limit-chaser.ts 124 lcChangedFieldsOf 컴파일 단언(폼 키 ⊆ 비트 표 ∪ postBuyReentry) · 347 기본값 · 814 formFromServer · test-fixtures/limit-chaser.ts 77. lc-fields.ts 175~181 headerCheck 타입 · 186 slot 'buy' · 390 slot 'sell'. setting-group.tsx 629 {headerCheck}{switchNode} · 770 GroupHeaderCheck. limit-chaser-form.tsx 823 useRelayContext · 873 buildCfg ...values · 1114 legacy · 1151 commitToggle · 1710~1735 renderHeaderCheck. exchange-choices.ts 22~32(모름 = 허용). limit-chaser-form.test.tsx 58~72 스텁 · 3348 줄매수 자동 describe.
- 에코: use-relay-socket.ts 1152 lc 리듀서가 단일 슬롯 lastLimitChaserEcho 덮음(565 · 802 · 859 · 2357) · relay-provider.tsx 378 · strategy-card.tsx 297 · 551~556 · 576~579 이펙트가 key 로 거름. strategy-card.test.tsx 95 relay() · 40 keyOf · 43 echo · 325~360 카드 격리 테스트 · strategy-card-flow.test.tsx 640 setRelay.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (트레이서): lc.set sor → relay schema 7 → 게이트웨이 · 에코 sor → lc 프레임 → 웹 폼 값 (SOR-01~03)</name>
  <files>packages/shared/src/lc-change-mask.ts, packages/shared/src/relay.ts, relay/src/dma/envelope.ts, relay/src/ws/protocol.ts, relay/tests/helpers/frames.ts, relay/tests/helpers/fake-gateway.ts, relay/tests/fanout.test.ts, relay/tests/protocol.test.ts, relay/src/dma/__tests__/lc-change-mask.test.ts, relay/src/dma/__tests__/envelope.test.ts, webapp/src/lib/limit-chaser.ts, webapp/src/test-fixtures/limit-chaser.ts</files>
  <read_first>
    - docs/inbox/from-gh-trade/261101-limitchaser-sor.md ① · ②
    - relay/src/dma/envelope.ts 1455~1520 · 1640~1660 · 1760~1775 · 2730~2745행
    - relay/tests/fanout.test.ts 2406~2470행
  </read_first>
  <action>
    한 경로 = 매수 SOR 켜기 제출(cfg sor true/true + changed [sorBuy, sorSell]) WS → zod → fanout(무변경) → 조립기 7 → 게이트웨이, 에코 → lc 프레임 → 웹 폼 값. 매 커밋이 webapp typecheck 를 통과하게 웹 최소 운반을 여기 둔다.

    RED 먼저:
    ① lc-change-mask.test.ts: NOTE_TABLE 에 [50, "sor_buy"] · [51, "sor_sell"] · 50→52 · .h 52줄 · 비트 0..51 · 「52칸 중 36칸」.
    ② fanout.test.ts kpg 뒤 describe 「quick-261101-okd SOR schema 7」(newClientCfg · sendAndRead 재사용): okd-1 sor true/true + changed [sorBuy, sorSell] → schema 7 · sor true/true · changeMask (1n << 50n) | (1n << 51n) · 거부 0. okd-2 sorBuy 만 + changed [preBuyEnabled] → 6 · sorBuy false · warn 「schema 7 조건」 1건(계좌번호 없음). okd-3 sor 없음 → 6 · 그 warn 0. okd-4 pushLimitChaserEcho 같은 isin · 계좌 KRX → NXT(sor true/true) → 브라우저 lc 2건 · key …:KRX / …:NXT · 둘 다 sor true.
    ③ envelope.test.ts 「③-sor buy3_schema 7」: FULL+extraBuyAuto+changeMask+sor → 7 · presentSlots 176 · 178 / sor false/false → 7 · warn 0 / sorBuy 만 → 6 · 슬롯 없음 · warn / changeMask 없음 → 5 · warn / lcBuy3SchemaOf 직접 / parseLimitChaserEcho 왕복 sor 보존 · 슬롯 없는 버퍼 false.
    ④ protocol.test.ts: sor 통과 · 52키 / 생략 시 키 없음.

    GREEN:
    ⑤ shared relay.ts: RelayLimitChaser extraBuyAuto 뒤 sorBuy: boolean · sorSell: boolean + JSDoc(양방향 · vt 176/178 · 에코 = 설정값 · 부재 false · 미러는 서버 · 요청은 schema 7 만 · 게이트 아님). 필드 수 주석 「68 → 70」 · Input ⚠️ 한 단락.
    ⑥ shared lc-change-mask.ts: 「--- SOR 50-51 ---」 { key: "sorBuy", wire: "sor_buy" } · { key: "sorSell", wire: "sor_sell" } · 예약 「52~63」 · 머리 주석 정정(새 칸 52부터 · id 86/87 은 sor · change_mask_hi 는 64비트 찰 때 말미에 — 노트 ②). shared build.
    ⑦ envelope.ts: export const LC_SOR_BUY3_SCHEMA = 7 + JSDoc(서버는 7 이상만 sor 를 읽음 · 6 의 마스크 규칙 포함 · P-1 단조성). LcSetCfg Omit 에 "sorBuy" | "sorSell" · 선택 sorBuy?/sorSell?. lcBuy3SchemaOf Pick 에 둘 · 꼬리 「changeMask 없음 → 5 · sor 하나라도 없음 → 6 · 그 밖 → 7」. changeMask warn 뒤 (sor 하나라도 정의) ∧ buy3Schema < 7 → warn 「[DMA] sorBuy/sorSell 이 schema 7 조건을 못 채움 — 낮은 buy3_schema 로 내리고 sor_buy·sor_sell 미적재(서버 값 유지)」 { isin, buy3Schema }. addChangeMask 뒤 buy3Schema >= 7 ∧ 둘 다 정의일 때만 addSorBuy · addSorSell. 조립기 JSDoc 필드 수 +2. 에코 파서 sorBuy: t.sorBuy() · sorSell: t.sorSell().
    ⑧ protocol.ts: extraBuyAuto 뒤 sorBuy · sorSell z.boolean().optional() + 같은 꼴 주석(12필드 밖 · 부재 = 종전 schema · superRefine 없음 · NXT 비거래는 서버 54 ERROR).
    ⑨ frames.ts FakeLimitChaserInput sor? · emit 에 addSorBuy(b, input.sorBuy ?? false) · sell 동형. fake-gateway.ts SetLimitChaserRequest · read 에 sorBuy()/sorSell().
    ⑩ webapp limit-chaser.ts 기본 폼 sor false/false(D-08 — /me 기본설정 · 84 시딩 없음) · formFromServer server.sorBuy/sorSell(되실려도 schema 7 마스크라 다른 칸 편집은 SOR 을 안 바꾼다). test-fixtures 에 sor false/false. tsc 가 요구하는 다른 리터럴은 false 로만.

    커밋: git status -sb 확인 → 이 태스크 파일 + relay/src/generated/StockDMA.fbs + relay/src/generated/stock-dma/set-limit-chaser.ts 경로 지정 add. 예 「feat(relay): 상따 SOR buy3_schema 7 — sor_buy·sor_sell 송수신 · 비트 50·51 (gh-trade Phase 45)」.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && (cd relay && npx vitest run --maxWorkers=2 tests/fanout.test.ts tests/protocol.test.ts src/dma/__tests__/lc-change-mask.test.ts src/dma/__tests__/envelope.test.ts && npx tsc --noEmit && npx tsc -p tsconfig.tests.json --noEmit) && (cd webapp && npx vitest run --maxWorkers=2 src/lib/__tests__/limit-chaser.test.ts && npm run typecheck)</automated>
  </verify>
  <done>okd-1~4 · ③-sor · zod · 52행 표 · .h 대조(실행됨 — SUMMARY 명시) 초록 · relay tsc 두 벌 · webapp typecheck 0 오류. 생성물 포함 커밋 1개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 웹 ○SOR 토글 — 제목줄 배치 · D-06 동반 · NXT 비거래 잠금 (SOR-04)</name>
  <files>webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/lc/__tests__/lc-fields.test.ts, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx</files>
  <read_first>
    - .planning/quick/261101-okd-sor-relay-buy3-schema-7-sor-gh-trade-pha/reference/mockup-sor.html 변형 A
    - webapp/src/components/trading/limit-chaser-form.tsx 1700~1736행
    - webapp/src/components/trading/lc/setting-group.tsx 770행~
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx 40~80 · 3340~3400행
  </read_first>
  <behavior>
    - 「매수 SOR」(lc-buy-sor) · 「매도 SOR」(lc-sell-sor) 이 각 제목줄 스위치 슬롯의 바로 앞 형제 · 라벨 SOR · 그룹 OFF 여도 enabled · 흐림 0 · 기본 unchecked
    - sor false/false 에서 매수 SOR 클릭 → lc.set 1건 · cfg sor true/true · changed 에 sorBuy · sorSell
    - sorSell 이 이미 true 여도 매수 켜기는 sorSell 을 동반으로 싣는다
    - true/true 에서 매도 클릭 → sorSell false · sorBuy true · changed ["sorSell"] / 매수 클릭 → sorBuy false · sorSell true
    - nxtTradable = 다른 isin 만 → 둘 다 비활성 · hint 「NXT 미거래 종목」 · send 0
    - 같은 잠금 + 서버 sorSell true → 매도 enabled · 클릭 → sorSell false
    - nxtTradable null → 잠금 없음 · hint 「KRX·NXT 설정 공용」
    - lc-fields buy · sell 그룹 headerCheck 값이 아래 ① 과 같다
  </behavior>
  <action>
    RED 먼저: lc-fields.test.ts 1케이스(줄매수 「자동」 꼴). limit-chaser-form.test.tsx 스텁에 let mockNxtTradable(기본 null) · nxtTradable: mockNxtTradable ?? actual.EMPTY_RELAY_VALUE.nxtTradable · 다른 mock 과 같은 자리에서 리셋. 새 describe 「SOR — 매수주문 · 매도주문 제목줄 (quick-261101-okd · D-06)」 에 behavior 1~7(줄매수 자동 describe 꼴). 실패 확인.

    GREEN:
    ① lc-fields.ts: headerCheck.field 유니온에 'sorBuy' | 'sorSell'. slot 'buy' 에 { field: 'sorBuy', checkId: 'lc-buy-sor', label: 'SOR', ariaLabel: '매수 SOR', hint: 'KRX·NXT 설정 공용' } · slot 'sell' 에 { field: 'sorSell', checkId: 'lc-sell-sor', label: 'SOR', ariaLabel: '매도 SOR', hint: 'KRX·NXT 설정 공용' }. 요약 kv 추가 없음.
    ② limit-chaser-form.tsx: useRelayContext 에 nxtTradable. sorLocked = nxtTradable 이 null/undefined 아님 ∧ isin ≠ '' ∧ 집합에 isin 없음(모름 = 허용 · 54 ERROR 유발 금지). commitSor(field, on): sorBuy 켜기면 commitField('sorBuy', true, 'toggle', { sorSell: true })(D-06 — 매도 현재값과 무관하게 늘 동반 → 훅이 동반 키를 changed 에 실어 비트 50·51), 그 밖은 commitField(field, on, 'toggle'). renderHeaderCheck SOR 분기: disabledNow = checked ? disabled : (disabled ∨ legacy ∨ sorLocked)(끄기 허용 · 줄매수 ☐자동과 같은 결) · hint = sorLocked ? 'NXT 미거래 종목' : spec.hint · onToggle 필드별 분기(postBuyAuto → commitPostBuyAuto · extraBuyAuto → commitToggle · SOR → commitSor). 사전 검증 · 상태 문구 · 복사 로직 없음. JSDoc 한 줄.
    ③ setting-group · lc-tracer 등에 headerCheck 열거 단언이 깨지면 기대값에 두 체크만 더한다.

    커밋(경로 지정) 예 「feat(webapp): 상따 ○SOR 매수·매도 토글 — 매수 켜면 매도 동반 · NXT 미거래 종목 잠금 (gh-trade Phase 45 D-06)」.
  </action>
  <verify>
    <automated>cd webapp && npx vitest run --maxWorkers=2 src/components/trading/lc/__tests__/lc-fields.test.ts src/components/trading/lc/__tests__/setting-group.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx && npm run typecheck</automated>
  </verify>
  <done>behavior 8줄 초록 · 기존 대상 테스트 초록 · webapp typecheck 0 오류. 커밋 1개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 에코 2건 카드별 확정(문제 시 키별 에코 맵) · 전체 회귀 · 인박스 닫기 (SOR-05)</name>
  <files>webapp/src/components/trading/__tests__/strategy-card.test.tsx, webapp/src/lib/use-relay-socket.ts, webapp/src/lib/relay-provider.tsx, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx, webapp/src/lib/__tests__/relay-socket.test.ts, docs/inbox/from-gh-trade/261101-limitchaser-sor.md</files>
  <read_first>
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx 35~60 · 90~110 · 320~360행
    - webapp/src/components/trading/card/strategy-card.tsx 530~580행
    - webapp/src/lib/use-relay-socket.ts 540~566 · 1140~1155행
  </read_first>
  <behavior>
    - (i) 따로 렌더: KRX 카드 보내기 → rerender(last = KRX 에코) → rerender(last = NXT 에코) → ACK_TIMEOUT → KRX card-unacked 없음 · KRX answer > 0
    - (ii) 같은 배치(두 WS 메시지가 React 렌더 태스크 전에 dispatch = 한 렌더에 최종 상태만): KRX 보내기 → rerender 1회(limitChasers [KRX, NXT] 최종 상태) → ACK_TIMEOUT → KRX card-unacked 없음
  </behavior>
  <action>
    ① RED: strategy-card.test.tsx 카드 격리 테스트 뒤 「SOR 에코 2건 — KRX 요청 뒤 NXT 키 에코가 이어 와도 KRX 카드가 제 답을 확정 (quick-261101-okd)」. 같은 ISIN_A 의 KRX · NXT 카드(cardId · exchange 다름) · data-key 로 선택 · behavior (i) (ii). 계획 판독: (i) 지금 초록, (ii) 는 두 이펙트가 단일 슬롯을 key 로 걸러 RED 예상.
    ② (ii) RED 면 키별 에코 맵(최소 변경): use-relay-socket.ts 상태 · 노출 타입에 limitChaserEchoByKey: ReadonlyMap(키 → RelayLimitChaser · JSDoc: 키별 마지막 60 에코 · 한 배치에 겹쳐도 키마다 남음 · lastLimitChaserEcho 와 같은 규율). 초기 빈 Map · lc 분기 new Map(이전).set(item.key, item) · lastLimitChaserEcho 를 비우는 자리에서 같이 비움. lastLimitChaserEcho 유지. relay-provider.tsx 기본값 빈 Map. strategy-card.tsx: ownEcho = 맵.get(key) ?? null(key '' 면 null) · 551 · 576행 이펙트가 ownEcho 를 의존성으로 · 키 비교 줄 삭제 · 「답 채널」 주석 갱신. 테스트 헬퍼(relay() · setRelay)는 맵이 없으면 lastLimitChaserEcho 한 건으로 만든다 · (ii) 는 두 키 맵을 준다. relay-socket.test.ts 리듀서 1케이스(KRX → NXT → 맵 두 키). (ii) 가 초록이면 제품 코드 무변경 · 이유를 SUMMARY 에.
    ③ 코드 커밋(경로 지정) 예 「fix(webapp): 상따 에코 2건 — 한 배치에 겹친 다른 거래소 키 에코가 요청 카드의 답을 가리지 않게 키별 에코 맵」(초록이면 test(webapp)).
    ④ 전체 회귀 1회: shared build · relay 전체 vitest(--maxWorkers=2) · relay tsc 두 벌 · webapp 전체 vitest(--maxWorkers=2) · webapp typecheck. 실패는 범위 안에서 고쳐 추가 커밋.
    ⑤ 인박스 노트: frontmatter status: done · done_commit: 마지막 코드 커밋 짧은 해시. 끝에 「## gh-radar 처리 (261101 · quick-261101-okd)」 — 커밋 목록 · 질문 1: 예, 웹도 D-06 동형(매수 켜기 = 매도 동반 · 한 제출 비트 50·51 · 매도 끄기 = 매도만 · 매수 끄기 = 매수만 · 기본 OFF · 기본설정 없음 · NXT 미거래 종목 OFF→ON 비활성 · ON 이면 끄기 허용) · 질문 2: relay 는 없음(hub · sweeper 키별 · fanout okd-4) · 웹은 테스트 결과대로(RED 였으면 「카드 응답 판정이 단일 슬롯이라 두 키 에코가 한 렌더 배치로 겹치면 요청 카드가 답을 놓칠 수 있었다 → 키별 에코 맵으로 고침 &lt;해시&gt;」, 초록이면 「없음」) · 배포: gh-trade 서버 뒤 relay → webapp(push = 프로덕션), 이 quick 은 push · 배포 안 함. 노트만 경로 지정 커밋 「docs(inbox): 261101 상따 SOR 인계 처리 완료」.
  </action>
  <verify>
    <automated>cd webapp && npx vitest run --maxWorkers=2 src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/lib/__tests__/relay-socket.test.ts && npm run typecheck && grep -c "^status: done" ../docs/inbox/from-gh-trade/261101-limitchaser-sor.md</automated>
  </verify>
  <done>(i) · (ii) 초록 · 전체 회귀 초록 · 노트 status done · done_commit · 처리 절 커밋. 코드 커밋 1 + 노트 커밋 1(+ 회귀 수정분).</done>
</task>

</tasks>

<verification>
세 태스크 verify 초록 + T3 ④ 전체 회귀 초록 · 생성물 무편집 · fanout/hub/sweeper/DB/gh-trade 무변경.
</verification>

<success_criteria>
배포 순서 무관 안전(구 쪽은 종전 6) · 매수 SOR 켜기 = 한 제출 schema 7 · 비트 50·51 · 커밋 전부 경로 지정 · 한글 · Co-Authored-By 없음 · 남의 변경 미포함 · push 없음.
</success_criteria>

<output>
.planning/quick/261101-okd-sor-relay-buy3-schema-7-sor-gh-trade-pha/261101-okd-SUMMARY.md — 일반 항목 + RED 줄 · .h 대조 실행 여부 · T3 (ii) 결과·수정 여부 · 인박스 질문 답 · 배포 메모(실행 안 함 — 노트 「확인 방법」 기준).
</output>
