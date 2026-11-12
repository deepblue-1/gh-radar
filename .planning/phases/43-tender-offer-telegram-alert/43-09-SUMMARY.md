---
phase: 43-tender-offer-telegram-alert
plan: 09
subsystem: worker
tags: [dart-alert, opendart, telegram, b001, d004, vitest, docs]
status: complete

requires:
  - phase: 43-01
    provides: "judgeRow · buildWatches · alertText · collectOnce 트레이서 · DEFAULT_B001_KINDS · LapState.nearMissLogged"
provides:
  - "주요사항보고서(B001) 감시 대상 rights_merger(priority 1) — 괄호 종류명 허용 목록 완전 일치 · 정정 스위치 · 근접 불일치"
  - "stripReportTags · isCorrection · b001Kind · KNOWN_EXCLUDED_B001_KINDS"
  - "collectOnce 근접 불일치 warn(b001 near-miss kind · 종류명마다 실행당 1번)"
  - "sameCompany · 제출인 생략 규칙 · plainAlertText · kstLabel · outageText · recoveredText · testSendText"
  - "CLAUDE.md 「공식 API 운영 기준」 OpenDART 불릿 묶음 · docs/stack.md 「Disclosure Data Sources」 절"
affects: [43-05, 43-06, 43-08]

actuals:
  tokens: 11000
  tasks: 3
  commits: 5
plan_head_before: bd680af29ad36da2f67b449aa316637556a7da9f
plan_head_after: 1310dcba2e359419a521999925ea6d39cdebc9f5

tech-stack:
  added: []
  patterns:
    - "판정은 비교용 정리본(꼬리표 뗀 이름 · 공백 제거 종류명)으로만, 표시는 DART 원문 report_nm 그대로"
    - "near_miss Verdict 가 종류명(kind)을 실어 수집기가 실행당 1번 warn 의 중복 제거 키로 쓴다"
    - "KST 시각은 +9시간 뒤 UTC 필드로 읽어 컨테이너 TZ 와 무관"

key-files:
  created:
    - workers/dart-alert/tests/watches.test.ts
    - workers/dart-alert/tests/message.test.ts
    - workers/dart-alert/tests/fixtures/dart/list-b001-000.json
  modified:
    - workers/dart-alert/src/watches.ts
    - workers/dart-alert/src/lap.ts
    - workers/dart-alert/src/message.ts
    - workers/dart-alert/tests/tracer.test.ts
    - CLAUDE.md
    - docs/stack.md

key-decisions:
  - "D-04 가 이름으로 뺀 종류(무상증자결정 등)는 KNOWN_EXCLUDED_B001_KINDS 로 근접 불일치 warn 없이 조용히 kind — 플랜 behavior 의 「무상증자결정 → kind」 와 「증자 · 합병 글자 → near_miss」 가 서로 부딪쳐서 정한 해석"
  - "괄호 꼴이 아닌 B001 이름에 증자 · 합병이 들면 꼬리표 뗀 이름 전체를 near_miss 종류명 자리에 싣는다"
  - "report_nm 이 비었거나 문자열이 아니면 invalid(두 감시 대상 공통) — 문구 조립 중 터지지 않게"
  - "plainAlertText 는 엔티티로 바꾸지 않는다(평문이라 F&F 그대로) · outageText 사유는 공백을 1칸으로 접어 한 줄"

duration: 약 30분
completed: 2026-11-12
---

# Phase 43 Plan 09: 유상증자 · 합병 감시 대상 · 알림 문구 규칙 · OpenDART 운영 기준 분류 Summary

**주요사항보고서(B001)를 괄호 종류명 허용 목록 완전 일치로 거르는 두 번째 감시 대상과 근접 불일치 warn, 제출인 생략 · 평문 · KST 장애/복구/시험 글 문구를 단위 테스트 53개로 잠갔고, OpenDART 를 CLAUDE.md 「공식 API 운영 기준」 · docs/stack.md 에 공식 API 로 분류했다.**

## 판정 순서(`judgeRow`)

