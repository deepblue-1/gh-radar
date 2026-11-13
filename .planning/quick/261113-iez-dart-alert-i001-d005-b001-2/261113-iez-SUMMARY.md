---
phase: quick-261113-iez
plan: 01
subsystem: workers/dart-alert
status: complete
tags: [opendart, telegram, dart-alert, I001, D005, B001, budget]
requires: [Phase 43 dart-alert 운영 중 워커]
provides:
  - 감시 대상 4개(tender_offer · rights_merger · exchange_disclosure · insider_trade_plan)
  - 종류별 판정 규칙(NameRule any · b001 · plain) · 종류별 정정
  - 감시 대상별 시각 칸 조회(pollSlot · takeSlot) · 감시 대상별 늦음 기준(lateGapMs)
  - 띄엄 조회에 안전한 장애 닫기(failing 집합)
  - 하루 호출 계산 plannedDailyPolls · plannedDailyCalls(감시 대상 배열) = 13,140
affects: [CLAUDE.md 공식 API 운영 기준 OpenDART 불릿, docs/stack.md, scripts/deploy-dart-alert.sh, scripts/dart-alert-report.sh]
tech-stack:
  added: []
  patterns: [07:00 기준 시각 칸 조회(바퀴 N번에 1번 대신), 마지막 조회 실패 감시 대상 집합으로 장애 닫기]
key-files:
  created:
    - workers/dart-alert/tests/watchMix.test.ts
  modified:
    - workers/dart-alert/src/watches.ts
    - workers/dart-alert/src/cadence.ts
    - workers/dart-alert/src/lap.ts
    - workers/dart-alert/src/collector.ts
    - workers/dart-alert/src/message.ts
    - workers/dart-alert/src/config.ts
    - workers/dart-alert/src/apiUsage.ts
    - workers/dart-alert/tests/helpers/fakes.ts
    - workers/dart-alert/tests/watches.test.ts
    - workers/dart-alert/tests/modes.test.ts
    - workers/dart-alert/tests/tracer.test.ts
    - workers/dart-alert/tests/cadence.test.ts
    - workers/dart-alert/tests/collector.test.ts
    - workers/dart-alert/tests/message.test.ts
    - workers/dart-alert/tests/config.test.ts
    - CLAUDE.md
    - docs/stack.md
    - scripts/deploy-dart-alert.sh
    - scripts/dart-alert-report.sh
decisions:
  - "I001 30초 · D005 60초 간격은 07:00 기준 시각 칸(pollSlot)으로 구현 — 바퀴 밀림 · 09:00 경계에서도 정확한 간격"
  - "늦음 기준 = 60초 + 그 감시 대상 조회 간격(D004 · B001 60초 · I001 90초 · D005 120초)"
  - "장애는 이 바퀴 실패 0 이고 마지막 조회 실패 감시 대상 집합(failing)이 빌 때만 닫는다"
  - "D005 는 제출인 항상 표시 · 우선순위 공개매수 0 · B001 1 · I001 2 · D005 3"
  - "rights_merger id 는 자기주식 · 주식교환도 담지만 DB · last_ok · by_watch 연속성 때문에 유지"
metrics:
  duration: "약 10분"
  completed: 2026-11-13
actuals:
  tokens: 52000
  tasks: 3
  commits: 3
plan_head_before: 69f48ac4c6f0d0eaa00cb06d349adbf5f286bab4
plan_head_after: e8c19ca6b9f409a45a7412c8fb20f889362c3525
---

# Quick 261113-iez: 공시 알림 감시 대상 넷 — 거래소 수시공시 · 임원 거래계획 추가 Summary

거래소 수시공시(I001 · 30초 칸) · 임원ㆍ주요주주 거래계획(D005 · 60초 칸)을 새 감시 대상으로 더하고, 주요사항보고서(B001)에 자기주식취득결정 · 주식교환ㆍ이전결정(원본만)을 더했다. 평일 하루 예상 호출은 13,140(최악 14,700 ≤ 예산 15,000)이다.

