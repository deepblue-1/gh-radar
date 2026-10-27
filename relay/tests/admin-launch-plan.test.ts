/**
 * Phase 35 범위 7 (35-17) — `LaunchPlanService` 단위 테스트. 발사 계획 조회 · 저장을 서버 키 단위로 판정한다(Pattern R1 —
 * dispatcher `#serial` 밖 · 서버당 직렬은 AdminConn FIFO).
 *
 * admin 연결은 프로세스 안 대역(`FakeAdmin` — command 입력을 기록하고 미리 넣은 결과를 돌려준다). 와이어(44 · 86 · 94)는 35-16
 * admin-conn 테스트가 잠갔다 — 여기는 그 결과(`AdminCommandOutcome`) → `LaunchPlanServer` 판정만.
 *
 * 잠그는 것 (Task 1 트레이서 — read):
 *   R1  read(['KB120','KYOBO119']) — KB120 스냅샷(plan_rev 3n · 4행) → ok · KYOBO119 86 code 1 → failed{code, message 원문} ·
 *       두 조회 병렬(KB120 이 풀리기 전에 KYOBO119 op 9 가 나간다) · 결과 키 = 입력 순서
 *   R2  레지스트리에 없음 · 꺼짐 → skipped(문구) · admin 없음 · isReady false → offline · timeout · offline 그대로 —
 *       skipped · offline 판정은 command 0회(87 수신 여부로 판정하지 않는다 · S4)
 *   R3  스냅샷의 모르는 행(profile 'X' · market 'Z')은 그 행만 빠지고 warn 1줄 · updated_at 빈 문자열 → null ·
 *       plan_rev 2**53 넘음 → null + warn
 *
 * 잠그는 것 (Task 2 — set):
 *   S1  set('KB120', Q16/Q [-340,-335,-322]) — 송신 순서 op 9 → op 8(세 필드) → op 9 · { result ok usersRev, before_us = 전 스냅샷
 *       Q16/Q, plan = 후 스냅샷 ok }
 *   S2  전 조회 86 code 1 → before_us null 로 계속 저장 · 저장 86 code 1 문구 → result failed code 1 · message 원문 · plan null ·
 *       후 조회 없음 · warn(server · code · message) / 저장 timeout · offline → 그 outcome · plan null
 *   S3  같은 값 재저장(86 code 0 「변경 없음」) → ok · 후 조회 그대로 · 후 조회 실패 → plan null(결과는 ok)
 *   S4  마감 — 저장이 끝난 시각 + ADMIN_COMMAND_TIMEOUT_MS 가 deadlineAt 을 넘으면 후 조회를 건너뛰고 plan null · 같으면 보낸다
 *   S5  skipped(꺼진 · 없는 서버) · offline(연결 없음 · ready 아님) → 그 결과 · before_us null · plan null · command 0회
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COMMAND_TIMEOUT_MS, type AdminCommandOutcome, type AdminConn } from "../src/admin/admin-conn.js";
import {
  LaunchPlanService,
  SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE,
  type LaunchPlanServiceDeps,
} from "../src/admin/launch-plan.js";
import { ADMIN_OP, type LaunchPlanEntry, type LaunchPlanSnapshot } from "../src/admin/types.js";
import type { DmaServerRow } from "../src/registry/registry.js";

type CommandInput = Parameters<AdminConn["command"]>[0];
type Reply = AdminCommandOutcome | (() => Promise<AdminCommandOutcome>);

/** admin 연결 대역 — command 입력 기록 · 넣어 둔 결과를 차례로 돌려준다(없으면 timeout). */
class FakeAdmin {
  isReady = true;
  readonly inputs: CommandInput[] = [];
  readonly #replies: Reply[];

  constructor(replies: Reply[] = []) {
    this.#replies = [...replies];
  }

  push(...r: Reply[]): void {
    this.#replies.push(...r);
  }

  command(input: CommandInput): Promise<AdminCommandOutcome> {
    this.inputs.push(input);
    const r = this.#replies.shift() ?? { kind: "timeout" };
    return typeof r === "function" ? r() : Promise.resolve(r);
  }

  ops(): number[] {
    return this.inputs.map((i) => i.op);
  }
}

function serverRow(key: string, enabled = true): DmaServerRow {
  const broker = key.startsWith("KYOBO") ? "KYOBO" : "KB";
  return { key, broker, host: "127.0.0.1", port: 1, enabled, isOrderServer: false, isQuotePrimary: false, sortOrder: 1 };
}

