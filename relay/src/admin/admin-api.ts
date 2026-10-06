/**
 * Phase 29 Plan 11 — ADMIN-05 · D-07. relay Admin 내부 HTTP (`/internal/admin/*`) — Express(29-10 · 29-13)만 부른다.
 *
 * 마운트: `order-api.ts` 의 **공유 비밀 관문(`X-Relay-Secret`) 뒤 · 404 앞**. 이 라우터는 관문을 다시 걸지 않는다 — 관문을
 * 통과하지 못한 요청은 여기 닿지 않는다(경로 존재 여부도 새지 않는다 — T-15-06).
 *
 * 계약(정본 — 29-11 PLAN context 표 · Express 가 1:1 로 프록시한다):
 *   - 요청자 이메일 헤더 `x-admin-email`(감사용) — 없으면 400 `ADMIN_EMAIL_REQUIRED`.
 *   - 바디 16kb(order-api `express.json`) · zod. 검증 실패 400 `VALIDATION_FAILED`.
 *   - 응답 `AdminCommandResponse = { results: AdminServerResult[] }`(shared). 업무 거부 409 `{ error: { code, message } }`
 *     (`DMA_USER_EXISTS` · `NO_APP_USER` · `NO_DMA_USER` · `NO_SUCH_ACCOUNT` · `LAST_ACCOUNT` · `SERVER_BROKER_MISMATCH` · `NO_SERVERS`).
 *
 * 비밀번호(D-19 · Phase 15 D-19): 평문은 이 요청 메모리 안에서만 산다 — `encryptDmaPassword(plain, dmaUserId, credKey)` 로
 * 암호화한 값만 RPC 로 가고, op 1 은 같은 요청의 평문을 44 에 싣는다. 응답 · 로그에는 어디에도 없다.
 */
import { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { isValidAccountNoInput, normalizeAccountNo, SERVER_KEY_RE, type AdminServerResult } from "@gh-radar/shared";

import { RelayApiError } from "../order/order-api.js";
import { encryptDmaPassword } from "../store/credentials.js";
import type { DmaServerRow } from "../registry/registry.js";
import type { AdminDispatcher } from "./dispatcher.js";
import { IntentError, type AdminIntentStore } from "./intent-store.js";

// ============================================================
// 의존성
// ============================================================

export type AdminApiDeps = {
  store: Pick<AdminIntentStore, "createDmaUser" | "putAccount" | "markAccountRemoved">;
  dispatcher: Pick<AdminDispatcher, "reconcileUser" | "changePassword" | "deleteUser">;
  registry: { all(): DmaServerRow[] };
  /** `DMA_CRED_KEY` — relay 에만 있다(D-19). */
  credKey: string;
};

// ============================================================
// 입력 스키마
// ============================================================

/** DMA 유저 id — 1~8바이트(dma_users CHECK `octet_length ≤ 8` · gh-trade users.toml) · 공백 없음. */
export const DmaUserIdSchema = z
  .string()
  .min(1)
  .refine((s) => Buffer.byteLength(s, "utf8") <= 8, "dmaUserId 는 1~8바이트여야 합니다")
  .refine((s) => !/\s/.test(s), "dmaUserId 에 공백을 넣을 수 없습니다");

const PasswordSchema = z.string().min(1).max(128);

const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/**
 * 계좌 1개 — 계좌번호는 trim 뒤 1~12자(자르지 않고 거부) → gh-trade `NormalizeAccountNo` 정규화(" 00123" → "123").
 * KB 는 branch 5자 · trader 6자(서버 code 6 을 미리 막는다), 교보는 저장 전 빈 값으로 강제한다(D-23 ③ · 의도 표 CHECK).
 */
export const AccountSchema = z
  .object({
    broker: z.enum(["KB", "KYOBO"]),
    accountNo: z.string().refine(isValidAccountNoInput, "계좌번호는 1~12자여야 합니다"),
    name: z.string().max(64).default(""),
    branchNo: z.string().max(16).default(""),
    traderId: z.string().max(16).default(""),
    priority: z.number().int().min(0).max(9999).default(0),
  })
  .superRefine((a, ctx) => {
    if (a.broker !== "KB") return;
    if (a.branchNo.length !== 5) ctx.addIssue({ code: "custom", path: ["branchNo"], message: "KB 계좌의 branchNo 는 5자입니다" });
    if (a.traderId.length !== 6) ctx.addIssue({ code: "custom", path: ["traderId"], message: "KB 계좌의 traderId 는 6자입니다" });
  })
  .transform((a) => ({
    broker: a.broker,
    accountNo: normalizeAccountNo(a.accountNo.trim()),
    name: a.name,
    branchNo: a.broker === "KB" ? a.branchNo : "",
    traderId: a.broker === "KB" ? a.traderId : "",
    priority: a.priority,
  }));

/** 등록 서버 키 목록 — 1개 이상 · 레지스트리 키 형식 · 중복 제거. 레지스트리에 있는지는 라우트가 본다. */
const ServersSchema = z
  .array(z.string().regex(SERVER_KEY_RE))
  .min(1)
  .max(32)
  .transform((s) => [...new Set(s)]);

const CreateDmaUserBody = z.object({
  email: EmailSchema,
  dmaUserId: DmaUserIdSchema,
  password: PasswordSchema,
  account: AccountSchema,
  servers: ServersSchema,
});

const PasswordBody = z.object({ password: PasswordSchema });

const PutAccountBody = z.object({ account: AccountSchema, servers: ServersSchema });

/** 경로 `:dma` — 바디의 dmaUserId 와 같은 규칙(Express 5 가 퍼센트 디코딩을 이미 했다 — 다시 풀지 않는다). */
const DmaParam = z.object({ dma: DmaUserIdSchema });

/** 경로 `:broker` · `:accountNo` — 계좌번호는 입력과 같은 검사 뒤 정규화(DB 의도 키). */
const AccountParam = z.object({
  dma: DmaUserIdSchema,
  broker: z.enum(["KB", "KYOBO"]),
  accountNo: z
    .string()
    .refine(isValidAccountNoInput, "계좌번호는 1~12자여야 합니다")
    .transform((a) => normalizeAccountNo(a.trim())),
});

// ============================================================
// 오류
// ============================================================

/** 업무 거부 코드 → 화면 문구 정본은 webapp. 여기 message 는 운영 로그 · 디버그용 짧은 한국어. */
const INTENT_MESSAGE: Record<string, string> = {
  NO_APP_USER: "허용 목록에 없는 이메일입니다",
  DMA_USER_EXISTS: "이미 있는 DMA id 입니다",
  NO_DMA_USER: "없는 DMA id 입니다",
  NO_SUCH_ACCOUNT: "없는 계좌입니다",
  LAST_ACCOUNT: "마지막 계좌는 제거할 수 없습니다 — 사용자 삭제로 처리하세요",
  SERVER_BROKER_MISMATCH: "계좌 증권사와 다른 서버입니다",
  NO_SERVERS: "등록 서버가 없습니다",
  SERVERS_REMAIN: "아직 반영되지 않은 서버가 남았습니다",
};

function toRelayError(err: unknown): unknown {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return new RelayApiError(400, "VALIDATION_FAILED", `${where}${first?.message ?? "invalid"}`);
  }
  if (err instanceof IntentError) {
    if (err.code === "INTERNAL") return new RelayApiError(500, "INTERNAL_ERROR", "Internal server error");
    return new RelayApiError(409, err.code, INTENT_MESSAGE[err.code] ?? err.code);
  }
  return err;
}

// ============================================================
// 라우터
// ============================================================

/** 요청자 이메일(감사용) — 라우트 핸들러가 `res.locals.adminEmail` 로 읽는다. */
const requireAdminEmail: RequestHandler = (req, res, next) => {
  const raw = req.get("x-admin-email")?.trim().toLowerCase() ?? "";
  if (raw === "") {
    next(new RelayApiError(400, "ADMIN_EMAIL_REQUIRED", "x-admin-email header is required"));
    return;
  }
  res.locals.adminEmail = raw;
  next();
};

