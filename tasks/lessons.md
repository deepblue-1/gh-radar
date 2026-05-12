# Lessons

## 2026-04-16

### Dev 포트는 `dev.sh` 가 진실 — Next 기본값 3000 가정 금지

**Context:** Phase 06.2 Plan 08 (E2E setup) 에서 Playwright baseURL/webServer, SETUP.md, `.env.local.example`, Supabase OAuth redirect allow-list 를 모두 `localhost:3000` 기본값으로 작성. 실제 `./dev.sh` 는 `PORT=3100 pnpm --filter @gh-radar/webapp run dev` 로 기동. 사용자가 Google OAuth 테스트 중 Supabase 가 redirectTo 매칭 실패 → site_url (Vercel) 로 fallback → 500 으로 debug 시간 낭비.

**Mistake:** "새 프로젝트에 설정 파일 작성" = Next 기본값 3000 자동 세팅. 루트 dev 스크립트를 읽지 않음.

**Rule:** 포트/호스트/URL 이 필요한 설정 파일을 쓰거나 수정할 때, **맨 먼저 `./dev.sh` (또는 루트의 dev/start 엔트리 스크립트) 를 Read** 해서 실제 포트를 확인한다. 그 값만 사용한다. 기본값 가정 금지.

**Preventive check (새 프로젝트 진입 직후):**
- `cat dev.sh` / `cat Procfile` / `package.json > scripts.dev` 확인
- `PORT=` / `--port` / `-p` 플래그 확인
- 그 포트를 기준으로 E2E config, SETUP docs, env templates, OAuth allow-list 작성

**Rollback checklist after similar mistake:**
- `grep -rn "localhost:3000"` (또는 실수한 포트) 로 잔재 전수 조사
- 단위 테스트 timeout `3000` 은 별개 — `localhost:3000` 만 대상
- Supabase/Auth redirect allow-list 도 포함 (Dashboard 또는 Management API)

## 2026-05-12

### KRX OpenAPI 는 서비스별 별도 승인 — 같은 AUTH_KEY 가 모든 endpoint 작동 X

**Context:** Phase 9 Plan 09-06 Task 1 실측 시, master-sync 가 정상 사용 중인 `KRX_AUTH_KEY` 로 candle-sync 의 `stk_bydd_trd` 호출 → HTTP 401 `{"respMsg":"Unauthorized API Call"}`. 동일 키로 `stk_isu_base_info` 는 200 정상.

**Mistake:** "master-sync 가 작동하니 candle-sync 도 즉시 호출 가능" 가정. KRX OpenAPI 의 per-service 승인 체계를 사전 검증하지 않음.

**Rule:** KRX OpenAPI 신규 endpoint 를 사용하는 phase 를 plan 할 때, **plan 단계에서 즉시 401 prerequisite 확인 task** 를 첫 wave 에 넣는다. 실측이 1일 승인 대기를 발생시킬 수 있으므로 미리 발견해야 일정 영향 최소화.

**Preventive check (KRX 사용 phase 진입 직후):**
- 새 endpoint 에 대해 `curl -H "AUTH_KEY: $KRX_AUTH_KEY" ${URL} -w "%{http_code}"` 사전 호출
- 401 시 [openapi.krx.co.kr](https://openapi.krx.co.kr) 에서 endpoint 별 사용 신청 (master-sync 와 동일 계정)
- 승인 소요 ~1일 — 일정에 buffer 반영

**관련 plan 산출물 (이미 적용):**
- Plan 09-03 의 `client.ts` 401 가드 + 명시 메시지 ("AUTH_KEY 또는 bydd_trd 서비스 승인 점검") — production 발견 시 진단 단축
- Plan 09-06 의 T-09-01.1 threat 가 이 시나리오 자체를 명시 — plan 작성자가 사전에 인지했음에도 prerequisite check 가 wave 0 가 아닌 wave 3 에 위치 → 발견 지연
