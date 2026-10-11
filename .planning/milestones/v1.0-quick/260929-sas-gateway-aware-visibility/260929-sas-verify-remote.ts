#!/usr/bin/env tsx
/**
 * quick-260929-sas — 원격 적용 전후 대조 (게이트웨이 인지 가시성 · 마이그레이션 20260929190000).
 *
 * 래퍼 `260929-sas-verify-remote.sh` 로만 실행한다(env 로드 · relay 워크스페이스 경유).
 *
 *   selftest                 네트워크 없이 순수 함수 · 스냅샷 경로 규칙을 검증한다. 통과 시 `SELFTEST PASS`.
 *   snapshot [--out <경로>]  적용 **전**. KST 오늘 · 그 전 최근 거래일의 사용자별 ⑨ 행 수 · 옛 규칙 가시 집합 크기와
 *                            기대 시드(dma_user_id → 사용자 수)를 출력하고, 수치만 담은 JSON 을 스냅샷 경로에 쓴다.
 *   check [--baseline <경로>] 적용 **후**. C0~C6 을 `PASS|FAIL|SKIP <ID> <설명>` 으로 출력하고 끝줄 `ALL PASS` 또는
 *                            `FAIL <n>`. FAIL 이 있으면 종료 1.
 *
 * 스냅샷 경로는 고정이다 — 기본 `$HOME/.cache/gh-radar/260929-sas-baseline.json`(저장소 밖 · 디렉터리 0700 · 파일 0600).
 * 메인 세션의 Bash 호출 사이에는 셸 변수가 남지 않으므로 환경 변수가 아니라 고정 경로로 snapshot → push → check 를 잇는다.
 * `--out` · `--baseline` 은 덮어쓰기용이고, 저장소 안 경로는 거부한다.
 *
 * 안전 경계(T-sas-10):
 *   - 읽기 전용 — select · 조회 RPC 만 부른다. 쓰기 · DDL 없음.
 *   - `dma_credentials` 는 user_id · gateway · dma_user_id 만 select 한다(비밀번호 칸 조회 금지).
 *   - 출력의 사용자는 user_id 앞 8자, 계좌는 뒤 4자리만. 스냅샷 JSON 에는 수치(와 사용자 앞 8자 · 날짜 키)만.
 *   - env 값은 이 파일이 출력하지 않는다.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 타입은 relay 헬퍼에서 얻는다 — 이 파일은 relay 워크스페이스 밖이라 패키지 이름으로는 타입을 못 찾는다(런타임은 무관).
type SupabaseClient = ReturnType<typeof import("../../../relay/src/store/supabase.js").createRelaySupabase>;

// ============================================================
// 순수 함수 (selftest 대상)
// ============================================================

export type Cred = { user_id: string; gateway: string; dma_user_id: string };
export type Access = { gateway: string; dma_user_id: string; account_no: string };
export type Link = { user_id: string; gateway: string; dma_user_id: string };
/** 사용자 → "gateway|account_no" 집합. */
export type Visibility = Map<string, Set<string>>;

export const SEED_GATEWAY = "KYOBO";
export const DEFAULT_SNAPSHOT_REL = path.join(".cache", "gh-radar", "260929-sas-baseline.json");

const acctKey = (gateway: string, accountNo: string): string => `${gateway}|${accountNo}`;
const linkKey = (l: Link): string => `${l.user_id}|${l.gateway}|${l.dma_user_id}`;

function addTo(map: Visibility, user: string, key: string): void {
  let set = map.get(user);
  if (set === undefined) {
    set = new Set();
    map.set(user, set);
  }
  set.add(key);
}

/** 옛 규칙 — 자격증명 dma_user_id 문자열 ↔ **모든 게이트웨이** 매핑(20260924200100 ⑨ 조인). */
export function oldRuleVisible(creds: readonly Cred[], access: readonly Access[]): Visibility {
  const out: Visibility = new Map();
  for (const c of creds) {
    out.set(c.user_id, out.get(c.user_id) ?? new Set());
    for (const a of access) if (a.dma_user_id === c.dma_user_id) addTo(out, c.user_id, acctKey(a.gateway, a.account_no));
  }
  return out;
}

