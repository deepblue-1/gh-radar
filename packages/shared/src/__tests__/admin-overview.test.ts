/**
 * Phase 29 (29-04) — Admin 개요 파생 골든. 채택 목업(`reference/mockup-admin-users.html` · `mockup-admin-servers.html`)
 * 의 행 · 칩 · 「서버에만 있음」 · 서버 카드 숫자가 `admin_users_raw()` / `admin_servers_raw()` 한 덩이에서
 * 한 함수로 나오는지 본다. 칩 판정은 `diffServerAccounts` 그대로(D-05 · D-14 · D-23 ③④).
 */
import { describe, expect, it } from "vitest";
import {
  deriveAdminServersOverview,
  deriveAdminUsersOverview,
  type AdminAccountFields,
  type AdminIntentRow,
  type AdminResultRow,
  type AdminServerLiveStatus,
  type AdminServersRaw,
  type AdminSnapshotAccountRow,
  type AdminUsersRaw,
} from "../admin";

/** 가짜 계좌 — 실계좌 번호가 아니다. */
const A1: AdminAccountFields = { accountNo: "1234567", name: "위탁", branchNo: "00123", traderId: "T00001", priority: 0 };
const A2: AdminAccountFields = { accountNo: "2345678", name: "위탁2", branchNo: "00123", traderId: "T00001", priority: 1 };
/** 교보 계좌 — branch/trader 빈 문자열(D-23 ③). */
const K1: AdminAccountFields = { accountNo: "98765432", name: "위탁", branchNo: "", traderId: "", priority: 0 };

const BUSY_MESSAGE = "미체결 2건 · 상따 1건 — 먼저 정리";

const SERVERS: AdminUsersRaw["servers"] = [
  { key: "KB120", broker: "KB", enabled: true },
  { key: "KB121", broker: "KB", enabled: true },
  { key: "KYOBO119", broker: "KYOBO", enabled: true },
  { key: "KYOBO127", broker: "KYOBO", enabled: false },
];

function intent(
  dmaUserId: string,
  acct: AdminAccountFields,
  serverKey: string,
  state: "active" | "removing" = "active",
): AdminIntentRow {
  return {
    dmaUserId,
    broker: serverKey.startsWith("KYOBO") ? "KYOBO" : "KB",
    ...acct,
    serverKey,
    state,
  };
}

function snap(dmaUserId: string, acct: AdminAccountFields, serverKey: string): AdminSnapshotAccountRow {
  return { serverKey, dmaUserId, ...acct };
}

function result(
  dmaUserId: string,
  serverKey: string,
  over: Partial<AdminResultRow> = {},
): AdminResultRow {
  return {
    dmaUserId,
    serverKey,
    outcome: "failed",
    code: 9,
    message: BUSY_MESSAGE,
    at: "2026-10-06T12:00:00Z",
    ...over,
  };
}

const KNOWN_ALL = SERVERS.slice(0, 3).map((s) => ({
  serverKey: s.key,
  usersRev: "3",
  receivedAt: "2026-10-06T12:00:00Z",
}));

function raw(over: Partial<AdminUsersRaw> = {}): AdminUsersRaw {
  return {
    appUsers: [{ email: "kim.trader@gmail.com", role: "trader", dmaUserId: "kimtr", signedUp: true }],
    pending: [],
    intent: [],
    snapshots: KNOWN_ALL,
    snapshotAccounts: [],
    results: [],
    servers: SERVERS,
    ...over,
  };
}

function kimtr(over: Partial<AdminUsersRaw>) {
  const ov = deriveAdminUsersOverview(raw(over));
  const u = ov.users.find((x) => x.dmaUserId === "kimtr");
  if (!u) throw new Error("kimtr 행이 없다");
  return u;
}

