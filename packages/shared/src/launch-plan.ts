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
import { launchRibbonAt, type LaunchDay, type LaunchFire, type LaunchMarket, type LaunchRibbonCell } from "./launch";

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

// ─────────────────────────────────────────────────────────────────────────────
// 편집 검증 — 웹 편집 칸이 저장 전에 막는다(D-26 · D-34)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 발사 기준별 편집 한도 — D-34 · **정식 노트 `docs/inbox/from-gh-trade/261028-launch-plan-contract.md` 와 일치 확인**(35-19).
 * 노트 ⓒ 의 119/120 서버 설정값: Q16 클램프 −3000~1000µs · `max_pieces` 10(조각 1~10) · N ±2000µs · 길이 1.
 * 서버 설정이 바뀌면 이 한 곳만 고친다(웹 · relay · server 에 두 번째 숫자를 두지 않는다).
 * 조각 수 1~10 은 웹 스테퍼 한도(D-26)이고 서버 구조 상한(`LAUNCH_PLAN_SERVER_MAX_PIECES`)과 별개다.
 */
export const LAUNCH_PLAN_LIMITS: Record<LaunchFire, { minUs: number; maxUs: number; minPieces: number; maxPieces: number }> =
  {
    q16: { minUs: -3000, maxUs: 1000, minPieces: 1, maxPieces: 10 },
    n0930: { minUs: -2000, maxUs: 2000, minPieces: 1, maxPieces: 1 },
  };

/** 서버 · relay zod 의 구조 상한(offsets_us 배열 길이). 사용자 한도는 `LAUNCH_PLAN_LIMITS`. */
export const LAUNCH_PLAN_SERVER_MAX_PIECES = 64;

/** 검증 문구용 µs 표기 — 음수는 U+2212 + 절댓값, 0 · 양수는 그대로(쉼표 · + 없음). 화면 값 표기는 웹 `fmtUs`. */
export function launchPlanUsText(v: number): string {
  return v < 0 ? `\u2212${Math.abs(v)}` : String(v);
}

/** 편집 초안 검사 결과 — badIdx 는 0부터(개수 위반은 -1 · 화면 번호 = badIdx + 1). */
export type LaunchPlanDraftCheck =
  | { ok: true; values: number[] }
  | { ok: false; badIdx: number; kind: "count" | "int" | "range" | "order"; message: string };

const INT_RE = /^-?\d+$/;

/**
 * 편집 칸 원문(문자열) 검사 — 개수 → 칸마다(정수 → 범위) → 순서(q16 만 · 같은 값 허용) 순으로 첫 위반 하나만 돌려준다.
 * 원문을 숫자로 바꾸기 전에 검사한다(웹이 입력 원문을 쥔다 · 앞뒤 공백은 잘라서 본다 · `+5` · 소수 · 지수는 정수 위반).
 */
export function validateLaunchPlanDraft(fire: LaunchFire, raw: readonly string[]): LaunchPlanDraftCheck {
  const lim = LAUNCH_PLAN_LIMITS[fire];
  const label = fire === "q16" ? "조각 시각" : "발사 시각";

  if (raw.length < lim.minPieces || raw.length > lim.maxPieces) {
    const message =
      lim.maxPieces === 1 ? `${label}은 한 값이에요` : `조각 수는 ${lim.minPieces} ~ ${lim.maxPieces} 사이여야 해요`;
    return { ok: false, badIdx: -1, kind: "count", message };
  }

  const values: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]!.trim();
    if (!INT_RE.test(s)) {
      return { ok: false, badIdx: i, kind: "int", message: `${label}은 정수 µs 여야 해요 — ${i + 1}번` };
    }
    const v = Number(s) || 0; // "-0" → 0
    if (v < lim.minUs || v > lim.maxUs) {
      return {
        ok: false,
        badIdx: i,
        kind: "range",
        message: `${label}은 ${launchPlanUsText(lim.minUs)} ~ ${launchPlanUsText(lim.maxUs)}µs 사이여야 해요`,
      };
    }
    values.push(v);
  }

  for (let i = 1; i < values.length; i++) {
    if (values[i]! < values[i - 1]!) {
      return {
        ok: false,
        badIdx: i,
        kind: "order",
        message:
          `${label}은 앞 조각과 같거나 늦어야 해요 — ${i + 1}번 ${launchPlanUsText(values[i]!)}µs 가 ` +
          `${i}번 ${launchPlanUsText(values[i - 1]!)}µs 보다 이릅니다`,
      };
    }
  }

  return { ok: true, values };
}

// ─────────────────────────────────────────────────────────────────────────────
// 계획 칸 · 「쐈다면」 판정(D-28)
// ─────────────────────────────────────────────────────────────────────────────

/** 서버 계획에서 (fire, market) 한 칸. 서버가 ok 가 아니거나 칸이 없으면 null(웹은 대신 값 경로). */
export function launchPlanEntryOf(
  server: LaunchPlanServer | undefined,
  fire: LaunchFire,
  market: LaunchMarket,
): LaunchPlanEntry | null {
  if (!server || server.status !== "ok") return null;
  const profile = launchPlanProfileOf(fire);
  return server.entries.find((e) => e.profile === profile && e.market === market) ?? null;
}

/** 미리보기 표 한 행 — 조각 idx(0부터 · 화면 번호 = idx + 1) · 지금 / 바꿀 값과 「지난 N일에 쐈다면」 셀. 없는 쪽은 null. */
export interface LaunchPlanVerdictRow {
  idx: number;
  cur: number | null;
  next: number | null;
  cur_cell: LaunchRibbonCell | null;
  next_cell: LaunchRibbonCell | null;
}

/** 지금 계획 · 바꿀 계획을 조각별로 나란히 — 셀은 리본 식 `launchRibbonAt` 그대로(D-28 · 같은 식 두 벌 금지). */
export function launchPlanVerdictRows(
  days: readonly LaunchDay<unknown>[],
  cur: readonly number[],
  next: readonly number[],
): LaunchPlanVerdictRow[] {
  const len = Math.max(cur.length, next.length);
  return Array.from({ length: len }, (_, idx) => {
    const c = idx < cur.length ? cur[idx]! : null;
    const n = idx < next.length ? next[idx]! : null;
    return {
      idx,
      cur: c,
      next: n,
      cur_cell: c === null ? null : launchRibbonAt(days, c),
      next_cell: n === null ? null : launchRibbonAt(days, n),
    };
  });
}