/**
 * 새 규칙 신원 — 뷰 dma_visibility_identities 그대로: 자격증명 전 행 UNION ALL 연결(자격증명이 있고 자격증명 gateway 와
 * 다를 때만).
 */
export function newRuleIdentities(creds: readonly Cred[], links: readonly Link[]): Link[] {
  const credOf = new Map(creds.map((c) => [c.user_id, c]));
  const out: Link[] = creds.map((c) => ({ user_id: c.user_id, gateway: c.gateway, dma_user_id: c.dma_user_id }));
  for (const l of links) {
    const c = credOf.get(l.user_id);
    if (c !== undefined && l.gateway !== c.gateway) out.push({ ...l });
  }
  return out;
}

/** 새 규칙 가시 집합 — 신원 ↔ 매핑을 (gateway, dma_user_id) 둘 다로 잇는다(dma_visible_accounts). */
export function newRuleVisible(creds: readonly Cred[], links: readonly Link[], access: readonly Access[]): Visibility {
  const out: Visibility = new Map();
  for (const c of creds) out.set(c.user_id, out.get(c.user_id) ?? new Set());
  for (const i of newRuleIdentities(creds, links)) {
    for (const a of access) {
      if (a.gateway === i.gateway && a.dma_user_id === i.dma_user_id) addTo(out, i.user_id, acctKey(a.gateway, a.account_no));
    }
  }
  return out;
}

/** 기대 시드 — KYOBO 매핑에 있는 dma_user_id 를 가진 자격증명 행마다 (user_id, 'KYOBO', dma_user_id). */
export function expectedSeed(creds: readonly Cred[], access: readonly Access[]): Link[] {
  const kyoboIds = new Set(access.filter((a) => a.gateway === SEED_GATEWAY).map((a) => a.dma_user_id));
  const seen = new Set<string>();
  const out: Link[] = [];
  for (const c of creds) {
    if (!kyoboIds.has(c.dma_user_id)) continue;
    const l = { user_id: c.user_id, gateway: SEED_GATEWAY, dma_user_id: c.dma_user_id };
    if (seen.has(linkKey(l))) continue;
    seen.add(linkKey(l));
    out.push(l);
  }
  return out;
}

export type SetDiff = { key: string; onlyLeft: string[]; onlyRight: string[] };

/** 키별 집합 비교 — 한쪽에만 있는 키는 빈 집합으로 본다. 차이가 없으면 빈 배열. */
export function compareVisibility(left: Visibility, right: Visibility): SetDiff[] {
  const keys = new Set([...left.keys(), ...right.keys()]);
  const diffs: SetDiff[] = [];
  for (const key of [...keys].sort()) {
    const l = left.get(key) ?? new Set<string>();
    const r = right.get(key) ?? new Set<string>();
    const onlyLeft = [...l].filter((x) => !r.has(x)).sort();
    const onlyRight = [...r].filter((x) => !l.has(x)).sort();
    if (onlyLeft.length > 0 || onlyRight.length > 0) diffs.push({ key, onlyLeft, onlyRight });
  }
  return diffs;
}

/** 연결 집합 비교(순서 무관). */
export function sameLinks(a: readonly Link[], b: readonly Link[]): boolean {
  const sa = new Set(a.map(linkKey));
  const sb = new Set(b.map(linkKey));
  return sa.size === sb.size && [...sa].every((k) => sb.has(k));
}

/** 기대 시드를 dma_user_id → 사용자 수로. */
export function seedCounts(seed: readonly Link[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of seed) out[l.dma_user_id] = (out[l.dma_user_id] ?? 0) + 1;
  return out;
}

