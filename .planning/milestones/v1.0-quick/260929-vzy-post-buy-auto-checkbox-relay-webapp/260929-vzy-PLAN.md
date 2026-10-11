---
phase: quick-260929-vzy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - relay/src/generated/StockDMA.fbs
  - relay/src/generated/stock-dma/set-limit-chaser.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/ws/protocol.ts
  - relay/src/ws/fanout.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/protocol.test.ts
  - relay/tests/fanout.test.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/test-fixtures/limit-chaser.ts
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/components/trading/__tests__/strategy-log.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [VZY-GEN, VZY-RELAY, VZY-WEB, VZY-LOG]

estimate:
  tokens: 230000
  raw_tokens: 230000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "D-08: 작업 트리의 생성물 2파일(StockDMA.fbs · set-limit-chaser.ts — gh-trade dcaa78b1 합성)이 동기화 스크립트 재실행 없이 그대로 커밋된다. Phase 25 생성물(cancel-reason.ts · evidence-kind.ts 등)은 그대로 남는다 (VZY-GEN)"
    - "D-05: 후매수 카드 제목줄에 「자동」 체크(role=checkbox, 이름 「후매수 자동」)가 제목 · 상태 흐름 오른쪽, 후매수 스위치 바로 앞에 선다. 스위치는 제목줄 마지막 자식 그대로다. 체크 상태는 서버 에코 postBuyAuto 를 따른다 — 서버가 발화해 false 로 에코하면 풀린다 (VZY-WEB)"
    - "D-03: 「자동」 을 누르면 lc.set 1건이 전략 전체 + postBuyAuto 를 싣고, relay 는 게이트웨이 10 에 buy3_schema=2 + post_buy_auto 를 싣는다. postBuyAuto 가 없는 lc.set(옛 탭)은 buy3_schema=1 이고 post_buy_auto 를 싣지 않는다(서버 값 유지). 브라우저는 buy3_schema 를 고를 수 없다 — 필드 존재로만 파생된다(T-24-01 확장) (VZY-RELAY)"
    - "D-02: lc.set zod 의 postBuyAuto 는 선택이고 신필드 12개 존재 판정(buy3CfgOf)에 들어가지 않는다 — 12개를 다 가진 옛 탭 cfg 는 postBuyAuto 없이도 새 클라로 통과한다 (VZY-RELAY)"
    - "D-01: 60 에코와 64 목록의 postBuyAuto 를 디코드한다(슬롯 부재 = false). 계약 RelayLimitChaser 는 활성 56 + key = 57 키다 (VZY-RELAY)"
    - "D-06: 사람이 매수주문 스위치를 끄면 같은 lc.set 에 postBuyAuto:false 가 실린다. 마지막 그룹 끄기의 마스터 동반 끔(D-02 전반) · 서버 접힘 뒤 자동 끔(serverFold)은 자동을 건드리지 않는다 — WinForms HandleArmToggle 동형 (VZY-WEB)"
    - "D-07: gh-trade 54 INFO 사유 줄(src LimitChaser · 「후매수 자동 켬 — …」)이 카드 · 공용 전략 로그에 「[상따] 서버 통지 — …」 로 선다. 자동 에코 전이는 「후매수 자동 체크」 · 「후매수 자동 해제」 이고 「서버 반영 완료」 로 오귀속되지 않는다 (VZY-LOG)"
    - "P-1: 자동만 켠 등록은 삭제가 아니다 — 웹 crudOf 는 C, relay #isTeardown 은 거짓(엄격 시장 해석 · 무장 가드 적용), 작업대 isActiveStrategy 는 참이다. 미등록 전략에서 자동을 켜면 등록 전송이 나간다(LC_GATE_FIELDS) — gh-trade dcaa78b1 삭제 정규화 · WinForms AnyArmed 동형 (VZY-RELAY · VZY-WEB)"
    - "P-2: 자동 켜기는 후매수 켜기와 같은 사전 검증(금액 · 수량 · 반등 1~100 · 매도비율)을 지나고, 실패면 전송 0 · 후매수 카드 한 줄이다. 켜는 방향은 후매수 스위치의 정적 판정(세션 · 구서버 · 가격 0)으로 막히고 끄는 방향은 세션만 본다 (VZY-WEB)"
    - "본문 344 · 685 · 830 · 992 에서 후매수 제목줄 넘침 0 · 「자동」 라벨 잘림 0 · 스위치 오른쪽 끝 유지, 상따 매수 카드 axe critical/serious 0 (VZY-WEB)"
  artifacts:
    - path: "relay/src/dma/envelope.ts"
      provides: "LcSetCfg(postBuyAuto 선택 입력) · LC_POST_BUY_AUTO_BUY3_SCHEMA=2 · 조립기 스키마 파생 · readLimitChaser postBuyAuto"
      contains: "LC_POST_BUY_AUTO_BUY3_SCHEMA"
    - path: "relay/src/ws/protocol.ts"
      provides: "lc.set zod postBuyAuto 선택(12필드 판정 밖) · buy3CfgOf/withNeutralBuy3 → LcSetCfg"
      contains: "postBuyAuto: z.boolean().optional()"
    - path: "packages/shared/src/relay.ts"
      provides: "RelayLimitChaser.postBuyAuto: boolean (양방향) — RelayLimitChaserInput 에 필수로 파생"
      contains: "postBuyAuto: boolean"
    - path: "webapp/src/components/trading/lc/setting-group.tsx"
      provides: "GroupHeaderCheck(제목줄 체크) · SettingGroup headerCheck 슬롯(스위치 앞)"
      exports: ["GroupHeaderCheck"]
    - path: "webapp/src/components/trading/limit-chaser-form.tsx"
      provides: "후매수 제목줄 「자동」 배선 · 마스터 OFF 동반 끔 · 자동 켜기 사전 검증"
    - path: "webapp/e2e/specs/trading-workbench.spec.ts"
      provides: "vzy-1 끝-끝 트레이서 e2e · P24-7 폭 검증 확장"
      contains: "vzy-1"
  key_links:
    - from: "webapp limit-chaser-form.tsx 「자동」 체크"
      to: "useLcFieldCommit commit('postBuyAuto', …) → lc.set cfg.postBuyAuto"
      via: "buildCfg 가 폼 값 전체를 펼친다 — LimitChaserFormValues 가 postBuyAuto 를 필수로 가진다"
      pattern: "postBuyAuto"
    - from: "relay/src/ws/fanout.ts lc.set 분기"
      to: "buildSetLimitChaserReq → addBuy3Schema(1|2) · addPostBuyAuto"
      via: "cfg.postBuyAuto 존재 여부 하나로 buy3_schema 를 고른다"
      pattern: "LC_POST_BUY_AUTO_BUY3_SCHEMA"
    - from: "relay/src/dma/envelope.ts readLimitChaser"
      to: "RelayLimitChaser.postBuyAuto → webapp formFromServer → 체크 checked"
      via: "60 · 64 공용 파서"
      pattern: "postBuyAuto: t.postBuyAuto()"
    - from: "relay #isTeardown (fanout.ts)"
      to: "webapp isDeleteIntent (lib/limit-chaser.ts)"
      via: "같은 다섯 항 — 게이트 4종 + 자동"
      pattern: "postBuyAuto"
---

<objective>
상따 후매수 「자동」 체크를 relay 와 웹앱에 붙인다. 계약은 gh-trade master dcaa78b1 로 확정됐다. 판정은 전부 서버가 한다. 클라이언트는 체크 입력을 보내고 에코 값을 보여 준다.

사용자 결정(설명 원문 · 의미 변경 금지) ↔ 이 계획의 결정 ID:
- D-01 = relay: SetLimitChaser 60 에코의 postBuyAuto 디코드(부재 = false)
- D-02 = relay: lc.set zod 의 postBuyAuto 는 선택이고 12필드 판정에서 뺀다
- D-03 = relay: cfg 에 postBuyAuto 가 있을 때만 buy3_schema=2 로 싣고, 없으면 1 로 싣는다(필드도 싣지 않는다)
- D-04 = relay: 수기 사본(msg-type · envelope · hub)을 갱신한다
- D-05 = 웹앱: 후매수 체크 오른쪽에 「자동」 체크를 둔다(에코 표시)
- D-06 = 웹앱: 마스터 OFF 때 자동도 OFF 로 보낸다
- D-07 = 웹앱: 54 INFO 사유 로그를 표면에 드러낸다
- D-08 = 생성물 2파일(gh-trade dcaa78b1 합성)은 동기화 스크립트를 다시 돌리지 않고 그대로 커밋한다

