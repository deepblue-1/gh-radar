---
phase: 37-tick-viewer
plan: 16
subsystem: deploy
tags: [deploy, supabase, cloud-run-job, scheduler, cloud-run, vercel, uat, tick-viewer]
status: complete

requires:
  - phase: 37-tick-viewer (37-01 ~ 37-15 · 37-18 · 37-19)
    provides: "과거 경로 전체(DB · 변환 Job · server /api/ticks/* · 웹 진입 · 뷰어 · 팀 패널 · 「틱 보기」 · 딥링크) + 당일 경로 코드(꺼짐)"
provides:
  - "운영 반영: 마이그레이션 3개 · Cloud Run Job gh-radar-tick-convert + Scheduler 23:30 · 01:30 · server 리비전 gh-radar-server-00070-nj7(TICKGW_URL 없음) · Vercel 프로덕션"
  - "10/30 nightly 실측(SC 3) · 밤 변환 첫 이틀 기록 · 실사용 확인 A~H"
affects: [37-17]

actuals:
  tasks: 3
plan_head_before: caaaf52acb891825bcccc2d9345b1d6eed656473
plan_head_after: 3eb4b8935db2733ce2db812f838425377f2acdec

key-files:
  created:
    - supabase/migrations/20261103090000_stock_quotes_ohlc_updated_at.sql
    - workers/tick-convert/tests/too-large.test.ts
  modified:
    - workers/tick-convert/src/stage.ts
    - workers/tick-convert/src/store.ts
    - workers/tick-convert/src/meta.ts
    - workers/tick-convert/src/modes/nightly.ts
    - workers/tick-convert/src/modes/request.ts
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/src/components/ticks/tick-state-card.tsx
    - webapp/src/components/layout/app-sidebar.tsx

key-decisions:
  - "격자 50MB(버킷 file_size_limit) 초과 키는 실패가 아니라 건너뜀 — nightly too_large 카운트 · request TOO_LARGE(종료 0) · 웹은 재시도 없는 「이 종목은 그날 전문이 너무 많아 뷰어로 열 수 없어요」 (사용자 결정 2026-11-02: 「건너뛰고 표시 (권고)」)"
  - "nightly 스테이징 OOM(10/30 실측 signal 9 · 메모리 93%) 원인 = zstdCompressSync 결과가 64KB 출력 버퍼 slice 를 붙잡음 → 제 길이로 복사(최대 34%)"
  - "틱뷰어 오늘 목록 「15%↑」 오표시(11/3 08:24 · 7종목 · 10/28 묵은 고가) → stock_quotes.ohlc_updated_at + 트리거 · tick_today_for_user 는 오늘 고가만(사용자 허가로 장중 08:58 원격 반영)"
  - "메뉴명 「틱 전문 뷰어」 → 「틱뷰어」 · 분석 하위 맨 위 · 진행 카드 도는 고리 + 「N%」 (사용자 요청 2026-11-03)"

requirements-completed: []

completed: 2026-11-03
---

# Phase 37 Plan 16: 배포 · 실측 · 실사용 확인 Summary

**과거 경로를 운영에 올렸다 — 마이그레이션 3개 · 변환 Job + Scheduler(23:30 · 01:30) · server(당일 경로 꺼짐) · Vercel. 10/30 실측에서 OOM 과 50MB 초과 업로드 실패가 나와 둘 다 고친 뒤 재배포했고, 첫 이틀 밤 변환은 성공했다. 사용자 실사용 확인 A~G OK.**

## 배포 (Task 2 · 2026-11-02 밤 KST)

| 대상 | 결과 |
|---|---|
| `supabase db push --linked --yes` | 20261102200000 · 200100 · 200200 반영(약 22:1x KST) |
| 변환 Job | `setup-tick-convert-iam.sh` → `deploy-tick-convert.sh`(NOTIFICATION_CHANNEL_ID 14409521670382124894) · 이미지 05f31ce5 |
| Scheduler | `gh-radar-tick-convert-nightly`(30 23) · `-nightly-late`(30 1) ENABLED |
| server | `gh-radar-server-00070-nj7` · CORS · RELAY_INTERNAL_URL 라이브 값 · TICKGW_URL 없음 · 무인증 /api/ticks/* 401 ×4 |
| 웹 | `git push` caaaf52a..05f31ce5 → Vercel Production Ready |

중간 사고: 첫 실측 실행이 OOM(signal 9)으로 실패해 알림 「gh-radar-tick-convert-failure」 가 한 번 열렸다. 디버깅 동안 Scheduler 를 멈췄다가 수정 배포(de71b2e6) 뒤 재개했다.

## SC 3 실측 — 10/30 nightly

| 거래소 | 대상 | 씀 | 읽은 바이트 |
|---|---|---|---|
| KRX | 141 | 140 | 3,607,971,394 |
| NXT | 138 | 138 | 836,341,821 |

- staged 최대 1,945,511,090B · 소요 876초(약 14.6분) · 비용 ≈ $0.22/일(읽은 GB × $0.05)
- 격자 278개 · 중앙값 약 398KB · 합계 약 284MB · 최대 크리에이츠 KRX 14.8MB
- KRX 1건 = 인텔리빅스 KR7420610008 73,372,531B(50MB 초과 → 건너뜀)

## H — 밤 변환 첫 회차 (11/2 → 11/3)

| 회차 | 변환한 날짜 | 결과 |
|---|---|---|
| 23:30 | 10/30 · 10/29 | 성공 · deferred 3 · purge=ok |
| 01:30 | 11/2 · 10/28 · 10/27 | 성공 · deferred 1 · purge=ok |

- 50MB 초과 건너뜀: 10/30 인텔리빅스 73.4MB · 11/2 영광(KR7359410008) 61.6MB
- 남은 따라잡기 1일은 다음 밤 회차

## 실사용 확인 (Task 3)

사용자 답 원문: 「A-G ok」 (2026-11-03)

- A 게이트 · 사이드바 — OK(이후 메뉴명 「틱뷰어」 · 분석 하위 맨 위로 변경)
- B 과거 날짜 뷰어 — OK
- C 천일고속 10/14 골든(실현 28,621,939 · 미실현 3,160,411 · 합계 31,782,350 · 끝 잔량 3,406주) — OK
- D 「틱 보기 ›」 — OK
- E 딥링크 — OK
- F 오늘 종목 → 「당일 자료 준비 중」 — OK(당일 경로는 37-17)
- G 폰 390 · 3판 판단 — OK(3판 유지)
- H — 위 표, 이상 없음

## 실사용 중 나온 후속 수정 (3eb4b893)

- 오늘 목록 「15%↑」 오표시: 한양디지텍 +24.5%(실제 −5.1%) 등 7종목이 10/28 고가로 판정됨. 고가 신선도 컬럼 + 트리거로 고침 · 09:00 실측 15%↑ 186 → 1
- 메뉴명 · 순서 · 진행 카드 회전 아이콘 + %
