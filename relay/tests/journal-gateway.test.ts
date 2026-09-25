/**
 * Phase 19 Plan 09 — 관찰자 실 TCP 통합: 실 `DmaClient` + 가짜 게이트웨이(관찰자 모드) + 실 코덱
 * (`createJournalCodec`) + `JournalObserver`.
 *
 * 가짜는 **게이트웨이 소켓 스텁**과 **기록기**(push 를 모으는 작은 구현)뿐이다. 와이어는 끝까지 실제다 —
 * 관찰자가 보낸 바이트를 게이트웨이 스텁이 생성 코드로 되읽고, 게이트웨이가 보낸 79·80 바이트를
 * 화이트리스트 → 실 코덱이 도메인 타입으로 푼다.
 *
 * 전 시나리오 공통 단언(T-19-04 relay 몫): 게이트웨이가 관찰자 연결에서 받은 msg_type ⊆ {5 로그인, 4 LivePing}.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { createJournalCodec } from "../src/journal/codec.js";
import { JournalObserver, OBSERVER_CLIENT_NAME, type ObserverWriter } from "../src/journal/observer.js";
import type { JournalCursor, JournalPushResult, JournalRecord, ObserverAccountRow } from "../src/journal/types.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import {
  SAMPLE_ACCOUNT_NO,
  buildObserverLoginRespFrame,
  buildServerMessageFrame,
  fakeJournalRecord,
} from "./helpers/frames.js";

const SECRET = "observer-secret-DO-NOT-LOG-gw-19-09";
const GATEWAY = "KB";

/** 기록기 가짜 — 커서 없음에서 시작하고, push 를 모으며 마지막 수신 seq · epoch 를 실제 기록기 규칙대로 갱신한다. */
class FakeWriter implements ObserverWriter {
  epoch = "";
  lastReceivedSeq: number | null = null;
  readonly pushed: JournalRecord[] = [];

