# Phase 15 — 범위 밖 발견 항목 (Deferred)

실행 중 발견했으나 **해당 plan 의 변경이 원인이 아닌** 선재(pre-existing) 이슈를 기록한다.
고치지 않는다 — 별도 quick 작업으로 처리할 것.

## 15-01 (2026-09-05)

### `packages/shared` 테스트 1건 선재 실패 — `THEME_STOCK_SOURCES` 에 `"ai"` 잔존

- **발견 경로:** `pnpm -r run test` (15-01 verification 중 부수 확인)
- **실패:** `packages/shared/src/__tests__/theme.test.ts:25`
  — `THEME_STOCK_SOURCES` 가 `["naver","alphasquare","ai","user"]` 를 기대하나
  실제는 `"ai"` 가 빠진 3종.
- **원인:** theme-sync 의 AI 분류 경로가 2026-07-06 (quick-260706-erk) 에 코드째 제거되면서
  상수는 갱신됐으나 테스트가 남았다. 자동 메모리 `project_claude_haiku_cost_classify` 참조.
- **15-01 무관 근거:** 15-01 의 변경 파일 목록에 `theme.ts` / `theme.test.ts` 가 없다
  (`git diff --name-only 27088f3..HEAD` 확인).
- **영향:** `pnpm -r run test` 가 exit 1. 루트 `pnpm typecheck` 는 exit 0 으로 영향 없음.
- **처리:** 기대값을 3종으로 고치거나 `"ai"` 를 되살리거나 — 어느 쪽인지 theme 도메인
  판단이 필요하므로 phase 15 범위 밖. 별도 quick 으로.

## 15-11 (2026-09-05)

### `mockDiscussionsApi` E2E 픽스처가 구계약(배열)을 반환 — 토론 섹션 E2E 6건 선재 실패

- **발견 경로:** 15-11 Task 3 탭 회귀 E2E 작성 중 `뉴스토론` 탭의 토론 섹션이
  `토론방을 불러올 수 없어요` 에러 상태로 렌더되는 것을 확인.
- **원인:** `webapp/e2e/fixtures/discussions.ts` 의 GET 스텁이 `Discussion[]` 배열을
  그대로 반환하나, 클라이언트 계약은 `fetchStockDiscussions` →
  `DiscussionListResponse = { items, hasMore }` 다. 컴포넌트가 `page.items` 를 읽어
  `undefined` 가 되면서 load 가 throw → 에러 분기.
- **15-11 무관 근거:** 15-11 이 건드리지 않은 **풀페이지 라우트**
  `/stocks/:code/discussions` 테스트(`discussions.spec.ts:102`)도 동일하게 실패한다.
  base 커밋 `d8bac90` 의 소스로 되돌려 실행해도 재현됨.
- **영향:** `playwright test discussions` 6 failed / 2 passed.
- **처리:** 픽스처를 `{ items, hasMore }` 로 갱신 + 무한스크롤 케이스의 `hasMore`
  시나리오 재설계가 필요. 토론 도메인 판단이 얽혀 있어 별도 quick 으로.
- **15-11 이 한 것:** 탭 회귀 단언은 데이터 상태와 무관하게 "섹션이 올바른 탭에
  mount 되는가" 만 보도록 `[data-testid^="stock-discussion-section"]` 접두 매칭 사용.
  픽스처 자체는 고치지 않았다.

### `stock-detail-chart.spec.ts` `getByLabel('일봉 차트')` strict mode violation (수정함)

- **원인:** 스켈레톤의 `aria-label="일봉 차트 로딩 중"` 이 기본 substring 매칭에 걸려
  로케이터가 2개 요소로 해석됨.
- **선재 근거:** base 커밋 `d8bac90` 소스로 되돌려 실행해도 동일 실패(재현 확인).
- **처리:** 범위 밖이지만 15-11 Task 3 의 acceptance(`stock-detail-chart` green)가
  이 테스트를 직접 요구하므로 `{ exact: true }` 로 로케이터 정밀화만 적용했다.
  단언 의도(차트 카드 aria-label 존재)는 그대로다.

## [오케스트레이터] 전체 테스트 병렬 실행 시 rate-limit 테스트 flake

- **증상:** `pnpm -r run test` (기본 워크스페이스 병렬도) 로 14개 워크스페이스를 동시에
  돌리면 `server/tests/middleware/rate-limit.test.ts` 의
  "/api/health 는 rate-limit 카운트 제외" 케이스가 5000ms 타임아웃으로 실패한다.