describe("유저 칩 — ok · warn · err(BUSY message 그대로)", () => {
  const base = {
    intent: [intent("kimtr", A1, "KB120"), intent("kimtr", A1, "KB121"), intent("kimtr", K1, "KYOBO119")],
    snapshotAccounts: [snap("kimtr", A1, "KB120"), snap("kimtr", K1, "KYOBO119")],
  };

  it("차이 있음 · 최근 결과 failed(9) → err · 서버 message 원문 그대로", () => {
    const u = kimtr({ ...base, results: [result("kimtr", "KB121")] });
    expect(u.servers).toEqual([
      { serverKey: "KB120", tone: "ok", message: null },
      { serverKey: "KB121", tone: "err", message: "미체결 2건 · 상따 1건 — 먼저 정리" },
      { serverKey: "KYOBO119", tone: "ok", message: null },
    ]);
  });

  it("차이 있음 · 결과 없음 → warn", () => {
    expect(kimtr(base).servers[1]).toEqual({ serverKey: "KB121", tone: "warn", message: null });
  });

  it("차이 있음 · 최근 결과 ok → warn(아직 87 이 안 따라옴)", () => {
    const u = kimtr({ ...base, results: [result("kimtr", "KB121", { outcome: "ok", code: 0, message: null })] });
    expect(u.servers[1].tone).toBe("warn");
  });

  it("차이 없음이면 옛 failed 결과는 무시하고 ok", () => {
    const u = kimtr({
      ...base,
      snapshotAccounts: [...base.snapshotAccounts, snap("kimtr", A1, "KB121")],
      results: [result("kimtr", "KB121")],
    });
    expect(u.servers[1]).toEqual({ serverKey: "KB121", tone: "ok", message: null });
  });

  it("그 서버 87 을 아직 못 받았으면 warn(실패 결과가 있으면 err)", () => {
    const only120 = KNOWN_ALL.filter((s) => s.serverKey !== "KB121");
    expect(kimtr({ ...base, snapshots: only120 }).servers[1].tone).toBe("warn");
    expect(
      kimtr({ ...base, snapshots: only120, results: [result("kimtr", "KB121")] }).servers[1].tone,
    ).toBe("err");
  });
});