플래너 정밀화(서버 · WinForms 계약에서 나온 것 · 사용자가 알아야 할 것):
- P-1 자동만 켠 등록은 삭제가 아니다. gh-trade Gateway 는 crud 가 D 가 아닐 때 이 등록을 삭제로 정규화하지 않는다. WinForms `AnyArmed` 에도 ☐자동이 들어간다. 그래서 웹 `isDeleteIntent` · relay `#isTeardown` 이 다섯 항(게이트 4종 + 자동)이 된다. 이걸 빼면 「매수주문 · 매도 · 취소가 다 꺼진 채 자동을 켜는」 순간 웹이 crud D 를 보낸다. 그러면 서버가 전략을 지운다. 작업대 `isActiveStrategy` 에도 자동을 더한다. 빼면 나중에 스스로 매수할 수 있는 전략이 작업대에서 걷혀 보이지 않는다.
- P-2 자동 켜기는 후매수 켜기와 같은 사전 검증을 지난다. 이유는 서버가 불완전한 자동(수량 0 · 반등 0 · 매도비율 0)을 ERROR 로 눕히기 때문이다. relay zod superRefine 은 넓히지 않는다. zod 위반은 소켓 종료이고, 서버 ERROR 가 이미 문구를 가진 백스톱이다.
- 위치 해석(D-05): 웹의 후매수 「체크」 는 제목줄 오른쪽 끝 스위치다. 「후매수」 라벨은 그 줄 왼쪽에 있다. 「자동」 은 제목 · 상태 흐름의 오른쪽, 스위치 바로 앞에 둔다. 스위치는 마지막 자식으로 남는다. 근거는 두 가지다. Phase 16 D-05 가 제목줄 오른쪽 끝 스위치를 오터치 방어로 정했다. 또 여섯 그룹 스위치가 세로로 정렬돼 있어야 한다. 사용자가 「스위치 오른쪽」 을 원하면 `SettingGroup` 에서 두 노드 순서만 바꾸면 된다.
- relay 는 「postBuyAuto 선택」 을 relay 내부 타입 `LcSetCfg` 로 받는다. shared 계약 `RelayLimitChaserInput` 에서는 필수다. 새 탭이 이 값을 빠뜨리면 컴파일이 막는다. 빠뜨린 새 탭은 buy3_schema=1 로 나가고, 그러면 마스터 OFF 동반 끔이 서버에 닿지 않는다. 이것을 구조적으로 막으려는 것이다. 형태는 기존 「shared 는 새 클라 계약, relay 와이어는 구 탭 관용」 규약과 같다.

Purpose: 사람이 선매수 무체결 취소나 잔고 0 뒤 후매수를 다시 켜는 수고를 서버 자동으로 넘긴다. 사람이 매수주문을 끄면 자동도 함께 꺼진다. 그래서 사람 의도 밖 매수가 나가지 않는다.
Output: 커밋 5~7건(chore 생성물 1 · 트레이서 feat 1 · relay/웹 의미 test+feat · 웹 동작/로그/폭 test+feat). 배포와 push 는 하지 않는다. 배포는 메인 세션이 relay 먼저, 그다음 push 순서로 한다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않게 계획 시점에 확인한 사실. -->

생성물(작업 트리 · 미커밋 · 손대지 않는다):
- `relay/src/generated/stock-dma/set-limit-chaser.ts`: `postBuyAuto(): boolean` (vtable 132, 부재 false), `static addPostBuyAuto(builder, postBuyAuto: boolean)` (field 64 · `addFieldInt8(64, +v, +false)` — false 는 기본값이라 버퍼에 쓰이지 않는다), `startSetLimitChaser` → `startObject(65)`.
- `relay/src/generated/StockDMA.fbs`: SYNC MARKER `5f49cfa5 + dcaa78b1 (SetLimitChaser)`, `post_buy_auto: bool; // vtable 132`.

gh-trade 서버 계약(dcaa78b1 · 읽기 전용 확인):
- `Gateway::ProcessSetLimitChaser`: `autoPresent = buy3_schema() >= 2`. 없으면 keep 이고 서버 런타임 값을 유지한다. crud 가 D 가 아니고 게이트가 전부 꺼져 있어도 자동이 살아 있으면 삭제로 정규화하지 않는다. 자동 켜기 검증은 `postBuyOrderQty == 0 || postBuyReboundPct == 0 || > 100 || sellOrderRatio == 0 || > 100` 이고, 걸리면 ERROR(src SetLimitChaser)를 보내고 자동을 눕힌다. 에코는 늘 `buy3_schema=1` 이고 `post_buy_auto` 에 서버 런타임 값을 싣는다.
- 발화 사유 줄: `Server.cpp` 가 `ctx.source = "LimitChaser"` · isin · accountNo · level INFO 로 보낸다. 문구는 `FormatOrderNotice` 가 만든다: 「후매수 자동 켬 — 선매수 체결 0 전량 취소」 또는 「후매수 자동 켬 — 잔고 0 · 미체결 없음」 이고, 마스터를 올렸으면 뒤에 「 · 매수주문도 켬」 이 붙는다.
- WinForms: ☐매수주문을 사람이 끌 때(`chk == chkBuyEnabled`)만 ☐자동을 같은 제출에서 끈다. 마지막 그룹 끄기의 마스터 동반 끔과 DropMasterAfterServerFold 는 자동을 건드리지 않는다. 자동을 켜도 마스터는 켜지 않는다(서버 몫). 삭제 제출은 자동을 false 로 싣는다.

relay 현 코드(계획 시점):
- 조립: `relay/src/dma/envelope.ts` `buildSetLimitChaserReq(cfg: RelayLimitChaserInput & { market: OrderMarket })` (약 1273~1386행). 1362행 `SetLimitChaser.addBuy3Schema(b, LC_FIXED_BUY3_SCHEMA)`, 1376~1378행에 S→C 3필드 「싣지 않는다」 주석이 있다. `LC_FIXED_BUY3_SCHEMA = 1` 은 1242행.
- 파서: 같은 파일의 `readLimitChaser` (약 2113~2215행)가 60 과 64 에 공용이다. 2211행 `postBuyPhase: t.postBuyPhase()` 뒤에 `key` 가 온다.
- zod: `relay/src/ws/protocol.ts` `RelayLcSetSchema` (약 145~215행)에 12필드 `.optional()` 과 `superRefine`(후매수 ON 이면 반등 1~100)이 있다. `LC_BUY3_NEUTRAL` (약 441~454행)이 12키의 유일한 정본이다. `buy3CfgOf` · `withNeutralBuy3` 는 `RelayLimitChaserInput` 을 돌려준다.
- fanout: `relay/src/ws/fanout.ts` `lc.set` 분기(약 778~846행). `#isTeardown(cfg: Pick<RelayLimitChaserInput, 게이트 4종>)`(약 1156행)이 있다. `#teardownMarket(…, cfg: RelayLimitChaserInput)`(약 1181행)과 `#strategyArmable(…, cfg: RelayLimitChaserInput)`(약 1266행)도 있다.
- 수기 사본 점검 결과: `relay/src/dma/msg-type.ts` 에는 SetLimitChaser 필드나 슬롯 수를 나열한 곳이 없다(10/60 번호만 있음 → 변경 없음). `relay/src/hub/subscription-hub.ts` 의 `case MSG.SetLimitChaserResp` 도 `parseLimitChaserEcho` 에 위임만 한다(→ 변경 없음). 필드 수 주석은 `envelope.ts` 에만 있다: 1185행 「45슬롯 테이블」, 1252~1253행 「= 45 필드」, 1264행, 2104행 「활성 55필드」. 테스트 사본은 `relay/tests/helpers/frames.ts` `emitSetLimitChaser` · `FakeLimitChaserInput` 과 `relay/tests/helpers/fake-gateway.ts` `SetLimitChaserRequest` · `readSetLimitChaserRequest` 다.
- 테스트 키 수 단언: `envelope.test.ts` 의 「① 55필드 왕복」과 「⑤-buy3」은 `toHaveLength(56)` 이다. `relay/tests/fanout.test.ts` 의 「⑰-buy3」은 `toHaveLength(56)` 이다. `relay/tests/protocol.test.ts` 의 두 곳은 `toHaveLength(43)` 이다.