- **선재/무관 근거:** Phase 15 는 `server/` 를 아직 건드리지 않았고,
  `pnpm --filter @gh-radar/server test` 단독 실행은 29 files / 219 tests 전부 통과한다.
  `--workspace-concurrency=2` 로 낮추면 전체 실행도 exit 0.
- **원인 추정:** 타이머 기반 5초 예산 테스트가 CPU 포화 상태에서 굶는 전형적 flake.
- **처리(2026-09-06 근본 수정 완료 — 보류 해제).** wave 5 게이트에서 두 번째로
  터졌고, 이번엔 `themes.test.ts` 에서도 `read ECONNRESET` 이 나 특정 테스트가 아니라
  **server 스위트 전반의 선재 flake** 임이 드러나 근본 원인을 고쳤다.
  - 진짜 원인: Node 19+ 가 `http.globalAgent.keepAlive` 를 기본 true 로 켠다.
    supertest 의 `request(app)` 은 요청마다 임시 서버를 새로 bind/close 하는데,
    풀에 남은 keep-alive 소켓이 이미 닫힌 서버를 가리키면 다음 요청이 ECONNRESET 로 죽는다.
  - 수정 1 (`server/tests/setup.ts`): 공유 setup 에서 http/https globalAgent 의
    keepAlive 를 끈다. 14개 테스트 파일을 건드리지 않고 한 곳에서 해결.
  - 수정 2 (`server/tests/middleware/rate-limit.test.ts`): probe spam 가드가 임시 서버를
    250번 bind/close 하던 것을 리스닝 서버 1개 재사용으로 바꾸고 timeout 30s 를 줬다.
    단언 의도(health 는 rate-limit 카운트 제외)는 그대로다.
  - 검증: server 단독 6회 연속 통과(0 실패), 기본 병렬도 전체 실행 2회 연속 exit 0.
    수정 전에는 단독 3회 중 1회, 전체 병렬 5회 중 2회 실패했다.

## [15-05] `server/.dockerignore` 가 실제로 적용되지 않는다 (선재 · 범위 밖)

- **증상:** `scripts/deploy-server.sh` 는 저장소 루트를 컨텍스트로 `-f server/Dockerfile .`
  로 빌드한다. BuildKit 은 이 경우 `server/Dockerfile.dockerignore` 를 찾고, 없으면
  컨텍스트 루트의 `.dockerignore` 를 본다 — 루트에는 없다. 그래서 `server/.dockerignore`
  는 **어느 쪽에도 해당하지 않아 무시된다.**
- **영향:** `node_modules`·`.git`·`.planning`·저장소 안의 모든 `.env` 가 빌드 컨텍스트로
  전송된다. 멀티스테이지라 최종 이미지에는 남지 않지만 builder 레이어/빌드 캐시에는 남고,
  컨텍스트 전송이 불필요하게 느리다.
- **선재 근거:** 15-05 가 만든 파일이 아니다. `server/` 는 이 phase 에서 건드리지 않는다.
- **15-05 에서 한 조치:** relay 쪽만 `relay/Dockerfile.dockerignore` 를 만들어 실제로
  적용되게 했다. `server/` 는 손대지 않았다(범위 밖 · 배포 스크립트 회귀 위험).
- **권고:** `server/.dockerignore` → `server/Dockerfile.dockerignore` 로 이름을 바꾸거나
  루트 `.dockerignore` 를 두는 quick task. workers/ 의 `.dockerignore` 도 같은 점검 필요.

## [15-09] `public.rls_auto_enable()` 이 마이그레이션 이력에 정의되지 않았다 (선재 · 범위 밖)

- **발견 경로:** 15-09 Task 1 로컬 검증 — `supabase/postgres:17.4.1.075` 컨테이너에
  `supabase/migrations/*.sql` 를 파일명 순으로 전부 재생(replay)하던 중.
- **증상:** `20260702160000_security_perf_advisor_fixes.sql:23` 의
  `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;` 가
  `ERROR: function public.rls_auto_enable() does not exist` 로 실패한다.
  `grep -rn "rls_auto_enable" supabase/migrations/` 결과가 그 파일의 주석·REVOKE 3줄뿐 —
  **CREATE 가 어느 마이그레이션에도 없다.** 대시보드에서 수기 생성된 것으로 보인다.