describe("계좌별 칩 · removing · serverOnlyOn", () => {
  it("active 계좌의 등록 서버마다 칩 · 교보 branch/trader 는 빈 문자열 그대로", () => {
    const u = kimtr({
      intent: [intent("kimtr", K1, "KYOBO119"), intent("kimtr", A1, "KB120"), intent("kimtr", A1, "KB121")],
      snapshotAccounts: [snap("kimtr", A1, "KB120"), snap("kimtr", K1, "KYOBO119")],
      results: [result("kimtr", "KB121")],
    });
    expect(u.accounts).toEqual([
      {
        broker: "KB",
        ...A1,
        servers: [
          { serverKey: "KB120", tone: "ok", message: null, state: "active" },
          { serverKey: "KB121", tone: "err", message: BUSY_MESSAGE, state: "active" },
        ],
        serverOnlyOn: [],
        // 옛 raw(isOrder · isOrderServer 키 없음) — 파생은 두 필드를 늘 null 로 채운다(29-37).
        orderServer: null,
        defaultOrderServer: null,
      },
      {
        broker: "KYOBO",
        ...K1,
        branchNo: "",
        traderId: "",
        servers: [{ serverKey: "KYOBO119", tone: "ok", message: null, state: "active" }],
        serverOnlyOn: [],
        orderServer: null,
        defaultOrderServer: null,
      },
    ]);
    expect(u.accountCount).toBe(2);
  });

  it("다른 계좌의 실패는 반영된 계좌 칩을 err 로 만들지 않는다", () => {
    const u = kimtr({
      intent: [intent("kimtr", A1, "KB120"), intent("kimtr", A2, "KB120")],
      snapshotAccounts: [snap("kimtr", A1, "KB120")],
      results: [result("kimtr", "KB120")],
    });
    expect(u.accounts.map((a) => [a.accountNo, a.servers[0].tone])).toEqual([
      ["1234567", "ok"],
      ["2345678", "err"],
    ]);
  });

  it("removing 계좌가 87 에 남아 있으면 warn · 최근 결과 failed 면 err · 87 에서 사라졌으면 ok", () => {
    const rows = [intent("kimtr", A1, "KB120"), intent("kimtr", A2, "KB120", "removing")];
    const still = kimtr({ intent: rows, snapshotAccounts: [snap("kimtr", A1, "KB120"), snap("kimtr", A2, "KB120")] });
    expect(still.accounts[1].servers).toEqual([
      { serverKey: "KB120", tone: "warn", message: null, state: "removing" },
    ]);
    expect(still.servers[0].tone).toBe("warn");
    expect(still.accountCount).toBe(1); // removing 은 계좌 수에 넣지 않는다

    const failed = kimtr({
      intent: rows,
      snapshotAccounts: [snap("kimtr", A1, "KB120"), snap("kimtr", A2, "KB120")],
      results: [result("kimtr", "KB120")],
    });
    expect(failed.accounts[1].servers[0]).toMatchObject({ tone: "err", message: BUSY_MESSAGE });

    const gone = kimtr({ intent: rows, snapshotAccounts: [snap("kimtr", A1, "KB120")] });
    expect(gone.accounts[1].servers[0]).toMatchObject({ tone: "ok", state: "removing" });
    expect(gone.servers[0].tone).toBe("ok");
  });

  it("등록하지 않은 서버 87 에도 그 계좌가 있으면 serverOnlyOn · 유저 칩은 only", () => {
    const u = kimtr({
      intent: [intent("kimtr", A1, "KB120")],
      snapshotAccounts: [snap("kimtr", A1, "KB120"), snap("kimtr", A1, "KB121")],
    });
    expect(u.accounts[0].serverOnlyOn).toEqual(["KB121"]);
    expect(u.servers).toEqual([
      { serverKey: "KB120", tone: "ok", message: null },
      { serverKey: "KB121", tone: "only", message: null },
    ]);
  });

  it("관리 유저의 87 전용 계좌(의도에 없음)도 계좌 줄로 보이되 등록 서버 칩은 없다", () => {
    const u = kimtr({
      intent: [intent("kimtr", A1, "KB120")],
      snapshotAccounts: [snap("kimtr", A1, "KB120"), snap("kimtr", A2, "KB120")],
    });
    expect(u.accounts[1]).toEqual({
      broker: "KB",
      ...A2,
      servers: [],
      serverOnlyOn: ["KB120"],
      orderServer: null,
      defaultOrderServer: null,
    });
    expect(u.accountCount).toBe(1);
    expect(u.servers).toEqual([{ serverKey: "KB120", tone: "ok", message: null }]);
  });
});

