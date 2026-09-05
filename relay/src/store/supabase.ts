/**
 * Phase 15 Plan 04 — RELAY-01. relay 서비스롤 Supabase 클라이언트.
 *
 * `server/src/services/supabase.ts` 이식. **클라이언트 1개**로 두 가지 일을 한다 —
 * ① 브라우저 액세스 토큰 검증(`auth.getUser`) ② `dma_credentials`/`dma_orders` 접근.
 *
 * Phase 14 (D-02) 에서 이미 검증된 패턴이다: 서비스롤 키로 만든 클라도 `auth.getUser(jwt)`
 * 는 전달된 access_token 을 Supabase Auth 서버로 **검증 위임**하므로 정상 동작한다
 * (서비스롤 권한과 무관). 그래서 relay 도 검증용 클라를 따로 만들지 않는다.
 *
 * 결정 근거:
 *   D-10  토큰 검증은 `auth.getUser` **네트워크 검증 한 가지**다. jose/JWKS 로컬 검증을
 *         도입하지 않는 이유는 로그아웃·revoke 가 즉시 반영돼야 하기 때문이다.
 *   D-18  `dma_credentials` 는 **RLS 활성 + 정책 0개**다. 어떤 클라이언트 role 도 닿을 수
 *         없고 서비스롤만 읽는다 — 그 서비스롤이 이 모듈이다.
 *   D-19  서비스롤 키는 VM 기동 시 Secret Manager 에서 env 로 들어온다. 이 파일은 값을
 *         읽기만 하고 로그에 남기지 않는다(logger redact 는 2차 방어다).
 *
 * 하지 않는 것:
 *   - 모듈 로드 시점에 클라이언트를 만들지 않는다. server 는 모듈 최상단에서 env 를 읽지만,
 *     relay 는 `loadConfig()` 가 env 를 한 번에 굳히므로 **주입받은 값으로 만든다**
 *     (테스트가 env 를 심지 않아도 되고, 기동 실패 지점이 config 한 곳으로 모인다).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서비스롤 클라이언트를 만든다.
 *
 * `persistSession:false` / `autoRefreshToken:false` 는 서버 런타임의 필수 설정이다 —
 * 켜 두면 supabase-js 가 세션을 파일/메모리에 붙들고 갱신 타이머를 돌린다.
 */
export function createRelaySupabase(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
