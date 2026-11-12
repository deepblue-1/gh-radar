---
phase: 43-tender-offer-telegram-alert
plan: 01
subsystem: workers/dart-alert · supabase
status: complete
tags: [opendart, telegram, tracer, pgtap, supabase-rpc]
requires: []
provides:
  - 워크스페이스 @gh-radar/dart-alert (package.json · tsconfig · vitest.config)
  - src/safeError.ts (SafeErrorFields · safeErrorFields)
  - src/dart/client.ts (DartRow · DartPage · DartErrorKind · DartApiError · classifyDartStatus · createDartHttp · fetchListPage · DART_LIST_PATH · DART_PAGE_COUNT)
  - src/telegram/client.ts (createTelegramHttp · SendResult · classifyTelegramResponse · sendMessage)
  - src/watches.ts (WatchId · Watch · DEFAULT_B001_KINDS · buildWatches · ALLOWED_CORP_CLS · STOCK_CODE_RE · JudgeOptions · Verdict · judgeRow)
  - src/message.ts (htmlEscape · DART_VIEWER_URL · SOURCE_LABEL · LATE_LABEL · AlertFields · alertText)
  - src/lap.ts (LapDeps · LapLog · LapState · newLapState · InsertItem · InsertedRow · ClaimedRow · MarkInput · WatchResult · CollectResult · collectOnce · DeliverResult · deliverPending)
  - 마이그레이션 20261113200000_dart_alert.sql (표 dart_alerts · dart_alert_state · RPC 5)
  - pgTAP supabase/tests/dart_alert.test.sql (절 S · L · I · C · M · P — 94 단언)
affects: [43-02, 43-03, 43-04, 43-05, 43-06, 43-09]
tech-stack:
  added: []
  patterns:
    - "axios adapter 주입으로 진짜 클라이언트 + 가짜 전송 트레이서"
    - "RPC jsonb 키 = 컬럼 이름 = 워커 타입 키(변환 없는 결선)"
    - "임대 보유자 확인 ERRCODE 55000 → 워커가 임대 잃음으로 읽음"
key-files:
  created:
    - workers/dart-alert/package.json
    - workers/dart-alert/tsconfig.json
    - workers/dart-alert/vitest.config.ts
    - workers/dart-alert/src/safeError.ts
    - workers/dart-alert/src/dart/client.ts
    - workers/dart-alert/src/telegram/client.ts
    - workers/dart-alert/src/watches.ts
    - workers/dart-alert/src/message.ts
    - workers/dart-alert/src/lap.ts
    - workers/dart-alert/tests/tracer.test.ts
    - workers/dart-alert/tests/fixtures/dart/list-d004-000.json
    - supabase/migrations/20261113200000_dart_alert.sql
    - supabase/tests/dart_alert.test.sql
  modified:
    - pnpm-lock.yaml
decisions:
  - "DART 네트워크 오류는 fetchListPage 안에서 DartApiError(0, transient)로 바꿔 던진다 — axios 오류 객체(config.params 에 crtfc_key)가 로그로 가는 길을 원천 차단"
  - "collectOnce 는 넣기 실패를 warn(안전 필드 · calls) 뒤 다시 던진다 — 임대 잃음(55000) 판정은 수집기(43-05) 몫이고 seen 에 넣지 않아 다음 바퀴에 다시 넣는다"
  - "deliverPending 은 claim · mark 오류를 삼키지 않는다(43-06 이 LeaseLostError 밖 오류만 잡도록 넓힌다)"
  - "넣기 · 차례 · 기록의 임대 확인은 dart_alert_state 행을 FOR SHARE 로 읽어 판정 중 인계와 엇갈리지 않게 한다"
  - "dart_alert_lease_acquire 는 p_last_ok 가 객체가 아니면 22023, dart_alert_claim 은 p_limit < 1 이면 22023, dart_alert_mark 는 p_ok NULL 이면 22023"
  - "성공 기록은 claimed_by 를 남긴다(누가 보냈는지 흔적) — 실패 기록만 claimed_by 를 NULL 로"
metrics:
  duration: 11m
  completed: 2026-11-12
  tasks: 2
  files: 14
estimate:
  tokens: 60000
actuals:
  tokens: 21204
  tasks: 2
  commits: 3
plan_head_before: a1118f0ee0bcd68b1838b79c2d15a4648a2718b0
plan_head_after: a63bf024f87a3b51d1b8b43844abf8ca0c55eae0
---

