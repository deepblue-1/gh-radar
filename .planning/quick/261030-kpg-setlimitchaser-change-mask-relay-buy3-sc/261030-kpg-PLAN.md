---
phase: quick-261030-kpg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/lc-change-mask.ts
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/lc-change-mask.ts
  - relay/src/dma/envelope.ts
  - relay/src/ws/protocol.ts
  - relay/src/ws/fanout.ts
  - relay/src/dma/__tests__/lc-change-mask.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/protocol.test.ts
  - relay/tests/fanout.test.ts
  - relay/tests/helpers/fake-gateway.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
autonomous: true
requirements: [CM-01, CM-02, CM-03, CM-04, CM-05, CM-06]

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "relay: 새 클라 cfg(앞 다섯 조건 — postBuyAuto · extraBuyBurstRelease · 자동매도 4필드 · extraBuyAuto 전부 있음) + changed [\"preBuyEnabled\"] 인 lc.set 은 게이트웨이 SetLimitChaser 에 buy3_schema 6 · change_mask = 1n << 3n 으로 나간다(fanout e2e)"
    - "relay: changed 가 없는 lc.set(구 탭 · 배포 전 webapp)은 종전과 같은 buy3_schema(같은 cfg 면 5) · change_mask 슬롯 없음(읽으면 0n)으로 나간다 — relay 를 webapp 보다 먼저 배포해도 동작 불변"
    - "relay: changed 에 비트 표 밖 이름이 하나라도 있으면 change_mask 를 싣지 않고 종전 schema(≤5 = 서버 전체 반영)로 보내며 warn 1줄(userId · isin · 모르는 이름 최대 5개 — 계좌 · 값 없음)을 남긴다. 거부 프레임 0 · 소켓 유지 · 사용자 편집은 버려지지 않는다"
    - "relay: 금액 · 가격 · 추적 OFF 수정은 gh-trade D-10 짝 수량 비트를 같이 세운다 — buyOrderAmount → 4|5, buyOrderPrice → 1|5|16|25, buyWatchPrice → 2|7|10|18|20|28, sellWatchPrice → 32|34|40|43, sellQtyTrackEnabled(값 false) → 36|33|34, cancelQtyTrackEnabled(값 false) → 45|42|43 등 16규칙 전부. 체크 칸은 파생 없음"
    - "relay: 이름→비트 표 50행이 인계 노트 ② 와 같고, ../gh-trade 의 LimitChaserChangeMask.h 가 있으면 그 비트 상수 50줄(비트 · 와이어 이름)과도 같다(없으면 그 대조만 skip)"
    - "relay: lcBuy3SchemaOf 는 앞 다섯 조건 전부 + changeMask 존재일 때만 6 이다. changeMask 만 있고 앞 조건 미달이면 낮은 schema · change_mask 미적재 · 조립기 warn(P-1 단조성)"
    - "webapp: 상따 확정 1회 = lc.set 1회의 프레임마다 changed 가 실린다 = 그 확정의 주 필드 + 그 확정이 실제로 싣는 동반 필드(+ 미등록 전략에서 로컬 반영한 칸 — 송신 성공 직후 비움). 짝 수량 이름 · postBuyReentry 는 싣지 않는다. 에코 적용은 changed 를 만들지도 비우지도 않는다. no-op · 대기열 · 재전송 규칙은 그대로다"
    - "SUMMARY 에 인계 노트 질문(웹 탭 손댐 정의가 gh-trade D-05 와 같은가)의 답이 있다 — 웹이 무엇을 손댐으로 세는지와 WinForms 와 다른 두 지점(같은 값 단독 확정 = 프레임 없음 · 대기열 안 재확정 접힘)"
  artifacts:
    - path: "packages/shared/src/lc-change-mask.ts"
      provides: "LC_CHANGE_MASK_FIELDS(50행 · 인덱스 = 비트 · cfg 키 + 와이어 이름) · LcChangeMaskField · isLcChangeMaskField — relay 비트 계산과 webapp changed 타입이 읽는 한 벌"
      contains: "export const LC_CHANGE_MASK_FIELDS"
    - path: "relay/src/dma/lc-change-mask.ts"
      provides: "lcChangeMaskOf(changed, cfg) → { mask: bigint; unknown: string[] } · LC_CHANGE_MASK_PAIR_RULES(gh-trade D-10 16규칙 · WinForms 컨트롤 이름 병기)"
      contains: "export function lcChangeMaskOf"
    - path: "relay/src/dma/envelope.ts"
      provides: "LC_CHANGE_MASK_BUY3_SCHEMA = 6 · LcSetCfg.changeMask?: bigint · lcBuy3SchemaOf 6 파생 · addChangeMask(vt 174) · 미달 warn · ulong 범위 가드"
      contains: "SetLimitChaser.addChangeMask"
    - path: "relay/src/ws/protocol.ts"
      provides: "RelayLcSetSchema 최상위 changed: string 배열(선택 · 상한 64 · 원소 1~64자 — enum 아님)"
      contains: "changed: z"
    - path: "relay/src/ws/fanout.ts"
      provides: "lc.set 분기가 msg.changed → lcChangeMaskOf → 모르는 이름 warn · 폴백 → buildSetLimitChaserReq 에 changeMask"
      contains: "lcChangeMaskOf("
    - path: "packages/shared/src/relay.ts"
      provides: "RelayLcSetMsg.changed: LcChangeMaskField[] (새 클라 계약 = 필수)"
      contains: "changed: LcChangeMaskField[]"
    - path: "webapp/src/lib/limit-chaser.ts"
      provides: "lcChangedFieldsOf(keys) — 중복 제거 · postBuyReentry 만 뺌 · 폼 키 ⊆ 비트 표 ∪ {postBuyReentry} 컴파일 타임 단언"
      contains: "export function lcChangedFieldsOf"
    - path: "webapp/src/components/trading/lc/use-lc-field-commit.ts"
      provides: "sendNow 가 changed 를 싣는다 · 미등록 로컬 손댐 기억(송신 성공 직후 비움) · 머리 주석 ⑭"
      contains: "changed"
  key_links:
    - from: "webapp/src/components/trading/lc/use-lc-field-commit.ts sendNow"
      to: "packages/shared/src/relay.ts RelayLcSetMsg.changed"
      via: "send({ t: 'lc.set', cfg, changed }) — changed = lcChangedFieldsOf(로컬 손댐 ∪ 주 필드 ∪ 동반 키)"
      pattern: "changed"
    - from: "relay/src/ws/protocol.ts RelayLcSetSchema.changed"
      to: "relay/src/ws/fanout.ts lc.set 분기"
      via: "msg.changed(zod 출력 string[] | undefined) → lcChangeMaskOf(msg.changed, cfg)"
      pattern: "msg\\.changed"
    - from: "relay/src/dma/lc-change-mask.ts lcChangeMaskOf"
      to: "packages/shared/src/lc-change-mask.ts LC_CHANGE_MASK_FIELDS"
      via: "이름 → 인덱스(= 비트) → 1n << BigInt(bit) OR + 짝 규칙"
      pattern: "LC_CHANGE_MASK_FIELDS"
    - from: "relay/src/ws/fanout.ts"
      to: "relay/src/dma/envelope.ts buildSetLimitChaserReq"
      via: "{ ...cfg, market, changeMask } → lcBuy3SchemaOf 6 → SetLimitChaser.addChangeMask(b, mask)"
      pattern: "addChangeMask\\(b"
---

