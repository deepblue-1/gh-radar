---
phase: 41-kis-news-and-disclosure-feed
plan: 11
subsystem: ops · home-sync
status: complete
tags: [home-sync, deploy, ops-check, d-10, d-19]
requires:
  - phase: 41-09
    provides: "피드 본체 운영(수집기 · RPC · 웹 ① ~ ③)"
  - phase: 41-10
    provides: "홈 AI 재료에 [공시] 줄 · 웹 ④ 「공시」 배지"
provides:
  - "D-19 홈 AI 호출 수 전후 비교 · D-10 공시 종류 사용자 확인 · SC-1 · SC-4 운영 수치 기록"
affects: []
actuals:
  tasks: 2
  commits: 1
key-files:
  created:
    - .planning/phases/41-kis-news-and-disclosure-feed/41-11-SUMMARY.md
  modified:
    - .planning/phases/41-kis-news-and-disclosure-feed/41-VALIDATION.md
key-decisions:
  - "D-10: 더 숨길 공시 종류 없음(사용자 2026-11-13) — 숨김 규칙(ETF · 파생 안내) 그대로"
  - "D-19: 호출 수가 늘지 않아(−3%) 「뉴스는 바뀜 판정에서 빼기」 후속 불필요"
---

# 41-11 요약 — 홈 AI 묶음 배포 · 하루 뒤 운영 확인

## Task 1 — 배포 (2026-11-12, 메인 세션)

- 기준선(배포 전 평일 3일 · 「home-sync cycle complete」 `claudeCalled=true`): 11/9 427 · 11/10 500 · 11/11 507 → **평균 478회/일**
- 41-10 home-sync 배포 후 첫 `[공시]` 줄 호출 로그: 2026-11-12 13:50 KST(`disclosureLines` 기록 시작)
- 웹 ④ 는 master push 로 Vercel 반영
- 이후 2026-11-13 gh-trade 인박스 처리(e762eb75)로 home-sync 이미지가 `home-sync:e762eb75` 로 바뀜(종목별 최근 공시 2건 보장 — 같은 재료 계약 안)

## Task 2 — 하루 뒤 확인 (2026-11-13 20:02 이후)

### 1. 홈 AI 하루 호출 수 (D-19)

| 날짜 | 호출 수 | 비고 |
|---|---|---|
| 기준선 평균 | 478 | 11/9 · 11/10 · 11/11 |
| 11/12 | 391 | 배포 당일(13:50 부터 새 재료) |
| **11/13** | **463** | 배포 다음 평일 — **−3%** |

- 11/13 의 463회 모두 `stopReason=end_turn`(잘림 0) · 출력 1,598,048 토큰(생각 몫 포함)
- 모델 `claude-haiku-5-5`(11-12 4.5 → 5.5): 입력 $0.10 · 출력 $0.50 / MTok(프롬프트 100K 이하)
  - 출력 ≈ **$0.80/일** · 입력은 로그에 `inputTokens` 가 없어 추정(호출당 ~8K × 463 ≈ $0.4) → **하루 약 $1.2 안팎**
  - (보고 중 플랜의 Haiku 4.5 단가로 「$8」 을 먼저 말했다가 정정 — `tasks/lessons.md` 2026-11-13)
- 두 배를 넘지 않음 → 후속 quick 제안 없음

### 2. 수집 운영 수치 (SC-1 · SC-4) — `kis-news-report.sh stats 1`

| 항목 | 값 | 목표 |
|---|---|---|
| 공시 수신 지연 중앙값 | **3.3초** | 15초 이하 |
| 공시 수신 지연 90% | 5.5초 | — |
| 뉴스 수신 지연 중앙값 | 16.5초 | (참고) |
| 하루 한투 호출 수(`kis_news_title`) | 91,179 | 자체 상한 200,000 의 46% |
| 한도 의심 표시 | 0 | 0 |
| 하루 글 수 | 2,348(뉴스 1,945 · 공시 403) | — |
| 빠른 창 실행 | 임대 잡은 실행 1개(`gh-radar-kis-news-sync-9hzvn`, 07:00 시작 · 20:00 「fast window end — stopping」) · 나머지 155회 깨움은 「lease held by another run — exiting」 | 1개 |

- 참고: 네이버 뉴스 호출 14,520(11/10 14,728 · 11/11 14,721 · 11/12 15,074 — 평소 수준)

### 3. 공시 종류 목록 (D-10) — `kis-news-report.sh kinds 1`

하루 403건 · 묶음 201개. 사용자에게 보인 목록(보임 211건):

1. 기업설명회(IR) 개최 — 28
2. 실적(잠정실적 · 매출 변동) — 18
3. 주주총회 · 주주명부 · 기준일 — 27
4. 배당 — 5
5. 자사주 취득 · 처분 · 소각 — 17
6. 증자 · 감자 · CB/BW · 추가상장 · 액면 — 36
7. 공급계약 — 10
8. 시장경보 · 관리종목 · 불성실 · 조회공시 — 31
9. 합병 · 양수도 · 투자 · 지배구조 · 소송 · 회생 — 21
10. 그 밖의 경영사항 — 18
11. (지금 숨김 `etp`) ETF 괴리율 · ETF 기타시장안내 — 156
12. (지금 숨김 `derivative_notice`) 주식선물 가격제한폭 확대 · ETN 괴리율 · ELW 상장 — 36

### 4 · 5. 사용자 답 (원문)

> 1. 숨기고 싶은 종류 없음
> 2. 토큰 알림톡 1회 왔어
> 3. 됨

- D-10: 더 숨길 종류 없음 · 다시 보일 종류 없음 → 숨김 규칙 변경 없음(후속 quick 없음)
- 토큰 알림톡 1회 → 정상(토큰 재사용 문제 없음, 후속 debug 없음)
- ④ 홈 급등 카드 「공시」 배지 · 「코스닥 공시 · 시각」 줄 · 눌러도 안 열림 → **됨**

## 후속

- 없음(필수). 선택: home-sync 호출 로그에 `inputTokens` 추가하면 비용 추정 없이 정확히 볼 수 있다(사용자에게 제안만).

## Self-Check: PASSED

- VALIDATION Manual-Only D-10 · D-19 · SC-1 · SC-4 「결과:」 채움 · `NEXT-DAY-RECORDED`
- 이 플랜 커밋에 수집기 코드 변경 없음(문서만)
