---
phase: quick-261106-ldl
plan: 01
subsystem: intraday-sync · server · supabase
status: complete
tags: [kiwoom, ka10001, float-shares, gh-trade, cloud-run-job]
requires: [stocks.listing_shares, kiwoom_tokens, intraday-sync image]
provides: [stock_float table, RPC stock_float_all, JOB_MODE=float, GET /api/stocks/float, GET /api/stocks/:code/float]
affects: [scripts/deploy-intraday-sync.sh (redeploys intraday Job + new float Job)]
tech-stack:
  added: []
  patterns: [같은 이미지 env JOB_MODE 분기, 단위 강건 정규화(로그 비율 거리 다수결), 연속 실패 차단기, jsonb 스칼라 RPC 로 1000행 절단 회피]
key-files:
  created:
    - supabase/migrations/20261106200000_stock_float.sql
    - workers/intraday-sync/src/pipeline/floatShares.ts
    - workers/intraday-sync/src/floatSync.ts
    - workers/intraday-sync/tests/floatShares.test.ts
    - workers/intraday-sync/tests/floatSync.test.ts
    - server/tests/routes/stock-float.test.ts
  modified:
    - packages/shared/src/kiwoom.ts
    - workers/intraday-sync/src/index.ts
    - workers/intraday-sync/src/kiwoom/fetchHotSet.ts
    - server/src/routes/stocks.ts
    - scripts/deploy-intraday-sync.sh
decisions:
  - "키움 주식수 단위(주/천주)는 행마다 stocks.listing_shares 와 로그 비율 거리로 ×1/×1000 을 고르고, listing_shares 없는 행은 run 다수결 배수 — 다수결 없으면 세 값 null"
  - "float-sync 는 intraday-sync 이미지 재사용 + JOB_MODE=float, 평일 21:30 KST, KA10001_RATE_LIMIT=3"
  - "공개 엔드포인트 2종은 DB 만 읽고 왕복 1회(embed / RPC), Cache-Control public, max-age=3600"
metrics:
  duration: "약 5분 (06:32Z~06:38Z)"
  completed: 2026-11-06
estimate:
  tokens: 150000
  tasks: 3
actuals:
  tokens: 13565      # chars/4 over 실제 변경 diff (54,260자)
  tasks: 3
  commits: 6         # MEASURED rev-list count — 이 중 3건은 동시 세션 커밋(b5ec7414 · b4f50e0b · bc9ec60c)
  own_commits: 3
plan_head_before: a1136df0b8b561c2e88a0050c943a63ec3a9445a
plan_head_after: bc11d0c08e50f9fee72066d541e70ad97f4ac630
---

# Quick 261106-ldl Plan 01: 유통주식수(stock_float) 야간 배치 + 공개 엔드포인트 Summary

키움 ka10001 flo_stk · dstr_stk · dstr_rt 를 평일 21:30 KST 고정 배치(intraday-sync 이미지, JOB_MODE=float)로 전 종목 받아, stocks.listing_shares 와 비교해 주 단위로 정규화한 뒤 stock_float 에 저장하고, GET /api/stocks/float(RPC 1회 압축 JSON) · GET /api/stocks/:code/float(embed 1회)로 내보낸다.

## Commits

| Task | 내용 | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | stock_float 마이그레이션 · ka10001 타입 · floatShares 순수 함수 · GET /:code/float | 0bc1cfc0 |
| 2 | floatSync(JOB_MODE=float) · fetchKa10001One 추출 · resolveJobMode · 배포 스크립트 Section 6b | c242dc93 |
| 3 | GET /api/stocks/float (RPC stock_float_all) | bc11d0c0 |

## 검증

- intraday-sync 전체: `vitest run --maxWorkers=2` → 21 files · 177 tests green (신규 floatShares 15 · floatSync 4 포함, 기존 runCycle 18 · fetchHotSet 4 무수정 green)
- server routes 전체: `vitest run tests/routes --maxWorkers=2` → 25 files · 529 tests green (신규 stock-float 10)
- typecheck: intraday-sync · server 둘 다 통과, `pnpm -F @gh-radar/shared build` 성공
- `bash -n scripts/deploy-intraday-sync.sh` 통과, JOB_MODE=float · `30 21 * * 1-5` 비주석 행 존재
- 마이그레이션: RLS `TO anon, authenticated` 1줄, `REVOKE EXECUTE` 2줄(PUBLIC · anon/authenticated) + `GRANT ... TO service_role`
- 배포 명령은 하나도 실행하지 않았다(db push · gcloud · 배포 스크립트 실행 없음), push 안 함

## 메인 세션 배포 순서