/** 경로가 루트 안(루트 자신 포함)인가. */
function isInside(target: string, root: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * 스냅샷 경로 — 인자가 없으면 `$HOME/.cache/gh-radar/260929-sas-baseline.json`. 상대 경로는 `baseCwd` 기준.
 * 저장소 안으로 풀리면 throw(스냅샷이 실수로 커밋되지 않게).
 */
export function resolveSnapshotPath(opt: string | undefined, home: string, repoRoot: string, baseCwd: string): string {
  const resolved = opt === undefined ? path.join(home, DEFAULT_SNAPSHOT_REL) : path.resolve(baseCwd, opt);
  if (isInside(resolved, path.resolve(repoRoot))) {
    throw new Error("스냅샷 경로가 저장소 안입니다 — 저장소 밖 경로만 허용합니다");
  }
  return resolved;
}

const short = (userId: string): string => userId.slice(0, 8);
const tail4 = (key: string): string => {
  const [gw, acct] = key.split("|");
  return `${gw}:…${(acct ?? "").slice(-4)}`;
};

// ============================================================
// selftest (네트워크 0)
// ============================================================

function selftest(repoRoot: string): number {
  let fails = 0;
  const check = (ok: boolean, label: string): void => {
    console.log(`${ok ? "ok" : "not ok"} - ${label}`);
    if (!ok) fails += 1;
  };

  const U1 = "11111111-aaaa-4000-8000-000000000001";
  const U2 = "22222222-aaaa-4000-8000-000000000002";
  const U3 = "33333333-aaaa-4000-8000-000000000003";
  const creds: Cred[] = [
    { user_id: U1, gateway: "KB", dma_user_id: "shared" },
    { user_id: U2, gateway: "KB", dma_user_id: "shared" },
    { user_id: U3, gateway: "KB", dma_user_id: "solo" },
  ];
  const access: Access[] = [
    { gateway: "KB", dma_user_id: "shared", account_no: "1000000001" },
    { gateway: "KB", dma_user_id: "solo", account_no: "1000000002" },
    { gateway: "KYOBO", dma_user_id: "shared", account_no: "2000000011" },
    { gateway: "KYOBO", dma_user_id: "other", account_no: "2000000012" },
  ];

  const seed = expectedSeed(creds, access);
  check(
    sameLinks(seed, [
      { user_id: U1, gateway: "KYOBO", dma_user_id: "shared" },
      { user_id: U2, gateway: "KYOBO", dma_user_id: "shared" },
    ]),
    "기대 시드 = 공유 문자열 2명 · KYOBO 매핑 없는 단독 사용자 제외",
  );
  check(JSON.stringify(seedCounts(seed)) === JSON.stringify({ shared: 2 }), "seedCounts = { shared: 2 }");

  const oldV = oldRuleVisible(creds, access);
  check(
    [...(oldV.get(U1) ?? [])].sort().join(",") === "KB|1000000001,KYOBO|2000000011" &&
      [...(oldV.get(U3) ?? [])].join(",") === "KB|1000000002",
    "옛 규칙 — 문자열이 모든 게이트웨이와 잇는다",
  );

  const newV = newRuleVisible(creds, seed, access);
  check(compareVisibility(oldV, newV).length === 0, "시드 적용 뒤 새 규칙 = 옛 규칙(가시성 불변)");

  const dropped = seed.filter((l) => l.user_id !== U2);
  const diffDrop = compareVisibility(oldV, newRuleVisible(creds, dropped, access));
  check(
    diffDrop.length === 1 && diffDrop[0]?.key === U2 && diffDrop[0]?.onlyLeft.join(",") === "KYOBO|2000000011",
    "연결에서 한 사람을 빼면 비교기가 그 사람의 KYOBO 계좌 불일치를 잡는다",
  );

  // 충돌 픽스처 — 적용 뒤 교보에 KB 단독 사용자(U3)와 같은 문자열 'solo' 가 다른 사람 계좌로 들어왔다.
  const collided = [...access, { gateway: "KYOBO", dma_user_id: "solo", account_no: "2000000013" }];
  const diffCollide = compareVisibility(oldRuleVisible(creds, collided), newRuleVisible(creds, seed, collided));
  check(
    diffCollide.length === 1 && diffCollide[0]?.key === U3 && diffCollide[0]?.onlyLeft.join(",") === "KYOBO|2000000013",
    "충돌 픽스처 — 옛 규칙은 U3 에 새 교보 계좌를 새게 하고 새 규칙은 막는다(불일치 검출)",
  );
  check(!sameLinks(seed, expectedSeed(creds, collided)), "충돌 픽스처 — 현재 데이터 기준 기대 시드가 달라져 C1 이 잡는다");

  const ignored = newRuleVisible(
    creds,
    [
      { user_id: U3, gateway: "KB", dma_user_id: "shared" }, // 자기 게이트웨이 연결 — 무시
      { user_id: "44444444-aaaa-4000-8000-000000000004", gateway: "KYOBO", dma_user_id: "shared" }, // 자격증명 없음 — 무시
    ],
    access,
  );
  check(
    [...(ignored.get(U3) ?? [])].join(",") === "KB|1000000002" && !ignored.has("44444444-aaaa-4000-8000-000000000004"),
    "자기 게이트웨이 연결 · 자격증명 없는 연결은 무시",
  );

  const home = os.homedir();
  const def = resolveSnapshotPath(undefined, home, repoRoot, repoRoot);
  check(def === path.join(home, DEFAULT_SNAPSHOT_REL) && !isInside(def, repoRoot), "기본 스냅샷 경로는 저장소 밖 $HOME/.cache/gh-radar");
  let rejectedAbs = false;
  try {
    resolveSnapshotPath(path.join(repoRoot, "baseline.json"), home, repoRoot, repoRoot);
  } catch {
    rejectedAbs = true;
  }
  let rejectedRel = false;
  try {
    resolveSnapshotPath(".planning/x.json", home, repoRoot, repoRoot);
  } catch {
    rejectedRel = true;
  }
  check(rejectedAbs && rejectedRel, "저장소 안 경로(절대 · 상대)는 거부");

  if (fails > 0) {
    console.log(`SELFTEST FAIL ${fails}`);
    return 1;
  }
  console.log("SELFTEST PASS");
  return 0;
}

// ============================================================
// 원격 조회 (읽기 전용)
// ============================================================

const PAGE = 1000;

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(pgMessage(error));
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function pgMessage(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown };
  return `${typeof e.code === "string" ? e.code : "?"} ${typeof e.message === "string" ? e.message.slice(0, 160) : ""}`.trim();
}

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

