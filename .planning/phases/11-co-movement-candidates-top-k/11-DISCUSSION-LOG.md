# Phase 11: Co-movement Candidates — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 11-co-movement-candidates-top-k
**Areas discussed:** 하이브리드 결합, 노출 기준+빈 상태, 후행(D+1) 표현, 행 구성+TOP-K+메가캡

> 사전 작업: 이 phase는 add-phase 직후 같은 세션에서 코드베이스 4-레이어 병렬 스카우트 + read-only 실측 probe(이벤트 희소성·테마 커버리지·테마-독립 동조 recall·Pearson)를 거쳐, 상위 결정(통계단위 하이브리드 / D0+D+1 / 테마없음 빈상태 / SQL 사전계산)은 carry-forward로 확정된 상태에서 시작. 아래는 남은 구현 디테일 gray area 4종.

---

## A. 하이브리드 결합 방식

**데이터 동인:** 강한 동조 376쌍 중 41% 테마무관(ρ 0.66~0.91 포함) → 테마-게이팅 recall ~60%. 테마-독립 동조가 실재.

| Option | Description | Selected |
|--------|-------------|----------|
| 둘 다 v1 (테마+co-surge) | 후보풀 = 테마멤버 ∪ 고동반(≥5회) co-surge 이웃, 근거 라벨. 41% 테마무관 + 테마없는 앵커 포착. 같은 이벤트 부분집합이라 비용 거의 동일 | ✓ |
| 테마 우선, co-surge는 fallback | 테마 있는 앵커는 테마풀링만, 테마없는 ~11%만 co-surge. 테마종목의 테마무관 동조(31%) 놓침 | |
| v1 테마 전용, co-surge는 v2 | 가장 단순·정확. 41% 놓치고 테마없는 앵커 빈 상태 | |

**User's choice:** 둘 다 v1 (테마-풀링 + 글로벌 co-surge 그래프)
**Notes:** 사용자가 "테마와 별개로 상관계수 높은 종목쌍이 있는지" 직접 질문 → 실측으로 41% 테마무관 + Pearson ρ 검증 후 결정. production은 co-surge 빈도 사용, ρ는 검증용.

---

## B. 노출 기준 + 빈 상태

| Option | Description | Selected |
|--------|-------------|----------|
| 고신뢰 우선 | 테마 conf_d0≥0.4 & 발화일≥8 / co-surge ≥5회. 적지만 정확. 임계 미달 숨김 | |
| 포괄 + 신뢰도 배지 | 낮은 임계(테마 발화일≥5, co-surge≥3) 더 많이 노출 + 신뢰도·표본수 배지로 약한 후보 구분 | ✓ |
| TOP-K 항상 채움 + 신뢰 정렬 | 임계 없이 상위 K, 약한 건 dimmed. 빈 상태 최소화하나 약한 후보가 시그널처럼 보일 위험 | |

**User's choice:** 포괄 + 신뢰도 배지
**Notes:** 노출 임계(≥5/≥3)와 테마 점수 계산 안정성 임계(≥8)는 별개 축 — planner가 분리 확정.

---

## C. 후행(D+1) 표현

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 리스트 + '후행형' 배지 | 하나의 TOP-K, D+1 우세 후보에 배지. 정렬은 결합 점수 | ✓ |
| 동반/후행 그룹 분리 | '오늘 동반'(D0)/'내일 후행'(D+1) 두 묶음. 액션 명확하나 UI 복잡 | |
| 점수에만 반영, 표시 통합 | 결합 점수로만, UI 구분 없음. 후행 정보 손실 | |

**User's choice:** 단일 리스트 + '후행형' 배지

---

## D. 행 구성 + TOP-K + 메가캡

행 구성·K 기본값(종목명/코드·실시간 등락률·동반율·표본수·근거·후행배지·강도바 / K=8)은 Claude 제안 수용. 정한 것은 메가캡/다중테마 노이즈 억제:

| Option | Description | Selected |
|--------|-------------|----------|
| 테마 타이트니스 가중 | 헐렁한 대형 테마 기여↓, 작고 응집된 테마·강한 co-surge 우대. 하드컷 없음 | ✓ |
| 후보 캡 + 시총/유동성 필터 | 후보 상한 + 메가캡·저유동 제외. 단순하나 거친 컷 | |
| 둘 다 (가중+캡) | 정밀하나 튜닝 부담 | |

**User's choice:** 테마 타이트니스 가중
**Notes:** 1차 응답이 "쉬운 설명 필요" → 삼성전자 34테마 앵커 폭발 + 헐렁한 대형 테마 희석 예시로 재설명 후 결정. 메가캡은 ≥15% 급등이 드물어 co-surge 후보로는 자동 배제됨을 확인.

## Claude's Discretion
- 정확한 스키마/SQL 함수/부분 인덱스, 타이트니스 가중 공식·결합 가중치, 정확한 노출 컷, 배지/강도바 토큰, RPC vs Express 라우트.

## Deferred Ideas
- co-surge → 테마 역발굴(THEME-04 보강, v2) · Pearson 일반 상관 path(미채택) · 페어 정식 모델/Granger/인트라데이 시차(v2) · 동조 알림(v2).
