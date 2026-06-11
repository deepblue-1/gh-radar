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

### Turbopack dev 는 `.js`→`.ts` re-export resolve 못함 — 첫 런타임 값 re-export 도입 시 회귀

**Context:** Phase 10-08 배포 검증 중 `/themes`·`/stocks/[code]` 가 DEV 에서만 Build Error 오버레이. 원인은 10-02 가 `packages/shared/src/index.ts` 에 추가한 첫 **런타임 값** re-export (`export { THEME_STOCK_SOURCES } from "./theme.js"`). webapp tsconfig `paths` 가 `@gh-radar/shared` 를 src(`.ts`)로 라우팅하는데, Turbopack dev 는 webpack 의 `extensionAlias` 같은 `.js`→`.ts` 자동 매핑이 없어 명시 `.js` re-export 를 못 푼다. `type` re-export 는 컴파일 타임 소거라 안 터졌고, production `pnpm -F webapp build`(webpack)는 항상 green — **DEV 전용** 회귀라 build 게이트로 못 잡음.

**Mistake:** `.js` 확장자 명시가 NodeNext 관용이라 무비판 적용. 같은 배럴을 Turbopack(bundler resolution)이 소비한다는 점 + "type 만 re-export 하다가 처음으로 값 re-export 추가" 가 트리거라는 점을 사전에 못 봄.

**Rule:**
- webapp(Next/Turbopack)이 소비하는 공유 배럴(`packages/shared/src/index.ts`)의 re-export 는 **확장자 없이** 쓴다 (`from "./theme"`). `moduleResolution:bundler` 관용이고, NodeNext 소비자(server/worker)는 빌드된 `dist` 를 쓰므로 무영향.
- 공유 패키지에 **첫 런타임 값**(상수/함수) re-export 를 추가할 때는 `pnpm -F webapp dev` 로 실제 페이지를 한 번 열어 확인. production build green ≠ dev green.

**Preventive check (공유 배럴 수정 시):**
- `git diff packages/shared/src/index.ts` 에 `export {` (값) 신규 추가가 있으면 dev 스모크 필수
- 배럴 re-export 는 확장자 생략 통일 (`grep '\.js"' packages/shared/src/index.ts` 가 비어야 함)

### 인계 컨텍스트의 "PASS/FAIL 상태"는 그대로 믿지 말고 실측으로 재확인

**Context:** Phase 10-08 finalize 인계 노트가 "edit/delete/fork user-themes E2E 는 이미 PASS(6/7 green)", "stock-detail-chart.spec 도 unmocked 데이터로 실패" 라고 명시. 실측하니 (a) edit-remove/delete/fork 는 **pre-change baseline 에서도 실패**(Express `/api/themes/:id` 부재로 상세 에러 카드 — 노트와 반대), (b) `stock-detail-chart.spec` 는 **4/4 green**(노트와 반대), 실제 미해결은 `stock-detail.spec.ts:15` 단일 stale assertion 뿐.

**Mistake (잠재):** 노트의 "6/7 green" 을 믿고 edit-remove 실패를 내 optimistic 변경 탓으로 오귀인하거나, chart spec 을 deferred 로 잘못 기록할 뻔.

**Rule:**
- 인계받은 "X 는 통과/실패" 주장은 fix/finalize 전에 **해당 테스트만 직접 실행**해 1차 사실 확인. 특히 "내 변경이 깬 것 같다" 판단 전에 `git stash` 로 pre-change baseline 에서 같은 테스트를 돌려 **회귀 여부를 분리**한다.
- deferred/out-of-scope 로 문서화할 항목도 실제 실패 메시지를 한 번은 캡처(추정 금지) — 후속 작업자가 정확한 원인을 받게.

**Preventive check (finalize/회귀 의심 시):**
- 의심 테스트 단건 실행 → 실패 시 `git stash push -- <changed files>` 후 재실행 → pop. baseline 에서도 실패면 pre-existing(내 탓 아님), baseline 통과면 내 회귀.
- deferred 기록은 파일:라인 + 실제 assertion + 진짜 원인(추정/실측 구분) 명시.

## 배포 완결성 — 새 라우트는 해당 서비스 재배포까지 (Phase 10, 2026-06-09)

