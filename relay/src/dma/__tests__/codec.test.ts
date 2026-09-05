/**
 * Phase 15 Plan 02 — RELAY-01. 프레이밍 코덱 단위 테스트 (SC-3).
 *
 * 검증 대상은 셋이다 — ① 결합·분할된 TCP 스트림에서 프레임 경계가 정확히 복원되는가
 * (D-30) ② 길이 상한 초과가 드롭이 아니라 desync 신호로 보고되는가 (Pitfall 2)
 * ③ Envelope 이 될 수 없는 크기가 카운터를 남기고 버려지는가 (D-31 / S-5).
 * 추가로 `MSG` 상수가 생성 코드 enum 과 어긋나지 않았는지 대조한다 — 스키마 재sync
 * 로 값이 바뀌면 여기서 먼저 깨져야 한다.
 *
 * 하지 않는 것: FlatBuffers 의미 검증은 `envelope.test.ts` 소관이다. 여기서는
 *              페이로드를 불투명 바이트로만 다룬다.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { logger } from "../../logger.js";
import { MsgType } from "../../generated/stock-dma/msg-type.js";
import { MSG, INBOUND_MSG_TYPES } from "../msg-type.js";
import {
  frame,
  tryExtract,
  FrameReader,
  HEADER_SIZE,
  MAX_FRAME_SIZE,
  MIN_ENVELOPE_SIZE,
} from "../codec.js";

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // 드롭/desync 경로는 반드시 warn 을 남긴다(S-5). 테스트에서는 출력만 막고 호출은 센다.
  warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 길이 헤더만 담은 4바이트 버퍼. */
function header(len: number): Buffer {
  const h = Buffer.alloc(HEADER_SIZE);
  h.writeUInt32LE(len, 0);
  return h;
}

/** MIN_ENVELOPE_SIZE 를 넘는 더미 페이로드. */
function payload(n: number, fill = 0xab): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

describe("frame()", () => {
  it("길이 헤더에 페이로드 길이만 담는다 (헤더 4바이트 미포함)", () => {
    const packet = frame(new Uint8Array([1, 2, 3]));
    expect(packet).toHaveLength(HEADER_SIZE + 3);
    expect(packet.readUInt32LE(0)).toBe(3);
  });

  it("상한을 넘는 페이로드는 인코딩을 거부한다", () => {
    expect(() => frame(new Uint8Array(MAX_FRAME_SIZE + 1))).toThrow(/상한/);
  });
});

describe("tryExtract()", () => {
  it("헤더가 덜 왔으면 need-more 다", () => {
    expect(tryExtract(Buffer.from([0x01, 0x02])).kind).toBe("need-more");
  });

  it("상한 초과 길이는 산술 전에 desync 로 판정한다", () => {
    const r = tryExtract(header(2 * 1024 * 1024));
    expect(r.kind).toBe("desync");
    if (r.kind === "desync") expect(r.declared).toBe(2 * 1024 * 1024);
  });
});

