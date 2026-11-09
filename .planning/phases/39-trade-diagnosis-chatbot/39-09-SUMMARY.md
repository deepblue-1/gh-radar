---
phase: 39-trade-diagnosis-chatbot
plan: 09
subsystem: deploy
tags: [deploy, uat, cloud-run, vercel, supabase, gh-trade, kind9, diagnosis]

requires:
  - phase: 39-01
    provides: "kind 9 43칸 매핑 노트(승인본 39-KIND9-NOTE.md) · gh-trade 발송"
  - phase: 39-02
    provides: "shared kind 9 라벨 · 사유 사전 · 문장 조립"
  - phase: 39-03
    provides: "RPC dma_diagnosis_for_user 마이그레이션 20261106100000"
  - phase: 39-04
    provides: "get_market_ticks 시세 도구 엔진"
  - phase: 39-05
    provides: "진단 전문가 도구 루프 · 하루 상한 · usage 로그"
  - phase: 39-06
    provides: "주문로그 「상태전이」 칩 · 챗 진행 표시 · 틱 보기 같은 탭"
  - phase: 39-07
    provides: "get_market_ticks 배선"
  - phase: 39-08
    provides: "진단 지식 프롬프트 완성본"
provides:
  - "프로덕션 배포: DB 20261106100000 · server 리비전 00076-jlw → 00078-gwb → 00079-6wx → 00082-bcd · webapp push a1136df0 · bd3105ec · 06333ece · e6879a2d(Vercel Ready)"
  - "UAT 지적 반영: 답변 모양 A(요약+표 · 쉬운 말 · 서버 기록 원문 접힘) · 틱 링크 클릭 가능(맨 경로 → 같은 탭 링크) · 틱 칩을 쓰이는 자리(표 행 · 문장)에 인라인"
  - "gh-trade kind 9 배포(11/6 17:13~17:14) · SysDisableOne · SysKillSwitch 송신(11/6 21:49~21:51) 반영 — 라벨 사전 · 진단 지식 · relay 생성물"
affects: []

actuals:
  tasks: 3
  commits: 11

key-files:
  created:
    - .planning/phases/39-trade-diagnosis-chatbot/reference/mockup-diagnosis-answer.html
  modified:
    - .planning/phases/39-trade-diagnosis-chatbot/39-VALIDATION.md
    - server/src/services/specialists/diagnosis/diagnosis-knowledge.ts
    - server/src/services/specialists/diagnosis/diagnosis-market.ts
    - server/src/services/specialists/__tests__/diagnosis-market.test.ts
    - webapp/src/components/chat/message-assistant.tsx
    - webapp/src/components/chat/__tests__/message-render.test.tsx
    - packages/shared/src/strategy-event-labels.ts
    - packages/shared/src/__tests__/strategy-event-labels.test.ts
    - packages/shared/src/strategy-event-text.ts
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/strategy-event-kind.ts

key-decisions:
  - "배포 시점: 사용자 「지금 하자」 — DB push 를 20:00 KST 규칙보다 앞당겨 11/6 15:22 진행(마이그레이션은 새 RPC 추가만)"
  - "답변 모양은 목업 A(요약+표) 채택 — 결론 한 문장 굵게 · 쉬운 말 2~3문장 · `### 무슨 일이 있었나` 시각 표 · 원문 사유/임계/실측은 ```server-log 접힘 블록"
  - "틱 링크는 끝에 몰지 않고 표 행 · 문장 끝에 인라인 칩(운영자 UAT 지적) — ISIN · 날짜 · 시각은 도구 결과에서만"
  - "「해제」(DisableStrategies 단건)도 kind 9 로 기록하도록 gh-trade 에 요청(사용자 결정 11/6) — SysDisableOne · SysKillSwitch 「전부 정지」 로 회신 · 구현 · 배포"
  - "bd3105ec push 에 옆 세션 stock-float quick 커밋이 섞여 있었고 사용자 결정 「함께 배포」"
---

# Phase 39 Plan 09: 배포 · 프로덕션 UAT 요약

**전체 회귀 green 뒤 DB → server → webapp 순으로 배포하고, UAT 지적(틱 링크 · 답변 가독성 · 틱 칩 위치)을 고쳐 재배포했다. gh-trade 가 kind 9 와 「해제」·「전부 정지」 기록을 켠 뒤 첫 장날(11/9) 적재를 확인했다.**

## Task 1 — 전체 회귀 게이트 (a1136df0)

| 항목 | 결과 |
|---|---|
| shared | 1149 통과 |
| server | 831 통과 (첫 실행 간헐 실패 2건은 시작 커밋 10e66fb8 에서도 재현 · 재실행 green) |
| webapp | 5703 통과 |
| 타입검사 4종 | 통과 |
| pgTAP | dma_diagnosis 61/61 · dma_strategy_read 30/30 |
| 배포 전 대조 | PREDEPLOY-OK — 진단 경로 외부 호출 0 · relay 무변경 · 노트 토큰 = 사전 · 이미지 Node v22.23.4 zstd |

VALIDATION 서명(nyquist_compliant · wave_0_complete true).

## Task 2 — 배포 (메인 세션)