- 새 API 라우트(10-04 server `/api/themes`)를 추가하는 phase 의 배포 plan 이 **새 워커(theme-sync Job)만** 배포하고 **기존 server 서비스 재배포를 누락**. 결과: 코드/데이터/E2E(mock) 모두 green 이지만 배포된 server 이미지는 옛날 SHA → production `/api/themes` 404. webapp push(Vercel) 후에야 /themes 가 빈 화면.
- **교훈:** deploy plan 은 "새 라우트/스키마를 노출하는 **모든** 서비스(server·webapp·worker)"를 배포 대상에 포함. 워커만 보지 말 것.
- **검증:** phase 완료 전 **배포된 엔드포인트를 직접 curl**(prod URL)로 확인 — 코드 존재(verifier)·테스트 green 만으로 "production 동작"을 단정 금지. `gsd-verifier` 는 코드/데이터를 보지 배포 revision 을 안 본다.
- gh-radar server 재배포 = `scripts/deploy-server.sh` (env: GCP_PROJECT_ID, SUPABASE_URL, CORS_ALLOWED_ORIGINS; VPC + Secret 7종 + KIWOOM). 현재 CORS = `https://gh-radar-webapp.vercel.app,/^https:\/\/gh-radar-.*\.vercel\.app$/`. `.env.deploy` 없으면 현재 서비스 env 를 `gcloud run services describe ... --format=json` 으로 추출해 재사용(이미지 SHA만 갱신).

## 프론트↔서버 응답 계약 드리프트 — 양쪽 테스트가 각자 다른 계약을 박제 (Phase 10, 2026-06-10)

**Context:** 테마 상세 클릭 시 전역 `error.tsx`("문제가 발생했어요"). 서버 `GET /api/themes/:id` 가 bare `ThemeStockMember[]` **배열** 을 반환했는데, webapp `fetchSystemThemeDetail` 은 `ThemeWithStats & { stocks }` **객체** 를 기대(`apiFetch<T>` 로 단언). 응답이 배열이라 `theme.sources` 가 undefined → `ThemeSourceBadges` 의 `sources.filter()` 가 렌더 중 throw → 전역 경계. (상세 페이지는 메타를 prop 으로 안 받고 URL 직접 진입 가능 → 서버가 메타까지 반환해야 함.)

**Mistake (systemic):** 서버 테스트는 `expect(Array.isArray(r.body)).toBe(true)` (배열)를, webapp 컴포넌트 테스트는 `fetchSystemThemeDetail` 을 `detail({...})` **객체** 로 mock — **양쪽 다 green 인데 실제 wiring 은 깨짐**. 각 테스트가 자기편 계약만 박제하고, 둘을 묶는 검증이 없어 드리프트가 prod 까지 샘. webapp 의 mock 은 "서버가 실제로 그렇게 응답한다" 는 증거가 아니다.

**Rule:**
- 프론트 fetch 래퍼가 응답 타입(`apiFetch<T>`)을 선언하면, 서버 라우트의 `res.json(...)` 인자를 **같은 shared 타입 `T` 로 타이핑** 하거나(이상적으로 packages/shared 의 응답 타입 공유), 최소한 양측이 합의하는 **계약 테스트 1개** 를 둔다. 한 쪽 mock/assertion 을 계약 증명으로 믿지 말 것.
- `res.json(array)` vs 래퍼의 객체 기대처럼 **shape(배열↔객체) 불일치** 를 특히 경계 — TS 는 패키지 경계를 넘는 런타임 응답을 검사하지 못한다.

**Preventive check:**
- `error.tsx`("문제가 발생했어요")는 fetch 실패가 아니라 **렌더 중 throw** 신호 (fetch 실패는 보통 컴포넌트 자체 try/catch → 에러 카드). 데이터 **모양 불일치**(undefined 필드의 `.map`/`.filter`)를 먼저 의심.
- 새/변경 API 는 배포 후 prod `curl` 로 **응답 형태**(배열 vs 객체 + 필수 필드 존재)를 직접 확인. 프론트가 `apiFetch<T>` 로 단언하는 모든 엔드포인트는 서버 `res.json` 인자 타입이 `T` 와 일치하는지 점검.

## `.in()` 입력 청크 ≠ 결과-행 보호 — db-max-rows(1000) 페이지네이션 별도 필요 (Phase 10, 2026-06-10)