  readCursor(): Promise<JournalCursor> {
    this.epoch = "";
    this.lastReceivedSeq = null;
    return Promise.resolve({ epoch: "", lastSeq: 0 });
  }
  beginEpoch(epoch: string, opts: { resync: boolean }): void {
    if (!opts.resync && epoch === this.epoch) return;
    this.epoch = epoch;
    this.lastReceivedSeq = null;
  }
  push(records: readonly JournalRecord[]): JournalPushResult {
    for (const r of records) {
      if (this.lastReceivedSeq !== null && r.seq <= this.lastReceivedSeq) continue;
      this.pushed.push(r);
      this.lastReceivedSeq = r.seq;
    }
    return "ok";
  }
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

/** 실시간 폴링 대기 — 재접속 백오프(1초)를 실제로 기다려야 한다. */
async function waitFor(predicate: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("관찰자 실 TCP 통합 — 가짜 게이트웨이 · 실 DmaClient · 실 코덱", () => {
  let gateway: FakeGateway;
  let observer: JournalObserver | null = null;
  let writer: FakeWriter;
  let access: { replace: Mock<(rows: readonly ObserverAccountRow[]) => void> };
  /** 게이트웨이가 관찰자 연결에서 받은 msg_type 전량(이 파일의 게이트웨이에는 관찰자만 붙는다). */
  let received: number[];

  beforeEach(async () => {
    resetDroppedEnvelopeCount();
    gateway = await startFakeGateway({ autoLogin: false, autoAccount: false });
    received = [];
    gateway.onFrame((msgType) => received.push(msgType));
    writer = new FakeWriter();
    access = { replace: vi.fn<(rows: readonly ObserverAccountRow[]) => void>() };
  });

  afterEach(async () => {
    observer?.stop();
    observer = null;
    await gateway.close();
    vi.restoreAllMocks();
    // T-19-04 (relay 몫): 관찰자 연결은 로그인과 핑 외에 아무것도 보내지 않는다.
    expect(received).toContain(MSG.ObserverLoginReq);
    expect(received.filter((t) => t !== MSG.ObserverLoginReq && t !== MSG.LivePing)).toEqual([]);
  });

  function startObserver(): JournalObserver {
    const o = new JournalObserver({
      secret: SECRET,
      gateway: GATEWAY,
      codec: createJournalCodec(),
      writer,
      access,
      host: "127.0.0.1",
      port: gateway.port,
    });
    observer = o;
    o.start();
    return o;
  }

  it("① 로그인 성공 → 배치 [1,2] caughtUp → 기록기가 23필드 그대로 2건 · live · 계좌 매핑 반영", async () => {
    gateway.respondObserverLogin({ epoch: "ep-1", headSeq: 2, oldestSeq: 1, resync: false });
    const o = startObserver();

    const sock = await gateway.waitForObserverConnection(3000);
    await waitFor(() => o.state === "replaying", "로그인 뒤 replaying");
    expect(gateway.observerLoginRequests()).toEqual([
      { secret: SECRET, sinceSeq: 0, epoch: "", client: OBSERVER_CLIENT_NAME },
    ]);
    expect(access.replace).toHaveBeenCalledWith([
      { dmaUserId: "dma-user-1", accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합", priority: 0 },
    ]);

    const recs = [{ seq: 1 }, { seq: 2, noticeType: "E", execPrice: 70_000, execQty: 10 }];
    gateway.pushJournalBatch(sock, { records: recs, headSeq: 2, caughtUp: true });
    await waitFor(() => o.state === "live", "배치 뒤 live");
    expect(writer.pushed).toEqual(recs.map(fakeJournalRecord));
    expect(writer.epoch).toBe("ep-1");
    expect(o.headSeq).toBe(2);
  });

  it("② hardClose → DmaClient 재접속 → 두 번째 로그인 since_seq 2 · epoch ep-1 · 이어받은 배치 수용", async () => {
    gateway.respondObserverLogin({ epoch: "ep-1", headSeq: 2, oldestSeq: 1, resync: false });
    const o = startObserver();
    const first = await gateway.waitForObserverConnection(3000);
    await waitFor(() => o.state === "replaying", "첫 로그인");
    gateway.pushJournalBatch(first, { records: [{ seq: 1 }, { seq: 2 }], headSeq: 2, caughtUp: true });
    await waitFor(() => o.state === "live", "첫 배치 뒤 live");

    gateway.respondObserverLogin({ epoch: "ep-1", headSeq: 3, oldestSeq: 1, resync: false });
    gateway.hardClose(first);
    await waitFor(() => o.state === "connecting", "끊김 → connecting");
    await waitFor(() => gateway.observerLoginRequests().length === 2, "재접속 로그인", 4000);
    expect(gateway.observerLoginRequests()[1]).toEqual({
      secret: SECRET,
      sinceSeq: 2,
      epoch: "ep-1",
      client: OBSERVER_CLIENT_NAME,
    });

    const second = await gateway.waitForObserverConnection(3000);
    expect(second).not.toBe(first);
    await waitFor(() => o.state === "replaying", "재로그인 뒤 replaying");
    gateway.pushJournalBatch(second, { records: [{ seq: 3 }], headSeq: 3, caughtUp: true });
    await waitFor(() => o.state === "live", "이어받은 배치 뒤 live");
    expect(writer.pushed.map((r) => r.seq)).toEqual([1, 2, 3]);
  }, 10_000);

  it("③ 로그인 거부 → rejected · 3초 동안 두 번째 로그인 0 (백오프 첫 지연 1초보다 길게)", async () => {
    const logs = await spyLogs();
    gateway.respondObserverLogin({ success: false, message: "관찰자 인증 실패" });
    const o = startObserver();

    await waitFor(() => o.state === "rejected", "거부 → rejected");
    await sleep(3000);
    expect(gateway.observerLoginRequests()).toHaveLength(1);
    expect(o.state).toBe("rejected");
    expect(access.replace).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.map((c) => c.args))).not.toContain(SECRET);
  }, 10_000);

  it("④ live 중 76 RateCrossAlert → 상태 불변 · warn/error 0 (조용히 무시)", async () => {
    gateway.respondObserverLogin({ epoch: "ep-1", headSeq: 1, oldestSeq: 1, resync: false });
    const o = startObserver();
    const sock = await gateway.waitForObserverConnection(3000);
    await waitFor(() => o.state === "replaying", "로그인");
    gateway.pushJournalBatch(sock, { records: [{ seq: 1 }], headSeq: 1, caughtUp: true });
    await waitFor(() => o.state === "live", "live");

    const logs = await spyLogs();
    gateway.sendRateCrossAlert(sock);
    // TCP 순서 보장 — 뒤따르는 배치가 도착했으면 76 도 이미 처리됐다.
    gateway.pushJournalBatch(sock, { records: [{ seq: 2 }], headSeq: 2, caughtUp: true });
    await waitFor(() => writer.pushed.length === 2, "76 뒤 배치");
    expect(o.state).toBe("live");
    expect(logs.filter((c) => c.level === "warn" || c.level === "error")).toEqual([]);
  });

  it("⑤ 로그인 응답(79) 전에 54 · 76 이 먼저 와도 로그인 대기 · 타이머에 영향 없이 로그인 성공 · warn/error 0", async () => {
    const logs = await spyLogs();
    // 자동 응답 대신 손으로 순서를 만든다: 로그인 요청 → 54 → 76 → 79.
    gateway.respondObserverLogin(null);
    gateway.onFrame((msgType, _payload, sock) => {
      if (msgType !== MSG.ObserverLoginReq) return;
      gateway.sendFrame(sock, buildServerMessageFrame({ level: "WARN", message: "장 운영 공지" }));
      gateway.sendRateCrossAlert(sock);
      gateway.sendFrame(sock, buildObserverLoginRespFrame({ epoch: "ep-1", headSeq: 0, oldestSeq: 0, resync: false }));
    });
    const o = startObserver();

    await waitFor(() => o.state === "live", "54·76 뒤 79 → live(head 0)");
    expect(access.replace).toHaveBeenCalledTimes(1);
    expect(gateway.observerLoginRequests()).toHaveLength(1);
    expect(logs.filter((c) => c.level === "warn" || c.level === "error")).toEqual([]);
    // 로그인 전에 온 76 이 hub 경로가 아니라 관찰자 경로에서 끝났다 — 두 번째 로그인도 없다.
    await sleep(200);
    expect(gateway.observerLoginRequests()).toHaveLength(1);
  });

  it("⑥ 로컬 거부 레코드(빈 주문번호) · resync+oldest 0 로그인 → 곧바로 live · 다음 append 레코드 수용", async () => {
    gateway.respondObserverLogin({ epoch: "ep-2", headSeq: 40, oldestSeq: 0, resync: true });
    const o = startObserver();
    const sock = await gateway.waitForObserverConnection(3000);
    await waitFor(() => o.state === "live", "resync · oldest 0 → live");

    const reject = { seq: 41, orderNo: "", noticeType: "R", localReject: true, resultCode: -1, board: "" };
    gateway.pushJournalBatch(sock, { records: [reject], headSeq: 41, caughtUp: true });
    await waitFor(() => writer.pushed.length === 1, "로컬 거부 레코드 적재");
    expect(writer.pushed[0]).toEqual(fakeJournalRecord(reject));
    expect(o.state).toBe("live");
  });
});
