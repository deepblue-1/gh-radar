import axios, { type AxiosInstance } from "axios";
import type {
  AdminCommandResponse,
  AdminDmaInput,
  AdminPutAccountBody,
  AdminServerLiveStatus,
  DmaBroker,
} from "@gh-radar/shared";

import { logger } from "../logger.js";

/**
 * Phase 29 (D-07) — relay 내부 HTTP 클라이언트 · **Admin 명령 전용**.
 *
 * 브라우저 → Cloud Run `/api/admin/*`(requireAdmin) → **Direct VPC Egress** → VM 내부 IP:8091 →
 * relay `/internal/admin/*`(29-11). 16-16 에서 주문 경로와 함께 지운 `services/relay-client.ts`
 * (이력 `b93681b6^:server/src/services/relay-client.ts`)의 **사설 대역 가드를 본문 무변경으로 복원**하고,
 * 주문 대신 Admin 명령만 싣는다. 주문 접수는 여전히 relay wss 전용이다(16 D-02 — 그 결정은 그대로).
 *
 * ── 계약 (정본은 29-11 relay 내부 HTTP 표) ─────────────────────────────
 *   헤더   `X-Relay-Secret`(공유 비밀) · `x-admin-email`(감사 로그용 요청자 이메일 — relay 는 없으면 400)
 *   응답   `{ status, data }` — 상태코드는 호출부가 직접 분기한다(`validateStatus: () => true`). 409 업무 거부를
 *          axios 예외로 흘리면 「relay 가 거부했다」 와 「relay 에 못 닿았다」 가 섞인다.
 *   실패   네트워크 오류 · 타임아웃은 **throw 하지 않고** `{ status: 0, data: null }` — 허용/역할 쓰기의 즉시 반영 통보는
 *          best-effort 이고(relay 60초 재적재가 따라잡는다), DMA 프록시(29-13)는 0 을 502 로 바꾼다.
 *   경로   `/internal/admin/` 아래만 — 같은 공유 비밀로 다른 내부 경로를 부르는 실수를 막는다.
 *
 * ── 로그 위생 ──────────────────────────────────────────────────────
 *   axios 오류 객체를 통째로 로그에 넣지 않는다 — `config.headers` 에 공유 비밀이, `config.data` 에 비밀번호가 있다.
 *   남기는 것은 메서드 · 경로 · 오류 코드뿐이다. 바디 원문 금지.
 */

export type RelayAdminMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** relay 응답. `status = 0` 은 「relay 에 닿지 못함」(네트워크 오류 · 타임아웃). */
export type RelayAdminResponse<T> = { status: number; data: T | null };

/** `POST /internal/admin/{access,registry}/reload` 응답(29-11). */
export type RelayReloadResult = { ok: boolean; changed: boolean };

/** 저수준 요청 — 경로 · 요청자 이메일 · 바디. 타입드 메서드는 전부 이것 위의 얇은 래퍼다. */
export type RelayAdminRequest = <T = unknown>(
  method: RelayAdminMethod,
  path: string,
  adminEmail: string,
  body?: unknown,
) => Promise<RelayAdminResponse<T>>;

/** `POST /internal/admin/dma-users` 바디(29-11) — 웹 사용자 이메일 + `AdminDmaInput`. */
export type RelayCreateDmaUserBody = { email: string } & AdminDmaInput;

/** `DELETE /internal/admin/dma-users/:dma` 응답 — `deleted=false` 면 일부 서버 실패로 DB 삭제 보류(29-11). */
export type RelayDeleteDmaUserResult = AdminCommandResponse & { deleted: boolean };

/** `GET /internal/admin/servers/status` 응답 — 서버 키별 상태 칩(29-11). */
export type RelayServersStatus = { servers: Record<string, AdminServerLiveStatus> };

/** `POST /internal/admin/servers/:key/quote-primary` 성공 응답(29-23). */
export type RelayQuotePrimaryResult = { ok: boolean };

