/**
 * Phase 29 (29-04) — Admin op 계획기: (DMA 유저, 서버) 하나에 무엇을 보낼까.
 *
 * **판정은 shared `diffServerAccounts` — 여기는 op 로 옮기기만 한다.** 개요 칩(`deriveAdminUsersOverview`)
 * 이 같은 diff 를 읽으므로 「보낼 op」 와 「그릴 칩」 이 갈라지지 않는다. 와이어(44 `AdminCommandReq`) 변환 ·
 * 비밀번호 주입 · 순차 전송은 dispatcher(29-11) 몫이다.
 *
 * gh-trade 규칙(인박스 노트 261006 · StockDMA.fbs 주석):
 *   - op 1 신규 유저 = 비밀번호 + 첫 계좌 필수(계좌 0개 유저 불허).
 *   - 87 이 없으면(`no-snapshot`) 아무것도 보내지 않는다 — 서버 상태를 모르고 쓰지 않는다.
 *
 * 순수 함수 — 소켓 · DB 없음.
 */
import { diffServerAccounts, type AdminAccountFields, type AdminIntentRow } from "@gh-radar/shared";

/** 보낼 44 op 1개. op 1 의 비밀번호는 dispatcher 가 채운다. */
export type PlannedOp =
  | { op: 1; account: AdminAccountFields }
  | { op: 1; passwordOnly: true }
  | { op: 2 }
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
  };
}

/**
 * (유저, 서버) 의 의도와 87 의 차이를 op 열로.
 */
export function planServerOps(input: PlanServerOpsInput): ServerPlan {
  if (!input.snapshot) return { status: "no-snapshot", ops: [], settleRemoved: [] };

  const rows = input.intent.filter(
    (r) => r.dmaUserId === input.dmaUserId && r.serverKey === input.serverKey,
  );
  const snapUser = input.snapshot.users.find((u) => u.userId === input.dmaUserId) ?? null;
  const diff = diffServerAccounts({
    active: rows.filter((r) => r.state === "active").map(fieldsOf),
    removing: rows.filter((r) => r.state === "removing").map(fieldsOf),
    snapshotUser: snapUser ? { accounts: snapUser.accounts } : null,
    snapshotKnown: true,
  });
  if (!diff.known) return { status: "no-snapshot", ops: [], settleRemoved: [] };

  const ops: PlannedOp[] = [];
  if (!diff.userPresent) {
    const [first] = diff.missing;
    if (first) ops.push({ op: 1, account: first });
  }
  return { status: "ready", ops, settleRemoved: [] };
}
