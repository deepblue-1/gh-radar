/**
 * Phase 15 Plan 01 — RELAY-01. relay 테스트 전역 셋업.
 *
 * `loadConfig()` 의 `get()` 은 필수 env 가 없으면 throw 한다(server/src/config.ts 선례).
 * 테스트가 config 를 건드릴 때마다 env 를 심지 않아도 되게 여기서 더미 값을 주입한다.
 *
 * D-12/D-19 근거: `DMA_CRED_KEY` 는 base64 32B AES-256-GCM 키다. 테스트 더미도
 * 실제 길이(32바이트)를 맞춰 둔다 — 길이 검증을 넣는 후속 plan 이 여기서 깨지지 않게.
 *
 * 하지 않는 것: 실제 자격증명/시크릿을 넣지 않는다. 전부 의미 없는 더미다.
 */
import { beforeEach } from "vitest";

// 32바이트 0x00 을 base64 로 — 실제 키 아님(길이만 유효).
const DUMMY_CRED_KEY = Buffer.alloc(32).toString("base64");

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.DMA_CRED_KEY = DUMMY_CRED_KEY;
  process.env.RELAY_ORDER_SECRET = "test-relay-order-secret";
  process.env.DMA_HOST = "127.0.0.1";
  process.env.DMA_PORT = "9100";
});
