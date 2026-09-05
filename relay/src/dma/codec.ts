/**
 * Phase 15 Plan 02 — RELAY-01. DMA 길이 프레이밍 코덱 (스트림 ↔ 프레임).
 *
 * 와이어 포맷은 `[uint32 LE 길이(페이로드만, 헤더 4바이트 제외)][FlatBuffer]` 다.
 * TCP 는 경계를 보존하지 않으므로 수신 청크는 프레임을 결합·분할한 채 도착한다.
 * 이 모듈이 그 경계를 복원하는 유일한 곳이며, 상위 계층(DmaClient)은 완결된
 * 페이로드만 본다. gh-trade `client/Services/DMA/PacketCodec.cs` 의 `TryExtract`
 * 규율을 그대로 이식했다.
 *
 * 결정 근거:
 *   D-30  프레이밍 규격과 "길이만큼 잘라내는 루프". 상한 검사가 산술보다 **먼저**다.
 *   D-31  깨진 프레임은 그 프레임만 버리고 연결은 유지한다. 단, 길이 헤더 손상은
 *         다음 경계를 신뢰할 수 없으므로 드롭이 아니라 **연결 재수립 신호**(desync)다.
 *   T-15-07/07b  신뢰 경계(게이트웨이 TCP → relay)의 1차 방어선. 길이 상한이 없으면
 *         조작된 헤더 하나로 e2-micro 메모리를 압박할 수 있다.
 *   S-5   드롭 경로에 카운터 + 사유 + 선두 64B hex 를 남긴다. 조용한 `return` 금지 —
 *         "간헐적으로 호가가 안 옴"의 원인을 영원히 못 찾게 만든다.
 *
 * 하지 않는 것:
 *   - FlatBuffers 를 해석하지 않는다. 페이로드의 의미는 `envelope.ts` 소관이다.
 *   - desync 를 자체 복구하지 않는다. 버퍼만 비우고 신호를 올린다 — 재접속 정책은
 *     세션 상태기계(15-03)의 책임이다.
 */
import { logger } from "../logger.js";

/** 길이 헤더 크기 (uint32 LE). */
export const HEADER_SIZE = 4;

/**
 * 허용 최대 프레임 길이 = **1MB**.
 *
 * 서버 `net/Gateway.h` 의 `kMaxRecvBufSize` 와 C# `PacketCodec.MAX_FRAME_SIZE` 가
 * 모두 1MB 다. 인계 문서의 "4MB" 는 서버 **송신 큐 총량 상한**(`kSendQueueMaxBytes`)을
 * 프레임 상한으로 오독한 것이다 (RESEARCH Pitfall 2). 상한을 넉넉히 잡으면 desync
 * 감지가 늦어지고 수신 버퍼가 수백 KB 이상 자란 채 붙들린다.
 */
export const MAX_FRAME_SIZE = 1024 * 1024;

/** Envelope 최소 크기 (root offset 4 + vtable soffset 4). 미만은 파싱 전 드롭. */
export const MIN_ENVELOPE_SIZE = 8;

/**
 * 수신 누적 버퍼 상한 (서버 `kMaxRecvBufSize` 동형).
 *
 * `tryExtract` 가 이미 상한 초과 헤더를 걸러내므로 미완결 프레임의 잔여 바이트는
 * 구조적으로 `HEADER_SIZE + MAX_FRAME_SIZE` 를 넘을 수 없다. 그래서 아래 검사는
 * 도달 불가에 가까운 **안전망**이다 — 무한 누적 경로가 없음을 코드로 못박아 둔다
 * (T-15-07b). 헤더 4바이트를 더해 비교하는 이유는, 상한 크기 프레임이 여러 청크로
 * 쪼개져 도착할 때 정상 프레임을 desync 로 오판하지 않기 위해서다.
 */
export const MAX_RECV_BUFFER_SIZE = 1024 * 1024;

/** 드롭 로그에 남길 선두 바이트 수. C# 덤프 길이와 동일. */
const DUMP_BYTES = 64;

const EMPTY = Buffer.alloc(0);

/**
 * 페이로드를 프레임 패킷으로 인코딩한다.
 *
 * 길이 헤더에는 **페이로드 길이만** 담는다(헤더 4바이트 미포함).
 */
export function frame(payload: Uint8Array): Buffer {
  if (payload.length > MAX_FRAME_SIZE) {
    throw new Error(`프레임이 상한을 넘습니다: ${payload.length} > ${MAX_FRAME_SIZE}`);
  }
  const packet = Buffer.allocUnsafe(HEADER_SIZE + payload.length);
  packet.writeUInt32LE(payload.length, 0);
  packet.set(payload, HEADER_SIZE);
  return packet;
}

/** `tryExtract` 결과. */
export type ExtractResult =
  /** 헤더 또는 페이로드가 아직 다 오지 않았다. 다음 청크를 기다린다. */
  | { kind: "need-more" }
  /** 길이 헤더가 상한을 넘었다 — 프레임 경계 유실. 호출부가 **연결을 재수립**해야 한다. */
  | { kind: "desync"; declared: number }
  /** 완결된 프레임 1건. `payload` 는 입력 버퍼의 뷰다(복사 아님). */
  | { kind: "frame"; payload: Buffer; consumed: number };