async function loadCreds(db: SupabaseClient, withGateway: boolean): Promise<Cred[]> {
  // 비밀번호 칸은 조회하지 않는다. 적용 전에는 gateway 칸이 없으므로 KB 로 본다.
  const rows = await fetchAll<{ user_id: string; dma_user_id: string; gateway?: string }>((f, t) =>
    db.from("dma_credentials").select(withGateway ? "user_id,gateway,dma_user_id" : "user_id,dma_user_id").range(f, t),
  );
  return rows.map((r) => ({ user_id: r.user_id, gateway: r.gateway ?? "KB", dma_user_id: r.dma_user_id }));
}

async function loadAccess(db: SupabaseClient): Promise<Access[]> {
  return fetchAll<Access>((f, t) => db.from("dma_account_access").select("gateway,dma_user_id,account_no").range(f, t));
}

async function loadLinks(db: SupabaseClient): Promise<Link[]> {
  return fetchAll<Link>((f, t) => db.from("dma_gateway_identities").select("user_id,gateway,dma_user_id").range(f, t));
}

/** KST 오늘과 그 전 최근 거래일(dma_account_orders 기준 · 없으면 생략). */
async function tradeDates(db: SupabaseClient): Promise<string[]> {
  const today = kstToday();
  const { data, error } = await db
    .from("dma_account_orders")
    .select("trade_date")
    .lt("trade_date", today)
    .order("trade_date", { ascending: false })
    .limit(1);
  if (error) throw new Error(pgMessage(error));
  const prev = (data as Array<{ trade_date: string }> | null)?.[0]?.trade_date;
  return prev === undefined ? [today] : [today, prev];
}

