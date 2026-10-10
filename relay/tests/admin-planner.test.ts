/**
 * Phase 29 (29-04) — relay Admin op 계획기 골든. 판정은 shared `diffServerAccounts` 한 벌이고,
 * `planServerOps` 는 그 결과를 44 op 열(op 1 → op 3 → op 4)로 옮기기만 한다(D-23 ⑤ · gh-trade D-09).
 */
import { describe, expect, it } from "vitest";

import type { AdminAccountFields, AdminIntentRow } from "@gh-radar/shared";

import { planPasswordOps, planServerOps } from "../src/admin/planner.js";

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
  over: Partial<AdminIntentRow> = {},
): AdminIntentRow {
  return {
    dmaUserId: "kimtr",
    broker: "KB",
    ...acct,
    serverKey: "KB120",
    state: "active",
    ...over,
  };
}

describe("planServerOps — 트레이서(신규 유저 · 첫 계좌 · 서버 1대)", () => {
  it("87 에 유저 없음 → op 1(계좌 포함) 한 개", () => {
    expect(
      planServerOps({
        dmaUserId: "kimtr",
        serverKey: "KB120",
        intent: [intentRow(A1)],
        snapshot: { users: [] },
      }),
    ).toEqual({ status: "ready", ops: [{ op: 1, account: A1 }], settleRemoved: [] });
  });

  it("87 에 같은 A1 → 보낼 것 없음", () => {
    expect(
      planServerOps({
        dmaUserId: "kimtr",
        serverKey: "KB120",
        intent: [intentRow(A1)],
        snapshot: { users: [{ userId: "kimtr", accounts: [{ ...A1 }] }] },
      }),
    ).toEqual({ status: "ready", ops: [], settleRemoved: [] });
  });

  it("87 을 아직 못 받았으면 no-snapshot — 아무것도 보내지 않는다", () => {
    expect(
      planServerOps({
        dmaUserId: "kimtr",
        serverKey: "KB120",
        intent: [intentRow(A1)],
        snapshot: null,
      }),
    ).toEqual({ status: "no-snapshot", ops: [], settleRemoved: [] });
  });
});

const A2: AdminAccountFields = {
  accountNo: "2345678",
  name: "위탁2",
  branchNo: "00123",
  traderId: "T00001",
  priority: 1,
};
const A3: AdminAccountFields = {
  accountNo: "3456789",
  name: "위탁3",
  branchNo: "00123",
  traderId: "T00001",
  priority: 2,
};
/** 의도에 없는 87 전용 계좌(WinForms 로만 넣은 계좌) — 「서버에만 있음」. */
const X: AdminAccountFields = {
  accountNo: "9999999",
  name: "서버전용",
  branchNo: "00999",
  traderId: "T00999",
  priority: 5,
};

function plan(
  active: AdminAccountFields[],
  removing: AdminAccountFields[],
  snapAccounts: AdminAccountFields[] | null,
) {
  return planServerOps({
    dmaUserId: "kimtr",
    serverKey: "KB120",
    intent: [
      ...active.map((a) => intentRow(a)),
      ...removing.map((a) => intentRow(a, { state: "removing" })),
      // 다른 유저 · 다른 서버 행은 걸러 낸다
      intentRow(A3, { dmaUserId: "other" }),
      intentRow(A3, { serverKey: "KB121" }),
    ],
    snapshot: {
      users: [
        { userId: "other", accounts: [{ ...X }] },
        ...(snapAccounts ? [{ userId: "kimtr", accounts: snapAccounts }] : []),
      ],
    },
  });
}

describe("planServerOps — op 3 추가 · 갱신", () => {
  it("유저 있음 · active [A1, A2] · 87 [A1] → op 3 A2", () => {
    expect(plan([A1, A2], [], [{ ...A1 }]).ops).toEqual([{ op: 3, account: A2 }]);
  });

  it("87 의 A1 이름만 다름 → op 3 A1 · op 3 A2 (priority → accountNo 순)", () => {
    expect(plan([A2, A1], [], [{ ...A1, name: "옛 이름" }]).ops).toEqual([
      { op: 3, account: A1 },
      { op: 3, account: A2 },
    ]);
  });

  it("유저 없음 · active [A2(p1), A1(p0)] → op 1 A1(첫 계좌 = priority 순) · op 3 A2", () => {
    expect(plan([A2, A1], [], null).ops).toEqual([
      { op: 1, account: A1 },
      { op: 3, account: A2 },
    ]);
  });

  it("같은 priority 면 accountNo 순으로 첫 계좌를 고른다", () => {
    const B = { ...A2, priority: 0, accountNo: "1111111" };
    expect(plan([A1, B], [], null).ops).toEqual([
      { op: 1, account: B },
      { op: 3, account: A1 },
    ]);
  });

  it("의도 계좌번호는 정규화 키로 87 과 대조한다(앞 0 · 공백)", () => {
    expect(plan([{ ...A1, accountNo: " 01234567" }], [], [{ ...A1 }]).ops).toEqual([]);
  });

  it("값 비교는 branchNo · traderId · priority 도 본다", () => {
    expect(plan([A1], [], [{ ...A1, priority: 3 }]).ops).toEqual([{ op: 3, account: A1 }]);
    expect(plan([A1], [], [{ ...A1, traderId: "T00002" }]).ops).toEqual([{ op: 3, account: A1 }]);
    expect(plan([A1], [], [{ ...A1, branchNo: "00124" }]).ops).toEqual([{ op: 3, account: A1 }]);
  });
});