**Context:** `/api/themes` 목록의 테마 66%(235/356)가 stockCount=0 으로 표시. 데이터는 정상(워커가 7544 active 링크 적재, "2차전지" 실제 144종목, 상세 라우트는 정상). 원인은 목록 라우트 `fetchActiveThemeStocksChunked` 가 theme_id 를 200 씩 `.in()` 청크하지만, **한 청크가 매칭하는 theme_stocks 결과 행이 PostgREST db-max-rows(기본 1000)에서 통째로 잘려** 1000행 너머 테마가 사라진 것. **스모킹건: 목록 stockCount 합계가 정확히 2000(=2 청크 × 1000).** 상세(`/:id`)는 단일 테마(≤144행)라 한계 미도달 → "0종목인데 누르면 종목이 나오는" 비대칭.

**Mistake:** 커밋 37afcde 가 `.in()` 을 청크한 건 **URL 길이(414)** 대비였는데, 그게 **결과-행 한계(db-max-rows)** 까지 막아준다고 착각. 둘은 다른 축이다 — 입력 code/id 를 N 개로 나눠도, 한 청크가 반환하는 **행 수**가 1000 을 넘으면 응답이 잘린다. 게다가 테스트 mock(`supabase-mock`)이 db-max-rows 를 미시뮬레이션(모든 행 반환)이라 회귀가 또 prod 까지 샘([[프론트↔서버 계약 드리프트]] 와 동일한 "mock 이 실서버 제약을 안 닮음" 메타-실수).

**Rule:**
- `supabase.from(t).in(...)` / `.eq(...)` 가 **여러 부모에 걸쳐 수백~수천 행을 반환**할 수 있으면, 입력 청크와 **별개로** 결과 행을 `.range(from, from+PAGE-1)` 로 끝까지 페이지네이션한다(안정 정렬 PK + advance-by-actual-rows + break-on-empty → db-max-rows 값과 무관하게 정확). 단건/소수 부모(`.eq(id)`) 조회는 행 수가 작아 불필요.
- 한계 가늠법: **응답 행 합계가 딱 떨어지는 1000 배수**면 db-max-rows 절단을 의심.

**Preventive check:**
- DB mock 은 실서버 제약(여기선 db-max-rows 1000)을 **시뮬레이션**해야 회귀를 잡는다. `supabase-mock` 에 `.range()` + 1000행 캡 추가 완료 → active>1000 회귀 테스트가 페이지네이션 누락 시 fail.
- 가변 규모 `.in()`/`.eq()` 조회를 추가/수정할 때: (1) 입력 URL 청크 했는가(414), (2) 결과 행 페이지네이션 했는가(db-max-rows) — **둘 다** 점검.

## 정량 주장은 단언 전에 실측 — subagent 의 "대부분/majority" 를 수치로 인용 금지 (Co-movement 디스커션, 2026-06-10)

**Context:** 상한가 동조 종목 phase 아이디어 디스커션에서, 테마없는 종목 비율을 Explore subagent 의 정성 표현("majority of ~2,800 stocks are theme-less")을 그대로 받아 사용자에게 "**테마없는 종목 ~40%**, 섹터도 NULL이라 fallback 없음" 으로 단언. 사용자가 "섹터가 없는 대신 테마가 있어. 체크해봐" 로 교정. read-only 실측 결과 **활성 2,778 중 2,476(89%) 테마 보유 — 미분류 11%**, 급등 앵커도 89%·고이벤트 92% 테마 보유. "40%"는 ~4배 과대였고, 그에 기반한 "테마없는 종목 보완책" 우려 자체가 거의 무의미했음.

**Mistake:** 같은 세션에서 급등 **이벤트 희소성은 실측**(probe script)했으면서 **테마 커버리지는 subagent 추정으로** 빠진 비대칭. subagent(Explore)는 "코드/문서를 훑은 인상"을 줄 뿐 집계(COUNT/DISTINCT)를 하지 않는다 — "majority/most/대부분"은 측정값이 아니라 어림짐작인데 이를 `%` 수치로 승격해 인용.

**Rule:**
- 설계 결정을 좌우하는 **정량 주장(커버리지 %, 분포, 빈도, 비율)**은 DB/실데이터 접근이 가능하면 **사용자에게 말하기 전에 직접 measure**. 이 프로젝트는 `workers/master-sync/.env`(SUPABASE_URL+SERVICE_ROLE_KEY)로 read-only 집계 가능 — `NODE_PATH=workers/master-sync/node_modules node probe.cjs` 패턴.
- subagent 의 "대부분/majority/most/~ 추정" 류 표현을 **수치(%) 로 변환해 단언 금지.** 출처를 (a) 직접 쿼리 (b) subagent 인상 (c) 내 추측 으로 구분하고, (b)(c)이면서 접근 가능하면 (a)로 승격.
- 한 축(이벤트)만 재고 다른 축(테마 커버리지)을 추정으로 남기는 **비대칭 검증** 경계 — 같은 결정에 쓰이는 정량 입력은 같은 엄밀도로.

