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
 *   Phase 29 D-09  **서버 레지스트리 원천 게이트.** 게이트웨이 서버 목록의 원천은 `DMA_REGISTRY_SOURCE` 가 정한다:
 *            `env`(기본) — 위 `DMA_HOST`(기본 127.0.0.1) · `DMA_PORT` · `DMA_BROKER` 와 `EXTRA_OBSERVER_ENV` 표에서 1~2행을
 *                          합성한다(`envServers` — 키는 종전 `KB`/`KYOBO` 그대로). **로컬 · 테스트 · e2e 전용**이다.
 *            `db`        — `dma_servers` 표(`ServerRegistry`). **`NODE_ENV=production` 에서만** 허용한다.
 *            두 방향 모두 기동 거부로 잠근다: 비프로덕션 + db → throw(로컬 relay 가 운영 Supabase 레지스트리를 읽어 실서버에
 *            붙지 못하게 — 개발 Mac 은 WireGuard 로 운영 게이트웨이 대역에 직결된다), production + env(또는 미설정) → throw
 *            (운영이 env 표 · 로컬 기본값으로 조용히 떨어지지 않게). 실서버 주소는 여기에도 레지스트리 모듈에도 없다(D-27).
 *            비밀은 **증권사별** 고정 매핑이다(RESEARCH Pitfall 11 — 레지스트리에 비밀을 두지 않는다):
 *              `observerSecretOf("KB")` = `DMA_OBSERVER_SECRET` · `observerSecretOf("KYOBO")` = `DMA_OBSERVER_SECRET_KYOBO`
 *              `quoteSecretOf("KB")` = `DMA_QUOTE_OBSERVER_SECRET` ‖ `DMA_OBSERVER_SECRET` · `quoteSecretOf("KYOBO")` = `DMA_OBSERVER_SECRET_KYOBO`
 *            비밀 확인 순서: production 의 `DMA_OBSERVER_SECRET` 필수 검사를 원천 게이트보다 **먼저** 본다(사유 문구 불변).
 *   Phase 29 D-04 (29-06)  `APP_ACCESS_REFRESH_MS` = 접근 맵(`AppAccess`) 재적재 주기. 기본 60000. **production 은 env 를
 *            무시하고 60000** 이다(운영 RPC 부하를 env 실수로 키우지 않게 — 즉시 반영은 `reload()` 몫). e2e 는 짧게 준다
 *            (시드를 켜고 끈 전환이 다음 페이지 로드 전에 반영되게). 빈 문자열 · 음수 · 0 · 비숫자는 기동 거부(`QUOTE_LINGER_MS` 규율).
 *   Phase 40  `PUSH_NOTIFY` = 체결 앱 푸시 켜기/끄기(`on` | `off`). 없으면 production 은 on · 그 밖(로컬 · 테스트 · e2e)은 off
 *            (실기기로 새지 않게). `off` 는 운영 비상 끄기다(`PUSH_NOTIFY=off bash scripts/deploy-relay.sh` — 40-09). 다른 값은
 *            기동 거부(오타가 조용히 켜짐/꺼짐이 되지 않게). 켜져도 송신기(APNs · FCM 비밀 — 40-09)가 0 개면 `PushNotifier` 는
 *            꺼짐 로그 1줄 뒤 RPC 0 이다.
 *   Phase 40 (40-09)  APNs 송신 키 = `APNS_AUTH_KEY_B64`(.p8 PEM 의 base64 **한 줄** — docker `--env-file` 은 여러 줄 값을
 *            못 싣는다 · RESEARCH Pitfall 10) + `APNS_KEY_ID`(10자 영숫자 · .p8 파일 이름 `AuthKey_` 뒤). 둘 다 있고 디코드가
 *            PEM(`BEGIN PRIVATE KEY`)이며 Key ID 형식이 맞을 때만 `apns` 가 생긴다. **비치명** — 없거나 어긋나면 `apns` 는
 *            undefined · `apnsOffReason` 에 원인 문구(값 · 길이 없음)만 남고 relay 는 iOS 송신기만 빠진 채 뜬다(KYOBO 비밀 꼴).
 *            `APNS_TEAM_ID`(기본 954QPCS3F5) · `APNS_TOPIC`(기본 com.ghtrade.app = 앱 번들 id)은 env 가 있으면 그 값.
 *   Phase 40 (40-09)  `FCM_PROJECT_ID` = FCM HTTP v1 프로젝트. 있으면 그 값 · 없으면 production 은 `gh-radar` · 그 밖은
 *            undefined(로컬엔 GCE 메타데이터 서버가 없다). 키 파일은 없다 — 토큰은 VM SA 메타데이터 서버에서 받는다.
 *
 * 하지 않는 것:
 *   - 여기서 값을 검증(길이·형식)하지 않는다. 존재 여부만 본다 — 검증은 사용처가 한다.
 *   - 시크릿을 로깅하지 않는다. logger.ts 의 redact 경로가 2차 방어다. 비밀은 함수 필드 뒤에 있어
 *     설정 객체를 통째로 덤프해도 값이 나가지 않는다.
 */
