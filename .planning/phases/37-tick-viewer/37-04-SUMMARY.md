---
phase: 37-tick-viewer
plan: 04
subsystem: database
tags: [supabase, postgres, pgtap, rpc, advisory-lock, rls, storage-bucket, tick-viewer]
status: complete

requires:
  - phase: 37-tick-viewer (37-01)
    provides: "저장처: supabase-storage — 비공개 버킷 tick-grid 전제"
  - phase: 34 (accum)
    provides: "limitup_accum_flow (payload.pos_net · reg_time_ms) — open 의 accum(D-09) · candidates.accum"
provides:
  - "표 tick_grids · tick_convert_requests · tick_convert_runs (RLS 켜짐 · 정책 0 · service_role 전용)"
  - "Job RPC tick_grid_upsert(모드 규칙) · tick_request_claim · tick_request_finish · tick_request_trigger_failed · tick_convert_run_record · tick_convert_runs_since · tick_convert_candidates · tick_purge_old"
  - "웹 RPC(게이트) tick_day_for_user · tick_open_for_user · tick_request_convert_for_user · tick_cancel_convert_for_user · tick_today_for_user · tick_access_for_user"
  - "내부 함수 tick_eta_s · tick_trigger_blocked · tick_upload_retry_at"
  - "비공개 버킷 tick-grid(50MB · application/zstd · to_regclass 가드)"
  - "pgTAP supabase/tests/tick_viewer.test.sql 104 단언"
affects: [37-06, 37-07, 37-08, 37-12, 37-15, 37-16, 37-18]

actuals:
  tokens: 17800
  tasks: 2
  commits: 2
plan_head_before: 056a0da278b230e9c7942cebd5f546168b004a48
plan_head_after: 788cb8c3811120c8c455751da5b75894cbcc9635

tech-stack:
  added: []
  patterns:
    - "(날짜, 거래소) 단위 pg_advisory_xact_lock(hashtextextended) 안에서 INSERT … ON CONFLICT + 조건부 UPDATE RETURNING 으로 should_trigger 원자 판정"
    - "웹 RPC 응답은 단일 출구(v_out jsonb 누적 → 마지막에 request 한 번) — 분기마다 같은 키 집합"
    - "요청 행 JSON 은 requested_by 를 내보내지 않는다(명시 키 jsonb_build_object)"

key-files:
  created:
    - supabase/migrations/20261102200000_tick_viewer.sql
    - supabase/migrations/20261102200100_tick_viewer_queue.sql
    - supabase/tests/tick_viewer.test.sql
  modified: []

key-decisions:
  - "마이그레이션 버전은 계획대로 20261102200000 · 20261102200100 — 원격 최신 20261030210000 뒤 · 동시 세션의 더 늦은 버전 없음"
  - "tick_request_convert_for_user 의 재-pending 대상에 격자 없는 done 도 넣는다(격자 있으면 grid_ready 로 먼저 빠지므로 done 인데 여기까지 온 건 격자가 사라진 경우)"
  - "tick_purge_old 의 dates = 표 셋에서 지운 날짜 합집합 — 격자 행 없이 실행 기록만 있던 날짜의 Storage 객체도 워커가 지울 수 있게"
  - "웹 RPC 응답에 eta_s 를 함께 싣는다(request_convert · open · day) — shared TickConvertResponse.eta_s? 와 맞춤"

patterns-established:
  - "틱 큐 상수: 2분(Job 기동 · claim 여유) · 25분(요청 타임아웃 1200s + 5분) · 23:30 KST(업로드 재시도) — 머리 주석이 정본"

requirements-completed: [D-02, D-03, D-04, D-08, D-09, D-15]

coverage:
  - id: D1
    description: "격자 메타 표 · 모드 규칙 upsert · 하루 목록 · 열기 RPC(게이트 · accum · stale)"
    requirement: D-04
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql (A~F 43 단언)"
        status: pass
  - id: D2
    description: "요청 변환 큐 should_trigger 원자 판정 · JOB_TIMEOUT · NOT_UPLOADED · 하루 상한 · 취소 · claim/finish · eta_s"
    requirement: D-03
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql (G~J)"
        status: pass
  - id: D3
    description: "후보(accum ∪ live16) · 오늘 목록(kind 16 ∪ +15%) · 접근 · 90일 purge"
    requirement: D-15
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql (K~M)"
        status: pass

duration: 35min
completed: 2026-11-02
---

# Phase 37 Plan 04: 틱 뷰어 DB — 격자 메타 · 요청 큐 · 게이트 RPC · 90일 purge Summary