1. `invalid` — 접수번호 14자리 아님 · 회사명 빔 · 보고서명 빔
2. `market` — `corp_cls` 가 Y · K 가 아니거나 종목코드가 6자리 아님(코넥스 · 비상장 · 5자리 · 7자리). 스팩(K)은 통과
3. 이름 규칙 없음(공개매수 D004 · `kinds: null`) → `send` — 정정 스위치보다 앞이라 D004 정정은 항상 보낸다(D-01)
4. `correction` — `b001Corrections: "exclude"` 이고 맨 앞에 대괄호 꼬리표가 있을 때
5. 괄호 종류명(공백 제거)이 허용 목록과 완전히 같으면 `send`
6. D-04 가 뺀 종류(`KNOWN_EXCLUDED_B001_KINDS` — 무상증자결정 · 회사분할결정 · 주식교환ㆍ이전결정 · 전환사채권발행결정 · 자기주식취득결정 · 영업양수결정) → `kind`
7. 종류명(괄호 꼴이 아니면 꼬리표 뗀 이름)에 「증자」 · 「합병」 이 들면 `near_miss`(종류명 실음)
8. 그 밖 `kind`

허용 목록 기본값 `DEFAULT_B001_KINDS` = 유상증자결정 · 유무상증자결정 · 회사합병결정 · 회사분할합병결정(43-01 값 · 이름 · 모양 그대로). `buildWatches({ b001Kinds })` 인자로 바꾸면 그 목록으로 판정한다(테스트: 「무상증자결정」 을 더하면 send).

## 근접 불일치 로그

`collectOnce` 가 `near_miss` 판정에서 `state.nearMissLogged` 에 없는 종류명만 `log.warn({ rceptNo, kind, watch }, "b001 near-miss kind")` 한다. 같은 바퀴 · 다음 바퀴에 같은 종류가 또 와도 반복하지 않고, 새 실행(`newLapState`)이면 다시 1번. 로그 키는 셋뿐(비밀 없음). 근접 불일치 행은 DB 에 넣지 않는다.

## 문구 표본

- 공개매수(트레이서 불변): `📢 공개매수신고서 — 에스텍(069510) · 제출인 가람홀딩스` / `<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261111000001">DART 원문</a> · 금융감독원 전자공시`
- 유상증자(제출인 = 회사 자신 → 생략): `📢 주요사항보고서(유상증자결정) — 가온전자(100001)` / 링크 줄 동일
- 제출인이 다른 회사: `… — 가온전자(100001) · 제출인 다온홀딩스`
- 늦은 알림: `📢 (늦은 알림) 주요사항보고서(유상증자결정) — 가온전자(100001)`
- 이스케이프: `F&F` → `F&amp;F` · 평문(`plainAlertText`)은 `F&F` 그대로 + 둘째 줄 `DART 원문 https://dart.fss.or.kr/dsaf001/main.do?rcpNo=… · 금융감독원 전자공시`
- 장애: `⚠ 공시 알림이 멈췄습니다 — 10:05 부터 DART 조회 실패(하루 조회 한도 초과). 복구되면 알려 드립니다.`
- 복구(같은 KST 날): `✅ 공시 알림 다시 동작 — 10:05 ~ 11:12 사이 공시는 「(늦은 알림)」 으로 보냅니다.`
- 복구(날 바뀜): `✅ 공시 알림 다시 동작(11/10 19:30 부터 멈춤) — 오늘 접수된 공시는 「(늦은 알림)」 으로 보냅니다.`
- 시험: `🔔 공시 알림 시험 — 공개매수 · 유상증자 · 합병 공시를 이 방으로 보냅니다` / `10:05 KST · 금융감독원 전자공시`

## 하루 호출 수(감시 대상 2개 기준)

코드로 계산: `plannedDailyCalls(buildWatches(...).length)` = 5,400바퀴 × 2 = **10,800회/일** — OpenDART 공식 한도 20,000 의 54.0% · 설계 예산 15,000 의 72.0%(43-03 `cadence.test.ts` 의 10,800 단언과 같다).

## 문서 블록 위치

