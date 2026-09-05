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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import { logger } from "../../logger.js";
import { Envelope } from "../../generated/stock-dma/envelope.js";
import { LoginReq } from "../../generated/stock-dma/login-req.js";
import { LivePing } from "../../generated/stock-dma/live-ping.js";
import { SubscribeQuoteReq } from "../../generated/stock-dma/subscribe-quote-req.js";
import { GetTradeTapeReq } from "../../generated/stock-dma/get-trade-tape-req.js";
import { MSG } from "../msg-type.js";
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
} from "../envelope.js";
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
  SAMPLE_ACCOUNT_NO,
} from "../../../tests/helpers/frames.js";

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetDroppedEnvelopeCount();
  warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
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
  });

  it("⑤ 화이트리스트 밖 msg_type(99)은 드롭 + 카운터 증가", () => {
    const payload = Buffer.from(buildBareEnvelope(99));

    expect(tryParseEnvelope(payload)).toBeNull();
    expect(droppedEnvelopeCount()).toBe(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("unknown-msg-type");
    expect(fields.msgTypeHint).toBe(99);
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
    // 정정("M")은 v1 범위 밖이라 런타임에서도 막는다 (D-21).
    expect(() => toWireOrderType("M" as never)).toThrow(OrderBuildError);
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
});