| 시각(KST 11/6) | 대상 | 결과 |
|---|---|---|
| 15:22 | `supabase db push --linked` 20261106100000 | 적용 |
| 15:22~15:25 | server 00076-jlw | 스모크 통과 · 무인증 401 |
| 15:25 | push a1136df0 | Vercel Ready |
| 15:48 | server 00078-gwb · push bd3105ec | 답변 모양 A · 틱 링크 클릭 가능 |
| 16:00 | server 00079-6wx · push 06333ece | 틱 칩 인라인 |
| 21:40~21:47 | server 00082-bcd(APP_VERSION e6879a2d) · push e6879a2d | SysDisableOne · 「전부 정지」 라벨 · 진단 지식 — 스모크 15/15 · Vercel Ready |

배포 전마다 운영 APP_VERSION 이 HEAD 의 조상인지 확인. 이후 옆 세션 배포(현재 5ddfc6ee)도 b535f22a 를 포함.

gh-trade: kind 9 서버 배포 11/6 17:13~17:14(KB120 · 교보119 · 교보112, 42c34a07 포함) · Sys 기록 배포 21:49~21:51(7851c7cc). 인박스 처리: 261106-kind9-state-transition-impl(bc9ec60c) · 261106-kind9-sys-disable(b535f22a).

## Task 3 — 프로덕션 UAT

**사용자 답(원문, 11/9):** 「사용자 확인 다 문제없고, 나머지 단계 다 진행해줘」 — A~F 통과.

| 항목 | 결과 |
|---|---|
| A 시험 문항 ①·② | 사용자 확인 OK |
| B 다시 열어도 같은 글자 | 사용자 확인 OK |
| C 틱 링크 같은 탭 | 사용자 확인 OK (UAT 1차 지적 「글자로만 나옴」 → 17244e29 · 06333ece 로 수정 후 재확인) |
| D 다른 계정 불가 | 사용자 확인 OK |
| E 모델별 로그 | Cloud Logging 확인 — `[chat] diagnosis usage`(rounds 4 · durationMs 60~65초 · marketRecords 400 · `claude-opus-5-5`) · `[chat] diagnosis tool`(search_stock → get_order_log → get_market_ticks) 줄 11/6 · 11/9 모두 있음 |
| F 「상태전이」 칩 · 폰 폭 | 사용자 확인 OK |
| G 라이브 스크립트(선택) | 미실행 — 로컬 ANTHROPIC_API_KEY 없음(토큰 측정도 같은 이유로 보류) |

**UAT 지적과 수정(11/6):**
1. 「틱 보기: /analytics/ticks?…」 가 글자로만 나와 클릭 불가 → 도구가 마크다운 링크로 내고, 웹이 맨 경로도 같은 탭 링크로 바꿈(17244e29).
2. 답변이 「조건: 사유="B6Sell1 잔량(…)", 임계=…」 처럼 읽기 어려움 → 목업 A/B/C 중 A(요약+표) 채택, 원문은 접힘 블록(bd3105ec · 076610f7).
3. 운영자: 끝에 몰린 같은 라벨 틱 칩은 어느 근거인지 모름 → 표 행 · 문장 끝 인라인 칩(06333ece).

### H — 시험 문항 ③ 처리 (D-11: phase 를 열어 두지 않음)

원 문항(11/5 13:10:25 설정 재제출로 선매수 다시 켜짐)은 kind 9 적재(11/6 17:14~) 이전이라 **그날 기록이 영구히 없다** — 원 문항 그대로는 확인 불가. 대신 kind 9 적재를 실측했다.

| 날짜 | kind 9 행 | 내용 |
|---|---|---|
| 11/6 | 0 | 재기동 뒤 값이 바뀐 제출 · 자동 전이 없음(gh-trade 로그 확인 — 같은 값 재제출 + 단건 해제) |
| 11/7(토) | 2 | KYOBO119 CfgSubmit |
| 11/9 ~14:20 | 445 | CfgSubmit 297 · Auto* 129 · SysDisableOne 19 · SysKillSwitch 0 |

Q4(gh-trade 요청 — CfgSubmit 폭주 여부): 297행 전부 제출자 있음(junysim 214 · milles 82 · ezmesya 1). 스위치 무변경 「값 변경」 171행도 message 빈 것 0 · 같은 종목 같은 message 10초 안 반복 0 → 기준선 되싣기 같은 자동 반복 없음. gh-trade 에 메시지로 보고.

11/9 14:07~14:14 운영 진단 3회 정상 완료(get_order_log 46,252자 — kind 9 가 쌓인 날은 11/6 의 25,708자보다 커짐, 상한 안).

## Deviations

- DB push 를 20:00 규칙보다 앞당김(사용자 결정).
- Task 3 중 UAT 지적 3건을 이 플랜 안에서 고쳐 재배포(별도 quick 없이) — 표면이 진단문 렌더 · 지식 프롬프트로 이 phase 범위.
- gh-trade 「해제」 기록 요청 · 회신 반영(b535f22a)도 이 플랜 안에서 처리.

## 남은 것 (phase 밖)

- 라이브 스크립트 G · 시세 토큰 실측: 로컬 키 없음으로 보류.
- SysCommand · SysCloseOff · SysRestore · CfgRearm · 2차 토큰: gh-trade 측 이름만 예약.

## Self-Check: PASSED