## 무엇이 바뀌었나

- **판정(watches.ts)**: `Watch.kinds` 를 `rule: NameRule`(any · b001 · plain)과 `everyMs` 로 바꿨다.
  - I001: 최대주주변경 · 최대주주변경을수반하는주식양수도계약체결 · 경영권변경등에관한계약체결 · 단일판매ㆍ공급계약체결 · 주식소각결정은 완전 일치, 투자판단관련주요경영사항은 접두 일치로 비교한다. 비교 전에 이름 끝 괄호 꼬리(「(자율공시)」 등)와 공백을 뗀다(`plainKind`). 정정은 늘 보내지 않고, 근접 불일치 warn 은 내지 않는다.
  - D005: 거래계획보고서 · 거래계획철회보고서 원본만 보내고, 첫 줄에 제출인을 늘 붙인다.
  - B001: 허용 목록이 6종으로 늘었다. 새 2종은 `b001Corrections=include` 여도 원본만 보낸다. 기존 4종과 공개매수는 이전과 같다.
- **간격(cadence.ts · lap.ts · collector.ts)**: `pollSlot` 으로 07:00 기준 칸 번호를 계산한다. 수집기는 감시 대상별로 마지막에 부른 칸을 기억(`takeSlot`)하고 칸이 바뀔 때만 부른다. `collectOnce` 의 `isDue` 가 false 면 조회 · 결과 · 호출 수 · 늦음 판정을 모두 건너뛴다.
- **늦은 알림**: `lateGapMs(everyMs)` 로 기준을 정한다. 정상적인 30초 · 60초 조회는 바퀴가 밀려도 「(늦은 알림)」 이 붙지 않는다.
- **장애 판정**: `failing` 집합을 두었다. I001 이 실패하는 동안 I001 을 부르지 않는 바퀴가 장애를 닫지 않으므로, 「멈췄습니다」 · 「다시 동작」 은 한 번씩만 나간다.
- **표시(message.ts)**: 보고서 이름의 연속 공백은 1칸으로 보인다(DB 에는 원문 그대로 저장). 시험 글 문구에 새 감시 대상을 넣었다.
- **예산**: `plannedDailyCalls(감시 대상 배열)` = 5,400 + 5,400 + 1,560 + 780 = **13,140**(공식 한도의 66%). I001 이 조회할 때마다 2쪽을 읽는 최악의 경우에도 **14,700** ≤ 15,000 이다.
- **문서**: CLAUDE.md OpenDART 불릿 3개 · docs/stack.md 유형 코드 · 배포 스크립트 머리 주석 · 보고 스크립트(B001 기본 6종 · stats 감시 대상 이름 4종) · config.ts 주석을 갱신했다.

## 커밋

| Task | 커밋 | 내용 |
| ---- | ---- | ---- |
| 1 | 2c1b548c | 감시 대상 넷 · 종류별 판정 · 시각 칸 조회 (tracer · TDD) |
| 2 | c4bc8b18 | 감시 대상별 늦음 기준 · 띄엄 조회에 안전한 장애 닫기 · 13,140 · 첫 줄 공백 |
| 3 | e8c19ca6 | 운영 문서 · 스크립트 · 설정 주석 |

## 시험

