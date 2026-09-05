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
 *
 * 하지 않는 것:
 *   - 여기서 값을 검증(길이·형식)하지 않는다. 존재 여부만 본다 — 검증은 사용처가 한다.
 *   - 시크릿을 로깅하지 않는다. logger.ts 의 redact 경로가 2차 방어다.
 */

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
};

export function loadConfig(): RelayConfig {
  const get = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} must be set`);
    return v;
  };
  const optional = (k: string): string | undefined => process.env[k];

  return {
    nodeEnv: (process.env.NODE_ENV ?? "development") as RelayConfig["nodeEnv"],
    logLevel: optional("LOG_LEVEL") ?? "info",
    appVersion: optional("APP_VERSION") ?? "dev",

    supabaseUrl: get("SUPABASE_URL"),
    supabaseServiceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    dmaCredKey: get("DMA_CRED_KEY"),
    relayOrderSecret: get("RELAY_ORDER_SECRET"),

    wsPort: Number(optional("WS_PORT") ?? "8090"),
    orderApiPort: Number(optional("ORDER_API_PORT") ?? "8091"),
    // 기본값은 로컬 mock 이다. 실서버 주소는 배포 env 가 반드시 명시해야 한다 (D-27).
    dmaHost: optional("DMA_HOST") ?? "127.0.0.1",
    dmaPort: Number(optional("DMA_PORT") ?? "9100"),
    dmaBroker: optional("DMA_BROKER") ?? "KB",
    sessionGraceMs: Number(optional("SESSION_GRACE_MS") ?? "300000"),
  };
}