웹 현 코드(계획 시점):
- `webapp/src/lib/limit-chaser.ts`: `LimitChaserFormValues = Omit<RelayLimitChaserInput, …>` 이다. `defaultLimitChaserForm` 의 후매수 블록은 약 237~241행이다. `formFromServer` 는 약 541~590행이다. `isActiveStrategy` 는 103행, `LimitChaserGates` 는 77행, `isDeleteIntent` 는 154행, `crudOf` 는 169행, `isLimitChaserServerMessage` 는 633행이다(src 'LimitChaser' 를 이미 참으로 본다).
- `webapp/src/components/trading/limit-chaser-form.tsx`: `buildCfg` 는 643행(`...values` 를 펼친다)이다. `commitToggle` 은 869행, `gateBlocked(key: GateKey, next)` 는 853행, `precheck` 상태 `{slot, gate: BuyGroupGate, text}` 는 919행이다. `groupPrechecksOf('postBuyEnabled', values)` 는 441행이고, 금액 · 수량 · 반등 1~100 · 매도비율을 보며 서버 자동 검증과 같은 세 항이다. `commitGroupSwitch` 는 969행이다. `renderGroup` 은 1408행이고, `GroupSwitch onCheckedChange` 가 그룹 게이트면 `commitGroupSwitch`, 아니면 `commitToggle` 을 부른다. `lcBaseValues` 는 1669행, `dropMasterAfterServerFold` 는 1147행이다.
- `webapp/src/components/trading/lc/setting-group.tsx`: `SettingGroup` 제목줄(약 420~442행)은 fold 버튼(또는 titleFlow) 다음 `{switchNode}` 순서다. `CheckValueRow` 의 원형 체크(`lc-check-circle` · size-5 · `--primary` · lucide `Check`)는 약 629~655행이다. `GroupSwitch` 의 44 히트는 `after:` 가상요소로 만든다(539행). `FailureBubble` 이 있다.
- `webapp/src/components/trading/lc/use-lc-field-commit.ts`: `LC_GATE_FIELDS`(200행)는 미등록에서도 전송하는 필드다. commit 시그니처는 `commit(field, value, kind, companions?, meta?)` 이고, companions 는 값 또는 `(base, laid) => …` 이다(⑪ — 실패하면 동반 불리언도 함께 되돌린다).
- `webapp/src/components/trading/strategy-log.tsx`: `StrategyTransition` 은 닫힌 유니온이다. `TRANSITION_TEXT` · `TRANSITION_ORDER` 는 공개 상수이고, 테스트가 두 표의 집합이 같은지 단언한다. `VALUE_COMPARE_SKIP` 은 253행, `strategyLogLine` 은 400행이다. `serverMessageLogLine` 은 `${badge} 서버 통지 — ${m}` 을 만든다(`serverMsgBadge('LimitChaser')` = 「[상따]」).
- 테스트 픽스처: `webapp/src/test-fixtures/limit-chaser.ts` `LC_BUY3_ECHO_DEFAULTS`(Pick 17필드) · `makeLimitChaser` 가 있다. 웹 테스트 파일 10개가 모두 이 픽스처를 쓴다.
- e2e: `webapp/e2e/specs/trading-workbench.spec.ts` 의 헬퍼는 `openFocusedCard(page)`, `cardOf`, `lcSwitch(scope, name)`(role switch), `waitForSetAtGateway(relay, n)`, `lcSetCount`, `lcSetRequests`(→ `readSetLimitChaserRequest`), `logRows(page)`(공용 패널 「전략 로그」 행), `FOLD_QUIET_MS`, `relay.seedLimitChasers` · `relay.pushLimitChaserEcho` · `relay.pushServerMessage({ level, source, isin, accountNo, message, kind })` 다. 「P24-7」(약 2828행)은 폭 최악값 × 본문 344 · 685 · 830 · 992 테스트다. e2e 의 relay 는 `tsx relay/src/index.ts` 실프로세스이고, shared 는 dist 를 읽는다. 그래서 e2e 전에 shared build 가 필요하다.

