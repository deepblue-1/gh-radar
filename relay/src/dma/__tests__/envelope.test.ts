/**
 * Phase 15 Plan 02 — RELAY-01. Envelope 조립/파싱 + 필드 가드 단위 테스트 (SC-3).
 *
 * 이 파일이 증명해야 하는 것은 하나다 — **깨진 프레임은 어떤 경로로도 UI 계약
 * 타입으로 나오지 않는다**. JS 런타임에 Verifier 가 없어 잘린 버퍼가 예외 없이
 * 깨진 값을 반환하므로(D-31), 예외 부재를 "정상"으로 오독하지 않도록 반환값이
 * `null` 인지, 드롭 카운터가 올랐는지, 경고가 남았는지를 함께 본다 (S-5).
 *
 * 하지 않는 것: 소켓/세션은 다루지 않는다. 전부 순수 함수 왕복이다.
 */
import { readFileSync } from "node:fs";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { OrderMarket, RelayExchange, RelayLimitChaserInput, RelayUserSettingsValues } from "@gh-radar/shared";
import { USER_SETTINGS_RANGES } from "@gh-radar/shared";

import { logger } from "../../logger.js";
import { Envelope } from "../../generated/stock-dma/envelope.js";
import { LoginReq } from "../../generated/stock-dma/login-req.js";
import { LivePing } from "../../generated/stock-dma/live-ping.js";
import { SubscribeQuoteReq } from "../../generated/stock-dma/subscribe-quote-req.js";
import { GetTradeTapeReq } from "../../generated/stock-dma/get-trade-tape-req.js";
import { SetLimitChaser } from "../../generated/stock-dma/set-limit-chaser.js";
import { SetVITrigger } from "../../generated/stock-dma/set-vitrigger.js";
import { ConfirmVIOrderReq } from "../../generated/stock-dma/confirm-viorder-req.js";
import { DisableStrategiesReq } from "../../generated/stock-dma/disable-strategies-req.js";
import { AutoSellCommandReq } from "../../generated/stock-dma/auto-sell-command-req.js";
import { UserSettings } from "../../generated/stock-dma/user-settings.js";
import { MSG, OUT_OF_SCOPE_INBOUND_MSG_TYPES } from "../msg-type.js";
import {
  buildLoginReq,
  buildLivePing,
  buildGetQuoteReq,
  buildSubscribeQuoteReq,
  buildGetTradeTapeReq,
  tryParseEnvelope,
  parseQuoteState,
  parseSymbolMasterFrame,
  parseTradeTape,
  parseServerMessage,
  parseLoginResp,
  parseLoginRespAccounts,
  parseUpdateAccountNoResp,
  buildUpdateAccountNoReq,
  buildGetAccountStateReq,
  buildDirectOrderReq,
  parseAccountState,
  parseOrderResp,
  fromWireExchange,
  fromWireSide,
  toWireSide,
  toWireMarket,
  toWireOrderType,
  OrderBuildError,
  ORDER_CONDITION,
  takeCount,
  toNum,
  isValidIsin,
  isValidExchange,
  isValidAccountNo,
  maskAccountNo,
  droppedEnvelopeCount,
  resetDroppedEnvelopeCount,
  skippedAccountEntryCount,
  skippedAccountStateItemCount,
  MAX_HOLDING_COUNT,
  MAX_UNFILLED_COUNT,
  MAX_REMOVED_ORDER_COUNT,
  MAX_ORDER_BOOK_DEPTH,
  MAX_TAPE_ENTRY_COUNT,
  MAX_ACCOUNT_LIST_COUNT,
  MAX_ACCOUNT_NO_LEN,
  buildSetLimitChaserReq,
  buildSetVITriggerReq,
  buildConfirmVIOrderReq,
  buildDisableStrategiesReq,
  buildGetLimitChaserListReq,
  buildGetVITriggerReq,
  buildGetVIOrderListReq,
  LC_FIXED_SWEEP_RECALC_ENABLED,
  LC_FIXED_SWEEP_MIN_COUNT,
  LC_FIXED_SWEEP_MIN_RATE,
  LC_FIXED_BUY3_SCHEMA,
  LC_POST_BUY_AUTO_BUY3_SCHEMA,
  LC_BURST_RELEASE_BUY3_SCHEMA,
  LC_AUTO_SELL_BUY3_SCHEMA,
  lcBuy3SchemaOf,
  parseUserSettings,
  buildAutoSellCommandReq,
  buildSetUserSettingsReq,
  buildGetUserSettingsReq,
  MAX_STRATEGY_KEY_BYTES,
  parseLimitChaserEcho,
  parseLimitChaserList,
  parseViTrigger,
  parseViOrderList,
  parseViOrderNotice,
  parseDisableStrategiesResp,
  fromWireMarket,
  fromWireCrud,
  toOrderOrigin,
  strategyKey,
  skippedStrategyItemCount,
  MAX_LIMIT_CHASER_COUNT,
  MAX_STRATEGY_BATCH_EVENTS,
  buildObserverLoginReq,
  parseObserverLoginResp,
  parseJournalBatch,
  parseQueueProgress,
  MAX_QUEUE_PROGRESS_ITEMS,
  parseLimitFeature,
  MAX_LIMIT_FEATURE_MEMBERS,
  type ViTriggerInput,
  type LcSetCfg,
} from "../envelope.js";
import { encode } from "../../ws/protocol.js";
import {
  SAMPLE_ISIN,
  buildBareEnvelope,
  buildQuoteStateFrame,
  buildTradeTapeFrame,
  buildServerMessageFrame,
  buildLoginRespFrame,
  buildUpdateAccountNoRespFrame,
  buildAccountStateFrame,
  buildOrderRespFrame,
  buildSetLimitChaserRespFrame,
  buildLimitChaserListRespFrame,
  buildSetVITriggerRespFrame,
  buildViOrderListFrame,
  buildViOrderNoticeFrame,
  buildDisableStrategiesRespFrame,
  buildJournalBatchFrame,
  buildObserverLoginRespFrame,
  fakeStrategyEventRecord,
  buildQueueProgressFrame,
  buildUserSettingsFrame,
  buildLimitFeatureFrame,
  SAMPLE_ACCOUNT_NO,
} from "../../../tests/helpers/frames.js";
import { readObserverLoginRequest } from "../../../tests/helpers/fake-gateway.js";

let warn: ReturnType<typeof vi.spyOn>;
/** 범위 밖 유입(74/75 등)은 **debug** 로만 남는다 — warn 스파이와 같은 방식으로 잡는다. */
let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetDroppedEnvelopeCount();
  warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  debug = vi.spyOn(logger, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 요청 빌더 산출물을 다시 Envelope 으로 읽는다 (수신 화이트리스트를 우회한 왕복 검사용). */
function readBack(bytes: Uint8Array): Envelope {
  return Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(bytes));
}

describe("조립 (build*)", () => {
  it("① buildLivePing 왕복 — msg_type 4 + ping_time 이 현재 epoch 초", () => {
    const before = Math.floor(Date.now() / 1000);
    const env = readBack(buildLivePing());

    expect(env.msgType()).toBe(MSG.LivePing);
    const ping = env.livePing(new LivePing());
    expect(ping).not.toBeNull();
    expect(ping!.pingTime()).toBeGreaterThanOrEqual(before);
    expect(ping!.pingTime()).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
  });

  it("② buildLoginReq 왕복 — user_id / broker 가 보존된다", () => {
    const env = readBack(buildLoginReq("alex-radar", "pw-not-logged", "KB"));

    expect(env.msgType()).toBe(MSG.LoginReq);
    const req = env.loginReq(new LoginReq());
    expect(req!.userId()).toBe("alex-radar");
    expect(req!.broker()).toBe("KB");
    // 다른 슬롯은 비어 있다 — Envelope 은 union 이 아니라 optional 슬롯 나열 table 이다.
    expect(env.orderResp()).toBeNull();
  });

  it("②-b buildGetQuoteReq / buildSubscribeQuoteReq / buildGetTradeTapeReq 왕복", () => {
    const quoteEnv = readBack(buildGetQuoteReq(SAMPLE_ISIN, "NXT"));
    expect(quoteEnv.msgType()).toBe(MSG.GetQuoteReq);
    expect(quoteEnv.getQuoteReq()!.exchange()).toBe("NXT");

    const subEnv = readBack(buildSubscribeQuoteReq(SAMPLE_ISIN, "KRX", false));
    expect(subEnv.msgType()).toBe(MSG.SubscribeQuoteReq);
    const sub = subEnv.subscribeQuoteReq(new SubscribeQuoteReq());
    expect(sub!.isin()).toBe(SAMPLE_ISIN);
    expect(sub!.subscribe()).toBe(false);

    const tapeEnv = readBack(buildGetTradeTapeReq(SAMPLE_ISIN, "KRX", 50));
    expect(tapeEnv.msgType()).toBe(MSG.GetTradeTapeReq);
    expect(tapeEnv.getTradeTapeReq(new GetTradeTapeReq())!.count()).toBe(50);
  });
});