**표 셋(tick_grids · tick_convert_requests · tick_convert_runs)과 RPC 17개를 더했다. 웹용 RPC 여섯은 첫 줄에서 `dma_visible_accounts` 로 게이트를 걸고, 요청 변환은 (날짜, 거래소) advisory 잠금 안에서 should_trigger 를 원자적으로 판정해 (날짜, 거래소)당 Job 하나만 깨운다. 25분 넘은 running 은 회수하고, 업로드 전 요청은 23:30 KST 까지 막으며, 전역 하루 상한과 모드별 덮어쓰기 규칙을 지킨다. pgTAP 104/104 통과.**

## Performance

- **Duration:** 약 35분
- **Completed:** 2026-11-02
- **Tasks:** 2/2
- **Files:** 3개 생성

## Accomplishments

- **트레이서(Task 1):** Job 이 `tick_grid_upsert` 로 쓴 행은 DMA 매핑 사용자의 `tick_day_for_user` · `tick_open_for_user` 에 보이고, 미매핑 사용자는 `{"access": false}` 만 받는다. 모드 규칙은 nightly 가 무조건 덮고, request 는 nightly 를 못 덮고, promoted 는 promoted 위에만 쓴다. 반환값은 실제로 쓴 행 수다. accum(D-09)과 stale(2분 · 25분 · 같은 (날짜, 거래소) running 차단)도 같은 RPC 에서 준다.
- **요청 큐(Task 2):** 같은 (날짜, 거래소)로 들어오는 두 번째 호출은 다른 isin 이어도 should_trigger false 를 받는다. 그 행은 pending · triggered_at NULL 로 남아 앞 Job 의 claim 에 실린다. 같은 (날짜, 거래소)에서 깨울 pending 은 한 문장으로 함께 찍는다.
- 25분 넘은 running 은 다음 요청이 failed `JOB_TIMEOUT` 으로 닫는다. finish 는 running 행만 바꾸므로 늦게 끝난 Job 이 새 요청을 덮지 않는다.
- `NOT_UPLOADED` 로 끝난 요청은 하루 상한 집계에서 빠지고, `tick_upload_retry_at`(첫 23:30 KST) 전까지 다시 와도 `{not_uploaded, retry_after}` 만 돌려준다.
- Job RPC 는 claim · finish · run_record · runs_since · candidates(accum ∪ live16) · purge(dates 반환)다. 웹 RPC 는 today(kind 16 ∪ 고가 +15% 정수 경계) · access 를 더했다.

## pgTAP 결과

`bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` 로 마이그레이션 93개를 재생한 뒤 돌렸다.

- **104/104 ok · `not ok` 0 · `# RESULT: PASS`.** Task 1 시점에는 43/43 이었다.
- 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 가 로컬에 없었다. ECR public 이 `toomanyrequests: Rate exceeded` 를 돌려줘서, 같은 태그를 Docker Hub(`supabase/postgres:17.6.1.104`, digest sha256:5deba92e…)에서 받아 러너가 기대하는 이름으로 `docker tag` 했다. 러너는 일회용 컨테이너만 쓰므로 로컬 Supabase 스택이나 다른 프로젝트 컨테이너는 건드리지 않았다.

## Task Commits

1. **Task 1 (tracer): 표 3 · upsert 모드 규칙 · 하루 목록 · 열기 RPC(게이트) · pgTAP** — `b7bd46ab` (feat)
2. **Task 2: 요청 큐 · Job RPC · 오늘 목록 · purge — should_trigger 원자 판정** — `788cb8c3` (feat)

## Files Created

- `supabase/migrations/20261102200000_tick_viewer.sql` — 표 3, tick_eta_s · tick_trigger_blocked · tick_grid_upsert · tick_day_for_user · tick_open_for_user, 버킷 tick-grid
- `supabase/migrations/20261102200100_tick_viewer_queue.sql` — tick_upload_retry_at · tick_request_convert_for_user · tick_cancel_convert_for_user · tick_request_trigger_failed · tick_request_claim · tick_request_finish · tick_convert_run_record · tick_convert_runs_since · tick_convert_candidates · tick_today_for_user · tick_access_for_user · tick_purge_old
- `supabase/tests/tick_viewer.test.sql` — pgTAP 104 단언(A 권한 · B 게이트 · C 이력 0 · D upsert/accum · E 모드 규칙 · F stale · G 큐 권한/게이트 · H should_trigger/JOB_TIMEOUT · I claim/finish/eta · J NOT_UPLOADED/상한/grid_ready/취소 · K 실행 기록/후보 · L 오늘 · M purge)

## 응답 모양 (server · Job 이 기대하는 계약)