export type RelayAdminClient = {
  request: RelayAdminRequest;
  /** 허용 · 역할 표 즉시 재적재(D-04) — 강등 · 허용 해제된 사용자의 wss 를 relay 가 끊는다. */
  reloadAccess(adminEmail: string): Promise<RelayAdminResponse<RelayReloadResult>>;
  /** 서버 레지스트리 즉시 재적재(D-09 · D-17). */
  reloadRegistry(adminEmail: string): Promise<RelayAdminResponse<RelayReloadResult>>;
  /** DMA 유저 + 첫 계좌 생성 → 등록 서버마다 op 1 → 서버별 결과(D-16). */
  createDmaUser(
    body: RelayCreateDmaUserBody,
    adminEmail: string,
  ): Promise<RelayAdminResponse<AdminCommandResponse>>;
  /** 비밀번호 교체 → 87 에 그 유저가 있는 등록 서버에만 op 1(D-08). */
  changePassword(
    dmaUserId: string,
    password: string,
    adminEmail: string,
  ): Promise<RelayAdminResponse<AdminCommandResponse>>;
  /** 계좌 추가 · 값 변경 · 등록 서버 교체(op 3 / op 1 · op 4 / op 2). */
  putAccount(
    dmaUserId: string,
    body: AdminPutAccountBody,
    adminEmail: string,
  ): Promise<RelayAdminResponse<AdminCommandResponse>>;
  /** 계좌 제거(op 4) — 마지막 계좌면 relay 409 `LAST_ACCOUNT`. */
  removeAccount(
    dmaUserId: string,
    broker: DmaBroker,
    accountNo: string,
    adminEmail: string,
  ): Promise<RelayAdminResponse<AdminCommandResponse>>;
  /**
   * DMA 유저 삭제(op 2 · 87 전용 계좌가 있으면 의도 계좌 op 4) — 전 서버 ok 일 때만 DB 삭제(`deleted`).
   * `skipDisabled`(29-34 WR-04 — Admin 확인 뒤) → `?skipDisabled=1`: 꺼진 등록 서버는 op 없이 DB 의도만 지운다.
   */
  deleteDmaUser(
    dmaUserId: string,
    adminEmail: string,
    opts?: { skipDisabled?: boolean },
  ): Promise<RelayAdminResponse<RelayDeleteDmaUserResult>>;
  /** 「다시 반영」 — 의도와 87 의 차이만 다시 보낸다(같으면 0건). */
  reconcile(dmaUserId: string, adminEmail: string): Promise<RelayAdminResponse<AdminCommandResponse>>;
  /** 서버 카드 상태 칩(연결 · 저널 · admin · 시세). */
  serversStatus(adminEmail: string): Promise<RelayAdminResponse<RelayServersStatus>>;
  /** 시세 주 서버 전환(D-11 break-then-make) — 성공하면 relay 가 DB 를 갱신한다(29-23). */
  setQuotePrimary(
    serverKey: string,
    adminEmail: string,
  ): Promise<RelayAdminResponse<RelayQuotePrimaryResult>>;
};

// ============================================================
// relay 응답 해석 — DMA 프록시(29-13) 공통
// ============================================================

/** relay 업무 오류 본문(29-11 errorHandler 한 벌). */
export type RelayErrorBody = { error: { code: string; message: string } };

/**
 * relay 응답 → Express 가 그대로 돌려줄 결과.
 * - 200 → `{ status: 200, body }`
 * - 400 · 409(+ 호출부가 고른 상태) 이고 본문이 `{ error: { code, message } }` → 그 상태 · 그 오류 그대로(업무 거부 —
 *   `LAST_ACCOUNT` · `DMA_USER_EXISTS` 등은 webapp 이 코드로 분기한다)
 * - 그 밖(0 = 못 닿음 · 401 공유 비밀 불일치 · 5xx · 본문 모양 위반) → 502 `RELAY_FAILED`
 *   relay 의 401 은 「Admin 이 권한이 없다」 가 아니라 배포 설정 문제다 — 브라우저에 401 을 보내면 로그인 만료로 읽힌다.
 */
export type RelayProxyResult<T> =
  | { status: 200; body: T }
  | { status: number; body: RelayErrorBody };

