---
phase: 39-trade-diagnosis-chatbot
plan: 08
subsystem: api
tags: [anthropic, opus-5-5, prompt, chatbot, diagnosis, gh-trade, knowledge]

requires:
  - phase: 39-05
    provides: "DIAGNOSIS_SYSTEM_PROMPT 초안(역할 · 도구 규칙 · 출력 권고 · 인젝션 방어) · consultDiagnosisSpecialist system[0] + cache_control"
  - phase: 39-04
    provides: "MARKET_LEGEND(b_ = bs 공백 단일가) 원문"
  - phase: 39-02
    provides: "STATE_REASON_LABELS · STATE_SWITCH_BIT_LABELS · POST_BUY_STAGE_LABELS · RISK_LATCH_LABELS · ORDER_GROUP_LABELS · STRATEGY_EVENT_KIND_LABELS"
provides:
  - "DIAGNOSIS_SYSTEM_PROMPT 완성본(14,541자) — 선매수 판정표 9행 · 매도 판정표 6행 원문 · 시세 해석 규칙 원문 · 세션 코드 · 세 시계 경고 · 줄/후매수 · 마감 · kind 9 사전 · 주문로그 문장 꼴"
  - "DIAGNOSIS_KNOWLEDGE_SOURCE = gh-trade 95705091 (2026-11-06) — 프롬프트 본문에도 실림(드리프트 추적)"
  - "server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts — 원문 문자열 · 9행/6행 조건명 · shared 사전 포함 · 2차 토큰 부재 · 크기 · 금지 문구 · 요청 system 블록 연결"
affects: [39-09]

actuals:
  tokens: 5982
  tasks: 2
  commits: 3
plan_head_before: 6a6fcf9f4de40f5dfa5fdeb4847701988c85e8b4
plan_head_after: 854256ea41a778edd0b5a38b4880f080106c9c1a

tech-stack:
  added: []
  patterns:
    - "지식 프롬프트는 절 상수(ROLE · GATE · PRE_BUY …)를 join — 원문 표는 백틱까지 글자 그대로(템플릿 리터럴 안 \\` 이스케이프)"
    - "라벨 사전(kind 9 사유 · 스위치 비트 · 단계 · 구분)은 shared 정본에서 생성 — 프롬프트에 문구를 복제하지 않는다"

key-files:
  created:
    - server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts
  modified:
    - server/src/services/specialists/diagnosis/diagnosis-knowledge.ts

key-decisions:
  - "정규 연속 세션 코드 40 은 gh-trade `server/src/market/krx/SessionCodes.h` KRX 세션ID 코드표(10 · 20 · 30 · 40 접속 · 50 · 52 · 54 · 80)와 실측 주석에서 확인돼 적었다 — RESEARCH A5 해소(limit-chaser.md 에는 코드표가 없다). NXT 는 41 프리 / 40 메인 / 42 애프터"
  - "매도 판정표 6행도 원문 그대로 실었다(계획은 「매도 전제 요약」) — 「왜 팔렸나」 진단에서 사유= 원문을 대조하려면 조건명 열이 필요하고, 길이는 상한 안(14,541자)"
  - "39-05 초안의 금지 문구 「매수하세요 / 매도하세요」 를 「사라 · 팔라고 권하는 매매 지시」 로, 「면책 · 고지 문구」 를 「경고 · 고지 문구」 로 바꿨다 — 금지 문자열 자체가 프롬프트에 남지 않게(테스트가 부재를 단언)"
  - "상태전이 미적재일 때 「선매수는 1회성이라 다음 선매수 전 재무장이 있었어야 한다」 는 규칙 추론은 허용하되 추론임을 밝히고 시각 · 제출자를 짓지 않게 했다(시험 문항 ③ 의 잠정 답 경로)"
  - "DIAGNOSIS_KNOWLEDGE_SOURCE 값은 그대로(gh-trade HEAD 가 여전히 95705091 · 오늘 날짜 2026-11-06 — 원천을 다시 읽어 확인)"

patterns-established:
  - "원문 대조 스크립트: TS 소스의 \\` 를 풀어 gh-trade 원문 행이 그대로 들어 있는지 센다(선매수 표 11/11 · 매도 표 8/8)"

requirements-completed: [SC-1]

