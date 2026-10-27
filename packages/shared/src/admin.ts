/**
 * Phase 29 (29-04) — Admin 계약과 판정 한 벌.
 *
 * D-05 「DB = 의도 · 87 = 반영」: Admin 이 DB 에 적은 의도(유저 · 계좌 · 계좌별 등록 서버)와 서버가 87
 * `AdminUsersSnapshot` 으로 알려 준 users.toml 의 차이가 곧 「보낼 op」 이자 「그릴 칩」 이다.
 * **판정은 이 파일 한 벌** — relay planner(`relay/src/admin/planner.ts`, 무엇을 보낼까)와 Express 개요
 * (`deriveAdminUsersOverview`, 칩을 무엇으로 그릴까)가 같은 `diffServerAccounts` 를 읽는다. 두 곳에 비교
 * 규칙을 따로 두면 「보냈는데 칩은 미반영」 같은 갈라짐이 생긴다.
 *
 * D-23: ③ 교보 계좌의 branch/trader 는 빈 문자열 그대로(「해당 없음」 표시는 화면 몫) · ④ BUSY(9) 의 한국어
 * message 는 칩에 그대로 · ⑤ op 4 는 의도에 있는 계좌만, 87 로 「서버에만 있음」 인 계좌는 지우지 않는다 ·
 * op 4 의 8(NO_SUCH_ACCOUNT)은 「이미 없음 = 반영됨」.
 *
 * 값 이름은 camelCase — 29-05 RPC(`admin_users_raw` · `admin_servers_raw`) 의 jsonb 키가 이 이름을 그대로 따른다.
 * 순수 함수만 둔다(DB · 소켓 없음).
 */

import { normalizeOrderIp, normalizeOrderMac } from "./order-endpoint";

// ─────────────────────────────────────────────────────────────────────────────
// 기본 축 — 역할 · 증권사 · 서버 키
// ─────────────────────────────────────────────────────────────────────────────

export type AppRole = "admin" | "trader" | "viewer";
export type DmaBroker = "KB" | "KYOBO";

/** 서버 레지스트리 키 — `dma_servers.key` CHECK 와 같은 정규식(KB120 · KYOBO119 …). */
export const SERVER_KEY_RE = /^(KB|KYOBO)[0-9]{1,3}$/;