const ENTRIES: LaunchPlanEntry[] = [
  { profile: "Q16", market: "K", offsetsUs: [-350, -345, -325] },
  { profile: "Q16", market: "Q", offsetsUs: [-340, -335, -322] },
  { profile: "N", market: "K", offsetsUs: [-200] },
  { profile: "N", market: "Q", offsetsUs: [-245] },
];

const WIRE_ENTRIES = [
  { profile: "Q16", market: "K", offsets_us: [-350, -345, -325] },
  { profile: "Q16", market: "Q", offsets_us: [-340, -335, -322] },
  { profile: "N", market: "K", offsets_us: [-200] },
  { profile: "N", market: "Q", offsets_us: [-245] },
];

function snapshotOutcome(over: Partial<LaunchPlanSnapshot> = {}): AdminCommandOutcome {
  const launchPlan: LaunchPlanSnapshot = {
    requestId: 7n,
    planRev: 3n,
    updatedAt: "2026-10-27T22:41:00",
    entries: ENTRIES.map((e) => ({ ...e, offsetsUs: [...e.offsetsUs] })),
    ...over,
  };
  return {
    kind: "result",
    result: { requestId: launchPlan.requestId, ok: true, code: 0, message: "", usersRev: 12n },
    launchPlan,
  };
}

function respOutcome(code: number, message: string, usersRev = 12n): AdminCommandOutcome {
  return { kind: "result", result: { requestId: 7n, ok: code === 0, code, message, usersRev } };
}

const UNKNOWN_OP = "알 수 없는 명령입니다";

type Rig = {
  svc: LaunchPlanService;
  admins: Record<string, FakeAdmin>;
  rows: DmaServerRow[];
  clock: { t: number };
};

function rig(opts: { rows?: DmaServerRow[]; admins?: Record<string, FakeAdmin> } = {}): Rig {
  const rows = opts.rows ?? [serverRow("KB120"), serverRow("KB121"), serverRow("KYOBO119")];
  const admins = opts.admins ?? { KB120: new FakeAdmin(), KYOBO119: new FakeAdmin() };
  const clock = { t: 1_000_000 };
  const deps: LaunchPlanServiceDeps = {
    registry: { all: () => rows.map((r) => ({ ...r })) },
    pipelines: { get: (k) => (admins[k] ? { admin: admins[k]! } : undefined) },
    now: () => clock.t,
  };
  return { svc: new LaunchPlanService(deps), admins, rows, clock };
}

type LogCall = { level: string; args: unknown[] };

async function spyLogs(): Promise<LogCall[]> {
  const { logger } = await import("../src/logger.js");
  const calls: LogCall[] = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      calls.push({ level, args });
    }) as never);
  }
  return calls;
}