검증 명령(이 저장소에서 실제로 돈 형태 · `.planning/config.json` build_command/test_command):
- `pnpm --filter @gh-radar/shared build`
- `pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test`
- `pnpm --filter @gh-radar/webapp run typecheck` (앱 + e2e tsconfig) · `pnpm --filter @gh-radar/webapp exec vitest run <파일…>` · `pnpm --filter @gh-radar/webapp run test`
- `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "<이름>"` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/a11y.spec.ts -g "상따 매수 카드 axe"`
</interfaces>

운영 규칙(모든 태스크):
- 작업 트리에는 다른 세션의 미커밋 파일이 있다(`.planning/state.json` · `.planning/milestone.lock` · `.planning/quick/260928-cs1-toast-top-right/shots/` · `.planning/research/.cache/`). 이 파일들은 **절대 stage 하지 않는다.** 경로를 명시해 `git add` 하고, 커밋 직전마다 `git status -sb` 를 본다. 브랜치는 바꾸지 않는다(현재 브랜치에 커밋).
- `server/scripts/sync-relay-schema.sh` 를 실행하지 않는다. gh-trade master 로 돌리면 아직 gh-trade 에 없는 Phase 25 생성물(a058f26f)이 지워진다.
- 커밋 메시지는 한글로 쓰고 접두는 `chore|test|feat(quick-260929-vzy):` 다. **Co-Authored-By 줄은 넣지 않는다**(사용자 규칙). push · 배포는 하지 않는다(서브에이전트 배포는 분류기 차단 · 메인 세션 몫).
- Playwright webServer 가 `NextFontGoogleFontFileReplacer` 반복으로 타임아웃나면 `rm -rf webapp/.next` 후 다시 돌린다. 코드 문제가 아니다. webapp dev 포트는 3100 이다.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: 트레이서 — 「자동」 체크 → lc.set → relay buy3_schema 2 · post_buy_auto → 게이트웨이 10 · 60 에코 → 체크 표시 · 54 사유 줄 (한 경로)</name>
  <files>relay/src/generated/StockDMA.fbs, relay/src/generated/stock-dma/set-limit-chaser.ts, packages/shared/src/relay.ts, relay/src/dma/envelope.ts, relay/src/ws/protocol.ts, relay/src/ws/fanout.ts, relay/tests/helpers/frames.ts, relay/tests/helpers/fake-gateway.ts, webapp/src/lib/limit-chaser.ts, webapp/src/test-fixtures/limit-chaser.ts, webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/lc/setting-group.tsx, webapp/src/components/trading/limit-chaser-form.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <precondition>작업 트리의 `relay/src/generated/stock-dma/set-limit-chaser.ts` 에 `addPostBuyAuto` 가 있고(`grep -q addPostBuyAuto`), `git diff --stat -- relay/src/generated` 가 그 파일과 `StockDMA.fbs` 2파일만 보여 준다.</precondition>
  <action>
(0) 생성물 커밋 먼저(D-08). `git diff -- relay/src/generated` 를 확인한다. 내용이 SYNC MARKER 줄, buy3_schema 주석, post_buy_auto 필드 선언, `postBuyAuto()` 접근자, `startObject(65)`, `addPostBuyAuto`, `createSetLimitChaser` 인자 추가뿐이어야 한다. 다르면 멈추고 보고한다. 두 파일만 경로를 명시해 stage 하고 커밋한다: `chore(quick-260929-vzy): relay 생성물 — SetLimitChaser post_buy_auto(vtable 132) · gh-trade dcaa78b1 합성 그대로(동기화 스크립트 재실행 없음 · Phase 25 생성물 보존)`. 동기화 스크립트는 돌리지 않는다.

(1) shared 계약 — `packages/shared/src/relay.ts`. `RelayLimitChaser` 의 `postBuyPhase` 다음, `key` 앞에 `postBuyAuto: boolean` 을 둔다. JSDoc 에는 이것을 적는다: 「☐자동(양방향 · gh-trade dcaa78b1). ON 이면 서버가 선매수 무체결 전량취소나 잔고 0 전이 때 후매수를 1회 켜고(꺼진 마스터도 올림) 이 값을 false 로 에코한다. 판정은 서버다. 구서버 에코(슬롯 부재)는 false. 요청에는 relay 가 buy3_schema 2 와 함께 싣는다.」 `RelayLimitChaserInput` 은 Omit 을 그대로 둔다. 그래서 새 클라 입력에서 postBuyAuto 는 필수다. 입력 문서의 「43필드」 를 「44필드(+ post_buy_auto)」 로 고친다. 필수인 이유도 한 줄 더한다: 빠뜨리면 relay 가 buy3_schema 1 로 싣고 서버가 자동을 유지해서, 마스터 OFF 동반 끔(D-06)이 닿지 않는다. relay 는 구 탭 관용으로 `LcSetCfg` 를 따로 받는다. `LIMIT_CHASER_SERVER_*_FIELDS` 에는 넣지 않는다(양방향이라서).

(2) relay 조립 · 파서 — `relay/src/dma/envelope.ts`(D-01 · D-03).
- `LC_FIXED_BUY3_SCHEMA` 옆에 `export const LC_POST_BUY_AUTO_BUY3_SCHEMA = 2` 를 둔다. 문서: 「post_buy_auto 를 싣는 요청만 2. 서버는 2 이상일 때만 post_buy_auto 를 읽는다. 1 이면 서버 값을 유지한다(구 탭 재제출이 자동을 지우지 않는다).」
- `export type LcSetCfg = Omit<RelayLimitChaserInput, "postBuyAuto"> & { postBuyAuto?: boolean }` 를 둔다. 문서: 「relay 가 조립하는 cfg — postBuyAuto 만 선택(구 탭 관용). 존재 여부가 buy3_schema 를 정한다.」
- `buildSetLimitChaserReq` 입력을 `LcSetCfg & { market: OrderMarket }` 로 바꾼다. 1362행의 스탬프는 `cfg.postBuyAuto === undefined ? LC_FIXED_BUY3_SCHEMA : LC_POST_BUY_AUTO_BUY3_SCHEMA` 가 된다. `post_buy_phase` 「싣지 않는다」 주석 다음에 `cfg.postBuyAuto !== undefined` 일 때만 `SetLimitChaser.addPostBuyAuto(b, cfg.postBuyAuto)` 를 부른다. false 는 FlatBuffers 기본값이라 버퍼에 쓰이지 않는다. 서버는 schema 2 에서 부재를 false 로 읽으므로 그걸로 된다는 것을 주석에 적는다. 브라우저는 buy3_schema 를 고를 수 없다(T-24-01) — 필드 존재로만 파생된다는 것도 적는다.
- `readLimitChaser` 의 `postBuyPhase` 다음에 `postBuyAuto: t.postBuyAuto()` 를 둔다(주석: 양방향 · 서버 런타임 값 · 부재 = false).
- 수기 사본 주석(D-04)을 고친다. 1185행 「45슬롯」 을 생성물과 같은 「65슬롯(startObject(65))」 으로 바꾼다. 1252~1253행 필드 산식에 「+ 선택 1(post_buy_auto — 입력에 있을 때만) = 최대 46 필드」 를 더한다. 1264행 buy3_schema 문장을 「1 또는 2 — postBuyAuto 존재로만 파생」 으로 바꾼다. 2104행 「활성 55필드」 를 「활성 56필드(+ postBuyAuto)」 로 바꾼다. `msg-type.ts` · `subscription-hub.ts` 는 필드를 나열하지 않으므로 고치지 않는다. 이 사실을 SUMMARY 에 적는다.

(3) relay zod — `relay/src/ws/protocol.ts`(D-02). `RelayLcSetSchema.cfg` 의 12필드 블록 **밖**, 그 아래에 `postBuyAuto: z.boolean().optional()` 을 둔다. 주석에는 세 가지를 적는다: 12필드 존재 판정(`buy3CfgOf`)에 들어가지 않는다, 부재는 relay 가 buy3_schema 1 로 싣는다, superRefine 에 자동 완결성 검사를 넣지 않는다(zod 위반은 소켓 종료이고, 서버가 ERROR 로 자동만 눕힌다 — P-2). `LC_BUY3_NEUTRAL` 에는 넣지 않는다. `buy3CfgOf` · `withNeutralBuy3` 반환 타입을 `LcSetCfg` 로 바꾼다(`import type { LcSetCfg } from "../dma/envelope.js"`). `withNeutralBuy3` 는 postBuyAuto 를 채우지도 지우지도 않는다. 두 함수의 문서 「`RelayLimitChaserInput` 으로 좁혀」 는 「`LcSetCfg` 로 좁혀」 로 바꾼다.

(4) relay fanout — `relay/src/ws/fanout.ts`. `#isTeardown` 의 Pick 원천, `#teardownMarket`, `#strategyArmable` 의 cfg 타입을 `LcSetCfg` 로 바꾼다. 판정 로직은 이 태스크에서 바꾸지 않는다(Task 2). 쓰지 않게 된 `RelayLimitChaserInput` import 는 정리한다.

(5) 테스트 헬퍼(수기 사본) — `relay/tests/helpers/frames.ts` 는 `FakeLimitChaserInput` 에 `postBuyAuto?: boolean` 을 더한다(주석: 양방향 · 서버 에코는 늘 싣는다). `emitSetLimitChaser` 의 `addPostBuyPhase` 다음에 `SetLimitChaser.addPostBuyAuto(b, input.postBuyAuto ?? false)` 를 넣는다. 「55 필드」 류 주석은 56 으로 고친다. `relay/tests/helpers/fake-gateway.ts` 는 `SetLimitChaserRequest` 에 `postBuyAuto: boolean` 을 더하고 `readSetLimitChaserRequest` 에 `postBuyAuto: req.postBuyAuto()` 를 더한다. `buy3Schema` 문서의 「늘 1」 은 「1(자동 미적재) 또는 2(자동 적재)」 로 고친다.

(6) 웹 폼 값 — `webapp/src/lib/limit-chaser.ts`. `defaultLimitChaserForm` 의 `postBuyEnabled: false` 옆에 `postBuyAuto: false` 를 둔다(주석: 새 폼은 자동 OFF · WinForms 종목 전환 초기화 동형). `formFromServer` 의 `postBuyEnabled` 다음에 `postBuyAuto: server.postBuyAuto` 를 둔다(에코 그대로 · 서버가 발화하면 false). `webapp/src/test-fixtures/limit-chaser.ts` 는 `Buy3EchoFields` Pick 과 `LC_BUY3_ECHO_DEFAULTS` 에 `postBuyAuto: false` 를 더하고, 머리 주석의 17 을 18 로 고친다.

(7) 웹 스펙 — `webapp/src/components/trading/lc/lc-fields.ts`. `LcGroupSpec` 에 선택 필드 `headerCheck?: { field: 'postBuyAuto'; checkId: string; label: string; ariaLabel: string; hint: string }` 을 더한다. 문서: 「제목줄 체크(그룹 스위치와 같은 지위 · 어느 행에도 속하지 않는다 · 흐리지 않는다 — WinForms ☐자동 동형).」 후매수 그룹 스펙에는 이렇게 채운다: checkId `lc-post-buy-auto`, label `자동`, ariaLabel `후매수 자동`, hint 「선매수가 한 주도 체결되지 않고 전량 취소되거나 잔고가 0 이 되면 서버가 후매수를 한 번 켜요 — 매수주문이 꺼져 있으면 함께 켜요」.

