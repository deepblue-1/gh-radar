/**
 * Phase 29 (29-04) — Admin 판정 한 벌 골든. 계좌번호 정규화는 gh-trade `NormalizeAccountNo`
 * (server/src/broker/base/AccountUtil.h 14-38) 와 글자 하나까지 같아야 하고, `diffServerAccounts` 는
 * relay planner(무엇을 보낼까)와 개요 칩(무엇을 그릴까)이 같이 읽는 유일한 판정이다.
 */
import { describe, expect, it } from "vitest";
import {
  REFLECT_LABEL,
  deriveAdminUsersOverview,
  diffServerAccounts,
  findSharedAccountHolders,
  interpretAdminResult,
  isValidAccountNoInput,
  maskDmaUserId,
  normalizeAccountNo,
  type AdminAccountFields,
  type AdminAccountView,
  type AdminIntentRow,
  type AdminUserView,
  type AdminUsersRaw,
} from "../admin";

/** 가짜 KB 계좌 — 실계좌 번호가 아니다. */
const A1: AdminAccountFields = {
  accountNo: "1234567",
  name: "위탁",
  branchNo: "00123",
  traderId: "T00001",
  priority: 0,
};

function intentRow(
  acct: AdminAccountFields,
  serverKey: string,
  over: Partial<AdminIntentRow> = {},
): AdminIntentRow {
  return {
    dmaUserId: "kimtr",
    broker: "KB",
    ...acct,
    serverKey,
    state: "active",
    ...over,
  };
}

function rawWith(over: Partial<AdminUsersRaw> = {}): AdminUsersRaw {
  return {
    appUsers: [{ email: "kim.trader@gmail.com", role: "trader", dmaUserId: "kimtr", signedUp: true }],
    pending: [],
    intent: [intentRow(A1, "KB120")],
    snapshots: [],
    snapshotAccounts: [],
    results: [],
    servers: [
      { key: "KB120", broker: "KB", enabled: true },
      { key: "KB121", broker: "KB", enabled: true },
    ],
    ...over,
  };
}

describe("normalizeAccountNo — gh-trade NormalizeAccountNo 이식", () => {
  it.each([
    [" 001234 ", "1234"],
    ["\t0000\t", "0"],
    ["   ", ""],
    ["", ""],
    ["00123-45", "123-45"],
    ["1230", "1230"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeAccountNo(input)).toBe(expected);
  });
});

describe("isValidAccountNoInput — trim 뒤 1~12자 (자르지 않고 거부)", () => {
  it.each([
    ["123456789012", true],
    ["1234567890123", false],
    [" ", false],
  ])("%j → %s", (input, expected) => {
    expect(isValidAccountNoInput(input)).toBe(expected);
  });
});

describe("diffServerAccounts — 의도 대 87 (트레이서)", () => {
  it("87 에 유저가 없으면 active 전부 missing · userPresent false", () => {
    expect(
      diffServerAccounts({ active: [A1], removing: [], snapshotUser: null, snapshotKnown: true }),
    ).toEqual({
      known: true,
      userPresent: false,
      missing: [A1],
      changed: [],
      toRemove: [],
      settledRemovals: [],
      serverOnly: [],
    });
  });

  it("87 에 같은 값이 있으면 차이 없음 · userPresent true", () => {
    expect(
      diffServerAccounts({
        active: [A1],
        removing: [],
        snapshotUser: { accounts: [{ ...A1 }] },
        snapshotKnown: true,
      }),
    ).toEqual({
      known: true,
      userPresent: true,
      missing: [],
      changed: [],
      toRemove: [],
      settledRemovals: [],
      serverOnly: [],
    });
  });

  it("87 을 아직 못 받았으면 { known: false }", () => {
    expect(
      diffServerAccounts({ active: [A1], removing: [], snapshotUser: null, snapshotKnown: false }),
    ).toEqual({ known: false });
  });
});

