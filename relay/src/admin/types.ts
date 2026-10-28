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
 * - 6 SetAccountBudget — account_no + budget_krw(원 · 0 = 해제) · 같은 서버 그 계좌의 모든 유저 행 · user_id · password 는
 *   읽지 않는다 · BUSY 없음(gh-trade 41 · 인박스 261027-account-budget). 구 서버는 code 1(BAD_OP).
 * - 7 SetAccountFee — fee_ppm · sell_tax_ppm 두 값을 한 번에(0,0 = 해제) · 범위 밖은 code 1(gh-trade 41 · 인박스 261027-account-pnl)
 * - 8 SetLaunchPlan — launch_profile("Q16"|"N") · launch_market("K"|"Q") · launch_offsets_us(µs [int]) 한 칸 저장 ·
 *   실제 변경이면 86 뒤 94 1프레임 · 같은 값 = code 0 「변경 없음」(94 없음) · users_rev 와 무관(87 없음) · 구 서버 = code 1
 * - 9 GetLaunchPlan — request_id 만 읽는다 · **94 1프레임만**(86 없음 — op 5 → 87 선례) · 구 서버 = 86 code 1 「알 수 없는 명령입니다」
 *   (gh-trade 43 · fbs f156cb6f · 인박스 docs/inbox/from-gh-trade/261028-launch-plan-contract.md)
 */
export const ADMIN_OP = {
  UpsertUser: 1,
  DeleteUser: 2,
  SetAccount: 3,
  RemoveAccount: 4,
  ListUsers: 5,
  SetAccountBudget: 6,
  SetAccountFee: 7,
  SetLaunchPlan: 8,
  GetLaunchPlan: 9,
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
  /**
   * op 1 · op 3 의 주문자 IP/MAC 형식 오류(gh-trade 인박스 261010) — IP 12자리 숫자 또는 a.b.c.d · MAC 12자리 16진 위반,
   * 한쪽만 적음, NUL · 잘못된 UTF-8. 실패 칩은 서버 message 원문(D-23 ④).
   */
  BadOrderEndpoint: 13,
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
  12: "LAST_ACCOUNT", // op 4 마지막 계좌 제거 · op 2 서버 마지막 사용자 삭제(사용자 0명 users.toml 은 기동 거부) — gh-trade 인박스 261007
  13: "BAD_ORDER_ENDPOINT", // op 1 · op 3 주문자 IP/MAC 형식 오류 — gh-trade 인박스 261010
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
  /**
   * 계좌별 주문자 IP(슬롯 14 · gh-trade 인박스 261010) — 서버 정규화값(12자리 숫자) 그대로 둔다(재정규화 · 검증 금지).
   * 미설정 = 빈 문자열(교보 · 구 서버 = 필드 없음 = 빈 문자열). 87 파서는 빈 값을 키로 두지 않는다.
   * 서버는 op 3 의 빈 값을 「미설정」 으로 되돌리므로 relay 는 87 값을 되싣는다(GC-02 · 29-47). 사용자 PC 식별 정보 — 로그 금지.
   */
  orderIp?: string;
  /** 계좌별 주문자 MAC(슬롯 16) — 서버 정규화값(대문자 12자리 16진) 그대로. 규칙은 `orderIp` 와 같다(둘은 함께 적거나 함께 비운다). */
  orderMac?: string;
  /**
   * 계좌 한도(원 · 슬롯 18 · Phase 36 · gh-trade 41) — **87 전용**(44 의 account 에는 싣지 않는다 — op 6 은 요청 최상위 `budgetKrw`).
   * ulong 을 `toNum` 으로 number 화. 같은 서버 같은 account_no 의 모든 유저 행이 같은 값이다. 숫자라 0 = 미설정 · 구 서버(필드 없음)
   * 도 **키를 둔다**(orderIp 의 「빈 값 = 키 없음」 규칙과 다름). 의도 · drift · op 3 계획 · DB 적재(snapshot sink)에 쓰지 않는다(D-04).
   */
  budgetKrw?: number;
  /** 수수료 ppm(슬롯 20 · uint32) — 87 전용 · 0 = 미설정도 키를 둔다. 규칙은 `budgetKrw` 와 같다. */
  feePpm?: number;
  /** 매도세 ppm(슬롯 22 · uint32) — 87 전용 · 0 = 미설정도 키를 둔다. 규칙은 `budgetKrw` 와 같다. */
  sellTaxPpm?: number;
};

