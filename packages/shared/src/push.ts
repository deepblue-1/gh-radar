/**
 * Phase 40 — 체결 앱 푸시 계약(타입 · 상수 한 벌).
 *
 * 이 계약을 쓰는 곳:
 * - 40-01 DB 표 `dma_push_devices` · `dma_push_log` — `PushPlatform` · `PushStage` 문자열이 CHECK 와 같다.
 *   기기 목록 RPC 원소 키 = `PushDevice`(camelCase · token 없음).
 * - 40-05 판정 RPC `dma_push_claim` — 돌려주는 사실 jsonb 키 = `PushFacts` · `PushAutoSellFacts` camelCase 키.
 * - 40-06 relay 송신기 — 사실을 그대로 `pushMessageOf`(push-message.ts)에 넣고 채널 · 탭 경로 · 묶음 키를 여기서 읽는다.
 * - 40-07 server `/api/push-devices` — `PushDevice` · `PushDeviceRegisterBody`.
 * - 40-10 웹 기기 카드 · 탭 처리기 — `PushDevice` · `PUSH_ORDER_LOG_PATH`.
 *
 * **계좌 칸은 없다(SC-4 · T-19-14 동형).** 사실 · 기기 어느 타입에도 계좌번호 자리가 없어서
 * 푸시 제목 · 본문 · payload 로 계좌가 새어 나갈 길이 구조적으로 없다. 키를 바꾸면 40-01 · 40-05 · 40-06 이 갈라진다.
 */

/** 푸시 기기 플랫폼 — 40-01 `dma_push_devices.platform` CHECK 와 같다. */
export type PushPlatform = "ios" | "android";

/** 기기 목록 원소 — 40-01 RPC(`dma_push_device_upsert` · `dma_push_devices_for_user`) 반환 키와 같다. token 은 내보내지 않는다. */
export type PushDevice = {
  deviceKey: string;
  platform: PushPlatform;
  label: string;
  enabled: boolean;
  lastSeenAt: string;
  createdAt: string;
};

/** 앱 「이 기기 켜기」 등록 본문(server PUT `/api/push-devices/:deviceKey`). */
export type PushDeviceRegisterBody = {
  platform: PushPlatform;
  token: string;
  label: string;
};

/**
 * 앱 로그인 뒤 이 폰 정리 본문(server POST `/api/push-devices/handover` · 리뷰 WR-07). 이 폰의 토큰 · 기기 키를 가진
 * 「지금 사용자 ∧ 지금 기기 키」 밖의 행을 지운다. 기기 키가 null 이면(로그아웃 정리 실패로 버렸다) 같은 토큰의 내 옛 행도.
 */
export type PushDeviceHandoverBody = {
  token: string;
  deviceKey: string | null;
};

/**
 * 푸시 7단계(D-01) — 40-01 `dma_push_log.stage` CHECK · 40-05 RPC 가 쓰는 문자열과 같다.
 * 접수 · 첫 체결 · 전량 체결 · 거부 · 서버 자동 취소 · 자동매도 시작 · 자동매도 완료.
 */
export const PUSH_STAGES = [
  "accepted",
  "first_fill",
  "filled",
  "rejected",
  "cancelled",
  "autosell_start",
  "autosell_done",
] as const;

export type PushStage = (typeof PUSH_STAGES)[number];

/** 자동매도 사실(⑥ 시작 · ⑦ 완료) — kind 11 · 13 과 relay 계좌 캐시에서 온다. */
export type PushAutoSellFacts = {
  /** queue_case — 1 상한가 · 2 매수가(낱말은 `autoSellBasisLabel`). */
  basis: number;
  /** kind 11 bid1_price — 기준 가격(0 = 모름). */
  basePrice: number;
  /** kind 11 price — 발동가(0 = 모름). */
  triggerPrice: number;
  /** kind 13 qty — 누적 매도 수량. */
  soldQty: number;
  avgSellPrice: number | null;
  /** 평균 매수가 대비 실현 손익 %(D-23 · 40-05 가 계산). */
  pnlPct: number | null;
  /** D-25 — relay 계좌 캐시에 값이 있을 때만. */
  holdingQty?: number;
  holdingAvgPrice?: number;
};

/** 판정 RPC(40-05)가 돌려주는 사건 사실 한 건. 계좌 칸 없음(SC-4). */
export type PushFacts = {
  stage: PushStage;
  isin: string;
  stockName: string | null;
  stockCode: string | null;
  exchange: "KRX" | "NXT" | "";
  /** YYYY-MM-DD(KST 거래일). */
  tradeDate: string;
  /** 사건 시각 epoch ms. */
  gwTimeMs: number;
  side: "B" | "S" | null;
  /** OrderGroup — kind 3/6 짝(D-03). */
  group: number | null;
  origin: "manual" | "limit_chaser" | "vi" | null;
  /** 루트 주문 수량. */
  qty: number | null;
  /** 주문 가격. */
  price: number | null;
  /** 체인 누적 체결 수량. */
  filledQty: number;
  lastFillPrice: number | null;
  avgFillPrice: number | null;
  cancelledQty: number | null;
  cancelReason: number | null;
  /** 게이트웨이 사유 원문(거부 · D-04). */
  message: string | null;
  autosell: PushAutoSellFacts | null;
};

/** Android 알림 채널 — 1개(D-18). */
export const PUSH_CHANNEL_ID = "fills";
export const PUSH_CHANNEL_NAME = "체결 알림";

/** 탭 착지 화면(D-21) — 쿼리 `stock` · `date` 는 `pushTapPathOf` 가 붙인다. */
export const PUSH_ORDER_LOG_PATH = "/trading/order-log";
