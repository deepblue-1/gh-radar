---
phase: 28-limitup-feature-ingest
fixed_at: 2026-10-05T13:03:05Z
review_path: .planning/phases/28-limitup-feature-ingest/28-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 28: 코드 리뷰 수정 보고서

**수정 시각:** 2026-10-05T13:03:05Z
**원본 리뷰:** .planning/phases/28-limitup-feature-ingest/28-REVIEW.md
**회차:** 1

**요약:**
- 범위 안 지적: 11건 (Critical 1 · Warning 10, Info 16건은 범위 밖)
- 수정: 11건
- 건너뜀: 0건
- 커밋만 했다. 배포 · push 는 하지 않았다(아래 「배포 표면」 참고).

로직을 바꾼 수정(CR-B01 · WR-A01 · WR-A02 · WR-B01 · WR-B04 · WR-B05)은 **fixed: requires human verification** 이다. 단위 테스트로 지적된 시나리오를 재현해 고쳤지만, 운영 데이터 · 실제 PostgREST · 실제 브라우저에서는 아직 확인하지 않았다.

## 수정한 지적

### CR-B01: 날짜 하나의 영구 예외가 그 뒤 모든 날짜의 적재와 run 끝 보존 정리를 무기한 막는다

**상태:** fixed: requires human verification
**수정 파일:** `workers/limitup-sync/src/index.ts`, `workers/limitup-sync/src/config.ts`, `scripts/deploy-limitup-sync.sh`, `workers/limitup-sync/tests/{dispatch,load,config}.test.ts`
**커밋:** b38987b8
**적용한 수정:**
- 날짜 루프 본문을 `loadDay(date)` 로 묶고 날짜마다 try/catch 로 감쌌다. skip 이 아닌 오류가 나면 그 날짜만 `result.failed` 에 `{date, error}` 로 남긴다. 함께 error 로그와 `limitup_record_skip(date, "load")` 를 남기고 다음 날짜로 간다. record_skip 자체가 실패해도 error 로그만 남기고 계속 간다.
- 보존 정리(kind 15 purge 포함)는 실패 날짜가 있어도 돈다. `main` 은 실패 날짜가 하나라도 있으면 error 로그를 남기고 종료 1 을 낸다. 따라서 알림은 지금처럼 매일 울린다.
- 운영 탈출구 `LIMITUP_SKIP_DATES=YYYYMMDD,…` 를 추가했다. 그 날짜는 읽지도 기록하지도 않는다(`excluded` · warn). 형식이 틀리면 config 단계에서 throw 한다. 배포 스크립트는 이 env 를 선택 env 로 넘긴다(`--set-env-vars` 가 재배포 때 지우지 않게).
- 재현 테스트: 앞 날짜의 행 수가 맞지 않아도 뒤 날짜는 적재되고, purge 3단계도 돌고, main 은 1 을 낸다.
- D-20(skip = warn + 0, 3연속 = 1)과 충돌하지 않는다. 예외로 끝나던 날짜가 「실패 날짜」 로 바뀌었을 뿐이고, 예전에도 예외는 종료 1 이었다.

### WR-A01: relay 85 키 캐시가 FULL→PRICE 강등 · quote 재접속 뒤에도 남는다

**상태:** fixed: requires human verification
**수정 파일:** `relay/src/hub/subscription-hub.ts`, `relay/tests/hub.test.ts`
**커밋:** ef2ec49c
**적용한 수정:** 아래 세 자리에서 `#limitFeatures` 를 지운다.
- `unsubscribe` 의 FULL→PRICE 강등
- `#resumeFromLinger` 의 강등
- `resubscribeAll` 시작 시점(pacer reset 직후 `clear()`)

`#onLimitFeature` 는 실효 level 이 PRICE 인 키에 늦게 도착한 85(강등 29 뒤 in-flight)도 버린다. 그래야 지운 캐시가 되살아나지 않는다. linger(FULL) 중인 키는 업스트림이 아직 FULL 이라 계속 갱신한다. hub 테스트 3건을 더했다: 강등 → 늦은 85 → 재승격 시 스냅샷 없음, linger 중 PRICE 복귀, 재접속.

### WR-A02: 「상한가 특징」 을 켠 채 몇 시간이 지나면 kind 15 줄 중간이 조용히 빠진다