import { APP_ACCESS_REFRESH_MS } from "./access/app-access.js";
import {
  assertRegistryInvariants,
  isDmaBroker,
  type DmaBroker,
  type DmaServerRow,
} from "./registry/registry.js";

/** APNs 송신 설정 (Phase 40 — 40-09 `ApnsSender` 입력). 값을 로그로 내보내지 않는다. */
export type ApnsConfig = {
  /** .p8 PEM 원문(`APNS_AUTH_KEY_B64` 디코드). */
  keyPem: string;
  /** Key ID(10자 · JWT 헤더 `kid`). */
  keyId: string;
  /** Apple 팀 ID(JWT `iss`). */
  teamId: string;
  /** `apns-topic` = 앱 번들 id. */
  topic: string;
};

/** APNs 팀 ID 기본값(Apple Developer 팀 — 40-04). */
export const APNS_DEFAULT_TEAM_ID = "954QPCS3F5";
/** APNs topic 기본값 = 앱 번들 id. */
export const APNS_DEFAULT_TOPIC = "com.ghtrade.app";
/** FCM 프로젝트 기본값(production — Firebase 프로젝트 = GCP 프로젝트 gh-radar). */
export const FCM_DEFAULT_PROJECT_ID = "gh-radar";

const APNS_KEY_ID_RE = /^[A-Za-z0-9]{10}$/;

/**
 * APNs env → 설정(비치명). 원인 문구에는 env 이름만 담는다 — 값 · 길이를 넣지 않는다(T-19-14).
 * export 는 테스트용이 아니라 `loadConfig` 한 곳의 규칙을 이름 붙인 것이다.
 */
export function apnsConfigOf(env: Readonly<Record<string, string | undefined>>): {
  apns: ApnsConfig | undefined;
  offReason: string | undefined;
} {
  const keyB64 = env.APNS_AUTH_KEY_B64?.trim() || undefined;
  const keyId = env.APNS_KEY_ID?.trim() || undefined;
  if (keyB64 === undefined && keyId === undefined) return { apns: undefined, offReason: "APNs 비밀 없음" };
  if (keyB64 === undefined) return { apns: undefined, offReason: "APNS_AUTH_KEY_B64 없음(APNS_KEY_ID 만 있음)" };
  if (keyId === undefined) return { apns: undefined, offReason: "APNS_KEY_ID 없음(APNS_AUTH_KEY_B64 만 있음)" };
  if (!APNS_KEY_ID_RE.test(keyId)) return { apns: undefined, offReason: "APNS_KEY_ID 형식 아님(10자 영숫자)" };
  const keyPem = Buffer.from(keyB64, "base64").toString("utf8");
  if (!keyPem.includes("-----BEGIN PRIVATE KEY-----")) {
    return { apns: undefined, offReason: "APNS_AUTH_KEY_B64 디코드가 PEM 이 아님" };
  }
  return {
    apns: {
      keyPem,
      keyId,
      teamId: env.APNS_TEAM_ID?.trim() || APNS_DEFAULT_TEAM_ID,
      topic: env.APNS_TOPIC?.trim() || APNS_DEFAULT_TOPIC,
    },
    offReason: undefined,
  };
}

