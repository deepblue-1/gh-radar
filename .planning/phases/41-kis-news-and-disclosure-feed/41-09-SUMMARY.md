---
phase: 41-kis-news-and-disclosure-feed
plan: 09
subsystem: deploy
status: complete
tags: [deploy, supabase, cloud-run-job, server, vercel, uat, feed-filter]

requires:
  - phase: 41-01 ~ 41-08 · 41-12 ~ 41-14
    provides: "kis_news 표 · 조회 RPC · 수집기 · server 합치기 · 웹 세 자리"
provides:
  - "운영: 원격 마이그레이션 20261112100000 · 20261112200000 (+ UAT 보정 20261112300000 · 20261112310000 · 20261112320000)"
  - "운영: Cloud Run Job gh-radar-kis-news-sync + Scheduler 3개 (초당 5건 · 앱키 전용)"
  - "운영: server /api/news/by-stock · /api/stocks/:code/news 에 한투 뉴스·공시 합치기"
  - "운영: webapp 세 자리(종목 뉴스 목록 · 종목 정보 창 · 돌파 목록 · 펼친 상따 카드 띠)"
  - "UAT 보정 4건: auto_market 숨김(시세 한 줄 · 수급 자동) · 시황 제목 제외 · 네이버 제목 종목명 조건"
affects: [41-10, 41-11]

actuals:
  tasks: 3
  commits: 17   # e7afa328 ~ e65f5f26 (보정 · 기록 포함)
plan_head_before: 95783cfa6233f2e74579db328e4867a6ea1452e0
plan_head_after: e65f5f26
---

# Phase 41 Plan 09: 배포 · 화면 UAT Summary

한투 뉴스·공시 피드 본체(DB · 수집기 · server · webapp)를 운영에 올렸고, 사용자 화면 확인에서 나온 「재료 없는 기사」 지적 네 가지를 보정해 반영했다. UAT 는 사용자 「됐다」 로 통과.

## Task 1 — 배포 전 게이트

| 검사 | 결과 |
|------|------|
| `e951de6e..HEAD` 에서 `workers/news-sync` 변경 | 0 |
| 새 마이그레이션 두 개가 `news_articles` 변경 | 없음 |
| server 소스 · `deploy-server.sh` 에 한투 호출 · 비밀 | 없음 |
| `deploy-kis-news-sync.sh --self-test` | SELF-TEST OK |
| 전체 회귀 | webapp 6038 · server 1016 · shared 1276 · 수집기 188 · relay 2004 · pgTAP 145 통과 |
| 간헐 실패 | server ticks 테스트 1회 실패 → 재실행 통과(이번 작업과 무관한 기존 간헐 실패) |
| `41-VALIDATION.md` | nyquist_compliant · wave_0_complete true, 41-TBD 0 |

## Task 2 — 배포 (DB → 비밀 → 수집기 → server → 확인 → push)

- **DB (02:55 KST):** `20261112100000_kis_news_feed` · `20261112200000_kis_news_collector` Local · Remote.
- **비밀:** 사용자 `!` 실행으로 `gh-radar-kis-appkey` · `gh-radar-kis-appsecret` ENABLED. 앱키는 수집기 전용 → `KIS_NEWS_MAX_RPS` 5.
  - 첫 주입에서 시크릿 끝 `=` 가 잘려 EGW00105 → `setup-kis-secrets.sh` 를 줄 통째 읽고 첫 `=` 에서만 자르게 고침(`e7afa328`), 재주입 뒤 잘린 버전 1 사용 중지.
