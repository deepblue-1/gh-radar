/**
 * Phase 19 Plan 10 — relay 부팅 테스트용 최소 Supabase(PostgREST) 스텁 (`node:http` · 임의 포트).
 *
 * `webapp/e2e/fixtures/relay.ts` 의 `startSupabaseStub` 형식을 relay 테스트 헬퍼로 옮긴 것이다. 실 relay
 * 프로세스(`tsx src/index.ts`)가 부팅에서 부르는 경로만 흉내 낸다:
 *
 *   GET  /rest/v1/stocks                       → 빈 배열(`SymbolMap` 페이징은 PAGE_SIZE 미만에서 멈춘다)
 *   GET  /rest/v1/dma_journal_cursor?…         → 시드한 커서 행(기본 없음 = 빈 배열)
 *   POST /rest/v1/rpc/dma_journal_sync_access  → 행 수
 *   POST /rest/v1/rpc/dma_journal_apply        → 입력 seq 로 `{applied, skipped:0, errors:[], last_seq, rows:[]}`
 *   POST /rest/v1/rpc/dma_strategy_apply       → 같은 모양(Phase 25 — 부팅 결선 증명용 · 푸시 행은 25-01 트레이서 몫)
 *   POST /rest/v1/rpc/dma_app_access_map       → 시드한 접근 맵 행(기본 빈 배열 · Phase 29 — relay `AppAccess` 부팅 즉시 + 주기)
 *   GET  /rest/v1/dma_users?dma_user_id=eq.…   → 시드한 행 중 그 DMA id(0~1건 · Phase 29 D-19 — wss 인증 자격증명)
 *   POST /rest/v1/rpc/dma_admin_apply_snapshot → 넣은 계좌 행 수(Phase 29-14 — 87 적재 · 반영 상태)
 *   POST /rest/v1/rpc/dma_account_order_servers → 시드한 계좌별 주문 서버 지정 행(기본 빈 배열 · Phase 29-33 — relay
 *                                                `AccountOrderServers` 부팅 즉시 + 주기. 빈 배열 = 지정 없음 = 종전 라우팅)
 *
 * Phase 29 (29-06) — 옛 신원 뷰 경로(`dma_visibility_identities`)는 소비자(`GatewayIdentities`)와 함께 뺐다. relay 가 다시
 * 부르면 `unknownRequests()` 에 드러난다(journal-boot 가 0 을 단언한다).
 *
 * 모든 요청을 (method, path, query, body) 로 기록한다. 위에 없는 경로도 **빈 배열 200** 으로 받고 기록한다 —
 * 404 로 막으면 relay 쪽 증상(재시도 · 오류 로그)이 원인을 가리고, 기록이 있으면 테스트 출력에 누락 경로가
 * 그대로 보인다(`unknownRequests()`).
 *
 * `maybeSingle()` 은 postgrest-js 2.x 에서 배열을 받아 클라이언트가 개수를 센다 — 그래서 늘 JSON 배열이다.
 * 토큰·서명은 검사하지 않는다(이 헬퍼가 증명하려는 것은 부팅 결선이다).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

/** 스텁이 받은 요청 1건. `body` 는 JSON 이면 파싱값, 아니면 원문(빈 바디는 null). */
export type StubRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
};

/**
 * `dma_journal_cursor` 행. 주문 기록기는 앞 두 칸, 전략 기록기(Phase 25)는 전략 두 칸을 select 한다 — 스텁은
 * select 와 무관하게 행 전체를 돌려주고 기록기가 자기 칸만 읽는다. 전략 칸 생략 · null = 전략 커서 없음.
 */
export type StubCursorRow = {
  journal_epoch: string;
  last_seq: number;
  strategy_journal_epoch?: string | null;
  strategy_last_seq?: number;
};

/** RPC `dma_app_access_map` 행 (Phase 29). 스텁은 시드한 행 전체를 돌려준다. */
export type StubAccessRow = { user_id: string; email: string; role: "admin" | "trader" | "viewer"; dma_user_id: string | null };

/** RPC `dma_account_order_servers` 행 (Phase 29-33 G-1 — 지정된 계좌만). */
export type StubAccountOrderServerRow = { dma_user_id: string; broker: string; account_no: string; server_key: string };

/** `dma_users` 행 (Phase 29 D-19 — `password_enc` 는 AAD = dma_user_id 암호문). */
export type StubDmaUserRow = { dma_user_id: string; password_enc: string };