- `CLAUDE.md` 41행 절 제목 「공식 API 운영 기준 (Naver Search API · OpenDART 등)」 · 47 ~ 50행 OpenDART 불릿 넷(한도 · 카운터 `opendart_list` · `opendart_list_quota_strike` / 소비처 / 예산 15,000 · 설계 10,800(54%) / 주기) · 원칙 4번에 「· dart-alert 는」. `GSD:stack-start` · `GSD:stack-end` 표시 줄은 그대로. 기존 Naver 줄 · 다른 절은 손대지 않았다(diff +6 −2).
- `docs/stack.md` 39행 「### Disclosure Data Sources」(표 · 유형 코드 · 바퀴당 2회 근거 · 정렬 · 접수 시각 · 제출 가능 시간 · 대안 기각 3건) · 166 ~ 167행 출처 링크(OpenDART 개발가이드 · Telegram Bot API). 운영 수치는 CLAUDE.md 를 정본으로 가리키고 공식 한도만 적었다.

## Task Commits

1. **Task 1 — B001 감시 대상 · 판정 · 근접 불일치**
   - RED `e8da0778` — `test(43-09): 주요사항보고서 감시 대상 판정 전수 테스트 (RED)`
   - GREEN `8320d4da` — `feat(43-09): 유상증자 · 합병 주요사항보고서 감시 대상 · 괄호 종류명 판정 · 근접 불일치 warn (GREEN)`
2. **Task 2 — 문구 규칙 전부**
   - RED `020057f6` — `test(43-09): 알림 문구 규칙 전수 테스트 (RED)`
   - GREEN `3142f2c3` — `feat(43-09): 제출인 생략 · 평문 · KST 시각 · 장애 글 2종 · 시험 글 문구 (GREEN)`
3. **Task 3 — 문서** `1310dcba` — `docs(43-09): OpenDART 를 공식 API 운영 기준에 분류 · stack Disclosure Data Sources 절`

## TDD Gate Compliance

- Task 1: RED `e8da0778` → GREEN `8320d4da`.
  - RED 증거: `pnpm exec vitest run tests/watches.test.ts --maxWorkers=2 --testTimeout=5000 --reporter=junit` JUnit XML → `gsd_run check tdd-red-evidence` = `RED_EVIDENCE_OK`(reason `target_test_failed` · 34 tests · 10 pass · 24 fail).
  - 의미 판정: 대상 테스트 「buildWatches — 두 감시 대상 > … 둘을 돌려준다」 가 `expected [ … ] to have a length of 2 but got 1` 단언으로 실패 — 43-01 상태 그대로의 buildWatches 가 원인이라 계획한 이유다. 다른 실패 일부는 두 번째 감시 대상이 없어 생긴 `TypeError(reading 'kinds')` 로 테스트 본문 안 실패(로드 실패 아님). 통과 10건은 이미 있던 공개매수 무필터 · 시장 거르기 동작.
- Task 2: RED `020057f6` → GREEN `3142f2c3`.
  - RED 증거: `pnpm exec vitest run tests/message.test.ts --maxWorkers=2 --testTimeout=5000 --reporter=junit` → `RED_EVIDENCE_OK`(reason `target_test_failed` · 19 tests · 6 pass · 13 fail).
  - 의미 판정: 대상 「alertText > 주요사항보고서 · 제출인이 회사 자신이면 생략」 이 43-01 alertText 가 「· 제출인 가온전자」 를 붙여 `toBe` 단언 실패 — 계획한 이유.
- 임시 골격(새 함수 이름만 있는 빈 반환)은 RED 실행에만 쓰고 커밋 전에 되돌렸다 — RED 커밋은 테스트 · 픽스처뿐. 모든 테스트 실행에 `--testTimeout=5000` 과 perl alarm 상한. RED 증거는 gitignore 된 `.gsd/red-43-09/`.

## 검증 결과