describe("FrameReader", () => {
  it("① 두 프레임이 붙어서 와도 분리한다", () => {
    const r = new FrameReader();
    const a = frame(payload(8, 0x11));
    const b = frame(payload(12, 0x22));

    const { frames, desync } = r.push(Buffer.concat([a, b]));

    expect(desync).toBe(false);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toHaveLength(8);
    expect(frames[1]).toHaveLength(12);
    expect(frames[0]!.every((v) => v === 0x11)).toBe(true);
    expect(frames[1]!.every((v) => v === 0x22)).toBe(true);
    expect(r.pendingBytes).toBe(0);
  });

  it("② 프레임이 분할돼 와도 다음 청크에서 완성한다 (헤더 중간 절단 포함)", () => {
    const r = new FrameReader();
    const f = frame(payload(16, 0x33));

    // 헤더 4바이트의 한가운데(2바이트)에서 자른다 — 길이조차 못 읽는 상태.
    expect(r.push(f.subarray(0, 2)).frames).toHaveLength(0);
    expect(r.pendingBytes).toBe(2);

    // 헤더는 완성됐지만 페이로드가 모자란 상태.
    expect(r.push(f.subarray(2, 10)).frames).toHaveLength(0);

    const { frames, desync } = r.push(f.subarray(10));
    expect(desync).toBe(false);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(16);
    expect(r.pendingBytes).toBe(0);
  });

  it("③ 1MB 초과 길이 헤더는 desync 로 보고하고 경고를 남긴다", () => {
    const r = new FrameReader();

    const { frames, desync } = r.push(header(2 * 1024 * 1024));

    expect(desync).toBe(true);
    expect(frames).toHaveLength(0);
    // 드롭이 아니라 연결 재수립 신호다 — 버퍼를 비워 다음 연결로 잔여를 흘리지 않는다.
    expect(r.pendingBytes).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("④ 정확히 1MB 프레임은 정상 통과한다", () => {
    const r = new FrameReader();
    const f = frame(payload(MAX_FRAME_SIZE, 0x5a));

    const { frames, desync } = r.push(f);

    expect(desync).toBe(false);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(MAX_FRAME_SIZE);
    expect(warn).not.toHaveBeenCalled();
  });

  it("④-b 1MB 프레임이 여러 청크로 쪼개져도 desync 로 오판하지 않는다", () => {
    const r = new FrameReader();
    const f = frame(payload(MAX_FRAME_SIZE, 0x5a));
    const cut = MAX_FRAME_SIZE - 1024;

    expect(r.push(f.subarray(0, cut)).desync).toBe(false);
    const { frames, desync } = r.push(f.subarray(cut));

    expect(desync).toBe(false);
    expect(frames).toHaveLength(1);
  });

  it("⑤ 8바이트 미만 페이로드는 드롭 카운터를 올리고 프레임 목록에 넣지 않는다", () => {
    const r = new FrameReader();
    const tiny = frame(payload(MIN_ENVELOPE_SIZE - 1));

    const { frames, desync } = r.push(tiny);

    expect(frames).toEqual([]);
    expect(desync).toBe(false);
    expect(r.droppedFrameCount).toBe(1);
    // 조용한 드롭 금지 — 사유·hex 덤프가 남아야 한다 (S-5).
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>];
    expect(fields.reason).toBe("min-envelope-size");
    expect(fields.droppedFrameCount).toBe(1);
    expect(typeof fields.head).toBe("string");
  });

  it("⑤-b 드롭된 프레임 뒤의 정상 프레임은 계속 읽는다 (연결 유지)", () => {
    const r = new FrameReader();
    const stream = Buffer.concat([frame(payload(4)), frame(payload(9, 0x77))]);

    const { frames, desync } = r.push(stream);

    expect(desync).toBe(false);
    expect(r.droppedFrameCount).toBe(1);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(9);
  });

  it("⑥ frame() 왕복 — 인코드한 바이트가 그대로 나온다", () => {
    const r = new FrameReader();
    const original = payload(32, 0x5c);

    const { frames } = r.push(frame(original));

    expect(frames).toHaveLength(1);
    expect(Uint8Array.from(frames[0]!)).toEqual(original);
  });

  it("reset() 은 미완결 잔여 바이트를 버린다", () => {
    const r = new FrameReader();
    r.push(frame(payload(16)).subarray(0, 6));
    expect(r.pendingBytes).toBe(6);

    r.reset();

    expect(r.pendingBytes).toBe(0);
  });
});

describe("MSG 상수", () => {
  it("생성 코드의 MsgType enum 과 값이 일치한다", () => {
    const generated = MsgType as unknown as Record<string, number>;
    for (const [name, value] of Object.entries(MSG)) {
      expect(generated[name], `MSG.${name}`).toBe(value);
    }
  });

  it("INBOUND_MSG_TYPES 는 응답 대역(50~71)만 담는다", () => {
    expect(INBOUND_MSG_TYPES.size).toBe(12);
    for (const v of INBOUND_MSG_TYPES) {
      expect(v).toBeGreaterThanOrEqual(50);
      expect(v).toBeLessThanOrEqual(71);
    }
    // 요청 계열이 수신 경로로 들어오는 것 자체가 이상 신호다.
    expect(INBOUND_MSG_TYPES.has(MSG.LoginReq)).toBe(false);
    expect(INBOUND_MSG_TYPES.has(MSG.LivePing)).toBe(false);
    // 74/75(거래원)는 본 phase 범위 밖 — 화이트리스트에 없어야 한다.
    expect(INBOUND_MSG_TYPES.has(MsgType.MemberStatsResp)).toBe(false);
    expect(INBOUND_MSG_TYPES.has(MsgType.MemberStatsPush)).toBe(false);
  });
});
