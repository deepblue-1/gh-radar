"use client";

import { DmaGate, useDmaGateReason } from "./dma-gate";
import { SurfacePlaceholder } from "./surface-placeholder";

/**
 * My page 클라이언트 — Plan 11 에서는 **게이트 분기 + 제목/부제**만 세운다.
 * 상태줄·전략 현황·계좌별 미체결/잔고·전체 비활성화는 16-15 가 이 파일을 채우며 붙인다.
 */
export function MeClient() {
  const gateReason = useDmaGateReason();
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="전략·잔고·미체결" />;
  }

  return (
    <SurfacePlaceholder
      title="My page"
      subtitle={{ text: "전략 현황 · 미체결 · 잔고" }}
    />
  );
}