- **수집기:** 스모크 6/6 PASS — Cloud Run 발신으로 한투 1쪽(40건) 받아 4건 적재(VPC 경유 불필요). 로그에 토큰 · 시크릿 값 없음(비밀 이름 참조만). 토큰은 DB 캐시로 하루 1회 발급(첫 발급 03:22).
- **server:** 운영 `70a32dcd` 가 HEAD 조상임을 확인 뒤 배포 — 리비전 `gh-radar-server-00090-5dj`(이미지 `e7afa328`), 스모크 15/15.
  - `GET /api/news/by-stock?codes=005930,000660&days=3&limit=3` → 200 · `asOf` `+09:00` · `stocks` 2개 · 첫 요청 0.37초, 5초 안 재요청 0.07초(같은 `asOf`, 캐시).
  - `collectedAt` 은 느린 창(15분 주기)이라 다음 실행 대기 → 이후 장중 실행에서 채워짐.
- **push:** Phase 41 커밋 73개만(남의 미배포 커밋 없음) → Vercel 프로덕션 Ready.
- **gh-trade:** 운영 반영 알림(노트가 정본).

## 배포 뒤 보정 (UAT 중 사용자 요청 · 모두 운영 반영)

| 커밋 | 내용 |
|------|------|
| `803fe83a` · `152c172d` · `be06000b` · `08d595ec` | 뉴스 자료원을 한글 언론사 이름으로(응답 시점 표 · 원문 호스트 전용 조각 분리). 표본 영문 조각 31% → 약 2% |
| `77b680e6` | 홈 급등 요약 AI `claude-haiku-4-5` → `claude-haiku-5-5` (temperature 제거 · effort low · max_tokens 16000) |
| `8907a59a` | 재료 없는 한투 자동 기사(「<코>OO, 상한가 진입..」 · 시황 · 상위 N종목) `hidden_reason='auto_market'` + 소급 |
| `dd4bd44b` | 수급 자동 기사(「[장중수급포착]」 · 「52주 신고가 경신, 외국인 N일 연속 순매수」) 도 auto_market, 소급 2차 |
| `0bc17a9d` | 지수 얘기뿐인 시황 제목을 네이버 · 한투 뉴스 모두 `mergeStockFeed` 에서 제외 (급등 29종목: 지수 낱말 줄 88 → 25, 남은 줄에 시황 없음) |
| `95607989` | 네이버 뉴스는 제목에 종목명이 있는 기사만 — `stock_feed_by_codes` 가 종목당 상한 적용 전에 거름(우선주 → 본주 이름 · 띄어 쓴 이름 → 첫 낱말). 급등 29종목: 네이버 줄 570 → 205, 응답 시간 변화 없음(약 0.2초) |

결정 근거는 `41-CONTEXT.md` D-11 의 「UAT 보정」 1 ~ 3.

## Task 3 — 화면 UAT

사용자 답: 「됐다」 (2026-11-12, 장중 · 폰 · PC).

| 항목 | 결과 |
|------|------|
| 1. 종목 상세 뉴스 탭(배지 · 링크 없는 공시 줄 · ↗ · 자료원) | 됨 |
| 2. 종목 정보 창 「뉴스·토론」 · 새로고침 뒤 공시 유지 | 됨 |
| 3. 돌파 칩 · 더보기 표 「공」「뉴」 · 행 펼침 · 「추가」 는 카드 | 됨 |
| 4. 펼친 상따 카드 띠 · 펼침 · 빈 줄 문구 · 폰 폭 겹침 없음 | 됨 |
| 5. 접힌 카드에는 띠 없음 | 현행 유지(이의 없음) |
| 6. 새 글 30초 강조 | 됨(선택 항목, 별도 지적 없음) |

실패 항목 없음 → `41-VALIDATION.md` `status: validated` 서명.

## 남긴 것 (41-10 · 41-11 · 후속)

- home-sync 는 아직 `news_articles` 를 직접 읽어 오늘의 필터가 홈 AI 입력에는 적용되지 않음 → 41-10 에서 `stock_feed_by_codes` + `mergeStockFeed` 로 바꿈.
- 자료원 「공시」 인 주식선물 가격제한폭 확대요건 안내가 뉴스로 보임 · 약칭으로만 불리는 종목(에스엠 → 「SM엔터」) 네이버 기사 누락 → 후속 quick.