describe("P35 LaunchPlanService.read (35-17 Task 1 트레이서)", () => {
  let logs: LogCall[];

  beforeEach(async () => {
    logs = await spyLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("R1 KB120 스냅샷 → ok · KYOBO119 86 code 1 → failed 원문 · 두 조회 병렬 · 입력 순서 키", async () => {
    let releaseKb!: () => void;
    const kbGate = new Promise<void>((r) => {
      releaseKb = r;
    });
    const kb = new FakeAdmin([
      async () => {
        await kbGate;
        return snapshotOutcome();
      },
    ]);
    const kyobo = new FakeAdmin([respOutcome(1, UNKNOWN_OP)]);
    const { svc } = rig({ admins: { KB120: kb, KYOBO119: kyobo } });

    const p = svc.read(["KB120", "KYOBO119"]);
    // KB120 이 풀리기 전에 KYOBO119 op 9 가 이미 나갔다 — 서로 기다리지 않는다.
    await vi.waitFor(() => expect(kyobo.inputs).toHaveLength(1));
    expect(kb.inputs).toHaveLength(1);
    releaseKb();
    const out = await p;

    expect(Object.keys(out)).toEqual(["KB120", "KYOBO119"]);
    expect(out.KB120).toEqual({ status: "ok", plan_rev: 3, updated_at: "2026-10-27T22:41:00", entries: WIRE_ENTRIES });
    expect(out.KYOBO119).toEqual({ status: "failed", code: 1, message: UNKNOWN_OP });
    expect(kb.inputs).toEqual([{ op: ADMIN_OP.GetLaunchPlan, userId: "" }]);
    expect(kyobo.inputs).toEqual([{ op: ADMIN_OP.GetLaunchPlan, userId: "" }]);
    expect(logs.filter((c) => c.level === "warn" || c.level === "error")).toEqual([]);
  });

  it("R1b code 10 · 11 도 failed 원문 그대로", async () => {
    const kb = new FakeAdmin([respOutcome(10, "발사 계획 저장 실패")]);
    const kyobo = new FakeAdmin([respOutcome(11, "관리자 연결이 아닙니다")]);
    const { svc } = rig({ admins: { KB120: kb, KYOBO119: kyobo } });
    expect(await svc.read(["KB120", "KYOBO119"])).toEqual({
      KB120: { status: "failed", code: 10, message: "발사 계획 저장 실패" },
      KYOBO119: { status: "failed", code: 11, message: "관리자 연결이 아닙니다" },
    });
  });

  it("R2 레지스트리 없음 · 꺼짐 → skipped · admin 없음 · ready 아님 → offline · timeout · offline 그대로", async () => {
    const notReady = new FakeAdmin([snapshotOutcome()]);
    notReady.isReady = false;
    const timedOut = new FakeAdmin([{ kind: "timeout" }]);
    const dropped = new FakeAdmin([{ kind: "offline" }]);
    const disabled = new FakeAdmin([snapshotOutcome()]);
    const { svc } = rig({
      rows: [serverRow("KB120"), serverRow("KB121"), serverRow("KB122"), serverRow("KYOBO119"), serverRow("KYOBO127", false)],
      admins: { KB121: notReady, KB122: timedOut, KYOBO119: dropped, KYOBO127: disabled },
    });

    const out = await svc.read(["KB999", "KYOBO127", "KB120", "KB121", "KB122", "KYOBO119"]);
    expect(out).toEqual({
      KB999: { status: "skipped", message: SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE },
      KYOBO127: { status: "skipped", message: SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE },
      KB120: { status: "offline" }, // 파이프라인 · admin 연결 없음
      KB121: { status: "offline" }, // ready 아님 — command 0회
      KB122: { status: "timeout" },
      KYOBO119: { status: "offline" },
    });
    expect(SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE).toContain("사용이 꺼진 서버");
    expect(disabled.inputs).toEqual([]);
    expect(notReady.inputs).toEqual([]);
    expect(timedOut.ops()).toEqual([ADMIN_OP.GetLaunchPlan]);
    expect(dropped.ops()).toEqual([ADMIN_OP.GetLaunchPlan]);
  });

  it("R3 모르는 행은 그 행만 빠지고 warn 1줄 · updated_at 빈 값 → null · plan_rev 2**53 넘음 → null + warn", async () => {
    const kb = new FakeAdmin([
      snapshotOutcome({
        updatedAt: "",
        planRev: 2n ** 53n,
        entries: [
          { profile: "Q16", market: "K", offsetsUs: [-350] },
          { profile: "X", market: "K", offsetsUs: [-1] },
          { profile: "N", market: "Z", offsetsUs: [-2] },
          { profile: "N", market: "Q", offsetsUs: [-245] },
        ],
      }),
    ]);
    const { svc } = rig({ admins: { KB120: kb } });

    expect(await svc.read(["KB120"])).toEqual({
      KB120: {
        status: "ok",
        plan_rev: null,
        updated_at: null,
        entries: [
          { profile: "Q16", market: "K", offsets_us: [-350] },
          { profile: "N", market: "Q", offsets_us: [-245] },
        ],
      },
    });
    const warns = logs.filter((c) => c.level === "warn");
    expect(warns).toHaveLength(2);
    expect(warns.map((w) => w.args[0])).toEqual([
      { server: "KB120", dropped: [{ profile: "X", market: "K" }, { profile: "N", market: "Z" }] },
      { server: "KB120", planRev: (2n ** 53n).toString() },
    ]);
  });

  it("R3b plan_rev 2**53-1 은 number 그대로 · 같은 키 두 번은 한 번만 묻는다", async () => {
    const kb = new FakeAdmin([snapshotOutcome({ planRev: 2n ** 53n - 1n })]);
    const { svc } = rig({ admins: { KB120: kb } });
    const out = await svc.read(["KB120", "KB120"]);
    expect(out.KB120).toMatchObject({ status: "ok", plan_rev: Number.MAX_SAFE_INTEGER });
    expect(kb.inputs).toHaveLength(1);
  });
});

describe("P35 LaunchPlanService.set (35-17 Task 2)", () => {
  let logs: LogCall[];
  const BODY = { profile: "Q16", market: "Q", offsets_us: [-340, -335, -322] } as const;
  const BEFORE_ENTRIES: LaunchPlanEntry[] = ENTRIES.map((e) =>
    e.profile === "Q16" && e.market === "Q" ? { ...e, offsetsUs: [-350, -345, -325] } : e,
  );
  const RANGE = "발사 시각 범위 밖(-3000~1000µs)";

  beforeEach(async () => {
    logs = await spyLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const body = (): { profile: "Q16"; market: "Q"; offsets_us: number[] } => ({ ...BODY, offsets_us: [...BODY.offsets_us] });

  it("S1 op 9 → op 8 → op 9 · result ok · before_us = 전 Q16/Q · plan = 후 스냅샷", async () => {
    const kb = new FakeAdmin([snapshotOutcome({ planRev: 3n, entries: BEFORE_ENTRIES }), respOutcome(0, ""), snapshotOutcome({ planRev: 4n })]);
    const { svc, clock } = rig({ admins: { KB120: kb } });

    const out = await svc.set("KB120", body(), { deadlineAt: clock.t + 10_000 });
    expect(kb.inputs).toEqual([
      { op: ADMIN_OP.GetLaunchPlan, userId: "" },
      { op: ADMIN_OP.SetLaunchPlan, userId: "", launchProfile: "Q16", launchMarket: "Q", launchOffsetsUs: [-340, -335, -322] },
      { op: ADMIN_OP.GetLaunchPlan, userId: "" },
    ]);
    expect(out).toEqual({
      result: { server: "KB120", outcome: "ok", usersRev: "12" },
      before_us: [-350, -345, -325],
      plan: { status: "ok", plan_rev: 4, updated_at: "2026-10-27T22:41:00", entries: WIRE_ENTRIES },
    });
    expect(logs.filter((c) => c.level === "warn" || c.level === "error")).toEqual([]);
  });

  it("S1b 전 스냅샷에 그 칸이 없으면 before_us null", async () => {
    const kb = new FakeAdmin([
      snapshotOutcome({ entries: ENTRIES.filter((e) => !(e.profile === "Q16" && e.market === "Q")) }),
      respOutcome(0, ""),
      snapshotOutcome(),
    ]);
    const { svc, clock } = rig({ admins: { KB120: kb } });
    const out = await svc.set("KB120", body(), { deadlineAt: clock.t + 10_000 });
    expect(out.before_us).toBeNull();
    expect(out.result.outcome).toBe("ok");
  });

  it("S2 전 조회 code 1 → before_us null 로 계속 · 저장 code 1 → failed 원문 · plan null · 후 조회 없음 · warn", async () => {
    const kb = new FakeAdmin([respOutcome(1, UNKNOWN_OP), respOutcome(1, RANGE)]);
    const { svc, clock } = rig({ admins: { KB120: kb } });

    const out = await svc.set("KB120", body(), { deadlineAt: clock.t + 10_000 });
    expect(kb.ops()).toEqual([ADMIN_OP.GetLaunchPlan, ADMIN_OP.SetLaunchPlan]);
    expect(out).toEqual({ result: { server: "KB120", outcome: "failed", code: 1, message: RANGE }, before_us: null, plan: null });
    const warns = logs.filter((c) => c.level === "warn");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.args[0]).toEqual({ server: "KB120", code: 1, message: RANGE });
  });

  it.each([
    ["timeout", { kind: "timeout" }],
    ["offline", { kind: "offline" }],
  ] as const)("S2b 저장 %s → 그 outcome · plan null · 후 조회 없음", async (outcome, reply) => {
    const kb = new FakeAdmin([snapshotOutcome({ entries: BEFORE_ENTRIES }), reply]);
    const { svc, clock } = rig({ admins: { KB120: kb } });
    const out = await svc.set("KB120", body(), { deadlineAt: clock.t + 10_000 });
    expect(out).toEqual({ result: { server: "KB120", outcome }, before_us: [-350, -345, -325], plan: null });
    expect(kb.ops()).toEqual([ADMIN_OP.GetLaunchPlan, ADMIN_OP.SetLaunchPlan]);
  });

  it("S3 같은 값 재저장(code 0 「변경 없음」) → ok · 후 조회 보낸다 · 후 조회 실패면 plan null", async () => {
    const kb = new FakeAdmin([snapshotOutcome(), respOutcome(0, "변경 없음"), snapshotOutcome()]);
    const { svc, clock } = rig({ admins: { KB120: kb } });
    const same = await svc.set("KB120", body(), { deadlineAt: clock.t + 10_000 });
    expect(same.result).toEqual({ server: "KB120", outcome: "ok", usersRev: "12" });
    expect(same.before_us).toEqual([-340, -335, -322]);
    expect(same.plan).toMatchObject({ status: "ok", plan_rev: 3 });
    expect(kb.ops()).toEqual([ADMIN_OP.GetLaunchPlan, ADMIN_OP.SetLaunchPlan, ADMIN_OP.GetLaunchPlan]);

    kb.push(snapshotOutcome(), respOutcome(0, ""), { kind: "timeout" });
    const after = await svc.set("KB120", body(), { deadlineAt: clock.t + 10_000 });
    expect(after.result.outcome).toBe("ok");
    expect(after.plan).toBeNull();
  });

  it("S4 마감 — 저장 끝 + ADMIN_COMMAND_TIMEOUT_MS > deadlineAt 이면 후 조회 건너뜀 · 같으면 보낸다", async () => {
    expect(ADMIN_COMMAND_TIMEOUT_MS).toBe(5_000);
    const kb = new FakeAdmin();
    const { svc, clock } = rig({ admins: { KB120: kb } });
    const t0 = clock.t;
    const after = (ms: number, o: AdminCommandOutcome) => async (): Promise<AdminCommandOutcome> => {
      clock.t += ms;
      return o;
    };

    // 전 조회 3초 + 저장 2.5초 → 끝 t0+5500 · 5500 + 5000 > 10000 → 후 조회 없음.
    kb.push(after(3_000, snapshotOutcome({ entries: BEFORE_ENTRIES })), after(2_500, respOutcome(0, "")));
    const late = await svc.set("KB120", body(), { deadlineAt: t0 + 10_000 });
    expect(late).toEqual({ result: { server: "KB120", outcome: "ok", usersRev: "12" }, before_us: [-350, -345, -325], plan: null });
    expect(kb.ops()).toEqual([ADMIN_OP.GetLaunchPlan, ADMIN_OP.SetLaunchPlan]);

    // 끝 = 마감 − 5000 정확히 → 보낸다.
    clock.t = t0;
    kb.inputs.length = 0;
    kb.push(after(3_000, snapshotOutcome()), after(2_000, respOutcome(0, "")), snapshotOutcome({ planRev: 9n }));
    const onTime = await svc.set("KB120", body(), { deadlineAt: t0 + 10_000 });
    expect(kb.ops()).toEqual([ADMIN_OP.GetLaunchPlan, ADMIN_OP.SetLaunchPlan, ADMIN_OP.GetLaunchPlan]);
    expect(onTime.plan).toMatchObject({ status: "ok", plan_rev: 9 });
  });

  it("S5 skipped · offline → 그 결과 · before_us null · plan null · command 0회", async () => {
    const notReady = new FakeAdmin([snapshotOutcome()]);
    notReady.isReady = false;
    const disabled = new FakeAdmin([snapshotOutcome()]);
    const { svc, clock } = rig({
      rows: [serverRow("KB120"), serverRow("KB121"), serverRow("KYOBO119", false)],
      admins: { KB121: notReady, KYOBO119: disabled },
    });
    const d = { deadlineAt: clock.t + 10_000 };
    expect(await svc.set("KYOBO119", body(), d)).toEqual({
      result: { server: "KYOBO119", outcome: "skipped", message: SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE },
      before_us: null,
      plan: null,
    });
    expect(await svc.set("KB999", body(), d)).toEqual({
      result: { server: "KB999", outcome: "skipped", message: SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE },
      before_us: null,
      plan: null,
    });
    expect(await svc.set("KB120", body(), d)).toEqual({ result: { server: "KB120", outcome: "offline" }, before_us: null, plan: null });
    expect(await svc.set("KB121", body(), d)).toEqual({ result: { server: "KB121", outcome: "offline" }, before_us: null, plan: null });
    expect(notReady.inputs).toEqual([]);
    expect(disabled.inputs).toEqual([]);
  });
});