/** 서버 키의 증권사 접두. 형식이 아니면 null. */
export function brokerOfServerKey(key: string): DmaBroker | null {
  const m = SERVER_KEY_RE.exec(key);
  return m ? (m[1] as DmaBroker) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 로그 마스킹 — DMA id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DMA id 마스킹 — **로그 전용 한 벌**(29-40 IN-01). relay admin-api 감사 · relay 이관 도구(`dma-users-migrate`) ·
 * Express Admin 감사 로그가 모두 이것을 써서 같은 id 가 세 로그에서 같게 가려진다.
 *
 * 규칙: 코드포인트 기준 앞 `min(2, floor(길이/2))` 자 + `***` + `(길이)`. 절반을 넘겨 보이지 않으므로 짧은 id 가
 * 통째로 드러나지 않는다(`kim01` → `ki***(5)` · `abc` → `a***(3)` · `ab` → `a***(2)` · `a` → `***(1)`).
 * 한글처럼 UTF-16 2단위가 아닌 문자도 글자 단위로 센다(`김철` → `김***(2)`).
 */
export function maskDmaUserId(id: string): string {
  const chars = [...id];
  const shown = Math.min(2, Math.floor(chars.length / 2));
  return `${chars.slice(0, shown).join("")}***(${chars.length})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌번호 — gh-trade `NormalizeAccountNo` 이식
// ─────────────────────────────────────────────────────────────────────────────

/** 서버 `kMaxAccountNoLen` — 이보다 긴 입력은 자르지 않고 거부한다(`isValidAccountNoInput`). */
const MAX_ACCOUNT_NO_LEN = 12;

/**
 * gh-trade `server/src/broker/base/AccountUtil.h` `NormalizeAccountNo` 이식 — Admin 입력 · DB 의도 저장 ·
 * 87 대조가 같은 키를 쓴다. 앞뒤 공백/탭 제거 → 좌측 '0' 제거 → 전부 '0' 이면 "0" → 빈 값은 "".
 * 원본의 maxLen 절단은 옮기지 않는다(고정폭 C 필드용 — 웹 입력은 길이 검사로 거부한다).
 */
export function normalizeAccountNo(raw: string): string {
  let begin = 0;
  let end = raw.length;
  while (begin < end && (raw[begin] === " " || raw[begin] === "\t")) begin++;
  while (end > begin && (raw[end - 1] === " " || raw[end - 1] === "\t")) end--;
  if (begin === end) return "";
  let digits = begin;
  while (digits < end && raw[digits] === "0") digits++;
  if (digits === end) return "0";
  return raw.slice(digits, end);
}

/** Admin 입력 계좌번호 검사 — trim 뒤 1~12자. 12자 초과는 잘라 내지 않고 거부한다. */
export function isValidAccountNoInput(raw: string): boolean {
  const t = raw.trim();
  return t.length >= 1 && t.length <= MAX_ACCOUNT_NO_LEN;
}

// ─────────────────────────────────────────────────────────────────────────────
// 원자료 행 — 29-05 RPC jsonb 키
// ─────────────────────────────────────────────────────────────────────────────

/** 계좌 1행의 값 — 44 `AdminAccount` · 87 `AdminUser.accounts` 와 같은 5필드. */
export interface AdminAccountFields {
  accountNo: string;
  name: string;
  /** KB 5자 · 교보 빈 문자열(D-23 ③). */
  branchNo: string;
  /** KB 6자 · 교보 빈 문자열(D-23 ③). */
  traderId: string;
  /** 작을수록 앞(users.toml priority). */
  priority: number;
  /**
   * 계좌별 주문자 IP · MAC(gh-trade 인박스 261010 · 슬롯 14 · 16) — **87 전용**. 서버 정규화값 그대로(재정규화 금지),
   * 빈 값(= 미설정)은 키를 두지 않는다. DB 의도는 지금 두 필드를 갖지 않는다 — 의도에 값이 없으면 relay 는 87 값을 되싣고
   * diff 도 비교하지 않는다(서버 값 보존 · GC-02 · 29-47). 사용자 PC 식별 정보 — 로그 금지.
   */
  orderIp?: string;
  orderMac?: string;
}

/** DB 의도 1행 = (DMA 유저, 계좌, 등록 서버). `removing` 은 제거 의도가 서버에 아직 반영되지 않은 행. */
export interface AdminIntentRow extends AdminAccountFields {
  dmaUserId: string;
  broker: DmaBroker;
  serverKey: string;
  state: "active" | "removing";
  /**
   * 이 등록 서버가 그 계좌의 주문 서버 지정인가(29-29 G-1 · `dma_account_servers.is_order`). active 행만 참이다(DB CHECK).
   * 옛 RPC 본문 · 옛 픽스처는 키가 없다 — 없으면 지정 없음.
   */
  isOrder?: boolean;
}

/** 서버별 87 반영 상태 1행(`dma_server_user_accounts`). */
export interface AdminSnapshotAccountRow extends AdminAccountFields {
  serverKey: string;
  dmaUserId: string;
}

export type AdminOutcome = "ok" | "failed" | "timeout" | "offline" | "skipped";

/** (DMA 유저, 서버) 의 최근 반영 결과(`dma_admin_results`). */
export interface AdminResultRow {
  dmaUserId: string;
  serverKey: string;
  outcome: AdminOutcome;
  code: number | null;
  message: string | null;
  at: string;
}

/** `admin_users_raw()` 반환 — 개요 파생의 유일한 입력. */
export interface AdminUsersRaw {
  appUsers: { email: string; role: AppRole; dmaUserId: string | null; signedUp: boolean }[];
  pending: { email: string; signedUpAt: string }[];
  intent: AdminIntentRow[];
  /** 87 을 받은 서버 목록 — 여기 없는 서버는 「아직 모름」 이다. users_rev 는 ulong 이라 문자열. */
  snapshots: { serverKey: string; usersRev: string; receivedAt: string }[];
  snapshotAccounts: AdminSnapshotAccountRow[];
  results: AdminResultRow[];
  /**
   * 레지스트리 순(sort_order). `isOrderServer` = 그 증권사 기본 주문 서버(`dma_servers.is_order_server` · 29-29) — 화면 「기본(KB120)」
   * 원천. 옛 RPC 본문은 키가 없다.
   */
  servers: { key: string; broker: DmaBroker; enabled: boolean; isOrderServer?: boolean }[];
}

/**
 * 계좌 하나 · 서버 하나의 주문자 IP/MAC(Phase 30 · D-09). `""` = 미설정(서버 NIC 값). 87 정규화값 그대로(재정규화 금지).
 * 사용자 PC 식별 정보 — 로그 금지.
 */
export interface AdminOrderEndpoint {
  orderIp: string;
  orderMac: string;
}

/** relay 87 캐시의 계좌 1행 — 계좌 존재까지 싣는다(「그 서버 87 은 아는데 이 계좌는 없음」 = 「확인 전」 을 「미설정」 과 가른다). */
export interface AdminOrderEndpointRow extends AdminOrderEndpoint {
  dmaUserId: string;
  accountNo: string;
}

/**
 * relay `GET /internal/admin/order-endpoints` 응답(Phase 30 · D-09 · D-10) — relay 메모리 87 캐시를 읽는다. DB 에는 IP/MAC 열이
 * 없다(DB 변경 없음 · 87 정본). `servers` 에 키가 없는 서버 = 그 서버 87 을 모름(꺼짐 · 미수신). 값 `""` = 미설정 · 87 정규화값 그대로
 * (재정규화 금지). 사용자 PC 식별 정보 — 로그 금지.
 */
export interface AdminOrderEndpointsRaw {
  servers: Record<string, AdminOrderEndpointRow[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 개요 뷰 — Express GET /api/admin/users 응답
// ─────────────────────────────────────────────────────────────────────────────

/** ok 반영됨 · warn 미반영 · err 실패 · BUSY · only 서버에만 있음. */
export type ReflectTone = "ok" | "warn" | "err" | "only";

/** 칩 문구(specifics). err 의 상세는 칩의 `message`(서버 한국어 문장 그대로, D-23 ④). */
export const REFLECT_LABEL: Readonly<Record<ReflectTone, string>> = {
  ok: "반영됨",
  warn: "미반영",
  err: "실패 · BUSY",
  only: "서버에만 있음",
};

export interface AdminReflectChip {
  serverKey: string;
  tone: ReflectTone;
  /** err 일 때 최근 결과의 서버 message 그대로 — 그 밖은 null. */
  message: string | null;
}

export interface AdminAccountView {
  broker: DmaBroker;
  accountNo: string;
  name: string;
  branchNo: string;
  traderId: string;
  priority: number;
  /** 의도에 등록된 서버별 칩. */
  servers: (AdminReflectChip & { state: "active" | "removing" })[];
  /** 의도에는 없는데 87 에 이 계좌가 있는 서버(지우지 않는다 — 보기만). */
  serverOnlyOn: string[];
  /**
   * 계좌 주문 서버 지정(29-37 G-1 ⑥) — active 등록 행 중 `isOrder` 인 서버 키 · 없으면 null(= 증권사 기본값). 87 전용 계좌는 null.
   * 선택 필드(기존 픽스처 호환) — `deriveAdminUsersOverview` 는 늘 채운다.
   */
  orderServer?: string | null;
  /** 그 계좌 증권사의 기본 주문 서버 키(`servers[].isOrderServer`) · 없으면 null. 87 전용 계좌는 null. 파생은 늘 채운다. */
  defaultOrderServer?: string | null;
  /**
   * 서버별 주문자 IP/MAC(Phase 30 · D-09 · D-10) — 키 = 그 계좌의 active 등록 서버 · 값 = 그 서버 87 값(`""` = 미설정) ·
   * null = 그 서버 87 을 모르거나 그 서버 87 에 이 계좌가 없음(화면 「확인 전」). 87 전용 계좌는 `{}`.
   * 선택 필드(기존 픽스처 호환) — `deriveAdminUsersOverview` 는 늘 채운다. 표시 판정은 `summarizeOrderEndpoint`.
   */
  orderEndpoints?: Record<string, AdminOrderEndpoint | null>;
}

export interface AdminUserView {
  email: string;
  role: AppRole;
  dmaUserId: string | null;
  signedUp: boolean;
  /** active 계좌 수. */
  accountCount: number;
  /** 유저 행의 서버별 칩. */
  servers: AdminReflectChip[];
  accounts: AdminAccountView[];
}

export interface AdminPendingUser {
  email: string;
  signedUpAt: string;
}

/** 87 에만 있고 어떤 웹 사용자에도 연결되지 않은 DMA id — 편집 대상 아님(보기만). */
export interface AdminServerOnlyUser {
  dmaUserId: string;
  servers: string[];
  accountCount: number;
}

export interface AdminUsersOverview {
  users: AdminUserView[];
  pending: AdminPendingUser[];
  serverOnly: AdminServerOnlyUser[];
  servers: AdminUsersRaw["servers"];
}

// ─────────────────────────────────────────────────────────────────────────────
// 서버 레지스트리 개요 — Express GET /api/admin/servers 응답
// ─────────────────────────────────────────────────────────────────────────────

/** `admin_servers_raw()` 반환. */
export interface AdminServersRaw {
  servers: {
    key: string;
    broker: DmaBroker;
    host: string;
    port: number;
    enabled: boolean;
    isOrderServer: boolean;
    isQuotePrimary: boolean;
    sortOrder: number;
  }[];
  /** 그 서버 87 의 DMA id 수. */
  userCounts: { serverKey: string; users: number }[];
  snapshots: { serverKey: string; usersRev: string; receivedAt: string }[];
}

/** relay `GET /internal/admin/servers/status` 의 서버 1대 상태. */
export interface AdminServerLiveStatus {
  conn: "ok" | "down" | "off";
  journal: "ok" | "down" | "off";
  admin: "ok" | "connecting" | "down" | "off";
  quote: "live" | "connecting" | "down" | null;
  /**
   * G-1 (가) — 이 서버(옛 주문 서버)에 남아 끄지 못한 전략이 있는 계좌 수(29-43 · relay `StaleStrategyRegister`). 옛 relay 는
   * 싣지 않아 선택 필드다. 소비(서버 카드 한 줄)는 29-38.
   */
  staleAccounts?: number;
}

export interface AdminServerView {
  key: string;
  broker: DmaBroker;
  host: string;
  port: number;
  enabled: boolean;
  isOrderServer: boolean;
  isQuotePrimary: boolean;
  sortOrder: number;
  userCount: number;
  /** relay 상태 조회 실패 · 그 서버 항목 없음이면 null. */
  status: AdminServerLiveStatus | null;
}

export interface AdminServersOverview {
  /** KB → KYOBO 고정 순 · 그룹 안은 sortOrder → key. 빈 그룹도 둔다. */
  groups: { broker: DmaBroker; servers: AdminServerView[] }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 명령 결과 · 요청 바디 — webapp ↔ Express ↔ relay
// ─────────────────────────────────────────────────────────────────────────────

/** 서버 1대의 반영 결과. usersRev 는 ulong 이라 문자열. */
export interface AdminServerResult {
  server: string;
  outcome: AdminOutcome;
  code?: number;
  message?: string;
  usersRev?: string;
}

export interface AdminCommandResponse {
  results: AdminServerResult[];
}

export interface AdminAccountInput {
  broker: DmaBroker;
  accountNo: string;
  name: string;
  branchNo: string;
  traderId: string;
  priority: number;
}

export interface AdminDmaInput {
  dmaUserId: string;
  password: string;
  account: AdminAccountInput;
  servers: string[];
}

export interface AdminCreateUserBody {
  email: string;
  role: AppRole;
  dma?: AdminDmaInput;
}

export interface AdminRoleBody {
  role: AppRole;
}

export interface AdminPasswordBody {
  password: string;
}

export interface AdminPutAccountBody {
  account: AdminAccountInput;
  servers: string[];
  /**
   * 주문자 IP/MAC 설정(Phase 30) — 계좌 객체 **밖**에 둔다(RPC `p_account` 로 가지 않게 · DB 저장 없음 · 87 정본). KB 계좌만.
   * 웹 입력 원문(trim)을 그대로 보낸다(D-07 — 정규화는 서버 몫). 둘 다 빈 문자열 = 미설정으로 되돌리기(D-04).
   * 없으면 서버 값 보존 — relay 가 op 5 로 새 87 을 받아 되싣는다(IPMAC-01).
   */
  orderEndpoint?: AdminOrderEndpoint;
}

/**
 * PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server 바디(29-37 G-1 ⑥) — 계좌 주문 서버 지정.
 * null = 증권사 기본 주문 서버로 되돌림. 그 계좌의 active 등록 서버만(아니면 409 `ORDER_SERVER_NOT_REGISTERED`).
 */
export interface AdminOrderServerBody {
  serverKey: string | null;
}

/** 위 요청의 200 응답 — 저장된 지정(null = 기본값). relay 가 지정 적재기를 재적재한 뒤에 온다. */
export interface AdminOrderServerResponse {
  ok: true;
  orderServer: string | null;
}

export interface AdminServerUpsertBody {
  key: string;
  broker: DmaBroker;
  host: string;
  port: number;
  sortOrder?: number;
}

export interface AdminServerPatchBody {
  broker?: DmaBroker;
  host?: string;
  port?: number;
  enabled?: boolean;
  sortOrder?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 판정 — 의도 대 87 (서버 1대 · 유저 1명)
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerAccountsDiffInput {
  /** 그 유저 · 그 서버의 active 의도 계좌. */
  active: AdminAccountFields[];
  /** 그 유저 · 그 서버의 removing 의도 계좌. */
  removing: AdminAccountFields[];
  /** 87 의 그 유저 — 87 에 유저가 없으면 null. */
  snapshotUser: { accounts: AdminAccountFields[] } | null;
  /** 그 서버 87 을 받은 적이 있는가 — false 면 아무것도 판정하지 않는다. */
  snapshotKnown: boolean;
}

export type ServerAccountsDiff =
  | { known: false }
  | {
      known: true;
      /** 87 에 그 유저가 있는가. */
      userPresent: boolean;
      /** active 인데 87 에 없는 계좌(op 1 첫 계좌 · op 3). priority → accountNo 순. */
      missing: AdminAccountFields[];
      /**
       * active 이고 87 에 있지만 값(name · branchNo · traderId · priority · 의도에 있을 때만 주문자 IP/MAC)이 다른 계좌(op 3). 의도 값.
       * 주문자 IP/MAC 은 정규화 비교(Phase 30 — `10.41.1.124` 와 `010041001124` 는 같다).
       */
      changed: AdminAccountFields[];
      /** removing 인데 87 에 아직 있는 계좌(op 4 · 전부면 op 2). */
      toRemove: AdminAccountFields[];
      /** removing 인데 87 에 이미 없는 계좌 — 보낼 것 없이 의도에서 정리(settle). */
      settledRemovals: AdminAccountFields[];
      /** 87 에만 있는 계좌 — 절대 지우지 않는다(D-23 ⑤). */
      serverOnly: AdminAccountFields[];
    };

/** 비교 키 = 정규화 계좌번호. 반환 계좌도 정규화 번호로 싣는다(op 에 그대로 실린다). */
function withKey(a: AdminAccountFields): AdminAccountFields {
  const accountNo = normalizeAccountNo(a.accountNo);
  return accountNo === a.accountNo ? a : { ...a, accountNo };
}

/** priority 오름차순 → accountNo — 87 계좌 순서(gh-trade LoadUsers)와 같은 기준. */
export function compareAccounts(a: AdminAccountFields, b: AdminAccountFields): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.accountNo < b.accountNo ? -1 : a.accountNo > b.accountNo ? 1 : 0;
}

/**
 * 인자 순서는 **의도 → 87**(`diffServerAccounts` 호출부가 그 순서). 주문자 IP/MAC 은 87 전용이라 의도 쪽에 값이 있을 때만
 * 87 값(없음 = 빈 문자열)과 비교한다 — 의도에 없으면 「서버 값 보존」(relay planner 가 87 값을 되싣는다 · GC-02).
 * 정규화 비교(Phase 30 · IPMAC-02): 의도 값(웹 원문)이 정규화에 성공하면 정규화값으로, 실패하면 원문으로 87 값과 비교한다 —
 * gh-trade Gateway.cpp op 3 멱등과 같다(실패 값을 빈 값으로 바꾸면 미설정 계좌와 같아 보여 code 13 경로를 막는다).
 */
function sameValues(intent: AdminAccountFields, snap: AdminAccountFields): boolean {
  return (
    intent.name === snap.name &&
    intent.branchNo === snap.branchNo &&
    intent.traderId === snap.traderId &&
    intent.priority === snap.priority &&
    (intent.orderIp === undefined || (normalizeOrderIp(intent.orderIp) ?? intent.orderIp) === (snap.orderIp ?? "")) &&
    (intent.orderMac === undefined || (normalizeOrderMac(intent.orderMac) ?? intent.orderMac) === (snap.orderMac ?? ""))
  );
}

/**
 * 의도(active · removing)와 87 의 그 유저를 비교한다 — relay planner 와 개요 칩의 공통 판정.
 * 주문자 IP/MAC(`orderIp` · `orderMac`)은 87 전용 — 의도에 값이 없으면 보존(비교 제외 · GC-02). IP/MAC 이 설정된 계좌도
 * 나머지 4값이 같으면 반영됨. 의도에 값이 있으면 정규화 비교(Phase 30 — `sameValues`).
 */
export function diffServerAccounts(input: ServerAccountsDiffInput): ServerAccountsDiff {
  if (!input.snapshotKnown) return { known: false };

  const active = input.active.map(withKey);
  const snap = new Map<string, AdminAccountFields>();
  for (const a of input.snapshotUser?.accounts ?? []) {
    const k = withKey(a);
    if (!snap.has(k.accountNo)) snap.set(k.accountNo, k);
  }

  const missing: AdminAccountFields[] = [];
  const changed: AdminAccountFields[] = [];
  const intentKeys = new Set<string>();
  for (const a of active) {
    if (intentKeys.has(a.accountNo)) continue;
    intentKeys.add(a.accountNo);
    const s = snap.get(a.accountNo);
    if (!s) missing.push(a);
    else if (!sameValues(a, s)) changed.push(a);
  }

  // 같은 계좌가 active 와 removing 에 다 있으면 active 가 이긴다 — 지우는 쪽으로 기울지 않는다.
  const toRemove: AdminAccountFields[] = [];
  const settledRemovals: AdminAccountFields[] = [];
  for (const a of input.removing.map(withKey)) {
    if (intentKeys.has(a.accountNo)) continue;
    intentKeys.add(a.accountNo);
    if (snap.has(a.accountNo)) toRemove.push(a);
    else settledRemovals.push(a);
  }

  // 의도 어디에도 없는 87 계좌 — 표시만, 절대 지우지 않는다(D-23 ⑤ · D-16).
  const serverOnly = [...snap.values()].filter((s) => !intentKeys.has(s.accountNo));

  return {
    known: true,
    userPresent: input.snapshotUser !== null,
    missing: missing.sort(compareAccounts),
    changed: changed.sort(compareAccounts),
    toRemove: toRemove.sort(compareAccounts),
    settledRemovals: settledRemovals.sort(compareAccounts),
    serverOnly: serverOnly.sort(compareAccounts),
  };
}

/**
 * 86 `AdminCommandResp.code` 해석 — 화면 칩과 relay settle 이 같이 쓴다(D-23 ⑤).
 *   - 0 은 언제나 반영됨.
 *   - op 4 의 8(NO_SUCH_ACCOUNT) = 이미 없음 → 반영됨(오류 칩 아님).
 *   - op 2 의 4(NO_SUCH_USER) = 유저 없음 → 반영됨.
 *   - 그 밖(9 BUSY · 12 LAST_ACCOUNT · 3 · 5 · 7 …)은 실패 — 칩은 서버 한국어 message 를 그대로 싣는다(D-23 ④).
 *     12 는 op 4 의 마지막 계좌 제거와 op 2 의 서버 마지막 사용자 삭제 둘 다에 온다(gh-trade 인박스 261007) —
 *     둘 다 서버별 실패 칩이고, relay HTTP 409 `LAST_ACCOUNT`(DB 의도 업무 거부)와는 이름만 같다.
 *   - 13 BAD_ORDER_ENDPOINT(op 1 · op 3 주문자 IP/MAC 형식 오류 · gh-trade 인박스 261010)도 실패 — 칩은 서버 문구 그대로.
 *   - op 8 SetLaunchPlan · op 9 GetLaunchPlan(gh-trade 43 · 인박스 261028-launch-plan-contract) — code 0 만 ok · 같은 값 = code 0
 *     「변경 없음」 · 범위 · 순서 · 대상 밖 거부는 code 1 + 고정 문구(화면 「서버 미지원 · <message>」 — D-27) · 10 · 11 도 실패.
 */
export function interpretAdminResult(op: 1 | 2 | 3 | 4 | 5 | 8 | 9, code: number): "ok" | "failed" {
  if (code === 0) return "ok";
  if (op === 4 && code === 8) return "ok";
  if (op === 2 && code === 4) return "ok";
  return "failed";
}

// ─────────────────────────────────────────────────────────────────────────────
// 개요 파생 — Express GET /api/admin/users · GET /api/admin/servers
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_ORDER: Readonly<Record<AppRole, number>> = { admin: 0, trader: 1, viewer: 2 };
const BROKER_ORDER: readonly DmaBroker[] = ["KB", "KYOBO"];

function pairKey(dmaUserId: string, serverKey: string): string {
  return `${dmaUserId}\u0000${serverKey}`;
}

function fieldsOf(r: AdminAccountFields): AdminAccountFields {
  return {
    accountNo: r.accountNo,
    name: r.name,
    branchNo: r.branchNo,
    traderId: r.traderId,
    priority: r.priority,
  };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** raw 를 한 번 색인해 두고 (유저, 서버) 마다 판정한다. */
interface RawIndex {
  /** 87 을 받은 서버. */
  known: Set<string>;
  snapByPair: Map<string, AdminAccountFields[]>;
  /** DMA id → 87 에 그 유저가 있는 서버들. */
  snapServersByUser: Map<string, Set<string>>;
  intentByUser: Map<string, AdminIntentRow[]>;
  resultByPair: Map<string, AdminResultRow>;
  serverOrder: Map<string, number>;
  /** 증권사 → 기본 주문 서버 키(`servers[].isOrderServer` 첫 행 · 29-37). 없는 증권사는 키 없음. */
  defaultOrderServer: Map<DmaBroker, string>;
}

function indexRaw(raw: AdminUsersRaw): RawIndex {
  const snapByPair = new Map<string, AdminAccountFields[]>();
  const snapServersByUser = new Map<string, Set<string>>();
  for (const r of raw.snapshotAccounts) {
    pushTo(snapByPair, pairKey(r.dmaUserId, r.serverKey), fieldsOf(r));
    const set = snapServersByUser.get(r.dmaUserId);
    if (set) set.add(r.serverKey);
    else snapServersByUser.set(r.dmaUserId, new Set([r.serverKey]));
  }
  const intentByUser = new Map<string, AdminIntentRow[]>();
  for (const r of raw.intent) pushTo(intentByUser, r.dmaUserId, r);
  const defaultOrderServer = new Map<DmaBroker, string>();
  for (const s of raw.servers) {
    if (s.isOrderServer === true && !defaultOrderServer.has(s.broker)) defaultOrderServer.set(s.broker, s.key);
  }
  // (dma_user_id, server_key) PK 라 1행이지만, 섞여 오면 가장 최근 것.
  const resultByPair = new Map<string, AdminResultRow>();
  for (const r of raw.results) {
    const k = pairKey(r.dmaUserId, r.serverKey);
    const prev = resultByPair.get(k);
    if (!prev || prev.at < r.at) resultByPair.set(k, r);
  }
  return {
    known: new Set(raw.snapshots.map((s) => s.serverKey)),
    snapByPair,
    snapServersByUser,
    intentByUser,
    resultByPair,
    serverOrder: new Map(raw.servers.map((s, i) => [s.key, i])),
    defaultOrderServer,
  };
}

/** 레지스트리 순 — 레지스트리에 없는 키는 뒤로, 키 순. */
function serverComparator(order: Map<string, number>) {
  return (a: string, b: string): number => {
    const ia = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

/** 그 서버에서 아직 할 일이 남았는가 — 87 을 모르면 남은 것으로 본다. */
function hasPendingWork(diff: ServerAccountsDiff): boolean {
  if (!diff.known) return true;
  return diff.missing.length > 0 || diff.changed.length > 0 || diff.toRemove.length > 0;
}

/**
 * 할 일이 남은 칩 — 최근 결과가 failed 면 err(서버 한국어 message 그대로, D-23 ④) · timeout 이면 err 「응답 없음」
 * (시트 응답 칩과 같은 색 · 문구 — 29-40 IN-02) · 그 밖은 warn.
 */
function pendingTone(idx: RawIndex, dmaUserId: string, serverKey: string): Omit<AdminReflectChip, "serverKey"> {
  const r = idx.resultByPair.get(pairKey(dmaUserId, serverKey));
  if (r?.outcome === "failed") return { tone: "err", message: r.message };
  if (r?.outcome === "timeout") return { tone: "err", message: "응답 없음" };
  return { tone: "warn", message: null };
}

/** (유저, 서버) 1개의 판정 — planner 와 같은 diffServerAccounts 입력 구성. */
interface ServerJudgement {
  serverKey: string;
  rows: AdminIntentRow[];
  diff: ServerAccountsDiff;
  /** 아직 반영되지 않은 정규화 계좌번호(missing · changed · toRemove). */
  pendingKeys: Set<string>;
}

function judgeUser(idx: RawIndex, dmaUserId: string): ServerJudgement[] {
  const rowsByServer = new Map<string, AdminIntentRow[]>();
  for (const r of idx.intentByUser.get(dmaUserId) ?? []) pushTo(rowsByServer, r.serverKey, r);
  const keys = new Set([...rowsByServer.keys(), ...(idx.snapServersByUser.get(dmaUserId) ?? [])]);
  return [...keys].sort(serverComparator(idx.serverOrder)).map((serverKey) => {
    const rows = rowsByServer.get(serverKey) ?? [];
    const snapAccounts = idx.snapByPair.get(pairKey(dmaUserId, serverKey));
    const diff = diffServerAccounts({
      active: rows.filter((r) => r.state === "active").map(fieldsOf),
      removing: rows.filter((r) => r.state === "removing").map(fieldsOf),
      snapshotUser: snapAccounts ? { accounts: snapAccounts } : null,
      snapshotKnown: idx.known.has(serverKey),
    });
    const pendingKeys = new Set(
      diff.known ? [...diff.missing, ...diff.changed, ...diff.toRemove].map((a) => a.accountNo) : [],
    );
    return { serverKey, rows, diff, pendingKeys };
  });
}

/** 유저 행 칩 — 의도가 있는 서버는 diff 판정, 87 에만 그 유저가 있는 서버는 only. */
function userChips(idx: RawIndex, dmaUserId: string, judged: ServerJudgement[]): AdminReflectChip[] {
  return judged.map(({ serverKey, rows, diff }) => {
    if (rows.length === 0) return { serverKey, tone: "only", message: null };
    if (!hasPendingWork(diff)) return { serverKey, tone: "ok", message: null };
    return { serverKey, ...pendingTone(idx, dmaUserId, serverKey) };
  });
}

interface AccountDraft {
  broker: DmaBroker;
  fields: AdminAccountFields;
  hasActive: boolean;
  /** 의도 행이 있는 계좌인가 — 87 전용 계좌는 주문 서버 두 필드가 null. */
  hasIntent: boolean;
  /** active 행의 `isOrder` 서버(removing 행의 isOrder 는 비정상 — 보지 않는다). */
  orderServer: string | null;
  servers: AdminAccountView["servers"];
  serverOnlyOn: string[];
}

/** 주문자 IP/MAC 색인 — serverKey → (dmaUserId + "\u0000" + 정규화 계좌번호) → 87 값. 서버 키 없음 = 그 서버 87 모름. */
type OrderEndpointIndex = Map<string, Map<string, AdminOrderEndpoint>>;

const endpointKey = (dmaUserId: string, accountNo: string) => `${dmaUserId}\u0000${normalizeAccountNo(accountNo)}`;

function indexOrderEndpoints(endpoints: AdminOrderEndpointsRaw | null | undefined): OrderEndpointIndex {
  const idx: OrderEndpointIndex = new Map();
  for (const [serverKey, rows] of Object.entries(endpoints?.servers ?? {})) {
    const byAccount = new Map<string, AdminOrderEndpoint>();
    for (const r of rows) {
      const k = endpointKey(r.dmaUserId, r.accountNo);
      if (!byAccount.has(k)) byAccount.set(k, { orderIp: r.orderIp, orderMac: r.orderMac });
    }
    idx.set(serverKey, byAccount);
  }
  return idx;
}

/** 계좌 줄 — 의도 계좌의 등록 서버별 칩 + 87 에만 있는 서버(serverOnlyOn). 의도에 없는 87 계좌도 줄로 보인다. */
function userAccounts(
  idx: RawIndex,
  dmaUserId: string,
  judged: ServerJudgement[],
  endpoints: OrderEndpointIndex,
): { accounts: AdminAccountView[]; accountCount: number } {
  const drafts = new Map<string, AccountDraft>();
  const keyOf = (broker: DmaBroker, accountNo: string) => `${broker}\u0000${normalizeAccountNo(accountNo)}`;

  for (const j of judged) {
    for (const r of j.rows) {
      const fields = { ...fieldsOf(r), accountNo: normalizeAccountNo(r.accountNo) };
      const k = keyOf(r.broker, r.accountNo);
      let d = drafts.get(k);
      if (!d) {
        d = { broker: r.broker, fields, hasActive: false, hasIntent: true, orderServer: null, servers: [], serverOnlyOn: [] };
        drafts.set(k, d);
      }
      if (r.state === "active" && !d.hasActive) {
        d.fields = fields; // 값은 active 행이 정본
        d.hasActive = true;
      }
      if (r.state === "active" && r.isOrder === true) d.orderServer = r.serverKey;
      const reflected = j.diff.known && !j.pendingKeys.has(fields.accountNo);
      const chip = reflected
        ? { tone: "ok" as const, message: null }
        : pendingTone(idx, dmaUserId, j.serverKey);
      d.servers.push({ serverKey: j.serverKey, ...chip, state: r.state });
    }
  }

  // 87 에만 있는 계좌 — 그 서버 의도에 없는 것(diff.serverOnly). 표시만, 지우지 않는다(D-23 ⑤).
  for (const j of judged) {
    if (!j.diff.known) continue;
    const broker = brokerOfServerKey(j.serverKey);
    if (!broker) continue;
    for (const a of j.diff.serverOnly) {
      const k = keyOf(broker, a.accountNo);
      const d = drafts.get(k);
      if (d) d.serverOnlyOn.push(j.serverKey);
      else {
        drafts.set(k, {
          broker,
          fields: a,
          hasActive: false,
          hasIntent: false,
          orderServer: null,
          servers: [],
          serverOnlyOn: [j.serverKey],
        });
      }
    }
  }

  const bySrv = serverComparator(idx.serverOrder);
  const list = [...drafts.values()].sort(
    (a, b) => BROKER_ORDER.indexOf(a.broker) - BROKER_ORDER.indexOf(b.broker) || compareAccounts(a.fields, b.fields),
  );
  /** 의도 계좌의 active 등록 서버마다 87 값 · 모르면 null(D-09 · D-10). 87 전용 계좌는 {}. */
  const orderEndpointsOf = (d: AccountDraft): Record<string, AdminOrderEndpoint | null> => {
    const out: Record<string, AdminOrderEndpoint | null> = {};
    if (!d.hasIntent) return out;
    const k = endpointKey(dmaUserId, d.fields.accountNo);
    for (const s of d.servers) {
      if (s.state === "active") out[s.serverKey] = endpoints.get(s.serverKey)?.get(k) ?? null;
    }
    return out;
  };
  return {
    accounts: list.map((d) => {
      const servers = d.servers.sort((a, b) => bySrv(a.serverKey, b.serverKey));
      return {
        broker: d.broker,
        ...d.fields,
        servers,
        serverOnlyOn: d.serverOnlyOn.sort(bySrv),
        orderServer: d.hasIntent ? d.orderServer : null,
        defaultOrderServer: d.hasIntent ? (idx.defaultOrderServer.get(d.broker) ?? null) : null,
        orderEndpoints: orderEndpointsOf(d),
      };
    }),
    accountCount: list.filter((d) => d.hasActive).length,
  };
}

/** 87 에만 있고 어떤 웹 사용자에도 연결되지 않은 DMA id 행. */
function serverOnlyUsers(raw: AdminUsersRaw, idx: RawIndex): AdminServerOnlyUser[] {
  const linked = new Set(raw.appUsers.map((u) => u.dmaUserId).filter((id): id is string => id !== null));
  const accounts = new Map<string, Set<string>>();
  for (const r of raw.snapshotAccounts) {
    if (linked.has(r.dmaUserId)) continue;
    const set = accounts.get(r.dmaUserId) ?? new Set<string>();
    set.add(`${brokerOfServerKey(r.serverKey) ?? r.serverKey}\u0000${normalizeAccountNo(r.accountNo)}`);
    accounts.set(r.dmaUserId, set);
  }
  const bySrv = serverComparator(idx.serverOrder);
  return [...accounts.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((dmaUserId) => ({
      dmaUserId,
      servers: [...(idx.snapServersByUser.get(dmaUserId) ?? [])].sort(bySrv),
      accountCount: accounts.get(dmaUserId)?.size ?? 0,
    }));
}

function timeDesc(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta;
  return a < b ? 1 : a > b ? -1 : 0;
}

/**
 * `admin_users_raw()` 한 덩이 → 목록 행 · 칩 · 계좌 줄 · 「서버에만 있음」 행 · 승인 대기(D-03 · D-14).
 * 칩 판정은 `diffServerAccounts` 그대로 — relay planner 가 같은 diff 로 op 를 만든다.
 *
 * `endpoints`(Phase 30 · D-09) = relay 87 캐시의 주문자 IP/MAC(`GET /internal/admin/order-endpoints`) — 의도 계좌마다 active 등록
 * 서버별 `orderEndpoints` 를 채운다. null/생략(relay 조회 실패 · 옛 호출)이면 전부 null(「확인 전」) — 두 경우 출력이 같다.
 */
export function deriveAdminUsersOverview(
  raw: AdminUsersRaw,
  endpoints?: AdminOrderEndpointsRaw | null,
): AdminUsersOverview {
  const idx = indexRaw(raw);
  const endpointIdx = indexOrderEndpoints(endpoints);
  const users: AdminUserView[] = [...raw.appUsers]
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.email < b.email ? -1 : a.email > b.email ? 1 : 0))
    .map((u) => {
      const head = { email: u.email, role: u.role, dmaUserId: u.dmaUserId, signedUp: u.signedUp };
      if (!u.dmaUserId) return { ...head, accountCount: 0, servers: [], accounts: [] };
      const judged = judgeUser(idx, u.dmaUserId);
      const { accounts, accountCount } = userAccounts(idx, u.dmaUserId, judged, endpointIdx);
      return { ...head, accountCount, servers: userChips(idx, u.dmaUserId, judged), accounts };
    });
  return {
    users,
    pending: raw.pending
      .map((p) => ({ email: p.email, signedUpAt: p.signedUpAt }))
      .sort((a, b) => timeDesc(a.signedUpAt, b.signedUpAt)),
    serverOnly: serverOnlyUsers(raw, idx),
    servers: raw.servers,
  };
}

/**
 * 계좌 하나가 87(users.toml)에 있다고 볼 수 있는 서버(30 IN-02 · `findSharedAccountHolders` 전용) — 판정 근거는 그 함수 주석.
 * removing 칩 ok = 87 에서 이미 지워짐(`userAccounts` 의 reflected) · ok 아님 = 아직 있음(toRemove) 또는 87 모름.
 */
function presentOn87(a: Pick<AdminAccountView, "servers" | "serverOnlyOn" | "orderEndpoints">): Set<string> {
  const out = new Set(a.serverOnlyOn);
  for (const s of a.servers) {
    const present =
      s.state === "active" ? s.tone === "ok" || a.orderEndpoints?.[s.serverKey] != null : s.tone !== "ok";
    if (present) out.add(s.serverKey);
  }
  return out;
}

/** 같은 계좌를 함께 쓰는 다른 DMA 사용자(Phase 30 · D-18) — `servers` = 이 계좌 저장이 가는 서버 중 그 사용자도 그 계좌를 가진 서버. */
export interface SharedAccountHolder {
  dmaUserId: string;
  servers: string[];
}

/**
 * 공유 계좌 판정(Phase 30 · D-18 · UI-SPEC Addendum A2) — 개요 사용자 중 **다른** DMA 사용자가 같은 증권사 · 같은 정규화 계좌번호
 * (`normalizeAccountNo`)의 계좌를 가지고 있고, 그 계좌가 **87 에 있는 서버**(아래 `presentOn87`)가 입력 `servers`(이 계좌의 active
 * 등록 서버 = 저장이 가는 서버)와 하나 이상 겹치면 그 사용자를 돌려준다. 결과는 dmaUserId 오름차순(코드 단위) · 같은 dmaUserId 는
 * 서버를 합쳐 한 항목 · 각 `servers` 는 입력 순서. 자기 자신 · DMA 없는 웹 사용자는 넣지 않는다. 순수 함수 · 개요 데이터만 읽는다.
 *
 * - gh-trade 전파(op 3 이 orderIp/orderMac 을 바꾸면 같은 계좌번호를 가진 다른 사용자에 같은 값)는 서버별 users.toml 안에서만
 *   일어난다(D-18) — 겹치는 서버가 없으면 함께 바뀌지 않으므로 넣지 않는다.
 * - 서버 집합은 의도가 아니라 **87 반영 상태**다(30 IN-02) — gh-trade 는 users.toml 에 지금 있는 계좌에만 전파한다.
 *   `serverOnlyOn` · active 이고 반영됨(칩 ok) · active 이고 relay 87 캐시에 값이 있음(`orderEndpoints[서버]` non-null — 칩이 이름 등
 *   다른 필드 미반영으로 ok 가 아니어도 계좌는 87 에 있다) · removing 인데 아직 지워지지 않음(칩 ok 아님 = toRemove 대기 · 87 을
 *   모르면 있다고 본다). active 미반영 계좌(87 에 아직 없음)와 지워진 removing 행은 넣지 않는다.
 *   남는 근사: active 미반영 칩이 「87 에 있지만 다른 필드가 다름」 이고 relay 87 조회도 실패한 경우는 빠진다(개요가 둘을 가르지 않는다).
 * - gh-trade 가 함께 쓰는 사용자에게 옮기는 값은 주문자 IP · MAC 뿐이다(지점번호 · 거래자ID · 계좌명은 옮기지 않는다) — 안내 문구도
 *   IP · MAC 만 말한다.
 * - 한계: 웹 사용자에 연결되지 않은 87 전용 DMA id(「서버에만 있음」 사용자 행)는 개요에 계좌번호가 없어 나오지 않는다 — gh-trade
 *   전파는 그 사용자에게도 적용된다.
 */
export function findSharedAccountHolders(input: {
  users: readonly Pick<AdminUserView, "dmaUserId" | "accounts">[];
  dmaUserId: string;
  broker: DmaBroker;
  accountNo: string;
  servers: readonly string[];
}): SharedAccountHolder[] {
  const no = normalizeAccountNo(input.accountNo);
  const byUser = new Map<string, Set<string>>();
  for (const u of input.users) {
    if (u.dmaUserId === null || u.dmaUserId === input.dmaUserId) continue;
    for (const a of u.accounts) {
      if (a.broker !== input.broker || normalizeAccountNo(a.accountNo) !== no) continue;
      const theirs = presentOn87(a);
      const overlap = input.servers.filter((k) => theirs.has(k));
      if (overlap.length === 0) continue;
      const set = byUser.get(u.dmaUserId) ?? new Set<string>();
      for (const k of overlap) set.add(k);
      byUser.set(u.dmaUserId, set);
    }
  }
  return [...byUser.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dmaUserId, set]) => ({ dmaUserId, servers: input.servers.filter((k) => set.has(k)) }));
}

/**
 * `admin_servers_raw()` + relay 상태 → 증권사 그룹 카드(D-17). KB → KYOBO 고정 순 · 그룹 안은 sortOrder → key ·
 * userCount = 그 서버 87 의 DMA id 수(87 이 없으면 0) · relay 상태가 없으면(조회 실패 · 항목 없음) status null.
 */
export function deriveAdminServersOverview(
  raw: AdminServersRaw,
  live: Record<string, AdminServerLiveStatus> | null,
): AdminServersOverview {
  const counts = new Map(raw.userCounts.map((c) => [c.serverKey, c.users]));
  const views: AdminServerView[] = raw.servers.map((s) => ({
    key: s.key,
    broker: s.broker,
    host: s.host,
    port: s.port,
    enabled: s.enabled,
    isOrderServer: s.isOrderServer,
    isQuotePrimary: s.isQuotePrimary,
    sortOrder: s.sortOrder,
    userCount: counts.get(s.key) ?? 0,
    status: live?.[s.key] ?? null,
  }));
  return {
    groups: BROKER_ORDER.map((broker) => ({
      broker,
      servers: views
        .filter((v) => v.broker === broker)
        .sort((a, b) => a.sortOrder - b.sortOrder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    })),
  };
}