coverage:
  - id: D1
    description: "시험 문항 ①·② 지식 — 선매수 판정표 9행 원문(7번 BuySweepTick 스윕호가변경) · F1 · F2 · 묶기 정본 · §3 E 행 · D-06 네 문장 · MARKET_LEGEND(b_) · 세션 코드(50·51·52·54 · 40 접속) · 시계 경고가 Opus 요청 system[0] 에 cache_control ephemeral 로 실린다"
    requirement: "SC-1"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts#DIAGNOSIS_SYSTEM_PROMPT — 시험 문항 ①·② 지식(Task 1)"
        status: pass
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts#DIAGNOSIS_SYSTEM_PROMPT — Opus 요청 system 블록(Task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "나머지 지식 — 줄/후매수 · 매도 전제 + 판정표 6행 · 마감 정리/Blocked · kind 9 사전(STATE_REASON_LABELS 전 항목 · 2차 토큰 없음) · 주문로그 문장 꼴 · 길이 8,000~40,000 · 매매 지시/면책 부재 · 인젝션 방어"
    requirement: "SC-1"
    verification:
      - kind: unit
        ref: "server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts#DIAGNOSIS_SYSTEM_PROMPT — 나머지 지식 · 크기 · 금지(Task 2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Opus 가 이 지식으로 시험 문항 ①(스윕호가변경 · 임계 3 · 체결량 조건 아님) · ②(VI 해제 단일가 bs 공백 판정 제외)를 실제로 맞히는지"
    requirement: "SC-1"
    verification: []
    human_judgment: true
    rationale: "실 API 답 품질 — 39-09 UAT(RUN_DIAGNOSIS_LIVE=1) 몫. 이 플랜은 실 API 를 부르지 않는다"

duration: 10min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 08: 진단 전문가 지식 프롬프트 완성 Summary

**gh-trade 95705091 정본에서 선매수 9행 · 매도 6행 판정표를 로그 조건명까지 글자 그대로, A3 0/0 · bs 공백 해석 규칙 원문, KRX/NXT 세션 코드(정규 연속 40 확인), 세 시계 경고, kind 9 사유 사전(shared 라벨에서 생성)을 담은 14,541자 진단 system 프롬프트**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-11-06T05:55:24Z
- **Completed:** 2026-11-06T06:05:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- 선매수 판정 표 9행(limit-chaser.md 151~161행)과 매도 판정 표 6행(202~209행)이 원문 행 그대로 프롬프트에 있다 — 대조 스크립트로 11/11 · 8/8 행 일치 확인. 7번 행 `` `BuySweepTick` — `PreBuy A3 스윕호가변경(체결가==스윕감시가 && 변경횟수>=최소)` `` 포함.
- 해석 규칙 원문: krx-a3-zero-quote F1 · F2 · §2 묶기 정본(「A3 msg_seq 가 바로 앞 A3 + 1 이면 같은 주문, 1 넘게 벌어지면 경계」) · §3 표 E 행 · CONTEXT D-06 네 문장 · `MARKET_LEGEND` import(`b_` = 단일가 → 선매수 A3 판정 · 누적 제외).
- 게이트(1회성 · 체크 비트 ON 재제출 = 재무장 · 마스터는 사람만) · 버스트/한방(`3건@10,000` 예) · 줄매수 · 후매수(「줄매수·후매수는 동시호가 틱에 판정하지 않는다」 원문) · 매도 전제 셋 · 진입 확인 래치 · 잔량추적 · 15:30/15:40/20:00 정리 · G1/G4/Blocked.
- kind 9 절: 사유 사전 17줄 · 스위치 비트 14개 · 후매수 단계 · 위험도 래치 · 주문로그 구분 라벨을 전부 shared 정본에서 생성(문구 복제 0 · 2차 토큰 0). CfgSubmit = 실제로 바뀜(같은 값 재제출은 기록 없음).
- 출력/근거 규칙: 시세 없음 → 「시세 전문은 받지 못해 주문로그 기준으로 판단」 필수 · 변환 중 → 사실 + 주문로그 기준 잠정 답 · 상태전이 없음 → 한계 명시 · get_market_ticks 사용 안내(60초 · 400건).
- 프롬프트 길이 **14,541자**. `countTokens` 는 돌리지 않았다(이 플랜은 실 Anthropic API 호출 금지 — 39-09 에서 실측 가능).

## Task Commits

1. **Task 1: 시험 문항 ①·② 지식(tracer)** — `4e9ea663` (feat)
2. **Task 2: 나머지 지식 · 크기 · 금지** — RED `84ce3c9f` (test) → GREEN `854256ea` (feat)

