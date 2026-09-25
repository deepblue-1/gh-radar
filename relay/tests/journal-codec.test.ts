/**
 * Phase 19 Plan 09 — 관찰자 실 코덱(`createJournalCodec`) tracer.
 *
 * 경로: 게이트웨이가 보낼 프레임 바이트(frames.ts 빌더 — 생성 코드로 조립) → `tryParseEnvelope`
 * (화이트리스트 79·80 통과) → `createJournalCodec().decode` → 19-05 도메인 타입.
 * 요청 방향은 `buildLoginReq` 바이트를 **생성 코드 reader** 로 되읽어 네 값을 대조한다.
 */
import * as flatbuffers from "flatbuffers";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_JOURNAL_BATCH_RECORDS,
  resetDroppedEnvelopeCount,
  skippedAccountEntryCount,
  tryParseEnvelope,
} from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { MsgType } from "../src/generated/stock-dma/msg-type.js";
import { INBOUND_MSG_TYPES, MSG } from "../src/dma/msg-type.js";
import { createJournalCodec } from "../src/journal/codec.js";
import type { ObserverFrame } from "../src/journal/types.js";
import {
  SAMPLE_ACCOUNT_NO,
  buildJournalBatchFrame,
  buildObserverLoginRespFrame,
  buildOrderRespFrame,
  buildRateCrossAlertFrame,
  buildServerMessageFrame,
  fakeJournalRecord,
} from "./helpers/frames.js";

const SECRET = "observer-secret-DO-NOT-LOG-19-09";

/** 프레임 바이트 → 화이트리스트 → 실 코덱. 화이트리스트에서 떨어지면 테스트가 실패한다. */
function decode(payload: Uint8Array): ObserverFrame {
  const parsed = tryParseEnvelope(Buffer.from(payload));
  if (parsed === null) throw new Error("tryParseEnvelope 가 프레임을 떨어뜨렸다");
  return createJournalCodec().decode({ ...parsed, generation: 1 });
}

type LogCall = { level: string; args: unknown[] };

async function spyLogs(): Promise<LogCall[]> {
  const { logger } = await import("../src/logger.js");
  const calls: LogCall[] = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      calls.push({ level, args });
    }) as never);
  }
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  resetDroppedEnvelopeCount();
});

describe("MSG 관찰자 3종 — 생성 enum 과 이름·값 일치 · 화이트리스트", () => {
  it("5 · 79 · 80 이 생성 MsgType 과 같고, 응답 2종만 INBOUND 에 있다", () => {
    expect(MSG.ObserverLoginReq).toBe(MsgType.ObserverLoginReq);
    expect(MSG.ObserverLoginResp).toBe(MsgType.ObserverLoginResp);
    expect(MSG.JournalBatch).toBe(MsgType.JournalBatch);
    expect([MSG.ObserverLoginReq, MSG.ObserverLoginResp, MSG.JournalBatch]).toEqual([5, 79, 80]);
    expect(INBOUND_MSG_TYPES.has(MSG.ObserverLoginResp)).toBe(true);
    expect(INBOUND_MSG_TYPES.has(MSG.JournalBatch)).toBe(true);
    expect(INBOUND_MSG_TYPES.has(MSG.ObserverLoginReq)).toBe(false);
  });
});

