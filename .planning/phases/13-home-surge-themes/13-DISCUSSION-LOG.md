# Phase 13: 홈 화면 — 오늘의 급등 테마 AI 분석 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 13-home-surge-themes
**Areas discussed:** 장중 갱신 시맨틱, 이력(일별 스냅샷) UX, 뉴스 근거 표현, 주도 테마 정렬 기준

---

## 사전 컨텍스트

STATE.md "Phase 13 added 2026-07-01" 로드맵 진화 항목에 사용자와의 사전 설계 논의 결과가 이미 다수 확정되어 있었음(bottom-up 클러스터링 / 근거=news_articles / 갱신=매시 :30 / 임계값=+20% / 개별 급등 섹션 / 일별 스냅샷 / 루트 승격 / home-sync 워커 데이터흐름 / 구성). 따라서 이 논의는 그 골격을 **재질문하지 않고**, 아직 구현을 바꾸는 미결 gray area 4개만 다룸.

## 논의 영역 선택 (multiSelect)

사용자가 4개 영역 모두 선택: 이력(일별 스냅샷) UX, 홈 카드 정보 구성, 장중 갱신 시맨틱, 주도 테마 정렬 기준.

---

## 장중 갱신 시맨틱 → home_theme_snapshots 저장 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 하루 1 row, 최신본 덮어쓰기 | date 기준 1 row UPSERT, 매 :30 최신 클러스터로 덮어쓰기, 마감 후 고정 | |
| :30 시점별 row 보존 | 매 시점 새 row 누적, 장중 테마 변화 추적 | ✓ |

**User's choice:** :30 시점별 row 보존
**Notes:** 권장안(덮어쓰기)이 아닌 시계열 보존 선택. `home_theme_snapshots` 는 `(date, captured_at)` 단위 append. → D-01.

---

## 이력(일별 스냅샷) UX → 홈에서 과거 날짜 노출 여부

| Option | Description | Selected |
|--------|-------------|----------|
| v1은 '오늘'만 표시 | 이력은 DB 누적만, 과거 조회 UI 는 v2 | |
| 날짜 네비/어제 비교 포함 | 홈에 날짜 선택·비교 UI 포함 | ✓ |

**User's choice:** 날짜 네비/어제 비교 포함
**Notes:** 이력 가치를 v1 에서 즉시 노출. 후속 follow-up 으로 범위 바운딩. → D-02, D-03.

---

## 뉴스 근거 표현 → Claude 출력 + 카드 표시

| Option | Description | Selected |
|--------|-------------|----------|
| 테마당 대표 뉴스 1-2건 | Claude 가 상승 이유 설명 뉴스 1-2건 선별(제목+출처+링크) | ✓ |
| 상승이유 요약 텍스트만 | 뉴스 링크 없이 요약만 | |
| 종목별 뉴스 나열 | 각 소속 종목의 news_articles 나열 | |

**User's choice:** 테마당 대표 뉴스 1-2건 (권장)
**Notes:** news_articles 의 title/url 그대로 저장(환각 방지). 출처 표기(5원칙). → D-04.

---

## 주도 테마 정렬 기준

| Option | Description | Selected |
|--------|-------------|----------|
| 급등종목 수→평균등락률 | 소속 +20% 종목 수 우선, 동수면 평균 등락률 desc (breadth 우선) | ✓ |
| 평균 등락률 desc | 강도 우선(Phase 10 일관성) | |
| 거래대금 합 desc | 자금 유입 규모 우선 | |

**User's choice:** 급등종목 수→평균등락률 (권장)
**Notes:** "가장 많은 종목이 함께 오른 테마" = 오늘의 주도. 소수 강력 급등은 개별 급등 섹션으로 자연 분리. → D-05.

---

## Follow-up 1: 기본 뷰 + 장중 탐색 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 오늘 최신 + 날짜 단위 탐색 | 저장은 시점별, v1 UI 는 날짜 단위(그날 대표=최신/마감)만. 시점 슬라이더는 v2 | |
| 날짜 + 장중 시점 둘 다 탐색 | 오늘 안에서도 9:30/10:30… 시점 탐색 | ✓ |

**User's choice:** 날짜 + 장중 시점 둘 다 탐색
**Notes:** 시점별 보존 데이터를 v1 에서 바로 활용. UI/쿼리 복잡도 수용. → D-02.

---

## Follow-up 2: '어제 비교' 구체 형태 (범위 바운딩)

| Option | Description | Selected |
|--------|-------------|----------|
| 날짜 전환만 | 날짜/시점 네비로 각 시점을 각각 봄. 별도 비교 뷰 없음 | ✓ |
| 오늘 vs 어제 나란히 비교 | 지속/신규 테마 하이라이트 side-by-side 뷰 | |
| You decide | planner/UI-SPEC 재량 | |

**User's choice:** 날짜 전환만 (권장)
**Notes:** 본격 side-by-side 비교는 deferred(별도 phase 후보). v1 은 전환만. → D-03.

---

## Claude's Discretion

- home_theme_snapshots 정확 스키마(시점별 row 키, JSON blob vs 정규화)
- hash-skip 가드 × 시점별 row 상호작용(동일 콘텐츠 슬롯 skip vs 복제)
- Claude 프롬프트 설계(클러스터링/JSON 계약/테마명/상승이유 톤/대표뉴스 선별/개별 급등 판정)
- 소속 종목 카드 표시 개수, 시점/날짜 네비 UI 형태 (UI-SPEC)
- 개별 급등 섹션 뉴스 근거 부여 여부
- home-sync cron 정확 표현, /api/home 응답 계약, 테스트 범위

## Deferred Ideas

- 장중 시점 시계열 차트/슬라이더 고도화
- 오늘 vs 어제 나란히-비교 뷰
- 테마 기반 알림(NOTF-*)
- 개별 급등 → Phase 11 co-movement 동조 후보 연계
- home-sync 발견 테마 → Phase 10 시스템 테마 승격/피드백
