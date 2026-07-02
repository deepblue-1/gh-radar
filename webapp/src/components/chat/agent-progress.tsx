"use client";

/**
 * Phase 14 Plan 09 — 진행 스텝퍼 (C5, CHAT-01, D-04, 채택 = Variant B).
 *
 * 팀장이 전문가 5명(SpecialistId)에게 tool-use 로 위임하는 동안의 진행 상태를 세로
 * 스텝퍼로 표시한다. done ✓(`--up-bg`) / active ●(`--primary`, blink) / wait ○.
 * 라벨은 SPECIALIST_LABELS(한글). Copywriting: active 스텝은 `{전문가} 분석 중…`.
 *
 * SSE 매핑: agent_start → 해당 agent "active", agent_end → "done" (상태 관리는 chat-sheet,
 * 본 컴포넌트는 표시만). aria-live="polite" 로 스크린리더에 단계 진행을 고지.
 * blink 는 `motion-safe:` 로 prefers-reduced-motion 존중(전역 규칙).
 *
 * status 는 부분 map — 아직 미착수 전문가는 키 자체가 없다(스텝 미표시).
 */

import type { SpecialistId } from "@gh-radar/shared";
import { SPECIALIST_LABELS } from "@gh-radar/shared";

export type AgentStepStatus = "done" | "active" | "wait";

export interface AgentProgressProps {
  status: Partial<Record<SpecialistId, AgentStepStatus>>;
}

/** 스텝 표시 순서(팀장 위임 자연 순서). */
const STEP_ORDER: SpecialistId[] = [
  "quote",
  "theme",
  "news",
  "limitup",
  "websearch",
];

const DOT_CLASS: Record<AgentStepStatus, string> = {
  done: "bg-[var(--up-bg)] text-[var(--up)]",
  active: "bg-[var(--primary)] text-[var(--primary-fg)] motion-safe:animate-pulse",
  wait: "border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-fg)]",
};

const DOT_MARK: Record<AgentStepStatus, string> = {
  done: "✓",
  active: "●",
  wait: "",
};

export function AgentProgress({ status }: AgentProgressProps) {
  const steps = STEP_ORDER.filter((id) => status[id] != null);
  if (steps.length === 0) return null;

  return (
    <div
      className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-3)]"
      aria-live="polite"
    >
      <div className="mb-[var(--s-2)] text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
        전문가 팀 분석 중
      </div>
      <ul className="flex flex-col">
        {steps.map((id) => {
          const state = status[id] as AgentStepStatus;
          const label = SPECIALIST_LABELS[id];
          return (
            <li
              key={id}
              className={`flex items-center gap-[var(--s-2)] py-[3px] text-[length:var(--t-sm)] ${
                state === "active"
                  ? "font-semibold text-[var(--fg)]"
                  : "text-[var(--muted-fg)]"
              } ${state === "wait" ? "opacity-60" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] ${DOT_CLASS[state]}`}
              >
                {DOT_MARK[state]}
              </span>
              <span>{state === "active" ? `${label} 분석 중…` : label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