1. **DB**: `supabase db push --linked --yes` — 20261106200000_stock_float.sql (새 표 + 함수, 기존 표 잠금 없음)
2. **Job 배포**: `GCP_PROJECT_ID=gh-radar SUPABASE_URL=<라이브 값> bash scripts/deploy-intraday-sync.sh`
   - 이 스크립트는 intraday Job(gh-radar-intraday-sync)도 같은 이미지로 재배포한다 — JOB_MODE 를 주지 않으므로 intraday 동작 불변. 장중(08:00~20:02)에 돌려도 되지만 20:02 이후가 안전.
   - 새로 생기는 것: Job `gh-radar-float-sync`(env JOB_MODE=float · KA10001_RATE_LIMIT=3 · timeout 3600s · VPC all-traffic) + Scheduler `gh-radar-float-sync-cron` `30 21 * * 1-5` Asia/Seoul.
   - 배수 몫을 바꾸려면 `FLOAT_RATE_LIMIT=<n>` env.
3. **첫 실행**: `gcloud run jobs execute gh-radar-float-sync --region=asia-northeast3` (약 22~25분 예상)
4. **server 배포** 후 스모크 (아래)

## 스모크 체크 (첫 실행 로그 — Cloud Logging, job="float-sync")

1. `"float universe loaded"` — `universe` 가 약 4천(ELW · ETN · 상폐 제외). 2,735 ELW 가 섞였다면 7천 가까이 나온다 → 필터 문제.
2. **배수 결정 줄** `"float unit multiplier decided"` (결정 못 하면 warn `"float unit multiplier undecided ..."`):
   - `votes: {"1": a, "1000": b}` — 한쪽이 압도적이어야 정상(단위가 한 가지). `disagree` 는 0 이거나 극소수(감자/증자 직후 마스터 시차 등).
   - `multiplier` — 1 이면 키움이 주 단위, 1000 이면 천주 단위.
   - `sample` — raw 표본 1행 `{ code: "005930", flo_stk, dstr_stk, dstr_rt, listing_shares, multiplier }`. 확인: `flo_stk × multiplier ≈ listing_shares`(삼성 약 5,969,782,660주), `dstr_stk / flo_stk ≈ dstr_rt/100`.
3. **완료 줄** `"float sync complete"` — `{ universe, ok, null, failed, aborted, multiplier, upserted, elapsedMs, failureSample, failureGroups }`.
   - `aborted: false` 여야 정상(true 면 연속 실패 20건 → exit 1 — failureGroups 로 429/403/토큰 원인 확인, 재실행으로 두드리지 말 것).
   - `null` 은 ETF 등 dstr_stk 빈 종목 수 — ETF 수(약 1천) 근처면 정상.
   - `failed` 는 소수여야 한다.
4. 바로 뒤 `"float-sync complete"`(main) 로그와 Job 성공(exit 0).
5. **DB**: `select * from stock_float where code in ('005930','069500');` — 005930 float_shares 수십억 단위(주), 069500 float_shares null · listed_shares 채움.
6. **server**: `curl -i https://<server>/api/stocks/005930/float` → 200 `{code, floatShares, floatRate, listedShares, asOf}` + `Cache-Control: public, max-age=3600`. `curl -s https://<server>/api/stocks/float | jq '.asOf, .fields, (.rows | length)'` → asOf 오늘, fields 3개, rows 약 4천(1000 에서 잘리지 않아야 함).

## Deviations from Plan

### Auto-fixed Issues

None — 계획대로 실행.

### 기타 메모

- **[Rule 3 - 타입]** floatSync 의 스모크 표본 변수는 워커 클로저 안에서 대입되어 TS 제어 흐름 분석이 `null` 로 좁힌다 → `FloatSample` 타입 별칭으로 선언 타입 복원(동작 무관).
- Task 2 는 테스트 파일을 구현보다 먼저 썼지만 RED 실행을 따로 찍지는 않았다(구현 직후 한 번에 green). Task 3 는 RED(4 failed) → GREEN 확인.
- 실행 중 동시 세션이 master 에 3건 커밋(relay 생성물 · 진단 지식 · inbox) — 모두 명시 경로 스테이징으로 섞이지 않았다. 그래서 measured `commits` 6 중 이 plan 커밋은 3건.
- 사용자 CLAUDE.md 에 따라 커밋에 Co-Authored-By 를 넣지 않았다.

## Known Stubs

없음.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: public-endpoint | server/src/routes/stocks.ts | 인증 없는 공개 GET 2종 추가 — DB 만 읽고(키움 호출 없음) 전역 /api 레이트 리미터 + Cache-Control 1시간. 전 종목 응답 약 4천 항목(수백 KB 미만). 계획된 표면. |

## Self-Check: PASSED

- 파일 11개 모두 존재, 커밋 0bc1cfc0 · c242dc93 · bc11d0c0 모두 HEAD 조상.