type OrderRow = { id?: string; gateway: string; account_no: string; trade_date: string };

async function loadOrders(db: SupabaseClient, dates: readonly string[]): Promise<OrderRow[]> {
  return fetchAll<OrderRow>((f, t) =>
    db.from("dma_account_orders").select("gateway,account_no,trade_date").in("trade_date", [...dates]).range(f, t),
  );
}

async function journalRows(db: SupabaseClient, userId: string, date: string): Promise<Array<{ id: string }>> {
  return fetchAll<{ id: string }>((f, t) =>
    db.rpc("dma_journal_orders_for_user", { p_user_id: userId, p_trade_date: date }).select("id").range(f, t),
  );
}

function countVisibleOrders(orders: readonly OrderRow[], visible: Set<string> | undefined, date: string): number {
  if (visible === undefined) return 0;
  return orders.filter((o) => o.trade_date === date && visible.has(acctKey(o.gateway, o.account_no))).length;
}

function byGateway(set: Set<string> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of set ?? []) {
    const gw = k.split("|")[0] ?? "?";
    out[gw] = (out[gw] ?? 0) + 1;
  }
  return out;
}

type Baseline = {
  createdAt: string;
  dates: string[];
  users: Record<string, { gateways: Record<string, number>; rows: Record<string, number> }>;
  seed: { links: number; users: number };
};

function writeBaseline(file: string, baseline: Baseline): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

function readBaseline(file: string): Baseline | null {
  if (!existsSync(file)) return null;
  try {
    const b = JSON.parse(readFileSync(file, "utf8")) as Baseline;
    if (!Array.isArray(b.dates) || typeof b.users !== "object" || b.users === null) return null;
    return b;
  } catch {
    return null;
  }
}

async function serviceClient(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 비어 있다(값은 출력하지 않는다)");
  const { createRelaySupabase } = await import("../../../relay/src/store/supabase.js");
  return createRelaySupabase(url, key);
}

async function snapshot(file: string): Promise<number> {
  const db = await serviceClient();
  const [creds, access, dates] = await Promise.all([loadCreds(db, false), loadAccess(db), tradeDates(db)]);
  const orders = await loadOrders(db, dates);
  const oldV = oldRuleVisible(creds, access);
  const seed = expectedSeed(creds, access);

  const baseline: Baseline = {
    createdAt: new Date().toISOString(),
    dates,
    users: {},
    seed: { links: seed.length, users: new Set(seed.map((l) => l.user_id)).size },
  };
  console.log(`# 적용 전 스냅샷 — 날짜 ${dates.join(" · ")} (KST 오늘 · 최근 거래일)`);
  for (const c of creds) {
    const rows: Record<string, number> = {};
    for (const d of dates) rows[d] = (await journalRows(db, c.user_id, d)).length;
    const gateways = byGateway(oldV.get(c.user_id));
    baseline.users[short(c.user_id)] = { gateways, rows };
    const clientRows = dates.map((d) => countVisibleOrders(orders, oldV.get(c.user_id), d));
    console.log(
      `user ${short(c.user_id)} · 옛 규칙 가시 계좌 ${JSON.stringify(gateways)} · ⑨ 행 ${dates
        .map((d, i) => `${d}=${rows[d]}(옛 규칙 계산 ${clientRows[i]})`)
        .join(" ")}`,
    );
  }
  console.log(`기대 시드 (dma_user_id → 사용자 수): ${JSON.stringify(seedCounts(seed))} · 연결 ${seed.length}행`);
  writeBaseline(file, baseline);
  console.log(file);
  return 0;
}