- **영향:** production 에는 함수가 이미 있어 `db push` 는 정상이다. 그러나
  **빈 DB 에서 마이그레이션 이력을 처음부터 재생할 수 없다** — 로컬 `supabase start`,
  `db reset`, 재해복구, 신규 스테이징 구축이 모두 이 지점에서 멈춘다.
  (같은 재생에서 `auth.jwt()` 도 필요했으나 그쪽은 GoTrue 가 제공하는 플랫폼 함수라 정상이다.)
- **15-09 무관 근거:** 15-09 는 `supabase/migrations/20260905*` 3건만 추가한다.
  실패 지점은 2026-07-02 자 기존 파일이고, 15-09 의 변경을 전부 빼도 동일하게 재현된다.
- **15-09 에서 한 조치:** 검증 컨테이너에만 no-op 스텁을 만들어 재생을 이어갔다.
  저장소 파일은 건드리지 않았다.
- **권고:** `rls_auto_enable()` 의 production 정의를
  `pg_get_functiondef` 로 덤프해 보정(backfill) 마이그레이션으로 커밋하는 quick task.
  적용 완료 표시만 필요하므로 `CREATE OR REPLACE` 로 두면 production 에도 무해하다.

## [15-08] `gh-radar-relay-down` 알림이 단일 리전 순간 실패에도 울릴 수 있다 (임계값 튜닝)

- **발견 경로:** 15-08 Task 2 — `ops/alert-relay-down.yaml` 작성 중 임계값 의미를 따져 보다가.
- **증상(예상):** plan 이 지정한 조건은 `ALIGN_FRACTION_TRUE` + `COMPARISON_LT` +
  `thresholdValue: 1` + `duration: 300s` 다. 즉 **성공률이 100% 미만이면 조건 성립**이다.
  uptime check 는 여러 리전에서 동시에 두드리므로, 한 리전에서 한 번만 실패해도
  5분 창의 fraction 이 1 아래로 떨어져 알림이 뜰 수 있다.
- **15-08 에서 한 조치:** plan 이 명시한 값을 그대로 따랐다(임계값은 plan 의 명시 스펙이라
  임의 변경 대상이 아니다). 대신 `crossSeriesReducer: REDUCE_MEAN` + `groupByFields:
  [resource.label.host]` 를 더해 리전별로 **중복 인시던트가 열리는 것**은 막았다.
  `alertStrategy.autoClose: 1800s` 라 오탐이 떠도 30분 뒤 자동으로 닫힌다.
- **권고:** 운영 며칠 뒤 실제 오탐 빈도를 보고 `thresholdValue` 를 0.5~0.7 로 낮추는
  quick task. **장중 실사용이 시작되기 전에** 판단할 것 — 오탐으로 알림을 무시하는 습관이
  생기면 진짜 장애를 놓친다. 반대로 너무 둔감하면 relay 다운이 곧 주문 불가다.

## [15-08] `smoke-relay.sh --check-isin` 미구현 (15-10 소관 · 의도된 공백)

- **현재:** 안내 문구를 출력하고 `exit 0` 한다. 실패로 세지 않는다.
- **이유:** `stocks.isin` 백필이 15-10 산출물이라 지금 검증할 데이터 자체가 없다.
  실패로 두면 배포 검증(INV-1~8)이 아직 존재하지 않는 데이터에 발목잡힌다.
- **권고:** 15-10 이 백필을 끝내면 이 분기를 채운다.
  예정 검증: 주식(ETP 제외) 행의 `isin` null 카운트 == 0, `length(isin) = 12`.

## [15-10] master-sync 가 2026-06-10 이후 매일 0행을 받고 조용히 끝난다 (선재 · 범위 밖)

- **발견 경로:** 15-10 Task 3 백필 준비 — Cloud Run Job 을 그냥 1회 실행하면 되는지
  확인하려고 최근 실행 로그를 읽던 중.
- **증상:** `gh-radar-master-sync` 는 매 영업일 08:10 KST 에 정상 종료(exit 0)하지만
  로그는 매번 `KRX fetched krxRows=0` → `KRX returned 0 rows … (stocks 마스터 미변경)`
  이다. 09-01/09-02/09-03 실행 3건 모두 동일. `stocks.updated_at` 의 대부분이
  **2026-06-10** 에 멈춰 있는 것이 그 결과다.