<objective>
gh-trade Phase 44 인계(docs/inbox/from-gh-trade/261030-limitchaser-change-mask.md — 이 계획의 스펙)를 처리한다. 웹 탭 → relay 의 상따 SetLimitChaser 제출이 「사람이 이번에 손댄 칸」 비트마스크(change_mask · field id 85 · vtable 174)를 싣고 buy3_schema 6 으로 나가게 해, 2026-10-28 사고(금액만 고친 재제출이 체크 ON 스냅샷을 실어 소진된 선·줄매수를 재무장 → 중복 발주)와 같은 재무장을 웹 경로에서도 막는다.

웹이 지금 어떻게 보내는가(계획 시점 실측 — 설계의 전제):
- 상따 설정 화면은 「필드 1회 확정 = lc.set 1회」다(webapp/src/components/trading/lc/use-lc-field-commit.ts · Phase 20 D-04). 시트 「적용」 · 인라인 Enter/blur · 키패드 · 3택 선택 · 체크/스위치 클릭이 모두 같은 훅의 commit(field, value, kind, companions?, meta?) 한 번이고, 그 cfg 는 「서버 동기값(formFromServer(server, formRef)) + 동반 필드 + 주 필드」 전체다. 더티 누적 · 「수정」 버튼 · 「기본값으로」 버튼은 없다.
- 그래서 「손댐」 집합은 따로 쌓을 필요 없이 **그 확정의 주 필드 + 그 확정이 실제로 싣는 동반 필드 키**다. 예외는 미등록 전략(server null)에서 로컬 반영만 한 확정('local') — 그 칸들은 아직 송신되지 않은 사람 손댐이라 다음 송신 프레임의 changed 에 합치고 송신 성공(send() true) 직후 비운다(gh-trade D-05 「송신 성공 직후 비운다」).
- 짝 수량 비트는 relay 몫이다(gh-trade D-10) — 웹은 사람이 손댄 폼 키 이름만 보낸다(폼은 수량 칸을 편집하지 않는다 — LimitChaserFormValues 가 수량 11개를 뺐다).

잠긴 결정(인계 노트 — 태스크에서 「gh-trade D-nn」 으로 인용):
- gh-trade D-05 손댐 = 사람 조작(클릭 · 입력 · 스핀 · Enter · 콤보 · [기본값]) · 값이 같아도 비트 · ON→OFF→ON 도 비트 · 에코 diff 아님 · 에코 적용은 손댐이 아니고 비우지도 않음 · 송신 성공 직후 비움.
- gh-trade D-07 신규 등록 · 삭제(crud D)는 서버가 마스크를 무시하고 전체 반영.
- gh-trade D-10 짝 비트는 relay 가 세운다(16규칙 — 노트 ③ 표 · 컨트롤 → 와이어 매핑은 노트 ② 「클라 컨트롤」 열).
- gh-trade D-12 [기본값] 버튼이 있으면 바뀐 칸 전부 — 웹 상따 폼에는 그런 버튼이 없다(계획 시점 grep 확인 · 실행자가 한 번 더 확인).
- lcBuy3SchemaOf 단조성 — 6 은 앞 다섯 조건 전부 + changeMask 존재일 때만(P-1).
- 에코 적용 코드 무변경 · DB 마이그레이션 없음 · gh-trade 저장소 편집 금지.

플래너 재량 결정(근거는 태스크에 적는다):
- 비트 표(이름 50 · 인덱스 = 비트)는 packages/shared 에 한 벌 — relay 비트 계산과 webapp 의 changed 타입이 같은 표를 본다(LC_AMOUNT_PAIRS 선례). 마스크 계산 · 짝 규칙은 relay 모듈(D-10 의 책임 위치).
- changed 는 cfg 밖 최상위 키다(cfg = 전략 표, changed = 이번 제출의 메타). relay zod 는 enum 이 아닌 string 배열로 받는다 — zod 위반은 close(4400) 라 그 소켓의 시세 · 에코 · 수동주문까지 멈춘다.
- **모르는 이름 → change_mask 없이 종전 schema(전체 반영) 폴백 + warn.** 근거: ① 사용자 편집이 버려지지 않는다(전체 반영이 그 값을 싣는다 — 일부 비트만 세우면 그 칸이 조용히 버려진다) ② 실패 모양 = 지금 운영 동작(D-14 warn 으로 서버에서도 관측) ③ 거부하면 배포 순서가 어긋난 날(webapp 이 새 비트 이름을 relay 보다 먼저 보냄) 장중 웹 상따 설정 변경이 전부 막힌다 ④ 무로그 fail-safe 금지 규칙대로 warn 1줄.
- 빈 배열 [] 은 프로토콜 그대로 마스크 0n · schema 6(= 아무 칸도 반영 안 함). 웹은 주 필드가 늘 있어 빈 배열을 만들지 않는다(테스트로 잠금).

순서: T1 트레이서(relay 한 경로 — WS 인바운드 → 게이트웨이 프레임, 체크 1칸) → T2 확장(짝 수량 비트 + 비트 표 gh-trade 대조 + 세대 단조성 · zod 경계) → T3 확장(webapp 이 손댐 칸을 싣는다 — 이 태스크 뒤부터 웹 사용자의 제출이 실제로 보호된다).

Purpose: 웹 탭에서 금액만 고친 재제출이 이미 나간 선·줄매수를 다시 열지 않는다.
Output: shared 비트 표 1 · relay 마스크 모듈 1 · relay 조립기 · 스키마 · fanout 배선 · webapp 훅 · lib 헬퍼 + 테스트. 커밋 3개(배포 · push 없음).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@docs/inbox/from-gh-trade/261030-limitchaser-change-mask.md

<interfaces>
<!-- 계획 시점(2026-10-30, HEAD 652c7f86) 실측. 실행자가 다시 탐색하지 않아도 되게 뽑아 둔 계약. -->

gh-trade(읽기 전용 · 편집 금지)
- /Users/alex/repos/gh-trade/server/src/trade/strategy/LimitChaserChangeMask.h 25~80행: 비트 상수 50줄, 한 줄 하나 · 꼴 「inline constexpr uint64_t kMaskXxx = 1ULL << N;  // wire_name」(헤더 8~9행이 이 꼴을 파싱 대상으로 보장). 그룹 마스크 줄(84~97행)은 「(((1ULL << …」 꼴이라 같은 정규식에 걸리지 않는다. kMaskFields[50] 113~164행.
- 와이어 이름 → relay cfg 키는 snake → camel 그대로다(extra_buy_* ↔ extraBuy* · cancel_qty_track_enabled ↔ cancelQtyTrackEnabled). 50개 모두 숫자 없는 소문자 단어라 변환이 손실 없다.
- 노트 ② 50행(비트 · 와이어): 0 buy_enabled · 1 buy_order_price · 2 buy_watch_price · 3 pre_buy_enabled · 4 buy_order_amount · 5 buy_order_qty · 6 buy_watch_amount · 7 buy_watch_qty · 8 buy_trade_qty_enabled · 9 buy_min_trade_amount · 10 buy_min_trade_qty · 11 sweep_enabled · 12 sweep_min_tick_count · 13 sweep_watch_price · 14 extra_buy_enabled · 15 extra_buy_order_amount · 16 extra_buy_order_qty · 17 extra_buy_min_amount · 18 extra_buy_min_qty · 19 extra_buy_max_amount · 20 extra_buy_max_qty · 21 extra_buy_burst_release · 22 extra_buy_auto · 23 post_buy_enabled · 24 post_buy_order_amount · 25 post_buy_order_qty · 26 post_buy_rebound_pct · 27 post_buy_floor_amount · 28 post_buy_floor_qty · 29 post_buy_auto · 30 sell_enabled · 31 sell_order_price · 32 sell_watch_price · 33 sell_watch_amount · 34 sell_watch_qty · 35 sell_order_ratio · 36 sell_qty_track_enabled · 37 sell_qty_track_ratio · 38 sell_trade_qty_enabled · 39 sell_min_trade_amount · 40 sell_min_trade_qty · 41 cancel_qty_enabled · 42 cancel_watch_amount · 43 cancel_watch_qty · 44 cancel_trade_enabled · 45 cancel_qty_track_enabled · 46 auto_sell_enabled · 47 auto_sell_start_cond · 48 auto_sell_ratio_pct · 49 auto_sell_method.
- 노트 ③ D-10 짝 규칙(컨트롤 → 비트, 컨트롤 → 와이어는 ② 「클라 컨트롤」 열): numBuyOrderAmount(4 buy_order_amount)→5 · numBuyWatchQty(6 buy_watch_amount)→7 · numBuyMinTradeQty(9 buy_min_trade_amount)→10 · numAddBuyOrderAmount(15)→16 · numAddBuyMinQty(17)→18 · numAddBuyMaxQty(19)→20 · numPostBuyOrderAmount(24)→25 · numPostBuyFloorQty(27)→28 · numSellWatchQty(33 sell_watch_amount)→34 · numSellMinTradeQty(39)→40 · numCancelQty(42 cancel_watch_amount)→43 · numBuyOrderPrice(1)→{5,16,25} · numBuyWatchPrice(2)→{7,10,18,20,28} · numSellWatchPrice(32)→{34,40,43} · chkSellQtyTrack(36, OFF 로 바뀔 때)→{33,34} · chkCancelByTracking(45, OFF)→{42,43}.