export type SupabaseStub = {
  readonly url: string;
  /** 지금까지 받은 요청 전량(도착 순서). */
  requests(): StubRequest[];
  /** 특정 경로의 요청만. */
  requestsTo(path: string): StubRequest[];
  /** 알려진 경로 밖의 요청 — 부팅이 새 경로를 부르기 시작하면 여기서 보인다. */
  unknownRequests(): StubRequest[];
  /** 다음 커서 조회부터 돌려줄 행. null 이면 커서 없음. */
  seedCursor(row: StubCursorRow | null): void;
  /** 다음 접근 맵 조회(`rpc/dma_app_access_map`)부터 돌려줄 행. 기본 빈 배열. */
  seedAccessMap(rows: readonly StubAccessRow[]): void;
  /** 다음 지정 조회(`rpc/dma_account_order_servers`)부터 돌려줄 행. 기본 빈 배열(지정 없음). */
  seedAccountOrderServers(rows: readonly StubAccountOrderServerRow[]): void;
  /** 다음 `dma_users` 조회부터 쓸 행. 기본 빈 배열. 조회는 `dma_user_id=eq.<id>` 로 거른다. */
  seedDmaUsers(rows: readonly StubDmaUserRow[]): void;
  /**
   * 다음 `dma_journal_apply` 응답부터 `rows` 에 실을 공개 행(DB 투영 흉내 · 29-14 트레이서). 기본 빈 배열 — 행은 그대로
   * 돌려줄 뿐 입력 이벤트와 대조하지 않는다.
   */
  seedJournalApplyRows(rows: readonly unknown[]): void;
  close(): Promise<void>;
};

const KNOWN_PATHS: ReadonlySet<string> = new Set([
  "/rest/v1/stocks",
  "/rest/v1/dma_journal_cursor",
  "/rest/v1/rpc/dma_journal_sync_access",
  "/rest/v1/rpc/dma_journal_apply",
  "/rest/v1/rpc/dma_strategy_apply",
  "/rest/v1/rpc/dma_app_access_map",
  "/rest/v1/dma_users",
  "/rest/v1/rpc/dma_admin_apply_snapshot",
  "/rest/v1/rpc/dma_account_order_servers",
]);

function parseBody(raw: string): unknown {
  if (raw === "") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export async function startSupabaseStub(): Promise<SupabaseStub> {
  const log: StubRequest[] = [];
  let cursor: StubCursorRow | null = null;
  let accessMap: StubAccessRow[] = [];
  let accountOrderServers: StubAccountOrderServerRow[] = [];
  let dmaUsers: StubDmaUserRow[] = [];
  let journalApplyRows: unknown[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const json = (status: number, body: unknown): void => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };

    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      const body = parseBody(raw);
      log.push({
        method: req.method ?? "GET",
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
      });

      switch (url.pathname) {
        case "/rest/v1/stocks":
          json(200, []);
          return;
        case "/rest/v1/dma_journal_cursor":
          json(200, cursor === null ? [] : [cursor]);
          return;
        case "/rest/v1/rpc/dma_app_access_map":
          json(200, accessMap);
          return;
        case "/rest/v1/rpc/dma_account_order_servers":
          json(200, accountOrderServers);
          return;
        case "/rest/v1/dma_users": {
          // `dma_user_id=eq.<id>` 에서 값만 꺼낸다(maybeSingle — 늘 배열).
          const filter = url.searchParams.get("dma_user_id") ?? "";
          const id = filter.startsWith("eq.") ? filter.slice(3) : "";
          json(200, dmaUsers.filter((r) => r.dma_user_id === id));
          return;
        }
        case "/rest/v1/rpc/dma_journal_sync_access": {
          const rows = (body as { p_rows?: unknown[] } | null)?.p_rows;
          json(200, Array.isArray(rows) ? rows.length : 0);
          return;
        }
        case "/rest/v1/rpc/dma_journal_apply":
        case "/rest/v1/rpc/dma_strategy_apply": {
          const events = (body as { p_events?: Array<{ seq: number }> } | null)?.p_events ?? [];
          const lastSeq = events.length > 0 ? Math.max(...events.map((e) => Number(e.seq))) : 0;
          const rows = url.pathname === "/rest/v1/rpc/dma_journal_apply" && events.length > 0 ? journalApplyRows : [];
          json(200, { applied: events.length, skipped: 0, errors: [], last_seq: lastSeq, rows });
          return;
        }
        case "/rest/v1/rpc/dma_admin_apply_snapshot": {
          const users = (body as { p_users?: Array<{ accounts?: unknown[] }> } | null)?.p_users ?? [];
          json(200, users.reduce((n, u) => n + (Array.isArray(u.accounts) ? u.accounts.length : 0), 0));
          return;
        }
        default:
          // 모르는 경로 — 빈 응답으로 받고 기록만 한다(unknownRequests 로 드러난다).
          json(200, []);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests() {
      return log.map((r) => ({ ...r }));
    },
    requestsTo(path) {
      return log.filter((r) => r.path === path).map((r) => ({ ...r }));
    },
    unknownRequests() {
      return log.filter((r) => !KNOWN_PATHS.has(r.path)).map((r) => ({ ...r }));
    },
    seedCursor(row) {
      cursor = row;
    },
    seedAccessMap(rows) {
      accessMap = rows.map((r) => ({ ...r }));
    },
    seedAccountOrderServers(rows) {
      accountOrderServers = rows.map((r) => ({ ...r }));
    },
    seedDmaUsers(rows) {
      dmaUsers = rows.map((r) => ({ ...r }));
    },
    seedJournalApplyRows(rows) {
      journalApplyRows = [...rows];
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