**상태:** fixed: requires human verification
**수정 파일:** `webapp/src/lib/use-order-log-feed.ts`, `webapp/src/lib/use-relay-socket.ts`(주석), `webapp/src/lib/__tests__/use-order-log-feed.test.tsx`
**커밋:** 453c1bc2
**적용한 수정:** 리뷰가 제시한 두 안 중 「축출 감지 → 재조회」 를 골랐다.
- 재조회 조건: 라이브 `limitFeatureEvents` 가 `MAX_LIMIT_FEATURE_EVENTS` 에 닿았고, 그 가장 오래된 그날 줄이 조회 캐시 꼬리보다 뒤에 있음(= 그 사이 줄이 어디에도 없음). 이때 `?lf=1` 을 한 번 더 부른다.
- 같은 「가장 오래된 줄」 에는 한 번만 부른다(`lfGapRef`). 응답이 틈을 못 메워도 루프를 돌지 않는다.
- 진행 중 · 실패 상태면 부르지 않는다(실패는 기존 retry 로 처리).
- use-relay-socket 151-157 주석도 실제 동작에 맞게 고쳤다.
- 테스트로 확인한 것: 상한 직전에는 재조회하지 않고, 틈이 생기면 1회, 같은 틈에는 다시 부르지 않는다. 이 테스트는 수정 전 코드에서 실패하는 것을 확인했다.

### WR-A03: `orderLogLimitFeature` pref 를 `useState` 지연 초기화로 읽어 하이드레이션이 어긋난다

**상태:** fixed
**수정 파일:** `webapp/src/lib/use-order-log-feed.ts`, `webapp/src/lib/__tests__/use-order-log-feed.test.tsx`
**커밋:** 59376d3e
**적용한 수정:** 첫 렌더는 `false` 로 둔다. pref 는 마운트 effect 에서 읽는다(vi-trigger-strip · shared-panels 와 같은 규율). 테스트로 첫 렌더 값이 false 이고 마운트 뒤 true 가 되는 것을 확인했다.

### WR-A04: 보고서 격자 모듈 캐시(`gridCache`)에 상한이 없다

**상태:** fixed
**수정 파일:** `webapp/src/lib/use-limitup-grid.ts`, `webapp/src/lib/__tests__/use-limitup-grid.test.tsx`
**커밋:** cb245cdc
**적용한 수정:**
- 날짜 단위 LRU(`MAX_GRID_DATES = 2` — 보는 날짜 + 직전에 본 날짜)를 두었다. 상한을 넘긴 날짜는 격자와 URL 목록을 함께 버린다.
- 받는 도중 상한 밖으로 밀린 날짜의 응답은 캐시에 넣지 않는다.
- 캐시 hit 경로도 최근 사용으로 올린다.
- 테스트: 셋째 날짜를 열면 가장 오래 안 본 날짜를 다시 받는다.

### WR-A05: 하루 격자 행 `<button aria-label>` 이 행 값을 보조기기에서 감춘다

**상태:** fixed
**수정 파일:** `webapp/src/components/analytics/limitup-day-grid.tsx`, `webapp/src/components/analytics/__tests__/limitup-day-grid.test.tsx`
**커밋:** 02f6e852
**적용한 수정:**
- 접근 이름은 바꾸지 않았다. UI-SPEC 436행이 「{종목명} {코드} — 사건 카드로 이동」 으로 고정하고 e2e 도 이 이름을 쓰므로, 리뷰 안 중 「aria-label 제거」 는 쓰지 않았다.
- 대신 행 값을 한 문장으로 엮은 `rowDescription(r)` 을 sr-only 조각으로 두고 `aria-describedby` 로 이었다. 예: 「결과 깨짐 · 유지, 첫 잠김 09:30:00, 잠김 2, 최대 23.4억, +60초 매도 4%, 창구 키움증권 · 신한증권 (추정)」.
- 보이는 칸을 직접 잇지 않은 까닭: 처음에 그렇게 시도하자 인라인 칸 글자가 「잠김2최대23.4억」 처럼 붙어 읽혔다.
- 테스트는 `toHaveAccessibleDescription` 으로 확인했다.

### WR-B01: 신선도 감시가 없다 — 119 export 나 radar-gw 운반이 멈추면 알림 없이 「정상」 이 된다

