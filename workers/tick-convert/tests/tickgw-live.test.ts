/**
 * quick 261104-n7i — tickgw live 클라이언트 + 키 하루치 받기 루프(fetchLiveDay) 분기 전부.
 * 진짜 `createTickgwLiveClient` 에 가짜 fetch(응답 대본) · 가상 시계(sleep 이 시계를 전진)를 넣는다.
 */
import { describe, it, expect } from "vitest";
import {
  LIVE_DELAYED_MS,
  LIVE_MAX_CONFLICTS,
  LIVE_POLL_MS,
  LIVE_QUEUED_GIVEUP_MS,
  TickgwAuthError,
  createTickgwLiveClient,
  fetchLiveDay,
} from "../src/tickgw-live";
import { liveFetch, serveDay, virtualClock, type LiveReply, type LiveReq } from "./helpers/fake-tickgw-live";

const URL_ = "http://10.0.0.5:8787";
const SECRET = "s3cret-live";
const ISIN = "KR7184230001";
const NEED = 1_000_000;
const A = new Uint8Array([1, 2, 3, 4, 5]);
const B = new Uint8Array([9, 8, 7]);

/** 대본 — i 번째 요청에 i 번째 응답(끝을 넘으면 마지막 응답 반복). */
function script(replies: (LiveReply | ((req: LiveReq) => LiveReply))[]) {
  return (req: LiveReq, i: number): LiveReply => {
    const r = replies[Math.min(i, replies.length - 1)]!;
    return typeof r === "function" ? r(req) : r;
  };
}

async function run(reply: (req: LiveReq, i: number) => LiveReply, opts: { need?: number; deadline?: number } = {}) {
  const { fetchImpl, reqs } = liveFetch(reply);
  const vc = virtualClock(0);
  const client = createTickgwLiveClient({ url: URL_, secret: SECRET, fetchImpl });
  const res = await fetchLiveDay(client, {
    isin: ISIN,
    ex: "KRX",
    needMs: opts.need ?? NEED,
    deadlineMs: opts.deadline ?? 90_000,
    clock: vc.clock,
    sleep: vc.sleep,
  });
  return { res, reqs, vc };
}

describe("fetchLiveDay — 200 분기", () => {
  it("More=true → 대기 없이 offset = Offset-End 로 이어 받기 · 끝까지 이어 붙인 바이트", async () => {
    const day = new Uint8Array([...A, ...B]);
    const { res, reqs, vc } = await run((req) => serveDay(day, { asOfMs: NEED, cap: 3 })(req));
    expect(reqs.map((r) => [r.offset, r.epoch])).toEqual([
      [0, ""],
      [3, "ep-1"],
      [6, "ep-1"],
    ]);
    expect(vc.sleeps).toEqual([]);
    expect(res).toMatchObject({ kind: "done", asOfMs: NEED, bytes: 8, requests: 3 });
    expect(res.kind === "done" && Array.from(res.raw)).toEqual(Array.from(day));
  });

  it("loading → LIVE_POLL_MS 뒤 이어 받기", async () => {
    const { res, reqs, vc } = await run(
      script([
        { body: A, state: "loading", asOfMs: "" },
        { body: B, state: "ready", asOfMs: NEED },
      ]),
    );
    expect(vc.sleeps).toEqual([LIVE_POLL_MS]);
    expect(reqs[1]!.offset).toBe(A.length);
    expect(res.kind === "done" && Array.from(res.raw)).toEqual([...A, ...B]);
  });

  it("queued 가 LIVE_QUEUED_GIVEUP_MS 넘게 지속 → deferred queued(한 키가 예산을 다 먹지 않게)", async () => {
    const { res, vc } = await run(script([{ state: "queued", queue: 2, asOfMs: "" }]));
    expect(res).toMatchObject({ kind: "deferred", reason: "queued" });
    expect(vc.sleeps.every((s) => s === LIVE_POLL_MS)).toBe(true);
    expect(vc.clock()).toBeGreaterThan(LIVE_QUEUED_GIVEUP_MS);
    expect(vc.clock()).toBeLessThanOrEqual(LIVE_QUEUED_GIVEUP_MS + LIVE_POLL_MS);
  });

  it("queued 뒤 활성이 되면 계속 받는다(queued 시계는 리셋)", async () => {
    const { res, vc } = await run(
      script([
        { state: "queued", queue: 1, asOfMs: "" },
        { state: "queued", queue: 1, asOfMs: "" },
        { body: A, state: "ready", asOfMs: NEED },
      ]),
    );
    expect(vc.sleeps).toEqual([LIVE_POLL_MS, LIVE_POLL_MS]);
    expect(res.kind).toBe("done");
  });

  it("delayed → LIVE_DELAYED_MS 뒤 다시", async () => {
    const { res, vc } = await run(
      script([
        { body: A, state: "delayed", asOfMs: "" },
        { body: B, state: "ready", asOfMs: NEED },
      ]),
    );
    expect(vc.sleeps).toEqual([LIVE_DELAYED_MS]);
    expect(res.kind).toBe("done");
  });

  it("ready ∧ asOf < need → LIVE_POLL_MS 뒤 다시 → asOf ≥ need 면 done", async () => {
    const { res, reqs, vc } = await run(
      script([
        { body: A, state: "ready", asOfMs: NEED - 1 },
        { body: B, state: "ready", asOfMs: NEED + 5 },
      ]),
    );
    expect(vc.sleeps).toEqual([LIVE_POLL_MS]);
    expect(reqs[1]!.offset).toBe(A.length);
    expect(res).toMatchObject({ kind: "done", asOfMs: NEED + 5, requests: 2 });
  });

  it("As-Of 헤더가 비면(옛 tickgw) Last-Recv-Ns / 1e6 로 판정", async () => {
    const ns = String(BigInt(NEED) * 1_000_000n + 999_999n);
    const { res } = await run(script([{ body: A, state: "ready", asOfMs: "", lastRecvNs: ns }]));
    expect(res).toMatchObject({ kind: "done", asOfMs: NEED });
  });

  it("As-Of · Last-Recv 둘 다 없으면 asOf 미달로 보고 기다린다 → 데드라인 deferred timeout", async () => {
    const { res } = await run(script([{ body: A, state: "ready", asOfMs: "" }]), { deadline: 5000 });
    expect(res).toMatchObject({ kind: "deferred", reason: "timeout" });
  });

  it("ready ∧ Complete=false → deferred incomplete(구멍 있는 하루 · 계산 안 함)", async () => {
    const { res } = await run(script([{ body: A, state: "ready", complete: false, asOfMs: NEED }]));
    expect(res).toMatchObject({ kind: "deferred", reason: "incomplete", requests: 1 });
  });

  it("blocked → failed", async () => {
    const { res } = await run(script([{ body: A, state: "blocked", asOfMs: "" }]));
    expect(res).toMatchObject({ kind: "failed", reason: "state blocked" });
  });

  it("데드라인 초과 → deferred timeout(loading 이 끝나지 않음)", async () => {
    const { res, vc } = await run(script([{ state: "loading", asOfMs: "" }]), { deadline: 7000 });
    expect(res).toMatchObject({ kind: "deferred", reason: "timeout" });
    expect(vc.clock()).toBeGreaterThan(7000);
  });
});

