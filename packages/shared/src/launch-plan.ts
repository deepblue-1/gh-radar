/**
 * Phase 35 범위 7 — 발사 계획 어드민 계약 (D-24 ~ D-35).
 *
 * - server ↔ webapp(`/api/admin/launch/plan`)과 relay ↔ server(`/internal/admin/launch-plan`)가 **같은 snake_case
 *   모양**을 쓴다(D-20 결 — 매퍼 없음). 이력 행은 `launch_plan_changes` 표(마이그레이션 20261028200100)를
 *   기록/읽기 RPC 가 `to_jsonb` 로 싣는 열 이름 그대로다.
 * - gh-trade 44(admin 명령) · 94(계획 스냅샷) 인코드 · 파스는 relay 몫(35-16)이다. 이 모듈은 와이어 번호(op · MsgType)도
 *   서버 거부 문구도 모른다 — **「서버 1대의 4칸 계획(Q16/N × K/Q)」** 이라는 우리 쪽 의미만 담는다.
 * - 쓰는 쪽 = server(요청자 이메일 · relay 도달 실패 시도도 1행 · D-29). relay 는 이 경로에서 DB 무관.
 */
import type { AdminOutcome, AdminServerResult } from "./admin";
import type { LaunchFire, LaunchMarket } from "./launch";

// ─────────────────────────────────────────────────────────────────────────────
// 축 — 프로파일 · 대상 서버
// ─────────────────────────────────────────────────────────────────────────────

/** 계획 프로파일 — Q16 = 16:00 예약 · N = 09:00:30 개장차익(NXT). */
export type LaunchPlanProfile = "Q16" | "N";

/**
 * 계획 대상 서버 — `LAUNCH_ORDER` 의 서버 키 순서 그대로. KB121 · KYOBO127 은 대상이 아니다(gh-trade 43 D-02).
 */
export const LAUNCH_PLAN_GATEWAYS = ["KB120", "KYOBO119"] as const;
export type LaunchPlanGateway = (typeof LAUNCH_PLAN_GATEWAYS)[number];

/** 지도 발사 기준 → 계획 프로파일. */
export function launchPlanProfileOf(fire: LaunchFire): LaunchPlanProfile {
  return fire === "q16" ? "Q16" : "N";
}

// ─────────────────────────────────────────────────────────────────────────────
// 계획 — 서버 1대의 현재 값
// ─────────────────────────────────────────────────────────────────────────────

/** 계획 한 칸 — (프로파일, 시장) 의 발사 시각 목록(µs · 음수 = 앞당김). N 은 1개. */
export interface LaunchPlanEntry {
  profile: LaunchPlanProfile;
  market: LaunchMarket;
  offsets_us: number[];
}

/** 서버 1대의 계획 조회 결과. ok 가 아니면 웹은 「대신 값」 경로(D-25). */
export type LaunchPlanServer =
  | { status: "ok"; plan_rev: number | null; updated_at: string | null; entries: LaunchPlanEntry[] }
  | { status: "failed"; code: number; message: string }
  | { status: "offline" | "timeout" | "skipped"; message?: string };

// ─────────────────────────────────────────────────────────────────────────────
// 이력 — launch_plan_changes 한 행(D-29 · 시도마다 1행 · 실패 포함)
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchPlanChangeRow {
  id: number;
  /** timestamptz ISO 문자열 */
  at: string;
  admin_email: string;
  gateway: string;
  fire: LaunchFire;
  market: LaunchMarket;
  /** 저장 직전 서버 조회값 · 모르면 null */
  before_us: number[] | null;
  /** 보낸 값 */
  after_us: number[];
  outcome: AdminOutcome;
  code: number | null;
  message: string | null;
  /** 성공 뒤 계획 리비전(모르면 null) */
  plan_rev: number | null;
}

/** 이력 행 열 이름 — 기록 RPC 반환 jsonb 키와 같다(pgTAP 이 같은 12개를 단언 · 계약 핀). */
export const LAUNCH_PLAN_CHANGE_COLUMNS = [
  "id",
  "at",
  "admin_email",
  "gateway",
  "fire",
  "market",
  "before_us",
  "after_us",
  "outcome",
  "code",
  "message",
  "plan_rev",
] as const satisfies readonly (keyof LaunchPlanChangeRow)[];

// ─────────────────────────────────────────────────────────────────────────────
// 요청 · 응답 — webapp ↔ server · server ↔ relay
// ─────────────────────────────────────────────────────────────────────────────

/** `GET /api/admin/launch/plan` — 서버별 계획 + 조합별 최근 이력(+ 마지막 ok). */
export interface LaunchPlanResponse {
  servers: Record<string, LaunchPlanServer>;
  changes: LaunchPlanChangeRow[];
}

/** `PUT /api/admin/launch/plan/:gateway/:fire/:market` 바디. */
export interface LaunchPlanSaveBody {
  offsets_us: number[];
}

/** 저장 응답 — 결과 + 저장 뒤 다시 읽은 계획 + 기록된 이력 행(기록 실패면 null). */
export interface LaunchPlanSaveResponse {
  result: AdminServerResult;
  plan: LaunchPlanServer | null;
  change: LaunchPlanChangeRow | null;
}

/** relay `GET /internal/admin/launch-plan?servers=` 응답. */
export interface LaunchPlanRelayReadResponse {
  servers: Record<string, LaunchPlanServer>;
}

/** relay `PUT /internal/admin/launch-plan/:server` 바디. */
export interface LaunchPlanRelaySetBody {
  profile: LaunchPlanProfile;
  market: LaunchMarket;
  offsets_us: number[];
}

/** relay 저장 응답 — 저장 직전 값(before_us)과 저장 뒤 다시 읽은 계획. */
export interface LaunchPlanRelaySetResponse {
  result: AdminServerResult;
  before_us: number[] | null;
  plan: LaunchPlanServer | null;
}