- `tick_day_for_user` → `{access, dates, date, rows[], requests[], eta_s: {KRX, NXT}}`. rows 는 격자 열에 `code` · `name` 을 더한 것이고 object_path 는 빠진다. requests 에는 requested_by 가 없다.
- `tick_open_for_user` → `{access, date, exchange, isin, grid|null(전 열 · object_path 포함), request|null(+stale), accum|null, stock|null, eta_s}`
- `tick_request_convert_for_user` → 분기와 상관없이 키 집합이 같다: `{access, should_trigger, capped, grid_ready, not_uploaded, retry_after, eta_s, request|null}`
- `tick_cancel_convert_for_user` → `{access, cancelled, request}`
- `tick_request_claim` → isin jsonb 배열(없으면 `[]`). `tick_request_finish` · `tick_request_trigger_failed` → 바뀐 행 수
- `tick_convert_candidates` → `{accum: [...], live16: [...]}`
- `tick_today_for_user` → `{access, date, rows: [{isin, code, name, sources, rate, high_rate}]}`
- `tick_purge_old` → `{cutoff, grids, requests, runs, dates}`

## Decisions Made

- frontmatter `key-decisions` 참조. 마이그레이션 버전은 계획대로다. `ls supabase/migrations | tail` 로 더 늦은 버전이 없음을 확인했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 견고성] 재-pending 대상에 격자 없는 `done` 추가**
- **Found during:** Task 2
- **Issue:** 계획의 ON CONFLICT 갱신 조건은 `failed` · `cancelled` 만이었다. 그러면 done 인데 격자 행이 없는 키(불일치 상태)는 다시 요청해도 영영 깨어나지 않는다.
- **Fix:** 조건을 `status IN ('failed','cancelled','done')` 로 넓혔다. 격자가 있으면 (3)에서 grid_ready 로 먼저 빠지므로 정상 경로에는 영향이 없다.
- **Files modified:** supabase/migrations/20261102200100_tick_viewer_queue.sql
- **Commit:** 788cb8c3

**2. [Rule 2 - 견고성] `tick_purge_old` dates = 표 셋에서 지운 날짜 합집합**
- **Found during:** Task 2
- **Issue:** 계획 문구는 「지운 격자 날짜」였다. 그런데 업로드는 됐고 메타 upsert 만 실패한 날짜는 격자 행 없이 객체만 남는다.
- **Fix:** 격자 · 요청 · 실행 기록에서 지운 날짜를 모두 합쳐 정렬해 돌려준다. 워커가 없는 폴더를 지우려 해도 해가 없다. `p_keep_days < 1` 이면 RAISE 하도록 가드도 넣었다(0 이나 음수면 오늘 이후까지 지운다).
- **Files modified:** supabase/migrations/20261102200100_tick_viewer_queue.sql
- **Commit:** 788cb8c3

**3. [Rule 2 - 정보 노출] 요청 행 JSON 에서 requested_by 제외 · 응답 키 통일**
- **Found during:** Task 1 · 2
- **Issue:** `to_jsonb(r)` 를 쓰면 다른 사용자의 uuid 가 함께 나간다.
- **Fix:** 37-07 `TickConvertRequest` 모양에 맞춰 키를 명시했다(exchange · isin · status · 시각 넷 · error, open 에는 stale 추가). 이 사항은 pgTAP F 로 잠갔다. day 는 이력 0 이어도 같은 경로를 탄다(`date = coalesce(p_date, 최신)`). request_convert 는 분기와 상관없이 같은 키에 eta_s 를 싣는다.
- **Commit:** b7bd46ab · 788cb8c3

**4. [Rule 3 - 차단] pgTAP 이미지 준비**
- **Issue:** 러너 이미지가 로컬에 없었다(그대로 두면 exit 3). ECR public 에서 받으려 하자 rate limit 에 걸렸다.
- **Fix:** Docker Hub 에서 같은 태그를 받아 ECR 이름으로 태그했다. 저장소 파일은 바꾸지 않았다.

## Issues Encountered

- 이번 worktree 격리 쉘은 `$(...)` 나 변수 인자가 들어간 복합 명령을 거부했다. 명령을 단순하게 쪼개 우회했고 결과에는 영향이 없다.

## User Setup Required

없음. 원격 적용(`supabase db push`)은 37-16 메인 세션 몫이라 하지 않았다. git log 에 db push 흔적이 없다.

## Next Phase Readiness

- 37-06 · 37-18(Job)은 claim · finish · upsert · run_record · runs_since · candidates · purge_old 모양을 그대로 쓰면 된다.
- 37-07 · 37-15(server)는 day · open · request_convert · cancel · today · access 응답 모양을 그대로 쓰면 된다.
- 37-16 은 이 두 마이그레이션을 db push 한다. 원격에 storage 스키마가 있으므로 그때 버킷 tick-grid 가 생긴다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261102200000_tick_viewer.sql
- FOUND: supabase/migrations/20261102200100_tick_viewer_queue.sql
- FOUND: supabase/tests/tick_viewer.test.sql
- FOUND: b7bd46ab · 788cb8c3 (HEAD 조상)
- pgTAP 104/104 PASS