describe("fetchLiveDay — 409 · 오류", () => {
  it("409 → 새 epoch · offset 0 · 쌓은 본문 버림 · 곧바로 다시", async () => {
    const { res, reqs, vc } = await run(
      script([
        { body: A, epoch: "ep-1", more: true, state: "loading", asOfMs: "" },
        { status: 409, json: { epoch: "ep-2" } },
        { body: B, epoch: "ep-2", state: "ready", asOfMs: NEED },
      ]),
    );
    expect(reqs.map((r) => [r.offset, r.epoch])).toEqual([
      [0, ""],
      [A.length, "ep-1"],
      [0, "ep-2"],
    ]);
    expect(vc.sleeps).toEqual([]);
    expect(res).toMatchObject({ kind: "done", bytes: B.length });
    expect(res.kind === "done" && Array.from(res.raw)).toEqual(Array.from(B));
  });

  it(`409 가 연달아 ${LIVE_MAX_CONFLICTS}회를 넘으면 failed(엔트리가 계속 바뀜)`, async () => {
    const { res, reqs } = await run(script([{ status: 409, json: { epoch: "ep-x" } }]));
    expect(res.kind).toBe("failed");
    expect(reqs).toHaveLength(LIVE_MAX_CONFLICTS + 1);
  });

  it.each([503, 500, 400])("HTTP %i → failed(사유에 상태 코드)", async (status) => {
    const { res } = await run(script([{ status, json: { error: "CACHE_UNAVAILABLE" } }]));
    expect(res.kind).toBe("failed");
    expect(res.kind === "failed" && res.reason).toContain(`HTTP ${status}`);
  });

  it("네트워크 · 타임아웃 throw → failed(사유에 오류 이름)", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    const { res } = await run(script([err]));
    expect(res.kind).toBe("failed");
    expect(res.kind === "failed" && res.reason).toContain("TimeoutError");
  });

  it("401 → TickgwAuthError throw(run 실패) · 메시지에 비밀 없음", async () => {
    const p = run(script([{ status: 401, json: { error: "UNAUTHORIZED" } }]));
    await expect(p).rejects.toBeInstanceOf(TickgwAuthError);
    await expect(p).rejects.not.toThrow(SECRET);
  });

  it("비밀은 요청 헤더에만(URL 에 없음) · 경로 /internal/ticks/live · 쿼리 isin · ex · epoch · offset", async () => {
    const { reqs } = await run(script([{ body: A, state: "ready", asOfMs: NEED }]));
    const r = reqs[0]!;
    expect(r.headers["X-Tickgw-Secret"]).toBe(SECRET);
    expect(r.url.toString()).not.toContain(SECRET);
    expect(r.url.pathname).toBe("/internal/ticks/live");
    expect([...r.url.searchParams.keys()].sort()).toEqual(["epoch", "ex", "isin", "offset"]);
  });

  it("lastReqAt = 마지막 요청 직전 clock()", async () => {
    const { res } = await run(
      script([
        { body: A, state: "loading", asOfMs: "" },
        { body: B, state: "ready", asOfMs: NEED },
      ]),
    );
    expect(res.lastReqAt).toBe(LIVE_POLL_MS);
  });
});