describe("diffServerAccounts — removing · 서버에만 있음", () => {
  const A2: AdminAccountFields = { ...A1, accountNo: "2345678", name: "위탁2", priority: 1 };
  const X: AdminAccountFields = { ...A1, accountNo: "9999999", name: "서버전용", priority: 5 };

  it("removing ∩ 87 = toRemove · removing − 87 = settledRemovals · 87 − 의도 = serverOnly", () => {
    expect(
      diffServerAccounts({
        active: [],
        removing: [A1, A2],
        snapshotUser: { accounts: [{ ...A1 }, { ...X }] },
        snapshotKnown: true,
      }),
    ).toEqual({
      known: true,
      userPresent: true,
      missing: [],
      changed: [],
      toRemove: [A1],
      settledRemovals: [A2],
      serverOnly: [X],
    });
  });

  it("87 에 유저가 없으면 removing 은 전부 settledRemovals", () => {
    expect(
      diffServerAccounts({ active: [A2], removing: [A1], snapshotUser: null, snapshotKnown: true }),
    ).toMatchObject({ missing: [A2], toRemove: [], settledRemovals: [A1], serverOnly: [] });
  });

  it("같은 계좌가 active 와 removing 에 다 있으면 active 가 이긴다(지우지 않는다)", () => {
    expect(
      diffServerAccounts({
        active: [A1],
        removing: [A1],
        snapshotUser: { accounts: [{ ...A1 }] },
        snapshotKnown: true,
      }),
    ).toMatchObject({ toRemove: [], settledRemovals: [], serverOnly: [] });
  });
});

describe("diffServerAccounts — 주문자 IP/MAC 은 의도 값이 있을 때만 비교 (GC-02 · 29-47)", () => {
  // 87 전용 필드다 — 지금 DB 의도는 두 값을 갖지 않는다. 의도에 값이 없으면 「서버 값 보존」 이라 비교하지 않는다.
  const IP = "010041001124";
  const MAC = "1CFD087D978E";
  const SERVER_A1: AdminAccountFields = { ...A1, orderIp: IP, orderMac: MAC };
  const diffOf = (intent: AdminAccountFields) =>
    diffServerAccounts({ active: [intent], removing: [], snapshotUser: { accounts: [{ ...SERVER_A1 }] }, snapshotKnown: true });

  it("의도에 두 필드가 없으면 87 의 IP/MAC 차이를 무시한다 — 나머지 4값이 같으면 changed · missing 0", () => {
    expect(diffOf(A1)).toMatchObject({ known: true, userPresent: true, missing: [], changed: [], serverOnly: [] });
  });

  it("의도에 orderIp 가 있고 87 과 다르면 changed [의도 A1]", () => {
    const intent = { ...A1, orderIp: "010041001200", orderMac: MAC };
    expect(diffOf(intent)).toMatchObject({ missing: [], changed: [intent] });
  });

  it("의도에 orderMac 만 있고 87 과 다르면 changed — 필드마다 의도 쪽에 값이 있을 때만 본다", () => {
    const intent = { ...A1, orderMac: "AABBCCDDEEFF" };
    expect(diffOf(intent)).toMatchObject({ changed: [intent] });
  });

  it("의도 값이 87 과 같으면 changed 0", () => {
    expect(diffOf({ ...SERVER_A1 })).toMatchObject({ missing: [], changed: [] });
  });

  it("의도의 빈 문자열은 「비우기」 의도 — 87 에 값이 있으면 changed · 87 도 없으면(키 없음) 같다", () => {
    const clear = { ...A1, orderIp: "", orderMac: "" };
    expect(diffOf(clear)).toMatchObject({ changed: [clear] });
    expect(
      diffServerAccounts({ active: [clear], removing: [], snapshotUser: { accounts: [{ ...A1 }] }, snapshotKnown: true }),
    ).toMatchObject({ changed: [] });
  });
});

describe("P30 sameValues 정규화 비교 (IPMAC-02)", () => {
  // 의도 값은 웹 입력 원문(trim · D-07), 87 값은 서버 정규화값 — 정규화에 성공한 의도 값은 정규화값으로, 실패한 값은 원문으로 비교한다
  // (gh-trade Gateway.cpp op 3 멱등과 같다 — 실패 값을 빈 값으로 바꾸면 미설정 계좌와 같아 보여 code 13 대신 「변경 없음」 이 된다).
  const IP = "010041001124";
  const MAC = "1CFD087D978E";
  const diffWith = (intent: AdminAccountFields, server: AdminAccountFields) =>
    diffServerAccounts({ active: [intent], removing: [], snapshotUser: { accounts: [server] }, snapshotKnown: true });

  it("의도 점표기 · 소문자 콜론 대 87 정규화값 → 같다(changed 0)", () => {
    const intent = { ...A1, orderIp: "10.41.1.124", orderMac: "1c:fd:08:7d:97:8e" };
    expect(diffWith(intent, { ...A1, orderIp: IP, orderMac: MAC })).toMatchObject({ missing: [], changed: [] });
  });

  it("의도 MAC 만 하이픈 표기 · IP 없음 → MAC 만 정규화 비교해 같다(changed 0)", () => {
    const intent = { ...A1, orderMac: "1c-fd-08-7d-97-8e" };
    expect(diffWith(intent, { ...A1, orderIp: IP, orderMac: MAC })).toMatchObject({ changed: [] });
  });

  it("의도 orderIp 999.1.1.1(정규화 실패) 대 87 키 없음 → 원문 비교라 다르다(changed [A1])", () => {
    const intent = { ...A1, orderIp: "999.1.1.1", orderMac: "" };
    expect(diffWith(intent, { ...A1 })).toMatchObject({ changed: [intent] });
  });

  it("의도 \"\" \"\" 대 87 값 있음 → changed [A1] / 87 도 없음 → changed 0", () => {
    const clear = { ...A1, orderIp: "", orderMac: "" };
    expect(diffWith(clear, { ...A1, orderIp: IP, orderMac: MAC })).toMatchObject({ changed: [clear] });
    expect(diffWith(clear, { ...A1 })).toMatchObject({ changed: [] });
  });

  it("의도에 두 필드가 없으면 87 IP/MAC 무시(GC-02 그대로)", () => {
    expect(diffWith(A1, { ...A1, orderIp: IP, orderMac: MAC })).toMatchObject({ missing: [], changed: [] });
  });
});