describe("tryParseEnvelope — total 파서", () => {
  it("③ 정상 프레임을 끝에서 10바이트 잘라도 예외 없이 수렴한다", () => {
    const full = Buffer.from(buildQuoteStateFrame());
    const truncated = full.subarray(0, full.length - 10);

    let quote: unknown = "not-run";
    expect(() => {
      const parsed = tryParseEnvelope(truncated);
      quote = parsed === null ? null : parseQuoteState(parsed.env, true);
    }).not.toThrow();

    // 예외가 없다는 것이 "정상"을 뜻하지 않는다 — 계약 타입으로는 절대 나오면 안 된다.
    expect(quote).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("④ junk 12바이트는 null 이다", () => {
    const junk = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77]);

    expect(tryParseEnvelope(junk)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("④-b 8바이트 미만 페이로드는 파싱을 시도하지 않는다", () => {
    expect(tryParseEnvelope(Buffer.alloc(4))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("min-envelope-size");
    // 기존 드롭 경로의 레벨은 바뀌지 않는다 — 기본값 warn 그대로다.
    expect(debug).not.toHaveBeenCalled();
  });

  it("⑤ 화이트리스트 밖 msg_type(99)은 드롭 + 카운터 증가", () => {
    const payload = Buffer.from(buildBareEnvelope(99));

    expect(tryParseEnvelope(payload)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("unknown-msg-type");
    expect(fields.msgTypeHint).toBe(99);
    // ★ 정체불명 번호는 **debug 로 새지 않는다** — 이 강등이 없애려던 실명을 새로 만들면 안 된다.
    expect(debug).not.toHaveBeenCalled();
  });

  it("⑤-a 범위 밖 응답(75 MemberStatsPush)은 드롭하되 debug 로만 남는다", () => {
    const payload = Buffer.from(buildBareEnvelope(75));

    expect(tryParseEnvelope(payload)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
    const [fields] = debug.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("out-of-scope-msg-type");
    expect(fields.msgTypeHint).toBe(75);
  });

  it("⑤-a2 범위 밖 응답(74 MemberStatsResp)도 같다 — 25~55초마다 나오는 의도된 드롭이다", () => {
    expect(tryParseEnvelope(Buffer.from(buildBareEnvelope(74)))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it("⑤-a3 요청 대역(30 SetLimitChaserNXTReq)은 범위 밖 목록에 있어도 WARNING 이다", () => {
    /*
      ★ 이 갈래가 이번 수정의 핵심이다. 30 은 「하지 않는 것」 목록에 있지만 **C→S 요청**이라
        수신 경로로 들어오는 것 자체가 이상 신호다(INBOUND_MSG_TYPES 주석의 기존 규율).
        요청 번호까지 debug 로 내리면 없애려던 실명을 새로 만든다.
    */
    expect(tryParseEnvelope(Buffer.from(buildBareEnvelope(30)))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    expect(debug).not.toHaveBeenCalled();
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("unknown-msg-type");
  });

  it("Phase 28 ⑤-a85 85 LimitFeature 는 파싱된다 — 화이트리스트 통과 · 드롭 0 (27-01 debug 드롭 되돌림)", () => {
    const parsed = tryParseEnvelope(Buffer.from(buildLimitFeatureFrame()));
    expect(parsed).not.toBeNull();
    expect(parsed!.msgType).toBe(85);
    expect(droppedEnvelopeCount()).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });

  it("Phase 28 ⑤-a4 강등 집합은 **응답 대역 6종뿐**이고 요청 번호는 하나도 없다", () => {
    // 57 은 quick-260923-cqj 에서 INBOUND 로 옮겨 갔다(보조 이름 원천).
    // 81 · 82 는 Phase 25 — 전략 이벤트 정본은 관찰자 80 경로다(83 은 25-06 이 INBOUND 로 넣는다).
    // 85 LimitFeature 는 28-01 에서 INBOUND 로 옮겨 갔다(27-01 의 debug 드롭을 되돌림).
    expect([...OUT_OF_SCOPE_INBOUND_MSG_TYPES].sort((a, b) => a - b)).toEqual([68, 70, 74, 75, 81, 82]);
    for (const n of OUT_OF_SCOPE_INBOUND_MSG_TYPES) expect(n).toBeGreaterThanOrEqual(50);
  });

  it("⑤-a5 맨 envelope 57 은 화이트리스트를 통과하고, 파서는 slot-null 로 null 을 돌려준다 (quick-260923-cqj)", () => {
    const parsed = tryParseEnvelope(Buffer.from(buildBareEnvelope(MSG.SymbolMasterResp)));
    expect(parsed).not.toBeNull();
    expect(droppedEnvelopeCount()).toBe(0);

    expect(parseSymbolMasterFrame(parsed!.env)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("slot-null");
    expect(fields.slot).toBe("symbol_master");
  });

  it("⑤-b 요청 계열(LivePing=4)이 수신 경로로 들어오면 드롭한다", () => {
    expect(tryParseEnvelope(Buffer.from(buildLivePing()))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("⑤-c 알려진 msg_type 이지만 슬롯이 비면 드롭한다", () => {
    const parsed = tryParseEnvelope(Buffer.from(buildBareEnvelope(MSG.GetQuoteResp)));
    expect(parsed).not.toBeNull();

    expect(parseQuoteState(parsed!.env, true)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("slot-null");
  });
});

describe("Phase 28 parseLimitFeature (85 · limit_feature 슬롯 90)", () => {
  const parse = (bytes: Uint8Array) => {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    expect(parsed).not.toBeNull();
    return parseLimitFeature(parsed!.env);
  };

  it("기본 프레임 → camelCase number 필드 전부 (bigint 는 toNum 경계 · list_shares · team_sim 은 싣지 않는다)", () => {
    const msg = parse(buildLimitFeatureFrame());
    expect(msg).toEqual({
      t: "limit.feature",
      i: SAMPLE_ISIN,
      x: "KRX",
      gwTimeMs: 1_791_164_130_000,
      featureSchema: 1,
      upperPx: 13000,
      lastPx: 13000,
      rateBp: 3000,
      basePx: 10000,
      qQty: 133_077,
      qKrw: 1_730_000_000,
      wallKrwVisible: 0,
      wallQtyHidden: 0,
      wallTruncated: false,
      sellLed10s: 3_700,
      buyLed10s: 6_300,
      cancel10s: 2_300,
      new10s: 12_400,
      auctionFill10s: 0,
      drainS: -1,
      lockState: 1,
      lockElapsedS: 43,
      burstUpperLimit: false,
      auction: false,
      memberBuy: [{ memberNo: "00050", dQty: 52_000, dValue: 676_000_000, shareBp: 7407 }],
      memberSell: [{ memberNo: "00002", dQty: 18_000, dValue: 234_000_000, shareBp: 10000 }],
      memberDeltaPartial: false,
      modelState: 0,
      modelSchemaVersion: 0,
      pBreakBp: -1,
      pHorizonS: 0,
    });
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("bigint 경계 — 2^53 초과 금액은 MAX_SAFE_INTEGER 로 클램프 · 음수 증분 수량은 그대로", () => {
    const msg = parse(
      buildLimitFeatureFrame({
        qKrw: 2n ** 60n,
        cancel10s: -5n,
        memberSell: [{ memberNo: "00002", dQty: -18_000n, dValue: -234_000_000n, shareBp: 0 }],
      }),
    );
    expect(msg?.qKrw).toBe(Number.MAX_SAFE_INTEGER);
    expect(msg?.cancel10s).toBe(-5);
    expect(msg?.memberSell[0]).toEqual({ memberNo: "00002", dQty: -18_000, dValue: -234_000_000, shareBp: 0 });
  });

  it(`창구를 4개 실으면 앞 ${MAX_LIMIT_FEATURE_MEMBERS}개만 (takeCount 상한 · 경고 1건)`, () => {
    const four = ["00050", "00002", "00005", "00036"].map((memberNo) => ({ memberNo, dQty: 1n, dValue: 1n, shareBp: 1 }));
    const msg = parse(buildLimitFeatureFrame({ memberBuy: four }));
    expect(MAX_LIMIT_FEATURE_MEMBERS).toBe(3);
    expect(msg?.memberBuy.map((m) => m.memberNo)).toEqual(["00050", "00002", "00005"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("잘못된 isin 은 드롭 (bad-isin)", () => {
    expect(parse(buildLimitFeatureFrame({ isin: "BAD" }))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({ reason: "bad-isin", msgType: 85 });
  });

  it("잘못된 거래소는 드롭 (bad-exchange)", () => {
    expect(parse(buildLimitFeatureFrame({ exchange: "XXX" }))).toBeNull();
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({ reason: "bad-exchange", msgType: 85 });
  });

  it("슬롯 null(맨 envelope 85) 은 화이트리스트는 통과하고 파서가 slot-null 로 드롭", () => {
    expect(parse(buildBareEnvelope(85))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({ reason: "slot-null", msgType: 85, slot: "limit_feature" });
  });
});

describe("필드 가드", () => {
  it("⑥ takeCount(15, 10, …) 은 10 으로 절단하고 경고를 남긴다", () => {
    expect(takeCount(15, MAX_ORDER_BOOK_DEPTH, "매도호가")).toBe(10);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("⑦ takeCount(-1, 10, …) 은 0 이고 경고를 남긴다", () => {
    expect(takeCount(-1, MAX_ORDER_BOOK_DEPTH, "매도호가")).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("⑦-b 상한 이내 길이는 그대로 두고 조용하다", () => {
    expect(takeCount(7, MAX_ORDER_BOOK_DEPTH, "매수호가")).toBe(7);
    expect(takeCount(MAX_TAPE_ENTRY_COUNT, MAX_TAPE_ENTRY_COUNT, "체결 테이프")).toBe(200);
    expect(warn).not.toHaveBeenCalled();
  });

  it("⑧ toNum 은 안전 정수 범위를 넘으면 경고 후 클램프한다", () => {
    expect(toNum(9007199254740993n, "cum_value")).toBe(Number.MAX_SAFE_INTEGER);
    expect(toNum(-9007199254740993n, "cum_value")).toBe(-Number.MAX_SAFE_INTEGER);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("⑧-b 안전 범위 안의 값은 그대로 number 로 변환한다", () => {
    expect(toNum(70950n, "last_price")).toBe(70950);
    expect(toNum(0n, "change")).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("isValidIsin / isValidExchange 형식 가드", () => {
    expect(isValidIsin(SAMPLE_ISIN)).toBe(true);
    expect(isValidIsin("KR700593000")).toBe(false); // 11자
    expect(isValidIsin("KR70059300031")).toBe(false); // 13자
    expect(isValidIsin("kr7005930003")).toBe(false); // 소문자
    expect(isValidExchange("KRX")).toBe(true);
    expect(isValidExchange("NXT")).toBe(true);
    expect(isValidExchange("KOSPI")).toBe(false);
  });
});

describe("parseQuoteState", () => {
  function parseQuote(bytes: Uint8Array, snapshot = true) {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    return parsed === null ? null : parseQuoteState(parsed.env, snapshot);
  }

  it("정상 호가는 shared 계약 타입으로 나온다 (원문 보존 필드 포함)", () => {
    const quote = parseQuote(buildQuoteStateFrame());

    expect(quote).not.toBeNull();
    expect(quote!.t).toBe("q");
    expect(quote!.i).toBe(SAMPLE_ISIN);
    expect(quote!.x).toBe("KRX");
    expect(quote!.snap).toBe(true);
    expect(quote!.p).toBe(70950);
    expect(quote!.ap).toHaveLength(10);
    expect(quote!.bq).toHaveLength(10);
    // change_sign 원문 1자와 exchange_time 원문은 해석 없이 그대로 흘린다 (D-34).
    expect(quote!.cs).toBe("2");
    expect(quote!.et).toBe("093015123456");
    // bigint 가 계약으로 새지 않는다 — JSON.stringify 가 던지면 안 된다.
    expect(() => JSON.stringify(quote)).not.toThrow();
    expect(typeof quote!.va).toBe("number");
  });

  it("⑨ ISIN 11자/13자는 드롭한다", () => {
    expect(parseQuote(buildQuoteStateFrame({ isin: "KR700593000" }))).toBeNull();
    expect(parseQuote(buildQuoteStateFrame({ isin: "KR70059300031" }))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(2);
  });

  it("거래소 화이트리스트 밖이면 드롭한다", () => {
    expect(parseQuote(buildQuoteStateFrame({ exchange: "KOSPI" }))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("change_sign 이 1자가 아니면 드롭한다", () => {
    expect(parseQuote(buildQuoteStateFrame({ changeSign: "" }))).toBeNull();
    expect(parseQuote(buildQuoteStateFrame({ changeSign: "12" }))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(2);
  });

  it("호가 벡터가 15단으로 와도 10단으로 절단한다 (프레임은 살린다)", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => 71000n + BigInt(i) * 100n);
    const quote = parseQuote(buildQuoteStateFrame({ askPrices: fifteen }));

    expect(quote).not.toBeNull();
    expect(quote!.ap).toHaveLength(MAX_ORDER_BOOK_DEPTH);
    expect(quote!.aq).toHaveLength(10);
    expect(warn).toHaveBeenCalled();
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("짧게 온 벡터는 채우지 않고 온 만큼만 싣는다", () => {
    const quote = parseQuote(buildQuoteStateFrame({ bidPrices: [70900n, 70800n, 70700n] }));

    expect(quote!.bp).toEqual([70900, 70800, 70700]);
  });

  it("누적거래대금이 안전 범위를 넘으면 클램프 + 경고 (D-34)", () => {
    const quote = parseQuote(buildQuoteStateFrame({ cumValue: 9007199254740993n }));

    expect(quote!.va).toBe(Number.MAX_SAFE_INTEGER);
    expect(warn).toHaveBeenCalled();
  });

  it("59 증분은 snap=false 로 나온다 (슬롯 공유, D-33)", () => {
    const quote = parseQuote(buildQuoteStateFrame({ snapshot: false }), false);
    expect(quote!.snap).toBe(false);
  });

  it("①-1 KRX 정규장 종가를 원값으로 나른다 (D-11)", () => {
    // fbs 에서 long 이라 `toNum` 을 통과해야 한다 — bigint 가 계약으로 새면
    // 팬아웃 루프의 `encode()` 가 던진다 (16-RESEARCH Pitfall 3).
    const quote = parseQuote(buildQuoteStateFrame({ krxClosePrice: 12_625n }));

    expect(quote!.kc).toBe(12_625);
    expect(typeof quote!.kc).toBe("number");
    expect(() => JSON.stringify(quote)).not.toThrow();
  });

  it("①-2 종가 `0` 도 권위값이라 59 증분 프레임을 버리지 않는다 (D-11 — 벽시계 판정 없음)", () => {
    const quote = parseQuote(buildQuoteStateFrame({ krxClosePrice: 0n, snapshot: false }), false);

    expect(quote).not.toBeNull();
    expect(quote!.kc).toBe(0);
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("①-3 NXT 프레임에도 KRX 종가가 실린다 — 거래소로 값을 지우지 않는다 (D-11)", () => {
    const quote = parseQuote(buildQuoteStateFrame({ exchange: "NXT", krxClosePrice: 12_625n }));

    expect(quote!.x).toBe("NXT");
    expect(quote!.kc).toBe(12_625);
  });
  it("Q1 버스트 상한가 bul 을 거래소별 프레임 값 그대로 나른다 — 부재 false · NXT true / KRX false 가 섞이지 않는다 (quick-261003-rc4)", () => {
    const on = parseQuote(buildQuoteStateFrame({ burstUpperLimit: true }));
    expect(on!.bul).toBe(true);
    expect(typeof on!.bul).toBe("boolean");

    const absent = parseQuote(buildQuoteStateFrame({}), false);
    expect(absent!.bul).toBe(false);

    const nxt = parseQuote(buildQuoteStateFrame({ exchange: "NXT", burstUpperLimit: true, snapshot: false }), false);
    const krx = parseQuote(buildQuoteStateFrame({ exchange: "KRX", burstUpperLimit: false, snapshot: false }), false);
    expect([nxt!.x, nxt!.bul]).toEqual(["NXT", true]);
    expect([krx!.x, krx!.bul]).toEqual(["KRX", false]);
  });
});

describe("parseTradeTape", () => {
  function parseTape(bytes: Uint8Array, snapshot = true) {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    return parsed === null ? null : parseTradeTape(parsed.env, snapshot);
  }

  it("정상 테이프는 계약 타입 배열로 나온다", () => {
    const tape = parseTape(buildTradeTapeFrame({ entries: [{}, {}, {}] }));

    expect(tape).not.toBeNull();
    expect(tape!.t).toBe("tape");
    expect(tape!.i).toBe(SAMPLE_ISIN);
    expect(tape!.e).toHaveLength(3);
    expect(typeof tape!.e[0]!.p).toBe("number");
    expect(() => JSON.stringify(tape)).not.toThrow();
  });

  it("200건 상한을 넘으면 앞 200건만 싣는다", () => {
    const rows = Array.from({ length: 250 }, () => ({}));
    const tape = parseTape(buildTradeTapeFrame({ entries: rows }));

    expect(tape!.e).toHaveLength(MAX_TAPE_ENTRY_COUNT);
    expect(warn).toHaveBeenCalled();
  });

  it("원소의 change_sign 이 깨지면 프레임 전체를 버린다", () => {
    const tape = parseTape(buildTradeTapeFrame({ entries: [{}, { changeSign: "" }] }));

    expect(tape).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("71 증분은 snap=false 로 나온다", () => {
    const tape = parseTape(buildTradeTapeFrame({ snapshot: false }), false);
    expect(tape!.snap).toBe(false);
  });

  it("②-1 서버 체결구분 `\"1\"`(매도) · `\"2\"`(매수) 는 원값 그대로 나른다 (D-10)", () => {
    const tape = parseTape(buildTradeTapeFrame({ entries: [{ bsCode: "1" }, { bsCode: "2" }] }));

    expect(tape!.e.map((e) => e.bs)).toEqual(["1", "2"]);
  });

  it("②-2 낯선·빈 체결구분은 `\"\"`(미상)으로 좁히고 **프레임을 버리지 않는다** (T-17-06)", () => {
    // `change_sign` 과 달리 드롭하지 않는다 — 체결구분은 색 힌트일 뿐이고 원소를 버리면
    // 누적거래량이 어긋난다. 화면은 `""` 인 원소만 추정으로 폴백한다.
    const tape = parseTape(
      buildTradeTapeFrame({ entries: [{ bsCode: "9" }, { bsCode: "X" }, { bsCode: "" }, {}] }),
    );

    expect(tape).not.toBeNull();
    expect(tape!.e).toHaveLength(4);
    expect(tape!.e.map((e) => e.bs)).toEqual(["", "", "", ""]);
    expect(droppedEnvelopeCount()).toBe(0);
  });
});

describe("parseServerMessage / parseLoginResp", () => {
  it("ServerMessage 는 해석 없이 그대로 흘린다 (빈 ISIN = 브로드캐스트)", () => {
    const parsed = tryParseEnvelope(Buffer.from(buildServerMessageFrame({ level: "WARN" })));
    const msg = parseServerMessage(parsed!.env);

    expect(msg).toEqual({
      t: "msg",
      lv: "WARN",
      m: "세션에 참여했습니다",
      i: "",
      a: "",
      src: "System",
      kind: "SessionJoin",
    });
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("LoginResp 는 success/message 와 허용 계좌 목록을 함께 읽는다 (D-25 게이트 통과)", () => {
    const ok = tryParseEnvelope(
      Buffer.from(
        buildLoginRespFrame({
          success: true,
          accounts: [
            { accountNo: "1234567801", name: "위탁종합" },
            { accountNo: "1234567802", name: "연금" },
          ],
        }),
      ),
    );
    expect(parseLoginResp(ok!.env)).toEqual({
      success: true,
      message: "",
      accounts: [
        { accountNo: "1234567801", name: "위탁종합" },
        { accountNo: "1234567802", name: "연금" },
      ],
    });

    // 실패 응답과 mock 무인증 로그인은 빈 벡터다 (17 D-19).
    const rejected = tryParseEnvelope(
      Buffer.from(buildLoginRespFrame({ success: false, message: "로그인 거부", accounts: [] })),
    );
    expect(parseLoginResp(rejected!.env)).toEqual({
      success: false,
      message: "로그인 거부",
      accounts: [],
    });
  });

  it("슬롯이 비면 드롭한다", () => {
    const bare = tryParseEnvelope(Buffer.from(buildBareEnvelope(MSG.LoginResp)));
    expect(parseLoginResp(bare!.env)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });
});

describe("계좌 조립·파싱 (D-11 / T-15-07 / T-15-15)", () => {
  it("buildUpdateAccountNoReq 는 MsgType 3 · 추가 모드로 조립한다", () => {
    // 요청 대역은 수신 화이트리스트 밖이라 `readBack` 으로 루트를 직접 연다.
    const env = readBack(buildUpdateAccountNoReq("1", "1234567801"));

    expect(env.msgType()).toBe(MSG.UpdateAccountNoReq);
    expect(env.updateAccountNoReq()?.mode()).toBe("1");
    expect(env.updateAccountNoReq()?.accountNo()).toBe("1234567801");
  });

  it("상한 상수는 소비측 방어값으로 고정한다 (C# Client.cs 동형)", () => {
    expect(MAX_ACCOUNT_LIST_COUNT).toBe(256);
    expect(MAX_ACCOUNT_NO_LEN).toBe(12);
  });

  it("계좌번호 형식 가드는 1~12자만 통과시킨다", () => {
    expect(isValidAccountNo("1")).toBe(true);
    expect(isValidAccountNo("123456789012")).toBe(true);
    expect(isValidAccountNo("")).toBe(false);
    expect(isValidAccountNo("1234567890123")).toBe(false);
  });

  it("마스킹은 뒤 4자리를 가리고 원문을 남기지 않는다 (T-15-15)", () => {
    expect(maskAccountNo("1234567801")).toBe("123456****");
    expect(maskAccountNo("1234")).toBe("****");
    expect(maskAccountNo("")).toBe("");
    expect(maskAccountNo("1234567801")).not.toContain("7801");
  });

  it("형식 위반 계좌 항목만 건너뛰고 나머지는 살린다 (S-5 카운터)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(
        buildLoginRespFrame({
          accounts: [
            { accountNo: "1234567801", name: "정상" },
            { accountNo: "", name: "빈 계좌번호" },
            { accountNo: "1234567890123", name: "13자" },
            { accountNo: "1234567802", name: "정상2" },
          ],
        }),
      ),
    );

    expect(parseLoginRespAccounts(parsed!.env)).toEqual([
      { accountNo: "1234567801", name: "정상" },
      { accountNo: "1234567802", name: "정상2" },
    ]);
    // 프레임을 통째로 버리지 않는다 — 항목 스킵은 별도 카운터다.
    expect(droppedEnvelopeCount()).toBe(0);
    expect(skippedAccountEntryCount()).toBe(2);
    // 스킵 경고에도 계좌번호 원문은 남지 않는다.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("1234567890123");
  });

  it("계좌 목록 상한을 넘으면 앞의 256건으로 절단한다 (T-15-07)", () => {
    const many = Array.from({ length: MAX_ACCOUNT_LIST_COUNT + 10 }, (_, i) => ({
      accountNo: `12345678${String(i).padStart(2, "0")}`.slice(0, MAX_ACCOUNT_NO_LEN),
      name: `계좌${i}`,
    }));
    const parsed = tryParseEnvelope(Buffer.from(buildLoginRespFrame({ accounts: many })));

    expect(parseLoginRespAccounts(parsed!.env)).toHaveLength(MAX_ACCOUNT_LIST_COUNT);
  });

  it("UpdateAccountNoResp 는 등록 목록 전체를 문자열 배열로 낸다", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(buildUpdateAccountNoRespFrame(["1234567801", "1234567802"])),
    );

    expect(parsed?.msgType).toBe(MSG.UpdateAccountNoResp);
    expect(parseUpdateAccountNoResp(parsed!.env)).toEqual(["1234567801", "1234567802"]);
  });

  it("UpdateAccountNoResp 도 형식 위반 항목을 건너뛴다", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(buildUpdateAccountNoRespFrame(["1234567801", "1234567890123", ""])),
    );

    expect(parseUpdateAccountNoResp(parsed!.env)).toEqual(["1234567801"]);
    expect(skippedAccountEntryCount()).toBe(2);
  });

  it("UpdateAccountNoResp 슬롯이 비면 빈 배열 + 드롭 카운터", () => {
    const bare = tryParseEnvelope(Buffer.from(buildBareEnvelope(MSG.UpdateAccountNoResp)));

    expect(parseUpdateAccountNoResp(bare!.env)).toEqual([]);
    expect(droppedEnvelopeCount()).toBe(1);
  });
});

describe("주문 조립·파싱 (D-21 / Pitfall 7·8)", () => {
  const ORDER = {
    isin: SAMPLE_ISIN,
    accountNo: SAMPLE_ACCOUNT_NO,
    exchange: "KRX",
    market: "K",
    side: "B",
    orderType: "N",
    qty: 10,
    price: 70_000,
  } as const;

  it("buildDirectOrderReq 왕복 — msg_type 2 + order_condition 이 항상 \"0\"", () => {
    const env = readBack(buildDirectOrderReq(ORDER));

    expect(env.msgType()).toBe(MSG.DirectOrderReq);
    const req = env.directOrderReq();
    // `stock_code` 는 단축코드가 아니라 ISIN 12자다 (fbs 주석 / D-28).
    expect(req?.stockCode()).toBe(SAMPLE_ISIN);
    expect(req?.accountNo()).toBe(SAMPLE_ACCOUNT_NO);
    expect(req?.side()).toBe("B");
    expect(req?.market()).toBe("K");
    expect(req?.exchange()).toBe("KRX");
    expect(req?.orderType()).toBe("N");
    expect(req?.price()).toBe(70_000);
    expect(req?.quantity()).toBe(10);
    expect(req?.orderCondition()).toBe("0");
    // 신규 통보의 원주문번호는 빈 문자열이 계약이다 (슬롯을 비우지 않는다).
    expect(req?.orgOrderNo()).toBe("");
  });

  it("ORDER_CONDITION 은 \"0\" 고정이다 (D-21 — 시장가·IOC·FOK 범위 밖)", () => {
    expect(ORDER_CONDITION).toBe("0");
  });

  it("수량 0 은 조립 단계에서 throw 한다 — 전량취소가 아니라 즉시 거부다 (Pitfall 7)", () => {
    expect(() => buildDirectOrderReq({ ...ORDER, qty: 0 })).toThrow(OrderBuildError);
    expect(() => buildDirectOrderReq({ ...ORDER, qty: -1 })).toThrow(/1 이상/);
    expect(() => buildDirectOrderReq({ ...ORDER, qty: 1.5 })).toThrow(OrderBuildError);

    try {
      buildDirectOrderReq({ ...ORDER, qty: 0 });
    } catch (err) {
      expect((err as OrderBuildError).code).toBe("BAD_QTY");
    }
  });

  it("취소인데 원주문번호가 없으면 throw 한다", () => {
    expect(() => buildDirectOrderReq({ ...ORDER, orderType: "C" })).toThrow(
      /원주문번호/,
    );
    const env = readBack(
      buildDirectOrderReq({ ...ORDER, orderType: "C", orgOrderNo: "0000012345", qty: 4 }),
    );
    expect(env.directOrderReq()?.orderType()).toBe("C");
    expect(env.directOrderReq()?.orgOrderNo()).toBe("0000012345");
    expect(env.directOrderReq()?.quantity()).toBe(4);
  });

  it("형식 위반(ISIN·가격·int 범위)은 전부 OrderBuildError 다", () => {
    expect(() => buildDirectOrderReq({ ...ORDER, isin: "005930" })).toThrow(/ISIN/);
    expect(() => buildDirectOrderReq({ ...ORDER, price: 0 })).toThrow(/주문가격/);
    // int 표현 범위 — 한도 정책이 아니라 wrap 방지다 (D-20 은 한도를 두지 않는다).
    expect(() => buildDirectOrderReq({ ...ORDER, qty: 2_147_483_648 })).toThrow(/int/);
  });

  it("금액·수량에 상한 정책이 없다 — 100만주도 그대로 조립된다 (D-20)", () => {
    const env = readBack(buildDirectOrderReq({ ...ORDER, qty: 1_000_000, price: 1_000_000 }));
    expect(env.directOrderReq()?.quantity()).toBe(1_000_000);
    expect(env.directOrderReq()?.price()).toBe(1_000_000);
  });

  it("단일 문자 변환 3종이 잘못된 값을 거부한다 (엉뚱한 시장으로 나가지 않게)", () => {
    expect(toWireSide("B")).toBe("B");
    expect(toWireMarket("Q")).toBe("Q");
    expect(toWireOrderType("C")).toBe("C");
    expect(() => toWireSide("BUY" as never)).toThrow(OrderBuildError);
    expect(() => toWireMarket("KOSDAQ" as never)).toThrow(OrderBuildError);
    // 정정("M")은 Phase 18 D-21 에서 열렸다. 세 값 밖은 여전히 런타임에서 막는다.
    expect(toWireOrderType("M")).toBe("M");
    expect(() => toWireOrderType("X" as never)).toThrow(OrderBuildError);
  });

  it("정정(\"M\") 왕복 — order_type \"M\" + org_order_no + 요청 side 그대로 (Phase 18 D-21)", () => {
    const env = readBack(
      buildDirectOrderReq({
        ...ORDER,
        side: "S",
        orderType: "M",
        orgOrderNo: "0000135742",
        qty: 7,
        price: 71_500,
      }),
    );
    const req = env.directOrderReq();
    expect(env.msgType()).toBe(MSG.DirectOrderReq);
    expect(req?.orderType()).toBe("M");
    expect(req?.orgOrderNo()).toBe("0000135742");
    // 정정은 방향을 실어 온다 — 취소처럼 "S" 로 덮어쓰는 것이 아니라 요청 값이다.
    expect(req?.side()).toBe("S");
    expect(req?.quantity()).toBe(7);
    expect(req?.price()).toBe(71_500);
    expect(req?.orderCondition()).toBe("0");
  });

  it("정정인데 원주문번호가 없으면 ORG_ORDER_NO_REQUIRED — 정정 전용 문구로 거부한다", () => {
    for (const orgOrderNo of [undefined, ""]) {
      let caught: unknown;
      try {
        buildDirectOrderReq({ ...ORDER, orderType: "M", orgOrderNo });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(OrderBuildError);
      expect((caught as OrderBuildError).code).toBe("ORG_ORDER_NO_REQUIRED");
      expect((caught as OrderBuildError).message).toMatch(/정정 주문에는 원주문번호/);
    }
    // 취소 문구는 그대로다 — 두 갈래가 섞이지 않는다.
    expect(() => buildDirectOrderReq({ ...ORDER, orderType: "C" })).toThrow(/취소 주문에는 원주문번호/);
  });

  // ----------------------------------------------------------
  // Phase 18 D-22 / D-23 — 조각 수 · 시간외종가 세션 조건부 송신, price 0 조건부 완화
  // ----------------------------------------------------------

  /**
   * 슬롯이 와이어에 **실렸는가**. 접근자(`pieceCount()`/`krxSession()`)는 부재에도 기본값(0/null)을
   * 돌려주므로 「안 실었다」와 「0 을 실었다」를 가르지 못한다 — vtable 오프셋으로 본다.
   * `piece_count` 는 필드 10(vtable 24), `krx_session` 은 필드 11(vtable 26)이다.
   */
  function slotPresent(env: Envelope, vtableOffset: 24 | 26): boolean {
    const req = env.directOrderReq();
    if (req === null || req.bb === null) throw new Error("DirectOrderReq 슬롯이 비었습니다");
    return req.bb.__offset(req.bb_pos, vtableOffset) !== 0;
  }

  it("조각 수 미지정·0·1 은 piece_count 슬롯을 싣지 않는다 — 기존 수동주문 바이트가 한 글자도 안 바뀐다 (D-22)", () => {
    const baseline = buildDirectOrderReq(ORDER);
    for (const pieceCount of [undefined, 0, 1]) {
      const bytes = buildDirectOrderReq({ ...ORDER, pieceCount });
      expect(slotPresent(readBack(bytes), 24)).toBe(false);
      expect(Buffer.from(bytes).equals(Buffer.from(baseline))).toBe(true);
    }
  });

  it("조각 수 2·64 는 piece_count 슬롯에 그 값을 싣는다 (D-22)", () => {
    for (const pieceCount of [2, 64]) {
      const env = readBack(buildDirectOrderReq({ ...ORDER, pieceCount }));
      expect(slotPresent(env, 24)).toBe(true);
      expect(env.directOrderReq()?.pieceCount()).toBe(pieceCount);
    }
  });

  it("조각 수 65 는 조립기가 범위 정책으로 막지 않는다 — 1..64 정책의 정본은 zod 한 곳이다", () => {
    // 범위 정책을 두 곳에 적으면 갈라진다(`toWireUint` 주석). 65 는 wss 경계(zod)에서 끝난다 —
    // `relay/src/ws/__tests__/protocol.test.ts` 가 그 거부를 잠근다. 조립기는 표현 범위만 본다.
    const env = readBack(buildDirectOrderReq({ ...ORDER, pieceCount: 65 }));
    expect(env.directOrderReq()?.pieceCount()).toBe(65);
  });

  it("조각 수 비정수·음수는 OrderBuildError 다 — 반올림·절사하지 않는다", () => {
    for (const pieceCount of [0.5, 2.5, -1]) {
      let caught: unknown;
      try {
        buildDirectOrderReq({ ...ORDER, pieceCount });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(OrderBuildError);
      expect((caught as OrderBuildError).code).toBe("BAD_PIECE_COUNT");
    }
  });

  it("세션 부재·빈 문자열은 krx_session 슬롯을 싣지 않는다 — 서버 자동 판정 (D-23)", () => {
    const baseline = buildDirectOrderReq(ORDER);
    for (const krxSession of [undefined, ""] as const) {
      const bytes = buildDirectOrderReq({ ...ORDER, krxSession });
      expect(slotPresent(readBack(bytes), 26)).toBe(false);
      expect(Buffer.from(bytes).equals(Buffer.from(baseline))).toBe(true);
    }
  });

  it("세션 G2·G3 은 krx_session 슬롯에 그 값을 싣는다 (D-23)", () => {
    for (const krxSession of ["G2", "G3"] as const) {
      const env = readBack(buildDirectOrderReq({ ...ORDER, krxSession }));
      expect(slotPresent(env, 26)).toBe(true);
      expect(env.directOrderReq()?.krxSession()).toBe(krxSession);
    }
  });

  it("세션 화이트리스트 밖(G1 등)은 OrderBuildError 다 — 서버 거부에 기대지 않는다", () => {
    for (const krxSession of ["G1", "g2", "G22"]) {
      let caught: unknown;
      try {
        buildDirectOrderReq({ ...ORDER, krxSession: krxSession as never });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(OrderBuildError);
      expect((caught as OrderBuildError).code).toBe("BAD_KRX_SESSION");
    }
  });

  it("price 0 은 세션 G2/G3 일 때만 통과한다 — 4조합 (D-23)", () => {
    // 통과: 시간외종가는 서버가 결정가를 정한다.
    for (const krxSession of ["G2", "G3"] as const) {
      const env = readBack(buildDirectOrderReq({ ...ORDER, price: 0, krxSession }));
      expect(env.directOrderReq()?.price()).toBe(0);
      expect(env.directOrderReq()?.krxSession()).toBe(krxSession);
    }
    // 거부: 세션 없는 가격 0 은 지정가 0원이다 — 게이트웨이 거부 왕복 5초를 태우지 않는다.
    for (const krxSession of [undefined, ""] as const) {
      let caught: unknown;
      try {
        buildDirectOrderReq({ ...ORDER, price: 0, krxSession });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(OrderBuildError);
      expect((caught as OrderBuildError).code).toBe("BAD_PRICE");
    }
  });

  it("음수·비정수 가격은 세션과 무관하게 거부다 — 0 만 열렸다", () => {
    for (const krxSession of [undefined, "G2", "G3"] as const) {
      expect(() => buildDirectOrderReq({ ...ORDER, price: -1, krxSession })).toThrow(OrderBuildError);
      expect(() => buildDirectOrderReq({ ...ORDER, price: 70_000.5, krxSession })).toThrow(OrderBuildError);
    }
  });

  // 취소 가격은 원주문 가격의 사본이다 — 시간외종가 원주문은 0 이다 (18-REVIEW CR-01).
  // 0 은 「취소」·「G2/G3 신규」 두 갈래로만 열리고, 조립기는 모든 경로의 마지막 관문이다.
  function priceErrorOf(input: Parameters<typeof buildDirectOrderReq>[0]): OrderBuildError | undefined {
    try {
      buildDirectOrderReq(input);
    } catch (err) {
      if (err instanceof OrderBuildError) return err;
      throw err;
    }
    return undefined;
  }

  it("취소(\"C\") price 0 은 조립된다 — 바이트 price 0 · 원주문번호 그대로 (CR-01)", () => {
    const env = readBack(
      buildDirectOrderReq({ ...ORDER, orderType: "C", orgOrderNo: "0000135742", price: 0 }),
    );
    const req = env.directOrderReq();
    expect(req?.orderType()).toBe("C");
    expect(req?.orgOrderNo()).toBe("0000135742");
    expect(req?.price()).toBe(0);
    // 취소에 세션 슬롯이 생기지 않는다 — 0 은 세션이 아니라 취소 갈래로 열렸다.
    expect(req?.krxSession()).toBeNull();
  });

  it("취소(\"C\") price −1 은 BAD_PRICE — 취소 전용 문구로 거부한다 (CR-01)", () => {
    const err = priceErrorOf({ ...ORDER, orderType: "C", orgOrderNo: "0000135742", price: -1 });
    expect(err?.code).toBe("BAD_PRICE");
    expect(err?.message).toContain("취소 주문가격은 0 이상의 정수여야 합니다");
    expect(priceErrorOf({ ...ORDER, orderType: "C", orgOrderNo: "0000135742", price: 1.5 })?.code).toBe(
      "BAD_PRICE",
    );
  });

  it("세션 없는 신규(\"N\") price 0 은 BAD_PRICE — 신규 규칙은 넓어지지 않았다 (CR-01 / D-23)", () => {
    const err = priceErrorOf({ ...ORDER, orderType: "N", price: 0 });
    expect(err?.code).toBe("BAD_PRICE");
    expect(err?.message).toContain("주문가격은 1 이상의 정수여야 합니다");
  });

  it("정정(\"M\") price 0 은 BAD_PRICE — 취소 갈래가 정정으로 새지 않는다 (CR-01)", () => {
    expect(priceErrorOf({ ...ORDER, orderType: "M", orgOrderNo: "0000135742", price: 0 })?.code).toBe(
      "BAD_PRICE",
    );
  });

  it("parseOrderResp — 접수 통보는 side 를 신뢰한다", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(buildOrderRespFrame({ noticeType: "A", side: "S", orderNo: "0000099999" })),
    );
    const resp = parseOrderResp(parsed!.env);

    expect(resp).toMatchObject({
      orderNo: "0000099999",
      noticeType: "A",
      resultCode: 0,
      side: "S",
      sideTrusted: true,
      exchange: "KRX",
    });
  });

  it("parseOrderResp — 취소·정정 통보의 side 는 신뢰하지 않는다 (Pitfall 8)", () => {
    for (const noticeType of ["C", "M"]) {
      const parsed = tryParseEnvelope(Buffer.from(buildOrderRespFrame({ noticeType })));
      expect(parseOrderResp(parsed!.env)?.sideTrusted).toBe(false);
    }
    // 체결·거부는 매매구분이 살아 있다.
    for (const noticeType of ["E", "R", ""]) {
      const parsed = tryParseEnvelope(Buffer.from(buildOrderRespFrame({ noticeType })));
      expect(parseOrderResp(parsed!.env)?.sideTrusted).toBe(true);
    }
  });

  it("parseOrderResp — ISIN 이 깨져도 프레임을 버리지 않는다 (거부 통보 유실 방지)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(
        buildOrderRespFrame({ isin: "005930", noticeType: "R", resultCode: -7, message: "잔고부족" }),
      ),
    );
    const resp = parseOrderResp(parsed!.env);

    expect(resp).toMatchObject({ noticeType: "R", resultCode: -7, message: "잔고부족" });
    expect(droppedEnvelopeCount()).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it("parseOrderResp — 슬롯이 비면 null + 드롭 카운터", () => {
    const bare = tryParseEnvelope(Buffer.from(buildBareEnvelope(MSG.OrderResp)));

    expect(parseOrderResp(bare!.env)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("④-1 주문 통보가 board·request_kind·requester 를 원문 그대로 나른다 (D-08)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(
        buildOrderRespFrame({
          noticeType: "R",
          resultCode: 804,
          // 804 거부에서 서버가 이 문구를 **교체**한다 — 그래서 어디서도 파싱하지 않는다.
          message: "이미 체결·취소돼 취소(정정)할 잔량 없음",
          board: "G3",
          requestKind: "Cancel",
          requester: "Manual",
        }),
      ),
    );
    const resp = parseOrderResp(parsed!.env);

    // 행위 단어의 원천은 문구가 아니라 `requestKind` 다.
    expect(resp).toMatchObject({
      board: "G3",
      requestKind: "Cancel",
      requester: "Manual",
      resultCode: 804,
    });
  });

  it("④-2 세 필드가 전부 빈 구 서버 프레임도 기존 통보를 그대로 만든다 (회귀)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(buildOrderRespFrame({ noticeType: "A", orderNo: "0000012345" })),
    );
    const resp = parseOrderResp(parsed!.env);

    // 신규 3필드는 빈 문자열이 **정상 입력**이다 — 오류로 다루면 구 서버 통보가 통째로 사라진다.
    expect(resp).toMatchObject({
      orderNo: "0000012345",
      noticeType: "A",
      resultCode: 0,
      sideTrusted: true,
      exchange: "KRX",
      board: "",
      requestKind: "",
      requester: "",
    });
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("④-3 `buildDirectOrderReq` 는 `piece_count`·`krx_session` 을 싣지 않는다 (D-12 / T-17-05)", () => {
    // 재동기화로 접근자가 생겼어도 이번 phase 의 송신 바이트는 **무변경**이다 (Phase 18).
    const req = readBack(buildDirectOrderReq(ORDER)).directOrderReq();

    expect(req?.pieceCount()).toBe(0);
    expect(req?.krxSession()).toBeNull();
  });
});

describe("계좌 상태 조립·파싱 (D-23 / T-15-07)", () => {
  it("buildGetAccountStateReq 는 기본값이 빈 문자열이다 (전 계좌 스냅샷)", () => {
    const env = readBack(buildGetAccountStateReq());
    expect(env.msgType()).toBe(MSG.GetAccountStateReq);
    expect(env.getAccountStateReq()?.accountNo()).toBe("");

    expect(readBack(buildGetAccountStateReq("1234567801")).getAccountStateReq()?.accountNo()).toBe(
      "1234567801",
    );
  });

  it("상한 상수 3종이 C# 값과 같다 (500 / 1000 / 1000)", () => {
    expect(MAX_HOLDING_COUNT).toBe(500);
    expect(MAX_UNFILLED_COUNT).toBe(1000);
    expect(MAX_REMOVED_ORDER_COUNT).toBe(1000);
  });

  it("미체결 행의 매매구분이 깨지면 그 행만 건너뛴다 — 지어내지 않는다", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(
        buildAccountStateFrame({
          snapshot: true,
          unfilled: [
            { orderNo: "ORD1", side: "B" },
            { orderNo: "ORD2", side: "" },
            { orderNo: "ORD3", side: "X" },
            { orderNo: "", side: "S" },
          ],
        }),
      ),
    );
    const state = parseAccountState(parsed!.env, true);

    expect(state?.unf.map((u) => u.orderNo)).toEqual(["ORD1"]);
    expect(skippedAccountStateItemCount()).toBe(3);
    // 프레임 자체는 살아 있다 — 행 하나가 깨졌다고 잔고까지 잃지 않는다.
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("계좌번호가 없으면 프레임을 버린다 (키 없는 잔고는 쓸 수 없다)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(buildAccountStateFrame({ accountNo: "", snapshot: true })),
    );

    expect(parseAccountState(parsed!.env, true)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("본문 is_snapshot 이 msg_type 과 어긋나면 msg_type 을 따르고 경고한다 (D-33)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(buildAccountStateFrame({ snapshot: false, bodyIsSnapshot: true })),
    );

    expect(parseAccountState(parsed!.env, false)?.snap).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("account_state 슬롯이 비면 null + 드롭 카운터", () => {
    const bare = tryParseEnvelope(Buffer.from(buildBareEnvelope(MSG.GetAccountStateResp)));

    expect(parseAccountState(bare!.env, true)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
  });

  it("수신 방향 정규화 — 거래소는 NXT 만 NXT, 매매구분은 첫 글자", () => {
    expect(fromWireExchange("NXT")).toBe("NXT");
    // 구 서버는 이 필드를 비운다 — 드롭 사유가 아니라 KRX 열화다 (Phase 16 D-12).
    expect(fromWireExchange("")).toBe("KRX");
    expect(fromWireExchange("KRX")).toBe("KRX");
    expect(fromWireExchange("nxt")).toBe("KRX");

    expect(fromWireSide("B")).toBe("B");
    expect(fromWireSide("Sell")).toBe("S");
    expect(fromWireSide("")).toBeNull();
    expect(fromWireSide("X")).toBeNull();
  });

  it("③-1 미체결 5필드는 **해석 없이 원문 그대로** 올라온다 (D-07)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(
        buildAccountStateFrame({
          snapshot: true,
          unfilled: [
            {
              orderNo: "Q091533123",
              orderTime: "091533",
              queuedStatus: "예약대기",
              pendingStatus: "증권사 보관 · 09:00 처리",
              board: "G2",
              pendingCancelSent: true,
            },
          ],
        }),
      ),
    );
    const row = parseAccountState(parsed!.env, true)?.unf[0];

    // 문구를 잘라 상태를 만들지 않고, `board` 로 side 를 바꾸지 않는다.
    expect(row).toMatchObject({
      orderNo: "Q091533123",
      orderTime: "091533",
      queuedStatus: "예약대기",
      pendingStatus: "증권사 보관 · 09:00 처리",
      board: "G2",
      pendingCancelSent: true,
    });
  });

  it("③-2 빈 `board` · 부재 `pending_cancel_sent` 는 `\"\"` · `false` 다 (구 서버 정상 입력)", () => {
    const parsed = tryParseEnvelope(
      Buffer.from(buildAccountStateFrame({ snapshot: true, unfilled: [{ orderNo: "ORD1" }] })),
    );
    const row = parseAccountState(parsed!.env, true)?.unf[0];

    expect(row!.board).toBe("");
    expect(row!.pendingCancelSent).toBe(false);
    expect(row!.queuedStatus).toBe("");
    expect(row!.pendingStatus).toBe("");
  });

  it("③-3 `pendingCancelSent === true` 행을 목록에서 **빼지 않는다** (D-07 이중 판정 금지)", () => {
    // 서버가 브로커 앞에서 `R` 로 답한다. relay 가 여기서 또 판정하면 취소 경로가 두 벌이 된다.
    // 회색 처리·취소 버튼 숨김은 화면의 몫이다 (D-14).
    const parsed = tryParseEnvelope(
      Buffer.from(
        buildAccountStateFrame({
          snapshot: true,
          unfilled: [
            { orderNo: "ORD1", pendingCancelSent: true },
            { orderNo: "ORD2", pendingCancelSent: false },
          ],
        }),
      ),
    );
    const state = parseAccountState(parsed!.env, true);

    expect(state?.unf.map((u) => u.orderNo)).toEqual(["ORD1", "ORD2"]);
    expect(skippedAccountStateItemCount()).toBe(0);
  });
});

/**
 * 전략 요청 빌더 7종 (16-04 / TRADE-03).
 *
 * 여기서 증명하는 것은 **보내는 쪽이 의도한 슬롯·필드에만 값을 넣는가**다. 파서(16-05)가
 * 아직 없으므로 생성 접근자로 직접 되읽는다 — 그래야 파서 버그가 빌더 버그를 가리지 않는다.
 * 가장 중요한 단언 둘은 "S→C 전용 4필드가 비어 있다"와 "sweep 고정 3이 못박혔다"다.
 */
/**
 * 33필드를 전부 채운 기준 입력 (16-04 조립 · 16-05 파싱이 **같은 픽스처**를 쓴다).
 *
 * 두 벌로 두면 한쪽만 고쳐져 「빌더는 보냈는데 파서는 못 읽는」 갈림을 테스트가 놓친다.
 */
// 16-25(WR-03/D-28) 이후 `market` 은 `RelayLimitChaserInput` 밖이다 — relay 가 마스터에서
// 채워 빌더에 넘긴다. 픽스처도 빌더와 **같은 형**(입력 + market)이어야 갈리지 않는다.
type LcBuildInput = LcSetCfg & { market: OrderMarket };

function lcInput(over: Partial<LcBuildInput> = {}): LcBuildInput {
  return {
    isin: SAMPLE_ISIN,
    accountNo: SAMPLE_ACCOUNT_NO,
    market: "K",
    crud: "C",
    buyOrderPrice: 71_000,
    buyOrderQty: 14,
    buyWatchPrice: 71_100,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyTradeQtyEnabled: true,
    buyEnabled: true,
    sellOrderPrice: 71_200,
    sellWatchPrice: 71_300,
    sellWatchQty: 10,
    sellMinTradeQty: 30_500,
    sellEnabled: true,
    sellTradeQtyEnabled: false,
    sweepWatchPrice: 71_400,
    sweepEnabled: true,
    sweepMinTickCount: 3,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    exchange: "KRX",
    sellOrderRatio: 60,
    sellQtyTrackEnabled: true,
    sellQtyTrackRatio: 50,
    buyOrderAmount: 100,
    cancelQtyEnabled: true,
    cancelWatchQty: 25,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: true,
    // Phase 24 C→S 12 — 기본은 전부 끔 · 0 (게이트 하나만 켜서 효과를 단정하는 기본형).
    preBuyEnabled: false,
    extraBuyEnabled: false,
    extraBuyMinQty: 0,
    extraBuyMaxQty: 0,
    extraBuyOrderAmount: 0,
    extraBuyOrderQty: 0,
    postBuyEnabled: false,
    postBuyReboundPct: 0,
    postBuyFloorQty: 0,
    postBuyReentry: 0,
    postBuyOrderAmount: 0,
    postBuyOrderQty: 0,
    ...over,
  };
}

/** S→C 전용 6필드 vtable 오프셋 — `extra_buy_abandoned` 112 · `post_buy_trigger_qty` 126 ·
 *  `post_buy_reentry_left` 128 · `post_buy_phase` 130 · `extra_buy_abandon_qty` 134(quick-260930-fi4) ·
 *  `post_buy_unlock_qty` 136(quick-261002-fim). */
const LC_SERVER_ONLY_VTABLES = [112, 126, 128, 130, 134, 136] as const;

/** vtable 슬롯이 **있는** 오프셋만. 기본값 필드는 버퍼에 없어 접근자로는 부재를 증명할 수 없다
 *  (RESEARCH Pitfall 2) — 슬롯을 직접 본다. */
function presentSlots(t: SetLimitChaser, vts: readonly number[]): number[] {
  return vts.filter((vt) => t.bb!.__offset(t.bb_pos, vt) !== 0);
}

describe("전략 요청 조립 (16-04 / T-16-05·T-16-06)", () => {
  function readLc(cfg: LcBuildInput): SetLimitChaser {
    const env = readBack(buildSetLimitChaserReq(cfg));
    expect(env.msgType()).toBe(MSG.SetLimitChaserReq);
    const t = env.setLimitChaser(new SetLimitChaser());
    expect(t).not.toBeNull();
    return t!;
  }

  it("① SetLimitChaser 왕복 — 클라 입력 30필드가 슬롯 그대로 보존된다", () => {
    const t = readLc(lcInput());

    expect(t.isin()).toBe(SAMPLE_ISIN);
    expect(t.accountNo()).toBe(SAMPLE_ACCOUNT_NO);
    expect(t.market()).toBe("K");
    expect(t.crud()).toBe("C");
    expect(t.buyOrderPrice()).toBe(71_000);
    expect(t.buyOrderQty()).toBe(14);
    expect(t.buyWatchPrice()).toBe(71_100);
    expect(t.buyWatchQty()).toBe(10_000);
    expect(t.buyMinTradeQty()).toBe(30_000);
    // Phase 24 — buy_watch_side 는 싣지 않는다(buy3 서버는 읽지 않는다). gh-trade a3610261 로
    // 슬롯 24 가 봉인돼 접근자가 사라졌으므로 vtable 슬롯 부재로 직접 증명한다.
    expect(presentSlots(t, [24])).toEqual([]);
    expect(t.buyTradeQtyEnabled()).toBe(true);
    expect(t.buyEnabled()).toBe(true);
    expect(t.sellOrderPrice()).toBe(71_200);
    expect(t.sellWatchPrice()).toBe(71_300);
    expect(t.sellWatchQty()).toBe(10);
    expect(t.sellMinTradeQty()).toBe(30_500);
    expect(t.sellEnabled()).toBe(true);
    expect(t.sellTradeQtyEnabled()).toBe(false);
    expect(t.sweepWatchPrice()).toBe(71_400);
    expect(t.sweepEnabled()).toBe(true);
    expect(t.sweepMinTickCount()).toBe(3);
    expect(t.exchange()).toBe("KRX");
    expect(t.sellOrderRatio()).toBe(60);
    expect(t.sellQtyTrackEnabled()).toBe(true);
    expect(t.sellQtyTrackRatio()).toBe(50);
    expect(t.buyOrderAmount()).toBe(100);
    expect(t.cancelQtyEnabled()).toBe(true);
    expect(t.cancelWatchQty()).toBe(25);
    expect(t.cancelTradeEnabled()).toBe(false);
    expect(t.cancelQtyTrackEnabled()).toBe(true);
  });

  it("② sweep 고정 3은 입력과 무관하게 true/0/0 으로 못박힌다 (경고 동반)", () => {
    const t = readLc(lcInput({ sweepRecalcEnabled: false, sweepMinCount: 7, sweepMinRate: 2_950 }));

    expect(t.sweepRecalcEnabled()).toBe(LC_FIXED_SWEEP_RECALC_ENABLED);
    expect(t.sweepMinCount()).toBe(LC_FIXED_SWEEP_MIN_COUNT);
    expect(t.sweepMinRate()).toBe(LC_FIXED_SWEEP_MIN_RATE);
    expect(t.sweepRecalcEnabled()).toBe(true);
    expect(t.sweepMinCount()).toBe(0);
    expect(t.sweepMinRate()).toBe(0);
    // 조용히 덮지 않는다 (PC-7).
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("②-b 입력이 고정값과 같으면 경고를 남기지 않는다", () => {
    readLc(lcInput());
    expect(warn).not.toHaveBeenCalled();
  });

  it("③ S→C 전용 4필드는 슬롯이 비어 있다 (Pitfall 6)", () => {
    const t = readLc(lcInput());

    // flatc 는 미설정 스칼라에 기본값을 돌려준다 — uint 0 / bool false 가 "안 실었다"의 증거다.
    expect(t.sellOrderQty()).toBe(0);
    expect(t.sellQtyTrackBaseline()).toBe(0);
    expect(t.sellEntryLatched()).toBe(false);
    expect(t.cancelQtyTrackBaseline()).toBe(0);
  });

  it("③-buy3 buy3_schema=1 고정 · C→S 12 는 값 그대로 · buy_watch_side 와 S→C 4 는 슬롯이 없다 (Phase 24 D-24 · T-24-01/02)", () => {
    // 옛 탭이 감시대상 "1" 을 실어 보낸 모양 — 입력 계약에는 그 키가 없다(24-03). 변수로 넘겨
    // 초과 속성 검사를 피한다(런타임에는 키가 실려 있다).
    const withLegacyKey = {
      ...lcInput({
        preBuyEnabled: true,
        extraBuyEnabled: true,
        extraBuyMinQty: 50_000,
        extraBuyMaxQty: 150_000,
        extraBuyOrderAmount: 4000,
        extraBuyOrderQty: 3,
        postBuyEnabled: true,
        postBuyReboundPct: 30,
        postBuyFloorQty: 100_000,
        postBuyReentry: 3,
        postBuyOrderAmount: 4000,
        postBuyOrderQty: 3,
      }),
      buyWatchSide: "1",
    };
    const t = readLc(withLegacyKey);

    expect(LC_FIXED_BUY3_SCHEMA).toBe(1);
    expect(t.buy3Schema()).toBe(1);
    expect(t.preBuyEnabled()).toBe(true);
    expect(t.extraBuyEnabled()).toBe(true);
    expect(t.extraBuyMinQty()).toBe(50_000);
    expect(t.extraBuyMaxQty()).toBe(150_000);
    expect(t.extraBuyOrderAmount()).toBe(4000);
    expect(t.extraBuyOrderQty()).toBe(3);
    expect(t.postBuyEnabled()).toBe(true);
    expect(t.postBuyReboundPct()).toBe(30);
    expect(t.postBuyFloorQty()).toBe(100_000);
    expect(t.postBuyReentry()).toBe(3);
    expect(t.postBuyOrderAmount()).toBe(4000);
    expect(t.postBuyOrderQty()).toBe(3);
    // 입력이 "1" 이어도 싣지 않는다 — 구 클라 경로(buy3_schema=0 ∧ side "1")를 열 수 없다.
    // 슬롯 24 봉인(gh-trade a3610261)으로 접근자가 없어 vtable 슬롯 부재로 증명한다.
    expect(presentSlots(t, [24])).toEqual([]);
    // S→C 전용 4필드는 vtable 슬롯 자체가 없다.
    expect(presentSlots(t, LC_SERVER_ONLY_VTABLES)).toEqual([]);
    // 대조군 — 실은 필드는 슬롯이 있다(판정기가 늘 빈 배열을 내는 거짓 green 방지).
    expect(presentSlots(t, [98, 100, 114, 120])).toEqual([98, 100, 114, 120]);
  });

  it("③-buy3-b 끄고 0 을 보내도 buy3_schema 는 1 로 실린다 (슬롯 존재)", () => {
    const t = readLc(lcInput());
    expect(t.buy3Schema()).toBe(1);
    expect(presentSlots(t, [98])).toEqual([98]);
  });

  /*
    ③-auto — 후매수 ☐자동(quick-260929-vzy · gh-trade dcaa78b1). buy3_schema 는 `postBuyAuto` **존재로만** 파생된다
    (D-03 · T-24-01 확장). 부재 = 1 · 슬롯 없음(서버 값 유지) · 있으면 = 2 · 값 그대로.
  */
  describe("③-auto post_buy_auto · buy3_schema 파생 (quick-260929-vzy D-03 · T-vzy-01)", () => {
    const AUTO_VT = 132;

    it("① postBuyAuto 없음 → buy3_schema 1 · vtable 132 슬롯 없음 · postBuyAuto() false", () => {
      const t = readLc(lcInput());
      expect(t.buy3Schema()).toBe(LC_FIXED_BUY3_SCHEMA);
      expect(presentSlots(t, [AUTO_VT])).toEqual([]);
      expect(t.postBuyAuto()).toBe(false);
    });

    it("② postBuyAuto true → buy3_schema 2 · 슬롯 있음 · true", () => {
      expect(LC_POST_BUY_AUTO_BUY3_SCHEMA).toBe(2);
      const t = readLc(lcInput({ postBuyAuto: true }));
      expect(t.buy3Schema()).toBe(2);
      expect(presentSlots(t, [AUTO_VT])).toEqual([AUTO_VT]);
      expect(t.postBuyAuto()).toBe(true);
    });

    it("② postBuyAuto false → buy3_schema 2 · false(기본값이라 슬롯은 없어도 서버는 schema 2 에서 부재=false)", () => {
      const t = readLc(lcInput({ postBuyAuto: false }));
      expect(t.buy3Schema()).toBe(2);
      expect(t.postBuyAuto()).toBe(false);
    });

    it("② 입력에 초과 속성 buy3Schema: 0 을 끼워도 1/2 로만 나간다 (브라우저는 스키마를 고를 수 없다)", () => {
      const withoutAuto = { ...lcInput(), buy3Schema: 0 };
      const withAuto = { ...lcInput({ postBuyAuto: true }), buy3Schema: 0 };
      expect(readLc(withoutAuto).buy3Schema()).toBe(1);
      expect(readLc(withAuto).buy3Schema()).toBe(2);
    });
  });

  /*
    ③-burst — 추가매수 ☐버스트 시 해제(quick-261003-rc4 · gh-trade 3dabd6ff · 합의 2026-10-03). buy3_schema 3 은
    `postBuyAuto` · `extraBuyBurstRelease` **둘 다** 있을 때만 파생된다 — 서버는 3 이상에서 post_buy_auto 도 읽으므로
    자동 없이 3 을 보내면 자동이 부재=false 로 지워진다(P-1 단조성). vtable 138.
  */
  describe("③-burst extra_buy_burst_release · buy3_schema 3 파생 (quick-261003-rc4 D-01 · T-rc4-01/02)", () => {
    const AUTO_VT = 132;
    const BURST_VT = 138;

    it("B1 postBuyAuto true + extraBuyBurstRelease true → buy3_schema 3 · 138 슬롯 있음 · 둘 다 true", () => {
      expect(LC_BURST_RELEASE_BUY3_SCHEMA).toBe(3);
      const t = readLc(lcInput({ postBuyAuto: true, extraBuyBurstRelease: true }));
      expect(t.buy3Schema()).toBe(3);
      expect(presentSlots(t, [AUTO_VT, BURST_VT])).toEqual([AUTO_VT, BURST_VT]);
      expect(t.extraBuyBurstRelease()).toBe(true);
      expect(t.postBuyAuto()).toBe(true);
    });

    it("B2 둘 다 false → buy3_schema 3 · burst false (기본값이라 슬롯 없어도 서버는 schema 3 에서 부재=false)", () => {
      const t = readLc(lcInput({ postBuyAuto: false, extraBuyBurstRelease: false }));
      expect(t.buy3Schema()).toBe(3);
      expect(t.extraBuyBurstRelease()).toBe(false);
      expect(t.postBuyAuto()).toBe(false);
    });

    it("B3 postBuyAuto 만 → 2 · 138 슬롯 없음 / 둘 다 없음 → 1 · 132 · 138 슬롯 없음", () => {
      const auto = readLc(lcInput({ postBuyAuto: true }));
      expect(auto.buy3Schema()).toBe(LC_POST_BUY_AUTO_BUY3_SCHEMA);
      expect(presentSlots(auto, [BURST_VT])).toEqual([]);
      const none = readLc(lcInput());
      expect(none.buy3Schema()).toBe(LC_FIXED_BUY3_SCHEMA);
      expect(presentSlots(none, [AUTO_VT, BURST_VT])).toEqual([]);
    });

    it("B4 extraBuyBurstRelease 만(postBuyAuto 없음) → 1 · 132 · 138 슬롯 없음 · warn 1회 · throw 없음 (P-1)", () => {
      warn.mockClear();
      const t = readLc(lcInput({ extraBuyBurstRelease: true }));
      expect(t.buy3Schema()).toBe(LC_FIXED_BUY3_SCHEMA);
      expect(presentSlots(t, [AUTO_VT, BURST_VT])).toEqual([]);
      expect(t.extraBuyBurstRelease()).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("B5 입력에 초과 속성 buy3Schema 0 · 3 을 끼워도 파생값만 나간다 (브라우저는 스키마를 고를 수 없다)", () => {
      for (const forged of [0, 3]) {
        expect(readLc({ ...lcInput(), buy3Schema: forged } as LcBuildInput).buy3Schema()).toBe(1);
        expect(readLc({ ...lcInput({ postBuyAuto: true }), buy3Schema: forged } as LcBuildInput).buy3Schema()).toBe(2);
        expect(
          readLc({ ...lcInput({ postBuyAuto: true, extraBuyBurstRelease: true }), buy3Schema: forged } as LcBuildInput).buy3Schema(),
        ).toBe(3);
      }
    });

    it("lcBuy3SchemaOf 는 필드 존재로만 1 · 2 · 3 을 낸다 (값 무관)", () => {
      expect(lcBuy3SchemaOf({})).toBe(1);
      expect(lcBuy3SchemaOf({ postBuyAuto: false })).toBe(2);
      expect(lcBuy3SchemaOf({ postBuyAuto: false, extraBuyBurstRelease: false })).toBe(3);
      expect(lcBuy3SchemaOf({ extraBuyBurstRelease: true })).toBe(1);
    });
  });

  it("④ isin·accountNo 는 서버 strncpy 와 같은 12자로 절단된다", () => {
    const t = readLc(lcInput({ isin: `${SAMPLE_ISIN}XX`, accountNo: "123456789012345" }));

    expect(t.isin()).toBe(SAMPLE_ISIN);
    expect(t.accountNo()).toBe("123456789012");
  });

  it("⑤ 형식·범위 위반은 조용히 나가지 않고 OrderBuildError 다", () => {
    expect(() => buildSetLimitChaserReq(lcInput({ isin: "KR700593" }))).toThrow(OrderBuildError);
    expect(() => buildSetLimitChaserReq(lcInput({ accountNo: "" }))).toThrow(OrderBuildError);
    expect(() =>
      buildSetLimitChaserReq(lcInput({ exchange: "SGX" as unknown as RelayExchange })),
    ).toThrow(/거래소/);
    expect(() =>
      buildSetLimitChaserReq(lcInput({ crud: "X" as unknown as RelayLimitChaserInput["crud"] })),
    ).toThrow(/등록구분/);
    // Phase 24 — 감시대상은 입력 계약에 없다(24-03). 옛 키가 실려 와도 조립기는 읽지 않는다.
    const staleWatchSide = { ...lcInput(), buyWatchSide: "2" };
    expect(() => buildSetLimitChaserReq(staleWatchSide)).not.toThrow();
    // uint 를 넘기면 감싸서 전혀 다른 가격이 된다 — 표현 범위에서 막는다.
    expect(() => buildSetLimitChaserReq(lcInput({ buyOrderPrice: -1 }))).toThrow(/uint/);
    expect(() => buildSetLimitChaserReq(lcInput({ buyOrderPrice: 1.5 }))).toThrow(/uint/);
    expect(() => buildSetLimitChaserReq(lcInput({ sweepMinTickCount: 256 }))).toThrow(/ubyte/);
    expect(() => buildSetLimitChaserReq(lcInput({ postBuyReentry: 256 }))).toThrow(/ubyte/);
    expect(() => buildSetLimitChaserReq(lcInput({ extraBuyMinQty: -1 }))).toThrow(/uint/);
  });

  it("⑥ SetVITrigger 왕복 — 금액은 bigint 승격, priceType 은 relay 가 U 로 채운다", () => {
    const env = readBack(
      buildSetVITriggerReq({
        accountNo: SAMPLE_ACCOUNT_NO,
        exchange: "KRX",
        orderAmountKrw: 3_000_000,
        checkRate: 25,
        run: true,
      }),
    );

    expect(env.msgType()).toBe(MSG.SetVITriggerReq);
    const t = env.setViTrigger(new SetVITrigger());
    expect(t!.accountNo()).toBe(SAMPLE_ACCOUNT_NO);
    expect(t!.orderAmountKrw()).toBe(3_000_000n);
    // 정수 % 다 — sweepMinRate 의 BasisPoints 와 단위가 다르다 (Pitfall 5).
    expect(t!.checkRate()).toBe(25);
    expect(t!.priceType()).toBe("U");
    expect(t!.run()).toBe(true);

    // 하락 감시를 막지 않는다.
    const down = readBack(
      buildSetVITriggerReq({
        accountNo: SAMPLE_ACCOUNT_NO,
        exchange: "KRX",
        orderAmountKrw: 0,
        checkRate: -10,
        run: false,
      }),
    );
    expect(down.setViTrigger(new SetVITrigger())!.checkRate()).toBe(-10);
  });

  it("⑥-c 조립기는 거래소를 **호출부가 준 값 그대로** 싣는다 — 기본값이 없다 (17-05 / T-17-17)", () => {
    // NXT 를 지정하면 NXT 가 나간다. 조립기가 기본값을 쥐고 있으면 여기서 KRX 로 덮인다 —
    // `buildSetLimitChaserReq` 의 `market` 기본값 `"K"` 가 코스닥 전략을 코스피로 등록시킨
    // 선례가 정확히 그 실패다.
    const nxt = readBack(
      buildSetVITriggerReq({
        accountNo: SAMPLE_ACCOUNT_NO,
        exchange: "NXT",
        orderAmountKrw: 3_000_000,
        checkRate: 25,
        run: true,
      }),
    );
    expect(nxt.setViTrigger(new SetVITrigger())!.exchange()).toBe("NXT");

    // KRX 도 **명시로** 실린다(슬롯을 비워 서버 기본값에 기대지 않는다).
    const krx = readBack(
      buildSetVITriggerReq({
        accountNo: SAMPLE_ACCOUNT_NO,
        exchange: "KRX",
        orderAmountKrw: 3_000_000,
        checkRate: 25,
        run: true,
      }),
    );
    expect(krx.setViTrigger(new SetVITrigger())!.exchange()).toBe("KRX");

    // 미지 거래소는 조립 단계에서 끊는다 — zod 를 타지 않는 내부 호출의 최후 방어선이다.
    expect(() =>
      buildSetVITriggerReq({
        accountNo: SAMPLE_ACCOUNT_NO,
        exchange: "KOSPI" as unknown as ViTriggerInput["exchange"],
        orderAmountKrw: 3_000_000,
        checkRate: 25,
        run: true,
      }),
    ).toThrow(/거래소/);
  });

  it("⑥-b 소수 금액·빈 계좌번호는 BigInt 승격 전에 막는다", () => {
    expect(() =>
      buildSetVITriggerReq({
        accountNo: SAMPLE_ACCOUNT_NO,
        exchange: "KRX",
        orderAmountKrw: 1.5,
        checkRate: 25,
        run: true,
      }),
    ).toThrow(OrderBuildError);
    expect(() =>
      buildSetVITriggerReq({ accountNo: "", exchange: "KRX", orderAmountKrw: 100, checkRate: 25, run: true }),
    ).toThrow(/계좌번호/);
  });

  it("⑦ ConfirmVIOrderReq 왕복 + 빈 주문번호는 보내지 않는다", () => {
    const env = readBack(buildConfirmVIOrderReq({ orderNo: "0001234567", confirmed: true }));

    expect(env.msgType()).toBe(MSG.ConfirmVIOrderReq);
    const t = env.confirmViOrderReq(new ConfirmVIOrderReq());
    expect(t!.orderNo()).toBe("0001234567");
    expect(t!.confirmed()).toBe(true);

    // 서버가 조용히 드롭하므로 애초에 조립하지 않는다 — 영원히 안 오는 응답을 기다리지 않는다.
    expect(() => buildConfirmVIOrderReq({ orderNo: "", confirmed: true })).toThrow(OrderBuildError);
  });

  it("⑧ DisableStrategiesReq — 빈 키는 전체, 64바이트 초과는 던진다 (T-16-06)", () => {
    const all = readBack(buildDisableStrategiesReq());
    expect(all.msgType()).toBe(MSG.DisableStrategiesReq);
    expect(all.disableStrategiesReq(new DisableStrategiesReq())!.key()).toBe("");

    const key = `${SAMPLE_ISIN}:${SAMPLE_ACCOUNT_NO}:KRX`;
    const one = readBack(buildDisableStrategiesReq(key));
    expect(one.disableStrategiesReq(new DisableStrategiesReq())!.key()).toBe(key);

    expect(() => buildDisableStrategiesReq("a".repeat(MAX_STRATEGY_KEY_BYTES))).not.toThrow();
    expect(() => buildDisableStrategiesReq("a".repeat(MAX_STRATEGY_KEY_BYTES + 1))).toThrow(
      OrderBuildError,
    );
    // 문자 길이가 아니라 UTF-8 바이트로 잰다 — 한글 1자는 3바이트다.
    expect(() => buildDisableStrategiesReq("가".repeat(22))).toThrow(/64B/);
  });

  it("⑨ 본문 없는 요청은 **2종(24/34)** 이다 — 21 은 거래소를 싣는다 (17-05 / D-06)", () => {
    const list = readBack(buildGetLimitChaserListReq());
    expect(list.msgType()).toBe(MSG.GetLimitChaserListReq);
    expect(list.setLimitChaser()).toBeNull();
    expect(list.limitChaserList()).toBeNull();
    expect(list.getStrategyReq()).toBeNull();

    const orders = readBack(buildGetVIOrderListReq());
    expect(orders.msgType()).toBe(MSG.GetVIOrderListReq);
    expect(orders.viOrderList()).toBeNull();
    expect(orders.getStrategyReq()).toBeNull();

    // ★ 21 은 더 이상 빈 Envelope 가 아니다 (17-05 가 바꾼 불변식).
    //   서버 `Gateway::ProcessGetVITrigger` 는 `get_strategy_req.key` **문자열로 거래소 슬롯을
    //   고른다** — 빈 키는 KRX 로 접히므로, 본문을 비우면 NXT 슬롯은 영원히 조회되지 않는다
    //   (`StockDMA.fbs:642-648` 「GetVITriggerReq(21) 에서는 거래소 문자열」).
    for (const exchange of ["KRX", "NXT"] as const) {
      const vi = readBack(buildGetVITriggerReq(exchange));
      expect(vi.msgType()).toBe(MSG.GetVITriggerReq);
      expect(vi.getStrategyReq()!.key()).toBe(exchange);
    }
  });

  it("⑩ 요청 7종은 수신 화이트리스트를 통과하지 못한다 (반사 프레임 방어)", () => {
    for (const bytes of [
      buildSetLimitChaserReq(lcInput()),
      buildSetVITriggerReq({
        accountNo: SAMPLE_ACCOUNT_NO,
        exchange: "KRX",
        orderAmountKrw: 100,
        checkRate: 25,
        run: false,
      }),
      buildDisableStrategiesReq(),
      buildConfirmVIOrderReq({ orderNo: "0001234567", confirmed: false }),
      buildGetLimitChaserListReq(),
      buildGetVITriggerReq("KRX"),
      buildGetVIOrderListReq(),
    ]) {
      expect(tryParseEnvelope(Buffer.from(bytes))).toBeNull();
    }
    expect(droppedEnvelopeCount()).toBe(7);
  });
});

/**
 * 전략 응답 파서 6종 (16-05 / TRADE-03).
 *
 * 증명해야 하는 것은 하나다 — **서버가 되돌려준 값이 계약 타입으로 정확히 도착하고,
 * 도착하지 못한 것은 조용히 사라지지 않는다.** 특히 세 가지를 못박는다:
 *   ① 37필드 왕복(S→C 전용 4 포함) — 슬롯이 한 칸 밀리면 즉시 깨진다
 *   ② bigint 가 계약 밖으로 새지 않는다 — `encode()` 를 실제로 호출해 런타임으로 증명한다
 *   ③ `crud:"D"` 는 삭제 신호로 보존된다 — 두 스위치만 보고 삭제를 판정하지 않는다
 */
describe("전략 응답 파싱 (16-05 / Pitfall 3·6·7)", () => {
  /** 응답 프레임을 **수신 경로 그대로**(화이트리스트 포함) 통과시킨다. */
  function inbound(bytes: Uint8Array) {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    expect(parsed).not.toBeNull();
    return parsed!;
  }

  it("① 67필드 왕복(68키) — 요청 필드가 그대로 돌아오고 S→C 전용은 0/false 다", () => {
    const cfg = lcInput();
    // 요청 빌더의 산출물을 에코 파서로 되읽는다. 빌더와 파서가 **같은 슬롯**을 보는지가
    // 이 왕복의 전부다 — 한쪽만 밀려도 값이 어긋나 실패 메시지에 그대로 드러난다.
    const item = parseLimitChaserEcho(readBack(buildSetLimitChaserReq(cfg)));

    expect(item).not.toBeNull();
    expect(item).toMatchObject(cfg);

    // S→C 전용 — 빌더가 보내지 않았으므로 **서버가 안 채운 상태**로 0/false 다.
    // 「보내지 않는 것」과 「읽지 않는 것」은 다른 문제라 값이 존재해야 한다 (Pitfall 6).
    expect(item!.sellOrderQty).toBe(0);
    expect(item!.sellQtyTrackBaseline).toBe(0);
    expect(item!.sellEntryLatched).toBe(false);
    expect(item!.cancelQtyTrackBaseline).toBe(0);
    expect(item!.cancelEntryLatched).toBe(false);
    expect(item!.extraBuyAbandoned).toBe(false);
    expect(item!.postBuyTriggerQty).toBe(0);
    expect(item!.postBuyReentryLeft).toBe(0);
    expect(item!.postBuyPhase).toBe(0);
    expect(item!.extraBuyAbandonQty).toBe(0);
    expect(item!.postBuyUnlockQty).toBe(0);
    // buy3_schema 는 relay 가 1 로 싣는다 — 되읽으면 1.
    expect(item!.buy3Schema).toBe(1);

    // 입력에 없던 양방향 extraBuyBurstRelease 는 실리지 않았으므로 false.
    expect(item!.extraBuyBurstRelease).toBe(false);

    // 활성 59 + 파생 key = 60. (39 − 1(매수 진입 래치 봉인) + 17(Phase 24) + 1(postBuyAuto · quick-260929-vzy)
    // + 1(extraBuyAbandonQty · quick-260930-fi4) + 1(postBuyUnlockQty · quick-261002-fim)
    // + 1(extraBuyBurstRelease · quick-261003-rc4) + 8(자동매도 · Phase 27) = 67 + key).
    // 필드를 하나라도 빠뜨리면 여기서 잡힌다.
    expect(Object.keys(item!)).toHaveLength(68);
    expect(item!.key).toBe(strategyKey(SAMPLE_ISIN, SAMPLE_ACCOUNT_NO, "KRX"));
  });

  it("② sweep 고정 3은 어떤 입력을 줘도 클라 고정값으로 왕복한다", () => {
    const item = parseLimitChaserEcho(
      readBack(
        buildSetLimitChaserReq(
          lcInput({ sweepRecalcEnabled: false, sweepMinCount: 7, sweepMinRate: 2_950 }),
        ),
      ),
    );

    expect(item!.sweepRecalcEnabled).toBe(LC_FIXED_SWEEP_RECALC_ENABLED);
    expect(item!.sweepMinCount).toBe(LC_FIXED_SWEEP_MIN_COUNT);
    expect(item!.sweepMinRate).toBe(LC_FIXED_SWEEP_MIN_RATE);
    // 조용히 덮지 않는다 — 덮어썼다는 사실이 로그에 남는다 (PC-7).
    expect(warn).toHaveBeenCalled();
  });

  it("③ 13자 계좌번호는 12자로 절단돼 왕복하고 전략 키도 절단본을 쓴다", () => {
    const item = parseLimitChaserEcho(
      readBack(buildSetLimitChaserReq(lcInput({ accountNo: "1234567801234" }))),
    );

    expect(item!.accountNo).toBe("123456780123");
    // 서버가 `strncpy(…,12)` 한 값으로 키를 만들므로 클라도 절단본을 써야 에코가 매칭된다.
    expect(item!.key).toBe(`${SAMPLE_ISIN}:123456780123:KRX`);
  });

  it("④ 60 에코의 crud \"D\" 는 삭제 신호로 보존된다 (Pitfall 7)", () => {
    const e = inbound(buildSetLimitChaserRespFrame({ crud: "D" }));
    expect(e.msgType).toBe(MSG.SetLimitChaserResp);
    expect(parseLimitChaserEcho(e.env)!.crud).toBe("D");

    // 서버는 첫 글자만 본다 — 파서도 같아야 한다.
    expect(parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({ crud: "Delete" })).env)!.crud).toBe("D");
  });

  it("⑤ 취소 게이트가 켜져 있으면 매수·매도를 둘 다 꺼도 삭제가 아니다 (Pitfall 7 문서화)", () => {
    // 서버 정규화 조건은 `!buy && !sell && !AnyCancelEnabled` 다. 취소가 살아 있으면
    // 전략이 남으므로 에코는 `crud:"C"` 로 온다 — 파서가 이것을 삭제로 바꾸면 안 된다.
    const item = parseLimitChaserEcho(
      inbound(
        buildSetLimitChaserRespFrame({
          crud: "C",
          buyEnabled: false,
          sellEnabled: false,
          cancelQtyEnabled: true,
        }),
      ).env,
    );

    expect(item!.crud).toBe("C");
    expect(item!.buyEnabled).toBe(false);
    expect(item!.sellEnabled).toBe(false);
    expect(item!.cancelQtyEnabled).toBe(true);
  });

  it("⑤-2 취소 진입 확인 래치는 무장과 접지 않은 **원값**으로 올라온다 (D-05)", () => {
    // 이 단언이 17-01 재동기화가 와이어 끝에서 끝까지 통했다는 증거다.
    // `cancelEntryLatched=true` 인데 취소 무장(`cancelQtyEnabled`·`cancelTradeEnabled`)이
    // **둘 다 꺼진** 조합 — 파서가 `&& enabled` 로 접으면 여기서 false 가 되어 깨진다.
    // 서버는 이 조합을 실제로 보낸다(래치는 살아 있고 무장만 꺼진 상태).
    const latent = parseLimitChaserEcho(
      inbound(
        buildSetLimitChaserRespFrame({
          cancelEntryLatched: true,
          cancelQtyEnabled: false,
          cancelTradeEnabled: false,
          buyEnabled: false,
        }),
      ).env,
    );

    expect(latent!.cancelEntryLatched).toBe(true);
    // 접지 않았음을 대조군으로 못박는다 — 무장 쪽은 서버가 보낸 false 그대로다.
    expect(latent!.cancelQtyEnabled).toBe(false);
    expect(latent!.cancelTradeEnabled).toBe(false);
    expect(latent!.buyEnabled).toBe(false);

    // 부재 필드는 false(잠복)로 읽힌다 — 구 서버/미점등 상태의 안전한 방향이다.
    const absent = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({})).env);
    expect(absent!.cancelEntryLatched).toBe(false);
    // 매수 진입 래치는 Phase 24 D-25 로 봉인됐다 — 계약에서 사라졌다(키 수 56 이 증명한다).
  });

  it("⑤-buy3 60 · 64 의 Phase 24 신필드 17 이 같은 값으로 파싱되고 buy_watch_side 부재는 \"0\" 이다", () => {
    const echo = {
      buyEnabled: true,
      buy3Schema: 1,
      preBuyEnabled: true,
      extraBuyEnabled: true,
      extraBuyMinQty: 50_000,
      extraBuyMaxQty: 150_000,
      extraBuyOrderAmount: 4000,
      extraBuyOrderQty: 3,
      extraBuyAbandoned: true,
      // D-21 — 서버가 이미 접어 보낸 값을 relay 는 다시 접지 않는다.
      postBuyEnabled: true,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyReentry: 3,
      postBuyOrderAmount: 4000,
      postBuyOrderQty: 3,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 2,
      postBuyPhase: 2,
    };
    const single = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame(echo)).env);
    const list = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([echo])).env);

    expect(single).toMatchObject(echo);
    expect(list).toHaveLength(1);
    expect(list![0]).toMatchObject(echo);
    // 새 서버 에코에는 감시대상 슬롯이 없다 → "0".
    expect(single!.buyWatchSide).toBe("0");
    expect(list![0]!.buyWatchSide).toBe("0");
    expect(Object.keys(single!)).toHaveLength(68);
    expect(Object.keys(list![0]!)).toHaveLength(68);

    // postBuyEnabled 는 서버 값 그대로 — false 로 접혀 온 에코는 false(phase 와 무관하게).
    const folded = parseLimitChaserEcho(
      inbound(buildSetLimitChaserRespFrame({ postBuyEnabled: false, postBuyPhase: 1 })).env,
    );
    expect(folded!.postBuyEnabled).toBe(false);
    expect(folded!.postBuyPhase).toBe(1);

    // 구 서버 흉내(buy3_schema 0) 도 파싱은 된다 — 판정은 UI 몫.
    const legacy = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({ buy3Schema: 0 })).env);
    expect(legacy!.buy3Schema).toBe(0);
  });

  it("⑤-auto 60 · 64 의 postBuyAuto 를 디코드한다 — 기본 프레임 false · true 에코는 true (quick-260929-vzy D-01)", () => {
    const single = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({ postBuyAuto: true })).env);
    const list = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([{ postBuyAuto: true }])).env);
    expect(single!.postBuyAuto).toBe(true);
    expect(list![0]!.postBuyAuto).toBe(true);
    const plain = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({})).env);
    expect(plain!.postBuyAuto).toBe(false);
    expect(Object.keys(plain!)).toHaveLength(68);
  });

  it("⑤-abandon-qty 60 · 64 의 extraBuyAbandonQty 를 디코드한다 — 기본 프레임 0 · 포기 에코는 645842 (quick-260930-fi4)", () => {
    const plain = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({})).env);
    const plainList = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([{}])).env);
    expect(plain!.extraBuyAbandonQty).toBe(0);
    expect(plain!.extraBuyAbandoned).toBe(false);
    expect(plainList![0]!.extraBuyAbandonQty).toBe(0);
    expect(plainList![0]!.extraBuyAbandoned).toBe(false);

    const echo = { extraBuyAbandoned: true, extraBuyAbandonQty: 645_842 };
    const single = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame(echo)).env);
    const list = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([echo])).env);
    expect(single).toMatchObject(echo);
    expect(list![0]).toMatchObject(echo);
    expect(Object.keys(single!)).toHaveLength(68);
  });

  it("⑤-unlock-qty 60 · 64 의 postBuyUnlockQty 를 디코드한다 — 기본 프레임 0 · 잠금 에코는 264000 (quick-261002-fim)", () => {
    const plain = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({})).env);
    const plainList = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([{}])).env);
    expect(plain!.postBuyUnlockQty).toBe(0);
    expect(plainList![0]!.postBuyUnlockQty).toBe(0);

    // 잠금 중 — 발동잔량은 0 이고 해제선만 있다(gh-trade 259bc869 · C-A).
    const echo = { postBuyEnabled: true, postBuyPhase: 1, postBuyTriggerQty: 0, postBuyUnlockQty: 264_000 };
    const single = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame(echo)).env);
    const list = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([echo])).env);
    expect(single).toMatchObject(echo);
    expect(list![0]).toMatchObject(echo);
    expect(Object.keys(single!)).toHaveLength(68);
    expect(Object.keys(list![0]!)).toHaveLength(68);
  });

  it("⑤-burst 60 · 64 의 extraBuyBurstRelease 를 디코드한다 — 슬롯 부재 false · true 에코는 true (quick-261003-rc4 B6)", () => {
    const plain = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({})).env);
    const plainList = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([{}])).env);
    expect(plain!.extraBuyBurstRelease).toBe(false);
    expect(plainList![0]!.extraBuyBurstRelease).toBe(false);

    const echo = { extraBuyEnabled: true, extraBuyBurstRelease: true };
    const single = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame(echo)).env);
    const list = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([echo])).env);
    expect(single).toMatchObject(echo);
    expect(list![0]).toMatchObject(echo);
    expect(Object.keys(single!)).toHaveLength(68);
    expect(Object.keys(list![0]!)).toHaveLength(68);
  });

  it("⑤-3 S→C 전용 래치 2필드는 요청 조립기가 **싣지 않는다** (Pitfall 6 / T-17-03)", () => {
    // 조립기 산출물을 되읽어 래치가 false 로 남는지 본다. 실어 보내면 「값이 왕복한다」는
    // 착각이 생겨 에코-폼 비교가 오염된다.
    const sent = parseLimitChaserEcho(readBack(buildSetLimitChaserReq(lcInput())));
    expect(sent!.cancelEntryLatched).toBe(false);
    // Phase 24 S→C 4 + extra_buy_abandon_qty(quick-260930-fi4) + post_buy_unlock_qty(quick-261002-fim)
    // — 역시 싣지 않는다.
    expect(sent!.extraBuyAbandoned).toBe(false);
    expect(sent!.extraBuyAbandonQty).toBe(0);
    expect(sent!.postBuyUnlockQty).toBe(0);
    expect(sent!.postBuyTriggerQty).toBe(0);
    expect(sent!.postBuyReentryLeft).toBe(0);
    expect(sent!.postBuyPhase).toBe(0);
  });

  it("⑥ 빈 61 은 「미등록」이고 「파싱 실패」와 다른 값이다", () => {
    const absent = parseViTrigger(inbound(buildSetVITriggerRespFrame(null)).env);
    expect(absent).toEqual({ ok: true, cfg: null });
    // 미등록은 정상 응답이므로 드롭이 아니다.
    expect(droppedEnvelopeCount()).toBe(0);

    const broken = parseViTrigger(
      inbound(buildSetVITriggerRespFrame({ accountNo: "1234567801234" })).env,
    );
    expect(broken).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);

    // 둘이 같은 값으로 뭉개지면 UI 가 사용자 입력을 지워야 할지 알 수 없다.
    expect(absent).not.toEqual(broken);
  });

  it("⑥-d VI 파서 3종이 거래소를 싣고 빈 와이어 값은 `fromWireExchange` 가 KRX 로 정규화한다 (17-05 / D-06)", () => {
    // ① 61 — 본문이 있는 에코에는 서버가 거래소를 반드시 싣는다(`BuildVITriggerEcho`).
    //    그것이 **어느 행의 답인가**를 정하는 유일한 근거다.
    expect(
      parseViTrigger(inbound(buildSetVITriggerRespFrame({ exchange: "NXT" })).env)!.cfg!.exchange,
    ).toBe("NXT");
    // 슬롯 부재(구 서버) 와 빈 문자열 둘 다 KRX 다 — 정규화는 `fromWireExchange` 한 벌뿐이다.
    expect(parseViTrigger(inbound(buildSetVITriggerRespFrame({})).env)!.cfg!.exchange).toBe("KRX");
    expect(
      parseViTrigger(inbound(buildSetVITriggerRespFrame({ exchange: "" })).env)!.cfg!.exchange,
    ).toBe("KRX");
    // 낯선 값도 KRX 로 접는다 — 서버 `StrToExchange` 와 같은 규약이다.
    expect(
      parseViTrigger(inbound(buildSetVITriggerRespFrame({ exchange: "KOSPI" })).env)!.cfg!.exchange,
    ).toBe("KRX");

    // ② 56 발동통보 — 주문내역 '거래소' 열과 수동 취소 `DirectOrderReq.exchange` 의 원천이다.
    expect(parseViOrderNotice(inbound(buildViOrderNoticeFrame({ exchange: "NXT" })).env)!.exchange)
      .toBe("NXT");
    expect(parseViOrderNotice(inbound(buildViOrderNoticeFrame({})).env)!.exchange).toBe("KRX");

    // ③ 72/73 원소 — R8 매칭 키가 ISIN+거래소라 같은 종목이 양쪽에서 발동하면 행이 둘이다.
    const both = parseViOrderList(
      inbound(
        buildViOrderListFrame([
          { orderNo: "0000000001", state: "Accepted", exchange: "NXT" },
          { orderNo: "0000000002", state: "Accepted" },
        ]),
      ).env,
      true,
    );
    expect(both!.items.map((i) => i.exchange)).toEqual(["NXT", "KRX"]);
  });

  it("⑦ 파서 결과를 encode() 에 넣어도 TypeError 가 없다 (bigint 미유출 런타임 증명)", () => {
    const vi = parseViTrigger(
      inbound(buildSetVITriggerRespFrame({ orderAmountKrw: 9_007_199_254_740_000n })).env,
    );
    expect(vi!.cfg!.orderAmountKrw).toBe(9_007_199_254_740_000);
    expect(() => encode({ t: "vi", x: "KRX", cfg: vi!.cfg })).not.toThrow();

    const list = parseViOrderList(
      inbound(buildViOrderListFrame([{ orderNo: "0000012345", state: "Accepted" }])).env,
      true,
    );
    expect(() => encode({ t: "vi.list", snap: list!.snap, items: list!.items })).not.toThrow();

    // 대조군 — 변환을 빠뜨리면 `encode()` 는 실제로 던진다. 위의 not.toThrow 가 공허하지 않다.
    expect(() =>
      encode({
        t: "vi.list",
        snap: true,
        items: [{ ...list!.items[0]!, deadline110Ms: 1n as unknown as number }],
      }),
    ).toThrow(TypeError);
  });

  it("⑧ 72/73 은 같은 슬롯이지만 snap 이 msg_type 을 따르고 0건도 정상이다", () => {
    const snapFrame = inbound(buildViOrderListFrame([], true));
    expect(snapFrame.msgType).toBe(MSG.GetVIOrderListResp);
    expect(parseViOrderList(snapFrame.env, true)).toEqual({ snap: true, items: [] });

    const pushFrame = inbound(buildViOrderListFrame([], false));
    expect(pushFrame.msgType).toBe(MSG.VIOrderListPush);
    expect(parseViOrderList(pushFrame.env, false)).toEqual({ snap: false, items: [] });
  });

  it("⑨ 알 수 없는 state 는 그 항목만 빠지고 나머지 항목은 살아남는다", () => {
    const r = parseViOrderList(
      inbound(
        buildViOrderListFrame([
          { orderNo: "AAA", state: "Zzz" },
          { orderNo: "BBB", state: "Accepted" },
        ]),
      ).env,
      true,
    );

    expect(r!.items).toHaveLength(1);
    expect(r!.items[0]!.orderNo).toBe("BBB");
    expect(skippedStrategyItemCount()).toBe(1);
    // 프레임은 살린다 — 한 행 때문에 목록 전체를 버리지 않는다 (T-16-06).
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("⑩ envelope.ts 는 위치 인자 생성 함수를 쓰지 않는다 (Pitfall 1 회귀 방지)", () => {
    // deprecated 8슬롯 때문에 인자가 한 칸 밀려도 타입이 맞아 컴파일된다 — 그래서 소스를
    // 직접 읽어 0건을 단언한다. 타입 시스템이 잡아 주지 못하는 유일한 방어선이다 (T-16-05).
    const source = readFileSync(new URL("../envelope.ts", import.meta.url), "utf8");

    expect(source.match(/create(SetLimitChaser|SetVITrigger)\(/g)).toBeNull();
  });

  it("⑪ toOrderOrigin — 빈 값·미지의 값은 manual 이다 (지어내지 않는다)", () => {
    expect(toOrderOrigin("LimitChaser")).toBe("limit_chaser");
    expect(toOrderOrigin("VITrigger")).toBe("vi");
    expect(toOrderOrigin("Manual")).toBe("manual");
    // 구 서버는 빈 값을 보낸다 — 오류가 아니라 정상 입력이다.
    expect(toOrderOrigin("")).toBe("manual");
    expect(toOrderOrigin("Zzz")).toBe("manual");

    // 51 통보는 원문과 정규화본을 함께 싣는다(감사 로그 원문 · DB CHECK 통과값).
    const resp = parseOrderResp(inbound(buildOrderRespFrame({ origin: "VITrigger" })).env);
    expect(resp).toMatchObject({ origin: "VITrigger", originKind: "vi" });
  });

  it("⑫ 64 목록 — 0건은 빈 배열이고 원소는 60 에코와 같은 값으로 나온다", () => {
    // `null` 로 뭉개면 웹이 "아직 안 왔다"와 "없다"를 구분할 수 없다.
    expect(parseLimitChaserList(inbound(buildLimitChaserListRespFrame([])).env)).toEqual([]);

    const items = parseLimitChaserList(
      inbound(
        buildLimitChaserListRespFrame([
          { isin: SAMPLE_ISIN, exchange: "KRX" },
          { isin: "KR7000660001", exchange: "NXT", market: "Q", crud: "D" },
        ]),
      ).env,
    );

    expect(items).toHaveLength(2);
    expect(items![0]!.key).toBe(strategyKey(SAMPLE_ISIN, SAMPLE_ACCOUNT_NO, "KRX"));
    expect(items![1]!).toMatchObject({
      market: "Q",
      crud: "D",
      exchange: "NXT",
      key: strategyKey("KR7000660001", SAMPLE_ACCOUNT_NO, "NXT"),
    });
  });

  it("⑬ 64 목록 — 깨진 항목만 빠지고 상한을 넘는 벡터는 잘린다 (T-16-06)", () => {
    const partial = parseLimitChaserList(
      inbound(buildLimitChaserListRespFrame([{ isin: "005930" }, { isin: SAMPLE_ISIN }])).env,
    );
    expect(partial).toHaveLength(1);
    expect(partial![0]!.isin).toBe(SAMPLE_ISIN);
    expect(skippedStrategyItemCount()).toBe(1);
    expect(droppedEnvelopeCount()).toBe(0);

    const many = Array.from({ length: MAX_LIMIT_CHASER_COUNT + 5 }, () => ({}));
    expect(parseLimitChaserList(inbound(buildLimitChaserListRespFrame(many)).env)).toHaveLength(
      MAX_LIMIT_CHASER_COUNT,
    );
  });

  it("⑭ 56 통보 — 필드가 그대로 흐르고 market 은 단일문자에서 정규화된다", () => {
    const notice = parseViOrderNotice(
      inbound(buildViOrderNoticeFrame({ market: "Q", viEndTime: "093215000" })).env,
    );

    expect(notice).toMatchObject({
      t: "vi.notice",
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      triggerPrice: 87_500,
      basePrice: 70_000,
      changeRate: 25,
      orderPrice: 91_000,
      orderQty: 51,
      market: "Q",
      orderSeq: 1,
      viEndTime: "093215000",
    });
    // 종목명은 게이트웨이가 주는 값이 아니다 — Hub 가 SymbolMap 으로 붙인다.
    expect(notice!.name).toBeUndefined();
  });

  it("⑮ 65 집계 — 0건도 정상 응답이다 (무응답 금지)", () => {
    expect(parseDisableStrategiesResp(inbound(buildDisableStrategiesRespFrame()).env)).toEqual({
      count: 0,
      viDisabled: false,
    });
    expect(
      parseDisableStrategiesResp(
        inbound(buildDisableStrategiesRespFrame({ disabledCount: 3, viDisabled: true })).env,
      ),
    ).toEqual({ count: 3, viDisabled: true });
  });

  it("⑯ 슬롯이 비면 null + 드롭 카운터 — 조용히 통과하지 않는다 (T-16-05)", () => {
    expect(parseLimitChaserEcho(inbound(buildBareEnvelope(MSG.SetLimitChaserResp)).env)).toBeNull();
    expect(
      parseLimitChaserList(inbound(buildBareEnvelope(MSG.GetLimitChaserListResp)).env),
    ).toBeNull();
    expect(
      parseViOrderList(inbound(buildBareEnvelope(MSG.GetVIOrderListResp)).env, true),
    ).toBeNull();
    expect(parseViOrderNotice(inbound(buildBareEnvelope(MSG.VIOrderNotice)).env)).toBeNull();
    expect(
      parseDisableStrategiesResp(inbound(buildBareEnvelope(MSG.DisableStrategiesResp)).env),
    ).toBeNull();

    expect(droppedEnvelopeCount()).toBe(5);
    // 61 만 예외다 — 빈 슬롯이 「미등록」이라는 정상 응답이기 때문이다 (케이스 ⑥).
  });

  it("⑰ 수신 단일문자 변환은 첫 글자만 본다 (Pitfall 4)", () => {
    expect(fromWireMarket("Q")).toBe("Q");
    // ⚠ 첫 글자가 'K' 라 KOSPI 로 읽힌다 — 웹앱에 리터럴을 흩뿌리면 이 함정을 밟는다.
    expect(fromWireMarket("KOSDAQ")).toBe("K");
    expect(fromWireMarket("")).toBe("K");

    expect(fromWireCrud("Delete")).toBe("D");
    expect(fromWireCrud("")).toBe("C");
  });
});

describe("관찰자 두 스트림 — 80 전략 이벤트 · 79/5 전략 커서 (Phase 25-01)", () => {
  /** 프레임 바이트 → Envelope (화이트리스트 통과 확인 포함). */
  function envOf(bytes: Uint8Array): Envelope {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    if (parsed === null) throw new Error("화이트리스트 드롭");
    return parsed.env;
  }

  it("80 주문 0건 · 전략 BuyOrder 1건 → records [] · strategyEvents[0] 가 입력 43필드와 같다 · 64비트는 number", () => {
    const batch = parseJournalBatch(
      envOf(buildJournalBatchFrame({ records: [], strategyEvents: [{ seq: 1 }], strategyHeadSeq: 1, strategyCaughtUp: true })),
    );
    expect(batch).not.toBeNull();
    expect(batch?.records).toEqual([]);
    expect(batch?.strategyEvents).toEqual([fakeStrategyEventRecord({ seq: 1 })]);
    expect(Object.keys(batch?.strategyEvents[0] ?? {})).toHaveLength(43);
    expect(typeof batch?.strategyEvents[0]?.gwTimeMs).toBe("number");
    expect(typeof batch?.strategyEvents[0]?.cumVolume).toBe("number");
    expect(batch?.strategyEvents[0]?.snapQty).toEqual([]);
    expect(batch?.strategyHeadSeq).toBe(1);
    expect(batch?.strategyCaughtUp).toBe(true);
  });

  it("상한가진입 스냅 벡터(즉시 · 1초 · 3초)와 v0.1 밖 enum 값(cancel 9 · metric 7 · kind 99)을 원문 그대로 옮긴다", () => {
    const input = {
      seq: 5,
      kind: 99,
      group: 0,
      condMetric: 7,
      cancelReason: 9,
      accountNo: "",
      orderNo: "",
      dmaUserId: "",
      snapQty: [30_000, 55_000, 72_000],
      snapCum: [900_000, 903_000, 908_000],
      errorVolume: -12_000,
    };
    const batch = parseJournalBatch(envOf(buildJournalBatchFrame({ strategyEvents: [input] })));
    expect(batch?.strategyEvents).toEqual([fakeStrategyEventRecord(input)]);
  });

  it("OrderGroup 말미 추가 7 수동 · 8 VI 를 원문 그대로 옮긴다 (quick-260930-e73)", () => {
    // 수동 매수 주문 — 조건 필드가 빈 값(cond_metric 0 · ev_kind 0 · reason_code "")으로 온다.
    const manual = { seq: 21, kind: 3, group: 7, condMetric: 0, evKind: 0, reasonCode: "", orderNo: "12451" };
    // VI 자동주문 첫 체결
    const vi = { seq: 22, kind: 5, group: 8, orderNo: "12452" };
    const batch = parseJournalBatch(envOf(buildJournalBatchFrame({ strategyEvents: [manual, vi] })));
    expect(batch?.strategyEvents).toEqual([fakeStrategyEventRecord(manual), fakeStrategyEventRecord(vi)]);
    expect(batch?.strategyEvents.map((e) => e.group)).toEqual([7, 8]);
  });

  it("구 게이트웨이(전략 필드 부재) → strategyEvents [] · head 0 · caughtUp false", () => {
    const batch = parseJournalBatch(envOf(buildJournalBatchFrame({ records: [{ seq: 3 }], omitStrategy: true })));
    expect(batch?.records).toHaveLength(1);
    expect(batch?.strategyEvents).toEqual([]);
    expect(batch?.strategyHeadSeq).toBe(0);
    expect(batch?.strategyCaughtUp).toBe(false);
  });

  it(`전략 이벤트 상한(${MAX_STRATEGY_BATCH_EVENTS}) 초과 → 앞 N건만 · strategyCaughtUp 거짓 (T-25-04)`, () => {
    const events = Array.from({ length: MAX_STRATEGY_BATCH_EVENTS + 1 }, (_, i) => ({ seq: i + 1 }));
    const batch = parseJournalBatch(envOf(buildJournalBatchFrame({ strategyEvents: events, strategyCaughtUp: true })));
    expect(batch?.strategyEvents).toHaveLength(MAX_STRATEGY_BATCH_EVENTS);
    expect(batch?.strategyCaughtUp).toBe(false);
  });

  it("형식 이상 계좌 · ISIN 은 경고 1줄만 · 레코드를 버리지 않는다 (T-19-34 동형) · 시세 이벤트의 빈 계좌는 이상이 아니다", () => {
    const longAccount = "9".repeat(MAX_ACCOUNT_NO_LEN + 1);
    const batch = parseJournalBatch(
      envOf(
        buildJournalBatchFrame({
          strategyEvents: [
            { seq: 1, kind: 1, group: 0, accountNo: "", orderNo: "", dmaUserId: "" },
            { seq: 2, accountNo: longAccount, isin: "BAD" },
          ],
        }),
      ),
    );
    expect(batch?.strategyEvents.map((e) => e.seq)).toEqual([1, 2]);
    const calls = warn.mock.calls.filter((c: unknown[]) => String(c[1]).includes("전략 이벤트 형식 이상"));
    expect(calls).toHaveLength(1);
    const [fields] = calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({ badAccount: 1, badIsin: 1, sampleSeq: 2 });
    expect(JSON.stringify(fields)).not.toContain(longAccount);
  });

  it.each([
    ["seq 0", { seq: 0 }, "seq"],
    ["trade_date 빈 문자열", { seq: 3, tradeDate: "" }, "trade_date"],
    ["trade_date 형식 밖(YYYYMMDD)", { seq: 3, tradeDate: "20260929" }, "trade_date"],
    ["trade_date 달력 밖(2월 30일)", { seq: 3, tradeDate: "2026-02-30" }, "trade_date"],
  ] as const)(
    "전략 이벤트 필수 키 계약 위반(%s) → 그 앞까지만 올리고 첫 위반을 표시 · strategyCaughtUp 거짓 · 주문 레코드는 그대로 (WR-01)",
    (_label, bad, field) => {
      const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
      const batch = parseJournalBatch(
        envOf(
          buildJournalBatchFrame({
            records: [{ seq: 7 }],
            strategyEvents: [{ seq: 1 }, { seq: 2 }, bad, { seq: 4 }],
            strategyCaughtUp: true,
          }),
        ),
      );
      expect(batch).not.toBeNull();
      expect(batch?.records.map((r) => r.seq)).toEqual([7]);
      expect(batch?.strategyEvents.map((e) => e.seq)).toEqual([1, 2]);
      expect(batch?.strategyContractViolation).toEqual({ seq: bad.seq, field });
      expect(batch?.strategyCaughtUp).toBe(false);
      const calls = error.mock.calls.filter((c: unknown[]) => String(c[1]).includes("필수 키 계약 위반"));
      expect(calls).toHaveLength(1);
      expect(JSON.stringify(calls[0]?.[0])).not.toContain(SAMPLE_ACCOUNT_NO);
    },
  );

  it("계약을 지킨 전략 이벤트만 오면 위반 표시는 null (WR-01)", () => {
    const batch = parseJournalBatch(envOf(buildJournalBatchFrame({ strategyEvents: [{ seq: 1 }, { seq: 2 }] })));
    expect(batch?.strategyContractViolation).toBeNull();
    expect(batch?.strategyCaughtUp).toBe(true);
  });

  it("79 로그인 응답의 전략 head · oldest · resync 를 읽는다 · 없으면 0 / 0 / false", () => {
    const withStrategy = parseObserverLoginResp(
      envOf(buildObserverLoginRespFrame({ epoch: "ep-25", strategyHeadSeq: 9, strategyOldestSeq: 2, strategyResync: true })),
    );
    expect(withStrategy).toMatchObject({ epoch: "ep-25", strategyHeadSeq: 9, strategyOldestSeq: 2, strategyResync: true });
    const legacy = parseObserverLoginResp(envOf(buildObserverLoginRespFrame({ epoch: "ep-25" })));
    expect(legacy).toMatchObject({ strategyHeadSeq: 0, strategyOldestSeq: 0, strategyResync: false });
  });

  it("5 로그인 요청은 strategySinceSeq 를 싣는다 · 음수 · 비정수 · 2^53 이상은 RangeError(비밀 미포함)", () => {
    const bytes = buildObserverLoginReq({ secret: "s", sinceSeq: 3, epoch: "ep-25", client: "c", strategySinceSeq: 7 });
    const req = readObserverLoginRequest(MSG.ObserverLoginReq, Buffer.from(bytes));
    expect(req).toEqual({ secret: "s", sinceSeq: 3, epoch: "ep-25", client: "c", strategySinceSeq: 7, role: 0 });
    const SECRET = "observer-secret-DO-NOT-LOG-25-01";
    for (const strategySinceSeq of [-1, 1.5, 2 ** 53, Number.NaN]) {
      let caught: unknown = null;
      try {
        buildObserverLoginReq({ secret: SECRET, sinceSeq: 0, epoch: "", client: "c", strategySinceSeq });
      } catch (err) {
        caught = err;
      }
      expect(caught, `strategySinceSeq ${strategySinceSeq}`).toBeInstanceOf(RangeError);
      expect(String((caught as Error).message)).not.toContain(SECRET);
    }
  });
});

describe("관찰자 로그인 role (Phase 26 · ed2e0240)", () => {
  /** 프레임 바이트 → Envelope. 79 가 수신 화이트리스트를 통과해야 한다. */
  function envOf(bytes: Uint8Array): Envelope {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    if (parsed === null) throw new Error("화이트리스트 드롭");
    return parsed.env;
  }

  it("5 로그인 요청은 role 을 싣는다 — 1 은 quote · 생략하면 0(journal)", () => {
    const base = { secret: "s", sinceSeq: 0, epoch: "", client: "c", strategySinceSeq: 0 };
    const quote = readObserverLoginRequest(MSG.ObserverLoginReq, Buffer.from(buildObserverLoginReq({ ...base, role: 1 })));
    expect(quote?.role).toBe(1);
    const journal = readObserverLoginRequest(MSG.ObserverLoginReq, Buffer.from(buildObserverLoginReq(base)));
    expect(journal?.role).toBe(0);
  });

  it("role 0 · 1 밖의 값은 RangeError(비밀 미포함)", () => {
    const SECRET = "observer-secret-DO-NOT-LOG-26-01";
    for (const role of [2, -1, 1.5, Number.NaN]) {
      let caught: unknown = null;
      try {
        buildObserverLoginReq({
          secret: SECRET,
          sinceSeq: 0,
          epoch: "",
          client: "c",
          strategySinceSeq: 0,
          // 타입은 0 | 1 만 받는다 — 런타임 가드를 부르려고 일부러 넓힌다.
          role: role as 0 | 1,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught, `role ${role}`).toBeInstanceOf(RangeError);
      expect(String((caught as Error).message)).not.toContain(SECRET);
    }
  });

  it("79 로그인 응답의 role 에코를 읽는다 · 없으면 0", () => {
    const quote = parseObserverLoginResp(envOf(buildObserverLoginRespFrame({ role: 1 })));
    expect(quote?.role).toBe(1);
    const legacy = parseObserverLoginResp(envOf(buildObserverLoginRespFrame()));
    expect(legacy?.role).toBe(0);
  });
});

describe("잔량진행률 83 QueueProgress 파서 (Phase 25-06)", () => {
  /** 프레임 바이트 → Envelope. 83 이 수신 화이트리스트를 통과해야 한다(PC-12). */
  function envOf(bytes: Uint8Array): Envelope {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    if (parsed === null) throw new Error("화이트리스트 드롭");
    return parsed.env;
  }

  it("항목 1건을 같은 값으로 읽는다 — dmaUserId 는 relay 내부까지 남고(hub 가 지운다) 64비트는 number", () => {
    const frame = parseQueueProgress(
      envOf(
        buildQueueProgressFrame({
          isin: SAMPLE_ISIN,
          exchange: "KRX",
          items: [
            {
              accountNo: SAMPLE_ACCOUNT_NO,
              dmaUserId: "dma-1",
              orderNo: "12453",
              group: 3,
              expectedCum: 1_100_000,
              currentCum: 1_088_000,
              remainingVolume: 12_000,
              progressBp: 8800,
            },
          ],
        }),
      ),
    );
    expect(frame).toEqual({
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      items: [
        {
          accountNo: SAMPLE_ACCOUNT_NO,
          dmaUserId: "dma-1",
          orderNo: "12453",
          exchange: "KRX",
          isin: SAMPLE_ISIN,
          group: 3,
          expectedCum: 1_100_000,
          currentCum: 1_088_000,
          remainingVolume: 12_000,
          progressBp: 8800,
          // 옵션 없이 만든 프레임(= 옛 서버 · 슬롯 부재) → 생성 기본 false.
          firstFilled: false,
        },
      ],
    });
    expect(typeof frame?.items[0]?.remainingVolume).toBe("number");
    expect(warn).not.toHaveBeenCalled();
  });

  it("항목 group 7 · 8 을 원문 그대로 읽는다 (quick-260930-e73 — 수동 · VI 대기 매수)", () => {
    const frame = parseQueueProgress(
      envOf(
        buildQueueProgressFrame({
          items: [
            { orderNo: "31", group: 7 },
            { orderNo: "32", group: 8 },
          ],
        }),
      ),
    );
    expect(frame?.items.map((it) => [it.orderNo, it.group])).toEqual([
      ["31", 7],
      ["32", 8],
    ]);
  });

  it("first_filled true 항목 → firstFilled true · 네 값은 서버가 고정한 원문 그대로 (quick-260930-fi4)", () => {
    const frame = parseQueueProgress(
      envOf(
        buildQueueProgressFrame({
          items: [
            {
              orderNo: "41",
              group: 3,
              expectedCum: 1_100_000,
              currentCum: 1_061_500,
              remainingVolume: 4000,
              progressBp: 9650,
              firstFilled: true,
            },
            { orderNo: "42", group: 3 },
          ],
        }),
      ),
    );
    expect(frame?.items[0]).toMatchObject({
      orderNo: "41",
      expectedCum: 1_100_000,
      currentCum: 1_061_500,
      remainingVolume: 4000,
      progressBp: 9650,
      firstFilled: true,
    });
    expect(frame?.items[1]?.firstFilled).toBe(false);
  });

  it("빈 항목 벡터는 items [] 다(null 아님) — 「그 종목 · 거래소 대기 주문 전부 사라짐」(G1 ⓕ)", () => {
    const frame = parseQueueProgress(envOf(buildQueueProgressFrame({ exchange: "NXT", items: [] })));
    expect(frame).toEqual({ isin: SAMPLE_ISIN, exchange: "NXT", items: [] });
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("계좌 빈 항목은 건너뛰고 프레임당 경고 1줄(건수 · 마스킹)만 남긴다 — 나머지 항목은 살린다", () => {
    const frame = parseQueueProgress(
      envOf(
        buildQueueProgressFrame({
          items: [{ accountNo: "", orderNo: "1" }, { orderNo: "2" }, { accountNo: "", orderNo: "3" }],
        }),
      ),
    );
    expect(frame?.items.map((it) => it.orderNo)).toEqual(["2"]);
    const calls = warn.mock.calls.filter((c: unknown[]) => String(c[1]).includes("진행률 항목"));
    expect(calls).toHaveLength(1);
    const [fields] = calls[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({ skipped: 2 });
    expect(droppedEnvelopeCount()).toBe(0);
  });

  it("거래소가 KRX/NXT 가 아니면 null · 드롭 카운터 +1", () => {
    expect(parseQueueProgress(envOf(buildQueueProgressFrame({ exchange: "XXX" })))).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("bad-exchange");
  });

  it("맨 envelope 83 은 slot-null 로 null", () => {
    expect(parseQueueProgress(envOf(buildBareEnvelope(83)))).toBeNull();
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("slot-null");
  });

  it(`항목 상한(${MAX_QUEUE_PROGRESS_ITEMS}) 초과는 앞 N건만`, () => {
    const items = Array.from({ length: MAX_QUEUE_PROGRESS_ITEMS + 1 }, (_, i) => ({ orderNo: String(i + 1) }));
    const frame = parseQueueProgress(envOf(buildQueueProgressFrame({ items })));
    expect(frame?.items).toHaveLength(MAX_QUEUE_PROGRESS_ITEMS);
  });
});

describe("Phase 27 자동매도 와이어 — schema 1~4 파생 · 에코 슬롯 · readLimitChaser 8필드 · 84 파서", () => {
  const AUTO_REQ_VT = [140, 142, 144, 146] as const;
  const AUTO_ECHO_VT = [148, 150, 152, 154] as const;
  const BURST_VT = 138;
  const AUTO_SELL_REQ = {
    autoSellEnabled: true,
    autoSellStartCond: 2,
    autoSellRatioPct: 10,
    autoSellMethod: 3,
  } as const;

  function readLc(cfg: LcBuildInput): SetLimitChaser {
    const env = readBack(buildSetLimitChaserReq(cfg));
    const t = env.setLimitChaser(new SetLimitChaser());
    expect(t).not.toBeNull();
    return t!;
  }

  function inbound(bytes: Uint8Array) {
    const parsed = tryParseEnvelope(Buffer.from(bytes));
    expect(parsed).not.toBeNull();
    return parsed!;
  }

  it("lcBuy3SchemaOf 표 — 자동 없음 1 · 자동만 2 · 자동+버스트 3 · 자동+버스트+4필드 4 · 4필드 하나 빠짐 3 · 4필드만(자동 없음) 1", () => {
    expect(LC_AUTO_SELL_BUY3_SCHEMA).toBe(4);
    expect(lcBuy3SchemaOf({})).toBe(1);
    expect(lcBuy3SchemaOf({ postBuyAuto: false })).toBe(2);
    expect(lcBuy3SchemaOf({ postBuyAuto: false, extraBuyBurstRelease: false })).toBe(3);
    expect(lcBuy3SchemaOf({ postBuyAuto: false, extraBuyBurstRelease: false, ...AUTO_SELL_REQ })).toBe(4);
    // 값 무관 — 존재로만. 꺼진 스위치 · 0 도 4.
    expect(
      lcBuy3SchemaOf({
        postBuyAuto: false,
        extraBuyBurstRelease: false,
        autoSellEnabled: false,
        autoSellStartCond: 0,
        autoSellRatioPct: 0,
        autoSellMethod: 0,
      }),
    ).toBe(4);
    for (const missing of Object.keys(AUTO_SELL_REQ) as (keyof typeof AUTO_SELL_REQ)[]) {
      const partial: Partial<typeof AUTO_SELL_REQ> = { ...AUTO_SELL_REQ };
      delete partial[missing];
      expect(lcBuy3SchemaOf({ postBuyAuto: true, extraBuyBurstRelease: true, ...partial }), missing).toBe(3);
    }
    expect(lcBuy3SchemaOf({ ...AUTO_SELL_REQ })).toBe(1);
  });

  it("4필드만 있고 자동 없음 → schema 1 · 자동매도 슬롯 0 · warn 1회 · throw 없음 (P-1 단조성)", () => {
    warn.mockClear();
    const t = readLc(lcInput({ ...AUTO_SELL_REQ }));
    expect(t.buy3Schema()).toBe(LC_FIXED_BUY3_SCHEMA);
    expect(presentSlots(t, AUTO_REQ_VT)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    // 값 · 계좌를 로그에 싣지 않는다 — 결손의 모양만.
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(fields).sort()).toEqual(["buy3Schema", "isin"]);
  });

  it("schema 4 요청 — 4슬롯 140~146 · 값 그대로 · 버스트 해제(138) 동반 · 에코 슬롯 148~154 없음", () => {
    warn.mockClear();
    const t = readLc(lcInput({ postBuyAuto: false, extraBuyBurstRelease: true, ...AUTO_SELL_REQ }));
    expect(t.buy3Schema()).toBe(4);
    expect(presentSlots(t, AUTO_REQ_VT)).toEqual([...AUTO_REQ_VT]);
    expect([t.autoSellEnabled(), t.autoSellStartCond(), t.autoSellRatioPct(), t.autoSellMethod()]).toEqual([
      true, 2, 10, 3,
    ]);
    // `>=` — schema 4 에서도 ☐버스트 시 해제가 실린다(RESEARCH Pitfall 1).
    expect(presentSlots(t, [BURST_VT])).toEqual([BURST_VT]);
    expect(t.extraBuyBurstRelease()).toBe(true);
    expect(presentSlots(t, AUTO_ECHO_VT)).toEqual([]);
    expect(warn.mock.calls.map((c: unknown[]) => c[1])).toEqual([]);
  });

  it("schema ≤ 3 요청에는 자동매도 4슬롯이 없다 · 어떤 요청에도 에코 슬롯 148~154 가 없다", () => {
    const cases: Partial<LcBuildInput>[] = [
      {},
      { postBuyAuto: true },
      { postBuyAuto: true, extraBuyBurstRelease: true },
      { postBuyAuto: true, extraBuyBurstRelease: true, autoSellEnabled: true, autoSellRatioPct: 10 },
    ];
    for (const over of cases) {
      const t = readLc(lcInput(over));
      expect(t.buy3Schema()).toBeLessThanOrEqual(3);
      expect(presentSlots(t, AUTO_REQ_VT)).toEqual([]);
      expect(presentSlots(t, AUTO_ECHO_VT)).toEqual([]);
    }
    // 브라우저가 에코 전용 키를 초과 속성으로 끼워도 조립기는 add 하지 않는다.
    const forged = {
      ...lcInput({ postBuyAuto: true, extraBuyBurstRelease: true, ...AUTO_SELL_REQ }),
      autoSellState: 3,
      autoSellSoldQty: 6000,
      autoSellBasis: 1,
      autoSellBasisPrice: 13_000,
    } as LcBuildInput;
    expect(presentSlots(readLc(forged), AUTO_ECHO_VT)).toEqual([]);
  });

  it("schema 4 범위 — 시작조건 · 비율 · 방법은 ubyte 표현 범위 밖이면 OrderBuildError", () => {
    const base = { postBuyAuto: true, extraBuyBurstRelease: true, ...AUTO_SELL_REQ };
    expect(() => buildSetLimitChaserReq(lcInput({ ...base, autoSellRatioPct: 256 }))).toThrow(/ubyte/);
    expect(() => buildSetLimitChaserReq(lcInput({ ...base, autoSellStartCond: -1 }))).toThrow(/ubyte/);
  });

  it("readLimitChaser — 8슬롯 부재 에코는 false/0 · 값이 있으면 그대로 (60 · 64 공용)", () => {
    const absent = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({})).env)!;
    expect({
      autoSellEnabled: absent.autoSellEnabled,
      autoSellStartCond: absent.autoSellStartCond,
      autoSellRatioPct: absent.autoSellRatioPct,
      autoSellMethod: absent.autoSellMethod,
      autoSellState: absent.autoSellState,
      autoSellSoldQty: absent.autoSellSoldQty,
      autoSellBasis: absent.autoSellBasis,
      autoSellBasisPrice: absent.autoSellBasisPrice,
    }).toEqual({
      autoSellEnabled: false,
      autoSellStartCond: 0,
      autoSellRatioPct: 0,
      autoSellMethod: 0,
      autoSellState: 0,
      autoSellSoldQty: 0,
      autoSellBasis: 0,
      autoSellBasisPrice: 0,
    });
    const echo = {
      ...AUTO_SELL_REQ,
      autoSellState: 3,
      autoSellSoldQty: 6000,
      autoSellBasis: 1,
      autoSellBasisPrice: 13_000,
    };
    const single = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame(echo)).env);
    const list = parseLimitChaserList(inbound(buildLimitChaserListRespFrame([echo])).env);
    expect(single).toMatchObject(echo);
    expect(list![0]).toMatchObject(echo);
  });

  it("parseUserSettings — 11값 + present 왕복", () => {
    const parsed = inbound(buildUserSettingsFrame({ present: true, autoSellPeriodSec: 5 }));
    expect(parsed.msgType).toBe(MSG.UserSettingsResp);
    expect(parseUserSettings(parsed.env)).toEqual({
      t: "user.settings",
      present: true,
      preBuyAmount: 4000,
      addBuyAmount: 4000,
      postBuyAmount: 4000,
      postBuyMaxCount: 3,
      postBuyFloorQty: 100_000,
      postBuyReboundPct: 30,
      sellQtyTrackRatio: 55,
      autoSellPeriodSec: 5,
      auctionSellRatioPct: 20,
      autoSellRatioDefaultPct: 10,
      autoSellMethodDefault: 3,
    });
    // present 기본 false — 서버 내장 기본값.
    expect(parseUserSettings(inbound(buildUserSettingsFrame()).env)!.present).toBe(false);
  });

  it("parseUserSettings — 슬롯 없는 84 는 null + dropField(slot-null)", () => {
    const parsed = inbound(buildBareEnvelope(MSG.UserSettingsResp));
    expect(droppedEnvelopeCount()).toBe(0);
    expect(parseUserSettings(parsed.env)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls.at(-1) as [Record<string, unknown>];
    expect(fields.reason).toBe("slot-null");
  });
});

/**
 * Phase 27 (27-02) — 요청 조립기 41 · 42 · 43 (gh-trade `limit-chaser.md` §9-3).
 *
 * 못박는 것: ① 41 의 네 칸이 슬롯 86 에 그대로 · 가드 3종(ISIN · 계좌 · 거래소) · action 1/2 밖은 송신 전 거부
 * ② 42 의 11값이 슬롯 88 에 그대로 · `present`(84 전용)는 **싣지 않는다** ③ 43 은 본문 없는 Envelope
 * ④ 세 요청 모두 수신 화이트리스트를 통과하지 못한다(반사 프레임 방어 — 42 는 84 와 슬롯을 공유해도 번호로 갈린다)
 * ⑤ 범위 정본 `USER_SETTINGS_RANGES` 11키 = `RelayUserSettingsValues` 키 · 값 = fbs 주석.
 */
describe("Phase 27 요청 조립기 41 · 42 · 43", () => {
  const SETTINGS: RelayUserSettingsValues = {
    preBuyAmount: 5000,
    addBuyAmount: 3000,
    postBuyAmount: 999_999_999,
    postBuyMaxCount: 255,
    postBuyFloorQty: 99_999_999,
    postBuyReboundPct: 0,
    sellQtyTrackRatio: 90,
    autoSellPeriodSec: 60,
    auctionSellRatioPct: 50,
    autoSellRatioDefaultPct: 1,
    autoSellMethodDefault: 2,
  };
  /** `UserSettings.present` 의 vtable 오프셋(fbs 12번째 필드 — 4 + 2×11). */
  const PRESENT_VT = 26;

  function readAutoSell(bytes: Uint8Array): AutoSellCommandReq {
    const env = readBack(bytes);
    expect(env.msgType()).toBe(MSG.AutoSellCommandReq);
    const t = env.autoSellCommandReq(new AutoSellCommandReq());
    expect(t).not.toBeNull();
    return t!;
  }

  it("41 바로시작 — msgType 41 · 슬롯 86 에 isin/계좌/거래소/action 1 이 그대로", () => {
    const bytes = buildAutoSellCommandReq({
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      exchange: "KRX",
      action: 1,
    });
    const env = readBack(bytes);
    // 다른 본문 슬롯은 비어 있다 — 41 은 SetLimitChaser · UserSettings 를 싣지 않는다.
    expect(env.setLimitChaser()).toBeNull();
    expect(env.userSettings()).toBeNull();
    expect(env.getStrategyReq()).toBeNull();
    const t = readAutoSell(bytes);
    expect({ isin: t.isin(), accountNo: t.accountNo(), exchange: t.exchange(), action: t.action() }).toEqual({
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      exchange: "KRX",
      action: 1,
    });
  });

  it("41 중지 — action 2 · NXT 도 왕복", () => {
    const t = readAutoSell(
      buildAutoSellCommandReq({ isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "NXT", action: 2 }),
    );
    expect(t.action()).toBe(2);
    expect(t.exchange()).toBe("NXT");
  });

  it("41 가드 — ISIN 11자 BAD_ISIN · 빈 계좌 BAD_ACCOUNT_NO · 거래소 밖 BAD_EXCHANGE · 문구에 계좌번호 없음", () => {
    const base = { isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX" as RelayExchange, action: 1 as const };
    const cases: [Parameters<typeof buildAutoSellCommandReq>[0], string][] = [
      [{ ...base, isin: SAMPLE_ISIN.slice(0, 11) }, "BAD_ISIN"],
      [{ ...base, accountNo: "" }, "BAD_ACCOUNT_NO"],
      [{ ...base, exchange: "KOSDAQ" as RelayExchange }, "BAD_EXCHANGE"],
    ];
    for (const [req, code] of cases) {
      let caught: unknown;
      try {
        buildAutoSellCommandReq(req);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(OrderBuildError);
      expect((caught as OrderBuildError).code).toBe(code);
      expect((caught as OrderBuildError).message).not.toContain(SAMPLE_ACCOUNT_NO);
    }
  });

  it("41 action 1 · 2 밖은 RangeError — 서버 「action 불명」 까지 가지 않는다", () => {
    for (const action of [0, 3, 1.5] as const) {
      expect(() =>
        buildAutoSellCommandReq({
          isin: SAMPLE_ISIN,
          accountNo: SAMPLE_ACCOUNT_NO,
          exchange: "KRX",
          action: action as unknown as 1,
        }),
      ).toThrow(RangeError);
    }
  });

  it("42 — msgType 42 · 슬롯 88 의 11값이 그대로(금액 만원 원값) · present 슬롯 미적재", () => {
    const env = readBack(buildSetUserSettingsReq(SETTINGS));
    expect(env.msgType()).toBe(MSG.SetUserSettingsReq);
    expect(env.autoSellCommandReq()).toBeNull();
    const u = env.userSettings(new UserSettings());
    expect(u).not.toBeNull();
    expect({
      preBuyAmount: u!.preBuyAmount(),
      addBuyAmount: u!.addBuyAmount(),
      postBuyAmount: u!.postBuyAmount(),
      postBuyMaxCount: u!.postBuyMaxCount(),
      postBuyFloorQty: u!.postBuyFloorQty(),
      postBuyReboundPct: u!.postBuyReboundPct(),
      sellQtyTrackRatio: u!.sellQtyTrackRatio(),
      autoSellPeriodSec: u!.autoSellPeriodSec(),
      auctionSellRatioPct: u!.auctionSellRatioPct(),
      autoSellRatioDefaultPct: u!.autoSellRatioDefaultPct(),
      autoSellMethodDefault: u!.autoSellMethodDefault(),
    }).toEqual(SETTINGS);
    // present 는 84 전용 — 서버가 42 에서 읽지 않는다. 슬롯 자체가 없어야 한다(false 적재와 구별).
    expect(u!.bb!.__offset(u!.bb_pos, PRESENT_VT)).toBe(0);
  });

  it("42 — 표현 범위 밖(음수 · 소수 · ubyte 256)은 송신 전 OrderBuildError", () => {
    expect(() => buildSetUserSettingsReq({ ...SETTINGS, preBuyAmount: -1 })).toThrow(OrderBuildError);
    expect(() => buildSetUserSettingsReq({ ...SETTINGS, autoSellPeriodSec: 1.5 })).toThrow(OrderBuildError);
    expect(() => buildSetUserSettingsReq({ ...SETTINGS, postBuyMaxCount: 256 })).toThrow(OrderBuildError);
  });

  it("43 — msgType 43 · 본문 슬롯 없음(24/27/34 선례)", () => {
    const env = readBack(buildGetUserSettingsReq());
    expect(env.msgType()).toBe(MSG.GetUserSettingsReq);
    expect(env.userSettings()).toBeNull();
    expect(env.autoSellCommandReq()).toBeNull();
    expect(env.getStrategyReq()).toBeNull();
  });

  it("41 · 42 · 43 요청은 수신 화이트리스트를 통과하지 못한다 (반사 프레임 방어)", () => {
    for (const bytes of [
      buildAutoSellCommandReq({ isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action: 1 }),
      buildSetUserSettingsReq(SETTINGS),
      buildGetUserSettingsReq(),
    ]) {
      expect(tryParseEnvelope(Buffer.from(bytes))).toBeNull();
    }
    expect(droppedEnvelopeCount()).toBe(3);
  });

  it("USER_SETTINGS_RANGES — 11키 = RelayUserSettingsValues 키 · 값은 fbs 주석 범위 그대로", () => {
    expect(Object.keys(USER_SETTINGS_RANGES).sort()).toEqual(Object.keys(SETTINGS).sort());
    expect(USER_SETTINGS_RANGES).toEqual({
      preBuyAmount: { min: 0, max: 999_999_999 },
      addBuyAmount: { min: 0, max: 999_999_999 },
      postBuyAmount: { min: 0, max: 999_999_999 },
      postBuyMaxCount: { min: 0, max: 255 },
      postBuyFloorQty: { min: 0, max: 99_999_999 },
      postBuyReboundPct: { min: 0, max: 100 },
      sellQtyTrackRatio: { min: 0, max: 90 },
      autoSellPeriodSec: { min: 1, max: 60 },
      auctionSellRatioPct: { min: 1, max: 50 },
      autoSellRatioDefaultPct: { min: 1, max: 50 },
      autoSellMethodDefault: { min: 1, max: 3 },
    });
  });
});
