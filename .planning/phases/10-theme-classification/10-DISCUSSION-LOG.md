# Phase 10: Theme Classification — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 10-theme-classification
**Areas discussed:** 테마 병합, /themes 정렬·구성, 테마 상세+종목 행, 스코프 경계, 소유 모델, 스크랩↔편집 오버라이드, 수집 방식·비용, AI 보강, fork 동작

---

## 사용자 초기 비전 (gray area 선택 시 추가)

- 한 종목 = 여러 테마 (태그처럼 다중) → M:N 확정
- 유저가 테마 추가/삭제/편집 + 특정 테마에 종목 add/remove → 사용자 CRUD 요구(스코프 확장)

---

## 스코프 — 사용자 CRUD 위치

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 11로 분리 | Phase 10=read-only, CRUD는 다음 phase | |
| Phase 10에 포함 (한번에) | 수집+표시+CRUD 통째로 | ✓ |

**User's choice:** Phase 10에 포함 (한번에)
**Notes:** phase가 커지지만 사용자가 통합 구현 선택.

## 소유 모델 (1차 → 2차 선회)

| Option | Description | Selected (1차) | Selected (최종) |
|--------|-------------|------|------|
| 개인 소유 | 시스템=전역, 유저=본인만 | | ✓ (선회 후) |
| 전역 공유(위키식) | 한 명이 만들면 모두 편집 | ✓ (1차) | (폐기) |
| 공개/비공개 선택 | 테마마다 토글 | | |

**User's choice:** 최종 = **유저별 테마 분리(per-user)**. "위키방식으로 안하고 유저별로 테마가 따로 있게 만드는게 좋겠어."
**Notes:** 1차로 위키식을 골랐으나, 스크랩↔편집 오버라이드 충돌의 복잡성 설명 후 per-user 분리로 선회. 이 선회가 가장 어려운 문제(override/provenance/편집권한)를 제거함.

## 시스템 테마 편집권 (선회로 무효화)

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only + 개인 테마만 편집 | 시스템 불변 | (최종 채택 — per-user 선회로) |
| 시스템 복제 후 편집 | fork | (fork는 별도 채택) |
| 직접 편집(오버라이드) | 시스템 종목 직접 제거 | ✓ (1차, 위키 맥락) → 무효 |

**User's choice:** 1차 "직접 편집"은 위키 모델 폐기로 무효. 최종: 시스템 read-only + 유저는 자기 테마만 편집 + fork.

## 스크랩↔유저편집 오버라이드 / 필드 잠금 / 편집 권한

**Notes:** per-user 분리 선회로 이 세 질문(오버라이드 우선순위, 이름/설명 필드 잠금, 위키 편집 권한)은 **불필요해짐**(분리된 row 집합). 사용자가 "다시"로 재설정 요청 → per-user 모델로 정정.

## 테마 병합 (네이버 ↔ 알파스퀘어)

| Option | Description | Selected |
|--------|-------------|----------|
| 이름 정규화 후 병합 | 유사명 병합, 종목 합집합, source 다중 | ✓ |
| 소스 분리 유지 | 별도 테마 + 출처 뱃지 | |

**User's choice:** 이름 정규화 후 병합 (초기 보수적, 애매한 건 분리)

## 모델 확정 + fork

| Option | Description | Selected |
|--------|-------------|----------|
| 맞음 + fork 허용 | per-user 확정 + 시스템 테마 복사 가능 | ✓ |
| 맞음 + 빈 테마만 | fork 없이 빈 테마부터 | |
| 모델 수정 필요 | — | |

**User's choice:** 맞음 + fork 허용

## /themes 목록 구성

| Option | Description | Selected |
|--------|-------------|----------|
| 탭 분리 | 전체/내 테마 탭 | |
| 한 목록 + 출처 뱃지 | 섞고 뱃지 | |
| 내 테마 상단 고정 | 내 테마 먼저, 아래 시스템 | ✓ |

**User's choice:** 내 테마 상단 고정

## 정렬 기준

| Option | Description | Selected |
|--------|-------------|----------|
| 평균 등락률(뜨는 순) | 소속 종목 평균 | (수정 채택) |
| 종목수/가나다 | 정적 | |
| 정렬 선택 UI | 토글 | |

**User's choice:** **소속 종목 중 등락률 상위 3종목의 평균 등락률 순** (사용자 명시 수정 — 전체 평균 대신 상위 3종목으로 라거드 희석 방지)

## 테마 상세 뷰 + 종목 행

| Option | Description | Selected |
|--------|-------------|----------|
| 별도 페이지 + scanner row 재사용 | /themes/[id], 스캐너 행 | ✓ |
| 인라인 확장(아코디언) | 목록에서 펼침 | |
| 모달 | 팝업 | |

**User's choice:** 별도 페이지 /themes/[id] + scanner row 재사용

## 종목 → 테마 역링크 칩

| Option | Description | Selected |
|--------|-------------|----------|
| 포함 | 종목 상세에 테마 칩 | ✓ |
| 이 phase 제외 | 후속 | |

**User's choice:** 포함

## 수집 방식 / 프록시 비용

| Option | Description | Selected |
|--------|-------------|----------|
| 직접 fetch 먼저 → 차단 시 프록시 폴백 | 저빈도라 직접, 차단 시 Bright Data | ✓ |
| 처음부터 Bright Data | Phase 8 일관성 | |
| 프록시 없이 직접만 | 비용 0, 리스크 | |

**User's choice:** 직접 fetch 먼저 → 차단 시 프록시 폴백

## AI 보강

| Option | Description | Selected |
|--------|-------------|----------|
| 이 phase 제외 | 후속 phase | |
| 포함 | Claude Haiku 신규 테마 발굴/오분류 교정 | ✓ |

**User's choice:** 포함 (시스템 레이어로만, 유저 테마와 분리)

## fork 동작 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 스냅샷 복사 | fork 시점 종목 복사, 이후 독립 | ✓ |
| 라이브 연결 | 시스템 참조 + 오버레이 | |

**User's choice:** 스냅샷 복사

## Claude's Discretion

- 테이블 스키마(단일+플래그 vs 분리), 이름 정규화 알고리즘, 정렬 계산 위치, 등락률 source 분기, 알파스퀘어 selector, AI 트리거 주기/프롬프트, fork 이력 복사 범위, 빈/로딩/에러 상태, 편집 UI 형태, 칩 overflow, 테스트 범위.

## Deferred Ideas

- 테마 기반 알림(v2), 테마 간 상한가 동조 분석(Phase 11+), 유저 테마 공유/공개, 테마 트렌드 시계열, 동의어 사전 고도화.
