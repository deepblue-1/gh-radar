/**
 * Phase 29 Plan 11 — ADMIN-05 · D-07. Admin 반영 디스패처 (`AdminDispatcher`) — 의도 → 서버별 op → 86 → 서버별 결과.
 *
 * 흐름(유저 1명 · 「다시 반영」 과 생성 · 계좌 변경이 같은 길):
 *   의도(`dma_admin_intent`) → 등록 서버 키 집합 → **서버마다 병렬로**
 *     레지스트리에서 꺼진 · 없는 서버 → `skipped`
 *     admin 연결 없음 · 87 미수신(`currentSnapshot()` null) → `offline`(서버 상태를 모르고 쓰지 않는다)
 *     `planServerOps`(29-04 · shared `diffServerAccounts` 한 벌) → op 를 **순서대로** `command()` → `interpretAdminResult`
 *       첫 실패(failed · timeout · offline)에서 그 서버만 멈춘다 — 다른 서버 결과에 번지지 않는다(D-07 · D-23 ④)
 *     settle(D-23 ⑤) — op 4 가 ok(0 · 8 = 이미 없음)인 계좌 · 87 에 이미 없는 removing 계좌 · op 2 ok(0 · 4)면 **계획 때 removing
 *       이던 그 서버 행만**(29-32 WR-01 — op 2 진행 중 다른 계좌에 그 서버가 active 로 막 체크된 행은 남아 다음 반영이 op 1 로
 *       다시 올린다). 그 서버 행 **전부**는 유저 삭제 경로(`settleUserOnOk`)에서만 지운다
 *   → 서버별 결과 배열(레지스트리 순) → `dma_admin_record_results`
 *
 * 요청 마감(29-32 WR-07): 세 공개 메서드는 선택 `deadlineAt`(epoch ms — 라우트 도착 + `ADMIN_REQUEST_DEADLINE_MS`)을 받는다.
 *   서버당 op 는 순차라(op 1개 = 86 5초 + 87 1초) 계좌가 여럿이거나 느린 서버가 있으면 Express 상한을 넘는다. 그래서 마감까지
 *   끝나지 않은 서버는 응답 배열에서 `timeout`(`ADMIN_DEADLINE_MESSAGE`)으로 접어 **먼저 응답**하고 그 결과를 기록한다. 서버
 *   반영은 취소하지 않는다(진행 중 44 · 서버 FIFO 그대로) — 끝까지 가서 실제 결과로 `dma_admin_record_results` 를 한 번 더 부른다.
 *   같은 유저 줄(`#serial`)은 실제 완료에 묶인다 — 응답이 먼저 나가도 다음 요청은 앞 반영이 끝난 뒤에 op 를 보내고, 그 대기
 *   시간도 다음 요청의 마감에 들어간다(줄에서 마감을 맞으면 의도의 등록 서버 전부 `timeout`). 유저 삭제가 마감에 걸리면
 *   `deleted: false` 로 응답하고, 늦게 끝나도 DB 의 DMA 유저를 지우지 않는다 — 다음 삭제 요청이 87 대조로 마저 처리한다.
 *
 * 하지 않는 것:
 *   - **87 에만 있는 계좌 · 유저를 지우는 op 를 만들지 않는다**(D-23 ⑤ · D-16) — op 는 전부 planner 가 의도 행에서만 만든다.
 *     DB 등록 서버가 아닌 서버에는 아무것도 보내지 않는다.
 *   - 평문 비밀번호를 저장 · 로그 · 응답에 남기지 않는다. op 1 직전에만 인자 평문 또는 `dma_users` 암호문 복호(AAD = dmaUserId,
 *     D-19)로 꺼내 44 에 싣는다. dmaUserId · 계좌번호도 로그 인자에 없다(서버 키 · op · code 까지만).
 *   - 같은 DMA 유저의 반영은 relay 안에서 줄 세운다(`#serial`) — 두 Admin 요청의 op 가 한 서버에서 섞이지 않게.
 */