- `workers/dart-alert` 전체: **10 files · 225 tests 모두 통과**(기존 8 files · 172 + watches 34 + message 19).
- 플랜 verify: watches · tracer · message 3파일 55 tests 통과 · `tsc --noEmit` 0 오류 · Task 3 `DOCS-OK`.
- 수용 기준 grep: `회사분할합병결정` 1 · `"B001"` 2 · `"D004"` 2 · `export function b001Kind` 1 · `b001 near-miss kind`(lap.ts) 2 · watches 테스트 `it(` 줄 18(+ `it.each` 3개로 실제 34케이스) · message 테스트 `it(` 19 · 「공시 알림이 멈췄습니다」 2 · 「다시 동작」 2 · 「공시 알림 시험」 1 · `export function plainAlertText` 1 · CLAUDE.md OpenDART 5 · stack.md OpenDART 3 · `naver_search_news` 1 · GSD 표시 줄 각 1 · 붙은 물결표 dart 줄 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 플랜 behavior 안의 충돌 — 「무상증자결정」 판정**
- **Found during:** Task 1
- **Issue:** behavior 는 「주요사항보고서(무상증자결정) → kind」 와 「목록 밖인데 증자 · 합병이 든 이름 → near_miss」 를 함께 요구하는데, 무상증자결정은 「증자」 를 품어 두 규칙이 부딪친다.
- **Fix:** D-04 가 이름으로 뺀 종류를 `KNOWN_EXCLUDED_B001_KINDS` 상수로 두고 near_miss 검사 전에 조용히 `kind` 로 판정. 허용 목록 검사가 먼저라 사용자가 목록에 더하면 그대로 send.
- **Files modified:** `workers/dart-alert/src/watches.ts` · `tests/watches.test.ts`
- **Commit:** `8320d4da`

**2. [Rule 3 - Blocking] 트레이서 020 길의 호출 수 단언(files_modified 밖 `tests/tracer.test.ts`)**
- **Found during:** Task 1 GREEN
- **Issue:** 43-01 트레이서 「장애 길」 이 `c.calls === 1` 을 단언했는데, B001 감시 대상이 더해져 한 바퀴가 D004 실패 1회 + B001 `013` 1회 = 2회가 된다(플랜은 「송신 1번 그대로」 만 내다봤다).
- **Fix:** 단언을 `2` 로, `c.calls === dart.requests.length` 와 B001 결과 `ok` 를 같이 확인하도록 바꿨다. 송신 · 비밀 누출 단언은 그대로.
- **Files modified:** `workers/dart-alert/tests/tracer.test.ts`
- **Commit:** `8320d4da`

**3. [Rule 2 - Missing critical] 보고서명 빈 값 → invalid**
- **Found during:** Task 1
- **Issue:** `report_nm` 이 비었거나 문자열이 아니면 문구 조립 · 판정에서 터질 수 있다.
- **Fix:** 두 감시 대상 공통으로 `invalid` 판정(테스트 포함).
- **Commit:** `8320d4da`

## 확인하지 못한 것

- 픽스처 보고서명은 OpenDART 문서 · 공개 사례 표기를 따른 것이다 — 실제 B001 괄호 종류명 표기(가운뎃점 「ㆍ」 · 꼬리표 뒤 공백 등)는 43-08 survey 결과로 대조해야 한다(테스트 파일 머리 주석에 메모).
- 실제 OpenDART · 텔레그램 호출은 하지 않았다(모든 HTTP 는 가짜 전송). 텔레그램이 HTML 엔티티 · 평문 재송신을 실제로 받는지는 배포 뒤 시험 글로 확인.

## Next Phase Readiness

- 43-05 `buildDeps` 는 `buildWatches({ b001Kinds: cfg.b001Kinds })` 로 두 감시 대상을 받고 `testSendText` 를 쓴다. 43-06 은 `outageText` · `recoveredText` · `plainAlertText` 를 쓴다.
- `DEFAULT_B001_KINDS` · `JudgeOptions` 의 이름 · 값 · 모양은 바꾸지 않았다(43-03 결합 유지). `Verdict` 에는 near_miss 변형에 `kind` 가 더해졌다.

## Self-Check: PASSED

- 파일: watches.ts · lap.ts · message.ts · watches.test.ts · message.test.ts · list-b001-000.json · CLAUDE.md · docs/stack.md 모두 존재.
- 커밋: `e8da0778` · `8320d4da` · `020057f6` · `3142f2c3` · `1310dcba` 모두 HEAD 의 조상(`git rev-list --count bd680af2..HEAD` = 5).