describe("planServerOps — removing op 4 · settle · 마지막 계좌 op 2", () => {
  it("removing [A1] · active [A2] · 87 [A1, A2] → op 4 A1", () => {
    expect(plan([A2], [A1], [{ ...A1 }, { ...A2 }])).toEqual({
      status: "ready",
      ops: [{ op: 4, accountNo: A1.accountNo }],
      settleRemoved: [],
    });
  });

  it("removing [A1] · 87 에 A1 이미 없음 → 보낼 것 없이 settle", () => {
    expect(plan([A2], [A1], [{ ...A2 }])).toEqual({
      status: "ready",
      ops: [],
      settleRemoved: [A1.accountNo],
    });
  });

  it("active [] · removing [A1] · 87 [A1] → op 2 (op 4 는 12 LAST_ACCOUNT) · op 2 는 계획 때 removing 계좌를 싣는다(29-32 WR-01)", () => {
    expect(plan([], [A1], [{ ...A1 }])).toEqual({
      status: "ready",
      ops: [{ op: 2, accountNos: [A1.accountNo] }],
      settleRemoved: [],
    });
  });

  it("active [] · removing [A1, A2] · 87 [A1] → op 2(A1) · A2 는 settle", () => {
    expect(plan([], [A1, A2], [{ ...A1 }])).toEqual({
      status: "ready",
      ops: [{ op: 2, accountNos: [A1.accountNo] }],
      settleRemoved: [A2.accountNo],
    });
  });

  it("유저가 87 에 없으면 removing 은 전부 settle", () => {
    expect(plan([], [A1], null)).toEqual({ status: "ready", ops: [], settleRemoved: [A1.accountNo] });
  });

  it("87 에 X(서버에만 있음)가 남으면 op 2 가 아니라 op 4 A1 — X 와 유저는 유지", () => {
    expect(plan([], [A1], [{ ...A1 }, { ...X }]).ops).toEqual([{ op: 4, accountNo: A1.accountNo }]);
  });
});

describe("planServerOps — 서버에만 있음 계좌는 지우지 않는다 (D-23 ⑤)", () => {
  it("active [A1] · 87 [A1, X] → 보낼 것 없음", () => {
    expect(plan([A1], [], [{ ...A1 }, { ...X }]).ops).toEqual([]);
  });

  it("active [] · removing [] · 87 [X] → 보낼 것 없음(op 2 금지)", () => {
    expect(plan([], [], [{ ...X }]).ops).toEqual([]);
  });

  it("어떤 계획에도 X 를 겨냥한 op 4 · op 2 가 없다", () => {
    const cases = [
      plan([A1], [A2], [{ ...A1 }, { ...A2 }, { ...X }]),
      plan([], [A1, A2], [{ ...A1 }, { ...A2 }, { ...X }]),
      plan([A2], [], [{ ...X }]),
    ];
    for (const c of cases) {
      expect(c.ops.some((o) => o.op === 2)).toBe(false);
      expect(c.ops.some((o) => o.op === 4 && o.accountNo === X.accountNo)).toBe(false);
    }
  });
});

describe("planServerOps — 섞인 경우 순서 op 1 → op 3 → op 4", () => {
  it("유저 있음 · A1 값 변경 · A3 없음 · A2 제거 → op 3 A1 · op 3 A3 · op 4 A2", () => {
    expect(plan([A1, A3], [A2], [{ ...A1, name: "옛 이름" }, { ...A2 }]).ops).toEqual([
      { op: 3, account: A1 },
      { op: 3, account: A3 },
      { op: 4, accountNo: A2.accountNo },
    ]);
  });

  it("유저 없음 · active [A3, A1] · removing [A2] → op 1 A1 · op 3 A3 · A2 settle", () => {
    expect(plan([A3, A1], [A2], null)).toEqual({
      status: "ready",
      ops: [
        { op: 1, account: A1 },
        { op: 3, account: A3 },
      ],
      settleRemoved: [A2.accountNo],
    });
  });
});

describe("planPasswordOps — 비밀번호만 op 1", () => {
  it("87 에 유저 있음 → op 1 passwordOnly", () => {
    expect(
      planPasswordOps({
        dmaUserId: "kimtr",
        snapshot: { users: [{ userId: "kimtr", accounts: [{ ...A1 }] }] },
      }),
    ).toEqual({ status: "ready", ops: [{ op: 1, passwordOnly: true }], settleRemoved: [] });
  });

  it("87 에 유저 없음 → 보낼 것 없음(신규 op 1 은 계좌 경로가 만든다)", () => {
    expect(planPasswordOps({ dmaUserId: "kimtr", snapshot: { users: [] } })).toEqual({
      status: "ready",
      ops: [],
      settleRemoved: [],
    });
  });

  it("87 없음 → no-snapshot", () => {
    expect(planPasswordOps({ dmaUserId: "kimtr", snapshot: null })).toEqual({
      status: "no-snapshot",
      ops: [],
      settleRemoved: [],
    });
  });
});
