/**
 * Phase 35 범위 7 (35-17 · D-25 · D-27 · D-30) — 발사 계획 조회 · 저장. relay `/internal/admin/launch-plan*` 라우트(admin-api)가
 * 부르고, 서버 1대씩 그 서버 admin 연결에 44 op 9 GetLaunchPlan(조회) · op 8 SetLaunchPlan(저장)을 보낸다(gh-trade 43 · 와이어 35-16).
 *
 * Pattern R1 — **서버 키 단위 모듈이다.** `AdminDispatcher` 의 `#serial` 은 DMA 유저 줄이라 여기 쓰지 않는다. 발사 계획은 서버 설정
 * (`log/launch_plan.toml`)이지 사용자 의도가 아니다. 서버당 직렬은 `AdminConn` FIFO(서버당 1건 비행)가 보장하므로, 저장의
 * 조회(전) → 저장 → 조회(후)도 같은 연결 줄에 차례로 선다.
 *
 * DB 무관 — 이력(`launch_plan_changes`)은 server 가 쓴다(D-29). relay 는 결과만 돌려준다.
 *
 * 판정(서버 1대):
 *   - 레지스트리에 없음 · 꺼짐 → `skipped`(`SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE`) · 44 0건
 *   - 파이프라인 · admin 연결 없음 · `isReady` 아님 → `offline` · 44 0건. **87 수신 여부로 판정하지 않는다**(S4) — 발사 계획은
 *     users.toml 과 무관하니 87 캐시가 비어도 op 9 는 답한다.
 *   - command `timeout` · `offline` → 그 상태 그대로(조회는 아무것도 바꾸지 않는다 — 저장의 offline 은 아래 「결과 모름」)
 *   - 조회 요청 마감(`LAUNCH_PLAN_READ_DEADLINE_MS` · 35 R2-WR-02)까지 답이 없음 → 그 서버만 `timeout`(다른 서버 결과는 산다)
 *   - 같은 request_id 86 code ≠ 0(구 서버 code 1 「알 수 없는 명령입니다」 · 10 · 11) → `failed { code, message 원문 }`
 *   - 94 스냅샷 → `ok { plan_rev, updated_at, entries }` — entries 는 Q16|N × K|Q 행만(모르는 행은 warn 후 뺀다) · plan_rev 가
 *     안전 정수를 넘으면 null + warn · updated_at 빈 문자열(손으로 만든 파일) → null
 *
 * 저장(`set` · D-27 · D-29) — 판정 앞단(skipped · offline)은 조회와 같다(44 0건). 그다음 같은 연결 FIFO 로 조회(전 값) → op 8 저장 →
 * (code 0 이면) 조회(후 값):
 *   - 전 조회 실패(구 서버 code 1 등)는 `before_us` null 로 두고 저장을 계속 보낸다 — 거부 문구는 저장 86 이 말한다.
 *   - 저장 86: code ≠ 0 → `failed { code, message 원문 }`(warn) · code 0(같은 값 「변경 없음」 포함) → ok.
 *     op 8 뒤 서버가 보내는 94 는 짝 없음으로 버려지므로(35-16) 새 값은 후 조회로 다시 읽는다.
 *   - 결과 모름(35 CR-01) — op 8 을 큐에 넣은 뒤의 timeout · offline(비행 중 끊김) · 마감 초과는 op 8 이 이미 반영됐을 수 있어
 *     전부 `timeout`(= 모름)으로 돌려준다. `offline`(확정 미반영)은 op 8 을 넣기 전 판정(앞단 · 전 조회 사이 끊김)만이다 —
 *     offline 이 이력(D-29)에 「서버 연결 안 됨」 으로 굳으면 「경계가 언제부터 바뀌었나」 대조가 틀어진다.
 *   - 마감(`deadlineAt` · 라우트 도착 + 10초 · server PUT 상한 15초 안) — AdminConn 의 5초 타이머는 **송신 시점**에 시작해 FIFO
 *     대기(앞선 dispatcher op · 다른 탭의 op 9)가 더해지므로 각 단계를 마감으로 묶는다: 전 조회는 `deadlineAt − ADMIN_COMMAND_TIMEOUT_MS`
 *     까지만 기다리고(넘으면 `before_us` null · 남은 시간이 없으면 보내지 않는다), 저장 86 은 `deadlineAt` 까지(넘으면 timeout ·
 *     op 8 은 뒤에서 계속 · 늦은 결과는 warn), 저장이 끝난 시각 + `ADMIN_COMMAND_TIMEOUT_MS` 가 마감을 넘으면 후 조회를 건너뛰고
 *     `plan` null(저장 결과는 싣는다 · 웹이 다시 읽는다 — 35 WR-01). 후 조회도 마감까지만 기다린다.
 *
 * 범위 · 순서 · 조각 수는 보지 않는다 — gh-trade 가 code 1 + 고정 문구로 말한다(D-26 · D-34). relay 는 int32 구조만(admin-api zod).
 *
 * 뒤탐침(quick-261107-l7w) — 94 말미 `tail_probes` 를 ok 결과의 `tail_probes` 로 옮긴다. 와이어(.fbs) 를 직접 읽지 않고
 * **주입된 어댑터**(`LaunchTailProbeWire`)를 거친다 — 지금 운영 기본은 `LAUNCH_TAIL_PROBE_WIRE_PENDING`(아무것도 싣지 않음 =
 * 웹 「이 서버 버전은 뒤탐침 설정을 몰라요」). 어댑터 머리 주석의 후속 quick 체크리스트를 보라.
 */