(8) 웹 컴포넌트 — `webapp/src/components/trading/lc/setting-group.tsx`.
- `export function GroupHeaderCheck({ id, label, ariaLabel, hint, checked, disabled, busy, flash, failureText, onToggle })` 를 새로 만든다. 요소는 `<button type="button" role="checkbox">` 이고, 속성은 `aria-checked`, `aria-label={ariaLabel}`, `aria-busy`(busy 일 때), `title={hint}`, `data-slot="lc-group-header-check"` 다. 클래스는 `relative flex min-h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-[10px] px-1 disabled:cursor-not-allowed disabled:opacity-50` 이다. 44 히트는 `GroupSwitch` 와 같은 `after:` 가상요소 세로 확장으로 만든다(시각 크기 불변). 원형은 `CheckValueRow` 의 `lc-check-circle` 과 같은 기하와 색이다(size-5 · 테두리 1.5 · checked 면 `--primary` 채움 + lucide `Check`). 라벨은 13px · font-medium 이고, checked 면 `--fg`, 아니면 `--muted-fg`, flash 면 `--primary` 다. 전체를 `FailureBubble` 로 감싼다.
- `SettingGroupProps` 에 `headerCheck?: ReactNode` 를 더한다(문서: 제목줄에서 스위치 바로 앞 · 스위치는 마지막 자식 유지 — Phase 16 D-05). 제목줄은 fold 버튼(또는 titleFlow), `{headerCheck}`, `{switchNode}` 순서로 그린다.

(9) 웹 배선 — `webapp/src/components/trading/limit-chaser-form.tsx` `renderGroup`. `spec.headerCheck` 가 있으면 `SettingGroup headerCheck` 에 `GroupHeaderCheck` 를 넘긴다. 속성은 id/label/ariaLabel/hint 를 스펙에서 받고, `checked={form.postBuyAuto}`, `busy={isBusy('postBuyAuto')}`, `flash={lc.flashField === 'postBuyAuto'}`, `failureText={toggleFailureTextOf('postBuyAuto')}`, `disabled={disabled}`, `onToggle={() => commitToggle('postBuyAuto', !form.postBuyAuto)}` 다. 사전 검증 · 비활성 세분화 · 마스터 동반은 Task 3 에서 한다(이 태스크는 한 경로만).

(10) 컴파일 수선. shared 계약이 바뀌면서 타입 오류가 난 테스트 파일만 고친다. relay 테스트에서 `RelayLimitChaserInput & { market }` 로 모델링한 입력(`envelope.test.ts` `LcBuildInput` 등)은 `LcSetCfg & { market }` 로 바꿔 기본 픽스처가 postBuyAuto 없이 buy3_schema 1 경로를 유지하게 한다. 웹 테스트는 픽스처 기본값으로 대부분 해소된다. 남는 리터럴에는 `postBuyAuto: false` 한 줄을 더한다. 기존 단언의 의미는 바꾸지 않는다. 키 수 단언(56 → 57 · 43 → 44)은 이 태스크에서 실제로 깨지는 것만 새 값으로 고친다. 의미 테스트 추가는 Task 2 몫이다.

(11) 트레이서 e2e — `webapp/e2e/specs/trading-workbench.spec.ts` 의 Phase 18 Plan 13 describe 안에 테스트 `vzy-1 후매수 「자동」 — 체크 → 10 buy3_schema 2 · post_buy_auto · 에코 표시 · 서버 발화 에코로 풀림 · [상따] 사유 줄 (quick-260929-vzy 트레이서)` 을 더한다.
- 시드: `{ buyEnabled: true, sellEnabled: true, postBuyEnabled: false, postBuyAuto: false, postBuyOrderAmount: 4000, postBuyReboundPct: 30, postBuyReentry: 3 }`. 금액 · 반등을 명시하는 이유는 Task 3 사전 검증이 붙어도 이 테스트가 그대로 통과하게 하려는 것이다. 기본 주문가격 71,000 이면 수량은 563주, 매도비율 기본은 60 이다.
- `openFocusedCard(page)` 를 연다. 체크는 `card.getByRole('checkbox', { name: '후매수 자동', exact: true })` 로 찾고 not checked 를 확인한다. `page.evaluate` 로 `[data-slot="lc-group-post-buy"] [data-slot="lc-group-header"]` 의 `lastElementChild` 가 `role="switch"` 인지, 체크가 그 스위치보다 앞 형제인지 단언한다.
- `lcSetCount` 기준을 잡는다. 클릭하고 `waitForSetAtGateway(relay, 기준 + 1)` 을 기다린다. 마지막 `lcSetRequests(relay)` 가 `buy3Schema: 2`, `postBuyAuto: true`, `postBuyEnabled: false` 인지 본다.
- `relay.pushLimitChaserEcho({ ...시드, postBuyAuto: true })` → checked.
- `relay.pushServerMessage({ level: 'INFO', source: 'LimitChaser', isin: E2E_ISIN, accountNo: E2E_ACCOUNT_NO, message: '후매수 자동 켬 — 잔고 0 · 미체결 없음', kind: '' })` 다음 `relay.pushLimitChaserEcho({ ...시드, postBuyAuto: false, postBuyEnabled: true, buyEnabled: true })` 를 보낸다. 그 뒤 세 가지를 본다: 체크 not checked, `lcSwitch(card, '후매수 켜기')` checked, `(await logRows(page)).filter({ hasText: '후매수 자동 켬 — 잔고 0 · 미체결 없음' })` 가 1건이고 그 행 텍스트에 「[상따] 서버 통지」 가 있다(D-07).
- `FOLD_QUIET_MS` 동안 기다린 뒤 `lcSetCount` 가 기준 + 1 그대로인지 본다(에코 경로는 제출을 만들지 않는다).

커밋: `feat(quick-260929-vzy): 후매수 「자동」 트레이서 — shared postBuyAuto · relay buy3_schema 2 파생 · 60/64 디코드 · 후매수 제목줄 체크 · e2e vzy-1`. 이 태스크의 files 와 (10)에서 고친 테스트 파일만 경로를 명시해 stage 한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/lc/__tests__/setting-group.test.tsx && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "vzy-1" && test -f relay/src/generated/stock-dma/cancel-reason.ts && test -f relay/src/generated/stock-dma/evidence-kind.ts && git diff --quiet -- relay/src/generated</automated>
  </verify>
  <done>생성물 2파일이 단독 chore 커밋으로 들어갔고 Phase 25 생성물이 남아 있다. 실브라우저에서 「자동」 을 누르면 게이트웨이 10 이 buy3_schema 2 · post_buy_auto true 로 나간다. 60 에코가 체크를 켜고 끈다. 서버 발화 사유 줄은 공용 전략 로그에 「[상따] 서버 통지 — 후매수 자동 켬 — …」 로 선다. relay 전량 테스트 · 두 typecheck · webapp typecheck 가 green 이고, 커밋은 chore 1 + feat 1 이다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 계약 의미 — buy3_schema 파생 불변식 · 12필드 판정 분리 · 57키 · 「자동만 켠 등록」 은 삭제 아님(relay 철거 판정 · 웹 crud · 켜진 전략 · 등록 필드)</name>
  <files>relay/src/ws/fanout.ts, relay/src/dma/__tests__/envelope.test.ts, relay/tests/protocol.test.ts, relay/tests/fanout.test.ts, webapp/src/lib/limit-chaser.ts, webapp/src/lib/__tests__/limit-chaser.test.ts, webapp/src/components/trading/lc/use-lc-field-commit.ts, webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx</files>
  <behavior>
    - envelope ①: `lcInput()`(postBuyAuto 없음) → `buy3Schema()` 1 · vtable 132 슬롯 없음 · `postBuyAuto()` false (D-03).
    - envelope ②: `lcInput({ postBuyAuto: true })` → buy3Schema 2 · 슬롯 132 있음 · postBuyAuto true. `postBuyAuto: false` → buy3Schema 2 · postBuyAuto false. 입력 객체에 초과 속성 `buy3Schema: 0` 을 끼워도 1/2 로만 나간다 (T-24-01 확장).
    - envelope ③: `buildSetLimitChaserRespFrame({ postBuyAuto: true })` 의 60 과 64 목록은 postBuyAuto true 다. 기본 프레임은 false 다. 「① 왕복」 · 「⑤-buy3」 키 수는 57 이다(활성 56 + key · D-01).
    - protocol ①: 새 탭 cfg(12 + postBuyAuto)는 통과하고 키가 44 다. 12 는 있고 postBuyAuto 가 없는 cfg 는 `buy3CfgOf` 가 null 이 아니다(자동은 12필드 판정 밖 · D-02). postBuyAuto 는 있고 12 중 하나가 빠진 cfg 는 null 이다(자동이 12를 대신하지 않는다). 브라우저가 실은 `buy3Schema: 2` 는 파싱 결과에 없다. postBuyAuto 가 문자열 `"true"` 면 스키마 위반이다.
    - protocol ②: `withNeutralBuy3` 는 입력에 없는 postBuyAuto 를 만들지 않는다.
    - fanout ①: 새 탭 lc.set postBuyAuto true → 10 이 buy3Schema 2 · postBuyAuto true. false → 2 · false. 필드가 없는 12필드 cfg → 1 · false.
    - fanout ②: SymbolMap 이 모르는 ISIN 이고 게이트 4종이 전부 꺼져 있으며 postBuyAuto 가 true 인 lc.set(crud C)은 철거가 아니다. 게이트웨이로 0바이트가 나가고 시장 해석 실패 거부 프레임이 온다. 같은 조건에 postBuyAuto 가 false 면 종전 ⑰-e 처럼 철거로 나간다 (P-1 · T-16-42).
    - fanout ③: 60 에코 postBuyAuto true → ws `lc` 프레임 item.postBuyAuto true · 키 57 (「⑰-buy3」 56 → 57).
    - web lib ①: `isDeleteIntent({ 게이트 4종 false, postBuyAuto: true })` 는 false 이고 `crudOf` 는 'C' 다. 다섯 항이 다 false 면 'D' 다.
    - web lib ②: `isActiveStrategy({ buyEnabled: false, sellEnabled: false, cancelQtyEnabled: false, postBuyAuto: true })` 는 true 다.
    - web lib ③: `defaultLimitChaserForm().postBuyAuto` 는 false 이고, `formFromServer(makeLimitChaser({ postBuyAuto: true }), …)` 는 true 다.
    - web hook ①: `LC_GATE_FIELDS` 에 postBuyAuto 가 있다. 미등록(server null)에서 `commit('postBuyAuto', true, 'toggle')` 은 로컬 반영이 아니라 전송(`sent`)이고, cfg.crud 가 'C' · postBuyAuto true 다. `commit('postBuyAuto', false, 'toggle')` 는 무장 해제라 `armBlockOf` 를 지나지 않는다.
  </behavior>
  <action>
