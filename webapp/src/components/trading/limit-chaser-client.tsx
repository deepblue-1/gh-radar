"use client";

import { DmaGate, useDmaGateReason } from "./dma-gate";
import { SurfacePlaceholder } from "./surface-placeholder";

/**
 * 상따 전략 화면 클라이언트 — Plan 11 에서는 **게이트 분기 + 제목/부제**만 세운다.
 * 폼·호가·상태줄·로그는 16-13 이 이 파일을 채우며 붙인다.
 *
 * 라우트 2개가 이 하나를 쓴다:
 *   `/trading/limit-chaser/new`   → `strategyKey` 없음 (빈 폼)
 *   `/trading/limit-chaser/[key]` → `strategyKey` = 디코드된 `{ISIN}:{accountNo}:{exchange}`
 */
export interface LimitChaserClientProps {
  /** 편집 대상 전략 키. 신규(빈 폼)면 넘기지 않는다. */
  strategyKey?: string;
}

export function LimitChaserClient({ strategyKey }: LimitChaserClientProps) {
  const gateReason = useDmaGateReason();
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="상따 전략" />;
  }

  // 편집 화면 제목은 `{종목명} · {거래소}` 다(UI-SPEC §페이지 제목). 종목명은 전역 전략
  // 스냅샷에 없고 relay 역매핑이 잔고·미체결에만 실어 주므로, 결선은 16-13 이 한다.
  // 그때까지는 키에서 읽어낼 수 있는 것(거래소)만 제목에 쓰고 키 전체를 부제에 둔다.
  if (strategyKey !== undefined) {
    const exchange = strategyKey.split(":").at(2) ?? "";
    return (
      <SurfacePlaceholder
        title={exchange === "" ? "상따" : `상따 · ${exchange}`}
        subtitle={{ text: strategyKey, mono: true }}
      />
    );
  }

  return (
    <SurfacePlaceholder
      title="상따"
      subtitle={{ text: "종목을 고르면 아래 값이 상한가 기준으로 채워져요" }}
    />
  );
}
