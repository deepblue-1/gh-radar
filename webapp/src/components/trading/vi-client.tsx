"use client";

import { DmaGate, useDmaGateReason } from "./dma-gate";
import { SurfacePlaceholder } from "./surface-placeholder";

/**
 * VI 자동매수 화면 클라이언트 — Plan 11 에서는 **게이트 분기 + 제목/부제**만 세운다.
 * 설정 카드·시작/중지 확인 다이얼로그·VI 주문내역은 16-14 가 이 파일을 채우며 붙인다.
 */
export function ViClient() {
  const gateReason = useDmaGateReason();
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="VI 자동매수" />;
  }

  return (
    <SurfacePlaceholder
      title="VI 변동성완화 종합주문"
      subtitle={{ text: "VI 발동 종목을 상승률 조건으로 자동 매수" }}
    />
  );
}