describe("계좌 주문 서버 — 지정(orderServer) · 증권사 기본(defaultOrderServer) (29-37 G-1 ⑥)", () => {
  /** 증권사 기본 주문 서버 = KB120 · KYOBO 는 없음(29-29 servers[].isOrderServer). */
  const SERVERS_WITH_DEFAULT: AdminUsersRaw["servers"] = SERVERS.map((s) => ({ ...s, isOrderServer: s.key === "KB120" }));
  const ordered = (row: AdminIntentRow, isOrder: boolean): AdminIntentRow => ({ ...row, isOrder });

  it("지정 KB121(active · isOrder) → orderServer KB121 · defaultOrderServer KB120", () => {
    const u = kimtr({
      intent: [ordered(intent("kimtr", A1, "KB120"), false), ordered(intent("kimtr", A1, "KB121"), true)],
      servers: SERVERS_WITH_DEFAULT,
    });
    expect(u.accounts[0]).toMatchObject({ accountNo: A1.accountNo, orderServer: "KB121", defaultOrderServer: "KB120" });
  });

  it("지정 없음 → orderServer null · defaultOrderServer KB120 / 그 증권사 기본 서버가 없으면 null(교보)", () => {
    const u = kimtr({
      intent: [ordered(intent("kimtr", A1, "KB120"), false), ordered(intent("kimtr", K1, "KYOBO119"), false)],
      servers: SERVERS_WITH_DEFAULT,
    });
    expect(u.accounts.map((a) => [a.broker, a.orderServer, a.defaultOrderServer])).toEqual([
      ["KB", null, "KB120"],
      ["KYOBO", null, null],
    ]);
  });

  it("removing 행에 isOrder 가 와도(비정상) 지정으로 보지 않는다", () => {
    const u = kimtr({
      intent: [ordered(intent("kimtr", A1, "KB120"), false), ordered(intent("kimtr", A1, "KB121", "removing"), true)],
      servers: SERVERS_WITH_DEFAULT,
    });
    expect(u.accounts[0]).toMatchObject({ orderServer: null, defaultOrderServer: "KB120" });
  });

  it("87 에만 있는 계좌(의도 없음) → 두 필드 null", () => {
    const u = kimtr({
      intent: [ordered(intent("kimtr", A1, "KB120"), true)],
      snapshotAccounts: [snap("kimtr", A1, "KB120"), snap("kimtr", A2, "KB120")],
      servers: SERVERS_WITH_DEFAULT,
    });
    expect(u.accounts.map((a) => [a.accountNo, a.orderServer, a.defaultOrderServer])).toEqual([
      [A1.accountNo, "KB120", "KB120"],
      [A2.accountNo, null, null],
    ]);
  });

  it("isOrder · isOrderServer 키가 없는 옛 raw → 두 필드 null(호환)", () => {
    const u = kimtr({ intent: [intent("kimtr", A1, "KB120"), intent("kimtr", A1, "KB121")] });
    expect(u.accounts[0]).toMatchObject({ orderServer: null, defaultOrderServer: null });
    expect(Object.keys(u.accounts[0])).toEqual(expect.arrayContaining(["orderServer", "defaultOrderServer"]));
  });
});

describe("서버에만 있음 행 · 승인 대기 · 정렬", () => {
  it("어떤 웹 사용자에도 연결되지 않은 87 DMA id → serverOnly 행(보기만)", () => {
    const ov = deriveAdminUsersOverview(
      raw({
        intent: [intent("kimtr", A1, "KB120")],
        snapshotAccounts: [
          snap("kimtr", A1, "KB120"),
          snap("smok95", K1, "KYOBO119"),
          snap("winonly", A1, "KB121"),
          snap("winonly", A2, "KB121"),
          snap("winonly", A1, "KB120"),
        ],
      }),
    );
    expect(ov.serverOnly).toEqual([
      { dmaUserId: "smok95", servers: ["KYOBO119"], accountCount: 1 },
      { dmaUserId: "winonly", servers: ["KB120", "KB121"], accountCount: 2 },
    ]);
  });

  it("pending 은 가입 시각 내림차순 · users 는 admin → trader → viewer · 이메일 순", () => {
    const ov = deriveAdminUsersOverview(
      raw({
        appUsers: [
          { email: "zz.viewer@gmail.com", role: "viewer", dmaUserId: null, signedUp: true },
          { email: "kim.trader@gmail.com", role: "trader", dmaUserId: "kimtr", signedUp: true },
          { email: "b.admin@gmail.com", role: "admin", dmaUserId: null, signedUp: false },
          { email: "a.viewer@gmail.com", role: "viewer", dmaUserId: null, signedUp: true },
          { email: "alex@jx1.io", role: "admin", dmaUserId: "alexjx", signedUp: true },
        ],
        pending: [
          { email: "old@gmail.com", signedUpAt: "2026-10-05T01:00:00Z" },
          { email: "new@gmail.com", signedUpAt: "2026-10-06T00:12:00Z" },
        ],
      }),
    );
    expect(ov.users.map((u) => u.email)).toEqual([
      "alex@jx1.io",
      "b.admin@gmail.com",
      "kim.trader@gmail.com",
      "a.viewer@gmail.com",
      "zz.viewer@gmail.com",
    ]);
    expect(ov.pending.map((p) => p.email)).toEqual(["new@gmail.com", "old@gmail.com"]);
  });

  it("DMA 연결 없는 유저는 칩 · 계좌 없음 · 계좌 수 0", () => {
    const ov = deriveAdminUsersOverview(
      raw({ appUsers: [{ email: "park.view@gmail.com", role: "viewer", dmaUserId: null, signedUp: true }] }),
    );
    expect(ov.users).toEqual([
      {
        email: "park.view@gmail.com",
        role: "viewer",
        dmaUserId: null,
        signedUp: true,
        accountCount: 0,
        servers: [],
        accounts: [],
      },
    ]);
    expect(ov.servers).toEqual(SERVERS);
  });
});

