/**
 * Phase 15 Plan 01 — RELAY-01. relay 구조화 로거 (pino + GCP Cloud Logging 포맷).
 *
 * server/src/logger.ts 를 이식하되 serviceContext.service 를 "gh-radar-relay" 로 바꾸고,
 * DMA 자격증명 계열 키를 redact 경로에 추가한다.
 *
 * 결정 근거:
 *   T-15-04 / ASVS V7  DMA 로그인 비밀번호·복호화 키·내부 공유 비밀이 로그로 새면
 *                      증권 계좌가 그대로 노출된다. 객체 통째 덤프(`logger.info({cfg})`,
 *                      `logger.error({row})`)를 해도 값이 [REDACTED] 로 나가게 한다.
 *   D-11               브라우저 액세스 토큰(`{t:"auth", token}`)도 로그 금지 대상이다.
 *   D-22               server → relay 내부 릴레이 헤더 `x-relay-secret` 도 마찬가지.
 *
 * 하지 않는 것:
 *   - redact 는 "실수 방어"지 "설계"가 아니다. 애초에 비밀을 로그 인자로 넘기지 말 것.
 *   - relay 는 Cloud Run 이 아니라 GCE VM 의 Docker 위에서 돈다(D-07). stdout 은
 *     `json-file` 드라이버로 나가므로 로그 포맷은 GCP 구조화 JSON 을 그대로 유지한다.
 */
import pino from "pino";
import { createGcpLoggingPinoConfig } from "@google-cloud/pino-logging-gcp-config";

export const logger = pino(
  createGcpLoggingPinoConfig(
    {
      serviceContext: {
        service: "gh-radar-relay",
        version: process.env.APP_VERSION ?? "dev",
      },
    },
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-api-key']",
          "*.supabase_service_role_key",
          "*.access_token",
          "*.refresh_token",
          // Phase 15 — DMA 자격증명 계열 (T-15-04). DB row(snake_case) / 도메인
          // 객체(camelCase) / env 이름(UPPER) 세 표기를 모두 막는다.
          "*.password",
          "*.dma_password",
          "*.dmaPassword",
          "*.dma_password_enc",
          "*.DMA_CRED_KEY",
          "*.dmaCredKey",
          "*.RELAY_ORDER_SECRET",
          "*.relayOrderSecret",
          "*.token",
          "req.headers['x-relay-secret']",
        ],
        censor: "[REDACTED]",
      },
    },
  ),
);