- `npx vitest run --maxWorkers=2`: **377 통과**(기존 342 + 새 35) · 18 파일.
- `npx tsc --noEmit`(src) 통과. `pnpm -C workers/dart-alert typecheck` 통과.
- `deploy-dart-alert.sh --self-test` → `SELF-TEST OK`. `bash -n scripts/dart-alert-report.sh` 통과. stats 의 node 블록을 가짜 JSON 으로 돌려 새 이름 4종이 나오는 것을 확인했다.
- RED 확인: Task 1 은 everyMs · rule 이 없어 실패했다. Task 2 는 옛 60초 기준에서 D005 알림에 「(늦은 알림)」 이 붙었고, I001 장애가 open 6번으로 반복됐다. 구현 뒤 모두 통과했다.
- 끝에서 끝(watchMix): I001 은 07:00:00 ~ 07:02:00 동안 30초 간격 5번, 09:00 경계를 지나서도 30초 간격이다. D005 는 60초 간격이다. 대상 1건만 넣었고(priority 2), 첫 줄 형식은 그대로이며 near-miss warn 은 0건이다. 바퀴 밀림으로 D005 조회 간격이 60초를 넘어도 늦음이 붙지 않았다. I001 단독 장애는 열기 1번(10:05) · 닫기 1번(10:08)이다.
- 커밋 파일에 `supabase/` · `dart/client.ts` · `index.ts` 는 없다(마이그레이션 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tests/config.test.ts 기본 b001Kinds 기대값 갱신**
- **Found during:** Task 1
- **Issue:** `loadConfig` 기본값 시험이 옛 4종을 기대해 실패했다(계획 파일 목록에 없던 파일).
- **Fix:** 기대값을 6종으로 바꿨다.
- **Commit:** 2c1b548c

**2. [Rule 3 - Blocking] src/apiUsage.ts 머리 주석의 `plannedDailyCalls(2)` 참조 갱신**
- **Found during:** Task 2
- **Issue:** 숫자 인자 꼴을 없애면서 주석이 없는 시그니처와 옛 수치(10,800)를 가리키게 됐다.
- **Fix:** 13,140(네 감시 대상) + 최악 14,700 으로 고쳤다.
- **Commit:** c4bc8b18

**3. 계획 표기 차이(동작 영향 없음)**: 계획의 `makeHarness` 는 실제 이름인 `harness` 로 썼다. 기본 감시 대상을 `EVERY_LAP_WATCHES` 로 바꾸면서 `ALL_WATCHES`(4개)와 행 생성기 `exchangeRow` · `tradePlanRow` 를 fakes.ts 에 더했다.

## 참고(범위 밖 · 기존 상태)

- tests 까지 넓혀 tsc 를 돌리면 이전부터 있던 타입 오류 2종이 보인다: `dbContract.test.ts` 의 `import.meta`, `watches.test.ts` 의 근접 불일치 시험 `nearMissWarns` 반환 타입(`obj`). 이번 변경과 무관해 고치지 않았다(vitest 는 통과).
- 80% 경고(12,000 · warn · 메일 없음)는 이제 평일마다 저녁 무렵 한 번 찍힌다. 계획대로 바꾸지 않았다.

## 메인 세션 배포 메모

1. 마이그레이션은 없다 → `supabase db push` 가 필요 없다.
2. 배포는 평일 20:00 뒤 · 07:00 전에 한다. 장중에 배포하더라도 도는 실행을 취소하지 않는다. 취소하면 새 감시 대상에 `last_ok` 가 없어 「멈췄습니다」 · 「다시 동작」 짝 글이 나가고, 그날 앞서 올라온 I001 · D005 · B001 새 2종 건이 「(늦은 알림)」 으로 한꺼번에 나간다.
3. 배포 전에 라이브 Job env 에 `DART_ALERT_B001_KINDS` 가 박혀 있지 않은지 확인한다. 박혀 있으면 새 2종이 빠진다.
4. 첫 운영일 저녁에 `bash scripts/dart-alert-report.sh stats` 로 `opendart_list` 사용량(예상 약 13,100 ~ 14,000)과 감시 대상별 줄에 거래소 수시공시 · 임원ㆍ주요주주 거래계획이 나오는지 확인한다.
5. 배포 대상은 server · webapp 이 아니라 `scripts/deploy-dart-alert.sh`(Cloud Run Job) 하나다.

## Self-Check: PASSED

- FOUND: workers/dart-alert/tests/watchMix.test.ts
- FOUND: 2c1b548c · c4bc8b18 · e8c19ca6 (HEAD 조상)
