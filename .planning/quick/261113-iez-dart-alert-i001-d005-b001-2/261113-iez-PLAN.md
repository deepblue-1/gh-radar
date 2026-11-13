---
phase: quick-261113-iez
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — 감시 대상 4개 · 종류별 판정 · 시각 칸 조회(tracer: I001 한 길)
  - workers/dart-alert/src/watches.ts
  - workers/dart-alert/src/cadence.ts
  - workers/dart-alert/src/lap.ts
  - workers/dart-alert/src/collector.ts
  - workers/dart-alert/tests/helpers/fakes.ts
  - workers/dart-alert/tests/watches.test.ts
  - workers/dart-alert/tests/modes.test.ts
  - workers/dart-alert/tests/tracer.test.ts
  - workers/dart-alert/tests/watchMix.test.ts
  # Task 2 — 섞인 간격의 늦은 알림 · 장애 판정 · 예산 계산 · 표시
  - workers/dart-alert/src/message.ts
  - workers/dart-alert/tests/cadence.test.ts
  - workers/dart-alert/tests/collector.test.ts
  - workers/dart-alert/tests/message.test.ts
  # Task 3 — 운영 문서 · 스크립트 · 설정 주석
  - workers/dart-alert/src/config.ts
  - CLAUDE.md
  - docs/stack.md
  - scripts/deploy-dart-alert.sh
  - scripts/dart-alert-report.sh
autonomous: true
requirements: ["261113-iez"]

estimate:
  tokens: 130000
  raw_tokens: 130000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "거래소 수시공시(I001)는 원본 중 최대주주변경 · 최대주주변경을수반하는주식양수도계약체결 · 경영권변경등에관한계약체결 · 단일판매ㆍ공급계약체결 · 주식소각결정(이름 끝 괄호 꼬리 · 「(자율공시)」 를 뗀 뒤 완전 일치)과 투자판단관련주요경영사항(접두 일치 · 괄호 변형 포함)만 보낸다 (사용자 결정 ①)"
    - "I001 의 최대주주변경을수반하는주식담보제공계약체결 · …해제ㆍ취소등 · 「주요사항보고서(…)(…)」 꼴 이름 · 거래소판 회사합병결정 · 유상증자결정은 보내지 않고, I001 어떤 이름도 근접 불일치 warn(`b001 near-miss kind`)을 내지 않는다 (사용자 결정 ① · 같이 볼 것)"
    - "임원ㆍ주요주주 거래계획(D005)은 거래계획보고서 · 거래계획철회보고서 원본을 보내고 첫 줄에 제출인(임원 · 주요주주)을 늘 붙인다 (사용자 결정 ② · D-07 첫 줄 형식)"
    - "주요사항보고서(B001)에 자기주식취득결정 · 주식교환ㆍ이전결정이 더해지고 이 두 종류는 정정(맨 앞 대괄호 꼬리표)을 b001Corrections=include 여도 보내지 않는다 — 기존 4종 · 공개매수(D004)는 지금처럼 정정 포함 (사용자 결정 ③ · 정정 규칙 · D-01)"
    - "바퀴 간격은 그대로(평일 07:00 ~ 09:00 5초 · 09:00 ~ 20:00 10초 · D-10)이고 D004 · B001 은 매 바퀴, I001 은 07:00 기준 30초 칸마다 1번 · D005 는 60초 칸마다 1번 조회한다 — 07:00 ~ 09:00 5초 구간에서도 30초 · 60초 간격이다"
    - "평일 하루 예상 호출 = 5,400 × 2 + 1,560 + 780 = 13,140 이고, I001 이 매 조회 2쪽을 읽는 최악에도 14,700 ≤ 15,000 이다(공식 API 운영 기준 ① · 예산 15,000)"
    - "정상 30초 · 60초 조회에서는 「(늦은 알림)」 이 붙지 않는다(늦음 기준 = 60초 + 그 감시 대상 조회 간격) · D004 · B001 의 60초 기준은 그대로 · 수집기가 비어 있던 경우만 늦음 (D-12)"
    - "I001 처럼 띄엄띄엄 도는 감시 대상이 계속 실패하면 5분 뒤 장애를 한 번 열고, 그 대상이 다시 성공한 바퀴에만 닫는다 — 그 사이 다른 대상만 도는 바퀴가 장애를 닫지 않아 「멈췄습니다」 · 「다시 동작」 이 되풀이되지 않는다 (D-16 · D-17)"
    - "알림 첫 줄은 「📢 보고서 이름 — 회사(종목코드)」 그대로이고 보고서 이름 안 연속 공백은 1칸으로 보인다 · 시장 거르기(D-05)는 네 감시 대상 공통"
    - "DB 마이그레이션은 없다 — dart_alerts.watch 는 CHECK 없는 text · priority 는 범위 CHECK 없는 smallint · last_ok 는 jsonb 병합이라 새 감시 대상 id 가 그대로 들어간다"
  artifacts:
    - path: "workers/dart-alert/src/watches.ts"
      provides: "WatchId 4종 · NameRule(any · b001 · plain) · buildWatches 4개 · judgeRow 종류별 정정 · plainKind"
      contains: "exchange_disclosure"
    - path: "workers/dart-alert/src/cadence.ts"
      provides: "EXCHANGE_POLL_MS · TRADE_PLAN_POLL_MS · pollSlot · lateGapMs · plannedDailyPolls · plannedDailyCalls(감시 대상 배열)"
      contains: "pollSlot"
    - path: "workers/dart-alert/src/collector.ts"
      provides: "감시 대상별 조회 칸 기억(polledSlot) · 감시 대상별 늦음 기준 · 마지막 조회 실패 감시 대상 집합(failing) · WATCH_LABEL 4종"
      contains: "insider_trade_plan"
    - path: "workers/dart-alert/tests/watchMix.test.ts"
      provides: "네 감시 대상 섞인 간격의 끝에서 끝 시험(I001 한 길 · 간격 · 늦음 · 장애 짝 글)"
  key_links:
    - from: "collector.ts lap() · seedLap()"
      to: "lap.ts collectOnce opts.isDue → cadence.ts pollSlot"
      via: "바퀴 시작 시각의 칸 번호가 지난 조회 칸과 다를 때만 그 감시 대상을 부른다"
      pattern: "isDue"
    - from: "collector.ts isLate"
      to: "cadence.ts lateGapMs(watch.everyMs)"
      via: "isLateAt(now, cover, gap)"
      pattern: "lateGapMs"
    - from: "collector.ts judgeOutage"
      to: "failing 집합(takeResult 가 채움)"
      via: "모든 감시 대상의 마지막 조회가 성공일 때만 closeOutage"
      pattern: "failing"
    - from: "lap.ts deliverPending"
      to: "watches.ts insider_trade_plan alwaysShowFiler: true"
      via: "deps.watches.find(row.watch) → alertText 제출인"
      pattern: "alwaysShowFiler"