RED 먼저. 위 behavior 를 테스트로 쓴다. relay 는 `envelope.test.ts`(기존 「③-buy3」 옆에 「③-auto」 묶음 · `presentSlots(t, [132])` 사용), `protocol.test.ts`(기존 ①-legacy 묶음 옆), `fanout.test.ts` 에 쓴다. fanout ②는 기존 「⑰-e」(SymbolMap 미해석 ISIN 철거)와 「⑰-e3」 의 준비 · 단언 모양을 그대로 따른다. 웹은 `limit-chaser.test.ts` 와 `use-lc-field-commit.test.tsx`(미등록 · 게이트 필드 기존 케이스 모양)에 쓴다. 실패를 확인하고 실패 이유를 SUMMARY 에 적는다. 커밋: `test(quick-260929-vzy): 자동 계약 의미 실패 테스트 — buy3_schema 파생 · 12필드 판정 분리 · 57키 · 자동만 켠 등록 비철거 · 미등록 등록 필드`.

GREEN.
- `relay/src/ws/fanout.ts` `#isTeardown`: Pick 에 `postBuyAuto` 를 더하고 식에 `&& cfg.postBuyAuto !== true` 를 더해 다섯 항으로 만든다(P-1). 문서의 「게이트 4종」 을 「게이트 4종 + 자동(quick-260929-vzy)」 으로 바꾼다. 근거는 gh-trade dcaa78b1 `ProcessSetLimitChaser` 다: 자동만 켠 등록은 삭제로 정규화하지 않고 계좌 가드를 지나는 등록이다. 그래서 엄격 시장 해석 · 무장 가드를 적용해야 한다. 옛 탭은 자동 필드가 없어 판정이 종전과 같다는 것도 적는다. 「`isDeleteIntent()` 와 같은 네 항」 문장은 「같은 다섯 항」 으로 고친다. `lc.set` 분기 주석 중 「게이트 4종 OFF」 로 철거를 설명하는 곳은 그 분기가 구 탭(자동 없음) 경로라 뜻이 같다. 문장은 그대로 두고, `#isTeardown` 한 곳에 판정이 있다는 사실만 유지한다.
- `webapp/src/lib/limit-chaser.ts`: `LimitChaserGates` Pick 에 `'postBuyAuto'` 를 더한다. `isDeleteIntent` 에 `&& !gates.postBuyAuto` 를 더하고 문서를 고친다(WinForms `AnyArmed` · 서버 삭제 정규화 동형 · relay `#isTeardown` 과 같은 다섯 항). `isActiveStrategy` 인자 타입에 `postBuyAuto: boolean` 을 더하고 식에 `|| c.postBuyAuto` 를 더한다. 문서에 한 줄을 더한다: 자동은 나중에 서버가 매수를 켜는 무장이라, 걷어 보이지 않게 하면 숨은 무장이 된다(2026-09-23 「켜진 전략」 규칙의 확장).
- `webapp/src/components/trading/lc/use-lc-field-commit.ts`: `LC_GATE_FIELDS` 끝에 `'postBuyAuto'` 를 더한다. 문서에 한 줄: 자동만 켠 등록도 등록이다(서버 · WinForms 동형 · P-1). 이렇게 하면 `isDisarm` 이 자동 끄기를 무장 해제로 본다.
- 타입 오류가 나는 호출 · 테스트 리터럴(`isActiveStrategy` · `isDeleteIntent` 에 넘기는 객체)을 고친다.
- `envelope.test.ts` 「① 55필드 왕복」 제목과 주석의 수를 56 · 57 로 고친다.