relay 생성물(커밋 652c7f86 에서 이미 동기화)
- relay/src/generated/stock-dma/set-limit-chaser.ts: changeMask(): bigint (410행) · static addChangeMask(builder, changeMask: bigint) = addFieldInt64(85, changeMask, BigInt('0')) (719행) — 0n 은 기본값이라 버퍼에 안 쓰인다(서버는 부재 = 0 으로 읽는다 = 동치).

relay/src/dma/envelope.ts (3741행)
- 77행 import { SetLimitChaser } · 1117행 class OrderBuildError(code: string, message) — code 는 자유 문자열.
- 1377~1390행 toWireUint · toWireUByte(범위 = 와이어 표현 범위만).
- 1404~1445행 클라 고정 · schema 상수: LC_FIXED_BUY3_SCHEMA 1 · LC_POST_BUY_AUTO_BUY3_SCHEMA 2 · LC_BURST_RELEASE_BUY3_SCHEMA 3 · LC_AUTO_SELL_BUY3_SCHEMA 4 · LC_EXTRA_BUY_AUTO_BUY3_SCHEMA 5 (각각 JSDoc 이 근거 커밋 · P-1 단조성 서술).
- 1447~1469행 LcAutoSellReqKey · LcSetCfg = Omit<RelayLimitChaserInput, 선택 키들> & Partial<금액 8> & { postBuyAuto? … extraBuyAuto? }.
- 1471~1487행 lcBuy3SchemaOf(cfg: Pick<LcSetCfg, "postBuyAuto" | "extraBuyBurstRelease" | LcAutoSellReqKey | "extraBuyAuto">) — 마지막 줄 return LC_EXTRA_BUY_AUTO_BUY3_SCHEMA.
- 1507~1545행 buildSetLimitChaserReq JSDoc(필드 수 서술 「최대 51 필드」 · schema 파생 서술).
- 1586~1613행 buy3Schema 파생 + 미달 warn 3종(버스트 · 자동매도 · extraBuyAuto — 전부 「buy3Schema < 상수」 꼴, 문구 「[DMA] … 가 schema N 조건을 못 채움 — 낮은 buy3_schema 로 내리고 … 미적재」).
- 1666행 addBuy3Schema · 1687~1716행 선택 필드 적재(전부 「buy3Schema >= 상수」 꼴이라 6 에서도 실린다) · 1717~1725행 금액 8 · 1726행 endSetLimitChaser.
- 유일 호출부: relay/src/ws/fanout.ts 2049행.

relay/src/ws/protocol.ts
- 157~307행 RelayLcSetSchema = z.object({ t: z.literal("lc.set"), cfg: z.object({...}).superRefine(...) }). 기본 strip(.strict() 아님 — 494행 주석 규율) → 지금 webapp 이 changed 를 실어도 조용히 떨어진다(배포 순서 무관 안전).
- 568행 RelayInboundSchema = z.discriminatedUnion("t", [...]) · 684행 parseInbound(raw) → RelayInboundWire | null(null = close 4400).
- 632~656행 RelayInboundWireLcSetCfg · buy3CfgOf(cfg) → LcSetCfg | null · withNeutralBuy3.

relay/src/ws/fanout.ts
- 184~191행 envelope import 목록(buildSetLimitChaserReq · type LcSetCfg …).
- 1982~2054행 lc.set 분기: 세션 · 계좌 가드 → cfg = buy3CfgOf(msg.cfg) (null 이면 구 탭: 철거면 withNeutralBuy3, 아니면 거부 프레임) → #withEchoAmounts → teardown 판정 · market → #strategyArmable → #buildStrategyPayload(conn, userId, msg.t, () => buildSetLimitChaserReq({ ...cfg, market })) → session.send. 로그는 계좌번호를 싣지 않는다(T-16-45).

relay 테스트
- relay/src/dma/__tests__/envelope.test.ts: 160행 warn = vi.spyOn(logger, "warn") · 169행 readBack(bytes) → Envelope · 1322행 type LcBuildInput = LcSetCfg & { market } · 1324행 lcInput(over) · 1382행 presentSlots(t, vts) · 3234~행 「③-extra-auto … buy3_schema 5 파생」 describe(FULL = postBuyAuto · extraBuyBurstRelease · 자동매도 4 · readLc 패턴) — 새 describe 는 이 뒤에 같은 모양으로.
- relay/tests/protocol.test.ts: 33행~ lcCfg(overrides) · 116행 JSON.stringify({ t: "lc.set", cfg }) · 167행 「① lc.set 43필드가 파싱되고 …」.
- relay/tests/fanout.test.ts: 199행 lcInput(overrides: Partial<LcSetCfg>) — 선택 6필드 없음(= schema 1) · 2119~2172행 「P31 트레이서」 describe(authed · a.ws.sendRaw · gateway.strategyRequests() · readSetLimitChaserRequest · framesOf(a.inbox, "msg")) · 624/1870행 vi.spyOn(logger, "warn") 패턴.
- relay/tests/helpers/fake-gateway.ts: 573행 interface SetLimitChaserRequest · 701~행 readSetLimitChaserRequest(msgType, payload) — 724행 buy3Schema: req.buy3Schema().
- relay 는 "type": "module" — 테스트에서 new URL("…", import.meta.url) 사용 가능(envelope.test.ts 2172행 선례).

shared
- packages/shared/src/relay.ts 700~708행 RelayLcSetMsg = { t: "lc.set"; cfg: RelayLimitChaserInput } (JSDoc 「부분 갱신이 없다 · cfg 는 전체」) · 930행 RelayInbound 유니온.
- packages/shared/src/index.ts 264행 export * from "./lc-amount" — 같은 꼴로 한 줄.
- dist 는 커밋 대상 아님. relay · webapp 은 dist 를 읽는다 → shared 를 고친 뒤 pnpm --filter @gh-radar/shared build 를 먼저 돌려야 relay/webapp tsc · vitest 가 새 export 를 본다.

