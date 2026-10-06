/**
 * Phase 29 (29-04) — relay Admin op 계획기 골든. 판정은 shared `diffServerAccounts` 한 벌이고,
 * `planServerOps` 는 그 결과를 44 op 열(op 1 → op 3 → op 4)로 옮기기만 한다(D-23 ⑤ · gh-trade D-09).
 */
import { describe, expect, it } from "vitest";

import type { AdminAccountFields, AdminIntentRow } from "@gh-radar/shared";

import { planServerOps } from "../src/admin/planner.js";

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
