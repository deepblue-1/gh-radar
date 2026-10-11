/**
 * Phase 29 (29-04) — Admin op 계획기: (DMA 유저, 서버) 하나에 무엇을 보낼까.
 *
 * **판정은 shared `diffServerAccounts` — 여기는 op 로 옮기기만 한다.** 개요 칩(`deriveAdminUsersOverview`)
 * 이 같은 diff 를 읽으므로 「보낼 op」 와 「그릴 칩」 이 갈라지지 않는다. 와이어(44 `AdminCommandReq`) 변환 ·
 * 비밀번호 주입 · 순차 전송은 dispatcher(29-11) 몫이다.
 *
 * 규칙(D-23 ⑤ · gh-trade 인박스 노트 261006 · StockDMA.fbs 주석):
 *   - 87 이 없으면(`no-snapshot`) 아무것도 보내지 않는다 — 서버 상태를 모르고 쓰지 않는다.
 *   - 유저가 서버에 없고 active 계좌가 있으면 op 1(첫 계좌 = priority → accountNo 순, 신규 = 비밀번호 + 첫 계좌
 *     필수) + 나머지 op 3. 유저가 있으면 없는 · 값이 다른 active 계좌만 op 3(추가 또는 같은 account_no 갱신).
 *   - `removing` 계좌는 87 에 있을 때만 op 4(op 4 는 멱등이 아니다 — 없는 계좌는 8). 87 에 없으면 즉시 settle.
 *   - active 가 0 이고 removing 이 그 서버의 그 유저 계좌 전부면 op 4 대신 op 2(마지막 계좌 제거 = 12 회피). op 2 는 그 removing
 *     계좌번호를 싣는다 — settle 이 계획 시점 스냅샷만 지우게(29-32 WR-01).
 *   - 의도에 없는 87 계좌(「서버에만 있음」)는 절대 지우지 않는다 — 하나라도 남으면 op 2 도 보내지 않는다.
 *   - 순서는 op 1 → op 3 → op 4 — 추가가 먼저라 「제거 뒤 계좌 0개」 순간이 생기지 않는다.
 *   - op 1 · op 3 은 그 계좌 87 의 주문자 IP/MAC 을 되싣는다(GC-02 — 서버 계좌 설정 보존 · 서버는 빈 값을 「미설정」 으로
 *     되돌린다). 의도에 값이 있으면 의도 쌍이 이기고, 그 유저 87 에 없는 계좌는 같은 87 다른 유저의 같은 정규화 계좌번호 값
 *     (Phase 30 R3-02 · D-16 — gh-trade code 7 범위: 다른 사용자의 같은 계좌는 IP/MAC 도 같아야 한다), 그것도 없으면 빈 문자열
 *     (= 미설정)이다. 다른 유저 값은 읽기만 한다(D-11 — 그 유저에는 op 없음). 값은 정규화 · 검증하지 않는다.
 *
 * 순수 함수 — 소켓 · DB 없음.
 */
import {
  compareAccounts,
  diffServerAccounts,
  normalizeAccountNo,
  type AdminAccountFields,
  type AdminIntentRow,
} from "@gh-radar/shared";

/** 보낼 44 op 1개. op 1 의 비밀번호는 dispatcher 가 채운다. */
export type PlannedOp =
  | { op: 1; account: AdminAccountFields }
  | { op: 1; passwordOnly: true }
  /**
   * `accountNos` = 계획 때 87 에 있던 그 서버의 removing 계좌 — op 2 ok 면 dispatcher 가 이 행만 settle 한다(29-32 WR-01:
   * 그 사이 다른 계좌에 그 서버가 active 로 막 체크돼도 지우지 않는다). 와이어(44 op 2)에는 싣지 않는다.
   */
  | { op: 2; accountNos: string[] }
  | { op: 3; account: AdminAccountFields }
  | { op: 4; accountNo: string };

export interface ServerPlan {
  /** `no-snapshot` = 그 서버 87 을 아직 못 받음 → ops 빈 배열. */
  status: "ready" | "no-snapshot";
  ops: PlannedOp[];
  /** 87 에 이미 없는 removing 계좌 번호 — 보낼 것 없이 의도에서 정리한다. */
  settleRemoved: string[];
}

/** 87 의 서버 1대 users.toml — relay 가 받은 87 그대로(유저 = 파일 순 · 계좌 = priority 순). */
export interface AdminSnapshotView {
  users: { userId: string; accounts: AdminAccountFields[] }[];
}

export interface PlanServerOpsInput {
  dmaUserId: string;
  serverKey: string;
  /** 그 유저 · 그 서버의 의도 행(다른 행이 섞여 와도 걸러 낸다). */
  intent: AdminIntentRow[];
  snapshot: AdminSnapshotView | null;
}

function fieldsOf(r: AdminIntentRow): AdminAccountFields {
  return {
    accountNo: r.accountNo,
    name: r.name,
    branchNo: r.branchNo,
    traderId: r.traderId,
    priority: r.priority,
    // 지금 DB 의도는 두 필드가 없다 — 있을 때만 옮긴다(없음 = 87 값 보존).
    ...(r.orderIp !== undefined ? { orderIp: r.orderIp } : {}),
    ...(r.orderMac !== undefined ? { orderMac: r.orderMac } : {}),
  };
}

/**
 * op 1 · op 3 계좌에 주문자 IP/MAC 을 채운다(GC-02). 의도에 어느 한쪽이라도 있으면 **의도 쌍**(빈 쪽 = 빈 문자열 — 87 값과
 * 섞으면 서버의 「둘 다 또는 둘 다 비움」 규칙을 relay 가 몰래 깨뜨린다), 아니면 계획 시점 87 의 그 계좌 값(없으면 빈 문자열).
 */