**상태:** fixed: requires human verification
**수정 파일:** `workers/limitup-sync/src/freshness.ts`(새 파일), `workers/limitup-sync/src/index.ts`, `workers/limitup-sync/package.json`, `workers/limitup-sync/Dockerfile`, `pnpm-lock.yaml`, `ops/alert-limitup-sync-failure.yaml`(문서 문구), `scripts/deploy-limitup-sync.sh`(주석), `workers/limitup-sync/tests/{freshness,dispatch}.test.ts`
**커밋:** 7757ea46
**적용한 수정:**
- run 마다 GCS 의 가장 새 export 날짜 뒤로, KST 오늘까지 export 가 없는 **KRX 거래일**을 센다. 주말은 건너뛰고, 휴장일은 `@gh-radar/shared` `isKrxHoliday`(공유 캘린더 — 두 번째 캘린더 금지)로 뺀다.
- 3 거래일 이상이면 `freshness.stale` 이 된다. main 은 「limitup-sync stale」 error 로그와 종료 1 을 낸다. 기존 실패 실행 알림 정책이 이것을 그대로 잡으므로 새 알림 정책은 만들지 않았다.
- 임계를 3으로 둔 근거: 탐지 0 인 거래일은 export 디렉터리 자체가 없다(gh-trade 1105548d · 인박스 노트). 그래서 1~2일 공백은 정상일 수 있다.
- 오탐이 없는지 테스트로 확인한 날: 추석(9/24 · 9/25)과 10/5 대체공휴일.
- 같이 바꾼 것:
  - `main(argv, now?)` 에 `now` 인자를 더했다. 기존 main 테스트가 실제 시계에 묶여 며칠 뒤 깨지는 것을 막기 위해서다.
  - `@gh-radar/shared` 워크스페이스 의존성을 추가했다. Dockerfile 에 home-sync 와 같은 shared 복사 · 빌드 줄을 넣었다.
- 컴파일한 `node dist/index.js --dry-run` 이 shared CJS 를 불러 정상 종료하는 것은 로컬에서 확인했다. Docker 빌드는 돌리지 않았다.
- 한계: 캘린더 seed 는 2026-12-31 까지다. 2027 휴장일을 넣기 전에는 연휴에 오탐할 수 있다(freshness.ts 머리말에 적었다).

### WR-B02: `limitup_commit_day` 의 statement_timeout 위험을 판단할 commit 소요 시간이 로그에 없다

**상태:** fixed
**수정 파일:** `workers/limitup-sync/src/index.ts`, `workers/limitup-sync/tests/dispatch.test.ts`, `supabase/migrations/20261006090500_limitup_commit_day_timeout.sql`(새 파일)
**커밋:** 1982d612
**적용한 수정:**
- `limitup day committed` 로그에 `commitMs` 를 넣었다. `COMMIT_WARN_MS`(5초)를 넘으면 `limitup commit slow` warn 을 남긴다(member_alloc 행 수 포함).
- 새 마이그레이션은 `ALTER FUNCTION public.limitup_commit_day(...) SET statement_timeout = '120s'` 다. 함수 본문은 바꾸지 않았고, 적용된 마이그레이션도 수정하지 않았다.
  - REVOKE PUBLIC · anon · authenticated 와 GRANT service_role 을 원 마이그레이션(20261006090200)과 같게 다시 적었다.
  - 끝에 `NOTIFY pgrst, 'reload schema'` 를 넣었다.
- **검증 필요:**
  - 이 함수 속성이 RPC 호출에 적용되려면 PostgREST 가 함수 속성 `statement_timeout` 을 호출 트랜잭션에 끌어올려야 한다(db-hoisted-tx-settings, PostgREST 12+). 이 동작은 원격에서 확인하지 않았다. 함수 본문 안의 SET 은 이미 시작된 문장의 타이머에 효과가 없다(20260611130000 머리말).
  - 원격에는 20260611130000 의 `ALTER ROLE service_role SET statement_timeout = '600s'` 가 이미 있을 수 있다. 그렇다면 이 마이그레이션이 이 RPC 의 한도를 120s 로 **낮춘다**. 로컬 최대 실측 2~3초 대비로는 충분하지만, 원격 역할 설정 값을 확인한 뒤 push 할지 정하라.
- 로컬 Supabase 가 떠 있지 않아 SQL 은 실행 검증하지 못했다(문법 검토만 했다).

### WR-B03: server 보고서 · 격자 경로가 DB · Storage 오류 원인을 버린다