async function check(file: string): Promise<number> {
  let fails = 0;
  const emit = (status: "PASS" | "FAIL" | "SKIP", id: string, desc: string): void => {
    if (status === "FAIL") fails += 1;
    console.log(`${status} ${id} ${desc}`);
  };

  const baseline = readBaseline(file);
  if (baseline === null) {
    // 원격 조회 전에 멈춘다.
    console.log("FAIL C0 스냅샷 없음 — 먼저 snapshot");
    console.log("FAIL 1");
    return 1;
  }
  emit("PASS", "C0", `스냅샷 ${baseline.createdAt} · 날짜 ${baseline.dates.join(" · ")}`);

  const db = await serviceClient();
  const [creds, access, links] = await Promise.all([loadCreds(db, true), loadAccess(db), loadLinks(db)]);
  const dates = baseline.dates;
  const orders = await loadOrders(db, dates);
  const oldV = oldRuleVisible(creds, access);
  const newV = newRuleVisible(creds, links, access);
  const users = [...new Set([...creds.map((c) => c.user_id), ...links.map((l) => l.user_id)])].sort();

  // C1 연결 = 기대 시드
  const seed = expectedSeed(creds, access);
  if (sameLinks(links, seed)) {
    emit("PASS", "C1", `연결 ${links.length}행 = 기대 시드 ${JSON.stringify(seedCounts(seed))}`);
  } else {
    emit("FAIL", "C1", `연결 ${links.length}행 ≠ 기대 시드 ${seed.length}행 (연결 ${JSON.stringify(seedCounts(links))} · 기대 ${JSON.stringify(seedCounts(seed))})`);
  }

  // C2 사용자별 dma_visible_accounts = 옛 규칙 = 클라이언트 새 규칙
  const rpcV: Map<string, Set<string>> = new Map();
  for (const u of users) {
    const rows = await fetchAll<{ gateway: string; account_no: string }>((f, t) =>
      db.rpc("dma_visible_accounts", { p_user_id: u }).select("gateway,account_no").range(f, t),
    );
    rpcV.set(u, new Set(rows.map((r) => acctKey(r.gateway, r.account_no))));
  }
  const d1 = compareVisibility(rpcV, oldV);
  const d2 = compareVisibility(rpcV, newV);
  if (d1.length === 0 && d2.length === 0) {
    emit("PASS", "C2", `사용자 ${users.length}명 가시 집합 = 옛 규칙 = 새 규칙(클라이언트) · ${users.map((u) => `${short(u)} ${JSON.stringify(byGateway(rpcV.get(u)))}`).join(" · ")}`);
  } else {
    const show = (d: SetDiff[]): string =>
      d.map((x) => `${short(x.key)} RPC만[${x.onlyLeft.map(tail4).join(",")}] 기대만[${x.onlyRight.map(tail4).join(",")}]`).join(" ; ");
    emit("FAIL", "C2", `가시 집합 불일치 — vs 옛 규칙: ${show(d1) || "없음"} / vs 새 규칙: ${show(d2) || "없음"}`);
  }

  // C3 사용자별 · 날짜별 ⑨ 행 수 = 옛 규칙 계산, ≥ baseline
  const c3: string[] = [];
  let c3fail = false;
  const firstVisibleOrder = new Map<string, string>();
  for (const u of users) {
    for (const d of dates) {
      const rows = await journalRows(db, u, d);
      if (rows[0] !== undefined && !firstVisibleOrder.has(u)) firstVisibleOrder.set(u, rows[0].id);
      const expected = countVisibleOrders(orders, oldV.get(u), d);
      const base = baseline.users[short(u)]?.rows[d];
      const delta = base === undefined ? "기준 없음" : `기준 ${base}${rows.length - base !== 0 ? ` (${rows.length - base > 0 ? "+" : ""}${rows.length - base})` : ""}`;
      if (rows.length !== expected || (base !== undefined && rows.length < base)) c3fail = true;
      c3.push(`${short(u)} ${d}=${rows.length}/옛규칙 ${expected}/${delta}`);
    }
  }
  emit(c3fail ? "FAIL" : "PASS", "C3", `⑨ 행 수 — ${c3.join(" · ")}`);

  // C4 뷰 gateway=KYOBO 행 수 = KYOBO 연결 수
  const viewRows = await fetchAll<{ user_id: string }>((f, t) =>
    db.from("dma_visibility_identities").select("user_id").eq("gateway", SEED_GATEWAY).range(f, t),
  );
  const kyoboLinks = links.filter((l) => l.gateway === SEED_GATEWAY).length;
  emit(
    viewRows.length === kyoboLinks ? "PASS" : "FAIL",
    "C4",
    `뷰 gateway=${SEED_GATEWAY} ${viewRows.length}행 · 연결 ${kyoboLinks}행`,
  );

  // C5 전략 조회 RPC 2종 오류 없음
  const today = kstToday();
  let c5fail = false;
  const c5: string[] = [];
  for (const u of users) {
    const { error } = await db.rpc("dma_strategy_events_for_user", { p_user_id: u, p_trade_date: today }).limit(1);
    if (error) {
      c5fail = true;
      c5.push(`${short(u)} 전략 목록 오류 ${pgMessage(error)}`);
    }
    const oid = firstVisibleOrder.get(u);
    if (oid !== undefined) {
      const { data, error: e2 } = await db.rpc("dma_order_events_for_user", { p_user_id: u, p_order_id: oid, p_order_nos: null });
      const n = Array.isArray(data) ? data.length : 0;
      if (e2 || n < 1) {
        c5fail = true;
        c5.push(`${short(u)} 주문 이벤트 ${e2 ? `오류 ${pgMessage(e2)}` : "0행"}`);
      } else {
        c5.push(`${short(u)} 주문 이벤트 ${n}행`);
      }
    } else {
      c5.push(`${short(u)} 가시 주문 없음(주문 이벤트 생략)`);
    }
  }
  emit(c5fail ? "FAIL" : "PASS", "C5", `전략 조회 RPC — ${c5.join(" · ")}`);

  // C6 anon 거부
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    emit("SKIP", "C6", "SUPABASE_ANON_KEY 없음 — anon 거부 확인 생략");
  } else {
    const { createRelaySupabase } = await import("../../../relay/src/store/supabase.js");
    const anon = createRelaySupabase(process.env.SUPABASE_URL ?? "", anonKey);
    const probe = "00000000-0000-4000-8000-000000000000";
    const r1 = await anon.from("dma_gateway_identities").select("user_id").limit(1);
    const r2 = await anon.from("dma_visibility_identities").select("user_id").limit(1);
    const r3 = await anon.rpc("dma_visible_accounts", { p_user_id: probe });
    const denied = [r1, r2, r3].map((r) => r.error !== null);
    emit(
      denied.every(Boolean) ? "PASS" : "FAIL",
      "C6",
      `anon 거부 (연결 테이블, 뷰, dma_visible_accounts) = (${denied.map((x) => (x ? "거부" : "허용")).join(", ")})`,
    );
  }

  console.log(fails === 0 ? "ALL PASS" : `FAIL ${fails}`);
  return fails === 0 ? 0 : 1;
}

// ============================================================
// 진입점
// ============================================================

function argOf(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`${flag} 에 경로가 필요합니다`);
  return v;
}

async function main(): Promise<number> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const [mode, ...rest] = process.argv.slice(2);
  const baseCwd = process.env.SAS_VERIFY_CWD ?? process.cwd();
  switch (mode) {
    case "selftest":
      return selftest(repoRoot);
    case "snapshot":
      return snapshot(resolveSnapshotPath(argOf(rest, "--out"), os.homedir(), repoRoot, baseCwd));
    case "check":
      return check(resolveSnapshotPath(argOf(rest, "--baseline"), os.homedir(), repoRoot, baseCwd));
    default:
      console.error("사용법: 260929-sas-verify-remote.sh selftest | snapshot [--out <경로>] | check [--baseline <경로>]");
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