describe("interpretAdminResult — 86 code 해석 (D-23 ⑤)", () => {
  it.each([
    [4, 0, "ok"],
    [4, 8, "ok"], // 8 NO_SUCH_ACCOUNT = 이미 없음 → 반영됨(오류 칩 아님)
    [2, 0, "ok"],
    [2, 4, "ok"], // 4 NO_SUCH_USER = 유저 없음 → 반영됨
    [3, 9, "failed"], // 9 BUSY
    [1, 0, "ok"],
    [1, 3, "failed"],
    [3, 8, "failed"], // 8 은 op 4 에서만 반영됨
    [4, 12, "failed"], // 12 LAST_ACCOUNT — op 4 마지막 계좌
    [2, 12, "failed"], // 12 — op 2 서버 마지막 사용자(gh-trade 인박스 261007) · 반영됨 아님
    [3, 13, "failed"], // 13 BAD_ORDER_ENDPOINT — 주문자 IP/MAC 형식 오류(gh-trade 인박스 261010)
    [1, 13, "failed"], // 13 — op 1 신규 첫 계좌에도 온다
    [5, 0, "ok"],
  ] as const)("op %i · code %i → %s", (op, code, expected) => {
    expect(interpretAdminResult(op, code)).toBe(expected);
  });
});

describe("REFLECT_LABEL — specifics 칩 문구", () => {
  it("반영됨 · 미반영 · 실패 · BUSY · 서버에만 있음", () => {
    expect(REFLECT_LABEL).toEqual({
      ok: "반영됨",
      warn: "미반영",
      err: "실패 · BUSY",
      only: "서버에만 있음",
    });
  });
});

describe("deriveAdminUsersOverview — 서버 칩 ok/warn (트레이서)", () => {
  it("의도 A1@KB120 · 87 없음 → KB120 「미반영」", () => {
    const overview = deriveAdminUsersOverview(rawWith());
    expect(overview.users).toHaveLength(1);
    expect(overview.users[0].servers).toEqual([{ serverKey: "KB120", tone: "warn", message: null }]);
    expect(REFLECT_LABEL[overview.users[0].servers[0].tone]).toBe("미반영");
  });

  it("87 에 A1 이 생기면 같은 칩이 「반영됨」", () => {
    const overview = deriveAdminUsersOverview(
      rawWith({
        snapshots: [{ serverKey: "KB120", usersRev: "2", receivedAt: "2026-10-06T12:00:00Z" }],
        snapshotAccounts: [{ serverKey: "KB120", dmaUserId: "kimtr", ...A1 }],
      }),
    );
    expect(overview.users[0].servers).toEqual([{ serverKey: "KB120", tone: "ok", message: null }]);
    expect(REFLECT_LABEL[overview.users[0].servers[0].tone]).toBe("반영됨");
  });

  it("87 은 왔지만 그 유저가 없으면 「미반영」", () => {
    const overview = deriveAdminUsersOverview(
      rawWith({
        snapshots: [{ serverKey: "KB120", usersRev: "1", receivedAt: "2026-10-06T12:00:00Z" }],
      }),
    );
    expect(overview.users[0].servers[0].tone).toBe("warn");
  });
});