GREEN 확인 후 커밋: `feat(quick-260929-vzy): 자동만 켠 등록은 삭제 아님 — relay #isTeardown · 웹 isDeleteIntent/crudOf 다섯 항 · isActiveStrategy · LC_GATE_FIELDS`. 경로를 명시해 stage 한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx && grep -q "cfg.postBuyAuto !== true" relay/src/ws/fanout.ts && grep -q "gates.postBuyAuto" webapp/src/lib/limit-chaser.ts</automated>
  </verify>
  <done>relay 는 postBuyAuto 존재로만 buy3_schema 1/2 를 고른다. 12필드 구 탭 판정은 자동과 무관하고, 60 · 64 계약은 57키다. 자동만 켠 등록은 relay 에서 철거가 아니다(SymbolMap 미해석이면 거부). 웹에서는 crud C · 켜진 전략 · 미등록 등록 전송이다. RED(test) → GREEN(feat) 커밋 2건이고, relay 전량 · 웹 대상 테스트 · 세 typecheck 가 green 이다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 웹 동작 · 로그 · 폭 — 마스터 OFF 동반 끔 · 자동 켜기 사전 검증 · 비활성 규칙 · 로그 전이 · 54 사유 줄 · 344~992 제목줄</name>
  <files>webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx, webapp/src/components/trading/strategy-log.tsx, webapp/src/components/trading/__tests__/strategy-log.test.tsx, webapp/src/lib/__tests__/limit-chaser.test.ts, webapp/src/components/trading/lc/__tests__/setting-group.test.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <behavior>
    - form ①(D-06): 에코가 buyEnabled true · postBuyAuto true 일 때 매수주문 스위치(「매수주문 켜기」)를 끄면 lc.set 이 **1건** 나가고 cfg 는 buyEnabled false · postBuyAuto false 다. 거부되거나 무응답이면 두 컨트롤이 함께 서버 값(켜짐)으로 돌아간다.
    - form ②: 마지막 그룹(후매수)만 끄는 D-02 전반 제출의 cfg 는 postBuyAuto 가 에코 값(true) 그대로다. 서버 접힘 뒤 자동 끔(serverFold) 제출도 postBuyAuto 를 에코 값 그대로 싣는다.
    - form ③(P-2): 후매수 금액 0 에서 「자동」 을 켜면 전송이 0 이고, 후매수 카드 사전 검증 줄이 `LC_COMMIT_TEXT.amountRequired` 다. 반등 0 이면 `reboundRange`, 매도비율 0 이면 `sellRatioRequired` 다. 검증이 통과하면 lc.set 1건에 postBuyAuto true 가 실리고 buyEnabled 는 그대로다(자동은 마스터를 켜지 않는다).
    - form ④: 구서버 에코(buy3Schema 0)이거나 시세 미수신(주문가격 0)이면 꺼진 「자동」 이 disabled 다. 켜진 「자동」 은 세션이 준비된 한 끌 수 있다.
    - form ⑤: 서버 발화 에코(postBuyAuto true→false · postBuyEnabled false→true · buyEnabled false→true)는 폼이 아무것도 보내지 않고 체크만 푼다.
    - log ①(D-07): prev postBuyAuto false → next true 는 「후매수 자동 체크」 한 조각이다(「서버 반영 완료」 없음). true → false 는 「후매수 자동 해제」 다. 발화 에코는 「매수주문 무장 · 후매수 무장 · 후매수 자동 해제」 순서이고 「서버 반영 완료」 가 없다. 첫 스냅샷에 자동이 켜져 있으면 등록 줄에 「후매수 자동 체크」 가 붙는다. TRANSITION_TEXT 와 TRANSITION_ORDER 의 집합은 같다.
    - log ②(D-07): `{ lv: 'INFO', src: 'LimitChaser', i: 전략 ISIN, a: 계좌, kind: '', m: '후매수 자동 켬 — 선매수 체결 0 전량 취소 · 매수주문도 켬' }` 에 대해 `isLimitChaserServerMessage` 가 true 다. `serverMessageLogLine` 은 text 「[상따] 서버 통지 — 후매수 자동 켬 — 선매수 체결 0 전량 취소 · 매수주문도 켬」 · level info 를 낸다.
    - setting-group ①: `GroupHeaderCheck` 는 role checkbox · aria-checked · 이름 「후매수 자동」 이다. disabled 면 onToggle 을 부르지 않는다. `SettingGroup` 제목줄에서 headerCheck 는 switchNode 바로 앞이고, 스위치가 마지막 자식이다.
    - e2e P24-7: WORST 에 postBuyAuto true 를 더한다. 네 밴드 모두에서 후매수 제목줄 넘침 0, 「자동」 버튼 scrollWidth ≤ clientWidth(잘림 0), 버튼 높이 ≥ 32, 스위치가 제목줄 마지막 자식이고 오른쪽 끝이 체크보다 오른쪽이다. a11y 상따 매수 카드 axe 매트릭스는 critical/serious 0 이다.
  </behavior>
  <action>
RED 먼저. behavior form ①~⑤ 는 `limit-chaser-form.test.tsx`(기존 그룹 스위치 · D-02 전반 · serverFold · 사전 검증 케이스 모양), log ①② 는 `strategy-log.test.tsx` 와 `limit-chaser.test.ts`, setting-group ① 은 `setting-group.test.tsx` 에 쓴다. 실패를 확인하고 이유를 SUMMARY 에 적는다. 커밋: `test(quick-260929-vzy): 자동 웹 동작 실패 테스트 — 마스터 OFF 동반 끔 · 켜기 사전 검증 · 비활성 · 로그 전이 · 54 사유 줄`.

GREEN.
(a) 마스터 OFF 동반 끔(D-06) — `limit-chaser-form.tsx` 에 `commitMasterSwitch(on: boolean)` useCallback 을 만든다. off 면 `commitField('buyEnabled', false, 'toggle', { postBuyAuto: false })`, on 이면 종전 `commitToggle('buyEnabled', true)` 다. `renderGroup` 의 `onCheckedChange` 분기에서 gate 가 `buyEnabled` 면 이 함수를 부른다. 주석에 네 가지를 적는다: WinForms `HandleArmToggle` 의 `chk == chkBuyEnabled` 동형이다. 사람 스위치에서만 동작한다. 값 동반이라 대기열에서 꺼낼 때도 같은 값이고, 실패하면 훅 ⑪ 이 두 컨트롤을 함께 되돌린다. D-02 전반(`commitGroupSwitch` 마지막 그룹) · `dropMasterAfterServerFold` 는 자동을 건드리지 않는다(WinForms 동형).
(b) 자동 켜기 · 끄기(P-2) — `commitPostBuyAuto(on: boolean)` useCallback 을 만든다. on 이면 `lcBaseValues(serverRef.current, formRef.current)` 로 `groupPrecheckOf('postBuyEnabled', …)` 를 부른다. 실패면 `setPrecheck({ slot: 'post-buy', gate: 'postBuyEnabled', text })` 후 return 한다(전송 0 · 체크는 움직이지 않는다). 통과면 post-buy 슬롯 사전 검증을 비우고 `commitField('postBuyAuto', true, 'toggle')` 을 부른다(마스터 동반 없음 — 서버 몫 · WinForms 동형). off 면 `commitField('postBuyAuto', false, 'toggle')` 이다. Task 1 의 `onToggle` 을 이 함수로 바꾼다.
(c) 비활성 — `GroupHeaderCheck` 의 disabled 를 `form.postBuyAuto ? disabled : gateBlocked('postBuyEnabled', true)` 로 한다. 주석: 끄기는 세션만(T-16-44), 켜기는 후매수 스위치와 같은 정적 판정(세션 · 구서버 WR-02 · 시세 미수신).
(d) 로그 전이(D-07) — `strategy-log.tsx`. `StrategyTransition` 에 `'postBuyAutoOn' | 'postBuyAutoOff'` 를 더한다. `TRANSITION_TEXT` 는 `postBuyAutoOn: '후매수 자동 체크'`, `postBuyAutoOff: '후매수 자동 해제'` 다. 주석: 서버 사유 줄 「후매수 자동 켬 — …」 과 겹치지 않게 체크 · 해제 어휘를 쓴다. `TRANSITION_ORDER` 에서는 `'postBuyDisarmed'` 바로 뒤에 둔다. `VALUE_COMPARE_SKIP` 에 `'postBuyAuto'` 를 더한다(전이 축이 말한다 — 「서버 반영 완료」 오귀속 방지). `strategyLogLine` 의 첫 스냅샷 분기에서 `next.postBuyAuto` 면 On 이다. 그 밖 분기에서 prev/next 가장자리로 On · Off 를 판정한다(마스터 전이 판정 다음, 매도 앞). 파일 머리 문서에 한 줄을 더한다: 서버 발화 사유는 54 원문 줄이 말하고, 에코는 자동 체크 해제로만 말한다.
(e) 54 사유 줄 표면 — 제품 코드는 바꾸지 않는다(`isLimitChaserServerMessage` 가 src 'LimitChaser' 를 이미 받는다 · gh-trade `Server.cpp` 가 ctx.source "LimitChaser" · INFO · isin/계좌로 보낸다). 테스트로 못박고, SUMMARY 에 「표면 경로 = 기존 라우팅 · 변경 0」 을 적는다.
(f) P24-7 확장 — `trading-workbench.spec.ts` 「P24-7」 의 WORST 에 `postBuyAuto: true` 를 더한다. 밴드 반복 안(펼침 · 접힘 판정 옆)에 후매수 제목줄 측정 한 덩어리를 더한다. `page.evaluate` 로 `[data-slot="lc-group-post-buy"] [data-slot="lc-group-header"]` 를 잰다: `scrollWidth ≤ clientWidth`, 체크 버튼 `scrollWidth ≤ clientWidth` 와 높이 ≥ 32, `lastElementChild` 가 role switch, 스위치 right ≥ 체크 right. 폰 밴드는 매수 pane 에서 잰다. 기존 단언은 바꾸지 않는다. 넘침이나 잘림이 나오면 `GroupHeaderCheck` 쪽(간격 · 패딩 · 라벨 크기)만 고친다. 제목 흐름은 이미 둘째 줄 규칙이 있다. 스위치 크기 · 위치는 바꾸지 않는다.

