---
phase: quick-261016-miy
plan: 01
subsystem: workers/intraday-sync · supabase · ops
tags: [intraday-sync, rpc, performance, cloud-run-timeout, alerting]
status: complete
requires: [stock_quotes 테이블, intraday-sync STEP1/STEP2 파이프라인]
provides: [intraday_update_quotes_step2(jsonb) RPC, upsertQuotesStep2 단일 왕복, 완화된 실패 알림 정책]
affects: [scripts/deploy-intraday-sync.sh (알림 정책 update 대상, 미변경)]
tech-stack:
  added: []
  patterns: ["UPDATE ... FROM jsonb_to_recordset 단일문 RPC (SECURITY DEFINER · search_path=public · REVOKE PUBLIC/anon,authenticated · GRANT service_role)"]
key-files:
  created:
    - supabase/migrations/20261016150000_intraday_update_quotes_step2_rpc.sql
  modified:
    - workers/intraday-sync/src/pipeline/upsertQuotes.ts
    - workers/intraday-sync/tests/upsertQuotes.test.ts
    - ops/alert-intraday-sync-failure.yaml
decisions:
  - "upper_limit/lower_limit 는 COALESCE(r.x, q.x) — NOT NULL 컬럼에 null 하나로 배치 전체가 23502 중단되는 것을 막고, null(ka10001 값 없음)이면 STEP1 이 채운 값을 유지"
  - "upsertQuotesStep2 count 는 RPC 반환값(실제 갱신 행 수) — 없는 code 는 세지 않는다"
  - "실패 알림은 10분 ALIGN_SUM > 2 (=3건 이상) — 매분 잡의 단발 60s 타임아웃은 자가 회복"
metrics:
  duration: ~3m
  completed: 2026-10-16
actuals:
  tokens: 3800
  tasks: 2
  commits: 3
plan_head_before: 12eaf8b71a46caef877dbcc8b604a0adb7dd1f6e
plan_head_after: e44cf64f0d3533edcd0ea7502b039e652b59afc1
---

# Quick 261016-miy Plan 01: intraday-sync STEP2 quotes 단일 RPC 일괄화 + 실패 알림 완화 Summary

intraday-sync STEP2 의 종목별 직렬 UPDATE(~100건 × VPC egress 왕복 ~120ms ≈ 12s)를 `intraday_update_quotes_step2(jsonb)` 의 `UPDATE ... FROM jsonb_to_recordset` 단일문 1왕복으로 바꿨다. 실패 알림은 「10분 윈도우 실패 3건 이상」으로 완화했다.

## 마이그레이션 파일명 (실제)

`supabase/migrations/20261016150000_intraday_update_quotes_step2_rpc.sql` — 작성 시점 최신 파일 `20261010200100_dma_account_order_server.sql` 보다 늦어 계획 이름 그대로 사용. 현재 supabase/migrations 에서 가장 늦은 파일.

## 커밋

| Task | 커밋 | 내용 | 파일 |
| ---- | ---- | ---- | ---- |
| 1 RED | `37c66e94` | test(quick-261016-miy): upsertQuotesStep2 단일 RPC 계약 테스트 | workers/intraday-sync/tests/upsertQuotes.test.ts |
| 1 GREEN | `6bc8b6e9` | perf(quick-261016-miy): intraday-sync STEP2 quotes 갱신을 단일 RPC 로 일괄화 — 60s 타임아웃 실패 해소 | 마이그레이션, workers/intraday-sync/src/pipeline/upsertQuotes.ts |
| 2 | `e44cf64f` | chore(quick-261016-miy): intraday-sync 실패 알림 — 10분 윈도우 실패 3건 이상으로 완화 | ops/alert-intraday-sync-failure.yaml |

모두 경로 지정 스테이징, master, push 안 함. 동시 세션의 webapp 변경(limit-chaser-defaults 등)은 스테이징에 섞이지 않았다.