function withServerEndpoint(account: AdminAccountFields, snap: AdminAccountFields | undefined): AdminAccountFields {
  const src = account.orderIp !== undefined || account.orderMac !== undefined ? account : snap;
  return { ...account, orderIp: src?.orderIp ?? "", orderMac: src?.orderMac ?? "" };
}

/**
 * (유저, 서버) 의 의도와 87 의 차이를 op 열로.
 */
export function planServerOps(input: PlanServerOpsInput): ServerPlan {
  if (!input.snapshot) return { status: "no-snapshot", ops: [], settleRemoved: [] };

  const rows = input.intent.filter(
    (r) => r.dmaUserId === input.dmaUserId && r.serverKey === input.serverKey,
  );
  const active = rows.filter((r) => r.state === "active").map(fieldsOf);
  const snapUser = input.snapshot.users.find((u) => u.userId === input.dmaUserId) ?? null;
  const diff = diffServerAccounts({
    active,
    removing: rows.filter((r) => r.state === "removing").map(fieldsOf),
    snapshotUser: snapUser ? { accounts: snapUser.accounts } : null,
    snapshotKnown: true,
  });
  if (!diff.known) return { status: "no-snapshot", ops: [], settleRemoved: [] };

  const ops: PlannedOp[] = [];

  // 87 의 그 유저 계좌 — 정규화 번호 → 계좌(diff 와 같은 키 · 같은 번호가 둘이면 앞의 것). diff 가 내는 계좌는 이미 정규화 번호다.
  const snapByNo = new Map<string, AdminAccountFields>();
  for (const a of snapUser?.accounts ?? []) {
    const k = normalizeAccountNo(a.accountNo);
    if (!snapByNo.has(k)) snapByNo.set(k, a);
  }
  // R3-02(Phase 30 · D-16) — 같은 87 의 **다른 유저**가 IP/MAC 과 함께 가진 계좌(87 순 · 같은 키는 앞의 것). 이 유저 87 에 없는
  // 계좌를 추가할 때(op 1 첫 계좌 · op 3) 그 값을 되싣는다 — gh-trade code 7 은 다른 사용자의 같은 계좌에 IP/MAC 도 같기를 요구한다.
  // 읽기만 한다 — 다른 유저에게는 op 를 만들지 않는다(D-11).
  const otherByNo = new Map<string, AdminAccountFields>();
  for (const u of input.snapshot.users) {
    if (u.userId === input.dmaUserId) continue;
    for (const a of u.accounts) {
      if (!a.orderIp && !a.orderMac) continue;
      const k = normalizeAccountNo(a.accountNo);
      if (!otherByNo.has(k)) otherByNo.set(k, a);
    }
  }
  // 우선순위(withServerEndpoint): 의도/override 쌍 > 이 유저 87 > 다른 유저 87 > 빈 문자열.
  const sendable = (a: AdminAccountFields): AdminAccountFields =>
    withServerEndpoint(a, snapByNo.get(a.accountNo) ?? otherByNo.get(a.accountNo));

  // ① 추가 · 갱신 — 유저가 없으면 첫 계좌(priority → accountNo 순)를 op 1 에 싣고 나머지는 op 3.
  if (diff.userPresent) {
    for (const account of [...diff.missing, ...diff.changed].sort(compareAccounts)) {
      ops.push({ op: 3, account: sendable(account) });
    }
  } else {
    const [first, ...rest] = diff.missing;
    if (first) {
      ops.push({ op: 1, account: sendable(first) });
      for (const account of rest) ops.push({ op: 3, account: sendable(account) });
    }
  }

  // ② 제거 — 87 에 있는 removing 계좌만. active 가 0 이고 그 유저의 87 계좌가 전부 removing 이면
  //    op 4 는 마지막 계좌에서 12 LAST_ACCOUNT 가 되므로 op 2(유저 삭제) 한 번으로 보낸다.
  //    87 에만 있는 계좌(diff.serverOnly)가 하나라도 남으면 유저를 지우지 않는다(D-23 ⑤).
  //    그 유저가 서버의 마지막 사용자면 op 2 도 12 로 거부된다(gh-trade 인박스 261007) — 서버별 실패 칩으로
  //    남고 removing 행은 settle 하지 않는다(서버 실제 상태와 같다).
  if (diff.toRemove.length > 0) {
    if (active.length === 0 && diff.serverOnly.length === 0) {
      ops.push({ op: 2, accountNos: diff.toRemove.map((a) => a.accountNo) });
    } else {
      for (const a of diff.toRemove) ops.push({ op: 4, accountNo: a.accountNo });
    }
  }

  return {
    status: "ready",
    ops,
    settleRemoved: diff.settledRemovals.map((a) => a.accountNo),
  };
}

/**
 * 비밀번호 변경 — 87 에 유저가 있는 서버에만 op 1(비밀번호만, account 무시). 유저가 없는 서버는 계좌 경로
 * (`planServerOps` 의 op 1 신규)가 비밀번호와 함께 만든다.
 */
export function planPasswordOps(input: {
  dmaUserId: string;
  snapshot: AdminSnapshotView | null;
}): ServerPlan {
  if (!input.snapshot) return { status: "no-snapshot", ops: [], settleRemoved: [] };
  const present = input.snapshot.users.some((u) => u.userId === input.dmaUserId);
  return {
    status: "ready",
    ops: present ? [{ op: 1, passwordOnly: true }] : [],
    settleRemoved: [],
  };
}