import {
  interpretAdminResult,
  type AdminIntentRow,
  type AdminServerResult,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { DmaServerRow } from "../registry/registry.js";
import { decryptDmaPassword, encryptDmaPassword } from "../store/credentials.js";
import type { AdminConn } from "./admin-conn.js";
import type { AdminIntentStore } from "./intent-store.js";
import { IntentError } from "./intent-store.js";
import { planPasswordOps, planServerOps, type AdminSnapshotView, type PlannedOp, type ServerPlan } from "./planner.js";

/** dispatcher 가 쓰는 admin 연결 표면 — 테스트가 대역을 넣을 수 있게 좁힌다. */
export type AdminConnLike = Pick<AdminConn, "currentSnapshot" | "command">;

/** 44 입력(요청 id 는 연결이 붙인다). */
type CommandInput = Parameters<AdminConn["command"]>[0];

export type AdminDispatcherDeps = {
  store: Pick<
    AdminIntentStore,
    | "intent"
    | "recordResults"
    | "settleServer"
    | "passwordEncOf"
    | "setPassword"
    | "deleteDmaUser"
    | "legacyCredentialUserIds"
    | "updateLegacyCredential"
  >;
  /** 서버 키 → 그 서버 파이프라인의 admin 연결(`ServerPipelines.get`). */
  pipelines: { get(key: string): { admin: AdminConnLike } | undefined };
  registry: { get(key: string): DmaServerRow | undefined; all(): DmaServerRow[] };
  /** `DMA_CRED_KEY` — relay 에만 있다(D-19). */
  credKey: string;
  /**
   * 접근 맵(`AppAccess.entryOf`) — 비밀번호 변경 dual-write 대상(그 DMA id 에 **지금** 연결된 웹 사용자)을 가른다. 주지 않으면
   * dual-write 를 하지 않는다.
   */
  access?: { entryOf(userId: string): { dmaUserId: string | null } | undefined };
  /**
   * 열린 사용자 세션 훅(Phase 29-21 · `SessionManager`). 주지 않으면 세션을 건드리지 않는다(단위 테스트 · 종전).
   *   - op 2 가 ok(0 · 4)인 서버 → `closeForDmaUser(dmaUserId, "deleted", { serverKey })` — 그 서버의 그 DMA 유저 세션만
   *     `unauthorized` 로 끝낸다(재접속 루프 없음 · gh-trade-0d 통보 · CONTEXT 확정).
   *   - 비밀번호 변경 → `updatePassword(dmaUserId, 새 값)` — 열린 세션 유지 · 회선 재접속 로그인부터 새 비밀(D-08 · Pitfall 8).
   */
  sessions?: {
    closeForDmaUser(dmaUserId: string, reason: string, opts?: { serverKey?: string }): number;
    updatePassword(dmaUserId: string, password: string): number;
  };
};

/** op 1 비밀번호 공급자 — 필요할 때 한 번만 꺼낸다(인자 평문 또는 `dma_users` 복호). */
type PasswordSource = () => Promise<string>;

/** 비밀번호를 꺼내지 못했다 — 그 서버 op 1 은 보내지 않고 실패 칩으로 남긴다. */
const PASSWORD_UNAVAILABLE = "저장된 비밀번호를 읽지 못했습니다 — 비밀번호를 다시 설정하세요";

/**
 * Admin 변경 요청 1건의 응답 마감(ms · 29-32 WR-07) — 라우트 도착부터. Express `RELAY_ADMIN_TIMEOUT_MS`(15초)보다 짧아야
 * 「relay 는 반영했는데 Express 는 502」 가 생기지 않는다.
 */
export const ADMIN_REQUEST_DEADLINE_MS = 10_000;

/** 마감까지 끝나지 않은 서버의 결과 칩 문구 — 반영은 뒤에서 계속되고 실제 결과가 다시 기록된다. */
export const ADMIN_DEADLINE_MESSAGE = "10초 안에 끝나지 않아 먼저 응답했어요 — 서버 반영은 계속돼요";

/** 요청 1건의 진행 — 마감 시각에 응답 배열을 접는 데 쓴다. */
type Progress = {
  /** 의도에서 읽은 등록 서버 키 — 줄에서 아직 시작하지 못했으면 null. */
  keys: string[] | null;
  /** 끝난 서버의 실제 결과. */
  done: Map<string, AdminServerResult>;
  /** 전 서버 반영이 끝났다(이후로는 접지 않는다). */
  finished: boolean;
  /** 마감에 접어 먼저 응답했다면 그 기록 Promise — 뒤의 실제 기록이 그 뒤에 쓰도록 기다린다. */
  folded: Promise<void> | null;
};

export class AdminDispatcher {
  readonly #deps: AdminDispatcherDeps;
  /** DMA 유저별 진행 꼬리 — 같은 유저의 반영을 줄 세운다. */
  readonly #chains = new Map<string, Promise<unknown>>();

  constructor(deps: AdminDispatcherDeps) {
    this.#deps = deps;
  }

  /**
   * 의도 전체를 서버에 맞춘다 — 생성 · 계좌 put/remove · 「다시 반영」 공통. 의도와 87 이 같으면 44 0건 · 전 서버 ok.
   * `password` 를 주면(생성 직후) op 1 에 그 평문을 쓰고, 없으면 `dma_users` 암호문을 복호한다.
   * `adminEmail` 은 감사 문맥 — 감사 로그 1줄은 라우터가 남긴다.
   */
  reconcileUser(
    dmaUserId: string,
    opts: { password?: string; adminEmail: string; deadlineAt?: number },
  ): Promise<AdminServerResult[]> {
    const progress = newProgress();
    const full = this.#serial(dmaUserId, async () => {
      const intent = await this.#deps.store.intent(dmaUserId);
      const password = this.#passwordSource(dmaUserId, opts.password);
      const results = await this.#fanOut(progress, this.#serverKeysOf(intent), (serverKey) =>
        this.#applyServer(dmaUserId, serverKey, (snapshot) => planServerOps({ dmaUserId, serverKey, intent, snapshot }), password),
      );
      await this.#recordFinal(dmaUserId, progress, results);
      return results;
    });
    return this.#answerBy(dmaUserId, opts.deadlineAt, progress, full, (results) => results);
  }

  /**
   * 비밀번호 변경(D-08 · D-19) — 암호문 교체(AAD = dmaUserId) → 옛 표 dual-write → 87 에 그 유저가 있는 **DB 등록 서버**마다
   * op 1(비밀번호만 · account 없음). 87 에 유저가 없는 서버는 보낼 것이 없다(계좌 경로의 op 1 신규가 새 비밀번호를 쓴다).
   * 열린 사용자 세션은 끊지 않는다 — 서버 반영 뒤 `sessions.updatePassword` 로 그 세션들의 비밀만 갈아 끼운다(29-21 · D-08 ·
   * Pitfall 8). 서버 반영이 전부 실패해도 부른다 — DB 암호문은 이미 새 값이고 다음 로그인(새 탭 · 재로그인)도 DB 값을 쓰므로
   * 회선 재접속 로그인도 같은 값이어야 한다. 서버에 아직 옛 비밀이 남은 동안의 재접속 거부는 「다시 반영」 이 op 1 로 맞춘다.
   */
  changePassword(
    dmaUserId: string,
    plain: string,
    adminEmail: string,
    opts: { deadlineAt?: number } = {},
  ): Promise<AdminServerResult[]> {
    void adminEmail;
    const progress = newProgress();
    const full = this.#serial(dmaUserId, async () => {
      await this.#deps.store.setPassword(dmaUserId, encryptDmaPassword(plain, dmaUserId, this.#deps.credKey));
      try {
        await this.#dualWrite(dmaUserId, plain);
        const intent = await this.#deps.store.intent(dmaUserId);
        const password = this.#passwordSource(dmaUserId, plain);
        const results = await this.#fanOut(progress, this.#serverKeysOf(intent), (serverKey) =>
          this.#applyServer(dmaUserId, serverKey, (snapshot) => planPasswordOps({ dmaUserId, snapshot }), password),
        );
        await this.#recordFinal(dmaUserId, progress, results);
        return results;
      } finally {
        // 서버 op 1 이 끝난 뒤(성공 · 실패 무관 · 마감 뒤 늦은 완료여도) — 그동안 열린 세션은 서버와 같은 옛 비밀을 쥔다
        // (재접속 거부 창을 줄인다).
        this.#deps.sessions?.updatePassword(dmaUserId, plain);
      }
    });
    return this.#answerBy(dmaUserId, opts.deadlineAt, progress, full, (results) => results);
  }

  /**
   * 유저 삭제(D-15) — DB 등록 서버마다 그 유저의 의도 계좌를 **전부 제거 중으로 보고** 계획한다: 그 서버에 87 전용 계좌가 없으면
   * op 2(0 · 4 = 반영됨 → 그 서버 행 settle), 있으면 의도 계좌만 op 4(87 전용 계좌 · 유저는 남긴다 — D-23 ⑤). 전 서버 ok 일 때만
   * `dma_admin_delete_dma_user` — 일부 실패(BUSY · 12 마지막 사용자 · 무응답)면 남은 서버 의도는 그대로 두고 결과 칩이 보여 준다.
   * 마감(29-32)에 걸리면 `deleted: false` 로 먼저 응답하고, 늦게 전 서버 ok 로 끝나도 DB 삭제는 부르지 않는다(화면 · DB 일치).
   */
  deleteUser(
    dmaUserId: string,
    adminEmail: string,
    opts: { deadlineAt?: number } = {},
  ): Promise<{ results: AdminServerResult[]; deleted: boolean }> {
    void adminEmail;
    const progress = newProgress();
    const full = this.#serial(dmaUserId, async () => {
      const intent = (await this.#deps.store.intent(dmaUserId)).map((r) => ({ ...r, state: "removing" as const }));
      const password = this.#passwordSource(dmaUserId, undefined);
      const results = await this.#fanOut(progress, this.#serverKeysOf(intent), (serverKey) =>
        this.#applyServer(
          dmaUserId,
          serverKey,
          (snapshot) => planServerOps({ dmaUserId, serverKey, intent, snapshot }),
          password,
          { settleUserOnOk: true },
        ),
      );
      await this.#recordFinal(dmaUserId, progress, results);
      if (progress.folded !== null) {
        // 응답은 이미 deleted false 로 나갔다 — 여기서 지우면 화면과 DB 가 갈라진다. 다음 삭제 요청이 87 대조로 마저 처리한다.
        logger.info({ servers: results.length }, "[admin] 유저 삭제 — 마감 뒤 완료 · DB 삭제는 다음 요청");
        return { results, deleted: false };
      }
      if (!results.every((r) => r.outcome === "ok")) return { results, deleted: false };
      try {
        await this.#deps.store.deleteDmaUser(dmaUserId);
        return { results, deleted: true };
      } catch (err) {
        // settle 실패로 등록 행이 남았다 — 다음 삭제 요청이 87 대조로 다시 settle 한다. 그 밖 오류는 위로.
        if (err instanceof IntentError && err.code === "SERVERS_REMAIN") {
          logger.warn({ servers: results.length }, "[admin] 유저 삭제 보류 — settle 되지 않은 등록 행이 남았다");
          return { results, deleted: false };
        }
        throw err;
      }
    });
    return this.#answerBy(dmaUserId, opts.deadlineAt, progress, full, (results) => ({ results, deleted: false }));
  }

  // ----------------------------------------------------------
  // 서버 1대
  // ----------------------------------------------------------

  /**
   * 서버 1대에 계획을 보내고 결과 1개를 만든다. op 는 순서대로 · 첫 실패에서 멈춘다. 이미 반영된 제거는 실패가 나도 settle 한다.
   *
   * `settleUserOnOk`(유저 삭제) — DB 의 등록 행은 active 그대로라 「removing 행만 지우는」 settle 이 닿지 않는다. 그래서 그 서버가
   * **끝까지 ok** 일 때만 그 서버 행 전부를 settle 한다(op 2 든 의도 계좌 op 4 든 서버에서 그 유저의 의도 계좌가 다 빠졌다).
   * 중간 실패면 아무것도 지우지 않는다 — 다음 삭제 요청이 87 대조로 남은 것만 다시 보낸다.
   */
  async #applyServer(
    dmaUserId: string,
    serverKey: string,
    plan: (snapshot: AdminSnapshotView) => ServerPlan,
    password: PasswordSource,
    opts: { settleUserOnOk?: boolean } = {},
  ): Promise<AdminServerResult> {
    const row = this.#deps.registry.get(serverKey);
    if (row === undefined || !row.enabled) return { server: serverKey, outcome: "skipped" };
    const admin = this.#deps.pipelines.get(serverKey)?.admin;
    const snapshot = admin?.currentSnapshot() ?? null;
    if (admin === undefined || snapshot === null) return { server: serverKey, outcome: "offline" };
    const p = plan(snapshot);
    if (p.status === "no-snapshot") return { server: serverKey, outcome: "offline" };

    let usersRev = snapshot.usersRev.toString();
    const removed = [...p.settleRemoved];
    let failure: AdminServerResult | null = null;

    for (const op of p.ops) {
      let input: CommandInput;
      try {
        input = await this.#toCommand(dmaUserId, op, password);
      } catch (err) {
        logger.error(
          { server: serverKey, op: op.op, reason: err instanceof Error ? err.name : "unknown" },
          "[admin] op 1 비밀번호를 꺼내지 못했다 — 그 서버는 실패로 남긴다",
        );
        failure = { server: serverKey, outcome: "failed", message: PASSWORD_UNAVAILABLE };
        break;
      }
      const outcome = await admin.command(input);
      if (outcome.kind !== "result") {
        failure = { server: serverKey, outcome: outcome.kind };
        break;
      }
      const r = outcome.result;
      usersRev = r.usersRev.toString();
      if (interpretAdminResult(op.op, r.code) === "failed") {
        failure = { server: serverKey, outcome: "failed", code: r.code, message: r.message, usersRev };
        break;
      }
      if (op.op === 4) removed.push(op.accountNo);
      if (op.op === 2) {
        // 그 서버에서 유저가 빠졌어도 settle 은 계획 때 removing 이던 행만(29-32 WR-01) — 그 사이 커밋된 active 행은 남긴다.
        removed.push(...op.accountNos);
        // 29-21 — 그 서버에서 그 유저가 사라졌다(0 · 4). 그 서버의 그 DMA 유저 세션만 재접속 루프 없이 끝낸다 — 서버는 54 뒤
        // 연결을 끊고 재로그인을 거부하므로 두면 거부 루프 · 「회선 끊김」 오표시가 된다. 다른 서버 세션은 그대로다.
        this.#deps.sessions?.closeForDmaUser(dmaUserId, "deleted", { serverKey });
      }
    }

    if (opts.settleUserOnOk === true) {
      if (failure === null) await this.#settle(dmaUserId, serverKey, [], true);
    } else if (removed.length > 0) {
      await this.#settle(dmaUserId, serverKey, removed, false);
    }
    return failure ?? { server: serverKey, outcome: "ok", usersRev };
  }

  /** settle 실패는 응답을 실패로 바꾸지 않는다 — 서버는 이미 반영됐고, 다음 「다시 반영」 이 87 에 없음을 보고 다시 settle 한다. */
  async #settle(dmaUserId: string, serverKey: string, removed: string[], userRemoved: boolean): Promise<void> {
    try {
      await this.#deps.store.settleServer(dmaUserId, serverKey, removed, userRemoved);
    } catch (err) {
      logger.error(
        { server: serverKey, removed: removed.length, userRemoved, reason: err instanceof Error ? err.name : "unknown" },
        "[admin] settle 실패 — 의도 행이 removing 으로 남는다(다음 다시 반영이 정리)",
      );
    }
  }

  async #toCommand(dmaUserId: string, op: PlannedOp, password: PasswordSource): Promise<CommandInput> {
    switch (op.op) {
      case 1:
        return "passwordOnly" in op
          ? { op: 1, userId: dmaUserId, password: await password() }
          : { op: 1, userId: dmaUserId, password: await password(), account: { ...op.account } };
      case 2:
        return { op: 2, userId: dmaUserId };
      case 3:
        return { op: 3, userId: dmaUserId, account: { ...op.account } };
      case 4:
        // op 4 는 account_no 만 본다(StockDMA.fbs) — 나머지 칸은 빈 값.
        return { op: 4, userId: dmaUserId, account: { accountNo: op.accountNo, name: "", branchNo: "", traderId: "", priority: 0 } };
    }
  }

  // ----------------------------------------------------------
  // 공통
  // ----------------------------------------------------------

  /**
   * D-19 dual-write — 롤백 시 옛 relay 가 읽는다 · 이관 기간 뒤 정리(29-24). 옛 `dma_credentials` 에서 이 DMA id 를 가진 행 중
   * 접근 맵에서 **지금도 이 DMA id 에 연결된** 웹 사용자 행만 그 user_id 를 AAD 로 다시 암호화해 갈아 끼운다. 행이 없으면 건너뛴다.
   * 실패해도 요청은 성공이다(새 표는 이미 갱신됐다) — 사유만 로그에 남긴다.
   */
  async #dualWrite(dmaUserId: string, plain: string): Promise<void> {
    const access = this.#deps.access;
    if (access === undefined) return;
    try {
      const userIds = await this.#deps.store.legacyCredentialUserIds(dmaUserId);
      let updated = 0;
      for (const userId of userIds) {
        if (access.entryOf(userId)?.dmaUserId !== dmaUserId) continue;
        await this.#deps.store.updateLegacyCredential(userId, dmaUserId, encryptDmaPassword(plain, userId, this.#deps.credKey));
        updated += 1;
      }
      if (updated > 0) logger.info({ updated }, "[admin] 비밀번호 dual-write — 옛 dma_credentials 행 갱신(D-19)");
    } catch (err) {
      logger.error(
        { reason: err instanceof Error ? err.name : "unknown" },
        "[admin] 비밀번호 dual-write 실패 — 새 표는 갱신됨 · 롤백하면 옛 relay 는 옛 비밀번호를 쓴다",
      );
    }
  }

  /**
   * 서버마다 병렬 — 결과는 레지스트리 순(없는 키는 뒤 · 키 순). 끝난 서버 결과를 `progress` 에 적어 마감 접기(`#answerBy`)가
   * 읽게 한다 — 전 서버가 끝나면 `finished`(이후로는 접지 않는다).
   */
  async #fanOut(
    progress: Progress,
    serverKeys: string[],
    run: (serverKey: string) => Promise<AdminServerResult>,
  ): Promise<AdminServerResult[]> {
    progress.keys = serverKeys;
    const results = await Promise.all(
      serverKeys.map((k) =>
        run(k).then((r) => {
          progress.done.set(k, r);
          return r;
        }),
      ),
    );
    progress.finished = true;
    return this.#sorted(results);
  }

  #sorted(results: AdminServerResult[]): AdminServerResult[] {
    const order = new Map(this.#deps.registry.all().map((r, i) => [r.key, i] as const));
    const rank = (k: string): number => order.get(k) ?? Number.MAX_SAFE_INTEGER;
    return results.sort((a, b) => rank(a.server) - rank(b.server) || (a.server < b.server ? -1 : a.server > b.server ? 1 : 0));
  }

  /**
   * 요청 마감(29-32 WR-07) — `full`(줄 · 반영 · 기록 전부)이 `deadlineAt` 전에 끝나면 그 값, 아니면 마감 시각에 끝난 서버는
   * 실제 결과 · 나머지는 `timeout`(`ADMIN_DEADLINE_MESSAGE`)으로 접어 기록하고 `fold` 로 응답한다. `full` 은 취소하지 않는다 —
   * 줄 꼬리도 `full` 에 묶여 있어 다음 요청은 이 반영이 실제로 끝난 뒤에 시작한다. 줄에서 아직 시작하지 못했으면(`keys` null)
   * 의도를 따로 읽어 등록 서버 전부를 접는다.
   */
  #answerBy<T>(
    dmaUserId: string,
    deadlineAt: number | undefined,
    progress: Progress,
    full: Promise<T>,
    fold: (results: AdminServerResult[]) => T,
  ): Promise<T> {
    if (deadlineAt === undefined) return full;
    return new Promise<T>((resolve, reject) => {
      let answered = false;
      const timer = setTimeout(() => {
        void (async () => {
          if (progress.finished) return;
          const keys = progress.keys ?? this.#serverKeysOf(await this.#deps.store.intent(dmaUserId));
          // 의도를 읽는 사이 반영이 끝났거나 응답이 나갔으면 실제 결과가 이긴다.
          if (answered || progress.finished) return;
          const results = this.#sorted(
            keys.map((k) => progress.done.get(k) ?? { server: k, outcome: "timeout", message: ADMIN_DEADLINE_MESSAGE }),
          );
          progress.folded = this.#record(dmaUserId, results);
          answered = true;
          logger.warn(
            { servers: results.filter((r) => r.message === ADMIN_DEADLINE_MESSAGE).map((r) => r.server) },
            "[admin] 요청 마감 — 끝나지 않은 서버는 timeout 으로 먼저 응답 · 반영은 계속",
          );
          resolve(fold(results));
        })().catch((err: unknown) => {
          if (answered) return;
          answered = true;
          reject(err);
        });
      }, Math.max(0, deadlineAt - Date.now()));
      full.then(
        (value) => {
          clearTimeout(timer);
          if (answered) return;
          answered = true;
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          if (!answered) {
            answered = true;
            reject(err);
            return;
          }
          logger.error(
            { reason: err instanceof Error ? err.name : "unknown" },
            "[admin] 마감 뒤 반영 실패 — 응답은 이미 나갔다(다음 다시 반영이 87 대조로 맞춘다)",
          );
        },
      );
    });
  }

  /** 의도 행의 등록 서버 키(중복 없음). DB 등록 서버만 — 87 에만 그 유저가 있는 서버는 대상이 아니다(D-23 ⑤). */
  #serverKeysOf(intent: readonly AdminIntentRow[]): string[] {
    return [...new Set(intent.map((r) => r.serverKey))];
  }

  #passwordSource(dmaUserId: string, plain: string | undefined): PasswordSource {
    let cached: Promise<string> | null = null;
    return () => {
      if (cached === null) {
        cached =
          plain !== undefined
            ? Promise.resolve(plain)
            : this.#deps.store.passwordEncOf(dmaUserId).then((enc) => {
                if (enc === null) throw new Error("dma_users 행 없음");
                // AAD = dmaUserId(D-19). 옛 형식 · 변조면 여기서 throw — 틀린 비밀번호를 서버에 싣지 않는다.
                return decryptDmaPassword(enc, dmaUserId, this.#deps.credKey);
              });
      }
      return cached;
    };
  }

  /** 실제 결과 기록 — 마감에 접어 먼저 기록했다면 그 기록이 끝난 뒤에 쓴다(늦은 접힌 기록이 실제 결과를 덮지 않게). */
  async #recordFinal(dmaUserId: string, progress: Progress, results: readonly AdminServerResult[]): Promise<void> {
    if (progress.folded !== null) await progress.folded;
    await this.#record(dmaUserId, results);
  }

  /** 결과 기록 실패는 응답을 막지 않는다 — 칩은 다음 기록 · 87 대조로 맞춰진다. */
  async #record(dmaUserId: string, results: readonly AdminServerResult[]): Promise<void> {
    if (results.length === 0) return;
    try {
      await this.#deps.store.recordResults(
        dmaUserId,
        results.map((r) => ({
          server: r.server,
          outcome: r.outcome,
          ...(r.code !== undefined ? { code: r.code } : {}),
          ...(r.message !== undefined ? { message: r.message } : {}),
        })),
      );
    } catch (err) {
      logger.error(
        { servers: results.length, reason: err instanceof Error ? err.name : "unknown" },
        "[admin] 결과 기록 실패 — 응답은 그대로 돌려준다",
      );
    }
  }

  /** 같은 DMA 유저의 작업을 앞 작업 뒤로 줄 세운다(앞 작업의 실패와 무관). */
  #serial<T>(dmaUserId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.#chains.get(dmaUserId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.#chains.set(dmaUserId, tail);
    void tail.then(() => {
      if (this.#chains.get(dmaUserId) === tail) this.#chains.delete(dmaUserId);
    });
    return run;
  }
}

function newProgress(): Progress {
  return { keys: null, done: new Map(), finished: false, folded: null };
}