---

<objective>
운영 중인 공시 알림 워커(`workers/dart-alert`)에 감시 대상을 넓힌다 — 거래소 수시공시 `I001`(최대주주변경 등 6종) · 임원ㆍ주요주주 거래계획 `D005`(2종)를 새 감시 대상으로 더하고, 기존 주요사항보고서 `B001` 허용 목록에 자기주식취득결정 · 주식교환ㆍ이전결정을 더한다. 정정 포함 여부를 종류별로 가르고(새 종류는 원본만), 새 대상은 바퀴마다가 아니라 30초 · 60초마다 불러 하루 호출을 예산 15,000 안(설계 13,140)에 둔다.

Purpose: 트레이더가 경영권 · 최대주주 변경, 대형 공급계약, 소각, 임원 매매 계획 공시를 접수 직후 단체방에서 받는다. 기존 공개매수 · 증자 · 합병 알림의 간격 · 정정 동작 · 장애 판정은 그대로 둔다.

Output: 감시 대상 4개 · 종류별 판정 · 시각 칸 조회 · 감시 대상별 늦음 기준 · 띄엄 조회에 안전한 장애 판정 · 갱신된 예산 계산과 테스트 · 운영 문서.

사용자 결정(2026-11-13 · 다시 묻지 않음) 출처는 이 계획의 `<user_decisions>` 블록이다. Phase 43 결정(D-01 공개매수 전부 · D-05 시장 · D-07 두 줄 · D-10 바퀴 간격 · D-12 늦은 알림 · D-16/D-17 장애)은 그대로 지킨다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@workers/dart-alert/src/watches.ts
@workers/dart-alert/src/cadence.ts
@workers/dart-alert/src/lap.ts
@workers/dart-alert/src/message.ts
@workers/dart-alert/src/config.ts
@.planning/phases/43-tender-offer-telegram-alert/43-CONTEXT.md

collector.ts(983줄)는 통째로 읽지 말고 필요한 곳만 연다 — 머리 주석 1 ~ 80 · `WATCH_LABEL` 214 · 클래스 필드 220 ~ 250 · `seedLap` 371 · `loadLastOk` 458 · `lap` 484 ~ 507 · `isLate` · `takeResult` 533 ~ 541 · `startupCheck` · `coverOf` · `judgeOutage` 600 ~ 651 · `countedList` 831.
dart/client.ts 의 `fetchWatchRows` · `PageTracker` · `FULL_REREAD_MS`(60초)는 읽기만 — 바꾸지 않는다(추가 쪽 규칙이 예산 추정의 근거).
index.ts 는 바꾸지 않는다 — `buildWatches({ b001Kinds })` · 감시 대상 id 별 `PageTracker` Map 이 새 id 를 그대로 받는다.

<user_decisions>
① I001 보낼 이름: 최대주주변경 · 최대주주변경을수반하는주식양수도계약체결 · 경영권변경등에관한계약체결 · 단일판매ㆍ공급계약체결 · 주식소각결정 · 투자판단관련주요경영사항(뒤 괄호 꼬리 변형 포함). 이름 끝 괄호 꼬리 · 「(자율공시)」 는 같은 종류. 접두 규칙은 투자판단에만 — 나머지는 괄호 꼬리 뗀 뒤 완전 일치. 넣지 않음: 최대주주변경을수반하는주식담보제공계약체결 · …해제ㆍ취소등 · I001 안의 「주요사항보고서(…)」 꼴 · 거래소판 회사합병결정 · 유상증자결정(B001 과 중복).
② D005: 임원ㆍ주요주주특정증권등거래계획보고서 · 임원ㆍ주요주주특정증권등거래계획철회보고서 둘 다.
③ B001 허용 목록에 자기주식취득결정 · 주식교환ㆍ이전결정 추가(KNOWN_EXCLUDED_B001_KINDS 에서 빼기). 자기주식취득신탁계약체결결정 등은 넣지 않음.
정정: 새 종류(I001 전부 · D005 전부 · B001 새 2종)는 원본만 — 맨 앞 대괄호 꼬리표([기재정정] · [첨부정정] · [첨부추가] 등) 붙은 건 안 보냄. D004 · B001 기존 4종은 지금처럼(b001Corrections 기본 include).
간격: D004 · B001 그대로 · I001 30초 · D005 60초. 예산 15,000 을 넘을 위험이면 멈추고 보고(간격 임의 변경 금지).
같이 볼 것: OUTAGE_AFTER_MS · lastOk · LATE_GAP_MS · coverPointMs 가 30초 · 60초 대상에서 오탐하지 않게 · priority 공개매수 0 · 기존 B001 1 · 그 뒤 새 대상 · 첫 줄 형식 유지 · D005 제출인 판단 · D-05 그대로 · NEAR_MISS_RE 는 B001 전용 · WATCH_LABEL 추가 · 운영 수치 by_watch · report stats 표기 · 문서 갱신.
</user_decisions>

<design>
플래너가 정한 설계(실행자는 이대로 구현한다).

간격 구현 — 시각 칸(slot) 방식: `pollSlot(nowMs, everyMs)` = `everyMs` 가 null 이면 null(매 바퀴), 아니면 `Math.floor((nowMs - windowStartMs(nowMs)) / everyMs)` — 그날 07:00 부터의 칸 번호. 수집기는 감시 대상별로 마지막으로 부른 칸 번호를 기억하고, **바퀴 시작 시각**의 칸 번호가 다를 때만 그 감시 대상을 부른다(성공 · 실패와 무관하게 부른 칸을 기록 — 실패해도 같은 칸 안에서 다시 두드리지 않는다). 칸 경계(30초 · 60초)는 5초 · 10초 바퀴의 배수이고 09:00 경계(7,200초)도 나누어떨어져, 5초 구간에서도 정확히 30초 · 60초 간격이다. 「바퀴 N번에 1번」 은 바퀴가 늦게 끝나 시작이 밀리면 간격이 늘어나고 구간마다 N 이 달라서 쓰지 않는다. 밀린 칸을 몰아서 부르지 않는다(칸을 건너뛰면 한 번만). 실행이 바뀌면(인계 · 재시작) 기억이 비어 첫 바퀴에 전부 부른다.

