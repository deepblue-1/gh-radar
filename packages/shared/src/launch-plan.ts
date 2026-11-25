/**
 * Phase 35 범위 7 — 발사 계획 어드민 계약 (D-24 ~ D-35).
 *
 * - server ↔ webapp(`/api/admin/launch/plan`)과 relay ↔ server(`/internal/admin/launch-plan`)가 **같은 snake_case
 *   모양**을 쓴다(D-20 결 — 매퍼 없음). 이력 행은 `launch_plan_changes` 표(마이그레이션 20261028200100)를
 *   기록/읽기 RPC 가 `to_jsonb` 로 싣는 열 이름 그대로다.
 * - gh-trade 44(admin 명령) · 94(계획 스냅샷) 인코드 · 파스는 relay 몫(35-16)이다. 이 모듈은 와이어 번호(op · MsgType)도
 *   서버 거부 문구도 모른다 — **「서버 1대의 계획(Q16/N × K/Q + 08:30 스위치 켠 서버의 G2/K · G2/Q)」** 이라는
 *   우리 쪽 의미만 담는다(G2 = quick-261125-c2i · 인박스 `261125-sigan-ttaeng-g2`).
 * - 쓰는 쪽 = server(요청자 이메일 · relay 도달 실패 시도도 1행 · D-29). relay 는 이 경로에서 DB 무관.
 * - 탐침(정각 기준 시장별 µs 목록 · quick-261125-lju)도 같은 계약에 얹는다 — 아래 「탐침」 절(gh-trade 답신 최종 계약).
 */
import type { AdminOutcome, AdminServerResult } from "./admin";
import {
  LAUNCH_SERVERS,
  launchRibbonAt,
  type LaunchDay,
  type LaunchFire,
  type LaunchMarket,
  type LaunchRibbonCell,
} from "./launch";

// ─────────────────────────────────────────────────────────────────────────────
// 축 — 프로파일 · 대상 서버
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 계획 프로파일 목록 한 벌 — Q16 = 16:00 예약 · N = 09:00:30 개장차익(NXT) · G2 = 08:30 장개시전 시간외종가 예약.
 * 94 entries 에는 08:30 스위치를 켠 서버만 G2/K · G2/Q 행이 있다(인박스 261125-sigan-ttaeng-g2 ⓑ — 꺼진 서버 · 구 서버는
 * 행 없음 = 이 서버는 08:30 발사를 모름). relay zod · 94 행 거르기가 이 배열을 그대로 쓴다.
 */
export const LAUNCH_PLAN_PROFILES = ["Q16", "N", "G2"] as const;
export type LaunchPlanProfile = (typeof LAUNCH_PLAN_PROFILES)[number];

/**
 * 계획 대상 서버 = 발사 서버 한 벌(`LAUNCH_SERVERS` — KB120 · KYOBO119 · KYOBO112 · quick-261107-iep). 목록을 다시 적지 않는다.
 * - KB121 은 대상이 아니다(gh-trade 43 D-02 · 꺼진 서버).
 * - KYOBO112 는 119 사본 같은 빌드라 44/94 를 받는다 — 못 받으면 relay 결과 failed 경로로 보인다.
 */
export const LAUNCH_PLAN_GATEWAYS = LAUNCH_SERVERS;
export type LaunchPlanGateway = (typeof LAUNCH_PLAN_GATEWAYS)[number];

/** 지도 발사 기준 → 계획 프로파일 — 완전 매핑(다음 fire 가 생기면 여기서 컴파일 오류가 난다 · 조용히 N 으로 가지 않는다). */
const LAUNCH_PLAN_PROFILE_OF_FIRE: Record<LaunchFire, LaunchPlanProfile> = { q16: "Q16", n0930: "N", g0830: "G2" };

/** 지도 발사 기준 → 계획 프로파일. */
export function launchPlanProfileOf(fire: LaunchFire): LaunchPlanProfile {
  return LAUNCH_PLAN_PROFILE_OF_FIRE[fire];
}

// ─────────────────────────────────────────────────────────────────────────────
// 계획 — 서버 1대의 현재 값
// ─────────────────────────────────────────────────────────────────────────────