Tracer 게이트: interactive · `human_verify_mode` 기본 end-of-phase · `<automated>` 만 → verify(shared build · server typecheck · vitest) 재실행 통과 후 확장.

## TDD Gate Compliance

- Task 2 RED: 11건 중 3건이 계획 단언에서 실패(`CfgSubmit — 설정 재제출` 없음 · `bit0 매수` 없음 · `**줄매수·후매수는 동시호가 틱에 판정하지 않는다**` 없음) — 수집 · 로드 오류 없음. 나머지 8건 통과는 예상된 GREEN(Task 1 지식 · 39-05 초안이 길이 하한 · 금지 · 인젝션 방어를 이미 만족). GREEN 11/11.
- `tdd-red-evidence` 분류기는 돌리지 않았다(`workflow.tdd_mode` 미설정 · type: execute 플랜). 의미 판정은 위와 같다.

## Files Created/Modified

- `server/src/services/specialists/diagnosis/diagnosis-knowledge.ts` — 절 상수 14개 join · 원천 4파일 행 범위 주석 · shared 라벨에서 kind 9 · 구분 사전 생성
- `server/src/services/specialists/__tests__/diagnosis-knowledge.test.ts` — 11건(Task 1 5 · Task 2 6). anthropic-client mock + 공유 `makeStreamMock` · `makeEndTurnFinalMessage` 로 end_turn 1회

## Decisions Made

frontmatter `key-decisions` 참고. 핵심: 세션 40 은 gh-trade SessionCodes.h 코드표로 확인해 적음(A5 해소) · 매도 판정표도 원문으로 실음 · 금지 문자열 자체를 프롬프트에서 뺌 · 미적재 시 재무장은 추론으로만.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 상대 import 확장자**
- **Found during:** Task 1
- **Issue:** `from "./diagnosis-market"` 이 server tsc(nodenext)에서 TS2835.
- **Fix:** `./diagnosis-market.js` 로.
- **Files modified:** diagnosis-knowledge.ts
- **Committed in:** 4e9ea663

**2. [Rule 1 - Bug] 초안 금지 문구가 금지 문자열을 그대로 담음**
- **Found during:** Task 2(RED 설계)
- **Issue:** 39-05 초안 「「매수하세요 / 매도하세요」 같은 매매 지시는 하지 않습니다」 가 금지 대상 문자열을 프롬프트에 남겨, 「지시 문구 부재」 단언과 충돌.
- **Fix:** 「특정 종목을 사라 · 팔라고 권하는 매매 지시는 하지 않습니다」 · 「경고 · 고지 문구를 덧붙이지 않습니다」 로 같은 뜻을 유지하며 바꿈.
- **Files modified:** diagnosis-knowledge.ts
- **Committed in:** 4e9ea663

**3. [범위 보강] 원천 4번째 파일 · 매도 판정표 원문**
- 계획은 원천 3파일 · 매도는 요약이었으나, 세션 코드(A5)는 `SessionCodes.h` 에서만 확인돼 4번째 원천으로 주석에 적었고, 매도 판정표 6행을 원문으로 실었다(길이 상한 안).

---

**Total deviations:** 2 auto-fixed(1 blocking · 1 bug) + 범위 보강 1
**Impact on plan:** 정확성 보강. 다른 플랜 파일 무접촉(`diagnosis-tools.ts` · `diagnosis-specialist.ts` · `diagnosis.test.ts` 변경 없음).

## Issues Encountered

None.

## Known Stubs

None — 39-05 의 「지식 프롬프트 초안」 stub 을 이 플랜이 해소했다.

## User Setup Required

None.

## Next Phase Readiness

- 39-09 UAT: 시험 문항 ①·② 를 실 API(`RUN_DIAGNOSIS_LIVE=1`)로 확인. 원하면 그때 `countTokens` 로 프롬프트 토큰 실측.
- 검증: shared build · server tsc 통과 · vitest `diagnosis-knowledge.test.ts` 11/11 · `diagnosis.test.ts` 16/16(회귀 없음).

---
*Phase: 39-trade-diagnosis-chatbot*
*Completed: 2026-11-06*

## Self-Check: PASSED

- 파일 3개 존재(diagnosis-knowledge.ts · diagnosis-knowledge.test.ts · 39-08-SUMMARY.md)
- 커밋 4e9ea663 · 84ce3c9f · 854256ea HEAD 조상 · 작업 트리 깨끗
- 수락 기준 Task 1(grep 3종 · behavior 3) · Task 2(grep 2종 · behavior 4) 전부 통과