webapp
- webapp/src/lib/limit-chaser.ts 81~101행 LimitChaserFormValues = Omit<RelayLimitChaserInput, 정체성 3 · crud · 수량 11 · sweep 고정 3> — 남는 폼 키 40개 중 비트 표 밖은 postBuyReentry 하나(buildCfg 가 255 고정 · 행 없음 · 서버가 읽지 않음 · 노트 ② 「식별·고정·봉인」). 나머지 39개는 전부 비트 표 안(계획 시점 대조 완료).
- webapp/src/lib/__tests__/limit-chaser.test.ts 존재.
- webapp/src/components/trading/lc/use-lc-field-commit.ts: 1~144행 머리 주석(①~⑬) · 159행 LcFieldKey = keyof LimitChaserFormValues · 404~412행 companionsAt · 640~699행 sendNow(646행 companions = companionsAt(p, base, laid) · 676행 if (!send({ t: 'lc.set', cfg })) …) · 702~732행 drain(716~720행 미등록 · 게이트 밖 → setForm 로컬 반영 + markSuccess) · 791~879행 commit(839~847행 no-op · 857~861행 미등록 로컬 반영 'local').
- webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx: 127~159행 setup(over) — send = vi.fn(() => true) · cfgs() = send.mock.calls.map(([m]) => m.cfg) · server null 이면 미등록.
- webapp/src/components/trading/limit-chaser-form.tsx: commitField 호출 1034 · 1083 · 1095(값) · 1153(체크) · 1320(그룹 켬 + 동반 함수) · 1356~1364(그룹 끔 + 동반) · 1384~1385(마스터) · 1408(후매수 자동) · 1533(serverFold 자동 마스터 끔 · meta.cause) — 이 파일은 고치지 않는다(모든 경로가 훅 한 곳을 지난다).
- lc.set 을 만드는 비테스트 코드는 훅 676행 한 곳뿐이다(grep 확인).
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (트레이서): relay 한 경로 — lc.set 의 changed 이름 배열 → 비트 표 → buy3_schema 6 + change_mask 와이어 (체크 1칸 · fanout e2e)</name>
  <files>packages/shared/src/lc-change-mask.ts, packages/shared/src/index.ts, relay/src/dma/lc-change-mask.ts, relay/src/dma/envelope.ts, relay/src/ws/protocol.ts, relay/src/ws/fanout.ts, relay/tests/helpers/fake-gateway.ts, relay/tests/fanout.test.ts</files>
  <read_first>
    - docs/inbox/from-gh-trade/261030-limitchaser-change-mask.md ① · ② · ③ 「lcBuy3SchemaOf 단조성」 · 「gh-radar 가 할 일」
    - /Users/alex/repos/gh-trade/server/src/trade/strategy/LimitChaserChangeMask.h 1~81행(머리 규칙 · 비트 상수 50줄)
    - packages/shared/src/lc-amount.ts 머리 주석(shared 표 모듈 서술 꼴) · packages/shared/src/index.ts 260~266행
    - relay/src/dma/envelope.ts 1404~1505행 · 1507~1733행
    - relay/src/ws/protocol.ts 128~160행 · 249~266행 · 568~575행
    - relay/src/ws/fanout.ts 184~191행 · 1982~2054행
    - relay/tests/helpers/fake-gateway.ts 573~600행 · 701~760행
    - relay/tests/fanout.test.ts 190~265행(lcInput) · 2119~2172행(P31 트레이서 — 같은 모양으로 쓴다)
  </read_first>
  <action>
    한 경로 = 「선매수 체크 1칸만 손댄 제출」(사고와 같은 표면 — 체크 칸은 짝 파생이 없어 T2 짝 규칙 없이도 완결된 경로다). 이 태스크로 shared 표 · relay 마스크 계산 · zod · fanout · 조립기가 전부 연결되고, T2 는 같은 모듈에 짝 규칙만 더한다(구조 변경 없음).

    ① packages/shared/src/lc-change-mask.ts 새 파일. 머리 주석: 정본 = gh-trade server/docs/protocol.md 「SetLimitChaser change_mask 비트 표 (Phase 44)」 · 기계 판 server/src/trade/strategy/LimitChaserChangeMask.h kMaskFields[] (gh-trade 55e62638 · 인계 노트 경로) · 규칙 append-only · 재사용 · 재배치 금지 · 새 칸은 50부터 · 64비트가 차면 gh-trade 가 change_mask_hi(id 86 · vt 176)를 append 하고 이 모듈도 그때 확장 · 인덱스 = 비트 · 웹은 이 표의 이름만 보내고 마스크(짝 비트 포함)는 relay 가 만든다(gh-trade D-10) · 대조 테스트는 relay/src/dma/__tests__/lc-change-mask.test.ts. 본문: LC_CHANGE_MASK_FIELDS = 50개 { key, wire } 객체 배열(비트 0→49 순 · interfaces 의 노트 ② 표 그대로 · key = RelayLimitChaserInput 의 camelCase 키 · wire = fbs snake 이름)을 as const 로 두고 satisfies 로 key 가 keyof RelayLimitChaserInput 임을 컴파일 타임에 잠근다(import type 은 ./relay). type LcChangeMaskField = 그 key 유니온. isLcChangeMaskField(name: string): name is LcChangeMaskField(내부 Set 조회). packages/shared/src/index.ts 에 export * from "./lc-change-mask" 한 줄(264행 lc-amount 옆).

    ② relay/src/dma/lc-change-mask.ts 새 파일. lcChangeMaskOf(changed: readonly string[], cfg: { sellQtyTrackEnabled: boolean; cancelQtyTrackEnabled: boolean }): { mask: bigint; unknown: string[] } — 이름마다 isLcChangeMaskField 면 1n << BigInt(LC_CHANGE_MASK_FIELDS 인덱스) 를 OR, 아니면 unknown 에 (중복 없이) 담는다. 빈 배열 = { mask: 0n, unknown: [] }. cfg 인자는 Task 2 의 「추적 OFF 로 바뀔 때」 짝 규칙(gh-trade D-10)이 읽는 값이다 — 시그니처를 지금 고정해 Task 2 가 fanout 호출부를 다시 고치지 않게 한다. JSDoc 은 이 함수가 「사람 이름 → 자기 비트, 모르는 이름 → unknown」 을 낸다는 사실과 짝 규칙이 이 함수 안에 산다는 위치만 적는다(규칙 표 자체는 Task 2). 이름→인덱스는 모듈 로드 시 한 번 Map 으로 만든다. 순수 함수 — 로그를 남기지 않는다(로그는 userId 를 아는 fanout 몫).

    ③ relay/src/dma/envelope.ts. LC_EXTRA_BUY_AUTO_BUY3_SCHEMA 뒤에 export const LC_CHANGE_MASK_BUY3_SCHEMA = 6 + JSDoc(gh-trade Phase 44 · 55e62638 · quick-261030-kpg — change_mask(vt 174)를 싣는 세대 · 서버는 6 이상에서만 마스크를 읽는다 · 6 + 마스크 0 = 아무 칸도 반영 안 함 · ≤5 = 종전 전체 반영 · 병합은 기존 전략만(신규 등록 · crud D 는 마스크 무관 — gh-trade D-07) · 6 은 앞 다섯 조건 전부 + changeMask 존재일 때만(P-1 — 마스크가 5 이하 세대에 실리면 서버가 읽지 않아 전체 반영된다)). LcSetCfg 의 선택 키 블록에 changeMask?: bigint 를 더하고 JSDoc 에 「relay 내부 전용 — fanout 이 브라우저의 changed 이름 배열로 만든다 · zod cfg 에 없다 · 브라우저가 값을 고를 수 없다」. lcBuy3SchemaOf 의 Pick 에 "changeMask" 를 더하고 마지막 return 을 「changeMask 가 undefined 면 5, 아니면 6」 으로 바꾼다 · 표 주석 한 줄 추가. buildSetLimitChaserReq: extraBuyAuto 미달 warn 뒤에 같은 꼴의 warn(cfg.changeMask !== undefined ∧ buy3Schema < 6 → 「[DMA] changeMask 가 schema 6 조건을 못 채움 — 낮은 buy3_schema 로 내리고 change_mask 미적재(서버 전체 반영)」 · 필드 { isin, buy3Schema } 만). 금액 8 적재 뒤 · endSetLimitChaser 앞에 buy3Schema >= 6 ∧ cfg.changeMask !== undefined 일 때만 SetLimitChaser.addChangeMask(b, toWireULong(cfg.changeMask, "changeMask")). toWireULong 은 toWireUByte 옆에 새로 — 0n 미만 또는 2^64−1 초과면 OrderBuildError("ULONG_RANGE", …)(toWireUint 와 같은 「와이어 표현 범위만」 규율). 1507~1545행 JSDoc 의 필드 수 · schema 파생 서술에 change_mask(schema 6 일 때만 · 1필드)와 6 을 더한다. 에코 해석(S→C) 코드는 건드리지 않는다.

    ④ relay/src/ws/protocol.ts RelayLcSetSchema 최상위(cfg 옆)에 changed: z.array(z.string().min(1).max(64)).max(64).optional(). 바로 위 JSDoc(128~156행 블록 끝에 한 단락): 이번 제출에서 사람이 손댄 칸 이름(shared LC_CHANGE_MASK_FIELDS 의 key) · relay 가 비트 표 + 짝 규칙으로 change_mask 를 만든다 · enum 이 아닌 이유(모르는 이름이 zod 위반 = close 4400 이면 그 소켓의 시세 · 에코 · 수동주문이 멈춘다 — 판정은 fanout) · 선택인 이유(구 탭 · webapp 배포 전 → 종전 schema · relay 먼저 배포 가능) · 상한(비트 64 · 이름 최장 21자의 넉넉한 상한). cfg 쪽 zod 는 건드리지 않는다.

    ⑤ relay/src/ws/fanout.ts lc.set 분기. envelope import 옆에 lcChangeMaskOf import. #strategyArmable 통과 뒤 · #buildStrategyPayload 앞에서 changeMask 를 정한다: msg.changed 가 undefined 면 undefined · 아니면 lcChangeMaskOf(msg.changed, cfg) — unknown 이 하나라도 있으면 logger.warn({ userId, t: msg.t, isin: cfg.isin, unknown: unknown.slice(0, 5), unknownCount }, "[WS] lc.set changed 에 비트 표 밖 이름 — change_mask 없이 종전 전체 반영(buy3_schema ≤5)") 후 undefined(폴백 근거 4줄을 주석으로: 편집 보존 · 운영 동작과 같음 · 거부하면 배포 어긋난 날 웹 상따 수정 전면 차단 · 무로그 금지). 계좌번호 · 값 · bigint 를 로그에 싣지 않는다(pino 직렬화 · T-16-45). 조립 호출을 buildSetLimitChaserReq({ ...cfg, market, ...(changeMask === undefined ? {} : { changeMask }) }) 로 바꾼다. 철거(teardown) · 구 탭 withNeutralBuy3 경로도 같은 줄을 지난다(구 탭은 changed 가 없어 영향 없음 · 새 탭 철거는 서버가 마스크 무관 — gh-trade D-07).

    ⑥ relay/tests/helpers/fake-gateway.ts SetLimitChaserRequest 에 changeMask: bigint 를 더하고 readSetLimitChaserRequest 가 req.changeMask() 를 싣는다.

    ⑦ RED → GREEN: relay/tests/fanout.test.ts 의 P31 트레이서 describe 뒤에 새 describe 「quick-261030-kpg change_mask 트레이서 (gh-trade Phase 44)」. 새 클라 cfg = lcInput({ postBuyAuto: false, extraBuyBurstRelease: false, autoSellEnabled: false, autoSellStartCond: 0, autoSellRatioPct: 0, autoSellMethod: 0, extraBuyAuto: false }) (값은 zod · 무장 가드를 통과하는 중립값 — 막히면 lcInput 기본값에 맞춰 조정). 세 케이스: (a) changed ["preBuyEnabled"] → 10 한 건 · buy3Schema 6 · changeMask === 1n << 3n · 브라우저 msg 거부 프레임 0. (b) 같은 cfg · changed 없음 → buy3Schema 5 · changeMask 0n. (c) changed ["preBuyEnabled", "noSuchField"] → buy3Schema 5 · changeMask 0n · warn 호출 중 문구에 「비트 표 밖 이름」 이 있고 그 객체의 unknown 이 ["noSuchField"] · 거부 프레임 0. 먼저 테스트를 쓰고 실패를 본 뒤 ①~⑥ 으로 초록을 만든다(RED 줄을 SUMMARY 에 한 줄).

    커밋: git status -sb 로 남의 변경(tasks/lessons.md · .planning/milestone.lock · .planning/phases/36-account-budget/.gitkeep)을 확인하고 이 태스크 파일만 경로 지정 git add(-A 금지). 메시지(한글 · Co-Authored-By 없음) 예 「feat(relay): 상따 change_mask 트레이서 — lc.set changed 이름 → buy3_schema 6 · change_mask(vt 174)」. push · 배포 금지.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && cd relay && npx vitest run --maxWorkers=2 tests/fanout.test.ts && npx tsc --noEmit && npx tsc -p tsconfig.tests.json --noEmit</automated>
  </verify>
  <done>WS 로 들어온 lc.set(changed ["preBuyEnabled"])이 게이트웨이에 buy3_schema 6 · change_mask 0x8 로 나가고, changed 없는 프레임은 종전 schema 5 · 마스크 없음, 모르는 이름은 warn + 종전 schema 로 나간다(fanout e2e 3케이스 초록 · 기존 fanout 테스트 전부 초록 · relay tsc 두 벌 0 오류). 커밋 1개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 금액 · 가격 · 추적 OFF 수정이 짝 수량까지 반영된다 — gh-trade D-10 짝 비트 16규칙 + 비트 표 gh-trade 대조 + 세대 단조성 · zod 경계</name>
  <files>relay/src/dma/lc-change-mask.ts, relay/src/dma/__tests__/lc-change-mask.test.ts, relay/src/dma/__tests__/envelope.test.ts, relay/tests/protocol.test.ts, relay/tests/fanout.test.ts</files>
  <read_first>
    - docs/inbox/from-gh-trade/261030-limitchaser-change-mask.md ② 표 「클라 컨트롤」 열 · ③ D-10
    - relay/src/dma/lc-change-mask.ts · packages/shared/src/lc-change-mask.ts (T1 결과)
    - relay/src/dma/__tests__/envelope.test.ts 155~175행 · 1320~1400행 · 3228~3290행
    - relay/tests/protocol.test.ts 30~120행 · 160~200행
    - relay/tests/fanout.test.ts 의 T1 describe
  </read_first>
  <behavior>
    - 표: LC_CHANGE_MASK_FIELDS 길이 50 · key 유일 · wire 유일 · wire === key 의 camel→snake · [인덱스, wire] 50쌍이 테스트에 리터럴로 적은 노트 ② 표와 같다(append-only 잠금)
    - gh-trade 대조(파일이 있을 때만): LimitChaserChangeMask.h 에서 정규식 「^inline constexpr uint64_t kMask\w+ = 1ULL << (\d+);\s*// (\w+)\s*$」(m 플래그)로 50줄을 뽑고, 비트마다 wire 가 LC_CHANGE_MASK_FIELDS[비트].wire 와 같다 · 비트 집합 = 0..49
    - 짝 16규칙(사람 이름 1개 → 비트 집합): buyOrderAmount→{4,5} · buyWatchAmount→{6,7} · buyMinTradeAmount→{9,10} · extraBuyOrderAmount→{15,16} · extraBuyMinAmount→{17,18} · extraBuyMaxAmount→{19,20} · postBuyOrderAmount→{24,25} · postBuyFloorAmount→{27,28} · sellWatchAmount→{33,34} · sellMinTradeAmount→{39,40} · cancelWatchAmount→{42,43} · buyOrderPrice→{1,5,16,25} · buyWatchPrice→{2,7,10,18,20,28} · sellWatchPrice→{32,34,40,43} · sellQtyTrackEnabled(cfg false)→{36,33,34} · sellQtyTrackEnabled(cfg true)→{36} · cancelQtyTrackEnabled(cfg false)→{45,42,43} · cancelQtyTrackEnabled(cfg true)→{45}
    - 체크 · 짝 없는 칸은 자기 비트만(preBuyEnabled→{3} · sellOrderRatio→{35} · autoSellMethod→{49} = 562949953421312n — bigint 정확)
    - 조합: [buyOrderAmount, buyOrderPrice] → {1,4,5,16,25} · 중복 이름 = 한 번 · [] → 0n · unknown []
    - 모르는 이름: ["buyOrderAmount", "postBuyReentry", "zzz", "zzz"] → unknown ["postBuyReentry", "zzz"](postBuyReentry 는 비트 표 밖 — 서버가 읽지 않는 칸)
    - 조립기: FULL + extraBuyAuto + changeMask 0x30n → buy3Schema 6 · presentSlots [174] = [174] · changeMask() 0x30n · warn 0 / changeMask 0n → buy3Schema 6 · changeMask() 0n / FULL(extraBuyAuto 없음) + changeMask → buy3Schema 4 · 174 슬롯 없음 · warn 에 「changeMask 가 schema 6 조건」 / lcInput() + changeMask → 1 · 슬롯 없음 · warn / changeMask 없음 → 5 · 슬롯 없음 / (1n << 50n) − 1n 왕복 정확 / −1n · 1n << 64n → OrderBuildError
    - zod: changed ["buyOrderAmount"] 통과 · 값 보존 / 생략 → undefined / ["noSuchField"] 통과(위반 아님) / 65개 → null / 원소 65자 → null / 빈 문자열 원소 → null / 문자열 아님 → null
    - fanout e2e: changed ["buyOrderAmount"] → changeMask === (1n << 4n) | (1n << 5n) · changed ["sellQtyTrackEnabled"] + cfg sellQtyTrackEnabled false → 비트 {33,34,36}
  </behavior>
  <action>
    RED 먼저: relay/src/dma/__tests__/lc-change-mask.test.ts 새 파일에 behavior 의 표 · gh-trade 대조 · 짝 · 조합 · 모르는 이름 케이스를 쓴다. 비트 집합 비교용 헬퍼 bitsOf(mask: bigint): number[] 를 테스트 안에 둔다. gh-trade 경로 = process.env.GH_TRADE_DIR 가 있으면 그것, 없으면 저장소 루트(new URL("../../../../", import.meta.url))의 ../gh-trade · 파일 server/src/trade/strategy/LimitChaserChangeMask.h — existsSync 가 거짓이면 그 describe 만 describe.skipIf 로 건너뛴다(CI · 다른 머신 관용). 노트 ② 50쌍 리터럴은 「인계 노트 ② 사본 — 바꾸지 말 것(append-only)」 주석과 함께 적는다. envelope.test.ts 의 「③-extra-auto」 describe 뒤에 「③-change-mask buy3_schema 6 · change_mask(vt 174) 파생 (quick-261030-kpg · gh-trade Phase 44)」 describe 를 같은 readLc · FULL 꼴로 behavior 의 조립기 케이스를 쓴다. relay/tests/protocol.test.ts 에 behavior 의 zod 케이스(JSON.stringify({ t: "lc.set", cfg: lcCfg(), changed }) → parseInbound). relay/tests/fanout.test.ts T1 describe 에 behavior 의 e2e 2케이스를 더한다. 짝 · e2e 금액 케이스가 빨갛게 실패하는 것을 본다(T1 은 자기 비트만 세운다).

    GREEN: relay/src/dma/lc-change-mask.ts 에 export const LC_CHANGE_MASK_PAIR_RULES — 16행, 행마다 { control(WinForms 컨트롤 이름 — 노트 ③ 원문 추적용), from(LcChangeMaskField), adds(LcChangeMaskField[]), whenOff?: true }. 컨트롤 → 와이어 매핑(노트 ② 「클라 컨트롤」 열): numBuyOrderAmount=buyOrderAmount · numBuyWatchQty=buyWatchAmount · numBuyMinTradeQty=buyMinTradeAmount · numAddBuyOrderAmount=extraBuyOrderAmount · numAddBuyMinQty=extraBuyMinAmount · numAddBuyMaxQty=extraBuyMaxAmount · numPostBuyOrderAmount=postBuyOrderAmount · numPostBuyFloorQty=postBuyFloorAmount · numSellWatchQty=sellWatchAmount · numSellMinTradeQty=sellMinTradeAmount · numCancelQty=cancelWatchAmount · numBuyOrderPrice=buyOrderPrice · numBuyWatchPrice=buyWatchPrice · numSellWatchPrice=sellWatchPrice · chkSellQtyTrack=sellQtyTrackEnabled(whenOff · adds sellWatchAmount, sellWatchQty) · chkCancelByTracking=cancelQtyTrackEnabled(whenOff · adds cancelWatchAmount, cancelWatchQty). adds 의 수량 이름은 노트 ② 의 파생 행(5 · 7 · 10 · 16 · 18 · 20 · 25 · 28 · 34 · 40 · 43). 머리 JSDoc: gh-trade D-10 「서버는 칸마다 독립 반영 · 묶음 책임은 보내는 쪽 = relay」 · 웹 buildCfg 가 금액 ÷ 그 칸 가격으로 수량을 다시 계산하므로 금액 · 가격 비트에는 그 수량 비트가 따라와야 서버가 새 수량을 쓴다 · 추적 OFF 는 기준선 대신 금액 환산 수량으로 돌아가므로 금액 · 수량 둘 다 · 체크 칸에는 파생 없음. lcChangeMaskOf 가 사람 이름에서 세운 비트 위에 규칙을 한 번만 적용한다(사람 이름 집합 기준 — 전이 적용 없음: 추적 OFF 규칙이 금액 · 수량을 둘 다 명시한다). whenOff 규칙은 cfg 의 그 불리언이 false 일 때만. 이 함수가 webapp 에서 불리지 않도록 shared 가 아니라 relay 에 둔 이유를 한 줄로 적는다.

    zod · 조립기 테스트가 T1 구현에서 이미 초록이면 그대로 둔다(테스트가 단조성 · 범위 가드를 잠그는 것이 목적). 실패하면 envelope.ts / protocol.ts 쪽 T1 구현을 고친다.

    커밋(경로 지정 add · 남의 변경 제외 · 한글 · Co-Authored-By 없음) 예 「feat(relay): change_mask 짝 수량 비트(gh-trade D-10) · 비트 표 gh-trade 대조 · schema 6 단조성 테스트」.
  </action>
  <verify>
    <automated>cd relay && npx vitest run --maxWorkers=2 src/dma/__tests__/lc-change-mask.test.ts src/dma/__tests__/envelope.test.ts tests/protocol.test.ts tests/fanout.test.ts && npx tsc --noEmit && npx tsc -p tsconfig.tests.json --noEmit</automated>
  </verify>
  <done>짝 16규칙 · 표 50행 리터럴 대조 · (gh-trade 가 있으면) .h 50줄 대조 · 조립기 6 파생/미달 warn/범위 가드 · zod 경계 · fanout 금액/추적 OFF e2e 가 전부 초록이고 relay tsc 두 벌 0 오류. gh-trade .h 대조가 skip 이 아니라 실제로 돌았는지 SUMMARY 에 적는다(이 머신은 /Users/alex/repos/gh-trade 가 있어 돌아야 한다). 커밋 1개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 웹 상따 확정이 손댐 칸(gh-trade D-05)을 lc.set changed 로 싣는다 — 주 필드 + 동반 + 미등록 로컬 손댐</name>
  <files>packages/shared/src/relay.ts, webapp/src/lib/limit-chaser.ts, webapp/src/lib/__tests__/limit-chaser.test.ts, webapp/src/components/trading/lc/use-lc-field-commit.ts, webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx</files>
  <read_first>
    - webapp/src/components/trading/lc/use-lc-field-commit.ts 1~160행(머리 주석 ①~⑬ · 타입) · 400~415행 · 636~735행(sendNow · drain) · 791~879행(commit)
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx 1~175행(echo · setup · 첫 describe) + 동반(companions) · 미등록(server null) · 대기열 · serverFold 를 다루는 기존 describe 하나씩(grep 「companions」 「server: null」 「serverFold」 「queued」)
    - webapp/src/lib/limit-chaser.ts 60~101행 · webapp/src/lib/__tests__/limit-chaser.test.ts 머리 import
    - packages/shared/src/relay.ts 695~710행 · packages/shared/src/lc-change-mask.ts(T1)
  </read_first>
  <behavior>
    - lcChangedFieldsOf(["buyOrderAmount", "buyEnabled", "buyOrderAmount"]) → ["buyOrderAmount", "buyEnabled"](처음 본 순서 · 중복 제거) · lcChangedFieldsOf(["postBuyReentry", "sellEnabled"]) → ["sellEnabled"] · lcChangedFieldsOf([]) → []
    - 등록 전략 값 확정 commit('buyOrderAmount', 새 값, 'value') → send 1회 · msg.changed = ["buyOrderAmount"](수량 이름 없음)
    - 동반 값 commit('preBuyEnabled', true, 'toggle', { buyEnabled: true }) → msg.changed 집합 = {preBuyEnabled, buyEnabled}
    - 동반 함수는 송신 시점 계산 결과의 키를 싣는다 — 대기 중 서버 값이 바뀌어 동반 함수가 다른 키를 돌려주면 꺼낼 때의 키가 실린다
    - 서버 값과 같은 확정(no-op) → send 0회(종전 그대로)
    - 대기열: A in-flight 중 B 확정 → A 답 뒤 나간 B 프레임의 changed = ["B"](A 를 싣지 않는다)
    - 에코(server prop 갱신)만 일어나고 확정이 없으면 send 0회 · 다음 확정의 changed 는 그 확정 칸뿐
    - 미등록(server null): commit('sellOrderRatio', 값, 'value') → 'local' · 이어서 commit('buyEnabled', true, 'toggle') → msg.changed 에 sellOrderRatio 와 buyEnabled 둘 다 · 그 송신 성공 뒤 다음 송신 프레임에는 sellOrderRatio 가 없다
    - 미등록에서 send 가 false(끊김)를 돌려주면 로컬 손댐 기억이 남아 다음 송신 프레임에 실린다
    - serverFold 자동 끔 commit('buyEnabled', false, 'toggle', undefined, { cause: 'serverFold' }) → msg.changed = ["buyEnabled"]
    - 모든 송신 프레임의 changed 는 비어 있지 않다
  </behavior>
  <action>
    gh-trade D-05 의 손댐을 웹의 「확정 1회 = lc.set 1회」 모델로 옮긴다 — 손댐 집합 = 그 확정의 주 필드 + 그 확정이 실제로 싣는 동반 필드 키(⑪ — 사람 조작 한 번이 만든 같은 제출의 값들) + 미등록 전략에서 아직 송신되지 않은 로컬 확정 칸. 짝 수량은 relay 몫(gh-trade D-10)이고 웹은 마스크를 계산하지 않는다. no-op · 대기열 · 고아 장벽 · 재전송 금지 · 에코 적용 · buildCfg 는 바꾸지 않는다.

    ① packages/shared/src/relay.ts RelayLcSetMsg 를 { t: "lc.set"; cfg: RelayLimitChaserInput; changed: LcChangeMaskField[] } 로 — 새 클라 계약이라 필수(「shared 는 새 클라 계약, relay 와이어는 구 탭 관용」 규약 · relay zod 는 선택). import type 은 ./lc-change-mask. JSDoc 에 한 단락: cfg 는 여전히 전체 · changed = 이번 제출에서 사람이 손댄 칸 이름(gh-trade D-05) · relay 가 짝 비트를 더해 change_mask 를 만들고 buy3_schema 6 으로 보낸다(gh-trade Phase 44 · quick-261030-kpg). 이어서 pnpm --filter @gh-radar/shared build.

    ② webapp/src/lib/limit-chaser.ts 에 lcChangedFieldsOf(keys: Iterable<keyof LimitChaserFormValues>): LcChangeMaskField[] — 처음 본 순서로 중복 제거하고 비트 표 밖 폼 키(LC_UNMASKED_FORM_KEYS = ['postBuyReentry'] as const — 행 없음 · buildCfg 255 고정 · 서버가 읽지 않음 · 노트 ② 「식별·고정·봉인」)만 뺀다. 같은 자리에 컴파일 타임 단언: Exclude<keyof LimitChaserFormValues, LcChangeMaskField | 'postBuyReentry'> 가 never 가 아니면 타입 오류가 나는 상수 하나(새 폼 칸이 비트 없이 합류하면 typecheck 가 막는다 — 조용히 빠지는 이름이 생기지 않게). 런타임 거르기는 shared isLcChangeMaskField 로 한다(단언 덕분에 postBuyReentry 외에는 걸릴 것이 없다). JSDoc 에 그 이유.

    ③ webapp/src/components/trading/lc/use-lc-field-commit.ts. 머리 주석 ⑬ 뒤에 ⑭ 「손댐(changed · gh-trade Phase 44 D-05 · quick-261030-kpg)」: 무엇을 손댐으로 세는지(위 정의) · 값이 같아도 주 필드는 프레임이 나가면 늘 실린다 · 에코 적용은 손댐이 아니고 기억을 비우지 않는다 · 미등록 로컬 손댐은 송신 성공 직후 비운다 · 짝 수량은 relay · 값이 서버와 같은 단독 확정은 프레임 자체가 없다(종전 no-op — 이번 변경 전후 동일) · 대기열 같은 필드 재확정은 값만 바뀐다(종전 ⑦). 훅 안에 localTouchedRef = useRef(new Set<LcFieldKey>()). commit 의 미등록 로컬 반영('local' 반환 직전 857~861행)과 drain 의 미등록 로컬 반영(716~720행) 두 자리에서 그 필드를 add. sendNow 에서 companions 계산 뒤 changed = lcChangedFieldsOf([...localTouchedRef.current, p.field, ...Object.keys(companions ?? {})]) 를 만들고 send({ t: 'lc.set', cfg, changed }) 로 싣는다. send 가 true 면 localTouchedRef.current.clear() (onSent 앞), false 면 그대로 둔다. ⑨-3 금액 덮기 줄 · onSent · in-flight 기록은 그대로.

    ④ 테스트 먼저(RED): webapp/src/lib/__tests__/limit-chaser.test.ts 에 lcChangedFieldsOf behavior 3줄 + LC_CHANGE_MASK_FIELDS 의 key 가 아닌 폼 키는 postBuyReentry 뿐임을 defaultLimitChaserForm() 의 키로 런타임 대조. use-lc-field-commit.test.tsx 에 새 describe 「⑭ 손댐 changed (quick-261030-kpg · gh-trade D-05)」 — behavior 의 훅 케이스들. 메시지 관측은 send.mock.calls 의 [0].changed(기존 setup 의 send 타입이 { t; cfg } 로 좁혀져 있으면 RelayLcSetMsg 로 넓힌다 — 기존 cfgs() 는 그대로). 대기열 · 답 신호 · 미등록 등록 흐름은 기존 describe 의 update({ server, serverAnswerSeq }) 꼴을 그대로 따른다. 실패를 본 뒤 ①~③ 으로 초록.

    ⑤ 회귀: webapp 의 limit-chaser-form · strategy-card-flow · inline-navigation · lc-tracer 테스트가 msg 를 { t, cfg } 로만 보던 곳이 있으면 changed 가 더해져도 통과하는지 확인한다(cfg 만 보는 단언은 무변경 — toEqual 로 메시지 전체를 박은 곳이 있으면 changed 를 기대값에 더한다).

    커밋(경로 지정 add · 남의 변경 제외 · 한글 · Co-Authored-By 없음) 예 「feat(webapp): 상따 확정의 손댐 칸을 lc.set changed 로 싣는다 (gh-trade Phase 44 D-05)」.

    마지막(커밋 뒤 · 한 번만 · 메모리 규칙): 전체 회귀 — relay 전체 vitest(--maxWorkers=2) · webapp 전체 vitest(--maxWorkers=2) · shared 전체 vitest · relay tsc 두 벌 · webapp typecheck. 실패하면 고쳐 같은 태스크 범위로 추가 커밋.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && cd webapp && npx vitest run --maxWorkers=2 src/lib/__tests__/limit-chaser.test.ts src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx src/components/trading/lc/__tests__/inline-navigation.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx && npm run typecheck</automated>
  </verify>
  <done>웹 상따 확정의 모든 lc.set 프레임이 비어 있지 않은 changed(주 필드 + 실은 동반 키 + 미등록 로컬 손댐)를 싣고, no-op · 대기열 · 에코 규칙은 종전과 같다. 폼 키가 비트 표 밖으로 새면 typecheck 가 막는다. 대상 테스트 · webapp typecheck 초록, 마지막 전체 회귀(relay · webapp · shared vitest · relay tsc 두 벌) 초록. 커밋 1개(+ 회귀 수정이 있으면 추가).</done>