/** 44 조립 입력. */
export type AdminCommandInput = {
  /** ulong — 86 에 에코된다. bigint 그대로(정밀도 손실 금지). */
  requestId: bigint;
  op: AdminOp;
  userId: string;
  /** op 1 일 때만 싣는다. 그 밖 op 에서는 무시하고 빈 문자열을 싣는다. */
  password?: string;
  /** 주어질 때만 싣는다(op 1 신규 · op 3 · op 4 · op 6 · op 7 — op 6/7 은 account_no 만 읽는다). */
  account?: AdminAccount;
  /** op 6 만 싣는다 — ulong(원 · 0 = 해제). bigint 그대로(0 ≤ v < 2^64 · 밖이면 조립이 throw). */
  budgetKrw?: bigint;
  /** op 7 만 싣는다 — uint32 ppm(0 = 해제). 0~10000 범위는 서버가 판정(code 1) — 조립은 uint32 구조만 본다. */
  feePpm?: number;
  /** op 7 만 싣는다 — uint32 ppm(0 = 해제). 규칙은 `feePpm` 과 같다(두 값은 늘 함께 나간다). */
  sellTaxPpm?: number;
  /** op 8 만 싣는다 — "Q16" | "N". 대상 판정은 서버(code 1 「발사 계획 대상 밖…」). */
  launchProfile?: LaunchProfile;
  /** op 8 만 싣는다 — "K" | "Q". */
  launchMarket?: LaunchMarket;
  /**
   * op 8 만 싣는다 — µs 정수(int32) 목록 · 기준 16:00:00.000000 / 09:00:30.000000 · 음수 = 앞당김. Q16 = 조각 목록 · N = 길이 1.
   * 길이 · 범위 · 순서는 서버 설정값(119/120 = Q16 −3000~1000 · 10조각 · N ±2000)으로 서버가 판정한다 — relay 는 int32 구조만 본다.
   */
  launchOffsetsUs?: readonly number[];
};

/** 발사 계획 프로파일 — 94 의 `profile` · 44 의 `launch_profile`. */
export type LaunchProfile = "Q16" | "N";

/** 발사 계획 시장 — 94 의 `market` · 44 의 `launch_market`. */
export type LaunchMarket = "K" | "Q";

/** 94 의 한 칸. 서버 문자열을 그대로 둔다(미래 값이 와도 거르지 않는다 — 판정은 소비자). */
export type LaunchPlanEntry = {
  profile: string;
  market: string;
  /** µs 정수 — Q16 은 목록 = 조각 수 · N 은 길이 1. */
  offsetsUs: number[];
};

/**
 * 94 `LaunchPlanSnapshot` 파싱 결과 (gh-trade 43). **`request_id` 를 에코한다** — 87 과 달리 다음 프레임 순서로 짝짓지 않고
 * request_id 로만 짝짓는다(op 8 저장 뒤 서버가 보내는 94 는 짝이 없어 버린다).
 */
export type LaunchPlanSnapshot = {
  /** 44 의 request_id 에코(ulong · bigint 그대로). */
  requestId: bigint;
  /** 계획 rev — 첫 생성 1 · 변경마다 +1 · 파일에 남아 재기동해도 이어진다(users_rev 와 별도). bigint 그대로. */
  planRev: bigint;
  /** `YYYY-MM-DDTHH:MM:SS` 서버 벽시계(KST) — **빈 문자열일 수 있다**(손으로 만든 파일 · 키 없음). */
  updatedAt: string;
  /** 서버 순서 그대로 — 4행 고정 순서 Q16/K · Q16/Q · N/K · N/Q(relay 는 정렬 · 보정하지 않는다). */
  entries: LaunchPlanEntry[];
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

/**
 * 서버 · 계좌의 66/67 마지막 예수금(원)과 그 프레임을 받은 시각(`Date.now()` ms) — `SubscriptionHub.liveBudgetOf` 반환(Phase 36 D-05).
 * `atMs` 는 87 캐시 수신 시각(`AdminConn.snapshotReceivedAtMs`)과 견줘 더 최근 원천을 고르는 데만 쓴다(36 WR-02 · `freshLiveBudget`).
 */
export type LiveBudget = { krw: number; atMs: number };

/**
 * 67 live 와 87 중 **더 최근에 받은** 예수금 원천 고르기(36 WR-02) — live 가 87 수신 시각보다 늦게(같은 ms 포함) 왔으면 live 원 값,
 * 아니면 null(= 호출자가 87 값으로 내려간다). 87 시각을 모르면(null) live 를 그대로 쓴다(D-05 「live 우선」 종전).
 *
 * 왜 시각인가: 체결 조정은 87 없이 한도 전용 67 로만 오므로(D-14 · D-29) 평소엔 live 가 새롭다. 그러나 op 6 저장 · op 5 재조회의 87
 * 은 서버 **현재 값**을 싣고(인박스 261027-account-pnl 「다음 87(op 5 등)은 현재 값」), live 원천 67 은 다른 연결(사용자 세션)로 와
 * 87 과 도착 순서가 보장되지 않는다. live 를 무조건 앞세우면 저장 직후 재조회에 옛 값 · 거짓 불일치 줄이 뜬다.
 */
export function freshLiveBudget(live: LiveBudget | null | undefined, snapshotAtMs: number | null | undefined): number | null {
  if (live === null || live === undefined) return null;
  if (snapshotAtMs === null || snapshotAtMs === undefined) return live.krw;
  return live.atMs >= snapshotAtMs ? live.krw : null;
}
