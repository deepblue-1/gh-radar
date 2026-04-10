# gh-radar

## What This Is

한국 주식 트레이더를 위한 실시간 종목 정보 웹앱. 상한가에 근접한 종목을 실시간으로 스캔하고, 관심 종목의 뉴스와 네이버 종목토론방 정보를 AI가 요약하여 제공한다.

## Core Value

트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 실시간 상한가 근접 종목 스캔 (등락률 기준값 사용자 조절 가능, 기본 25%)
- [ ] 종목 검색 기능
- [ ] 종목별 뉴스 수집 및 AI 요약
- [ ] 종목별 네이버 종목토론방 수집 및 AI 요약
- [ ] 실시간 또는 1분 간격 데이터 갱신

### Out of Scope

- 로그인/회원 기능 — v2에서 추가
- 관심종목 저장 — 로그인 기능 필요, v2 이후
- 미국 주식 — v1은 한국 시장만, 이후 확장
- 모바일 앱 — 웹 우선
- 실시간 알림/푸시 — v2 이후

## Context

- 대상 시장: 한국 주식 (코스피/코스닥)
- 주식 데이터 소스: 무료 API 활용 (한국투자증권 OpenAPI, KRX 공개데이터 등)
- 뉴스 소스: 리서치 후 결정 (네이버 금융, 한경, 매경 등 후보)
- AI 요약: Claude API 사용
- 프론트엔드: Next.js + Tailwind CSS + shadcn/ui → Vercel 배포
- 백엔드: TypeScript + Express → Cloud Run 배포
- 데이터베이스: Supabase
- 필요시 Python 스크립트 별도 활용 가능 (크롤링 등)

## Constraints

- **Budget**: 무료 API 활용 우선, API 호출 비용 최소화
- **데이터 갱신**: 실시간이 이상적이나, API 제한 시 1분 간격 폴링 허용
- **배포 환경**: 프론트 Vercel, 백엔드 Cloud Run (컨테이너 기반)
- **법적**: 크롤링 시 robots.txt 준수, API 이용약관 준수

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude API로 뉴스/토론방 요약 | 사용자 선호, 한국어 요약 품질 우수 | — Pending |
| v1은 인증 없이 공개 | 빠른 출시 우선, 인증은 v2 | — Pending |
| 상한가 기준값 사용자 조절 가능 | 트레이더마다 전략이 다름 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 after initialization*