import {
  interpretAdminResult,
  type AdminServerResult,
  type LaunchPlanEntry as WireLaunchPlanEntry,
  type LaunchPlanRelaySetBody,
  type LaunchPlanRelaySetResponse,
  type LaunchPlanServer,
  type LaunchTailProbe,
  type LaunchTailProbeRelaySetBody,
  type LaunchTailProbeRelaySetResponse,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { DmaServerRow } from "../registry/registry.js";
import { ADMIN_COMMAND_TIMEOUT_MS, type AdminConn } from "./admin-conn.js";
import { ADMIN_OP, type LaunchPlanSnapshot, type LaunchTailProbeWireRow } from "./types.js";

/** 레지스트리에서 꺼진 · 없는 서버의 `skipped` 사유 — dispatcher `SKIPPED_DISABLED_*` 와 결이 같다(화면이 그대로 보인다). */
export const SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE = "사용이 꺼진 서버 — 켜면 발사 계획을 읽고 바꿀 수 있어요";

/**
 * 조회(`GET /launch-plan`) 요청 마감(ms · 라우트 도착부터 · 35 R2-WR-02). server `RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS`(6초)보다 짧아야
 * 한다 — 넘으면 server 가 relay 응답 전체를 버리고 **두 서버 모두** offline 으로 접어 건강한 서버의 계획까지 잃는다. AdminConn 의 5초
 * 타이머는 송신 시점에 시작해 FIFO 대기(저장 op 8 · 다른 탭 op 9)가 더해지므로, 서버별로 이 마감에 끊어 그 서버만 `timeout` 으로
 * 접는다. 6초 − 응답 · 네트워크 여유 1초.
 */
export const LAUNCH_PLAN_READ_DEADLINE_MS = 5_000;

/**
 * 뒤탐침 와이어 어댑터(quick-261107-l7w) — 44 op 10 인코드 · 94 `tail_probes` 디코드가 붙었는지와 스냅샷에서 행을 꺼내는 법.
 * `canSet` = op 10 을 와이어에 실을 수 있나(거짓이면 서비스는 op 10 을 보내지 않고 라우트가 503 LAUNCH_TAIL_PROBE_UNAVAILABLE).
 * `tailProbesOf` = 94 스냅샷의 뒤탐침 행(undefined · 빈 배열 = 칸 없음 → ok 결과에 `tail_probes` 키를 싣지 않는다).
 *
 * **후속 quick 체크리스트(gh-trade .fbs 인계 뒤 — 이 순서로)**
 *   ① gh-trade `sync-relay-schema.sh` 로 `relay/src/generated/*` 갱신(손 편집 금지 · flatc 고정 버전은 gh-trade 소유).
 *   ② `relay/src/dma/envelope.ts` `buildAdminCommandReq` 에 op 10 의 `launch_profile` · `launch_tail_probe_count` ·
 *      `launch_tail_probe_step_us` 조립(`AdminCommandInput.launchProfile` · `launchTailProbeCount` · `launchTailProbeStepUs`).
 *   ③ `parseLaunchPlanSnapshot` 이 94 `tail_probes` 를 `snap.tailProbes` 로 — 길이 0 = 칸 없음 → undefined
 *      (flatbuffers 는 칸 없음과 빈 벡터를 못 가른다).
 *   ④ `relay/src/index.ts` 주입을 `{ canSet: true, tailProbesOf: (s) => s.tailProbes }` 로.
 *   ⑤ relay 배포.
 */
export interface LaunchTailProbeWire {
  readonly canSet: boolean;
  tailProbesOf(snap: LaunchPlanSnapshot): readonly LaunchTailProbeWireRow[] | undefined;
}

/** 와이어 대기(운영 기본) — op 10 을 못 싣고 94 의 뒤탐침도 읽지 않는다. */
export const LAUNCH_TAIL_PROBE_WIRE_PENDING: LaunchTailProbeWire = Object.freeze({
  canSet: false,
  tailProbesOf: () => undefined,
});

/** 발사 계획이 쓰는 admin 연결 표면 — 테스트가 대역을 넣을 수 있게 좁힌다. `AdminConn` 이 만족한다. */
export type LaunchPlanAdminConn = Pick<AdminConn, "isReady" | "command">;

export type LaunchPlanServiceDeps = {
  /** 서버 레지스트리 — 있는지 · 켜졌는지만 본다. `ServerRegistry` 가 만족한다. */
  registry: { all(): DmaServerRow[] };
  /** 서버 키 → 그 서버 파이프라인의 admin 연결. `ServerPipelines` 가 만족한다. */
  pipelines: { get(key: string): { admin: LaunchPlanAdminConn } | undefined };
  /** 시각 주입구(ms). 기본 `Date.now` — 저장의 후 조회 마감 판정. */
  now?: () => number;
  /** 뒤탐침 와이어 어댑터 — 없으면 `LAUNCH_TAIL_PROBE_WIRE_PENDING`(quick-261107-l7w). */
  tailProbeWire?: LaunchTailProbeWire;
};

const PROFILES = new Set<string>(["Q16", "N"]);
const MARKETS = new Set<string>(["K", "Q"]);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** 조회 ok 결과. */
type LaunchPlanOk = Extract<LaunchPlanServer, { status: "ok" }>;

/** 판정 앞단 — 보낼 수 있는 admin 연결, 또는 그 서버의 최종 결과(skipped · offline). */
type Target = { admin: LaunchPlanAdminConn } | { verdict: { status: "skipped"; message: string } | { status: "offline" } };

export class LaunchPlanService {
  readonly #deps: LaunchPlanServiceDeps;
  readonly #wire: LaunchTailProbeWire;

  constructor(deps: LaunchPlanServiceDeps) {
    this.#deps = deps;
    this.#wire = deps.tailProbeWire ?? LAUNCH_TAIL_PROBE_WIRE_PENDING;
  }

  /**
   * 서버마다 op 9 를 **병렬로** 보내 서버별 계획을 돌려준다. 키 순서 = 입력 순서(중복은 한 번만 묻는다).
   * `deadlineAt`(라우트 도착 + `LAUNCH_PLAN_READ_DEADLINE_MS`)을 주면 그때까지 답이 없는 서버만 `timeout` 으로 접는다 — 다른 서버
   * 결과는 그대로 싣는다(35 R2-WR-02). op 9 는 취소하지 않는다(AdminConn FIFO 가 끝까지 처리 · 조회라 바뀌는 것 없음).
   */
  async read(serverKeys: readonly string[], opts?: { deadlineAt: number }): Promise<Record<string, LaunchPlanServer>> {
    const keys = [...new Set(serverKeys)];
    const late: string[] = [];
    const values = await Promise.all(
      keys.map(async (k): Promise<LaunchPlanServer> => {
        if (opts === undefined) return this.#readOne(k);
        const v = await this.#within(this.#readOne(k), opts.deadlineAt);
        if (v !== null) return v;
        late.push(k);
        return { status: "timeout" };
      }),
    );
    if (late.length > 0) logger.info({ servers: late }, "[admin] 발사 계획 조회 — 요청 마감까지 답 없음 · 그 서버만 timeout");
    const out: Record<string, LaunchPlanServer> = {};
    keys.forEach((k, i) => {
      out[k] = values[i]!;
    });
    return out;
  }

  /**
   * 서버 1대의 (profile, market) 한 칸을 저장한다 — 조회(전) → op 8 → (ok 면 · 마감 안이면) 조회(후). 모듈 머리 「저장」.
   * 응답 `result.server` 는 늘 인자 서버 키다(server 35-13 이 경로 키와 대조한다).
   */
  async set(
    serverKey: string,
    body: LaunchPlanRelaySetBody,
    opts: { deadlineAt: number },
  ): Promise<LaunchPlanRelaySetResponse> {
    const out = await this.#saveVia(serverKey, opts, {
      input: {
        op: ADMIN_OP.SetLaunchPlan,
        userId: "",
        launchProfile: body.profile,
        launchMarket: body.market,
        launchOffsetsUs: body.offsets_us,
      },
      op: ADMIN_OP.SetLaunchPlan,
      beforeOf: (snap) => snap.entries.find((e) => e.profile === body.profile && e.market === body.market)?.offsets_us ?? null,
      label: "발사 계획 저장",
    });
    return { result: out.result, before_us: out.before, plan: out.plan };
  }

  /** 뒤탐침 op 10 을 와이어에 실을 수 있나 — 어댑터 `canSet`(quick-261107-l7w). 거짓이면 라우트가 503 으로 막는다. */
  get tailProbeSettable(): boolean {
    return this.#wire.canSet;
  }

  /**
   * 서버 1대의 (profile) 뒤탐침을 저장한다 — 조회(전) → op 10 → (ok 면 · 마감 안이면) 조회(후). 판정 · 마감 · 결과 모름 규칙은 `set`
   * 과 같은 파이프라인(`#saveVia`). before = 전 조회 ok 의 `tail_probes` 에서 그 profile 행(없으면 null).
   * `tailProbeSettable` 이 거짓일 때 부르면 던진다(라우트가 먼저 막는다 — 프로그래밍 오류 · op 10 을 빈 칸으로 보내지 않게).
   */
  async setTailProbe(
    serverKey: string,
    body: LaunchTailProbeRelaySetBody,
    opts: { deadlineAt: number },
  ): Promise<LaunchTailProbeRelaySetResponse> {
    if (!this.#wire.canSet) throw new Error("뒤탐침 와이어 대기 — setTailProbe 를 부르기 전에 tailProbeSettable 을 확인하라");
    const out = await this.#saveVia(serverKey, opts, {
      input: {
        op: ADMIN_OP.SetLaunchTailProbe,
        userId: "",
        launchProfile: body.profile,
        launchTailProbeCount: body.count,
        launchTailProbeStepUs: body.step_us,
      },
      op: ADMIN_OP.SetLaunchTailProbe,
      beforeOf: (snap) => {
        const row = snap.tail_probes?.find((t) => t.profile === body.profile);
        return row === undefined ? null : { count: row.count, step_us: row.step_us };
      },
      label: "발사 뒤탐침 저장",
    });
    return { result: out.result, before: out.before, plan: out.plan };
  }

  /**
   * 저장 파이프라인 한 벌(계획 op 8 · 뒤탐침 op 10) — 모듈 머리 「저장」. 앞단 판정(skipped · offline · 44 0건) → 전 조회(마감 −
   * ADMIN_COMMAND_TIMEOUT_MS) → 송신 전 isReady → command → 마감 · 결과 모름 timeout · 늦은 결과 warn → interpretAdminResult →
   * ok 면 마감 안에서 후 조회. `beforeOf` = 전 조회 ok 스냅샷에서 「저장 직전 값」 을 고른다. 로그 문구 = `[admin] <label> …`.
   */
  async #saveVia<B>(
    serverKey: string,
    opts: { deadlineAt: number },
    spec: {
      input: Parameters<LaunchPlanAdminConn["command"]>[0];
      op: typeof ADMIN_OP.SetLaunchPlan | typeof ADMIN_OP.SetLaunchTailProbe;
      beforeOf: (snap: LaunchPlanOk) => B | null;
      label: string;
    },
  ): Promise<{ result: AdminServerResult; before: B | null; plan: LaunchPlanOk | null }> {
    const t = this.#target(serverKey);
    if ("verdict" in t) {
      const result: AdminServerResult =
        t.verdict.status === "skipped"
          ? { server: serverKey, outcome: "skipped", message: t.verdict.message }
          : { server: serverKey, outcome: "offline" };
      return { result, before: null, plan: null };
    }
    const { admin } = t;

    // 전 조회는 저장 몫(ADMIN_COMMAND_TIMEOUT_MS)을 남긴 시각까지만 기다린다 — FIFO 대기가 길면 before null 로 저장을 보낸다.
    //   남은 시간이 그보다 짧으면 전 조회를 아예 보내지 않는다.
    const beforeUntil = opts.deadlineAt - ADMIN_COMMAND_TIMEOUT_MS;
    const snap = this.#now() < beforeUntil ? await this.#within(this.#readVia(serverKey, admin), beforeUntil) : null;
    const before = snap !== null && snap.status === "ok" ? spec.beforeOf(snap) : null;

    // 송신 전 판정 — 전 조회 사이에 연결이 끊겼으면 저장 op 는 나가지 않는다(command 가 곧바로 offline) → 확정 미반영.
    if (!admin.isReady) return { result: { server: serverKey, outcome: "offline" }, before, plan: null };

    const sent = admin.command(spec.input);
    const out = await this.#within(sent, opts.deadlineAt);
    if (out === null || out.kind !== "result") {
      // 여기부터는 저장 op 가 이미 나갔을 수 있다(비행 중 끊김 · 86 타임아웃 · 마감까지 FIFO 대기) — 반영 여부를 모른다.
      // offline(확정 미반영)으로 보고하면 화면 · 이력(D-29)이 「미반영」 으로 굳으므로 timeout 으로 돌려준다(웹이 다시 읽는다).
      if (out === null) {
        logger.warn({ server: serverKey }, `[admin] ${spec.label} — 요청 마감까지 86 없음 · 결과 모름(timeout) · 저장은 뒤에서 계속`);
        void sent.then((late) =>
          logger.warn(
            { server: serverKey, outcome: late.kind, code: late.kind === "result" ? late.result.code : undefined },
            `[admin] ${spec.label} — 마감 뒤 도착한 결과`,
          ),
        );
      }
      return { result: { server: serverKey, outcome: "timeout" }, before, plan: null };
    }
    const r = out.result;
    if (interpretAdminResult(spec.op, r.code) === "failed") {
      logger.warn({ server: serverKey, code: r.code, message: r.message }, `[admin] ${spec.label} 거부(86)`);
      return { result: { server: serverKey, outcome: "failed", code: r.code, message: r.message }, before, plan: null };
    }
    const result: AdminServerResult = { server: serverKey, outcome: "ok", usersRev: r.usersRev.toString() };

    if (this.#now() + ADMIN_COMMAND_TIMEOUT_MS > opts.deadlineAt) {
      logger.info({ server: serverKey }, `[admin] ${spec.label} 뒤 조회 건너뜀 — 요청 마감 안에 끝나지 않는다`);
      return { result, before, plan: null };
    }
    const after = await this.#within(this.#readVia(serverKey, admin), opts.deadlineAt);
    return { result, before, plan: after !== null && after.status === "ok" ? after : null };
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now();
  }

  /**
   * `work` 를 `until`(ms 시각)까지만 기다린다 — 넘으면 null(작업은 취소하지 않는다 · AdminConn FIFO 가 끝까지 처리).
   * 이미 지났으면 기다리지 않고 null.
   */
  async #within<T>(work: Promise<T>, until: number): Promise<T | null> {
    const ms = until - this.#now();
    if (ms <= 0) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
      timer.unref?.();
    });
    try {
      return await Promise.race([work, expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  #target(serverKey: string): Target {
    const row = this.#deps.registry.all().find((r) => r.key === serverKey);
    if (row === undefined || !row.enabled) return { verdict: { status: "skipped", message: SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE } };
    const admin = this.#deps.pipelines.get(serverKey)?.admin;
    if (admin === undefined || !admin.isReady) return { verdict: { status: "offline" } };
    return { admin };
  }

  async #readOne(serverKey: string): Promise<LaunchPlanServer> {
    const t = this.#target(serverKey);
    if ("verdict" in t) return t.verdict;
    return this.#readVia(serverKey, t.admin);
  }

  async #readVia(serverKey: string, admin: LaunchPlanAdminConn): Promise<LaunchPlanServer> {
    const out = await admin.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" });
    if (out.kind !== "result") return { status: out.kind };
    if (out.launchPlan !== undefined) return this.#toServer(serverKey, out.launchPlan);
    const r = out.result;
    if (interpretAdminResult(ADMIN_OP.GetLaunchPlan, r.code) === "failed") {
      return { status: "failed", code: r.code, message: r.message };
    }
    // 86 code 0 인데 94 가 없다 — 와이어 규약(op 9 = 94 1프레임) 밖. 지금 계획을 모른다고 답한다.
    logger.warn({ server: serverKey }, "[admin] 발사 계획 조회가 스냅샷 없이 끝났다 — offline 으로 접는다");
    return { status: "offline" };
  }

  #toServer(serverKey: string, snap: LaunchPlanSnapshot): LaunchPlanServer {
    const entries: WireLaunchPlanEntry[] = [];
    const dropped: { profile: string; market: string }[] = [];
    for (const e of snap.entries) {
      if (PROFILES.has(e.profile) && MARKETS.has(e.market)) {
        entries.push({
          profile: e.profile as WireLaunchPlanEntry["profile"],
          market: e.market as WireLaunchPlanEntry["market"],
          offsets_us: [...e.offsetsUs],
        });
      } else {
        dropped.push({ profile: e.profile, market: e.market });
      }
    }
    if (dropped.length > 0) logger.warn({ server: serverKey, dropped }, "[admin] 발사 계획 스냅샷의 모르는 행 — 뺀다");
    let planRev: number | null = Number(snap.planRev);
    if (snap.planRev > MAX_SAFE) {
      logger.warn({ server: serverKey, planRev: snap.planRev.toString() }, "[admin] 발사 계획 rev 가 안전 정수를 넘는다 — null");
      planRev = null;
    }
    const tailProbes = this.#tailProbesOf(serverKey, snap);
    return {
      status: "ok",
      plan_rev: planRev,
      updated_at: snap.updatedAt === "" ? null : snap.updatedAt,
      entries,
      ...(tailProbes !== undefined ? { tail_probes: tailProbes } : {}),
    };
  }

  /**
   * 94 뒤탐침 행 → 계약 모양. 어댑터가 undefined · 빈 배열을 주면 undefined(키를 싣지 않는다 = 구 서버 · 와이어 대기).
   * profile ∈ Q16|N 이고 count · stepUs 가 정수인 행만 옮기고 나머지는 warn 1줄 후 뺀다(entries 의 「모르는 행」 결) —
   * 다 빠지면 역시 undefined.
   */
  #tailProbesOf(serverKey: string, snap: LaunchPlanSnapshot): LaunchTailProbe[] | undefined {
    const rows = this.#wire.tailProbesOf(snap);
    if (rows === undefined || rows.length === 0) return undefined;
    const out: LaunchTailProbe[] = [];
    const dropped: LaunchTailProbeWireRow[] = [];
    for (const r of rows) {
      if (PROFILES.has(r.profile) && Number.isInteger(r.count) && Number.isInteger(r.stepUs)) {
        out.push({ profile: r.profile as LaunchTailProbe["profile"], count: r.count, step_us: r.stepUs });
      } else {
        dropped.push({ profile: r.profile, count: r.count, stepUs: r.stepUs });
      }
    }
    if (dropped.length > 0) logger.warn({ server: serverKey, dropped }, "[admin] 발사 계획 스냅샷의 모르는 뒤탐침 행 — 뺀다");
    return out.length > 0 ? out : undefined;
  }
}