# Phase 43 Plan 01: 공개매수 공시 트레이서 + 공시 알림 DB 계약 Summary

**OpenDART 공시검색 1행이 진짜 DART 클라이언트 → 거르기 → DB 넣기 → 송신 차례 → 두 줄 HTML 문구 → 진짜 텔레그램 sendMessage(가짜 전송) → 결과 기록으로 이어져 정확히 1번 나가고, 그 DB 끝(표 2 · RPC 5 · 서비스롤 전용)을 진짜 Postgres 에서 pgTAP 94단언으로 잠갔다.**

## 수행 결과

| Task | 이름 | 커밋 | 파일 |
|------|------|------|------|
| 1 | 트레이서 — 공개매수 1건 한 길 | 68773fc1 | workers/dart-alert/* 12개 · pnpm-lock.yaml |
| 2 (RED) | pgTAP 절 S · L · I · C · M · P | 0d174dd8 | supabase/tests/dart_alert.test.sql |
| 2 (GREEN) | 마이그레이션 표 2 · RPC 5 | a63bf024 | supabase/migrations/20261113200000_dart_alert.sql |

### 검증 실제 출력

- Task 1 `<verify>`: typecheck 0 오류 · `tests/tracer.test.ts (2 tests)` 2 passed · `TRACER-OK`
- 트레이서 피드백 게이트(interactive · end-of-phase · 자동 verify): 커밋 직후 같은 명령 재실행 통과 → 확장 진행
- Task 2 `<verify>`: pgTAP `1..94` · ok 94 · not ok 0 · `# RESULT: PASS` (마이그레이션 138개 재생 — 일회용 로컬 컨테이너 `public.ecr.aws/supabase/postgres:17.6.1.104`, 원격 접촉 0) → tracer 2 passed → `DB-CONTRACT-OK`
- 수용 기준 grep: 패키지 이름 1 · shared 0 · `link_preview_options` 2 · `last_reprt_at` 2 · `DEFAULT_B001_KINDS` 2 · `유무상증자결정` 1 · `dsaf001/main.do?rcpNo=` 2 · `sleep` 2 · `CREATE OR REPLACE FUNCTION public.dart_alert_` 5 · `FROM anon, authenticated` 7 · `55000` 7 · `보관` 2 · `해제 뒤 두 칸 NULL` 2

### 트레이서가 잠근 것

- D004 요청 인자: `pblntf_detail_ty "D004"` · `bgn_de` = `end_de` = 그날 · `page_count 100` · `page_no 1` · `last_reprt_at "N"` · 경로 `/api/list.json`
- 비상장(`corp_cls E` · 종목코드 빈) 행은 넣지 않음(D-05) · 새로 들어간 행 `[{rcept_no: "20261111000001", late: false}]`
- 텔레그램 POST 정확히 1번 · 경로 `/bot{token}/sendMessage` · 본문 키 정확히 `chat_id` · `text` · `parse_mode` · `link_preview_options` 넷(D-14 — 무음 인자 없음) · `parse_mode "HTML"` · `is_disabled true`
- 문구 정확히 두 줄:
  `📢 공개매수신고서 — 에스텍(069510) · 제출인 가람홀딩스`
  `<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261111000001">DART 원문</a> · 금융감독원 전자공시`
- DB 행 `sent` · message id 4242 · attempts 1 · watch `tender_offer` · priority 0 · rcept_dt `2026-11-11`
- 두 번째 바퀴 POST 0 추가 · `newLapState()` 재시작 흉내 POST 0 추가 · claim 0(SC-2)
- 장애 길(추가 단언): DART `020` → 결과 `ok:false · kind quota` · calls 1 · warn `dart list failed` / 텔레그램 네트워크 오류 → `transient:0` 으로 pending · 다음 시도 시각 미래 — 두 길 모두 로그 · 결과 · DB 행 어디에도 `TEST-DART-KEY-DO-NOT-LOG` · `TEST-BOT-TOKEN-DO-NOT-LOG` 없음

## RPC 반환 모양(43-02 `src/db.ts` · `dbContract.test.ts` 가 대조할 계약)

| RPC | 시그니처 | 반환 |
|-----|----------|------|
| `dart_alert_lease_acquire` | `(p_holder text, p_ttl_seconds integer, p_last_ok jsonb DEFAULT NULL)` | jsonb `{"held": bool, "fresh": bool, "reclaimed": 0, "expired": 0}` |
| `dart_alert_lease_release` | `(p_holder text)` | boolean |
| `dart_alert_insert` | `(p_holder text, p_items jsonb, p_seed boolean DEFAULT false)` | jsonb `[{"rcept_no", "late"}]`(rcept_no 순 · 없으면 `[]`) |
| `dart_alert_claim` | `(p_holder text, p_limit integer)` | jsonb `[{"rcept_no", "watch", "corp_cls", "corp_name", "stock_code", "report_nm", "flr_nm", "late", "attempts", "first_seen_at"}]` |
| `dart_alert_mark` | `(p_holder text, p_rcept_no text, p_ok boolean, p_message_id bigint, p_error text, p_retry_in_s integer)` | boolean |

- `p_items` 원소 키 = `InsertItem` 키 = 컬럼 이름: `rcept_no` · `watch` · `priority` · `rcept_dt`(YYYY-MM-DD) · `corp_cls` · `corp_name` · `stock_code` · `report_nm` · `flr_nm` · `late`
- 오류: 넣기 · 차례 · 기록의 임대 보유자 아님(만료 포함) → `55000` · 인자 오류 → `22023`(메시지에 holder 값 없음)
- T1 가짜 DB 대역과 T2 RPC 계약 대조(눈 확인): 이름 · 키 · 반환 모양 차이 없음 — 맞출 것 없었다

## pgTAP 단언 수

`plan(94)` — S 8 · L 23 · I 12 · C 10 · M 16 · P 25. pgTAP 미실행 아님(로컬 Docker 로 실제 실행).

## lockfile diff 요약

`pnpm install --prefer-offline` — `downloaded 0` · `added 0`. `pnpm-lock.yaml` +28줄 전부 `importers: workers/dart-alert:` 항목(kis-news-sync 와 같은 버전으로 해석: supabase-js 2.103.2 · axios 1.15.0 · dotenv 16.6.1 · pino 9.14.0 · @types/node 22.19.17 · tsx 4.21.0 · typescript 5.9.3 · vitest 3.2.4). `workers/dart-alert` 포함 줄 1 · 새 패키지 항목(`^\+  '?@?[a-z0-9./_-]+@[0-9]`) 0. 다른 importer 변경 없음.

## TDD Gate Compliance

- Task 1 은 `type="tracer"`(tdd 속성 없음)라 단일 `feat` 커밋.
- Task 2(`tdd="true"`): RED `0d174dd8 test(43-01)` → GREEN `a63bf024 feat(43-01)` 순서 지킴. REFACTOR 없음.
- RED 증거: 마이그레이션 없이 돌린 첫 실행은 S1 ~ S7 not ok 뒤 S8 의 표 참조 오류(`relation "public.dart_alert_state" does not exist`)로 psql 이 멈춰, `gsd_run check tdd-red-evidence` 가 `INVALID_RED / invalid_record`(불완전 plan · 비 TAP 줄)로 거절했다. 그래서 저장소 밖 RED 전용 뼈대(표 모양 + 반환 `{}` · NULL · false 인 동작 없는 함수 5 · 권한 · RLS 없음)를 러너의 `--with` 로 얹어 다시 돌렸다 → `1..94` 전부 실행 · 23 ok · 71 not ok · psql exit 0. 대상 `I3 같은 rcept_no 다시 넣기 → []` 실패. classifier `RED_EVIDENCE_OK / target_test_failed`(tests 94 · pass 23 · fail 71).
- semanticAssessment: 94개가 모두 실행됐고 71개가 단언으로 실패했다(구문 · 픽스처 · 적재 오류 없음). 실패 사유는 동작 부재(넣기 · 차례 · 기록 · 임대가 아무 일도 안 함, 권한 · RLS · search_path 없음). 통과 23개는 뼈대가 우연히 맞히는 것(모양 S1 ~ S8 · false 를 기대하는 단언 · 기본 grant 상 service_role true)뿐이다. 증거 기록 JSON 과 뼈대 SQL 은 저장소에 넣지 않았다(files_modified 밖).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 보안] DART 네트워크 오류를 안전한 오류로 바꿔 던짐**
- **Found during:** Task 1
- **Issue:** 응답 없는 axios 오류는 `config.params.crtfc_key` 를 품는다 — 그대로 위로 가면 로거가 키를 따라 내려갈 수 있다.
- **Fix:** `fetchListPage` 가 응답 없음을 잡아 `DartApiError(0, null, "transient", err.code)` 로 던진다. 텔레그램도 같은 이유로 throw 하지 않고 `transient`(코드 이름만)로 돌려주며, 응답 문구가 토큰을 되풀이하면 `***` 로 가린다.
- **Files modified:** workers/dart-alert/src/dart/client.ts · src/telegram/client.ts
- **Commit:** 68773fc1

**2. [Rule 2 - 정확성] RPC 인자 검증 추가**
- **Found during:** Task 2
- **Issue:** 계약 문장에 없는 잘못된 인자(`p_last_ok` 가 배열 → `||` 가 last_ok 를 배열로 바꿈 · `p_items` 비배열 · `p_limit < 1` · `p_ok NULL`)가 조용히 이상한 상태를 만든다.
- **Fix:** 각 경우 `22023` 으로 거절하고 pgTAP L22 · I12 · C10 으로 잠갔다.
- **Files modified:** supabase/migrations/20261113200000_dart_alert.sql · supabase/tests/dart_alert.test.sql
- **Commit:** 0d174dd8 · a63bf024

**3. [Rule 3 - 막힘] RED 증거 재수집**
- 위 TDD Gate Compliance 참고 — 첫 RED 가 classifier 에서 invalid_record 로 거절돼 저장소 밖 뼈대로 다시 돌렸다. 커밋된 파일에는 영향 없음.

### 계약 보강(플랜 범위 안 · 이름 추가)

- `lap.ts` 에 `LapLog` · `MarkInput` · `WatchResult` 타입 이름을 더했다(`LapDeps` 모양은 플랜 문장 그대로).
- `SendResult` 의 ok 갈래를 `messageId: number | null` 로 했다 — 응답에 message_id 가 없을 때 0 같은 가짜 값을 DB 에 적지 않기 위해(DB 칸 `telegram_message_id` 도 NULL 허용).
- 트레이서 테스트에 장애 길 `it` 하나를 더했다(DART 020 · 텔레그램 네트워크 오류에서 키 · 토큰 비노출) — 행복한 길만으로는 로그가 비어 있어 비노출 단언이 의미가 약했다.

## Known Stubs

플랜이 의도한 빈 곳(뒤 플랜이 채움 — 이 플랜 목표 달성에는 영향 없음):

| 파일 | 내용 | 채우는 플랜 |
|------|------|-------------|
| workers/dart-alert/src/watches.ts `judgeRow` | `kinds` 가 있는 감시 대상(주요사항보고서)은 지금 `{ send: false, reason: "kind" }` | 43-09 |
| workers/dart-alert/src/watches.ts `buildWatches` | 공개매수 하나만 돌려줌(`opts.b001Kinds` 미사용) | 43-09 |
| workers/dart-alert/src/message.ts `alertText` | 제출인 생략 규칙 없음(이름 있으면 항상 붙임) | 43-09 |
| workers/dart-alert/src/lap.ts `deliverPending` | 재시도 간격 고정 5초 · rate/방 이동/평문 재시도 · mark 실패 처리 없음 | 43-06 |
| migration `dart_alert_lease_acquire` | `reclaimed` · `expired` 는 항상 0 | 43-02 |

`.planning/WINDOWS.md` 에는 적지 않았다 — 위 항목은 결함이 아니라 플랜에 배정된 다음 단계이고, 이 실행은 공유 추적 파일을 건드리지 않는 조건(동시 Phase 42 세션)이다.

## Threat Flags

없음 — 새 외부 노출 표면 없음(표 · RPC 는 서비스롤 전용, 워커는 아직 진입점이 없다).

## 남은 것 · 확인 못 한 것

- 진짜 OpenDART · 텔레그램 · 원격 Supabase 는 건드리지 않았다(배포 · `db push` 는 43-08).
- tsconfig `include` 가 `src` 뿐이라 테스트 파일은 tsc typecheck 대상이 아니다(kis-news-sync 와 같은 꼴) — vitest 실행으로만 검증.

## Self-Check: PASSED

- 파일 14개 존재 확인 · 커밋 68773fc1 · 0d174dd8 · a63bf024 가 HEAD 조상 · STATE.md · ROADMAP.md 변경 없음
