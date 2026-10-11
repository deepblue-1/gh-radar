# Phase 9: Daily Candle Data - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 09-daily-candle-data
**Areas discussed:** Data Source 전략, Schema 범위 + 수정주가, Backfill 실행 모델, EOD 타이밍 + Scheduler

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| 데이터 소스 전략 | KRX bydd_trd vs KIS chart vs hybrid + universe(활성/폐지) 처리 | ✓ |
| 스키마 범위 + 수정주가 | OHLCV 최소 vs 부가 필드 + 수정주가 정책 | ✓ |
| 백필 실행 모델 | 단일 Job vs 청크 cursor vs 잡 분리 | ✓ |
| 증분 스케줄 + EOD 타이밍 | KRX 갱신 시각 가정 + Scheduler cron 설계 | ✓ |

**선택:** 4 영역 모두

---

## 데이터 소스 전략

| Option | Description | Selected |
|--------|-------------|----------|
| KRX bydd_trd 단일 (추천) | 날짜×시장 1 call, ~1,440 calls/3yr, KIS quota 분리, 폐지종목 자연 포함 | ✓ |
| KRX + KIS 하이브리드 | KRX 백필 + 누락 KIS 보완. 복잡도↑, KIS quota 일부 경합 | |
| KIS chart 단일 | 종목별 history. ~5,600+ calls + ingestion/server 와 KIS 10/sec 경합 심각 | |
| pykrx 회귀 | Python 라이브러리. Node 스택 불일치, PROJECT.md 후순위 | |

**User's choice:** "KRX bydd_trd 로 데이터가 충분한지 검증부터 하고 문제없으면 이걸로 하자"
**Notes:** 기본 채택은 KRX bydd_trd 단일이지만, RESEARCH 단계에서 데이터 충분성 검증이 전제. 검증 실패 시 fallback 은 hybrid/pykrx — planner 재결정. → CONTEXT.md D-01

---

## 스키마 범위 (필드)

| Option | Description | Selected |
|--------|-------------|----------|
| ROADMAP 최소 (추천) | code/date PK + open/high/low/close/volume/trade_amount. ~2M행, 단순 | |
| + market_cap | MKTCAP 추가 8B/행. 시가총액 기반 스크리닝 유리 | |
| + change_amount/change_rate | CMPPREVDD_PRC + FLUC_RT 포함. 일별 등락률 분석 수월 | ✓ |
| 풍부 (KRX 응답 전부) | MKTCAP/LIST_SHRS/시장구분/소속부 등 전부. 용량↑, 미래 자유도↑ | |

**User's choice:** "+ change_amount/change_rate"
**Notes:** ROADMAP 최소 + change_amount + change_rate. market_cap 은 stocks 마스터 join 으로 계산 (별도 컬럼 X). → CONTEXT.md D-03

---

## 수정주가 정책

| Option | Description | Selected |
|--------|-------------|----------|
| raw close 만 저장 (추천) | KRX 응답 그대로. 단순, v1 시각화/패턴 충분. 수정주가는 v2 | |
| raw + adj_close 2권 | 수정 계수 계산/일괄 재조정 로직 필요. 복잡도↑ | |
| 수정주가만 저장 | KIS/별도 소스 필요 (KRX bydd_trd 는 raw). 데이터 소스 계획 충돌 | |
| Claude 가 결정 | RESEARCH 후 planner 재량 | |

**User's choice:** "수정주가로 저장하고 싶은데, KRX/KIS API 어떤걸 써야할지 다시 고민해보자."
**Notes:** 수정주가 우선 의도 표명 → 소스 비교(KIS chart / pykrx / KRX raw + 후속 phase) 재제시 후 재선택.

---

## 수정주가 확보 경로 (재선택)

| Option | Description | Selected |
|--------|-------------|----------|
| KIS chart API | FHKST03010100 + FID_ORG_ADJ_PRC. 종목별 호출, EOD 16시 이후 KIS quota 자유 | |
| pykrx Python container | get_adjusted_market_ohlcv. 비공식 스크래핑, Python runtime 신규 | |
| KRX bydd_trd raw 먼저 | raw 로 출발, 수정주가는 후속 phase | ✓ |
| RESEARCH 이후 결정 | 검증 후 planner 재량 | |

**User's choice:** "KRX bydd_trd raw"
**Notes:** Phase 9 = raw 로 출발. 수정주가 처리는 후속 phase 로 deferred. → CONTEXT.md D-04

---