**상태:** fixed
**수정 파일:** `server/src/errors.ts`, `server/src/middleware/error-handler.ts`, `server/src/services/limitup-report.ts`, `server/src/services/dma-orders.ts`, `server/tests/middleware/error-handler.test.ts`, `server/tests/routes/limitup-report.test.ts`
**커밋:** 6d0044a4
**적용한 수정:**
- `ApiError` 에 선택 인자 `cause` 를 더했다(ES2022 `Error` cause).
- `errorHandler` 는 cause 가 있을 때 **warn 로그에만** 싣는다. 응답은 고정 문구 그대로라 T-15-07 을 지킨다.
- 보고서 · 격자 RPC 오류는 `{code, message, details, hint}` 를, 응답 모양 위반은 `{reason, type}` 을, Storage 서명 실패는 `{storage, count}` 를 cause 로 싣는다.
- `dma-orders.ts` 의 `listStrategyEvents` 도 같은 방식으로 바꿨다. 리뷰가 짚은 120행이다. 같은 파일의 Phase 28 밖 다른 두 자리는 범위 밖이라 두었다.
- 테스트로 확인한 것: 응답에 57014 가 없고 warn 에 cause 가 있다. 서비스가 던지는 cause 도 단언했다.

### WR-B04: 격자 업로드 후 commit 이 실패하면 「새 격자 + 옛 DB 행」 이 섞인 보고서가 나간다

**상태:** fixed: requires human verification (리뷰 수정안을 바꿔 적용)
**수정 파일:** `workers/limitup-sync/src/index.ts`, `workers/limitup-sync/src/grid.ts`(순서 계약 주석 정정), `workers/limitup-sync/tests/dispatch.test.ts`
**커밋:** c28651a9
**적용한 수정:**
- 리뷰가 제안한 내용 주소 경로(`grid/<D>/<sig 앞 12자>/<isin>`)는 쓰지 않았다. **D-14 가 경로 `limitup-grid/grid/<date>/<isin>.json.gz` 와 「기존 객체 덮어쓰기」 를 결정으로 고정**했고, 바꾸려면 DB 열 · commit RPC 시그니처 · server 서명 경로 · 옛 접두 정리까지 여러 표면을 재설계해야 하기 때문이다.
- 대신 D-14 안에서 사용자에게 보이는 해(섞인 보고서)를 없앴다. 이미 적재된 날짜(옛 `files_sig` 있음)의 재적재가 업로드 이후(업로드 · stage · commit) 실패하면 그 날짜의 `limitup_loads.files_sig` 를 null 로 지운다.
- 그 결과:
  - 보고서 RPC 는 `files_sig IS NOT NULL` 인 날짜만 보이므로 그 날짜가 「적재 안 된 날짜」 로 내려간다.
  - 다음 run 은 sig 가 달라 통째로 다시 적재한다.
  - 처음 적재하는 날짜는 내릴 것이 없어 갱신하지 않는다.
  - 내리기 갱신이 실패하면 error 로그만 남긴다. 실패 사유로는 원래 오류를 쓴다.
- 대가: 재적재가 계속 실패하는 동안 그 날짜는 보고서에서 빠진다. 옛 격자가 이미 덮어써져 옛 표시도 맞지 않으므로, 이쪽이 정직한 상태다.
- `grid.ts` 의 「무해」 주석을 「처음 적재하는 날짜에만 무해」 로 고쳤다.
- 내용 주소 경로로 바꿀지는 별도 결정 사안으로 남긴다.

### WR-B05: kind 15 purge 가 limitup 보존 정리 · Storage 정리 뒤에 직렬로 묶여 있다

**상태:** fixed: requires human verification
**수정 파일:** `workers/limitup-sync/src/purge.ts`, `workers/limitup-sync/src/index.ts`, `workers/limitup-sync/tests/purge.test.ts`
**커밋:** 6be91f1f
**적용한 수정:**
- 세 단계(표 · Storage · kind 15)를 각각 try 로 돌린다. 실패 사유는 모아 ` | ` 로 이어 마지막에 한 번 throw 한다. throw 에는 끝난 단계 결과를 `partial` 로 붙이고, dispatch 의 error 로그에도 `partial` 을 싣는다.
- 순서는 그대로 두었다. 격리만으로 「앞 단계가 kind 15 를 막는」 문제가 풀리고, 기존 순서 단언도 유지된다.
- `PurgeResult.kind15` 는 `number | null` 이 됐다. 그 단계가 실패하면 null 이다.
- CR-B01 수정으로 실패 날짜가 있어도 purge 단계까지 도달한다.
- 테스트: 표 정리와 Storage 가 실패해도 kind 15 RPC 가 불리고, 메시지와 partial 이 맞다.