</task>

</tasks>

<verification>
- relay: lc.set(changed ["buyOrderAmount"]) → 게이트웨이 SetLimitChaser buy3_schema 6 · change_mask 0x30 (fanout e2e). changed 없음 → 종전 schema · 마스크 없음. 모르는 이름 → warn + 종전 schema · 거부 0.
- relay: 짝 16규칙 · 비트 표 50행(노트 ② 리터럴 + gh-trade .h 파싱) · lcBuy3SchemaOf 6 단조성 · ulong 범위 가드 테스트 초록.
- webapp: 확정 → send 의 changed = 손댐 정의 그대로 · no-op/대기열/에코 무변경 · 폼 키 ⊆ 비트 표 ∪ {postBuyReentry} 컴파일 타임 단언.
- 전체: relay · webapp · shared vitest(--maxWorkers=2) 각 1회 · relay tsc(--noEmit · tsconfig.tests.json) · webapp typecheck 0 오류.
- 범위: gh-trade 저장소 무변경 · DB 무변경 · 에코 해석 코드 무변경 · docs/inbox 노트 무변경(닫기는 배포 뒤 메인 세션) · push/배포 없음.
</verification>

<success_criteria>
- relay 가 webapp 보다 먼저 배포돼도 동작 불변(changed 없는 프레임 = 종전 schema), webapp 이 relay 보다 먼저 나가도 안전(relay zod 가 changed 를 strip 하던 종전 동작 — 이번 relay 가 나가기 전까지 schema ≤5).
- 웹에서 금액만 고친 제출의 change_mask = 금액 + 짝 수량 비트뿐 — 선·줄매수 체크 비트가 없어 서버가 소진된 그룹을 다시 열지 않는다.
- 커밋 3개(+ 회귀 수정분), 전부 경로 지정 add · 한글 메시지 · Co-Authored-By 없음 · tasks/lessons.md · .planning/milestone.lock · .planning/phases/36-account-budget/.gitkeep 미포함.
</success_criteria>

