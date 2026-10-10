/**
 * admin-api — Phase 29 웹 Admin(`/admin/*`) 의 Express API 클라이언트 한 벌 (D-07 · 29-13 라우트 표).
 *
 * ① 브라우저는 Admin 표를 Supabase 로 직접 읽거나 쓰지 않는다 (D-07)
 *   모든 읽기 · 쓰기는 Express `/api/admin/*` 를 지난다. Express 가 `requireAuth` → `requireAdmin` 관문을
 *   한 번 걸고, DB(service_role) · relay(내부 HTTP) 를 대신 부른다. 그래서 여기에는 `createClient()` 로
 *   표를 만지는 코드가 없다 — 있어야 할 이유도 없다.
 *
 * ② 경로 · 바디 · 응답 모양은 29-13 SUMMARY 「라우트 표」 가 정본이다
 *   타입은 `@gh-radar/shared` 의 Admin 계약을 그대로 쓴다. 뒤 플랜(29-17 · 29-18 · 29-19)은 이 파일을
 *   고치지 않고 부르기만 한다 — 그래서 표의 14경로를 지금 전부 둔다.
 *
 * ③ 경로 조각은 전부 `encodeURIComponent`
 *   이메일(`@` · `+`) · DMA id · 계좌번호 · 서버 키가 경로에 들어간다. Express 5 가 퍼센트 디코딩을 한 번
 *   하므로(29-10 결정) 여기서 한 번만 인코딩한다.
 *
 * ④ relay 를 거치는 쓰기는 타임아웃을 늘린다
 *   Express → relay 왕복 상한이 15초(`RELAY_ADMIN_TIMEOUT_MS` 기본 · relay 요청 마감 10초 + 여유)라 `apiFetch` 기본 8초로는 서버가 아직
 *   결과를 모으는 중에 브라우저가 먼저 끊는다 — 그러면 반영은 됐는데 화면은 「실패」 를 말한다.
 *   relay 를 부를 수 있는 경로는 `RELAY_TIMEOUT_MS`(20초)를 쓴다.
 *
 * 오류는 `apiFetch` 의 `ApiClientError` 그대로다(`status` · `code` = 서버 `error.code` — `FORBIDDEN` ·
 * `SELF_LOCKOUT` · `LAST_ACCOUNT` · `RELAY_FAILED` …). 문구 해석은 화면 몫이다.
 */

import type {
  AdminCommandResponse,
  AdminCreateUserBody,
  AdminDmaInput,
  AdminPutAccountBody,
  AdminServerPatchBody,
  AdminServerResult,
  AdminServersOverview,
  AdminServerUpsertBody,
  AdminUsersOverview,
  AppRole,
  DmaBroker,
} from "@gh-radar/shared";

import type { ApiFetchInit } from "./api";
import { authFetch } from "./auth-fetch";

/** relay 를 거칠 수 있는 요청의 브라우저 타임아웃 — 서버의 relay 상한(15초)보다 길게(위 ④). */
export const RELAY_TIMEOUT_MS = 20_000;

/** 허용 · 역할 쓰기 응답 — relay access reload 통보 결과(best-effort, 실패해도 200). */
export interface AdminWriteResponse {
  ok: true;
  relayNotified: boolean;
}

/** `POST /api/admin/users` 응답 — dma 를 실었으면 서버별 결과가 붙는다. */
export interface AdminCreateUserResponse extends AdminWriteResponse {
  results?: AdminServerResult[];
}

/**
 * `DELETE /api/admin/users/:email` 응답. 단독 DMA 사용자면 서버별 결과가 붙고, 일부 서버가 실패하면
 * `deleted: false` 로 행이 남는다(29-13 공유 판정 — 화면은 칩으로 보이고 「다시 삭제」 를 노출한다).
 */
export interface AdminDeleteUserResponse {
  ok: true;
  deleted: boolean;
  relayNotified: boolean;
  results?: AdminServerResult[];
}

/** `POST /api/admin/users/:email/dma` 응답. */
export interface AdminConnectDmaResponse extends AdminCommandResponse {
  relayNotified: boolean;
}

const enc = encodeURIComponent;