## 검증

**실행 위치:** 메인 체크아웃(`/Users/alex/repos/gh-radar`, master)에서 직접 편집 · 커밋했다. 격리 worktree 는 만들지 않았다.
- 이유 1: 오케스트레이터 지시(경로 지정 스테이징 · 커밋 직전 `git status -sb`)가 메인 체크아웃 작업을 전제한다.
- 이유 2: worktree 에는 `node_modules` 가 없어 이 프로젝트의 게이트(vitest · tsc)를 돌릴 수 없다.

아래 숫자는 메인 체크아웃 트리 그대로 재현된다. 마지막 커밋 6be91f1f 기준이다.

| 명령 | 결과 |
|---|---|
| `pnpm -C workers/limitup-sync test` | 8 files · 91 tests 통과 |
| `pnpm -C workers/limitup-sync typecheck` | 통과 |
| `pnpm -C workers/limitup-sync build` + `node dist/index.js --dry-run`(픽스처) | 종료 0 (shared CJS 로드 확인) |
| `pnpm -C relay test` | 36 files · 1010 tests 통과 (WR-A01 커밋 시점) |
| `pnpm -C relay typecheck` · `typecheck:tests` | 통과 |
| `pnpm -C server exec vitest run` | 34 files · 312 tests 통과 |
| `pnpm -C server typecheck` | 통과 |
| `pnpm --filter @gh-radar/webapp run test` | 149 files · 3504 통과 · 1 skipped |
| `pnpm --filter @gh-radar/webapp run typecheck` (tsc + e2e tsconfig) | 통과 |
| `ops/alert-limitup-sync-failure.yaml` js-yaml 파싱 · `bash -n scripts/deploy-limitup-sync.sh` | 통과 |

실행하지 않은 것: e2e(Playwright) · Docker 이미지 빌드 · 로컬 Supabase 에서 마이그레이션 적용(로컬 DB 가 떠 있지 않았다).

## 배포 표면 (메인 세션이 할 일 — 이 실행은 커밋만 했다)

| 지적 | DB 마이그레이션 | limitup-sync 워커 | server | relay | webapp(push) | radar-gw 스크립트 |
|---|---|---|---|---|---|---|
| CR-B01 | — | ● 재배포(`scripts/deploy-limitup-sync.sh`) | — | — | — | — |
| WR-A01 | — | — | — | ● | — | — |
| WR-A02 | — | — | — | — | ● | — |
| WR-A03 | — | — | — | — | ● | — |
| WR-A04 | — | — | — | — | ● | — |
| WR-A05 | — | — | — | — | ● | — |
| WR-B01 | — | ● 재배포 (이미지에 shared 포함 · 알림 정책 문서 문구는 같은 스크립트 Section 7 이 갱신) | — | — | — | — |
| WR-B02 | ● `20261006090500_limitup_commit_day_timeout.sql` (원격 service_role statement_timeout 값 확인 뒤 push) | ● 재배포 (commitMs 로그) | — | — | — | — |
| WR-B03 | — | — | ● | — | — | — |
| WR-B04 | — | ● 재배포 | — | — | — | — |
| WR-B05 | — | ● 재배포 | — | — | — | — |

정리하면 아래와 같다. radar-gw(`infra/relay/limitup-pull/*`)는 건드리지 않았다.
- DB push 1건(선택적 판단 필요 — WR-B02 의 검증 필요 항목 참고)
- limitup-sync 재배포 1회(CR-B01 · WR-B01 · WR-B02 · WR-B04 · WR-B05 모두 같은 이미지)
- server 재배포 1회
- relay 재배포 1회
- webapp 은 push 로 배포

D-22 순서를 따르면 다음과 같다. 프로젝트 규칙상 push 가 곧 webapp 프로덕션 배포이므로, 백엔드가 막히면 push 하지 않는다.
DB → 워커 → relay → server → webapp(push)

---

_Fixed: 2026-10-05T13:03:05Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