<output>
`.planning/quick/261030-kpg-setlimitchaser-change-mask-relay-buy3-sc/261030-kpg-SUMMARY.md` 를 만든다. 일반 SUMMARY 항목에 더해 다음을 반드시 싣는다:

1. 「gh-trade 질문 답 — 웹 탭 손댐 정의 vs gh-trade D-05」 절(인계 노트를 닫을 때 메인 세션이 그대로 옮겨 쓸 수 있게 짧게):
   - 제출 단위: 웹 상따는 확정 1회 = lc.set 1회(useLcFieldCommit). 사람 조작 = 시트 「적용」 · 인라인 Enter/blur · 키패드 · 3택(자동매도 방법) 선택 · 체크/스위치 클릭.
   - changed = 그 확정의 주 필드 + 같은 확정이 싣는 동반 필드(그룹 켬/끔 때 마스터 · 줄매수 끌 때 ☐자동 · 선매수 켤 때 줄매수 · 매도 · 취소 6체크 자동 체크와 가격 채움 · 후매수 끌 때 ☐자동 — 실제 키는 송신 시점 계산 결과) + 미등록 전략에서 로컬로만 확정한 칸(송신 성공 직후 비움).
   - D-05 와 같은 점: 프레임이 나가면 주 필드는 값이 같아도 비트 · 에코 적용은 손댐이 아니고 기억을 비우지 않음 · 에코 diff 아님 · 짝 수량은 relay(D-10).
   - D-05 와 다른 점 2개(둘 다 이번 변경 전후 동일한 웹 기존 규칙 · 재무장 쪽으로 틀리지 않음): ① 값이 서버(에코)와 같은 단독 확정은 프레임 자체를 만들지 않는다(no-op) — WinForms 의 「같은 값 Enter」 단독 재제출(그룹 비트로 매도 · 취소 래치 · 기준선 리셋 — D-08)에 해당하는 동작이 웹에는 없다. ② 대기열 안 같은 필드 재확정은 값만 바뀐다 — OFF 가 아직 대기 중일 때 ON 을 다시 누르면 꺼낼 때 서버 값(ON)과 같아 no-op(재무장 요청이 나가지 않는다). OFF 가 이미 나가 있으면 OFF 에코 뒤 ON 이 비트와 함께 나간다.
   - 자동 제출: 서버 접힘 뒤 마스터 자동 끔(serverFold)은 사람 조작이 아니지만 그 칸(buy_enabled) 비트를 싣는다 — 그 제출의 유일한 목적.
   - [기본값으로] 버튼 없음 → D-12 해당 없음. 상한가 · 상장주식수 · 84 시딩은 미등록 새 전략의 폼만 채우고 손댐이 아니다(첫 등록은 D-07 전체 반영).
   - post_buy_reentry 는 비트 표 밖(웹 행 없음 · 255 고정 · 서버가 읽지 않음) — changed 에 넣지 않는다.
2. relay 모르는 이름 정책(폴백 + warn)과 근거 한 줄 · 빈 배열 = 마스크 0 · schema 6.
3. gh-trade .h 대조가 실제로 돌았는지(skip 여부) · RED 줄.
4. 배포 메모(실행하지 않음): gh-trade 서버(120 · 119) → relay → webapp(push = 프로덕션). 확인 = 서버 로그 「[LimitChaser] 설정 갱신 … 마스크=0x…(N비트)」 의 비트 수 = 웹에서 손댄 칸 + 짝 수량 · 「[Gateway] 구 세대 재제출이 소진된 선·줄매수를 다시 연다」 warn 이 웹 탭에서 0 으로 · 인계 노트 status done + done_commit 은 배포 뒤 메인 세션.
</output>
