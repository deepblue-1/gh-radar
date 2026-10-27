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
 *   - command `timeout` · `offline` → 그 상태 그대로
 *   - 같은 request_id 86 code ≠ 0(구 서버 code 1 「알 수 없는 명령입니다」 · 10 · 11) → `failed { code, message 원문 }`
 *   - 94 스냅샷 → `ok { plan_rev, updated_at, entries }` — entries 는 Q16|N × K|Q 행만(모르는 행은 warn 후 뺀다) · plan_rev 가
 *     안전 정수를 넘으면 null + warn · updated_at 빈 문자열(손으로 만든 파일) → null
 *
 * 저장(`set` · D-27 · D-29) — 판정 앞단(skipped · offline)은 조회와 같다(44 0건). 그다음 같은 연결 FIFO 로 조회(전 값) → op 8 저장 →
 * (code 0 이면) 조회(후 값):
 *   - 전 조회 실패(구 서버 code 1 등)는 `before_us` null 로 두고 저장을 계속 보낸다 — 거부 문구는 저장 86 이 말한다.
 *   - 저장 86: timeout · offline → 그 outcome · code ≠ 0 → `failed { code, message 원문 }`(warn) · code 0(같은 값 「변경 없음」 포함) → ok.
 *     op 8 뒤 서버가 보내는 94 는 짝 없음으로 버려지므로(35-16) 새 값은 후 조회로 다시 읽는다.
 *   - 마감 — 저장이 끝난 시각 + `ADMIN_COMMAND_TIMEOUT_MS` 가 요청 마감(`deadlineAt` · 라우트 도착 + 10초)을 넘으면 후 조회를
 *     건너뛰고 `plan` null(저장 결과는 싣는다 · 웹이 다시 읽는다). 이 경로는 기록이 없어 dispatcher 의 「뒤에서 계속 반영」 접기를
 *     쓰지 않는다 — 저장 86 을 받은 뒤에만 응답한다(전 조회 5초 + 저장 5초 = 마감 10초 안 · server PUT 상한 15초).
 *
 * 범위 · 순서 · 조각 수는 보지 않는다 — gh-trade 가 code 1 + 고정 문구로 말한다(D-26 · D-34). relay 는 int32 구조만(admin-api zod).
 */
import {
  interpretAdminResult,
  type AdminServerResult,
  type LaunchPlanEntry as WireLaunchPlanEntry,
  type LaunchPlanRelaySetBody,
  type LaunchPlanRelaySetResponse,
  type LaunchPlanServer,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { DmaServerRow } from "../registry/registry.js";
import { ADMIN_COMMAND_TIMEOUT_MS, type AdminConn } from "./admin-conn.js";
import { ADMIN_OP, type LaunchPlanSnapshot } from "./types.js";

/** 레지스트리에서 꺼진 · 없는 서버의 `skipped` 사유 — dispatcher `SKIPPED_DISABLED_*` 와 결이 같다(화면이 그대로 보인다). */
export const SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE = "사용이 꺼진 서버 — 켜면 발사 계획을 읽고 바꿀 수 있어요";

/** 발사 계획이 쓰는 admin 연결 표면 — 테스트가 대역을 넣을 수 있게 좁힌다. `AdminConn` 이 만족한다. */
export type LaunchPlanAdminConn = Pick<AdminConn, "isReady" | "command">;

export type LaunchPlanServiceDeps = {
  /** 서버 레지스트리 — 있는지 · 켜졌는지만 본다. `ServerRegistry` 가 만족한다. */
  registry: { all(): DmaServerRow[] };
  /** 서버 키 → 그 서버 파이프라인의 admin 연결. `ServerPipelines` 가 만족한다. */
  pipelines: { get(key: string): { admin: LaunchPlanAdminConn } | undefined };
  /** 시각 주입구(ms). 기본 `Date.now` — 저장의 후 조회 마감 판정. */
  now?: () => number;
};

const PROFILES = new Set<string>(["Q16", "N"]);
const MARKETS = new Set<string>(["K", "Q"]);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** 판정 앞단 — 보낼 수 있는 admin 연결, 또는 그 서버의 최종 결과(skipped · offline). */
type Target = { admin: LaunchPlanAdminConn } | { verdict: { status: "skipped"; message: string } | { status: "offline" } };

export class LaunchPlanService {
  readonly #deps: LaunchPlanServiceDeps;

  constructor(deps: LaunchPlanServiceDeps) {
    this.#deps = deps;
  }

  /** 서버마다 op 9 를 **병렬로** 보내 서버별 계획을 돌려준다. 키 순서 = 입력 순서(중복은 한 번만 묻는다). */
  async read(serverKeys: readonly string[]): Promise<Record<string, LaunchPlanServer>> {
    const keys = [...new Set(serverKeys)];
    const values = await Promise.all(keys.map((k) => this.#readOne(k)));
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
    const t = this.#target(serverKey);
    if ("verdict" in t) {
      const result: AdminServerResult =
        t.verdict.status === "skipped"
          ? { server: serverKey, outcome: "skipped", message: t.verdict.message }
          : { server: serverKey, outcome: "offline" };
      return { result, before_us: null, plan: null };
    }
    const { admin } = t;

    const before = await this.#readVia(serverKey, admin);
    const beforeUs =
      before.status === "ok"
        ? (before.entries.find((e) => e.profile === body.profile && e.market === body.market)?.offsets_us ?? null)
        : null;

    const out = await admin.command({
      op: ADMIN_OP.SetLaunchPlan,
      userId: "",
      launchProfile: body.profile,
      launchMarket: body.market,
      launchOffsetsUs: body.offsets_us,
    });
    if (out.kind !== "result") return { result: { server: serverKey, outcome: out.kind }, before_us: beforeUs, plan: null };
    const r = out.result;
    if (interpretAdminResult(ADMIN_OP.SetLaunchPlan, r.code) === "failed") {
      logger.warn({ server: serverKey, code: r.code, message: r.message }, "[admin] 발사 계획 저장 거부(86)");
      return { result: { server: serverKey, outcome: "failed", code: r.code, message: r.message }, before_us: beforeUs, plan: null };
    }
    const result: AdminServerResult = { server: serverKey, outcome: "ok", usersRev: r.usersRev.toString() };

    if (this.#now() + ADMIN_COMMAND_TIMEOUT_MS > opts.deadlineAt) {
      logger.info({ server: serverKey }, "[admin] 발사 계획 저장 뒤 조회 건너뜀 — 요청 마감 안에 끝나지 않는다");
      return { result, before_us: beforeUs, plan: null };
    }
    const after = await this.#readVia(serverKey, admin);
    return { result, before_us: beforeUs, plan: after.status === "ok" ? after : null };
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now();
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
    return { status: "ok", plan_rev: planRev, updated_at: snap.updatedAt === "" ? null : snap.updatedAt, entries };
  }
}