예산 — 평일 하루(07:00 ~ 20:00 = 46,800초): D004 5,400 + B001 5,400 + I001 46,800 ÷ 30 = 1,560 + D005 46,800 ÷ 60 = 780 = 13,140(공식 20,000 의 66% · 예산 15,000 의 88%). 사용자 추정 1,800 · 900 은 반올림 상한이고 실제 칸 수는 1,560 · 780 이다. I001 추가 쪽: `fetchWatchRows` 는 total_count 가 100 을 넘으면 「늘었거나 마지막 전체 읽기에서 60초 지났을 때」 만 2쪽을 읽는다 — 30초 조회면 대략 1분에 1번 + 새 건이 늘 때마다 1번. I001 이 평일 120 ~ 130건이라 100 을 넘는 시각이 10:00 ~ 14:00 사이면 추가 약 400 ~ 800(→ 하루 약 13,500 ~ 13,950 · 공식의 68 ~ 70%). 최악(하루 내내 100 초과 · 매 조회 2쪽 · 200건 이하) = +1,560 → 14,700 ≤ 15,000. 운영 도구(survey 최대 약 70 · 배포 스모크 probe 1)를 더해도 14,771. 남는 위험: B001 도 100건을 넘는 날은 B001 추가 쪽(대략 1분에 1번 · 최대 약 780)이 겹친다 — 그래도 현실 추정 약 14,700 안팎이고, 넘으면 기존 예산 가드가 그 실행을 `budget_exhausted` 로 멈춘다(15,000 을 넘겨 부르지 않음). 그래서 계획을 멈추지 않는다. 참고: 기존 80% 경고(12,000 · warn 등급 · 메일 없음)가 이제 평일마다 저녁 무렵 한 번 찍힌다 — 이번 계획에서는 바꾸지 않고 요약에 적는다.