export function createAdminRouter(deps: AdminApiDeps): Router {
  const router = Router();
  router.use(requireAdminEmail);

  /** 등록 서버가 레지스트리에 있는가 — 없는 키는 FK 500 이 되기 전에 400 으로. */
  const assertKnownServers = (servers: readonly string[]): void => {
    const known = new Set(deps.registry.all().map((r) => r.key));
    const unknown = servers.filter((s) => !known.has(s));
    if (unknown.length > 0) throw new RelayApiError(400, "VALIDATION_FAILED", `servers: 레지스트리에 없는 서버 ${unknown.join(", ")}`);
  };

  const respond = (res: Parameters<RequestHandler>[1], results: AdminServerResult[]): void => {
    res.status(200).json({ results });
  };

  // ── 생성 + 반영 (D-16 트레이서) ─────────────────────────────────────────
  router.post("/dma-users", async (req, res) => {
    const body = CreateDmaUserBody.parse(req.body);
    assertKnownServers(body.servers);
    const adminEmail = res.locals.adminEmail as string;
    // AAD = dmaUserId(D-19) — 웹 user_id 없이도(가입 전 사전 등록) 암호화할 수 있다.
    const passwordEnc = encryptDmaPassword(body.password, body.dmaUserId, deps.credKey);
    await deps.store.createDmaUser({
      email: body.email,
      dmaUserId: body.dmaUserId,
      passwordEnc,
      account: body.account,
      servers: body.servers,
    });
    const results = await deps.dispatcher.reconcileUser(body.dmaUserId, { password: body.password, adminEmail });
    respond(res, results);
  });

  // ── 비밀번호 변경 (D-08 · D-19 — 암호문 교체 + 87 에 유저 있는 서버 op 1 + 옛 표 dual-write) ─────────
  router.post("/dma-users/:dma/password", async (req, res) => {
    const { dma } = DmaParam.parse(req.params);
    const { password } = PasswordBody.parse(req.body);
    const results = await deps.dispatcher.changePassword(dma, password, res.locals.adminEmail as string);
    respond(res, results);
  });

  // ── 계좌 upsert · 등록 서버 집합 교체 + 반영 (빠진 서버 = removing → op 4 → settle) ────────────────
  router.put("/dma-users/:dma/accounts", async (req, res) => {
    const { dma } = DmaParam.parse(req.params);
    const body = PutAccountBody.parse(req.body);
    assertKnownServers(body.servers);
    await deps.store.putAccount(dma, body.account, body.servers);
    const results = await deps.dispatcher.reconcileUser(dma, { adminEmail: res.locals.adminEmail as string });
    respond(res, results);
  });

  // ── 계좌 제거 (removing 표시 + 반영 · 마지막 계좌는 409 LAST_ACCOUNT → 화면은 유저 삭제로 — D-15) ─────
  router.delete("/dma-users/:dma/accounts/:broker/:accountNo", async (req, res) => {
    const { dma, broker, accountNo } = AccountParam.parse(req.params);
    await deps.store.markAccountRemoved(dma, broker, accountNo);
    const results = await deps.dispatcher.reconcileUser(dma, { adminEmail: res.locals.adminEmail as string });
    respond(res, results);
  });

  // ── 유저 삭제 (D-15 — 서버마다 op 2(87 전용 계좌가 있으면 의도 계좌 op 4) · 전 서버 ok 일 때만 DB 삭제) ──
  router.delete("/dma-users/:dma", async (req, res) => {
    const { dma } = DmaParam.parse(req.params);
    const { results, deleted } = await deps.dispatcher.deleteUser(dma, res.locals.adminEmail as string);
    res.status(200).json({ results, deleted });
  });

  // ── 「다시 반영」 — 의도 전체를 서버에 다시 맞춘다(의도 = 87 이면 44 0건) ───────────────────────────
  router.post("/dma-users/:dma/reconcile", async (req, res) => {
    const { dma } = DmaParam.parse(req.params);
    const results = await deps.dispatcher.reconcileUser(dma, { adminEmail: res.locals.adminEmail as string });
    respond(res, results);
  });

  // IntentError · ZodError → RelayApiError. 나머지는 order-api errorHandler 가 500 으로 끝낸다(S-1).
  const mapErrors: ErrorRequestHandler = (err, _req, _res, next) => {
    next(toRelayError(err));
  };
  router.use(mapErrors);

  return router;
}
