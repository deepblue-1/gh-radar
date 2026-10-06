import { REFLECT_LABEL, type ReflectTone } from "@gh-radar/shared";

import { cn } from "@/lib/utils";

/**
 * ReflectChip — 서버 1대의 users.toml 반영 상태 칩 (Phase 29 D-05 · D-14 · 목업 A `srvChips()`).
 *
 * 문구 규칙(목업 `STL`): 반영됨이면 **서버 키만**, 그 밖은 「키 · 상태」 — 「KB121 · 미반영」 ·
 * 「KB121 · 실패 · BUSY」 · 「KYOBO119 · 서버에만 있음」. 상태 낱말은 shared `REFLECT_LABEL` 한 벌이다.
 * 실패(err)의 상세는 서버가 준 한국어 message 원문을 `title` 로 싣는다(D-23 ④ — 다시 쓰지 않는다).
 *
 * 색은 기존 토큰만 쓴다(새 색 토큰 0): ok `--led-armed` · warn `--led-latent` · err `--destructive` ·
 * only `--faint` 글자 + 점선 테두리(흐림). 면은 `limit-chaser-defaults` 칩과 같은 `color-mix` 결.
 */

/** 칩 공통 모양 — 목업 `.ch`(11px/600 · 2px 6px · r5). 역할 · 승인 대기 · 「웹 유저 없음」 칩도 같은 틀. */
export const ADMIN_CHIP_BASE =
  "inline-block rounded-[5px] px-1.5 py-0.5 text-[11px] leading-[1.4] font-semibold whitespace-nowrap";

/** 톤 → 면 · 글자색(목업 `.ch.ok/.warn/.err/.dim`). */
export const ADMIN_TONE_CLASS: Readonly<Record<ReflectTone, string>> = {
  ok: "bg-[color-mix(in_srgb,var(--led-armed)_16%,transparent)] text-[var(--led-armed)]",
  warn: "bg-[color-mix(in_srgb,var(--led-latent)_18%,transparent)] text-[var(--led-latent)]",
  err: "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[var(--destructive)]",
  only: "border border-dashed border-[var(--border-subtle)] bg-transparent py-px text-[var(--faint)]",
};

/** 칩 글자 — 반영됨은 키만(목업 `v==='ok'?'':' · '+STL[v]`). */
export function reflectChipText(serverKey: string, tone: ReflectTone): string {
  return tone === "ok" ? serverKey : `${serverKey} · ${REFLECT_LABEL[tone]}`;
}

export interface ReflectChipProps {
  serverKey: string;
  tone: ReflectTone;
  /** err 일 때 서버 message 원문 — 그 밖은 null. */
  message?: string | null;
  className?: string;
}

export function ReflectChip({ serverKey, tone, message = null, className }: ReflectChipProps) {
  return (
    <span
      data-slot="reflect-chip"
      data-tone={tone}
      data-server={serverKey}
      title={message ?? undefined}
      className={cn(ADMIN_CHIP_BASE, ADMIN_TONE_CLASS[tone], className)}
    >
      {reflectChipText(serverKey, tone)}
    </span>
  );
}