/** JSON 바디 요청 — Express `express.json()` 이 읽도록 Content-Type 을 단다. */
function jsonInit(method: string, body: unknown, extra: ApiFetchInit = {}): ApiFetchInit {
  return {
    ...extra,
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const userPath = (email: string) => `/api/admin/users/${enc(email)}`;
const dmaPath = (dmaUserId: string) => `/api/admin/dma-users/${enc(dmaUserId)}`;
const serverPath = (key: string) => `/api/admin/servers/${enc(key)}`;

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 — 허용 · 역할 · 삭제 · DMA 연결
// ─────────────────────────────────────────────────────────────────────────────

/** 목록 · 칩 · 승인 대기 · 「서버에만 있음」 한 덩이(server 가 shared 파생 한 번). */
export function fetchAdminUsers(): Promise<AdminUsersOverview> {
  return authFetch<AdminUsersOverview>("/api/admin/users");
}

/** 허용 추가 · 승인(`{ email, role }`) · 생성 + DMA(`dma` 포함 — relay 경유). */
export function upsertAdminUser(body: AdminCreateUserBody): Promise<AdminCreateUserResponse> {
  return authFetch<AdminCreateUserResponse>(
    "/api/admin/users",
    jsonInit("POST", body, body.dma ? { timeoutMs: RELAY_TIMEOUT_MS } : {}),
  );
}

export function patchAdminRole(email: string, role: AppRole): Promise<AdminWriteResponse> {
  return authFetch<AdminWriteResponse>(userPath(email), jsonInit("PATCH", { role }));
}

export function deleteAdminUser(email: string): Promise<AdminDeleteUserResponse> {
  return authFetch<AdminDeleteUserResponse>(userPath(email), {
    method: "DELETE",
    timeoutMs: RELAY_TIMEOUT_MS,
  });
}

/** 기존 사용자에 DMA 연결 — 이미 연결돼 있으면 409 `DMA_LINKED`. */
export function connectAdminDma(email: string, dma: AdminDmaInput): Promise<AdminConnectDmaResponse> {
  return authFetch<AdminConnectDmaResponse>(
    `${userPath(email)}/dma`,
    jsonInit("POST", dma, { timeoutMs: RELAY_TIMEOUT_MS }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DMA 사용자 — relay 프록시(서버별 결과 배열)
// ─────────────────────────────────────────────────────────────────────────────

export function changeDmaPassword(dmaUserId: string, password: string): Promise<AdminCommandResponse> {
  return authFetch<AdminCommandResponse>(
    `${dmaPath(dmaUserId)}/password`,
    jsonInit("POST", { password }, { timeoutMs: RELAY_TIMEOUT_MS }),
  );
}

/** 계좌 추가 · 값 변경 · 등록 서버 집합 변경 — 계좌 단위로 서버 집합 전체를 보낸다. */
export function putDmaAccount(dmaUserId: string, body: AdminPutAccountBody): Promise<AdminCommandResponse> {
  return authFetch<AdminCommandResponse>(
    `${dmaPath(dmaUserId)}/accounts`,
    jsonInit("PUT", body, { timeoutMs: RELAY_TIMEOUT_MS }),
  );
}

/** 계좌 제거 — 마지막 계좌면 409 `LAST_ACCOUNT`(사용자 삭제로 가야 한다). */
export function removeDmaAccount(
  dmaUserId: string,
  broker: DmaBroker,
  accountNo: string,
): Promise<AdminCommandResponse> {
  return authFetch<AdminCommandResponse>(
    `${dmaPath(dmaUserId)}/accounts/${enc(broker)}/${enc(accountNo)}`,
    { method: "DELETE", timeoutMs: RELAY_TIMEOUT_MS },
  );
}

/** 「다시 반영」 — DB 의도와 87 의 차이를 다시 보낸다. */
export function reconcileDmaUser(dmaUserId: string): Promise<AdminCommandResponse> {
  return authFetch<AdminCommandResponse>(`${dmaPath(dmaUserId)}/reconcile`, {
    method: "POST",
    timeoutMs: RELAY_TIMEOUT_MS,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 서버 레지스트리
// ─────────────────────────────────────────────────────────────────────────────

/** 증권사 그룹 카드 — relay 상태 조회가 실패하면 각 서버 `status: null`. */
export function fetchAdminServers(): Promise<AdminServersOverview> {
  return authFetch<AdminServersOverview>("/api/admin/servers", { timeoutMs: RELAY_TIMEOUT_MS });
}

/** 「+ 서버」 — 기존 키면 409 `SERVER_EXISTS`(주소 변경은 `patchAdminServer`). */
export function upsertAdminServer(body: AdminServerUpsertBody): Promise<AdminWriteResponse> {
  return authFetch<AdminWriteResponse>("/api/admin/servers", jsonInit("POST", body));
}

/** host · port · enabled · sortOrder 중 1개 이상. 쓰는 중인 서버 끄기는 409 `SERVER_IN_USE`. */
export function patchAdminServer(key: string, body: AdminServerPatchBody): Promise<AdminWriteResponse> {
  return authFetch<AdminWriteResponse>(serverPath(key), jsonInit("PATCH", body));
}

/** 그 증권사의 주문 서버 지정 — 꺼진 서버는 409 `SERVER_DISABLED`. */
export function setOrderServer(key: string): Promise<AdminWriteResponse> {
  return authFetch<AdminWriteResponse>(`${serverPath(key)}/order-server`, { method: "PUT" });
}

/** 시세 주 서버 전환 — relay 가 실행하고 DB 도 relay 가 갱신한다(29-23). */
export function setQuotePrimary(key: string): Promise<{ ok: true }> {
  return authFetch<{ ok: true }>(`${serverPath(key)}/quote-primary`, {
    method: "PUT",
    timeoutMs: RELAY_TIMEOUT_MS,
  });
}