판정 규칙 모양 — `Watch.kinds` 를 `Watch.rule: NameRule` 로 바꾼다. NameRule 은 세 꼴의 합 타입:
- `{ form: "any" }` — D004 공개매수. 이름으로 거르지 않고 정정도 보낸다(D-01).
- `{ form: "b001"; kinds: readonly string[]; originalOnly: ReadonlySet<string> }` — 「주요사항보고서(종류)」 괄호 안 종류명 완전 일치(env `DART_ALERT_B001_KINDS` 로 바꿀 수 있는 목록). 정정은 `opts.b001Corrections` 를 따르되 `originalOnly` 종류(자기주식취득결정 · 주식교환ㆍ이전결정)는 늘 원본만. 근접 불일치 warn 은 이 꼴에만.
- `{ form: "plain"; exact: readonly string[]; prefix: readonly string[] }` — I001 · D005. 이름 끝 괄호 꼬리를 뗀 이름(`plainKind`)이 `exact` 와 완전 일치하거나 `prefix` 로 시작하면 보낸다. 정정은 전부 보내지 않는다. 근접 불일치 warn 없음(I001 비대상 이름 93종이 warn 을 쏟지 않게).
`plainKind(name)` = `stripReportTags(name)` → 첫 「(」 앞까지 → 공백 전부 제거. 「투자판단관련주요경영사항              (최대주주 보유주식 가압류)」 → 「투자판단관련주요경영사항」, 「주요사항보고서(자기주식취득신탁계약체결결정)(자회사의 주요경영사항)」 → 「주요사항보고서」(목록 밖 → 안 보냄), 「최대주주변경을수반하는주식담보제공계약체결」 → 그대로(「최대주주변경」 과 완전 일치가 아님 → 안 보냄).

감시 대상 id · 순서 · 우선순위:
- `tender_offer` D004 · priority 0 · 매 바퀴 · any · 제출인 항상.
- `rights_merger` B001 · priority 1 · 매 바퀴 · b001 · 제출인 생략(회사 자신일 때). id 는 이제 자기주식 · 주식교환도 담지만 **바꾸지 않는다** — DB `dart_alerts.watch` · `last_ok` 키 · 운영 수치 `by_watch` 연속성.
- `exchange_disclosure` I001 · priority 2 · 30초 · plain · 제출인 생략(회사가 내는 거래소 공시 — 회사와 다르면 기존 sameCompany 규칙이 붙인다).
- `insider_trade_plan` D005 · priority 3 · 60초 · plain · **제출인 항상**(alwaysShowFiler true) — 거래계획보고서는 회사가 아니라 임원 · 주요주주가 내고 「누가 사고팔 계획인가」 가 알림의 핵심이다. 목록의 회사 · 종목코드는 발행회사라 제출인을 빼면 주체가 사라진다.
우선순위 근거: 공개매수 0 · 기존 B001 1 은 결정대로. I001(최대주주 · 경영권 변경 · 공급계약 · 소각)은 즉시 가격에 반영되는 장중 공시라 2. D005 는 매매를 미리 알리는 사전 공시(실제 매매는 나중)라 같은 순간 몰릴 때 가장 뒤 3. 송신 순서는 DB 차례 `priority → first_seen_at` 그대로.

늦은 알림(D-12) — 기준점 방식은 그대로 두고 감시 대상별 늦음 간격만 넓힌다: `lateGapMs(everyMs)` = `LATE_GAP_MS + (everyMs ?? 0)` → D004 · B001 60초(지금과 같음) · I001 90초 · D005 120초. 60초 대상을 60초 기준으로 재면 바퀴가 0.5초만 밀려도 늦음이 되기 때문(정상 조회 간격 자체가 60초). 송신 지연 늦음(`deliverPending` 의 처음 본 뒤 60초)은 조회 간격과 무관해 그대로.

장애 판정(D-16 · D-17) — 지금 `judgeOutage` 는 「이 바퀴에 실패가 없으면 닫기」 라, 띄엄 조회 대상(I001)이 실패 중일 때 그 대상을 부르지 않는 바퀴(D004 · B001 만)가 장애를 닫고 다음 I001 실패에 곧바로 다시 연다(30초마다 짝 글 반복). 수집기에 「마지막 조회가 실패한 감시 대상」 집합 `failing` 을 두고 `takeResult` 가 결과마다 성공이면 빼고 실패면 넣는다. 닫기는 이 바퀴 실패 0 **그리고** `failing` 이 빌 때만. 열기 규칙(이 바퀴 실패 중 기준점에서 5분 넘은 것)과 `OUTAGE_AFTER_MS` 300초 · `startupCheck` 는 그대로 — 5분이면 I001 10번 · D005 5번 실패라 오탐이 없다.

표시 — 첫 줄 형식은 그대로, `report_nm` 의 연속 공백만 1칸으로(「투자판단관련주요경영사항              (…)」 이 잠금화면 미리보기 첫 줄을 밀어내지 않게 · D-07 「핵심이 미리보기에 보여야」). 글자는 바꾸지 않고 DB 에는 원문 그대로 둔다.

DB — 마이그레이션 없음(확인 완료): `supabase/migrations/20261113200000_dart_alert.sql` 62행 `watch text NOT NULL`(CHECK 없음) · 63행 `priority smallint NOT NULL DEFAULT 1`(범위 CHECK 없음) · 97행 `last_ok jsonb` · 149행 `last_ok || p_last_ok` 병합(키 검사 없음) · 536행 `by_watch` 는 `watch` 별 count 라 새 id 가 그대로 나온다. 20261113400000 수정본은 이 칸들을 건드리지 않는다. 운영 보고 스크립트는 `watchLabel` 지도만 넓힌다(Task 3).
</design>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: [tracer] 거래소 수시공시(I001) 한 길 — 종류별 판정 → 30초 칸 조회 → 넣기 → 단체방 첫 줄 (감시 대상 4개 · 판정 규칙 전부 포함)</name>
  <files>workers/dart-alert/src/watches.ts, workers/dart-alert/src/cadence.ts, workers/dart-alert/src/lap.ts, workers/dart-alert/src/collector.ts, workers/dart-alert/tests/helpers/fakes.ts, workers/dart-alert/tests/watches.test.ts, workers/dart-alert/tests/modes.test.ts, workers/dart-alert/tests/tracer.test.ts, workers/dart-alert/tests/watchMix.test.ts</files>
  <behavior>
    RED 먼저 — 아래 시험을 쓰고 실패를 확인한 뒤 구현한다.
    watches.test.ts(판정 표 · 사용자 결정 ① ② ③ · 정정 규칙):
    - buildWatches(DEFAULT_B001_KINDS) 는 4개를 이 순서로: tender_offer(D004 · p0 · everyMs null · rule any · 제출인 항상) · rights_merger(B001 · p1 · null · rule b001 · kinds 6종 · originalOnly 2종 · 제출인 생략) · exchange_disclosure(I001 · p2 · 30,000 · plain) · insider_trade_plan(D005 · p3 · 60,000 · plain · 제출인 항상).
    - DEFAULT_B001_KINDS = 유상증자결정 · 유무상증자결정 · 회사합병결정 · 회사분할합병결정 · 자기주식취득결정 · 주식교환ㆍ이전결정(이 순서 6종).
    - I001 send(Y · K · 6자리 종목코드 행): 최대주주변경 · 최대주주변경을수반하는주식양수도계약체결 · 경영권변경등에관한계약체결 · 단일판매ㆍ공급계약체결 · 단일판매ㆍ공급계약체결(자율공시) · 주식소각결정 · 투자판단관련주요경영사항 · 「투자판단관련주요경영사항              (최대주주 보유주식 가압류)」(공백 14칸 그대로) · 투자판단관련주요경영사항(임상시험계획변경승인신청).
    - I001 kind(보내지 않음 · near_miss 아님): 최대주주변경을수반하는주식담보제공계약체결 · 최대주주변경을수반하는주식담보제공계약해제ㆍ취소등 · 주요사항보고서(자기주식취득신탁계약체결결정)(자회사의 주요경영사항) · 회사합병결정 · 유상증자결정 · 「소송등의판결ㆍ결정 ((경영권분쟁소송)…)」.
    - I001 correction — b001Corrections include 와 exclude 둘 다에서: [기재정정]최대주주변경을수반하는주식양수도계약체결 · [첨부추가]최대주주변경 · [첨부정정]단일판매ㆍ공급계약체결(자율공시).
    - D005 send: 임원ㆍ주요주주특정증권등거래계획보고서 · 임원ㆍ주요주주특정증권등거래계획철회보고서 · correction: [기재정정]임원ㆍ주요주주특정증권등거래계획보고서 · kind: 임원ㆍ주요주주특정증권등소유상황보고서.
    - B001 새 종류: 주요사항보고서(자기주식취득결정) · 주요사항보고서(주식교환ㆍ이전결정) → send · [기재정정]주요사항보고서(자기주식취득결정) → correction(include 인데도) · [기재정정]주요사항보고서(유상증자결정) → send(include · 기존 그대로) · 주요사항보고서(자기주식취득신탁계약체결결정) → kind(near_miss 아님).
    - 시장(D-05): I001 · D005 의 코넥스(N) · 비상장(E) 행 → market.
    - plainKind: 위 세 예시(투자판단 긴 공백 · 주요사항보고서 두 괄호 · 담보제공) 값.
    watchMix.test.ts(새 파일 · 끝에서 끝 · makeHarness 에 watches = buildWatches(DEFAULT_B001_KINDS) 4개):
    - 월 07:00:00 시작 · 07:02:05 쯤 abortAt 로 끊는 실행에서 I001 조회 시각 = 07:00:00 · 07:00:30 · 07:01:00 · 07:01:30 · 07:02:00(30초 간격) · D005 = 07:00:00 · 07:01:00 · 07:02:00 · D004 · B001 은 5초마다 그대로.
    - 07:00:40 부터 I001 목록에 「단일판매ㆍ공급계약체결(자율공시)」(Y · 6자리 · 제출인 = 회사) 1건과 비대상 「유상증자결정」 · 「[첨부추가]최대주주변경」 · 「최대주주변경을수반하는주식담보제공계약체결」 을 둔다 → 넣기 항목은 대상 1건만(watch exchange_disclosure · priority 2) · 텔레그램 글 1건 · 첫 줄 = 「📢 단일판매ㆍ공급계약체결(자율공시) — 회사(종목코드)」(「(늦은 알림)」 없음 · 제출인 없음) · warn `b001 near-miss kind` 0건.
    - 09:00 경계를 지나는 실행(08:59:00 시작 · lastOk 를 네 감시 대상 모두 직전 값으로)에서 I001 = 08:59:00 · 08:59:30 · 09:00:00 · 09:00:30 · 09:01:00.
  </behavior>
  <action>
    watches.ts(사용자 결정 ① ② ③ · 정정 규칙 · D-01 · D-05) — 설계의 「판정 규칙 모양」 대로:
    - `WatchId` 에 `exchange_disclosure` · `insider_trade_plan` 추가. `rights_merger` id 는 유지(주석: DB watch · last_ok 키 · by_watch 연속성 때문에 이름은 옛것).
    - `Watch` 에서 `kinds` 를 빼고 `rule: NameRule` · `everyMs: number | null` 을 넣는다. `pblntfDetailTy` 를 `"D004" | "B001" | "I001" | "D005"` 로.
    - `NameRule` 합 타입 3꼴(any · b001 · plain)과 각 꼴의 정정 규칙을 타입 주석에 적는다.
    - 상수: `DEFAULT_B001_KINDS` 6종 · `B001_ORIGINAL_ONLY_KINDS`(자기주식취득결정 · 주식교환ㆍ이전결정) · `I001_EXACT_KINDS`(5종) · `I001_PREFIX_KINDS`(투자판단관련주요경영사항) · `D005_KINDS`(2종). `KNOWN_EXCLUDED_B001_KINDS` 에서 자기주식취득결정 · 주식교환ㆍ이전결정을 뺀다. `NEAR_MISS_RE` 는 b001 꼴 분기 안에서만 쓴다.
    - `plainKind(name)` export — 설계 정의 그대로.
    - `judgeRow`: invalid → market 은 지금 그대로, 그다음 `rule.form` 으로 가른다. any → send. b001 → 지금 순서 그대로(정정 스위치 exclude 이면 correction → 괄호 종류명 완전 일치) 하되 일치한 종류가 `originalOnly` 에 있고 `isCorrection` 이면 correction · 그 밖 일치는 send → KNOWN_EXCLUDED → kind → near_miss → kind. plain → `isCorrection` 이면 correction → `plainKind` 가 exact 완전 일치 또는 prefix 로 시작하면 send → 아니면 kind(near_miss 를 만들지 않는다).
    - `buildWatches(opts: { b001Kinds })` 는 설계의 4개를 이 순서로 돌려준다(간격 상수는 cadence.ts 에서 import — cadence.ts 는 import 가 없어 순환 없음).
    - 머리 주석에 새 감시 대상 · 종류별 정정 · plain 꼴 규칙을 덧붙인다(기존 문체 · 범위 물결표 앞뒤 띄어쓰기).
    cadence.ts: `EXCHANGE_POLL_MS = 30_000` · `TRADE_PLAN_POLL_MS = 60_000` · `pollSlot(nowMs, everyMs)`(설계 정의) export. 이 Task 에서 `plannedDailyCalls` 는 건드리지 않는다(Task 2).
    lap.ts: `collectOnce` 의 opts 에 선택 인자 `isDue?(w: Watch): boolean` 를 더한다 — false 면 그 감시 대상은 조회 · 결과 항목 · 호출 수 모두 없이 건너뛴다(늦음 판정 `isLate` 도 부르지 않는다). 없으면 지금처럼 전부. 머리 주석 한 줄.
    collector.ts: 필드 `polledSlot: Map<WatchId, number>` 와 메서드 `takeSlot(w: Watch, lapStartMs: number): boolean`(pollSlot 이 null 이면 true · 기억한 칸과 같으면 false · 다르면 기억하고 true). `lap(startedAt)` 와 `seedLap()` 의 `collectOnce` 호출에 `isDue: (w) => this.takeSlot(w, startedAt)` 를 넘긴다(seed 는 첫 바퀴라 기억이 비어 4개 전부 조회 — 그날 건을 빠짐없이 seeded 로 채운다). `WATCH_LABEL` 에 `exchange_disclosure: "거래소 수시공시"` · `insider_trade_plan: "임원ㆍ주요주주 거래계획"` 을 더한다. 머리 주석 ⑥ 루프 설명에 「감시 대상별 조회 칸」 한 줄.
    fakes.ts: `EVERY_LAP_WATCHES` = `buildWatches({ b001Kinds: DEFAULT_B001_KINDS })` 중 `everyMs === null`(D004 · B001) 을 export 하고 `makeHarness` 기본 감시 대상을 이것으로 바꾼다 — 기존 수집기 · 장애 · 모드 시험의 호출 수 단언(12 · 10 · 5 · UNKNOWN_STREAK · 10,800)은 바퀴 역학을 재는 것이라 그대로 둔다. 새 감시 대상이 든 실행은 `watches` 를 명시해 넘긴다. `itemOf` 의 priority 는 buildWatches 결과에서 id 로 찾는다(없으면 1).
    watches.test.ts 기존 시험: buildWatches 모양 · 「기본값 4종」 시험은 새 4개 · 6종으로 바꾸고, `b001Kinds` 를 바꾸는 시험은 `rule` 로 읽는다. 232행 이후 collectOnce 픽스처 바퀴(「두 감시 대상을 2회 조회」)는 감시 대상을 D004 · B001 두 개로 걸러 넘겨 의도를 유지한다.
    modes.test.ts: index 결선 시험(258 · 260 · 338 · 339행 근처)의 감시 대상 id 목록 · `watches` 수(4) · B001 종류 읽기(`rule`)를 새 모양으로.
    tracer.test.ts: 4개가 된 buildWatches 때문에 가짜 HTTP 요청 수 단언이 깨지면 그 시험에 D004 · B001 두 개만 넘긴다(단언 의도는 바꾸지 않는다).
    금지: dart/client.ts · index.ts · db.ts · 마이그레이션 수정 · 바퀴 간격 상수(PREOPEN · REGULAR) 변경.
  </action>
  <verify>
    <automated>cd workers/dart-alert && npx vitest run --maxWorkers=2 && npx tsc --noEmit</automated>
  </verify>
  <done>
    시험 전부 통과 · 타입검사 통과. watchMix 끝에서 끝 시험이 I001 30초 간격 · D005 60초 간격 · 대상 1건만 넣기(priority 2) · 첫 줄 형식 · near-miss warn 0 을 증명한다. 판정 표가 사용자 결정 ① ② ③ 과 종류별 정정을 모두 덮는다. 경로 지정 `git add` 로 Task 1 파일만 커밋(한국어 메시지 · Co-Authored-By 없음).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 섞인 간격 안전장치 — 감시 대상별 늦음 기준 · 띄엄 조회에 안전한 장애 닫기 · 하루 호출 계산 13,140 · 첫 줄 공백 정리</name>
  <files>workers/dart-alert/src/cadence.ts, workers/dart-alert/src/collector.ts, workers/dart-alert/src/message.ts, workers/dart-alert/tests/cadence.test.ts, workers/dart-alert/tests/collector.test.ts, workers/dart-alert/tests/watchMix.test.ts, workers/dart-alert/tests/message.test.ts</files>
  <behavior>
    RED 먼저.
    cadence.test.ts:
    - pollSlot: 월 07:00:00 → 0 · 07:00:29.999 → 0 · 07:00:30 → 1 · 09:00:00(30초) → 240 · 09:00:00(60초) → 120 · everyMs null → null.
    - plannedDailyPolls(null) = 5,400 · (EXCHANGE_POLL_MS) = 1,560 · (TRADE_PLAN_POLL_MS) = 780.
    - plannedDailyCalls(buildWatches(DEFAULT_B001_KINDS)) = 13,140 ≤ DART_DAILY_BUDGET_LIMIT · 여기에 plannedDailyPolls(EXCHANGE_POLL_MS)(I001 매 조회 2쪽 최악)를 더한 14,700 ≤ 15,000.
    - 기존 가드 유지: 매 바퀴 감시 대상 3개(everyMs null 셋) = 16,200 > 15,000 · 2개 = 10,800.
    - lateGapMs(null) = 60,000 · (30,000) = 90,000 · (60,000) = 120,000 · isLateAt 세 번째 인자 없으면 지금과 같은 60초(기존 207 ~ 213행 단언 그대로 통과).
    collector.test.ts: 「월 07:00 부터 20:00 까지」 하루 시험을 `watches: buildWatches(DEFAULT_B001_KINDS)` 로 — DART 호출 13,140 · 감시 대상별 callsOf = 5,400 · 5,400 · 1,560 · 780 · usage.add 합 13,140 · window_end. 나머지 시험은 기본(EVERY_LAP_WATCHES) 그대로.
    watchMix.test.ts(Task 1 파일에 이어서):
    - 늦음 없음: 10:00 시작 · 네 감시 대상 lastOk 직전 값 · D005 목록에 10:03 쯤부터 거래계획보고서 1건 · DART 응답 지연을 호출마다 약 3초 줘(넷을 부르는 바퀴는 10초 간격을 넘겨 다음 바퀴 시작이 밀린다) D005 조회 사이 간격이 60초를 넘는 경우를 만든다 — 시험 안에서 「D005 조회 간격 최댓값 > 60초」 도 함께 단언해 밀림이 실제로 생겼음을 보인다(지연 값은 이 단언이 서도록 실행자가 맞춘다) → 그 알림에 「(늦은 알림)」 없음 · 첫 줄 끝에 「 · 제출인 {임원 이름}」.
    - 늦음 있음: 10:00 시작 · D005 lastOk = 09:57:00(나머지 직전 값) · 첫 바퀴 D005 목록에 1건 → 「(늦은 알림)」.
    - 장애 짝 글 한 번씩: 10:00 시작 · 네 lastOk 직전 값 · I001 만 10:00:00 ~ 10:08:00 동안 800 응답 · 나머지 성공 · 10:12 쯤 끊음 → outage open 1번(10:05 언저리 · 사유에 「거래소 수시공시」) · close 1번(10:08 이후 첫 I001 성공 바퀴) · 단체방 장애 글 정확히 2건(「⚠ 공시 알림이 멈췄습니다」 → 「✅ 공시 알림 다시 동작」) · error `dart outage opened` 1건.
    message.test.ts: report_nm 「투자판단관련주요경영사항              (최대주주 보유주식 가압류)」 의 alertText · plainAlertText 첫 줄이 「📢 투자판단관련주요경영사항 (최대주주 보유주식 가압류) — …」(공백 1칸) · testSendText 새 문구.
  </behavior>
  <action>
    cadence.ts(D-10 · D-12 · 공식 API 운영 기준 ①):
    - `lateGapMs(everyMs: number | null): number` = `LATE_GAP_MS + (everyMs ?? 0)` export. `isLateAt(nowMs, coverMs, gapMs = LATE_GAP_MS)` 로 세 번째 인자(기본값 지금과 같음).
    - `plannedDailyPolls(everyMs: number | null): number` — `plannedDailyLaps` 와 같은 기준 평일(REFERENCE_WEEKDAY_START_MS)을 `lapIntervalMs` 로 걸으며 바퀴마다 `pollSlot` 이 null 이거나 지난 칸과 다르면 센다(수집기 `takeSlot` 과 같은 규칙).
    - `plannedDailyCalls(watches: readonly { everyMs: number | null }[]): number` = 감시 대상별 plannedDailyPolls 합(추가 쪽 · 탐침 제외)으로 시그니처를 바꾼다 — 숫자 인자 꼴은 없앤다.
    - 머리 주석의 D-10 문단을 새 계산으로 바꾼다: 바퀴 5,400 × (D004 · B001) + I001 30초 칸 1,560 + D005 60초 칸 780 = 13,140 · I001 추가 쪽 추정(설계 문단의 약 400 ~ 800 · 최악 +1,560 → 14,700) · 감시 대상을 더할 때 plannedDailyCalls 와 예산 상한을 같이 점검. D-12 문단에 감시 대상별 늦음 간격(60 · 90 · 120초)과 이유 한 줄.
    collector.ts(D-12 · D-16 · D-17):
    - `isLate(w)` 는 `this.d.watches` 에서 그 감시 대상의 everyMs 를 찾아 `isLateAt(now, cover, lateGapMs(everyMs))`.
    - 필드 `failing: Set<WatchId>`(마지막 조회가 실패한 감시 대상) — `takeResult` 가 결과마다 ok 면 delete · 아니면 add. `judgeOutage` 는 이 바퀴 실패가 0 일 때 `failing` 이 비었을 때만 `closeOutage`, 아니면 아무것도 안 하고 끝(열기 규칙 · OUTAGE_AFTER_MS · startupCheck · judgeInsertFailure 는 그대로).
    - 머리 주석의 D-10 · SC-4 줄을 13,140 계산으로, D-12 줄에 감시 대상별 늦음 간격, 43-06 장애 문단에 「띄엄 조회 대상은 다시 성공해야 닫는다」 한 줄.
    message.ts(D-07 · 재량): `firstLine` 이 보고서 이름을 표시할 때 trim + 연속 공백 1칸으로 정리한 뒤 이스케이프한다(DB · 판정 값은 그대로). 머리 주석의 「DART 표기 그대로」 에 「연속 공백만 1칸」 덧붙임. `testSendText` 첫 줄을 「🔔 공시 알림 시험 — 공개매수 · 주요사항보고서 · 거래소 수시공시 · 임원ㆍ주요주주 거래계획 공시를 이 방으로 보냅니다」 로.
    시험: behavior 대로. collector.test.ts 의 `plannedDailyCalls(2)` 호출은 새 시그니처로 바꾼다(EVERY_LAP_WATCHES 를 넘기면 10,800). cadence.test.ts 의 「바퀴 수 × 2 = 10,800」 · 「3개면 16,200」 시험은 배열 인자로 옮겨 의미를 유지하고 제목을 고친다.
    금지: OUTAGE_AFTER_MS · LATE_GAP_MS · START_GRACE_MS · 바퀴 간격 값 변경 · 예산 상한 변경 · BUDGET_WARN_RATIO 변경.
  </action>
  <verify>
    <automated>cd workers/dart-alert && npx vitest run --maxWorkers=2 && npx tsc --noEmit</automated>
  </verify>
  <done>
    시험 전부 통과 · 타입검사 통과. 하루 13,140(감시 대상별 5,400 · 5,400 · 1,560 · 780)과 최악 14,700 ≤ 15,000 이 단언으로 묶이고, 정상 30초 · 60초 조회는 늦음이 아니며, I001 단독 실패가 「멈췄습니다」 · 「다시 동작」 을 한 번씩만 낸다. 경로 지정 `git add` 로 Task 2 파일만 커밋.
  </done>
</task>

<task type="auto">
  <name>Task 3: 운영 문서 · 스크립트 · 설정 주석을 새 감시 대상 · 13,140 · 간격으로 맞춘다</name>
  <files>CLAUDE.md, docs/stack.md, scripts/deploy-dart-alert.sh, scripts/dart-alert-report.sh, workers/dart-alert/src/config.ts</files>
  <action>
    모든 문서는 기존 문체(한국어 · 범위 물결표 앞뒤 띄어쓰기 `07:00 ~ 09:00` · 백틱 시각)를 따른다. 숫자는 설계 문단 값만 쓴다.
    CLAUDE.md 「공식 API 운영 기준」 의 OpenDART 불릿 셋(공식 API 운영 기준 ①):
    - 「OpenDART 소비처」: 괄호 안 설명을 「공개매수 · 주요사항보고서(증자 · 합병 · 자기주식취득 · 주식교환) · 거래소 수시공시(최대주주변경 등) · 임원ㆍ주요주주 거래계획 공시 텔레그램 알림」 으로.
    - 「OpenDART 예산」: 설계 사용량을 「약 13,140/일 (66% — 바퀴 10,800 + I001 1,560 + D005 780) + I001 100건 넘는 오후 추가 쪽 약 400 ~ 800 (최악 14,700 ≤ 15,000) — 남는 몫은 추가 쪽 · 탐침」 꼴로 바꾼다.
    - 「OpenDART 수집 주기」: 바퀴 설명을 「바퀴마다 공개매수 `D004` · 주요사항보고서 `B001`, 거래소 수시공시 `I001` 은 30초 · 임원ㆍ주요주주 거래계획 `D005` 는 60초마다(07:00 기준 시각 칸 — 5초 구간에서도 같은 간격)」 로. 나머지 문장(밤 · 주말 없음 · Job · 출처)은 그대로.
    docs/stack.md 44 ~ 46행: 소비처 설명에 새 두 유형 · 유형 코드 불릿에 `I001` 거래소 수시공시(허용 6종 · 이름 끝 괄호 꼬리 무시 · 투자판단은 접두 · 원본만) · `D005` 임원ㆍ주요주주 거래계획(2종 · 원본만) · `B001` 허용 6종(새 2종은 원본만)을 적고, 46행 「바퀴당 2회」 설명은 「한 호출에 유형 하나라 D004 · B001 은 바퀴마다 · I001 · D005 는 30초 · 60초마다 따로 부른다」 로. 숫자 정본은 CLAUDE.md 라는 43행 원칙을 지켜 예산 숫자는 여기 쓰지 않는다.
    scripts/deploy-dart-alert.sh 머리 주석만(실행 코드 · 배열 · 상수는 그대로):
    - 5행 제목 괄호를 「공개매수 · 주요사항 · 거래소 수시공시 · 임원 거래계획 공시 텔레그램 알림」 으로.
    - 30행 D-10 설계 줄: 한 바퀴 = D004 1회 + B001 1회 · I001 30초 · D005 60초 칸마다 1회.
    - 41행 예산 줄: 평일 사용 ≈ 13,140(5,400 × 2 + 1,560 + 780 · 66%) + I001 추가 쪽 약 400 ~ 800 · 최악 14,700.
    - 77 · 80행 `DART_ALERT_B001_KINDS` 예시 목록을 6종 기본값으로(옛 4종을 복사해 넣으면 새 2종이 빠진다는 경고 한 줄 덧붙임).
    - 「배포 시점 주의」 문단에 한 줄: 새 감시 대상을 처음 싣는 배포는 평일 20:00 뒤 · 07:00 전에 하고, 장중에 도는 실행을 취소해 바로 바꾸지 않는다 — 새 감시 대상은 DB last_ok 가 없어 시작 점검이 「멈췄습니다」 · 「다시 동작」 짝 글을 내고 그날 앞선 I001 · D005 건이 「(늦은 알림)」 으로 한꺼번에 나간다.
    scripts/dart-alert-report.sh:
    - 62행 근처 `B001_KINDS` 기본값 리터럴을 DEFAULT_B001_KINDS 6종과 같게, 머리 주석 ⑵ 의 「허용 목록 4종」 을 「허용 목록(기본 6종)」 으로.
    - stats 의 `watchLabel` 지도(236행 근처)를 `tender_offer: "공개매수"` · `rights_merger: "주요사항보고서"` · `exchange_disclosure: "거래소 수시공시"` · `insider_trade_plan: "임원ㆍ주요주주 거래계획"` 으로 — 「감시 대상별」 · 「마지막 성공 조회」 줄이 새 이름으로 나온다. survey 하위 명령의 조사 범위(B001 · D004)는 넓히지 않는다.
    workers/dart-alert/src/config.ts 주석만: `DART_DAILY_BUDGET_LIMIT` 위 주석의 설계 사용량을 13,140(cadence.ts plannedDailyCalls) + I001 추가 쪽으로, `b001Corrections` 필드 주석에 「자기주식취득결정 · 주식교환ㆍ이전결정은 이 값과 무관하게 원본만 · I001 · D005 는 늘 원본만」, 머리 주석 D-04 줄에 B001 허용 목록 6종.
    DB 마이그레이션은 만들지 않는다(설계 「DB」 문단 — 확인 완료). STATE.md · ROADMAP.md 는 건드리지 않는다.
  </action>
  <verify>
    <automated>grep -q "13,140" CLAUDE.md && grep -q "I001" CLAUDE.md && grep -q "I001" docs/stack.md && grep -q "13,140" scripts/deploy-dart-alert.sh && grep -q "exchange_disclosure" scripts/dart-alert-report.sh && grep -q "자기주식취득결정" scripts/dart-alert-report.sh && ! grep -q "설계 사용량 약 10,800" CLAUDE.md && ! grep -q "감시 대상 2" workers/dart-alert/src/config.ts scripts/deploy-dart-alert.sh && ! grep -rq "감시 대상 2 = 10,800" workers/dart-alert/src && bash -n scripts/dart-alert-report.sh && GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://x.supabase.co bash scripts/deploy-dart-alert.sh --self-test && pnpm -C workers/dart-alert typecheck</automated>
  </verify>
  <done>
    CLAUDE.md · stack.md · 배포 머리 주석 · config 주석 · 보고 스크립트가 새 감시 대상 · 종류별 정정 · 30초/60초 간격 · 13,140 을 말하고 옛 「감시 대상 2」 계산 문구가 남지 않는다. 배포 스크립트 self-test · 보고 스크립트 문법 검사 · 타입검사 통과. 경로 지정 `git add` 로 Task 3 파일만 커밋.
  </done>
</task>

</tasks>

<verification>
- `cd workers/dart-alert && npx vitest run --maxWorkers=2` 전부 통과(기존 342개 + 새 시험) · `npx tsc --noEmit` 통과.
- `GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://x.supabase.co bash scripts/deploy-dart-alert.sh --self-test` → `SELF-TEST OK`.
- 이 작업의 커밋 파일 목록(`git show --name-only <커밋>`)에 `supabase/` · `workers/dart-alert/src/dart/client.ts` · `workers/dart-alert/src/index.ts` 가 없다(마이그레이션 없음 · 쪽 넘김 · 결선 그대로).
- 동시 세션 주의: 시험은 `--maxWorkers=2` · 커밋 전 `git status -sb` 로 남의 미커밋 파일을 확인하고 경로 지정으로만 add · `git stash` 금지.
</verification>

<success_criteria>
- 사용자 결정 ① ② ③ 의 이름 규칙 · 종류별 정정이 판정 표 시험으로 고정된다.
- I001 30초 · D005 60초 간격이 07:00 ~ 09:00 · 09:00 경계 · 09:00 ~ 20:00 모두에서 끝에서 끝 시험으로 증명되고, 하루 13,140 · 최악 14,700 ≤ 15,000 이 단언된다.
- 새 대상에서 늦은 알림 · 장애 짝 글 오탐이 없다(시험으로 증명) · 기존 D004 · B001 동작 시험은 그대로 통과.
- 운영 문서가 새 수치 · 간격을 말한다 · 마이그레이션 0.
</success_criteria>

<main_session_notes>
배포는 메인 세션이 한다 — 실행자는 커밋까지만(push · 배포 · `supabase db push` 금지).
메인 세션 참고:
1. 마이그레이션 없음 → `supabase db push` 불필요.
2. 배포 시각: 평일 20:00 뒤 · 07:00 전. 장중 배포라면 도는 실행을 취소하지 말 것(취소하면 새 감시 대상의 last_ok 가 없어 「멈췄습니다」 · 「다시 동작」 짝 글 + 그날 앞선 I001 · D005 · B001 새 2종 건이 한꺼번에 나간다). 취소하지 않으면 도는 실행은 20:00 까지 옛 이미지라 다음 날 07:00 부터 새 동작.
3. 배포 전 라이브 Job env 에 `DART_ALERT_B001_KINDS` 가 박혀 있지 않은지 확인 — 있으면 새 2종(자기주식취득결정 · 주식교환ㆍ이전결정)이 빠진다. 배포 스크립트는 env 로 넘긴 경우에만 싣는다.
4. 첫 운영일 저녁에 `SUPABASE_URL=… bash scripts/dart-alert-report.sh stats` 로 `opendart_list` 사용량(예상 약 13,100 ~ 14,000) · 감시 대상별에 거래소 수시공시 · 임원ㆍ주요주주 거래계획이 나오는지 확인. 기존 80% 경고(`daily budget 80% reached` · warn · 메일 없음)는 이제 평일마다 저녁에 한 번 찍힌다.
</main_session_notes>

<output>
Create `.planning/quick/261113-iez-dart-alert-i001-d005-b001-2/261113-iez-SUMMARY.md` when done
</output>
