/**
 * Phase 29 Plan 02 — ADMIN-04/05. gh-trade admin 관리 와이어(44 · 86 · 87)의 relay 쪽 값 · 타입 정본.
 *
 * 계약: gh-trade Phase 29 D-04~D-09 · `.fbs` 확정 커밋 92cdfbff · `server/src/protocol/StockDMA.fbs`
 * blob 03fc8cbe(안정 식별자 — 병합 방식에 따라 커밋 해시는 달라져도 blob 은 같다).
 *
 * - admin 연결은 같은 관찰자 비밀로 **role 2** 를 연다(`ObserverLoginReq` 5). 어떤 Session 에도 붙지 않고
 *   4(LivePing) · 44 만 처리한다. 79 는 role 2 · accounts 빈 벡터 · journal_epoch "" · 78/80 없음.
 * - **코드 분기는 `code` 로, `message` 는 화면 표시용 한국어 그대로**(D-23 ④). message 문구를 파싱하지 않는다.
 * - 계좌번호는 서버 정규화값(NormalizeAccountNo) 그대로 둔다 — relay 가 재정규화하지 않는다(journal/access.ts Pitfall 7).
 * - 교보 서버 계좌는 `branchNo` · `traderId` 가 **빈 문자열**이다(D-23 ③) — 빈 값을 채우거나 거르지 않는다.
 * - 비밀번호는 44 의 op 1 요청에만 실리고 86/87 어디에도 없다. 로그 인자로 넘기지 않는다.
 */

/** admin 관찰자 역할 번호 (`ObserverLoginReq.role` / `ObserverLoginResp.role`). 0 = journal · 1 = quote · 2 = admin. */
export const ADMIN_ROLE = 2;

/**
 * 44 `AdminCommandReq.op`.
 * - 1 UpsertUser — 신규 = 비밀번호 + 첫 계좌 필수 · 기존 = 비밀번호만(빈 값 = 유지, account 무시)
 * - 2 DeleteUser — BUSY 검사 뒤 붙은 연결에 54 INFO 후 종료
 * - 3 SetAccount — 추가 또는 같은 account_no 갱신(branch/trader 변경은 BUSY 면 9)
 * - 4 RemoveAccount — account_no 만 · 멱등 아님(없는 계좌 = 8) · 마지막 계좌 = 12
 * - 5 ListUsers — 87 만 돌아온다
 */
export const ADMIN_OP = {
  UpsertUser: 1,
  DeleteUser: 2,
  SetAccount: 3,
  RemoveAccount: 4,
  ListUsers: 5,
} as const;

/** `ADMIN_OP` 값 유니온. */
export type AdminOp = (typeof ADMIN_OP)[keyof typeof ADMIN_OP];

/** 86 `AdminCommandResp.code` (D-05). 분기는 이 값으로만 한다. */
export const ADMIN_CODE = {
  Ok: 0,
  BadOp: 1,
  BadUserId: 2,
  BadPassword: 3,
  NoSuchUser: 4,
  BadAccountNo: 5,
  /** KB 서버만 — branch_no 5자 · trader_id 6자 위반. */
  BadBranchTrader: 6,
  AccountConflict: 7,
  NoSuchAccount: 8,
  /** 계좌 상태(상따 · VI 슬롯 · VI 감시 · 미체결 · 예약)로만 판정 — message 에 건수 문구가 실린다. */
  Busy: 9,
  PersistFailed: 10,
  NotAdmin: 11,
  LastAccount: 12,
} as const;

/** `ADMIN_CODE` 값 유니온. 와이어는 ushort 라 미래 값이 올 수 있어 결과 타입은 `number` 로 받는다. */
export type AdminCode = (typeof ADMIN_CODE)[keyof typeof ADMIN_CODE];

/** 로그용 영문 이름 (gh-trade 상수명). 화면 표시는 `message` 를 쓴다. */
export const ADMIN_CODE_NAME: Readonly<Record<number, string>> = {
  0: "OK",
  1: "BAD_OP",
  2: "BAD_USER_ID",
  3: "BAD_PASSWORD",
  4: "NO_SUCH_USER",
  5: "BAD_ACCOUNT_NO",
  6: "BAD_BRANCH_TRADER",
  7: "ACCOUNT_CONFLICT",
  8: "NO_SUCH_ACCOUNT",
  9: "BUSY",
  10: "PERSIST_FAILED",
  11: "NOT_ADMIN",
  12: "LAST_ACCOUNT",
};

/** `AdminAccount` 테이블 — 44 의 `account` · 87 의 `users[].accounts[]`. */
export type AdminAccount = {
  /** 서버 정규화값 그대로(재정규화 금지). */
  accountNo: string;
  name: string;
  /** KB = 5자 · 교보 = 빈 문자열. */
  branchNo: string;
  /** KB = 6자 · 교보 = 빈 문자열. */
  traderId: string;
  priority: number;
};

/** 44 조립 입력. */
export type AdminCommandInput = {
  /** ulong — 86 에 에코된다. bigint 그대로(정밀도 손실 금지). */
  requestId: bigint;
  op: AdminOp;
  userId: string;
  /** op 1 일 때만 싣는다. 그 밖 op 에서는 무시하고 빈 문자열을 싣는다. */
  password?: string;
  /** 주어질 때만 싣는다(op 1 신규 · op 3 · op 4). */
  account?: AdminAccount;
};

/** 86 파싱 결과. */
export type AdminCommandResult = {
  requestId: bigint;
  ok: boolean;
  /** `ADMIN_CODE` 값 — 미래 값이 올 수 있어 `number`. */
  code: number;
  /** 화면 표시용 한국어 문장 그대로. */
  message: string;
  /** 서버 메모리 카운터 — **재기동 시 1 로 돌아간다.** 신선도 비교 키로 쓰지 않는다. */
  usersRev: bigint;
};

/** 87 의 유저 1명. 비밀번호 없음. */
export type AdminSnapshotUser = {
  userId: string;
  /** priority 오름차순(서버 순서 그대로 보존). */
  accounts: AdminAccount[];
};

/**
 * 87 파싱 결과 — users.toml **전체**(WinForms 전용 유저 포함 · 파일 순). `request_id` 가 없다 —
 * 86 직후 같은 연결 순서로 짝짓는다(29-08).
 */
export type AdminUsersSnapshot = {
  /** 서버 메모리 카운터 — **재기동 시 1 로 돌아간다.** 신선도 비교 키로 쓰지 않는다(접속마다 op 5 로 전체 대조). */
  usersRev: bigint;
  users: AdminSnapshotUser[];
};