export const RELAY_FAILED_MESSAGE = "relay 처리에 실패했어요. 잠시 뒤 다시 시도하세요.";

function isRelayErrorBody(v: unknown): v is RelayErrorBody {
  const e = (v as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return !!e && typeof e.code === "string" && typeof e.message === "string";
}

export function toProxyResult<T>(
  res: RelayAdminResponse<T>,
  passthrough: readonly number[] = [400, 409],
): RelayProxyResult<T> {
  if (res.status === 200 && res.data !== null) return { status: 200, body: res.data };
  if (passthrough.includes(res.status) && isRelayErrorBody(res.data)) {
    return {
      status: res.status,
      body: { error: { code: res.data.error.code, message: res.data.error.message } },
    };
  }
  return { status: 502, body: { error: { code: "RELAY_FAILED", message: RELAY_FAILED_MESSAGE } } };
}

const ADMIN_PATH_PREFIX = "/internal/admin/";

// ============================================================
// 사설 대역 가드 (T-15-06) — 이력 relay-client.ts 95-138 본문 무변경
// ============================================================

/**
 * Direct VPC Egress 가 나가는 서브넷 `10.10.0.0/26` = 10.10.0.0 ~ 10.10.0.63 (D-08).
 * relay VM 은 이 안에 있다. 대역 밖 주소는 **부팅 시 throw** — 배포 실수로 공유 비밀이
 * 인터넷으로 나가는 것보다 서버가 안 뜨는 편이 낫다.
 */
const SUBNET_PREFIX = "10.10.0.";
const SUBNET_HOST_MAX = 63;

function isRelaySubnetHost(host: string): boolean {
  if (!host.startsWith(SUBNET_PREFIX)) return false;
  const last = host.slice(SUBNET_PREFIX.length);
  if (!/^\d{1,3}$/.test(last)) return false;
  return Number(last) <= SUBNET_HOST_MAX;
}

/** 로컬 가짜 relay. **비프로덕션 전용** — 비밀이 이 머신 밖으로 나가지 않는다. */
function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/**
 * `RELAY_INTERNAL_URL` 검증. 부적합하면 throw 한다(호출부는 `server.ts` 부팅 경로).
 *
 * 검사 순서가 중요하다 — URL 파싱 실패를 먼저 걸러야 `new URL` 이 던지는 원문이
 * 로그에 그대로 남지 않는다(값에 비밀이 섞여 들어오는 오설정도 있을 수 있다).
 */
export function assertRelayUrl(rawUrl: string, nodeEnv: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("RELAY_INTERNAL_URL must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`RELAY_INTERNAL_URL must be http/https (got: ${url.protocol})`);
  }
  const host = url.hostname;
  if (isRelaySubnetHost(host)) return url;
  if (nodeEnv !== "production" && isLoopbackHost(host)) return url;
  throw new Error(
    `RELAY_INTERNAL_URL host must be inside ${SUBNET_PREFIX}0/26 (got: ${host})`,
  );
}

// ============================================================
// 팩토리
// ============================================================

/**
 * relay Admin 클라이언트 생성. `RELAY_INTERNAL_URL` · `RELAY_ORDER_SECRET` 둘 다 있을 때만 호출한다(`server.ts`).
 *
 * 타임아웃은 `RELAY_ADMIN_TIMEOUT_MS`(기본 15초) — 15초 = relay 요청 마감 10초(29-32 WR-07 · 그때까지 끝나지 않은 서버는
 * `timeout` 으로 접혀 200 으로 온다) + 시세 전환 DB RPC · 네트워크 여유 · 브라우저 20초(webapp `RELAY_TIMEOUT_MS`) 안.
 * 여기서 먼저 끊으면 「relay 는 반영했는데 Express 만 모르는」 상태(생성 재시도 → DMA_USER_EXISTS)가 생기므로 relay 마감보다 길게 둔다.
 */
export function createRelayAdminClient(opts: {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
  nodeEnv: string;
}): RelayAdminClient {
  const url = assertRelayUrl(opts.baseUrl, opts.nodeEnv);
  const http: AxiosInstance = axios.create({
    baseURL: url.origin,
    timeout: opts.timeoutMs,
    headers: {
      "content-type": "application/json",
      // T-15-06 — relay 관문의 공유 비밀. 상수시간 비교는 relay 쪽 소관.
      "X-Relay-Secret": opts.secret,
    },
    // 상태코드 분기는 호출부가 한다 — 4xx/5xx 를 예외로 바꾸지 않는다.
    validateStatus: () => true,
  });

  async function request<T>(
    method: RelayAdminMethod,
    path: string,
    adminEmail: string,
    body?: unknown,
  ): Promise<RelayAdminResponse<T>> {
    if (!path.startsWith(ADMIN_PATH_PREFIX)) {
      throw new Error(`relay admin path must start with ${ADMIN_PATH_PREFIX}`);
    }
    if (!adminEmail) throw new Error("relay admin request requires adminEmail");
    try {
      const res = await http.request({
        method,
        url: path,
        data: body,
        headers: { "x-admin-email": adminEmail },
      });
      const data = res.data === "" || res.data === undefined ? null : (res.data as T);
      return { status: res.status, data };
    } catch (err) {
      // 오류 객체 통째 금지(config.headers = 공유 비밀 · config.data = 비밀번호). 코드만.
      const code = (err as { code?: unknown })?.code;
      logger.warn(
        { relay: { method, path, code: typeof code === "string" ? code : "UNKNOWN" } },
        "[relay-admin] relay 에 닿지 못함 (네트워크 오류 · 타임아웃)",
      );
      return { status: 0, data: null };
    }
  }

  return relayAdminClientFrom(request);
}

/**
 * 저수준 `request` 위에 타입드 메서드를 얹는다 — 경로 문자열은 이 한 곳에만 있다(29-11 계약 표 1:1).
 * 테스트는 가짜 `request` 로 같은 래퍼를 써서 「어느 경로 · 어떤 바디」 를 실제 경로 문자열로 단언한다.
 */
export function relayAdminClientFrom(request: RelayAdminRequest): RelayAdminClient {
  // 경로 값(DMA id · 계좌번호 · 서버 키)은 한 세그먼트로 인코딩한다 — relay(Express 5)가 한 번 디코딩한다.
  const user = (dma: string) => `/internal/admin/dma-users/${encodeURIComponent(dma)}`;
  return {
    request,
    reloadAccess: (adminEmail) =>
      request<RelayReloadResult>("POST", "/internal/admin/access/reload", adminEmail),
    reloadRegistry: (adminEmail) =>
      request<RelayReloadResult>("POST", "/internal/admin/registry/reload", adminEmail),
    createDmaUser: (body, adminEmail) =>
      request<AdminCommandResponse>("POST", "/internal/admin/dma-users", adminEmail, body),
    changePassword: (dma, password, adminEmail) =>
      request<AdminCommandResponse>("POST", `${user(dma)}/password`, adminEmail, { password }),
    putAccount: (dma, body, adminEmail) =>
      request<AdminCommandResponse>("PUT", `${user(dma)}/accounts`, adminEmail, body),
    removeAccount: (dma, broker, accountNo, adminEmail) =>
      request<AdminCommandResponse>(
        "DELETE",
        `${user(dma)}/accounts/${encodeURIComponent(broker)}/${encodeURIComponent(accountNo)}`,
        adminEmail,
      ),
    deleteDmaUser: (dma, adminEmail, opts) =>
      request<RelayDeleteDmaUserResult>(
        "DELETE",
        opts?.skipDisabled === true ? `${user(dma)}?skipDisabled=1` : user(dma),
        adminEmail,
      ),
    reconcile: (dma, adminEmail) =>
      request<AdminCommandResponse>("POST", `${user(dma)}/reconcile`, adminEmail),
    serversStatus: (adminEmail) =>
      request<RelayServersStatus>("GET", "/internal/admin/servers/status", adminEmail),
    setQuotePrimary: (key, adminEmail) =>
      request<RelayQuotePrimaryResult>(
        "POST",
        `/internal/admin/servers/${encodeURIComponent(key)}/quote-primary`,
        adminEmail,
      ),
  };
}