GREEN 확인 후 커밋: `feat(quick-260929-vzy): 자동 웹 동작 — 매수주문 끄면 자동도 끔 · 켜기 사전 검증 · 비활성 규칙 · 로그 「후매수 자동 체크/해제」 · P24-7 제목줄 폭`. 경로를 명시해 stage 한다.

마지막으로 webapp 전량 테스트, relay 전량 테스트, e2e(vzy-1 · P24-7)와 a11y 매수 카드 매트릭스를 돌린다. 테스트 수 전후를 SUMMARY 에 적는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-log.test.tsx src/lib/__tests__/limit-chaser.test.ts src/components/trading/lc/__tests__/setting-group.test.tsx && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "vzy-1|P24-7" && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/a11y.spec.ts -g "상따 매수 카드 axe" && grep -q "postBuyAutoOff" webapp/src/components/trading/strategy-log.tsx</automated>
  </verify>
  <done>매수주문을 끄는 사람 제출은 한 건에 자동도 끈다. 자동 켜기는 후매수와 같은 사전 검증을 지난다. 비활성 규칙은 켜기만 막는다. 자동 에코 전이는 「후매수 자동 체크/해제」 로 말하고 「서버 반영 완료」 로 오귀속되지 않는다. 서버 54 사유 줄은 「[상따] 서버 통지 — 후매수 자동 켬 — …」 로 선다. 344 · 685 · 830 · 992 에서 후매수 제목줄 넘침 · 잘림이 0 이고 스위치는 오른쪽 끝이다. axe critical/serious 는 0 이다. RED → GREEN 커밋 2건이고, webapp · relay 전량 테스트와 e2e · a11y 가 green 이다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 → relay wss (`lc.set`) | 신뢰하지 않는 입력이다. cfg 의 필드 존재 · 값 · 초과 키를 브라우저가 정한다. 옛 캐시 탭도 여기로 온다 |
| relay → 게이트웨이 (MsgType 10) | 실계좌 반복 발주 설정이다. buy3_schema · post_buy_auto 가 서버 동작(자동 유지 · 덮기)을 가른다 |
| 게이트웨이 → relay → 브라우저 (60/64 · 54) | 서버 진실이다. 에코는 자동 발화 뒤 false 로 오고, 54 는 표시 전용 사유 줄이다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-vzy-01 | Tampering | relay `buildSetLimitChaserReq` buy3_schema | high | mitigate | 브라우저 `buy3Schema` 키는 zod `z.object` 가 떨어뜨린다. 스키마는 `cfg.postBuyAuto` 존재로만 1/2 를 파생한다(0 · 임의 값 불가 · T-24-01 확장). Task 2 envelope ② · protocol ① 이 단언한다 |
| T-vzy-02 | Tampering | 옛 캐시 탭의 전체 cfg 재제출 | high | mitigate | postBuyAuto 부재면 buy3_schema 1 · 필드 미적재로 서버가 자동을 유지한다(사람이 켠 자동을 옛 탭이 조용히 지우지 않는다). 자동은 12필드 판정 밖이다. Task 2 protocol ① · fanout ① |
| T-vzy-03 | Elevation of Privilege | 마스터 OFF 뒤 서버 자동 발화가 마스터를 다시 올려 매수 | high | mitigate | 사람 매수주문 끄기 제출에 `postBuyAuto:false` 를 값 동반으로 싣는다(실패하면 함께 되돌림). shared 입력 타입에서 필수라 새 탭이 빠뜨릴 수 없다(컴파일). Task 3 form ① |
| T-vzy-04 | Tampering | relay `#isTeardown` 자동만 켠 등록 | high | mitigate | 다섯 항 판정이라 자동만 켠 등록은 철거가 아니다. 그래서 엄격 시장 해석(기본 "K" 폴백 금지 · T-16-42)과 무장 가드가 걸린다. Task 2 fanout ② 가 미해석 ISIN 거부를 단언한다 |
| T-vzy-05 | Repudiation / 숨은 무장 | 작업대 카드 걷기 · 삭제 판정 | medium | mitigate | `isActiveStrategy` · `isDeleteIntent` 에 자동을 넣는다. 스스로 매수할 수 있는 전략이 화면에서 사라지거나 crud D 로 지워지지 않는다. Task 2 web lib ①② |
| T-vzy-06 | Denial of Service | relay zod superRefine | medium | accept | 자동 완결성을 zod 에 넣지 않는다(위반 = 소켓 종료 → 시세 · 에코 · 수동주문 정지). 서버가 ERROR 로 자동만 눕히고, 웹은 켜기 전에 사전 검증한다(P-2) |
| T-vzy-07 | Information Disclosure | relay 로그 | low | accept | 새 로그 줄이 없다. 기존 lc.set 로그 규율(계좌번호 미기재 · T-16-45)을 그대로 쓴다 |
| T-vzy-08 | Spoofing | 54 사유 줄 표면 | low | accept | 기존 `isLimitChaserServerMessage` 표시 몫 판정(src LimitChaser)을 그대로 쓴다. 본문을 파싱하지 않는다. 거부 판정(`isLimitChaserSetRejection` · ERROR ∧ SetLimitChaser)은 INFO 사유 줄에 반응하지 않는다 |
</threat_model>

<verification>
- `pnpm --filter @gh-radar/shared build` → relay typecheck · typecheck:tests · 전량 test → webapp typecheck · 전량 test 가 green 이다.
- e2e `vzy-1`(끝-끝 트레이서) · `P24-7`(네 밴드 제목줄) · a11y 「상따 매수 카드 axe」 가 green 이다.
- `git log --format='%s%n%b' <첫 커밋>^..HEAD` 에 Co-Authored-By 가 0건이다. 커밋 파일에 `.planning/state.json` 등 다른 세션 파일이 없다.
- `relay/src/generated` 변경은 chore 커밋 하나에 2파일뿐이다. Phase 25 생성물은 남아 있다.
</verification>

<success_criteria>
- Task 1: 실브라우저 한 경로(체크 → 10 buy3_schema 2 · post_buy_auto → 에코 표시 → 발화 에코로 풀림 · [상따] 사유 줄)가 e2e 로 증명된다. 생성물은 단독 chore 커밋이다.
- Task 2: 계약 불변식(스키마 파생 · 12필드 분리 · 57키)과 「자동만 켠 등록 ≠ 삭제」 가 relay · 웹 양 끝에서 같은 다섯 항으로 선다.
- Task 3: 매수주문 끄기 동반 끔 · 자동 켜기 사전 검증 · 비활성 규칙 · 로그 전이 · 54 표면 · 네 밴드 폭이 테스트로 잠긴다.
- 배포 · push 없음. 메인 세션이 relay 먼저 → 검증 → push 순서로 반영한다. 배포된 relay(4c143596) 뒤에는 Phase 25 relay 커밋이 쌓여 있다. relay 배포 시점과 동반 여부는 메인 세션이 정한다.
</success_criteria>

<output>
`/Users/alex/repos/gh-radar/.planning/quick/260929-vzy-post-buy-auto-checkbox-relay-webapp/260929-vzy-SUMMARY.md` 를 만든다. 담을 것:
- 커밋 표(해시 · 메시지 · 파일)
- RED/GREEN 실패 이유
- relay · webapp 테스트 수 전후
- 수기 사본 점검 결과(msg-type · hub 변경 없음 근거 한 줄씩 · envelope 주석 수정 목록)
- 위치 해석(D-05 — 제목줄 스위치 바로 앞)과 되돌리는 법(`SettingGroup` 두 노드 순서)
- 이월 한 줄: 15:40 해제 귀속(`limitChaserGateDisarmed` · `marketCloseReleaseKeysOf`)은 자동만 켠 전략을 세지 않는다 — 그 에코는 「후매수 자동 해제」 로만 적힌다
- 배포 메모: relay 먼저 배포하고, webapp push 는 그 뒤다. 새 webapp + 옛 relay 조합이면 zod 가 postBuyAuto 를 떨어뜨려 자동 체크가 「반영하지 못했어요」 로 되돌아간다
</output>