describe("deriveAdminServersOverview — 증권사 그룹 카드(D-17)", () => {
  const serversRaw: AdminServersRaw = {
    servers: [
      { key: "KYOBO127", broker: "KYOBO", host: "10.0.0.127", port: 9100, enabled: false, isOrderServer: false, isQuotePrimary: false, sortOrder: 2 },
      { key: "KB121", broker: "KB", host: "10.0.0.121", port: 9100, enabled: true, isOrderServer: false, isQuotePrimary: false, sortOrder: 2 },
      { key: "KYOBO119", broker: "KYOBO", host: "10.0.0.119", port: 9100, enabled: true, isOrderServer: true, isQuotePrimary: false, sortOrder: 1 },
      { key: "KB120", broker: "KB", host: "10.0.0.120", port: 9100, enabled: true, isOrderServer: true, isQuotePrimary: true, sortOrder: 1 },
    ],
    userCounts: [
      { serverKey: "KB120", users: 3 },
      { serverKey: "KB121", users: 2 },
      { serverKey: "KYOBO119", users: 2 },
    ],
    snapshots: [],
  };

  it("KB → KYOBO · sortOrder 순 · userCount = 87 DMA id 수(없으면 0) · live 없으면 status null", () => {
    const ov = deriveAdminServersOverview(serversRaw, null);
    expect(ov.groups.map((g) => [g.broker, g.servers.map((s) => [s.key, s.userCount, s.status])])).toEqual([
      ["KB", [["KB120", 3, null], ["KB121", 2, null]]],
      ["KYOBO", [["KYOBO119", 2, null], ["KYOBO127", 0, null]]],
    ]);
    expect(ov.groups[0].servers[0]).toMatchObject({
      host: "10.0.0.120",
      port: 9100,
      enabled: true,
      isOrderServer: true,
      isQuotePrimary: true,
      sortOrder: 1,
    });
  });

  it("live 상태는 그 서버 키로 붙고, 항목이 없는 서버는 null", () => {
    const live: Record<string, AdminServerLiveStatus> = {
      KB120: { conn: "ok", journal: "ok", admin: "ok", quote: "live" },
      KB121: { conn: "ok", journal: "ok", admin: "connecting", quote: null },
    };
    const ov = deriveAdminServersOverview(serversRaw, live);
    expect(ov.groups[0].servers.map((s) => s.status)).toEqual([live.KB120, live.KB121]);
    expect(ov.groups[1].servers.map((s) => s.status)).toEqual([null, null]);
  });

  it("서버가 없는 증권사도 빈 그룹으로 둔다", () => {
    const ov = deriveAdminServersOverview({ servers: [], userCounts: [], snapshots: [] }, null);
    expect(ov.groups).toEqual([
      { broker: "KB", servers: [] },
      { broker: "KYOBO", servers: [] },
    ]);
  });
});
