import { beforeEach } from "vitest";
import http from "node:http";
import https from "node:https";

// Node 19+ 는 globalAgent 의 keepAlive 를 기본 true 로 켠다. supertest 의
// `request(app)` 은 요청마다 임시 서버를 새로 bind/close 하는데, 풀에 남은
// keep-alive 소켓이 이미 닫힌 서버를 가리키면 다음 요청이 `read ECONNRESET`
// 으로 죽는다 (워크스페이스 병렬 실행처럼 CPU 가 포화될 때 특히 잦다).
// 테스트 클라이언트는 커넥션 재사용 이득이 없으므로 끈다.
http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;

beforeEach(() => {
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.CORS_ALLOWED_ORIGINS =
    "http://localhost:3000,/^https:\\/\\/gh-radar-.*\\.vercel\\.app$/";
  process.env.NODE_ENV = "test";
  // Phase 09.1 — Kiwoom config (D-17/D-19). loadConfig() get() 가 throw 회피.
  process.env.KIWOOM_APPKEY = "test-kiwoom-appkey";
  process.env.KIWOOM_SECRETKEY = "test-kiwoom-secretkey";
});
