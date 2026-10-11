---
phase: 10-theme-classification
artifact: code-review
depth: standard
status: issues_found
files_reviewed: 74
diff_base: 5acd81c0570772681a867559bbb0625e4bca222f^
scope_source: SUMMARY.md (8 plans) — 4 parallel reviewers by subsystem
findings:
  critical: 2
  warning: 14
  info: 18
  total: 34
subsystems:
  worker: { files: 37, critical: 1, warning: 6, info: 5 }
  webapp: { files: 22, critical: 0, warning: 3, info: 4 }
  server: { files: 8, critical: 1, warning: 2, info: 4 }
  db_shared_scripts: { files: 7, critical: 0, warning: 3, info: 5 }
---

# Phase 10 Code Review — theme-classification

74 source/test/fixture files reviewed at standard depth across 4 subsystems (theme-sync worker, server themes API, webapp themes UI, db migration + shared types + deploy scripts). `pnpm-lock.yaml` excluded as a lock file.

## Headline

Two Critical findings, both **the same bug class on different code paths**:

- **[CR-W-01]** — the worker retries block signals (403/429) with exponential backoff, directly violating the 한국 크롤링 5원칙 #4 ("차단 신호는 명시 차단 — 자동 지수 backoff 금지"). A blocked source gets hammered through the paid Bright Data proxy up to 3× a full scrape before the 24h backoff is recorded.
- **[CR-S-01]** — the theme **detail** route fetches `theme_stocks` with no `.range()` pagination, so a theme with >1000 active members silently truncates at Supabase's 1000-row cap. This is the exact regression the **list** route was already hardened against (the documented "stockCount 0" bug), just on the detail path no test exercises above 1000 rows.

Both are real, both have clear fixes, and both slip past existing tests.

---

## Worker (theme-sync) — 1 Critical, 6 Warning, 5 Info

### Critical

- **[CR-W-01] withRetry 가 차단 신호(403/429)도 3회 지수 재시도 — 5원칙 #4 위반** — `workers/theme-sync/src/index.ts:141` + `src/retry.ts:3-21` — cycle 은 소스 fetch 전체를 `withRetry(...)` (기본 `attempts=3`) 로 감싸고, `withRetry` 는 **모든** 예외를 무차별 지수 재시도한다. `src.run` 이 던지는 `NaverRateLimitError`/`ProxyBlockedError`/`ProxyAuthError`/`ProxyBudgetExhaustedError`/`ProxyBadRequestError` 는 "직접+프록시 모두 차단" 신호인데, `markBackoff` **전에** 같은 fetch(네이버는 목록 N페이지 + 상세 수백 호출)를 최대 3회 반복 실행 → 차단당한 소스를 프록시로 수백 회 더 두드린다. `fetchViaProxy` 내부 1회 재시도와 곱연산(최대 3×2). 테스트 `pipeline.test.ts:380` 은 retry 횟수를 assert 하지 않아 회귀를 못 잡음. **수정:** `withRetry` 에 `shouldRetry` 주입 — `isBlockSignal(err)`(index.ts:53 존재)이면 즉시 rethrow, transient(500/네트워크)만 재시도. `withRetry(fn, label, { attempts: 3, shouldRetry: (e) => !isBlockSignal(e) })`.

### Warning