/** 계획 한 칸 — (프로파일, 시장) 의 발사 시각 목록(µs · 음수 = 앞당김). N · G2 는 1개. */
export interface LaunchPlanEntry {
  profile: LaunchPlanProfile;
  market: LaunchMarket;
  offsets_us: number[];
}

/** 서버 1대의 계획 조회 결과. ok 가 아니면 웹은 「대신 값」 경로(D-25). */
export type LaunchPlanServer =
  | {
      status: "ok";
      plan_rev: number | null;
      updated_at: string | null;
      entries: LaunchPlanEntry[];
      /**
       * 탐침 설정(quick-261125-lju · 아래 「탐침」 절) — 새 서버 = 시장별 4행(market · offsets_us) · 구 서버 = market 없는 개수 · 간격 행 ·
       * 없음 = relay 와이어 대기. 웹은 그 (profile, market) 목록이 없으면 읽기 전용.
       */
      tail_probes?: LaunchTailProbe[];
      /** 94 말미 bool — 교보 16:00 합친 레인 스위치 실제 값(KB 는 늘 false). 칸 없음 = 꺼짐(구 서버 · 파서 대기). */
      kyobo_q16_combined?: boolean;
    }
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
  /** 탐침 이력(quick-261107-l7w · 목록 칸 quick-261125-lju) — 구 server(이 칸 모름)는 없음 — 웹은 [] 로 읽는다. */
  tail_probe_changes?: LaunchTailProbeChangeRow[];
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
 * `maxSpanUs` = Q16 시각 목록 폭(마지막 − 첫) 상한 500µs — fix 노트 `docs/inbox/from-gh-trade/261028-launch-plan-fix.md`
 * (서버 「시각 목록 폭 상한 밖(마지막 − 첫 ≤ 500µs)」). N 은 한 칸이라 해당 없음(null).
 * 서버 설정이 바뀌면 이 한 곳만 고친다(웹 · relay · server 에 두 번째 숫자를 두지 않는다).
 * 조각 수 1~10 은 웹 스테퍼 한도(D-26)이고 서버 구조 상한(`LAUNCH_PLAN_SERVER_MAX_PIECES`)과 별개다.
 * g0830(G2) = 인박스 `261125-sigan-ttaeng-g2` ⓐ — 기준 08:30:00.000000 · −3000 ~ +20000µs · 길이 1 ·
 * 서버 초깃값 0µs(D-20 gh-trade) · 교보도 그 시장 칸만 저장.
 */
export const LAUNCH_PLAN_LIMITS: Record<
  LaunchFire,
  { minUs: number; maxUs: number; minPieces: number; maxPieces: number; maxSpanUs: number | null }
