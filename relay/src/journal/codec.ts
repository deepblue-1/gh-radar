/**
 * Phase 19 Plan 09 — 관찰자 와이어 코덱 실구현 (`createJournalCodec`).
 *
 * 계약 정본: gh-trade Phase 23 커밋 `8285a26585cc58405733752b01d07019effc5ea4`
 * (`StockDMA.fbs` blob f60a7e37) — MsgType 5 `ObserverLoginReq` · 79 `ObserverLoginResp` · 80 `JournalBatch`,
 * Envelope 슬롯 76/78/80. 생성물은 `sync-relay-schema.sh` 로만 만든다(`relay/src/generated/**` 손편집 금지).
 *
 * **스왑 지점은 이 파일 하나다 — 관찰자(`observer.ts`)·기록기(`writer.ts`)는 코덱을 주입받을 뿐 와이어를 모른다.**
 * FlatBuffers 조립·해석은 `dma/envelope.ts` 의 `buildObserverLoginReq` · `parseObserverLoginResp` ·
 * `parseJournalBatch` 가 하고, 여기서는 msg_type 으로 갈라 `ObserverFrame` 으로 감쌀 뿐이다.
 *
 * 분류 (관찰자 연결에 올 수 있는 것):
 *   79 → login (파싱 실패 → malformed)
 *   80 → batch (파싱 실패 → malformed)
 *   76 `RateCrossAlert` · 54 `ServerMessage` → ignore — 게이트웨이는 둘을 **로그인 전 연결에도** 브로드캐스트한다
 *      (Pitfall 8 · gh-trade 23-G1 회신). 관찰자와 무관하고 로그인 대기·상태에 영향을 주지 않는다.
 *      로그인 실패는 반드시 79(success=false)로 온다는 것이 gh-trade 와의 합의라, 54 를 버려도 거부를 놓치지 않는다.
 *   그 밖 → unexpected (관찰자가 번호별 1회 warn 후 버린다)
 */
import { MSG } from "../dma/msg-type.js";
import { buildObserverLoginReq, parseJournalBatch, parseObserverLoginResp } from "../dma/envelope.js";
import type { JournalCodec, ObserverFrame } from "./types.js";

export function createJournalCodec(): JournalCodec {
  return {
    buildLoginReq(input) {
      return buildObserverLoginReq(input);
    },
    decode(e): ObserverFrame {
      const msgType = e.msgType;
      switch (msgType) {
        case MSG.ObserverLoginResp: {
          const result = parseObserverLoginResp(e.env);
          return result === null ? { k: "malformed", msgType } : { k: "login", result };
        }
        case MSG.JournalBatch: {
          const batch = parseJournalBatch(e.env);
          return batch === null ? { k: "malformed", msgType } : { k: "batch", batch };
        }
        case MSG.RateCrossAlert:
        case MSG.ServerMessage:
          return { k: "ignore", msgType };
        default:
          return { k: "unexpected", msgType };
      }
    },
  };
}
