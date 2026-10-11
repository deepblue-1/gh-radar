# Phase 12: 상한가 다음날 이력 통계 — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 12-a-n-master-sync
**Areas discussed:** 상한가 이벤트 판별 기준, 테마 모멘텀 카드(L2), 표시 파라미터 게이팅, 배치 아키텍처·주기

---

## 진행 방식 (게이트)

CONTEXT.md 부재 — "discuss-phase 먼저 실행" 선택. ROADMAP/STATE에 v1 방향(A안/C안/종목자체이력/색상)은 확정돼 있어, 열린 결정(스키마·이벤트판별·표시파라미터·배치)만 좁혀 논의.

논의 영역 선택(multiSelect): **4개 영역 전부 선택**.

---

## 상한가 이벤트 판별 기준

| Option | Description | Selected |
|--------|-------------|----------|
| change_rate ≥ 29.0% | 비율 임계, near-limit 포함, >31% 아티팩트 제외 | |
| 밴드 29.5~30.5% | 비율 밴드, 정밀 | |
| change_rate ≥ 30.0% 엄격 | 진짜 30%만 | |

**User's choice:** (정정) **비율 임계 폐기** — "상한가 가격은 정해져있으니까 비율로 따지지말고 상한가 가격을 터치했냐고 따지는걸로." → 전일 종가로부터 산출한 상한가 결정값 가격 매칭 채택.
**Notes:** stock_daily_ohlcv에 과거 upper_limit 미저장이나, 상한가 가격 = 전일 종가 × 1.30 → KRX 호가단위 정리로 일봉 재구성 가능. researcher가 호가단위 테이블·반올림 규칙 확정. → D-01.

### 도달 기준 (후속)

| Option | Description | Selected |
|--------|-------------|----------|
| 마감상한가(종가==상한가) | 종가가 상한가에서 굳은 날. 매수가정 일치. | ✓ |
| 장중 터치(고가==상한가) | 고가 터치만으로 카운트(종가 미달 포함) | |

**User's choice:** 마감상한가(종가==상한가). → D-02.

### 점상 태그 판별 (후속)

| Option | Description | Selected |
|--------|-------------|----------|
| 시=고=저=종=상한가 | 다섯 가격 모두 상한가(아침부터 굳음) | ✓ |
| 저=고(당일 변동없음) | 저==고만으로 판별 | |

**User's choice:** 시=고=저=종=상한가. → D-03.

---

## 테마 모멘텀 카드(L2)

| Option | Description | Selected |
|--------|-------------|----------|
| 소속 시스템테마 전부 · N 내림차순 | system 테마(네이버/알파/AI) 전부, 표본수 내림차순, 유저테마 제외 | ✓ |
| 상위 3개 · 익절률 내림차순 | 익절률 높은 3개만 | |
| 상위 3개 · N 내림차순 | 표본 많은 3개만 | |

**User's choice:** 소속 시스템테마 전부 · N 내림차순. → D-15~D-18.
**Notes:** 데이터 = theme_stocks active 멤버 풀링 + 동일 백테스트 로직 24개월 신규 집계.

---

## 표시 파라미터 게이팅

### Lookback

| Option | Description | Selected |
|--------|-------------|----------|
| 24개월 | co-movement·목업 일관, 최근 레짐 | ✓ |
| 전체 이력(~2020) | 표본 최대, 오래된 레짐 혼입 | |
| 36개월 | 절충 | |

**User's choice:** 24개월. → D-04.

### 확률% 노출 게이팅

| Option | Description | Selected |
|--------|-------------|----------|
| N≥5일 때만 % | STATE 초안 | |
| 항상 % | 표본 무관 | |
| N≥3으로 완화 | 3회부터 % 노출 | ✓ |

**User's choice:** N≥3으로 완화. → D-09.

---

## 배치 아키텍처·주기

| Option | Description | Selected |
|--------|-------------|----------|
| 신규 thin 워커(co-movement-sync 복제) | RPC 1줄 호출 워커 + Cloud Run Job/Scheduler, EOD 이후 야간 | ✓ |
| 기존 master-sync 워커 확장 | 슬러그 a-n-master-sync 시사하나 성격 상이 | |

**User's choice:** 신규 thin 워커(co-movement-sync 복제). → D-19~D-22.

### 요구사항 ID 등록 (후속)

| Option | Description | Selected |
|--------|-------------|----------|
| LIMIT-01 정식 등록 | REQUIREMENTS.md 등록, traceability | ✓ |
| 등록 안 함 | phase_req_ids=null 유지 | |

**User's choice:** LIMIT-01 정식 등록. → REQUIREMENTS.md + ROADMAP 갱신 완료.

---

## Claude's Discretion

- 사전계산 테이블 스키마/PK/인덱스·RPC CTE 구조, 히스토그램 버킷 경계·바 색상 임계, 더보기 페이지네이션·faded 기준, 회전율 근사 처리, change_rate 교차검증 사용 여부, 테마 카드 노출 개수, 빈 상태 카피.

## Deferred Ideas

- 상한가 잠긴 시각/매수잔량(EOD 불가, KIS 실시간 — v2), 시장평균/shrinkage(v1 미채택), 고가 기반 청산모델(v2), 장중 터치이나 종가 미달 이벤트(v1 제외).
