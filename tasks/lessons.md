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

## 2026-06-09

### 회귀 fix 는 입력 규모가 외부 상황(약세장/강세장)에 따라 변하면 양쪽 극단에서 검증

**Context:** 스캐너 빈 화면 회귀를 06-08 에 `sort_tp=3→1` 로 고치고 약세장(ka10027 상승종목 ~350)에서 top_movers 100 정상 확인 → "정상화" 판정. 06-09 강세장(상승종목 ~3000)에서 또 빈 화면. 진짜 원인은 `index.ts` 의 `stocks.in("code", codes)` 대량 조회가 codes 폭증 시 PostgREST URL 한계(414)로 통째 실패 → `eligibleCodes` 빈 Set → `rebuildTopMovers` 화이트리스트 필터에서 전부 탈락 → top_movers 0.

**Mistake:**
1. `.in()` 대량 조회 실패를 첫날 의심했으나 sort_tp 문제(양수 0개)에 가려 데이터로 안 보이자 "틀린 가설"로 폐기. 실제로는 **두 버그가 겹쳐** 있었고, 약세장(codes 350)에선 `.in()` 이 우연히 통과해 안 드러난 것뿐.
2. 한 시장 상황(약세장)에서만 검증하고 완료 판정.

**Rule:**
- 데이터 파이프라인 fix 는 입력 규모가 외부 상황(시장 약세/강세)에 따라 10배 변동하면 **양쪽 극단을 가정해 검증**. 한 시나리오 통과 = 다른 시나리오 OK 아님.
- 한 근본 원인을 확정해도 초기 가설을 폐기할 땐 "이 시나리오에서만 안 보이는 것 아닌가" 자문. 데이터로 **반증** 못 하면 "틀림"이 아니라 "보류".
- `supabase-js` `.in(col, arr)` 대량 조회는 청크 분할 필수 (PostgREST URL ~414 한계). 입력이 수천 개 가능한 경로는 500개씩 청크 + `error` 처리.

**Preventive check (DB 조회가 가변 규모 입력을 받을 때):**
- `.in()`/`IN (...)` 입력 배열이 수백+ 가능하면 청크 분할 (기본 500)
- 조회 결과를 필터/조인에 쓰는데 `error` 를 무시하면 실패 시 빈 결과가 silent 하게 잘못된 출력 생성 → `error` 반드시 throw 또는 로깅 (`const { data } = await ...` 처럼 error 누락 금지)