/** 레지스트리 원천 (Phase 29 D-09). */
export type DmaRegistrySource = "env" | "db";

/**
 * 추가 관찰자 env 표 (quick-260929-c8e). **env 모드 합성 전용**이다(Phase 29 — db 모드는 `dma_servers` 를 읽는다).
 * 비밀 env 이름은 증권사별 매핑(`OBSERVER_SECRET_ENV`)과 logger redact 에도 있다.
 */
const EXTRA_OBSERVER_ENV: ReadonlyArray<{ gateway: DmaBroker; hostEnv: string; portEnv: string }> = [
  { gateway: "KYOBO", hostEnv: "DMA_KYOBO_HOST", portEnv: "DMA_KYOBO_PORT" },
];

/** 증권사 → 관찰자 비밀 env 이름 (Phase 29 Pitfall 11). 서버 수와 무관하게 증권사당 1개다. */
const OBSERVER_SECRET_ENV: Readonly<Record<DmaBroker, string>> = {
  KB: "DMA_OBSERVER_SECRET",
  KYOBO: "DMA_OBSERVER_SECRET_KYOBO",
};

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
   *
   * Phase 29 D-09 — env 모드 합성 레지스트리의 입력이다. **db 모드에서는 쓰지 않는다**(서버 목록은 `dma_servers`).
   */
  dmaHost: string;
  /** DMA 게이트웨이 TCP 포트. 미설정 시 9100. env 모드 합성 입력이다 — **db 모드에서는 쓰지 않는다**(Phase 29 D-09). */
  dmaPort: number;
  /**
   * LoginReq 의 broker 필드 겸 env 모드 주 게이트웨이 키. 미설정 시 "KB". "KB" | "KYOBO" 밖이면 기동 거부(Phase 29).
   * `dmaHost` · `dmaPort` 와 함께 env 모드 합성 입력이다 — **db 모드에서는 쓰지 않는다**(사용자 세션의 폴백 대상으로만 남는다).
   */
  dmaBroker: DmaBroker;
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
   * 서버 레지스트리 원천 (Phase 29 D-09 — env `DMA_REGISTRY_SOURCE`). `env`(기본) | `db`. `db` 는 production 에서만,
   * production 은 `db` 만 허용한다(그 밖 조합은 기동 거부).
   */
  dmaRegistrySource: DmaRegistrySource;
  /**
   * env 모드 합성 레지스트리 (Phase 29 D-09 · quick-260929-c8e 표를 대체). **0번은 주 게이트웨이**다 — 키 · 증권사 =
   * `DMA_BROKER`(기본 KB) · host/port = `DMA_HOST`/`DMA_PORT` · 주문 서버 + 시세 주 서버. 1번부터는 `EXTRA_OBSERVER_ENV`
   * 표에서 호스트가 설정된 행만 온다(그 증권사의 주문 서버 · 시세 주 아님). 추가 env 가 없으면 길이 1 — 오늘과 같다.
   * 키는 서로 겹치지 않는다(겹치면 기동 거부). **db 모드에서는 쓰지 않는다**(같은 env 로 계산만 해 둔다).
   */
  envServers: readonly DmaServerRow[];
  /**
   * 증권사 → 저널 관찰자(role 0) 비밀 (Phase 29 Pitfall 11). KB = `DMA_OBSERVER_SECRET` · KYOBO =
   * `DMA_OBSERVER_SECRET_KYOBO`. 없거나 빈 값이면 undefined — 그 증권사 서버의 관찰자는 disabled 다. 값을 로그로 내보내지 않는다.
   */
  observerSecretOf: (broker: DmaBroker) => string | undefined;
  /**
   * 증권사 → quote 연결(role 1) 비밀 (Phase 29 · 26 D-17). KB = `DMA_QUOTE_OBSERVER_SECRET` ‖ `DMA_OBSERVER_SECRET` ·
   * KYOBO = `DMA_OBSERVER_SECRET_KYOBO`. 값을 로그로 내보내지 않는다.
   */
  quoteSecretOf: (broker: DmaBroker) => string | undefined;
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
  /**
   * 접근 맵(`AppAccess`) 재적재 주기(ms · Phase 29 D-04). 미설정 시 60000. production 은 env 와 무관하게 60000 이다.
   * 빈 문자열 · 0 이하 · 비숫자는 기동을 거부한다.
   */
  appAccessRefreshMs: number;
  /**
   * 체결 앱 푸시 켜기 (Phase 40 — env `PUSH_NOTIFY` `on` | `off`). 미설정 시 production 은 true · 그 밖은 false. 다른 값은 기동
   * 거부. false 면 `PushNotifier` 는 RPC · 송신 0 이다(비상 끄기). 송신기 비밀은 40-09 가 따로 읽는다.
   */
  pushNotify: boolean;
  /**
   * APNs 송신 설정 (Phase 40 — `APNS_AUTH_KEY_B64` · `APNS_KEY_ID` · `APNS_TEAM_ID` · `APNS_TOPIC`). 없으면 undefined —
   * iOS 송신기만 빠진다(비치명). 값을 로그로 내보내지 않는다(logger redact `*.keyPem` 은 실수 방어).
   */
  apns: ApnsConfig | undefined;
  /** `apns` 가 undefined 인 이유(부팅 로그 1줄용 · env 이름만 · 값 없음). 켜졌으면 undefined. */
  apnsOffReason: string | undefined;
  /**
   * FCM HTTP v1 프로젝트 (Phase 40 — env `FCM_PROJECT_ID`). 있으면 그 값 · 없으면 production 은 `gh-radar` · 그 밖은 undefined
   * (로컬엔 GCE 메타데이터 서버가 없다 — Android 송신기를 만들지 않는다).
   */
  fcmProjectId: string | undefined;
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

  // Phase 29 D-04 — 접근 맵 재적재 주기. production 은 env 를 보지 않는다(값 검증도 하지 않는다 — 무시하는 키다).
  let appAccessRefreshMs = APP_ACCESS_REFRESH_MS;
  const appAccessRaw = optional("APP_ACCESS_REFRESH_MS");
  if (nodeEnv !== "production" && appAccessRaw !== undefined) {
    appAccessRefreshMs = appAccessRaw.trim() === "" ? Number.NaN : Number(appAccessRaw);
    if (!Number.isFinite(appAccessRefreshMs) || appAccessRefreshMs <= 0) {
      throw new Error(`APP_ACCESS_REFRESH_MS must be a finite number > 0 (ms) — got "${appAccessRaw}"`);
    }
  }

  // Phase 40 — 체결 앱 푸시 스위치. 없으면 production 만 켜짐 · on/off 밖의 값은 기동 거부.
  const pushNotifyRaw = optional("PUSH_NOTIFY");
  if (pushNotifyRaw !== undefined && pushNotifyRaw !== "on" && pushNotifyRaw !== "off") {
    throw new Error(`PUSH_NOTIFY must be "on" or "off" — got "${pushNotifyRaw}" (Phase 40)`);
  }
  const pushNotify = pushNotifyRaw === undefined ? nodeEnv === "production" : pushNotifyRaw === "on";
  // Phase 40 (40-09) — APNs 송신기 비밀. 비치명(없으면 iOS 송신기만 빠진다).
  const { apns, offReason: apnsOffReason } = apnsConfigOf(process.env);
  // Phase 40 (40-09) — FCM 프로젝트. 운영 VM 만 기본값(메타데이터 토큰) · 로컬은 env 로만.
  const fcmProjectId = optional("FCM_PROJECT_ID")?.trim() || (nodeEnv === "production" ? FCM_DEFAULT_PROJECT_ID : undefined);

  // Phase 29 D-09 — 레지스트리 원천 게이트. 비밀 필수 검사(위) 뒤에 본다 — production 비밀 부재 사유 문구를 바꾸지 않는다.
  const registryRaw = optional("DMA_REGISTRY_SOURCE");
  const dmaRegistrySource: DmaRegistrySource =
    registryRaw === undefined || registryRaw === "" ? "env" : (registryRaw as DmaRegistrySource);
  if (dmaRegistrySource !== "env" && dmaRegistrySource !== "db") {
    throw new Error(`DMA_REGISTRY_SOURCE must be "env" or "db" — got "${registryRaw}" (Phase 29 D-09)`);
  }
  if (dmaRegistrySource === "db" && nodeEnv !== "production") {
    // 로컬 · 테스트 · e2e relay 가 운영 Supabase 레지스트리를 읽어 실서버에 붙는 길을 막는다.
    throw new Error(
      `DMA_REGISTRY_SOURCE=db is allowed only with NODE_ENV=production — got NODE_ENV=${nodeEnv} (Phase 29 D-09 · 로컬 relay 는 운영 레지스트리를 읽지 않는다)`,
    );
  }
  if (nodeEnv === "production" && dmaRegistrySource !== "db") {
    // 운영이 env 표(로컬 기본값 127.0.0.1)로 조용히 떨어지지 않게 한다.
    throw new Error("DMA_REGISTRY_SOURCE=db must be set in production (Phase 29 D-09 · 서버 목록은 dma_servers 레지스트리)");
  }

  // 기본값은 로컬 mock 이다. 실서버 주소는 배포 env 가 반드시 명시해야 한다 (D-27).
  const dmaHost = optional("DMA_HOST") ?? "127.0.0.1";
  const dmaPort = Number(optional("DMA_PORT") ?? "9100");
  const dmaBroker = optional("DMA_BROKER") ?? "KB";
  if (!isDmaBroker(dmaBroker)) {
    throw new Error(`DMA_BROKER must be "KB" or "KYOBO" — got "${dmaBroker}" (Phase 29 — 비밀 · 키 접두가 증권사별이다)`);
  }

  // env 모드 합성 — 0번 = 주 게이트웨이(주문 서버 + 시세 주 서버). 키는 종전 그대로(DMA_BROKER).
  const envServers: DmaServerRow[] = [
    {
      key: dmaBroker,
      broker: dmaBroker,
      host: dmaHost,
      port: dmaPort,
      enabled: true,
      isOrderServer: true,
      isQuotePrimary: true,
      sortOrder: 0,
    },
  ];
  const seen = new Set<string>([dmaBroker]);
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
    envServers.push({
      key: row.gateway,
      broker: row.gateway,
      host,
      // 빈 문자열도 기본값으로 (`||`).
      port: Number(optional(row.portEnv) || String(DEFAULT_OBSERVER_PORT)),
      enabled: true,
      // 그 증권사 유일 서버 = 그 증권사의 주문 서버(healthz `brokers.<증권사>` 원천). 사용자 세션은 아직 KB 만(29-16).
      isOrderServer: true,
      isQuotePrimary: false,
      sortOrder: envServers.length,
    });
  }
  assertRegistryInvariants(envServers);

  // 증권사별 비밀 — 추가 게이트웨이 비밀 부재는 production 에서도 기동을 막지 않는다(그 관찰자만 disabled).
  const observerSecretOf = (broker: DmaBroker): string | undefined =>
    optional(OBSERVER_SECRET_ENV[broker]) || undefined;
  const quoteSecretOf = (broker: DmaBroker): string | undefined =>
    broker === "KB" ? dmaQuoteObserverSecret : observerSecretOf(broker);

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
    dmaRegistrySource,
    envServers,
    observerSecretOf,
    quoteSecretOf,
    dmaQuoteObserverSecret,
    quoteLingerMs,
    appAccessRefreshMs,
    pushNotify,
    apns,
    apnsOffReason,
    fcmProjectId,
  };
}