**Preventive check (사용자 대면 정량 주장 직전):**
- 문장에 `N%` / "대부분" / "다수" / "거의 없음" 이 있으면: 이 숫자 직접 쟀나? 못 쟀고 DB 접근 가능하면 probe 먼저.
- gh-radar read-only probe: `dotenv` → `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` → `.select('*',{count:'exact',head:true})`(집계) / `.range()` 페이지네이션(분포). 집계 숫자만 출력, 시크릿 미출력.

## 커밋 승인은 "보여준 범위 = 스테이징 범위" — scoped `git status` 후 `git add -A` 금지 (Phase 11 디스커션, 2026-06-10)

**Context:** discuss-phase 산출물 커밋 시 변경 목록을 `git status --short -- .planning tasks` 로 **pathspec 좁혀** 확인 → 그 5개만 대상으로 한 commit 메시지를 사용자에게 제시 → 승인("응") → 그런데 실제론 `git add -A` 로 스테이징해서, 사용자 working tree에 있던 **무관한 WIP**(theme-admin overrides: server/webapp/workers 코드 + 새 migration + hook 등 11파일)까지 `docs(11)` 메시지로 함께 커밋. push 전에 발견·정정(soft reset → 명시 경로만 재스테이징 → 재커밋 → push).

**Mistake:** (1) 커밋 미리보기 `git status` 를 `-- .planning tasks` 로 좁혀 tree의 다른 변경을 **사용자에게 안 보여줌**. (2) 보여준 범위는 좁은데 스테이징은 `git add -A`(전체) — **보여준 범위 ≠ 스테이징 범위**. 결과적으로 승인받은 것과 다른 커밋 + 검증 안 된 남의 WIP를 잘못된 메시지로 묶음.

**Rule:**
- 커밋 승인을 받을 땐 **pathspec 없는 전체** `git status --short` 로 working tree 전부를 보여준다. 일부만 커밋할 거면 "나머지 X는 제외/보존" 을 명시.
- 스테이징은 **보여준 그 경로만 명시적으로** `git add <paths>`. scoped 미리보기 뒤 `git add -A`/`git add .` 금지 — 보여준 범위와 스테이징 범위가 어긋난다.
- 사용자 tree에 **무관한 WIP가 있을 수 있다고 항상 가정.** 내가 안 만들었거나 빌드/테스트 검증 못 한 변경을 내 docs/feature 커밋에 묶지 않는다. (`한번에 커밋` 규칙이 있어도 — 그 규칙은 "tree 전체를 보여주고 정확히 기술" 을 전제로 한다.)

**Preventive check (커밋 직전):**
- `git status --short` (pathspec 없이) 출력 == 내가 제시한 파일 목록인가?
- `git diff --cached --name-only` 로 스테이징된 게 제시 목록과 동일한지 commit 전 확인.
- 무관 WIP 발견 시: push 전이면 `reset --mixed HEAD~1` → 명시 경로만 재스테이징.

## 2026-06-11 (Phase 11)
- **AskUserQuestion 가시성**: VS Code에서 사용자는 어시스턴트 본문 텍스트를 못 보고 질문 다이얼로그만 본다. 결정에 필요한 설명·수식·트레이드오프는 question 텍스트와 옵션 preview에 직접 임베드할 것. (사용자 2회 지적)
- **점수 설계는 "무엇을 재는가"부터**: co-surge 점수를 횟수/CAP 정규화로 만들었다가 사용자 지적("얼마나 같이 갔는지·최근성이 핵심")으로 v2 재설계. 카운트 기반 정규화는 강도·시점 정보를 버린다 — 도메인 의도(같이 상한가)를 직접 묻고 수식을 세울 것.
- **표시 메트릭과 랭킹 내부값 분리**: WR-01 — 랭킹용 가중값을 "동반율" 라벨로 노출해 4배 과소 표기. 사용자 대면 수치는 raw, 내부 점수는 strength로 분리 유지.
