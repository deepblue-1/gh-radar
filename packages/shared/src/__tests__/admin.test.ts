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
  interpretAdminResult,
  isValidAccountNoInput,
  normalizeAccountNo,
  type AdminAccountFields,
  type AdminIntentRow,
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