/**
 * 수신 버퍼 선두에서 완결 프레임 1건을 잘라낸다.
 *
 * 상한 검사를 산술보다 먼저 하는 것이 이 함수의 핵심 규율이다 (C# `TryExtract` L61-93).
 * 상한을 넘는 길이는 수신 버퍼에 담길 수 없어 영원히 "데이터 부족"이 되므로,
 * `need-more` 로 돌려주면 연결이 조용히 멎는다.
 */
export function tryExtract(buf: Buffer): ExtractResult {
  if (buf.length < HEADER_SIZE) return { kind: "need-more" };

  const declared = buf.readUInt32LE(0);
  // 상한을 먼저 — 여기서 걸러야 아래 산술이 안전하다.
  if (declared > MAX_FRAME_SIZE) return { kind: "desync", declared };

  if (buf.length < HEADER_SIZE + declared) return { kind: "need-more" };
  return {
    kind: "frame",
    payload: buf.subarray(HEADER_SIZE, HEADER_SIZE + declared),
    consumed: HEADER_SIZE + declared,
  };
}

/**
 * 드롭 프레임 진단 로그 (S-5). 코덱과 Envelope 파서가 같은 형식을 쓴다.
 *
 * `msgTypeHint` 는 "무엇이 왔는지 짐작"용이다. 8바이트 미만 페이로드는 루트 테이블
 * 자체를 읽을 수 없어 `null` 이 된다 — 이때는 hex 덤프가 유일한 단서다.
 */
export function logDroppedFrame(fields: {
  reason: string;
  msgTypeHint: number | null;
  payload: Buffer;
  droppedFrameCount: number;
}): void {
  const { reason, msgTypeHint, payload, droppedFrameCount } = fields;
  logger.warn(
    {
      reason,
      msgTypeHint,
      payloadLength: payload.length,
      droppedFrameCount,
      head: payload.subarray(0, DUMP_BYTES).toString("hex"),
    },
    "[DMA] 프레임 드롭",
  );
}

/** `FrameReader.push` 결과. */
export type PushResult = {
  /** 이번 청크로 완성된 프레임들. 각 요소는 입력과 무관한 복사본이다. */
  frames: Buffer[];
  /** true 면 프레임 경계를 잃었다 — 호출부가 연결을 재수립해야 한다. */
  desync: boolean;
};

/**
 * 소켓 `data` 이벤트용 누적 리더.
 *
 * 남은 바이트를 내부 버퍼에 보존해 다음 청크와 결합하고, 절반 이상 소비되면 compact
 * 해 원본 청크의 참조를 놓는다(뷰를 계속 들고 있으면 큰 청크 전체가 GC 되지 않는다).
 */
export class FrameReader {
  #buf: Buffer = EMPTY;
  #dropped = 0;

  /** 누적 드롭 프레임 수 (S-5 — 진단의 원천). */
  get droppedFrameCount(): number {
    return this.#dropped;
  }

  /** 내부 버퍼에 남아 있는 미완결 바이트 수 (테스트·진단용). */
  get pendingBytes(): number {
    return this.#buf.length;
  }

  /** 연결 재수립 시 호출 — 이전 연결의 잔여 바이트를 다음 연결로 흘리지 않는다. */
  reset(): void {
    this.#buf = EMPTY;
  }

  push(chunk: Buffer): PushResult {
    this.#buf = this.#buf.length === 0 ? chunk : Buffer.concat([this.#buf, chunk]);

    const frames: Buffer[] = [];
    for (;;) {
      const r = tryExtract(this.#buf);
      if (r.kind === "need-more") break;

      if (r.kind === "desync") {
        this.#buf = EMPTY;
        logger.warn(
          { declared: r.declared, max: MAX_FRAME_SIZE },
          "[DMA] 길이 헤더가 상한 초과 — 프레임 경계 유실, 연결 재수립 필요",
        );
        return { frames, desync: true };
      }

      if (r.payload.length < MIN_ENVELOPE_SIZE) {
        // 프레임 자체는 완결됐지만 Envelope 이 될 수 없는 크기다. 경계는 살아 있으므로
        // 이 프레임만 버리고 계속 읽는다 (D-31).
        this.#dropped += 1;
        logDroppedFrame({
          reason: "min-envelope-size",
          msgTypeHint: null,
          payload: r.payload,
          droppedFrameCount: this.#dropped,
        });
      } else {
        // 뷰가 아니라 복사 — 다음 push 의 concat 이 원본을 대체한다.
        frames.push(Buffer.from(r.payload));
      }
      this.#buf = this.#buf.subarray(r.consumed);
    }

    this.#compact();

    if (this.#buf.length > HEADER_SIZE + MAX_RECV_BUFFER_SIZE) {
      const pending = this.#buf.length;
      this.#buf = EMPTY;
      logger.warn(
        { pending, max: MAX_RECV_BUFFER_SIZE },
        "[DMA] 수신 버퍼 상한 초과 — 연결 재수립 필요",
      );
      return { frames, desync: true };
    }

    return { frames, desync: false };
  }

  /** 잔여 뷰가 원본 버퍼의 절반 이하로 줄면 복사해 원본을 놓아준다. */
  #compact(): void {
    if (this.#buf.length === 0) {
      this.#buf = EMPTY;
      return;
    }
    if (this.#buf.byteOffset > 0 && this.#buf.length * 2 <= this.#buf.buffer.byteLength) {
      this.#buf = Buffer.from(this.#buf);
    }
  }
}