describe("실 코덱 tracer — 프레임 바이트 → 화이트리스트 → decode → 도메인", () => {
  it("① 로그인 응답(79) → login · epoch · head/oldest(number) · resync · 계좌 2행", () => {
    const f = decode(
      buildObserverLoginRespFrame({
        success: true,
        broker: "KB",
        epoch: "ep-1",
        headSeq: 12,
        oldestSeq: 1,
        resync: true,
        accounts: [
          { dmaUserId: "dma-a", accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합", priority: 0 },
          { dmaUserId: "dma-b", accountNo: "1234567802", name: "위탁2", priority: 1 },
        ],
      }),
    );
    expect(f).toEqual({
      k: "login",
      result: {
        success: true,
        message: "",
        broker: "KB",
        epoch: "ep-1",
        headSeq: 12,
        oldestSeq: 1,
        resync: true,
        accounts: [
          { dmaUserId: "dma-a", accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합", priority: 0 },
          { dmaUserId: "dma-b", accountNo: "1234567802", name: "위탁2", priority: 1 },
        ],
      },
    });
    if (f.k !== "login") throw new Error("unreachable");
    expect(typeof f.result.headSeq).toBe("number");
    expect(typeof f.result.oldestSeq).toBe("number");
  });

  it("① 거부 응답 → login · success false · 단일 문구 · 빈 계좌", () => {
    const f = decode(buildObserverLoginRespFrame({ success: false, message: "관찰자 인증 실패" }));
    expect(f).toMatchObject({ k: "login", result: { success: false, message: "관찰자 인증 실패", accounts: [] } });
  });

  it("② 저널 배치(80) → batch · 23필드 입력과 같다 · 로컬 거부 레코드가 빠지지 않는다(D-02)", () => {
    const a = { seq: 11, noticeType: "E", execPrice: 70_100, execQty: 3, orgOrderNo: "0000009" };
    const localReject = {
      seq: 12,
      orderNo: "",
      noticeType: "R",
      localReject: true,
      resultCode: -2,
      board: "",
      message: "전송 불확실",
      sideTrusted: false,
      side: "",
    };
    const f = decode(buildJournalBatchFrame({ records: [a, localReject], headSeq: 12, caughtUp: true }));
    expect(f).toEqual({
      k: "batch",
      batch: { records: [fakeJournalRecord(a), fakeJournalRecord(localReject)], headSeq: 12, caughtUp: true },
    });
    if (f.k !== "batch") throw new Error("unreachable");
    expect(f.batch.records[1]).toMatchObject({ orderNo: "", localReject: true });
    expect(Object.keys(f.batch.records[0] ?? {})).toHaveLength(23);
    expect(typeof f.batch.records[0]?.seq).toBe("number");
    expect(typeof f.batch.records[0]?.gwTimeMs).toBe("number");
  });

  it("③ 계좌번호 형식 이상(13자) 레코드 → 버리지 않는다 · warn 1회 · 원문 계좌번호는 로그에 없다", async () => {
    const logs = await spyLogs();
    const bad = "1234567801234"; // 13자
    const f = decode(buildJournalBatchFrame({ records: [{ seq: 1 }, { seq: 2, accountNo: bad }, { seq: 3 }] }));
    if (f.k !== "batch") throw new Error(`batch 가 아니다: ${f.k}`);
    expect(f.batch.records.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(f.batch.records[1]?.accountNo).toBe(bad);
    const warns = logs.filter((c) => c.level === "warn");
    expect(warns).toHaveLength(1);
    expect(JSON.stringify(warns[0]?.args)).toContain("저널 레코드 형식 이상");
    expect(JSON.stringify(logs.map((c) => c.args))).not.toContain(bad);
  });

  it("④ 76 RateCrossAlert · 54 ServerMessage → ignore · 51 OrderResp → unexpected", () => {
    expect(decode(buildRateCrossAlertFrame())).toEqual({ k: "ignore", msgType: 76 });
    expect(decode(buildServerMessageFrame())).toEqual({ k: "ignore", msgType: 54 });
    expect(decode(buildOrderRespFrame())).toEqual({ k: "unexpected", msgType: 51 });
  });

  it("⑤ 계좌 매핑 중 형식 이상 1건 → 그 항목만 건너뛴다 · 나머지 유지 · skipAccount +1", () => {
    const before = skippedAccountEntryCount();
    const f = decode(
      buildObserverLoginRespFrame({
        headSeq: 1,
        accounts: [
          { accountNo: SAMPLE_ACCOUNT_NO },
          { accountNo: "1234567801234" },
          { accountNo: "1234567802", dmaUserId: "dma-b" },
        ],
      }),
    );
    if (f.k !== "login") throw new Error(`login 이 아니다: ${f.k}`);
    expect(f.result.accounts.map((a) => a.accountNo)).toEqual([SAMPLE_ACCOUNT_NO, "1234567802"]);
    expect(skippedAccountEntryCount()).toBe(before + 1);
  });

  it("⑥ buildLoginReq → 생성 reader 로 읽으면 secret · since · epoch · client 가 같다 · msg_type 5", () => {
    const bytes = createJournalCodec().buildLoginReq({
      secret: "s",
      sinceSeq: 7,
      epoch: "ep-1",
      client: "gh-radar-relay",
    });
    const env = Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(bytes));
    expect(env.msgType()).toBe(MSG.ObserverLoginReq);
    const req = env.observerLoginReq();
    expect(req).not.toBeNull();
    expect(req?.secret()).toBe("s");
    expect(req?.sinceSeq()).toBe(7n);
    expect(req?.journalEpoch()).toBe("ep-1");
    expect(req?.client()).toBe("gh-radar-relay");
  });

  it("⑥ sinceSeq 가 음수 · 비정수 · 2^53 이상이면 throw — 오류 문구에 비밀이 없다", () => {
    const codec = createJournalCodec();
    for (const sinceSeq of [-1, 1.5, 2 ** 53, Number.NaN]) {
      let caught: unknown = null;
      try {
        codec.buildLoginReq({ secret: SECRET, sinceSeq, epoch: "ep-1", client: "gh-radar-relay" });
      } catch (err) {
        caught = err;
      }
      expect(caught, `sinceSeq ${sinceSeq}`).toBeInstanceOf(RangeError);
      expect(String((caught as Error).message)).not.toContain(SECRET);
    }
    // 경계: 안전 정수 최대값은 허용된다.
    expect(() =>
      codec.buildLoginReq({ secret: "s", sinceSeq: Number.MAX_SAFE_INTEGER, epoch: "", client: "c" }),
    ).not.toThrow();
  });
});

describe("실 코덱 — 구조 파손 · 상한", () => {
  it("슬롯 없는 79 · 80 → malformed (관찰자가 연결을 다시 세운다)", () => {
    for (const msgType of [MSG.ObserverLoginResp, MSG.JournalBatch]) {
      const b = new flatbuffers.Builder(64);
      Envelope.startEnvelope(b);
      Envelope.addMsgType(b, msgType);
      b.finish(Envelope.endEnvelope(b));
      expect(decode(b.asUint8Array())).toEqual({ k: "malformed", msgType });
    }
  });

  it(`레코드 ${MAX_JOURNAL_BATCH_RECORDS} 건 초과 → 앞 ${MAX_JOURNAL_BATCH_RECORDS} 건 · caughtUp 거짓(잘린 뒤는 갭 판정이 다시 받는다)`, () => {
    const n = MAX_JOURNAL_BATCH_RECORDS + 10;
    const records = Array.from({ length: n }, (_, i) => ({ seq: i + 1 }));
    const f = decode(buildJournalBatchFrame({ records, headSeq: n, caughtUp: true }));
    if (f.k !== "batch") throw new Error(`batch 가 아니다: ${f.k}`);
    expect(f.batch.records).toHaveLength(MAX_JOURNAL_BATCH_RECORDS);
    expect(f.batch.records[MAX_JOURNAL_BATCH_RECORDS - 1]?.seq).toBe(MAX_JOURNAL_BATCH_RECORDS);
    expect(f.batch.caughtUp).toBe(false);
    expect(f.batch.headSeq).toBe(n);
  });
});