describe("maskDmaUserId — 로그 전용 DMA id 마스킹 한 벌 (IN-01 · 29-40)", () => {
  it("kim01 → ki***(5) (앞 2자)", () => {
    expect(maskDmaUserId("kim01")).toBe("ki***(5)");
  });

  it("abc → a***(3) (절반 이하만)", () => {
    expect(maskDmaUserId("abc")).toBe("a***(3)");
  });

  it("ab → a***(2)", () => {
    expect(maskDmaUserId("ab")).toBe("a***(2)");
  });

  it("a → ***(1) (한 자는 통째로 가린다)", () => {
    expect(maskDmaUserId("a")).toBe("***(1)");
  });

  it("한글 2자(6바이트) 김철 → 김***(2) (코드포인트 기준)", () => {
    expect(maskDmaUserId("김철")).toBe("김***(2)");
  });

  it("빈 문자열 → ***(0)", () => {
    expect(maskDmaUserId("")).toBe("***(0)");
  });
});

describe("P30 공유 계좌 — findSharedAccountHolders (D-18)", () => {
  // 개요 데이터만 — 다른 DMA 사용자 · 같은 증권사 · 같은 정규화 계좌번호 · 서버(active 등록 ∪ serverOnlyOn)가 이 계좌 저장 서버와 겹칠 때만.
  const NO = "11122233304";
  const view = (
    over: Partial<AdminAccountView> & { active?: string[]; removing?: string[] } = {},
  ): AdminAccountView => {
    const { active = ["KB120"], removing = [], ...rest } = over;
    return {
      broker: "KB",
      accountNo: NO,
      name: "공유",
      branchNo: "00123",
      traderId: "000789",
      priority: 1,
      servers: [
        ...active.map((serverKey) => ({ serverKey, tone: "ok" as const, message: null, state: "active" as const })),
        ...removing.map((serverKey) => ({ serverKey, tone: "warn" as const, message: null, state: "removing" as const })),
      ],
      serverOnlyOn: [],
      ...rest,
    };
  };
  const user = (dmaUserId: string | null, accounts: AdminAccountView[]): Pick<AdminUserView, "dmaUserId" | "accounts"> => ({
    dmaUserId,
    accounts,
  });
  const find = (users: Pick<AdminUserView, "dmaUserId" | "accounts">[], servers: string[] = ["KB120", "KB121"]) =>
    findSharedAccountHolders({ users, dmaUserId: "alexjx", broker: "KB", accountNo: NO, servers });

  it("함께 쓰는 사용자 둘(입력 kimtr → bob) → dmaUserId 오름차순 · 각 servers 는 겹치는 서버(입력 순서)", () => {
    const users = [
      user("alexjx", [view({ active: ["KB120", "KB121"] })]),
      user("kimtr", [view({ active: ["KB121", "KB120"] })]),
      user("bob", [view({ active: ["KB121"] })]),
    ];
    expect(find(users)).toEqual([
      { dmaUserId: "bob", servers: ["KB121"] },
      { dmaUserId: "kimtr", servers: ["KB120", "KB121"] },
    ]);
  });

  it("정규화 계좌번호 일치(\"011122233304\" 대 \"11122233304\") → 포함 · 다른 증권사 같은 번호 → 제외", () => {
    expect(find([user("kimtr", [view({ accountNo: "011122233304" })])])).toEqual([{ dmaUserId: "kimtr", servers: ["KB120"] }]);
    expect(
      find([user("kimtr", [view({ broker: "KYOBO", active: ["KB120"] })])]),
    ).toEqual([]);
    // 입력 쪽 계좌번호도 정규화
    expect(
      findSharedAccountHolders({
        users: [user("kimtr", [view()])],
        dmaUserId: "alexjx",
        broker: "KB",
        accountNo: "0011122233304",
        servers: ["KB120"],
      }),
    ).toEqual([{ dmaUserId: "kimtr", servers: ["KB120"] }]);
  });

  it("겹치는 서버 없음 → 제외 · serverOnlyOn 으로만 KB120 → 포함 · KB120 이 removing 뿐 → 제외", () => {
    expect(find([user("kimtr", [view({ active: ["KB121"] })])], ["KB120"])).toEqual([]);
    expect(find([user("kimtr", [view({ active: [], serverOnlyOn: ["KB120"] })])], ["KB120"])).toEqual([
      { dmaUserId: "kimtr", servers: ["KB120"] },
    ]);
    expect(find([user("kimtr", [view({ active: ["KB121"], removing: ["KB120"] })])], ["KB120"])).toEqual([]);
  });

  it("자기 dmaUserId · dmaUserId null 웹 사용자 → 제외 · 같은 dmaUserId 웹 사용자 둘 → 한 항목(서버 합침) · users [] → []", () => {
    expect(find([user("alexjx", [view()]), user(null, [view()])])).toEqual([]);
    expect(
      find([user("kimtr", [view({ active: ["KB120"] })]), user("kimtr", [view({ active: ["KB121"] })])]),
    ).toEqual([{ dmaUserId: "kimtr", servers: ["KB120", "KB121"] }]);
    expect(find([])).toEqual([]);
  });
});

