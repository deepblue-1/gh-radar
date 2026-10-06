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
}

/** DB 의도 1행 = (DMA 유저, 계좌, 등록 서버). `removing` 은 제거 의도가 서버에 아직 반영되지 않은 행. */
export interface AdminIntentRow extends AdminAccountFields {
  dmaUserId: string;
  broker: DmaBroker;
  serverKey: string;
  state: "active" | "removing";
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
  /** 레지스트리 순(sort_order). */
  servers: { key: string; broker: DmaBroker; enabled: boolean }[];
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
      /** active 이고 87 에 있지만 값(name · branchNo · traderId · priority)이 다른 계좌(op 3). 의도 값. */
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

function sameValues(a: AdminAccountFields, b: AdminAccountFields): boolean {
  return (
    a.name === b.name &&
    a.branchNo === b.branchNo &&
    a.traderId === b.traderId &&
    a.priority === b.priority
  );
}

/**
 * 의도(active · removing)와 87 의 그 유저를 비교한다 — relay planner 와 개요 칩의 공통 판정.
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
 */
export function interpretAdminResult(op: 1 | 2 | 3 | 4 | 5, code: number): "ok" | "failed" {
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

/** 할 일이 남은 칩 — 최근 결과가 failed 면 err(서버 한국어 message 그대로, D-23 ④), 아니면 warn. */
function pendingTone(idx: RawIndex, dmaUserId: string, serverKey: string): Omit<AdminReflectChip, "serverKey"> {
  const r = idx.resultByPair.get(pairKey(dmaUserId, serverKey));
  return r?.outcome === "failed" ? { tone: "err", message: r.message } : { tone: "warn", message: null };
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
  servers: AdminAccountView["servers"];
  serverOnlyOn: string[];
}

/** 계좌 줄 — 의도 계좌의 등록 서버별 칩 + 87 에만 있는 서버(serverOnlyOn). 의도에 없는 87 계좌도 줄로 보인다. */
function userAccounts(
  idx: RawIndex,
  dmaUserId: string,
  judged: ServerJudgement[],
): { accounts: AdminAccountView[]; accountCount: number } {
  const drafts = new Map<string, AccountDraft>();
  const keyOf = (broker: DmaBroker, accountNo: string) => `${broker}\u0000${normalizeAccountNo(accountNo)}`;

  for (const j of judged) {
    for (const r of j.rows) {
      const fields = { ...fieldsOf(r), accountNo: normalizeAccountNo(r.accountNo) };
      const k = keyOf(r.broker, r.accountNo);
      let d = drafts.get(k);
      if (!d) {
        d = { broker: r.broker, fields, hasActive: false, servers: [], serverOnlyOn: [] };
        drafts.set(k, d);
      }
      if (r.state === "active" && !d.hasActive) {
        d.fields = fields; // 값은 active 행이 정본
        d.hasActive = true;
      }
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
      else drafts.set(k, { broker, fields: a, hasActive: false, servers: [], serverOnlyOn: [j.serverKey] });
    }
  }

  const bySrv = serverComparator(idx.serverOrder);
  const list = [...drafts.values()].sort(
    (a, b) => BROKER_ORDER.indexOf(a.broker) - BROKER_ORDER.indexOf(b.broker) || compareAccounts(a.fields, b.fields),
  );
  return {
    accounts: list.map((d) => ({
      broker: d.broker,
      ...d.fields,
      servers: d.servers.sort((a, b) => bySrv(a.serverKey, b.serverKey)),
      serverOnlyOn: d.serverOnlyOn.sort(bySrv),
    })),
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
 */
export function deriveAdminUsersOverview(raw: AdminUsersRaw): AdminUsersOverview {
  const idx = indexRaw(raw);
  const users: AdminUserView[] = [...raw.appUsers]
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.email < b.email ? -1 : a.email > b.email ? 1 : 0))
    .map((u) => {
      const head = { email: u.email, role: u.role, dmaUserId: u.dmaUserId, signedUp: u.signedUp };
      if (!u.dmaUserId) return { ...head, accountCount: 0, servers: [], accounts: [] };
      const judged = judgeUser(idx, u.dmaUserId);
      const { accounts, accountCount } = userAccounts(idx, u.dmaUserId, judged);
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