## 검증 결과

- **RED:** 테스트 교체 직후 upsertQuotes.test.ts 4개 실패(`supabase.from is not a function`) — 빈 입력 테스트만 현 구현으로도 통과(예상대로).
- **GREEN:** `pnpm --filter @gh-radar/intraday-sync exec vitest run --maxWorkers=2` — 19 파일 · 158 테스트 전부 통과.
- `pnpm --filter @gh-radar/intraday-sync typecheck` (tsc --noEmit) 통과, `build` (tsc) 통과.
- Task 1 grep 단언 전부 통과: upsertQuotes.ts 에 `.update(` · `.eq(` · 옛 「종목별 UPDATE 직렬 호출」 0건, `rpc("intraday_update_quotes_step2"` 1곳, 261001-bnc 주석 유지. 마이그레이션은 최신 파일 · 주석 외 INSERT INTO 0 · jsonb_to_recordset · SECURITY DEFINER · search_path = public · FROM anon, authenticated · TO service_role · GET DIAGNOSTICS 모두 존재.
- Task 2 ruby YAML 단언 `ok`.
- 범위: `git diff --stat 12eaf8b7..HEAD` 로 이번 커밋 3개가 files_modified 4개만 건드렸음을 확인. index.ts · task-timeout · 스케줄러 · 배포 스크립트 미변경.

### SQL 스모크 (public.ecr.aws/supabase/postgres:17.6.1.104, 컨테이너 miy-smoke — 종료 후 `docker rm -f` 로 정리 확인)

setup.sql → 마이그레이션 → assert.sql 을 `psql -v ON_ERROR_STOP=1` 로 실행, RC=0.

- ① 반환값 = 2 (A00001 · A00002 갱신, ZZZZZZ 미매칭) — OK
- ② count(*) = 2 (ZZZZZZ INSERT 없음) — OK
- ③ A00001 open/high/low/upper_limit/lower_limit/market_cap 새 값, updated_at > 2026-01-01, price/change_amount/change_rate/volume/trade_amount/rate_updated_at 불변 — OK
- ④ A00002 null 상·하한가 입력 → 1300/700 유지 — OK
- ⑤ has_function_privilege: anon=false · authenticated=false · service_role=true — OK

## 배포 순서 (오케스트레이터용 — 이 플랜에서는 미실행)

1. **마이그레이션 적용** — `supabase db push --linked --yes`. 반드시 워커보다 먼저. 워커가 먼저 나가면 RPC 가 없어 매분 STEP2 가 PGRST202 로 실패한다. db push 직후 워커가 PGRST202 를 내면 `NOTIFY pgrst, 'reload schema'` 로 스키마 캐시를 갱신한다.
2. **워커 배포** — `scripts/deploy-intraday-sync.sh` (GCP_PROJECT_ID · SUPABASE_URL · NOTIFICATION_CHANNEL_ID 필요). Section 7 이 알림 정책도 update 하므로 3단계가 같이 처리된다.
3. **알림 정책** — 2단계에서 처리되지 않았다면 `ops/alert-intraday-sync-failure.yaml` 을 `gcloud alpha monitoring policies update` 로 적용.
4. **사후 확인** — 성공 실행 소요시간 p95 가 ~12s 줄었는지, upsertQuotesStep2 단계 로그 시간이 1s 미만인지 Cloud Logging 에서 확인.

## Deviations from Plan

None — plan executed exactly as written. (마이그레이션 주석 문구만 「server/워커는」→「Cloud Run 은」으로 사실에 맞게 다듬음.)

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261016150000_intraday_update_quotes_step2_rpc.sql
- FOUND: workers/intraday-sync/src/pipeline/upsertQuotes.ts · workers/intraday-sync/tests/upsertQuotes.test.ts · ops/alert-intraday-sync-failure.yaml
- FOUND commits: 37c66e94 · 6bc8b6e9 · e44cf64f (HEAD 조상)
