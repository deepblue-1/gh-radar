/**
 * Phase 15 Plan 01 — RELAY-01. relay 프로세스 env 로더.
 *
 * DMA 게이트웨이 접속 정보 · wss/주문 포트 · Supabase 서비스롤 · 시크릿 2종을
 * 프로세스 기동 시 한 번에 읽어 `RelayConfig` 로 굳힌다. `get()` 은 필수(미설정 시
 * 즉시 throw), `optional()` 은 선택이며 각 항목에 "미설정 시 어떤 동작이 되는지"를
 * 주석으로 남긴다 (server/src/config.ts L18-25 규약).
 *
 * 결정 근거:
 *   D-11  wss 인증은 업그레이드 후 첫 메시지 `{t:"auth", token}` — 그래서 Supabase
 *         서비스롤이 필수다(토큰 검증 + dma_credentials 조회).
 *   D-12  `DMA_CRED_KEY` = base64 32B AES-256-GCM 키. DB 의 dma_password_enc 복호화용.
 *   D-22  `RELAY_ORDER_SECRET` = server → relay 내부 주문 릴레이 공유 비밀
 *         (`x-relay-secret` 헤더). 방화벽 source-range 와 이중 방어.
 *   D-13  세션은 userId 단위. `SESSION_GRACE_MS` 는 마지막 소켓이 끊긴 뒤 DMA 세션을
 *         유지하는 유예(새로고침 왕복 흡수).
 *   19 D-10  `DMA_OBSERVER_SECRET` = 관찰자 기록 연결의 비밀(Secret Manager 새 시크릿 한 곳에서만
 *            온다). production 에서는 필수 — 없으면 기동이 실패한다(T-19-03).
 *   quick-260929-c8e  관찰자 다중 업스트림 — 관찰자는 **게이트웨이당 1개**다(19-CONTEXT D-13 확장).
 *            `journalUpstreams[0]` 은 주 게이트웨이(DMA_HOST · DMA_PORT · DMA_BROKER · DMA_OBSERVER_SECRET)다.
 *            추가 게이트웨이는 아래 `EXTRA_OBSERVER_ENV` 표에서만 온다 — 지금은 행 1개:
 *              `DMA_KYOBO_HOST`            호스트. 없거나 빈 값이면 추가 관찰자 없음(**오늘과 같다**).
 *              `DMA_KYOBO_PORT`            포트. 없거나 빈 값이면 9100.
 *              `DMA_OBSERVER_SECRET_KYOBO` 비밀. 없으면 그 관찰자는 disabled(production 에서도 기동은 막지 않는다).
 *            **사용자 세션(SessionManager)은 주 게이트웨이 단일**이다 — 추가 게이트웨이는 관찰자 전용이다.
 *   26 D-17  시세 전용 관찰자(role 1 · quote 연결) 비밀 = `DMA_QUOTE_OBSERVER_SECRET` 우선, 없거나 빈 값이면
 *            `DMA_OBSERVER_SECRET` 폴백. 프로덕션(Secret Manager 에 `DMA_OBSERVER_SECRET` 하나)은 폴백으로 같은
 *            비밀을 쓰고 배포 스크립트는 바뀌지 않는다. production 필수 검사는 여전히 `DMA_OBSERVER_SECRET` 만 본다.
 *
 * 하지 않는 것:
 *   - 여기서 값을 검증(길이·형식)하지 않는다. 존재 여부만 본다 — 검증은 사용처가 한다.
 *   - 시크릿을 로깅하지 않는다. logger.ts 의 redact 경로가 2차 방어다.
 */

/**
 * 관찰자 업스트림 1개 (quick-260929-c8e). `gateway` 는 relay 쪽 키다 — `dma_journal_cursor` PK ·
 * `dma_journal_apply`/`dma_journal_sync_access` 의 `p_gateway`(advisory lock) · `dma_account_access` 교체 범위.
 * 게이트웨이 LoginReq 의 broker 와는 무관하다.
 */
export type JournalUpstream = {
  gateway: string;
  host: string;
  port: number;
  /** 관찰자 로그인 비밀. 없으면 그 관찰자는 disabled 다. 로그 인자로 넘기지 않는다. */
  secret: string | undefined;
};

/**
 * 추가 관찰자 env 표 (quick-260929-c8e). 게이트웨이를 더할 때 **행 하나만** 추가한다 — index.ts 는
 * `journalUpstreams` 를 순회만 하고 키 리터럴을 모른다. 비밀 env 이름은 logger redact 에도 더한다.
 */