## 백필 실행 모델

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 Job 한방 (추천) | task-timeout=3600s + idempotent UPSERT. ~12-24분 완료. 재실행 안전 | ✓ |
| 청크별 수동 진행 | 1개월 단위 ~44 calls 청크. 단계별 검증, 단순 KRX 하이지크 회피 | |
| Backfill+Daily 잡 통합 | 단일 Job + MODE env. 이미지 1개 | |
| Backfill+Daily 잡 분리 | 별도 잡 2개. 책임 분리 명확 | |

**User's choice:** "단일 job 으로 하자. 그리고 최근 3년이 아니라, 2020년 1월 1일부터 데이터를 모으고 싶어."
**Notes:** 단일 Job + idempotent. Backfill 범위 = 2020-01-01 ~ 현재 (~1,600 영업일 × 2 시장 = ~3,200 calls, ~4M 행). ROADMAP SC #1 의 "3년치 / ~2M 행" 표현 갱신 필요. → CONTEXT.md D-06, D-07. (Backfill+Daily 통합은 D-08 로 별도 캡처 — 이미지 1개)

---

## 증분 Scheduler cron + EOD 타이밍

| Option | Description | Selected |
|--------|-------------|----------|
| 익일 08:10 KST (추천) | master-sync 와 동일. KRX 갱신 완료 후 안정. -1 영업일 신선도 | |
| 17:30 KST 평일 | ROADMAP SC #3 충실. KRX 당일 데이터 조기 반영 가정 | |
| 17:30 1차 + 08:10 보완 | 신선도↑ + 누락 방지. 운영 복잡도↑ | ✓ |
| RESEARCH 결과로 결정 | KRX 갱신 시각 실측 후 planner 재량 | |

**User's choice:** "17:30 1차 + 08:10 보완"
**Notes:** 신선도 + 누락 방지 양립. idempotent UPSERT 로 양쪽 호출 안전. → CONTEXT.md D-09

---

## 보완 잡 lookback 윈도우

| Option | Description | Selected |
|--------|-------------|----------|
| 전영업일 1일치 (추천) | 가장 단순. 17:30 실패 시 다음날 1회 보완 | |
| 최근 5영업일 | 1주 롤링. 10 calls/잡. 결측 자연 복구 | |
| DB 적응적 감지 | DB row=0 일자 식별 후 필요한 일자만. 구현↑, calls 최소 | ✓ |

**User's choice:** "DB 적응 감지"
**Notes:** 가장 sophisticated. DB 쿼리로 결측 일자 자동 식별 후 재호출. 정확한 알고리즘(lookback N, threshold, max calls/run)은 planner 재량. → CONTEXT.md D-10

---

## Done — 추가 영역?

| Option | Description | Selected |
|--------|-------------|----------|
| 이제 CONTEXT 작성 | 캡처된 결정으로 CONTEXT.md + DISCUSSION-LOG.md 작성 | ✓ |
| 추가 논의 영역 탐색 | RLS / 모니터링 / 리텐션 / 자원 사이징 등 | |

**User's choice:** "이제 CONTEXT 작성"

---

## Claude's Discretion

CONTEXT.md `<decisions>` Claude's Discretion 절 참조:
- 결측 감지 알고리즘 정확 명세 (lookback N, threshold, max calls/run)
- 휴장일 가드 — holidayGuard.ts 직접 import vs KRX 빈응답 자연 skip
- 인덱스 전략 — `(date)` 만 vs 분석 친화 인덱스 추가
- task-timeout 정확값 — RESEARCH 의 KRX rate 실측 후
- 테이블 이름 (`stock_daily_ohlcv` 후보)
- DATA-01 SC #5 임계 정의 (CONTEXT D-15 가이드라인 기준 구체화)
- Backfill / Daily / Recover MODE 분기 구조
- KRX 응답 0 row 분기 (휴장 vs 빈 응답 vs 장애)
- ROADMAP SC #1 표현 갱신 시점 (plan 단계 vs 실측 후)

## Deferred Ideas

CONTEXT.md `<deferred>` 절 참조:
- 수정주가(adj_close) 처리 — 후속 phase
- 분/주/월봉 OHLCV — 일봉만, 주/월봉은 view 파생
- 부가 메타 (market_cap 컬럼/PER/PBR/관리종목/외국인 매매동향) — 후속 phase
- 차트 UI / 시계열 분석 화면 — 후속 phase
- 분석 RPC / 가격 패턴 식별 함수 — 후속 phase
- 외국 종목 (NYSE/NASDAQ) — REQUIREMENTS Out of Scope, v2
