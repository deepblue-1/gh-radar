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
import type { OrderMarket, RelayExchange, RelayLimitChaserInput } from "@gh-radar/shared";

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
import { MSG, OUT_OF_SCOPE_INBOUND_MSG_TYPES } from "../msg-type.js";
import {
  buildLoginReq,
  buildLivePing,
  buildGetQuoteReq,
  buildSubscribeQuoteReq,
  buildGetTradeTapeReq,
  tryParseEnvelope,
  parseQuoteState,
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
  MAX_STRATEGY_KEY_BYTES,
  parseLimitChaserEcho,
  parseLimitChaserList,
  parseViTrigger,
  parseViOrderList,
  parseViOrderNotice,
  parseDisableStrategiesResp,
  fromWireMarket,
  fromWireCrud,
  fromWireWatchSide,
  toOrderOrigin,
  strategyKey,
  skippedStrategyItemCount,
  MAX_LIMIT_CHASER_COUNT,
  type ViTriggerInput,
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
  SAMPLE_ACCOUNT_NO,
} from "../../../tests/helpers/frames.js";

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

  it("⑤-a4 강등 집합은 **응답 대역 5종뿐**이고 요청 번호는 하나도 없다", () => {
    expect([...OUT_OF_SCOPE_INBOUND_MSG_TYPES].sort((a, b) => a - b)).toEqual([
      57, 68, 70, 74, 75,
    ]);
    for (const n of OUT_OF_SCOPE_INBOUND_MSG_TYPES) expect(n).toBeGreaterThanOrEqual(50);
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
type LcBuildInput = RelayLimitChaserInput & { market: OrderMarket };

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
    buyWatchSide: "0",
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
    ...over,
  };
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
    expect(t.buyWatchSide()).toBe("0");
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
    expect(() =>
      buildSetLimitChaserReq(
        lcInput({ buyWatchSide: "2" as unknown as RelayLimitChaserInput["buyWatchSide"] }),
      ),
    ).toThrow(/감시 기준호가/);
    // uint 를 넘기면 감싸서 전혀 다른 가격이 된다 — 표현 범위에서 막는다.
    expect(() => buildSetLimitChaserReq(lcInput({ buyOrderPrice: -1 }))).toThrow(/uint/);
    expect(() => buildSetLimitChaserReq(lcInput({ buyOrderPrice: 1.5 }))).toThrow(/uint/);
    expect(() => buildSetLimitChaserReq(lcInput({ sweepMinTickCount: 256 }))).toThrow(/ubyte/);
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

  it("① 39필드 왕복 — 요청 33필드가 그대로 돌아오고 S→C 전용 6은 0/false 다", () => {
    const cfg = lcInput();
    // 요청 빌더의 산출물을 에코 파서로 되읽는다. 빌더와 파서가 **같은 슬롯**을 보는지가
    // 이 왕복의 전부다 — 한쪽만 밀려도 값이 어긋나 실패 메시지에 그대로 드러난다.
    const item = parseLimitChaserEcho(readBack(buildSetLimitChaserReq(cfg)));

    expect(item).not.toBeNull();
    expect(item).toMatchObject(cfg);

    // S→C 전용 6 — 빌더가 보내지 않았으므로 **서버가 안 채운 상태**로 0/false 다.
    // 「보내지 않는 것」과 「읽지 않는 것」은 다른 문제라 값이 존재해야 한다 (Pitfall 6).
    expect(item!.sellOrderQty).toBe(0);
    expect(item!.sellQtyTrackBaseline).toBe(0);
    expect(item!.sellEntryLatched).toBe(false);
    expect(item!.cancelQtyTrackBaseline).toBe(0);
    expect(item!.cancelEntryLatched).toBe(false);
    expect(item!.buyEntryLatched).toBe(false);

    // 활성 39 + 파생 key. 필드를 하나라도 빠뜨리면 여기서 잡힌다.
    expect(Object.keys(item!)).toHaveLength(40);
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

  it("⑤-2 취소·매수 진입 확인 래치는 무장과 접지 않은 **원값**으로 올라온다 (D-05)", () => {
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
          buyEntryLatched: true,
          buyEnabled: false,
        }),
      ).env,
    );

    expect(latent!.cancelEntryLatched).toBe(true);
    expect(latent!.buyEntryLatched).toBe(true);
    // 접지 않았음을 대조군으로 못박는다 — 무장 쪽은 서버가 보낸 false 그대로다.
    expect(latent!.cancelQtyEnabled).toBe(false);
    expect(latent!.cancelTradeEnabled).toBe(false);
    expect(latent!.buyEnabled).toBe(false);

    // 부재 필드는 false(잠복)로 읽힌다 — 구 서버/미점등 상태의 안전한 방향이다.
    const absent = parseLimitChaserEcho(inbound(buildSetLimitChaserRespFrame({})).env);
    expect(absent!.cancelEntryLatched).toBe(false);
    expect(absent!.buyEntryLatched).toBe(false);
  });

  it("⑤-3 S→C 전용 래치 2필드는 요청 조립기가 **싣지 않는다** (Pitfall 6 / T-17-03)", () => {
    // 조립기 산출물을 되읽어 래치가 false 로 남는지 본다. 실어 보내면 「값이 왕복한다」는
    // 착각이 생겨 에코-폼 비교가 오염된다.
    const sent = parseLimitChaserEcho(readBack(buildSetLimitChaserReq(lcInput())));
    expect(sent!.cancelEntryLatched).toBe(false);
    expect(sent!.buyEntryLatched).toBe(false);
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

    expect(fromWireWatchSide("1")).toBe("1");
    expect(fromWireWatchSide("")).toBe("0");
  });
});