describe("P30 공유 계좌 전파는 drift 가 아니다 (D-18)", () => {
  // gh-trade 전파(op 3 하나 → 같은 서버 users.toml 의 같은 계좌번호 사용자 모두에 같은 IP/MAC) 뒤 B 의 87 에는 A 가 바꾼 값이 있다.
  // DB 의도에는 IP/MAC 이 없다 → sameValues 가 비교하지 않는다(GC-02) · 개요 칩 판정 fieldsOf 도 87 IP/MAC 을 뺀다 → op · 경고 없음.
  const IP = "010041001124";
  const MAC = "1CFD087D978E";
  const SHARED: AdminAccountFields = { accountNo: "11122233304", name: "공유", branchNo: "00123", traderId: "000789", priority: 3 };
  const PROPAGATED: AdminAccountFields = { ...SHARED, orderIp: IP, orderMac: MAC };

  it("B 의도(IP/MAC 없음) 대 B 87(전파된 orderIp/orderMac) → diffServerAccounts changed [] · missing []", () => {
    const diff = diffServerAccounts({
      active: [intentRow(SHARED, "KB120")],
      removing: [],
      snapshotUser: { accounts: [{ ...PROPAGATED }] },
      snapshotKnown: true,
    });
    expect(diff).toMatchObject({ known: true, userPresent: true, missing: [], serverOnly: [] });
    if (!diff.known) throw new Error("known 이어야 한다");
    expect(diff.changed).toHaveLength(0);
  });

  it("deriveAdminUsersOverview(raw, endpoints) — B 칩 ok · B 계좌 orderEndpoints 에 전파된 값 · A 에서 보면 B 가 함께 쓰는 사용자", () => {
    const overview = deriveAdminUsersOverview(
      rawWith({
        appUsers: [
          { email: "alex@example.invalid", role: "admin", dmaUserId: "alexjx", signedUp: true },
          { email: "kim.trader@gmail.com", role: "trader", dmaUserId: "kimtr", signedUp: true },
        ],
        intent: [
          intentRow(SHARED, "KB120", { dmaUserId: "alexjx" }),
          intentRow(SHARED, "KB121", { dmaUserId: "alexjx" }),
          intentRow(SHARED, "KB120", { dmaUserId: "kimtr" }),
        ],
        snapshots: [
          { serverKey: "KB120", usersRev: "7", receivedAt: "2026-10-11T08:00:00Z" },
          { serverKey: "KB121", usersRev: "7", receivedAt: "2026-10-11T08:00:00Z" },
        ],
        snapshotAccounts: [
          { serverKey: "KB120", dmaUserId: "alexjx", ...PROPAGATED },
          { serverKey: "KB121", dmaUserId: "alexjx", ...PROPAGATED },
          { serverKey: "KB120", dmaUserId: "kimtr", ...PROPAGATED },
        ],
      }),
      {
        servers: {
          KB120: [
            { dmaUserId: "alexjx", accountNo: SHARED.accountNo, orderIp: IP, orderMac: MAC },
            { dmaUserId: "kimtr", accountNo: SHARED.accountNo, orderIp: IP, orderMac: MAC },
          ],
          KB121: [{ dmaUserId: "alexjx", accountNo: SHARED.accountNo, orderIp: IP, orderMac: MAC }],
        },
      },
    );
    const kim = overview.users.find((u) => u.dmaUserId === "kimtr");
    if (!kim) throw new Error("kimtr 행이 없다");
    expect(kim.servers).toEqual([{ serverKey: "KB120", tone: "ok", message: null }]);
    expect(kim.accounts).toHaveLength(1);
    expect(kim.accounts[0].servers).toEqual([{ serverKey: "KB120", tone: "ok", message: null, state: "active" }]);
    expect(kim.accounts[0].orderEndpoints).toEqual({ KB120: { orderIp: IP, orderMac: MAC } });

    expect(
      findSharedAccountHolders({
        users: overview.users,
        dmaUserId: "alexjx",
        broker: "KB",
        accountNo: SHARED.accountNo,
        servers: ["KB120", "KB121"],
      }),
    ).toEqual([{ dmaUserId: "kimtr", servers: ["KB120"] }]);
  });
});
