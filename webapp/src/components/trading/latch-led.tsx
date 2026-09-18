"use client";

import type { RelayLimitChaser } from "@gh-radar/shared";

/**
 * Phase 17 Plan 07 — 상따 3단계 래치 LED (매수·매도·취소).
 *
 * ⚠️ **RED 스켈레톤이다** (17-07 Task 3 · TDD). 타입과 서명만 있고 판정 규칙은
 *    아직 구현하지 않았다 — `__tests__/latch-led.test.tsx` 가 실패하는 것이 의도다.
 */

/** LED 3종. */
export type LatchLedKind = "buy" | "sell" | "cancel";

/** 색 단계. `off`=무장 아님(회색) · `latent`=잠복(주황) · `armed`=래치 ON(초록). */
export type LatchLedTone = "off" | "latent" | "armed";

/** 보이는 상태 라벨 (D-21 채택안). */
export type LatchLedLabel = "OFF" | "대기" | "감시";

/** 판정 결과 1건. */
export interface LatchLedState {
  tone: LatchLedTone;
  clickable: boolean;
  label: LatchLedLabel;
  note: string;
  tooltip: string | null;
}

/**
 * 판정 근거 — **마지막 서버 에코 스냅샷 하나**다 (D-20). `hadOrder` 는 와이어 필드가
 * 아니라 화면이 주문 통보로 아는 사실이라 호출부가 얹어 준다(`strategyBadgesOf` 동형).
 */
export type LatchLedServer = (RelayLimitChaser & { hadOrder?: boolean }) | null;

export function latchLedStateOf(
  kind: LatchLedKind,
  server: LatchLedServer,
): LatchLedState {
  // RED 스켈레톤 — 규칙 미구현. GREEN 에서 C# `LimitChaserForm` 정본으로 채운다.
  void kind;
  void server;
  return { tone: "off", clickable: false, label: "OFF", note: "", tooltip: null };
}

export interface LatchLedProps {
  kind: LatchLedKind;
  server: LatchLedServer;
  onArm?: (kind: LatchLedKind) => void;
  className?: string;
}

export function LatchLed(props: LatchLedProps): React.ReactElement | null {
  // RED 스켈레톤 — 렌더 미구현.
  void props;
  return null;
}