- **원인:** `workers/master-sync/src/index.ts` 의 `todayBasDdKst()` 가 **오늘(KST) 날짜**를
  `basDd` 로 보낸다. KRX 기본정보는 그 시점에 아직 발행되지 않는다. 실측(2026-09-06 KST):

  | basDd | 응답 |
  | --- | --- |
  | 20260906 (일) | 0 행 |
  | 20260904 (금) | 0 행 |
  | 20260903 (목) | 943 행 (KOSPI) |

  즉 현재 가용 최신 기준일은 **T-2 영업일** 수준이고, "오늘" 은 항상 0 행이다.
  2026-06-10 까지는 통했으므로 그 무렵 KRX 발행 시점이 바뀐 것으로 보인다.
- **영향(연쇄):** upsert 도 delist-sweep 도 실행되지 않는다 →
  ① 6월 이후 상장폐지·비상장 전환된 종목이 `is_delisted=false` 로 남아 있고,
  ② intraday-sync `bootstrapStocks` 가 placeholder 로 넣은 ETN 행이
  `security_group='주권'` 인 채 교정되지 않는다.
  이 둘이 곧 15-10 의 `--check-isin` ISIN-2 잔존 42종목의 원인이다.
- **15-10 무관 근거:** 15-10 의 변경(map/upsert/routes/shared/smoke)은 `basDd` 선택
  로직을 건드리지 않는다. 로그상 최초 0행은 15-10 착수 3개월 전이다.
- **15-10 에서 한 조치:** 백필만 `BAS_DD=20260903` 을 명시해 1회 수행했다.
  `index.ts` 는 손대지 않았다 — 스케줄 의미를 바꾸는 변경이고, 배포로 검증할 수
  없는 환경이라(권한 계층이 재배포를 차단) 검증 없는 수정이 된다.
- **권고:** `todayBasDdKst()` 를 "오늘부터 거슬러 올라가며 비어 있지 않은 응답이 나올
  때까지 최대 N일 탐색" 으로 바꾸는 quick task. 0행을 warn 이 아니라 **연속 N회 시
  에러**로 승격해 다시는 3개월간 조용히 죽어 있지 않게 할 것.

### 부기 (15-10, 2026-09-06): server ECONNRESET flake 잔존

위 "근본 수정 완료" 이후에도 **완전히 사라지지는 않았다.** 15-10 검증 중 server 단독
실행 4회에서 1회 `tests/routes/discussions.test.ts > V-05` 가 `read ECONNRESET` 으로
실패했다(나머지 3회는 29 files / 221 tests 전부 통과). 15-10 이 건드린
`tests/routes/stock-detail.test.ts` 는 4회 모두 통과했고, 실패 파일은 15-10 의 변경과
무관하다. `keepAlive=false` 는 적용돼 있으므로 남은 원인은 다른 데 있다 —
supertest 가 파일마다 임시 서버를 bind/close 하는 구조 자체를 손봐야 할 수 있다.
빈도가 낮아 여기 기록만 남긴다.

## [사용자 결정] DMA_CRED_KEY 회전 — 하지 않음 (수용된 리스크)

- **경위:** 15-08 실행 중 컨테이너 env 를 `grep -E 'DMA_|...'` 로 조회하면서 패턴이
  `DMA_HOST` 뿐 아니라 `DMA_CRED_KEY` 까지 매칭해 키 값이 실행 로그에 출력됐다.
  커밋·문서·SUMMARY 어디에도 값은 기록되지 않았고, 노출은 이 1종뿐이다
  (같은 패턴이 service-role key 와 order secret 에는 매칭되지 않았다).
- **결정 (2026-09-06, 사용자):** "회전안해도돼 그냥 진행해" — 회전하지 않고 진행한다.
- **근거:** `dma_credentials` 가 0행이라 이 키로 암호화된 데이터가 존재하지 않는다.
  노출 값은 로컬 실행 로그에만 있고 원격으로 나간 적이 없다.
- **남는 리스크:** 자격증명이 실제로 등록되기 시작하면 이 키가 그 데이터를 보호하게 된다.
  그 시점 이후에는 회전 비용이 재암호화를 수반하므로, 등록 전에 회전할지 재검토할 가치가 있다.
- **회전이 필요해지면:**
  ```bash
  openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add gh-radar-dma-cred-key --data-file=-
  gcloud secrets versions disable 1 --secret=gh-radar-dma-cred-key
  bash scripts/deploy-relay.sh && bash scripts/smoke-relay.sh
  ```
  (이 환경의 권한 계층이 시크릿 쓰기를 차단하므로 사용자가 직접 실행해야 한다.)
- **재발 방지:** `infra/relay/README.md` 에 "env 조회는 키 이름만 뽑을 것" 경고가 박혔다.