- **[WR-W-01] 직접 fetch undefined-status 도 즉시 프록시 폴백 — withRetry 와 이중 재시도 충돌** — `src/scrape/fetchWithFallback.ts:61-75` — `isBlockedStatus(undefined)===true` 라 네트워크 타임아웃/ECONNRESET 도 프록시 폴백. CR-W-01 과 결합 시 일시 네트워크 흔들림이 매 retry 마다 비싼 프록시 호출. transient 와 진짜 차단(403/429)을 구분해 후자만 backoff 신호로 승격 권장.
- **[WR-W-02] mergeThemes 표시명 선택이 입력 순서 의존 → 동일 콘텐츠 해시 변동, write-skip 약화** — `src/merge/mergeThemes.ts:50-55` — `computeContentHash`(contentHash.ts:21 `n: t.name`)가 name 을 해시에 포함하므로 스크랩 순서가 흔들리면 불필요 write(5원칙 #2 효과 약화). **수정:** 표시명 결정적 선택(네이버 우선·동률 시 정렬 첫 이름) 또는 해시 입력에서 name 제외(normKey+sources+codes).
- **[WR-W-03] alpha `is_alive !== false` 가 null 을 "생존" 으로 통과** — `src/scrape/alphasquare/fetchAlphaThemes.ts:87` — 상폐/거래정지 종목이 `is_alive: null` 이면 잘못 편입. `country_code` 는 엄격 일치(null 제외)라 처리 비대칭. 보수적으로 `s.is_alive === true` 검토.
- **[WR-W-04] 해시 다이제스트 52bit 절단 — 변경 누락(write skip) 위험** — `src/pipeline/contentHash.ts:60-62` — 충돌 시 콘텐츠 변경을 동일로 오판 → upsert skip → DB 갱신 멈춤(편입/제외 이력 정지). 실패 모드가 "정합성 침묵 손실". **수정:** full hex 별도 컬럼/테이블 저장 또는 안정적 64bit 이상 비교.
- **[WR-W-05] loadMembershipForReview 가 `.limit(200)` 을 JS 필터 전에 적용 — 검수 누락** — `src/ai/enrich.ts:43-73` — DB 200행 종결 후 JS 에서 비활성/사유없음/비시스템 탈락 → 실검수 대상 200 미만, reason 보유 활성 매핑이 경계 밖이면 영영 미검수(정렬 없음). **수정:** reason/effective_to 조건을 PostgREST 필터로 내리거나 페이지네이션.
- **[WR-W-06] discoverThemes `existingThemeNames` 단일 쿼리 `.limit(2000)` — db-max-rows 1000 잠재 회귀** — `src/ai/discoverThemes.ts:328` — 시스템 테마 2000 초과 시 충돌 필터 누락 → 중복 재발굴. PostgREST db-max-rows 1000 이면 절반만 수신(lessons.md "themes 0종목 1000 한계" 와 동일 축). 페이지네이션 필요.

### Info

- **[IN-W-01]** `extractJsonObject` 첫`{`~마지막`}` 슬라이스가 중첩/2차 블록에서 오작동 가능; parse 실패가 발굴 0건으로 조용히 격리 — raw 응답 디버그 로깅 권장. `src/ai/parseJson.ts:15-20`
- **[IN-W-02]** `SourceBlockedError` 미사용, `ProxyBlockedError` 는 isBlockSignal 분기엔 있으나 throw 되는 곳 없음 — 죽은 분기 정리/주석. `src/proxy/errors.ts:31-64`
- **[IN-W-03]** logger redact 는 구조화 필드만 마스킹 — 시크릿을 message 문자열에 보간하면 무방비(현재 안전, 가드 유지). `src/logger.ts:14-31`
- **[IN-W-04]** `markBackoff` onConflict `service,usage_date` — 같은 날 재차단이 until 덮어씀(isBackedOff 가 max 취해 안전, 참고용). `src/scrapeState.ts:80-88`
- **[IN-W-05]** Dockerfile 수동 `cp -r dist /out/dist` — build 실패 시 stale/없는 dist 조용히 복사 가능; `RUN test -d .../dist` 가드 권장. `workers/theme-sync/Dockerfile:20-21`

---

## Server (themes API) — 1 Critical, 2 Warning, 4 Info

### Critical

- **[CR-S-01] Detail route `theme_stocks` fetch 에 row-limit 페이지네이션 없음 — 1000행 절단(list 라우트와 동일 버그 클래스, detail 에 잔존)** — `server/src/routes/themes.ts:234-240` — `GET /api/themes/:id` 가 `.eq("theme_id", id).is("effective_to", null)` 평문 쿼리, `.range()` 없음. list 라우트는 `fetchActiveThemeStocksChunked` + `ROW_PAGE` 로 db-max-rows(1000) 회피하도록 하드닝됨. 활성 멤버 >1000 테마(반도체/2차전지 union)면 PostgREST 가 1000행으로 침묵 절단 → `stockCount` 오류 + `stocks[]` 1000번째 이후 누락 + `top3AvgChangeRate` 불완전 집합 계산. detail 경로는 >1000 회귀 테스트 부재. **수정:** detail 멤버 fetch 도 동일 `.order(...).range(from, from+ROW_PAGE-1)` 루프(예: `fetchActiveThemeStocksForOne` 추출 또는 chunked 를 단일 id 수용으로 일반화).

### Warning

- **[WR-S-01] `Number(change_rate)` NaN 이 정렬과 top-3 평균을 오염** — `server/src/mappers/theme.ts:94` + `lib/computeTop3.ts:25-27` — `Number("N/A")→NaN`. 단일 NaN 이 비교자 `(a,b)=>b-a` 를 NaN 으로, `sum/length` 를 NaN 으로 → `top3AvgChangeRate` NaN → JSON `null` 직렬화 → desc 정렬 최하단으로 테마 침묵 강등. **수정:** `const n = Number(q.change_rate); if (Number.isFinite(n)) rates.push(n);` ("시세 없는 종목 제외" 의미 유지).
- **[WR-S-02] list 경로가 count/codes 만 필요한데 7컬럼(`THEME_STOCK_COLS`) 전체 materialize** — `server/src/routes/themes.ts:156-169` — source/confidence/reason/effective_* 미사용인데 페이로드·페이지 행 크기 부풀려 db-max-rows 압박. **수정(효율):** list 경로는 `select("theme_id,stock_code")` 로 좁히고 full 컬럼은 detail 에만.

### Info

- **[IN-S-01]** active 판정이 `effective_to IS NULL` 단독 — `effective_from` 미래값 행이 조기 활성화. forward-dating 가능 시 `.lte("effective_from", now())`. `routes/themes.ts:237-238,109`
- **[IN-S-02]** `as unknown as` 캐스트가 outbound row-shape 검증 우회 — 스키마 drift 가 런타임 침묵 실패. 매핑 출력에 얇은 `z.parse`. `routes/themes.ts:146,231,240`
- **[IN-S-03]** `(master?.market ?? "KOSPI")` — master 부재(상폐/미동기) 종목을 KOSPI 로 오표기. null/"UNKNOWN" 가 더 정직. `mappers/theme.ts:120`
- **[IN-S-04]** detail 이 masters→quotes 순차 round-trip — 독립적이라 `Promise.all` 로 지연 절반 가능. `routes/themes.ts:245-246`

---

## Webapp (themes UI) — 0 Critical, 3 Warning, 4 Info

데이터 계약(이전 "계약 불일치" 크래시 구역) 정상화 확인: client/server 매핑이 동일 `ThemeWithStats & { stocks }` shape 생성, PostgREST 1:1/1:N embed 방어적 언랩. XSS 없음(전부 JSX 텍스트 자식, `dangerouslySetInnerHTML` 부재).

### Warning

- **[WR-F-01] fork 효과가 비메모 `onSaved` 의존으로 재실행 → 중복 fork** — `webapp/src/components/theme/theme-edit-dialog.tsx:146-187` — effect deps `[open, mode, user, onSaved]`, 호출자(`themes-client.tsx:240`/`theme-detail-client.tsx:265`)가 `onSaved` 를 매 렌더 인라인 화살표로 전달. 부모 리렌더(폴링 setState)로 신원 변경 시 `forkSystemTheme` 재호출 → 유저 테마 row + theme_stocks 중복 복사(50-limit 조기 소진). fork 모드 미배선이라 현재 latent. **수정:** `forkStartedRef` 단일 실행 가드 또는 `onSaved` deps 제외 후 ref 참조.
- **[WR-F-02] 검색 결과 market 유실 → 낙관적 렌더에서 KOSDAQ 가 KOSPI 로 표시** — `theme-edit-dialog.tsx:86-101,402` — `handleAddStock` 가 `{code,name}` 만 저장, `chipToMember` 가 `market:'KOSPI'` 하드코딩. `refresh()` reconcile 후 교정되나 일시 오표기. 검색 결과는 정확한 market 보유 → `StockChip` 에 `market` 추가해 전달.
- **[WR-F-03] fork 미배선인데 `ThemesEmpty` 가 "복사(fork)해서 시작" 안내 + dialog fork 분기 전체 dead code** — `themes-empty.tsx:37`, `theme-edit-dialog.tsx:60-63,133-187`, `theme-api.ts:387` — `kind:'fork'` 로 다이얼로그 여는 호출자 부재(grep 확인). 카피-기능 불일치. fork 진입 배선 또는 안내 문구 제거.

### Info

- **[IN-F-01]** 상세 로드 "시스템 우선 → 404 면 유저 폴백" 이 Express 404 계약 의존 — 서버가 500/403 면 유저 테마인데 폴백 안 하고 에러 카피. `theme-detail-client.tsx:88-100`
- **[IN-F-02]** `fmtPct`/`changeColor` 3개 컴포넌트 복붙(`theme-detail-client.tsx:66-74`, `themes-client.tsx:34-42`, `theme-rank-row.tsx:32-40`) — 공유 유틸 추출.
- **[IN-F-03]** `StockThemeChips` 에러/빈결과 모두 "분류된 테마 없음" 수렴 — 실패 vs 진짜 없음 구분 불가; `console.debug`/telemetry 로 error 분기 로깅. `theme-chips.tsx:101-104,138-141`
- **[IN-F-04]** 상세 ID 정규식 `/^[0-9a-fA-F-]{8,40}$/` 가 하이픈 위치 미검증(`--------` 통과) — 위협 없음(서버 404 처리), 엄격 UUID v4 고려. `themes/[id]/page.tsx:17`

---

## DB / Shared / Scripts — 0 Critical, 3 Warning, 5 Info

프로젝트 Supabase 규약 2건 통과: RLS public-read 정책이 `themes`(L92)·`theme_stocks`(L119) 모두 `TO anon, authenticated` 명시(로그인 사용자 default-deny 회귀 없음); 신규 RPC 없음(트리거 함수 2개는 SECURITY INVOKER)이라 명시 REVOKE 규칙 비적용. `setup-theme-sync-iam.sh` clean(`set -euo pipefail`, 멱등 가드, 인용, 시크릿 미노출, 최소권한 SA).

### Warning

- **[WR-D-01] `effective_to` soft-exclusion 이 재편입/다주기 이력 표현 불가 — PK 와 충돌** — `supabase/migrations/20260609120000_theme_tables.sql:74-77` — 주석은 "제외 이력은 effective_to 로 표현"(append-only 이력 암시)이나 PK `(theme_id, stock_code)`(L76) 라 pair 당 1행. 소프트 제외 후 재편입 INSERT 는 PK 위반 → UPDATE 로 effective_to=NULL(이전 제외 timestamp 소실) 또는 영구 제외만 가능. 즉 "최신 상태 + 마지막 제외 마커" 이지 진짜 include→exclude→re-include 이력 아님. 이력 의도면 PK 에 discriminator(`effective_from`) 또는 surrogate id + partial unique `(theme_id, stock_code) WHERE effective_to IS NULL`. 상태만이면 주석 수정. 워커 upsert 경로와 결합 — 정합 확인 필요.
- **[WR-D-02] `themes.updated_at` 이 UPDATE 시 갱신 안 됨 — touch 트리거 부재** — `...theme_tables.sql:51` — INSERT 시 `DEFAULT now()` 만, `BEFORE UPDATE` 트리거 없음. shared 타입은 `updatedAt` 을 mutating 으로 문서화(`packages/shared/src/theme.ts:58-59`). 통계 업데이트·유저 CRUD(PostgREST)가 `updated_at` 안 올림 → 영구 `created_at` 동결. `BEFORE UPDATE` 트리거(`NEW.updated_at = now()`) 권장.
- **[WR-D-03] 트리거 함수가 `SET search_path` 누락(프로젝트 plpgsql 규약)** — `...theme_tables.sql:156-181,193-215` — `enforce_user_theme_stock_limit()`/`enforce_user_theme_count_limit()` 가 비정규화 `themes`/`theme_stocks` 참조하면서 `SET search_path = public` 없음(`20260417120000_api_usage.sql:27` 등 기존 규약과 불일치). INVOKER 라 위험 낮으나 일관성/방어 위해 추가.

### Info

- **[IN-D-01]** `themes.sources text[]`/`theme_stocks.source` 에 CHECK 없음 — TS 는 닫힌 union(naver|alphasquare|ai|user)으로 좁힘. `CHECK (source IN (...))` 로 계약 drift 차단(저위험, 신뢰 워커만 writer). `...theme_tables.sql:46,71`
- **[IN-D-02]** 신규 RLS 테이블에 명시 GRANT/REVOKE 없음(auto-grant+RLS 의존) — `watchlists` 선례와 일치, 의도된 정상. RLS 커버리지 sound. `...theme_tables.sql:86-87`
- **[IN-D-03]** smoke INV-3 `textPayload:"401"` substring 매치가 무관한 `401`(count/port/duration)에 false-positive 가능 — `"401 Unauthorized"` 로 좁히기. `scripts/smoke-theme-sync.sh:77`
- **[IN-D-04]** smoke INV-4 `grep -oE '[0-9]+$'` 가 `*/*` 무카운트 응답에서 불투명 실패 — 파싱 실패 시 raw `RANGE_HEADER` echo. `scripts/smoke-theme-sync.sh:96`
- **[IN-D-05]** deploy `--set-env-vars="^@^..."` delimiter 안전(콤마 포함 기본값 OK) — 향후 env 값에 `@` 들어가면 delimiter 회전 필요. `scripts/deploy-theme-sync.sh:93,146`

---

## Recommended order of action

1. **CR-W-01** (worker block-signal retry) — legal/cost exposure, 5원칙 위반. `shouldRetry` 주입.
2. **CR-S-01** (detail route 1000-row truncation) — data-correctness on large themes. 페이지네이션 추출.
3. **WR-S-01** (NaN poisons ranking) — cheap guard, prevents silent theme demotion.
4. **WR-W-04 / WR-W-02** (hash truncation + non-deterministic name) — together undermine the 5원칙 #2 write-skip integrity.
5. Remaining warnings (WR-D-01/02/03, WR-W-03/05/06, WR-F-01/02/03) as a cleanup pass.

Run `/gsd-code-review-fix 10` to auto-fix, or address CR/WR items manually.