> = {
  q16: { minUs: -3000, maxUs: 1000, minPieces: 1, maxPieces: 10, maxSpanUs: 500 },
  n0930: { minUs: -2000, maxUs: 2000, minPieces: 1, maxPieces: 1, maxSpanUs: null },
  g0830: { minUs: -3000, maxUs: 20000, minPieces: 1, maxPieces: 1, maxSpanUs: null },
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
  | { ok: false; badIdx: number; kind: "count" | "int" | "range" | "span"; message: string };

const INT_RE = /^-?\d+$/;

/**
 * 편집 칸 원문(문자열) 검사 — 개수 → 칸마다(정수 → 범위) → 폭(가장 늦은 − 가장 이른 ≤ `maxSpanUs` · 위반이면 badIdx =
 * 가장 늦은 값의 칸) 순으로 첫 위반 하나만 돌려준다. 칸 순서는 자유 — 통과하면 `values` 는 이른 시각부터 정렬된 값이다.
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

  // 순서는 검사하지 않는다 — 칸은 아무 순서로 넣어도 되고 이른 시각부터 정렬한 값을 돌려준다(저장 · 미리보기는 정렬된 값 · fast-261125).
  // 폭 = 가장 늦은 − 가장 이른. 위반이면 badIdx = 가장 늦은 값이 든 칸(같은 값이 여럿이면 뒤 칸).
  const sorted = [...values].sort((a, b) => a - b);
  const span = sorted[sorted.length - 1]! - sorted[0]!;
  if (lim.maxSpanUs !== null && span > lim.maxSpanUs) {
    return {
      ok: false,
      badIdx: values.lastIndexOf(sorted[sorted.length - 1]!),
      kind: "span",
      message: `${label}은 가장 이른 조각과 가장 늦은 조각 차이가 ${lim.maxSpanUs}µs 이하여야 해요 — 지금 ${span}µs`,
    };
  }

  return { ok: true, values: sorted };
}

// ─────────────────────────────────────────────────────────────────────────────
// 계획 칸 · 「쐈다면」 판정(D-28)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 서버 계획에서 (fire, market) 한 칸의 상태(quick-261125-c2i).
 * - unknown = 계획을 못 읽음(서버 없음 · ok 아님)
 * - missing = ok 인데 (profile, market) 행이 없음
 * - set = 값 있음
 * missing 을 「이 서버는 08:30 발사를 모름」 으로 읽는 것은 g0830 뿐이다(94 에 G2 행은 08:30 스위치 켠 서버만 · 인박스 ⓑ) —
 * 그 판정은 웹 몫. q16 · n0930 의 missing 은 종전대로 대신 값 경로다.
 */
export type LaunchPlanEntryState =
  | { kind: "unknown" }
  | { kind: "missing" }
  | { kind: "set"; entry: LaunchPlanEntry };

export function launchPlanEntryStateOf(
  server: LaunchPlanServer | undefined,
  fire: LaunchFire,
  market: LaunchMarket,
): LaunchPlanEntryState {
  if (!server || server.status !== "ok") return { kind: "unknown" };
  const profile = launchPlanProfileOf(fire);
  const entry = server.entries.find((e) => e.profile === profile && e.market === market);
  return entry ? { kind: "set", entry } : { kind: "missing" };
}

/** 서버 계획에서 (fire, market) 한 칸. 서버가 ok 가 아니거나 칸이 없으면 null(웹은 대신 값 경로). */
export function launchPlanEntryOf(
  server: LaunchPlanServer | undefined,
  fire: LaunchFire,
  market: LaunchMarket,
): LaunchPlanEntry | null {
  const st = launchPlanEntryStateOf(server, fire, market);
  return st.kind === "set" ? st.entry : null;
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


// ─────────────────────────────────────────────────────────────────────────────
// 탐침 — (서버, 프로파일, 시장)별 정각 기준 µs 목록(quick-261125-lju · 앞선 개수 · 간격 계약 quick-261107-l7w 를 대체)
// ─────────────────────────────────────────────────────────────────────────────
//
// 출처: gh-trade 「러쉬주문 탐침」 답신 최종 계약(`.planning/quick/261125-lju-*/reference/gh-trade-replies.md` · 2026-11-25 정정 포함).
// - 값 = **정각 기준 부호 있는 µs 목록** — op 8 `launch_offsets_us` 와 같은 축(16:00:00.000000 · 09:00:30.000000).
//   kind 17 round −2 `planned_us` = 목록 값 그대로. 한도 = `LAUNCH_PLAN_LIMITS[fire].minUs/maxUs`(두 번째 숫자 없음).
// - 발 수 0 ~ 10(빈 목록 = 꺼짐) · 중복 허용 · 서버는 정렬하지 않는다(비감소 위반 = 86 code 1) — 웹이 오름차순으로 보낸다.
//   위치(실조각 앞 · 사이 · 뒤)는 서버도 웹도 따지지 않는다(사용자 결정 — 위치 경고 없음).
// - 시장별: 94 `tail_probes` 4행 [Q16·K, N·K, Q16·Q, N·Q] · 행 말미 `market` · `offsets_us`(구 칸 count = 길이 · step_us = 0).
//   구 서버는 market 없는 Q16 · N 두 행(개수 · 간격)만 준다 → 웹은 읽기 전용(unsupported · 옛 값 꼬리).
// - 교보 N = 공통 한 목록 — K · Q 어느 쪽으로 저장해도 두 행 같은 값(웹은 K 로 1건 · 계획 교보 N 공통 칸 규칙과 같다).
// - 저장 = 44 op 10 목록 모드(offsets 벡터 + count −1 + launch_market 필수) · plan_rev 는 계획과 공유(+1).
// - 교보 16:00 합친 레인 스위치 = 94 말미 bool `kyobo_q16_combined`(true 일 때만 켜짐 · 칸 없음 = 꺼짐 · KB 는 늘 false).
// - G2(08:30)는 탐침 대상이 아니다 — 인박스 261125-sigan-ttaeng-g2 ⓑ: tail_probes 에 G2 행 없음 · op 10 은 G2 대상 아님.
//   그래서 탐침 축(프로파일 · 발사 기준)은 계획 축보다 좁은 타입으로 따로 둔다(quick-261125-c2i L-2).

/** 탐침 프로파일 — Q16 · N 만(G2 없음). relay zod · 94 tail_probes 거르기가 이 배열을 쓴다. */
export const LAUNCH_TAIL_PROBE_PROFILES = ["Q16", "N"] as const satisfies readonly LaunchPlanProfile[];
export type LaunchTailProbeProfile = (typeof LAUNCH_TAIL_PROBE_PROFILES)[number];

/** 탐침 발사 기준 — q16 · n0930 만(g0830 없음). server zod 가 이 배열을 쓴다. */
export const LAUNCH_TAIL_PROBE_FIRES = ["q16", "n0930"] as const satisfies readonly LaunchFire[];
export type LaunchTailProbeFire = (typeof LAUNCH_TAIL_PROBE_FIRES)[number];

/** 이 발사 기준에 탐침이 있는가 — 웹이 탐침 줄 · 표식을 이 검사로만 그린다. */
export function isLaunchTailProbeFire(fire: LaunchFire): fire is LaunchTailProbeFire {
  return (LAUNCH_TAIL_PROBE_FIRES as readonly LaunchFire[]).includes(fire);
}

/** 탐침 발사 기준 → 탐침 프로파일. */
export function launchTailProbeProfileOf(fire: LaunchTailProbeFire): LaunchTailProbeProfile {
  return fire === "q16" ? "Q16" : "N";
}

/**
 * 94 `tail_probes` 한 행.
 * - 새 서버 행 = `market` · `offsets_us` 가 있다(count = 목록 길이 · step_us = 0).
 * - 옛 서버 행 = `market` · `offsets_us` 키가 없다(개수 · 간격 — 시장 공통).
 */
export interface LaunchTailProbe {
  profile: LaunchTailProbeProfile;
  count: number;
  step_us: number;
  market?: LaunchMarket;
  /** 정각 기준 µs 목록(서버 순서 그대로 · 빈 배열 = 꺼짐). market 이 있는 행만. */
  offsets_us?: number[];
}

/** 옛 탐침 값(개수 · 간격) — 구 서버 행 · 옛 이력 행 표시용. */
export interface LaunchTailProbeValue {
  count: number;
  step_us: number;
}

/** 탐침 발 수 상한(0 ~ 10 · 0 = 꺼짐). 범위 한도는 `LAUNCH_PLAN_LIMITS[fire]` 를 그대로 쓴다. */
export const LAUNCH_TAIL_PROBE_MAX_SHOTS = 10;

const CHIP_RE = /^\+?\d+$/;

/**
 * 칩 원문 → 정각 기준 µs. 앞뒤 공백은 자른다. `+숫자` = 정각 뒤(양수) · 숫자만 = 정각 앞(음수) · `0` · `+0` = 0.
 * 그 밖(빈 문자열 · `+` 만 · `-5` · 소수 · `1+2`)은 null.
 */
export function parseLaunchTailProbeChip(raw: string): number | null {
  const s = raw.trim();
  if (!CHIP_RE.test(s)) return null;
  const n = Number(s.startsWith("+") ? s.slice(1) : s);
  if (!Number.isSafeInteger(n)) return null;
  if (n === 0) return 0;
  return s.startsWith("+") ? n : -n;
}

/** µs → 칩 원문(`parseLaunchTailProbeChip` 의 역) — 양수 `+v` · 0 「0」 · 음수 절댓값 숫자. */
export function launchTailProbeChipText(v: number): string {
  if (v > 0) return `+${v}`;
  if (v === 0) return "0";
  return String(Math.abs(v));
}

/** 검증 문구용 부호 있는 µs — 음수 U+2212 + 절댓값 · 양수 `+v` · 0 「0」. */
function signedUsText(v: number): string {
  return v > 0 ? `+${v}` : launchPlanUsText(v);
}

/** 탐침 초안 검사 결과 — badIdx 는 위반 칸 전부(0부터 · 오름차순 · 개수 위반은 빈 배열). message 는 칸 순서로 첫 위반 문구. */
export type LaunchTailProbeDraftCheck =
  | { ok: true; values: number[] }
  | { ok: false; kind: "count" | "int" | "range"; badIdx: number[]; message: string };

/**
 * 탐침 칩 원문 배열 검사 — 개수(> 10) → 칸마다(칩 파스 → 범위 `LAUNCH_PLAN_LIMITS[fire]`). 위치 검사는 없다(사용자 결정).
 * 통과하면 `values` = 이른 시각부터 정렬한 값(중복 유지 — 저장 값). 빈 배열 = 꺼짐(ok).
 */
export function validateLaunchTailProbeDraft(fire: LaunchTailProbeFire, raw: readonly string[]): LaunchTailProbeDraftCheck {
  if (raw.length > LAUNCH_TAIL_PROBE_MAX_SHOTS) {
    return { ok: false, kind: "count", badIdx: [], message: `탐침은 0 ~ ${LAUNCH_TAIL_PROBE_MAX_SHOTS}발이에요` };
  }
  const lim = LAUNCH_PLAN_LIMITS[fire];
  const values: number[] = [];
  const badIdx: number[] = [];
  let first: { kind: "int" | "range"; message: string } | null = null;
  for (let i = 0; i < raw.length; i++) {
    const v = parseLaunchTailProbeChip(raw[i]!);
    if (v === null) {
      badIdx.push(i);
      first ??= { kind: "int", message: `탐침 시각은 숫자만 써요 — 정각 뒤는 앞에 + (${i + 1}번)` };
    } else if (v < lim.minUs || v > lim.maxUs) {
      badIdx.push(i);
      first ??= {
        kind: "range",
        message: `탐침 시각은 ${signedUsText(lim.minUs)} ~ ${signedUsText(lim.maxUs)}µs 사이여야 해요`,
      };
    } else {
      values.push(v);
    }
  }
  if (first !== null) return { ok: false, kind: first.kind, badIdx, message: first.message };
  return { ok: true, values: values.sort((a, b) => a - b) };
}

/**
 * 전체 이동 — 칸 순서 그대로 v + delta 의 칩 원문 배열(정렬하지 않는다 — 입력 중 칩 자리 불변).
 * 초안이 비었거나 · 검증 실패거나 · 한 발이라도 한도 밖으로 나가면 null(웹 버튼 비활성 판정 = 이 함수 하나).
 */
export function shiftLaunchTailProbeDraft(
  fire: LaunchTailProbeFire,
  raw: readonly string[],
  delta: number,
): string[] | null {
  if (raw.length === 0) return null;
  if (!validateLaunchTailProbeDraft(fire, raw).ok) return null;
  const lim = LAUNCH_PLAN_LIMITS[fire];
  const out: string[] = [];
  for (const r of raw) {
    const v = parseLaunchTailProbeChip(r)! + delta;
    if (v < lim.minUs || v > lim.maxUs) return null;
    out.push(launchTailProbeChipText(v));
  }
  return out;
}

/**
 * 서버 1대 · 발사 기준 · 시장 하나의 탐침 상태.
 * - unknown = 계획을 못 읽음(서버 없음 · ok 아님)
 * - set = 그 (profile, market) 행에 `offsets_us` 가 있다(빈 배열 = 꺼짐)
 * - unsupported = 그 행이 없다(구 서버 · relay 와이어 대기) — market 없는 옛 행이 있으면 첫 행의 개수 · 간격(`legacy`), 없으면 null
 * 같은 profile 이 market 없이 여러 행이어도(새 서버를 지금 파서로 읽은 모양) 첫 행만 본다.
 */
export type LaunchTailProbeState =
  | { kind: "unknown" }
  | { kind: "unsupported"; legacy: LaunchTailProbeValue | null }
  | { kind: "set"; offsets_us: number[] };

export function launchTailProbeStateOf(
  server: LaunchPlanServer | undefined,
  fire: LaunchTailProbeFire,
  market: LaunchMarket,
): LaunchTailProbeState {
  if (!server || server.status !== "ok") return { kind: "unknown" };
  const profile = launchTailProbeProfileOf(fire);
  const rows = server.tail_probes ?? [];
  const row = rows.find((t) => t.profile === profile && t.market === market && Array.isArray(t.offsets_us));
  if (row) return { kind: "set", offsets_us: [...row.offsets_us!] };
  const legacy = rows.find((t) => t.profile === profile && t.market === undefined);
  return { kind: "unsupported", legacy: legacy ? { count: legacy.count, step_us: legacy.step_us } : null };
}

/**
 * 이력 — launch_tail_probe_changes 한 행(시도마다 1행 · 실패 포함 · 계획 이력 D-29 와 같은 규칙).
 * 목록 행(market · after_offsets_us 있음)과 옛 행(개수 · 간격 · market null)이 한 표에 섞인다.
 */
export interface LaunchTailProbeChangeRow {
  id: number;
  /** timestamptz ISO 문자열 */
  at: string;
  admin_email: string;
  gateway: string;
  /** q16 | n0930 — launch_tail_probe_changes CHECK 그대로(g0830 없음). */
  fire: LaunchTailProbeFire;
  /** 목록 행의 시장(교보 N 공통은 K) · 옛 행 null */
  market: LaunchMarket | null;
  /** 옛 행 — 저장 직전 서버 조회값 · 모르면 null */
  before_count: number | null;
  before_step_us: number | null;
  /** 옛 행 — 보낸 값 · 목록 행 null */
  after_count: number | null;
  after_step_us: number | null;
  /** 목록 행 — 저장 직전 서버 조회값 · 모르면 null */
  before_offsets_us: number[] | null;
  /** 목록 행 — 보낸 값(빈 배열 = 꺼짐) · 옛 행 null */
  after_offsets_us: number[] | null;
  outcome: AdminOutcome;
  code: number | null;
  message: string | null;
  /** 성공 뒤 계획 리비전(모르면 null) */
  plan_rev: number | null;
}

/** 이력 행 열 이름 — 기록 RPC 반환 jsonb 키와 같다(pgTAP 이 같은 16개를 단언 · 계약 핀). */
export const LAUNCH_TAIL_PROBE_CHANGE_COLUMNS = [
  "id",
  "at",
  "admin_email",
  "gateway",
  "fire",
  "market",
  "before_count",
  "before_step_us",
  "after_count",
  "after_step_us",
  "before_offsets_us",
  "after_offsets_us",
  "outcome",
  "code",
  "message",
  "plan_rev",
] as const satisfies readonly (keyof LaunchTailProbeChangeRow)[];

/** `PUT /api/admin/launch/tail-probe/:gateway/:fire` 바디 — 저장 시장 · 정렬된 목록(교보 N 은 K 로 1건). */
export interface LaunchTailProbeSaveBody {
  market: LaunchMarket;
  offsets_us: number[];
}

/** 탐침 저장 응답 — 결과 + 저장 뒤 다시 읽은 계획(tail_probes 포함) + 기록된 이력 행(기록 실패면 null). */
export interface LaunchTailProbeSaveResponse {
  result: AdminServerResult;
  plan: LaunchPlanServer | null;
  change: LaunchTailProbeChangeRow | null;
}

/** relay `PUT /internal/admin/launch-tail-probe/:server` 바디. */
export interface LaunchTailProbeRelaySetBody {
  profile: LaunchTailProbeProfile;
  market: LaunchMarket;
  offsets_us: number[];
}

/** relay 탐침 저장 응답 — 저장 직전 그 (profile, market) 목록(before · 모르면 null)과 저장 뒤 다시 읽은 계획. */
export interface LaunchTailProbeRelaySetResponse {
  result: AdminServerResult;
  before: number[] | null;
  plan: LaunchPlanServer | null;
}