const EXTRA_OBSERVER_ENV: ReadonlyArray<{ gateway: string; hostEnv: string; portEnv: string; secretEnv: string }> = [
  { gateway: "KYOBO", hostEnv: "DMA_KYOBO_HOST", portEnv: "DMA_KYOBO_PORT", secretEnv: "DMA_OBSERVER_SECRET_KYOBO" },
];

/** 추가 관찰자 포트 기본값 — 게이트웨이 관찰자 포트 규약(주 게이트웨이와 같다). */
const DEFAULT_OBSERVER_PORT = 9100;

export type RelayConfig = {
  nodeEnv: "development" | "test" | "production";
  logLevel: string;
  appVersion: string;

  // --- 필수 ---
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** base64 32B AES-256-GCM 키 (D-12). dma_credentials.dma_password_enc 복호화. */
  dmaCredKey: string;
  /** server → relay 내부 주문 릴레이 공유 비밀 (D-22, `x-relay-secret`). */
  relayOrderSecret: string;

  // --- 선택 (기본값 명시) ---
  /** 브라우저 wss 포트. 미설정 시 8090 — Caddy 리버스 프록시 업스트림 기본값. */
  wsPort: number;
  /** server 전용 내부 주문 REST 포트. 미설정 시 8091 — VPC 내부에서만 열린다. */
  orderApiPort: number;
  /**
   * DMA 게이트웨이 호스트. **미설정 시 127.0.0.1(로컬 mock)** 이다 (D-27 / T-15-25).
   *
   * 실서버(KB 사내망, VPN 경유)를 기본값으로 두면 로컬에서 env 를 깜빡한 실행이 곧바로
   * 실계좌 게이트웨이에 접속한다. 실서버 주소는 **배포 env 로만** 주입한다 —
   * 안전한 쪽이 기본값이어야 한다.
   */
  dmaHost: string;
  /** DMA 게이트웨이 TCP 포트. 미설정 시 9100. */
  dmaPort: number;
  /** LoginReq 의 broker 필드. 미설정 시 "KB" — 현재 유일 지원 증권사. */
  dmaBroker: string;
  /**
   * 마지막 wss 소켓이 끊긴 뒤 DMA 세션을 유지하는 유예(ms). 미설정 시 300000(5분).
   * 0 으로 두면 새로고침마다 DMA 재로그인이 발생한다(게이트웨이 부하 + 2~3초 지연).
   */
  sessionGraceMs: number;
  /**
   * 관찰자 기록 연결 비밀 (Phase 19 D-10 · D-13). **production 에서 미설정이면 기동이 실패한다** —
   * 컨테이너가 재시작 루프로 원인을 로그에 남기고 `/healthz` 가 사라져 uptime 알림이 울린다.
   * 개발·테스트에서 미설정이면 관찰자가 disabled 로 남는다(e2e 로컬 relay 가 그대로 뜬다 — 주문 기록 없음).
   * 로그 인자로 넘기지 않는다(logger redact 는 실수 방어).
   */
  dmaObserverSecret: string | undefined;
  /**
   * 관찰자 업스트림 목록 (quick-260929-c8e). **0번은 주 게이트웨이**다 — 위 4필드(dmaBroker · dmaHost ·
   * dmaPort · dmaObserverSecret)와 같은 값이다. 1번부터는 `EXTRA_OBSERVER_ENV` 표에서 호스트가 설정된
   * 행만 온다. 추가 env 가 없으면 길이 1 — 오늘과 같다. 게이트웨이 키는 서로 겹치지 않는다(겹치면 기동 거부).
   */
  journalUpstreams: readonly [JournalUpstream, ...JournalUpstream[]];
  /**
   * 시세 전용 관찰자(role 1 · quote 연결) 비밀 (Phase 26 D-17). `DMA_QUOTE_OBSERVER_SECRET` 이 있으면 그 값,
   * 없거나 빈 문자열이면 `DMA_OBSERVER_SECRET` 폴백. 둘 다 없으면 undefined — QuoteFeed 가 disabled 로 남고
   * 게이트웨이 소켓을 열지 않는다. e2e 처럼 quote 키만 두면 저널 관찰자는 꺼진 채 quote 연결만 켜진다.
   * 「새 비밀 없음」 은 서버 쪽 약속이고 relay env 키 추가는 그 약속을 깨지 않는다. 로그 인자로 넘기지 않는다.
   */
  dmaQuoteObserverSecret: string | undefined;
  /**
   * 마지막 소비자가 떠난 시세 키의 구독 · 캐시 유지 시간(ms · Phase 26 D-10 linger). 미설정 시 15000 = hub `LINGER_MS`.
   * 0 = 1→0 즉시 해제 — **e2e 전용**이다(테스트 사이 전역 시세 캐시 격리). 프로덕션 배포 env 는 이 키를 넣지 않는다.
   * 음수 · 비숫자는 기동을 거부한다(T-26-13 — 잘못된 값으로 캐시가 무한히 남거나 뜻밖에 즉시 풀리지 않게).
   */
  quoteLingerMs: number;
};

export function loadConfig(): RelayConfig {
  const get = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} must be set`);
    return v;
  };
  const optional = (k: string): string | undefined => process.env[k];

  const nodeEnv = (process.env.NODE_ENV ?? "development") as RelayConfig["nodeEnv"];
  const dmaObserverSecret = optional("DMA_OBSERVER_SECRET") || undefined;
  if (nodeEnv === "production" && dmaObserverSecret === undefined) {
    throw new Error("DMA_OBSERVER_SECRET must be set in production (Phase 19 D-13)");
  }
  // D-17: quote 키 우선 · 빈 문자열은 「없음」 으로 보고 저널 비밀로 폴백한다.
  const dmaQuoteObserverSecret = optional("DMA_QUOTE_OBSERVER_SECRET") || dmaObserverSecret;
  // D-10 linger — 기본 15000(hub LINGER_MS). 빈 문자열 · 음수 · 비숫자는 기동 거부(사유 문구에 값만 · 비밀 없음).
  const quoteLingerRaw = optional("QUOTE_LINGER_MS") ?? "15000";
  const quoteLingerMs = quoteLingerRaw.trim() === "" ? Number.NaN : Number(quoteLingerRaw);
  if (!Number.isFinite(quoteLingerMs) || quoteLingerMs < 0) {
    throw new Error(`QUOTE_LINGER_MS must be a finite number >= 0 (ms) — got "${quoteLingerRaw}"`);
  }

  // 기본값은 로컬 mock 이다. 실서버 주소는 배포 env 가 반드시 명시해야 한다 (D-27).
  const dmaHost = optional("DMA_HOST") ?? "127.0.0.1";
  const dmaPort = Number(optional("DMA_PORT") ?? "9100");
  const dmaBroker = optional("DMA_BROKER") ?? "KB";

  const primary: JournalUpstream = { gateway: dmaBroker, host: dmaHost, port: dmaPort, secret: dmaObserverSecret };
  const extras: JournalUpstream[] = [];
  const seen = new Set<string>([primary.gateway]);
  for (const row of EXTRA_OBSERVER_ENV) {
    const host = optional(row.hostEnv);
    // 호스트가 없으면 그 행은 없다 — 비밀만 있어도 무시한다(배포 스크립트는 비밀이 있을 때만 호스트를 넘긴다).
    if (!host) continue;
    if (seen.has(row.gateway)) {
      // 키가 겹치면 두 관찰자가 한 커서 · epoch · 매핑을 나눠 쓴다(교체가 서로를 지운다). 조용히 섞이게 두지 않는다.
      throw new Error(
        `${row.hostEnv}: 관찰자 게이트웨이 키 "${row.gateway}" 가 이미 쓰인다(DMA_BROKER 또는 다른 추가 관찰자) — 커서 · epoch · 매핑이 섞인다`,
      );
    }
    seen.add(row.gateway);
    extras.push({
      gateway: row.gateway,
      host,
      // 빈 문자열도 기본값으로 (`||`).
      port: Number(optional(row.portEnv) || String(DEFAULT_OBSERVER_PORT)),
      // 추가 게이트웨이 비밀 부재는 production 에서도 기동을 막지 않는다 — KB 단독 재배포를 막지 않고,
      // 비밀 없는 관찰자는 disabled 로 `/healthz` 본문(journalGateways)에 드러난다.
      secret: optional(row.secretEnv) || undefined,
    });
  }

  return {
    nodeEnv,
    logLevel: optional("LOG_LEVEL") ?? "info",
    appVersion: optional("APP_VERSION") ?? "dev",

    supabaseUrl: get("SUPABASE_URL"),
    supabaseServiceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    dmaCredKey: get("DMA_CRED_KEY"),
    relayOrderSecret: get("RELAY_ORDER_SECRET"),

    wsPort: Number(optional("WS_PORT") ?? "8090"),
    orderApiPort: Number(optional("ORDER_API_PORT") ?? "8091"),
    dmaHost,
    dmaPort,
    dmaBroker,
    sessionGraceMs: Number(optional("SESSION_GRACE_MS") ?? "300000"),
    dmaObserverSecret,
    journalUpstreams: [primary, ...extras],
    dmaQuoteObserverSecret,
    quoteLingerMs,
  };
}
