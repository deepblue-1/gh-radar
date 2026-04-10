# Research Summary: gh-radar

**Project:** gh-radar — 한국 주식 트레이더를 위한 실시간 종목 정보 웹앱
**Date:** 2026-04-10
**Confidence:** HIGH overall

## Executive Summary

gh-radar는 한국 주식 상한가 근접 종목을 실시간 스캔하고, 뉴스/토론방을 AI로 요약하는 웹앱이다. 핵심 아키텍처는 3개 프로세스 분리: (1) KIS API 폴링 Ingestion Worker (Cloud Run Job), (2) Express API (Cloud Run Service), (3) Next.js Frontend (Vercel). KIS API 토큰의 일일 발급 제한 때문에 stateless serverless 인스턴스 간 토큰 공유가 불가하여 이 분리가 필수적이다.

## Recommended Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Data Source** | KIS OpenAPI (한국투자증권) | 유일한 실시간 무료 소스. pykrx는 2024.12부터 차단됨 |
| **News** | Naver Search API (공식) | 25,000 calls/day 무료, 합법적 |
| **토론방** | cheerio + axios 스크래핑 | 공식 API 없음. 법적 리스크 있어 on-demand only |
| **AI** | Claude Haiku 4.5 | $1/M input, Sonnet 대비 3x 저렴, 요약 품질 충분 |
| **Realtime** | Supabase Realtime + SSE | DB 변경 → 자동 브로드캐스트, 프론트 폴링 불필요 |
| **Frontend** | Next.js 15 + Tailwind + shadcn/ui | 프로젝트 결정사항 |
| **Backend** | Express + Cloud Run (min-instances=1) | 폴링 루프 유지 위해 scale-to-zero 방지 필요 |
| **Database** | Supabase (Postgres) | 프로젝트 결정사항 |
| **Cache** | Upstash Redis + BullMQ | KIS 토큰 캐시, 작업 큐 |

## Table Stakes Features

- 실시간 등락률 리스트 (상한가 근접 필터링)
- 임계값 조절 슬라이더 (10–29%, 기본 25%)
- 종목 현재가 + 등락률 + 거래량 표시
- 종목 검색 (자동완성)
- 종목별 뉴스 목록 + AI 요약
- 네이버 종목토론방 글 + AI 요약 (긍/부정/중립)
- 코스피/코스닥 마켓 뱃지
- 데이터 갱신 시각 표시

## Critical Pitfalls

1. **KIS WebSocket 41종목 제한** — 광범위 스캔은 REST 폴링 필수, WebSocket은 개별 종목 추적용
2. **KIS REST 20 req/sec 슬라이딩 윈도우** — 15 req/sec 타겟, EGW00201 에러 핸들링
3. **pykrx 완전 차단** — KRX 로그인 필수화, IP 영구 차단. 사용 금지
4. **종목토론방 법적 리스크** — 대법원 2022 판례, 상업적 스크래핑은 형사 책임 가능. on-demand + 캐싱만
5. **Claude API 비용 폭발** — content-hash 캐싱, input 2,000~3,000 토큰 제한, max_tokens=250, Haiku 사용

## Suggested Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Ingestion  │────▶│   Supabase   │◀────│  Express    │
│  Worker     │     │   (Postgres) │     │  API        │
│  (Cloud Run │     │              │     │  (Cloud Run │
│   Job)      │     │  Realtime ───┼────▶│   Service)  │
└─────────────┘     └──────────────┘     └──────┬──────┘
                           │                     │
                    Realtime│              SSE/REST
                           ▼                     ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Next.js    │     │  Claude API  │
                    │  Frontend   │     │  (Haiku)     │
                    │  (Vercel)   │     └─────────────┘
                    └─────────────┘
```

## Suggested Phase Order (7 phases)

| # | Phase | Why This Order |
|---|-------|---------------|
| 1 | Data Foundation | KIS API + Supabase 스키마. 모든 기능의 기반 |
| 2 | Backend API | Express 앱 + Cloud Run 배포. 프론트가 의존할 API 계약 |
| 3 | Frontend Screener | 상한가 스캐너 UI + Supabase Realtime. E2E 데이터 흐름 검증 |
| 4 | News Pipeline | Naver Search API 뉴스 수집 + 표시. AI 요약의 전제조건 |
| 5 | Discussion Board | 종목토론방 스크래핑 + 표시. 법적/기술 리스크로 별도 격리 |
| 6 | AI Summarization | Claude Haiku 통합 + 캐싱. 비용 통제 확립 후 프로덕션 |
| 7 | UX Polish & Search | 검색 자동완성, 모바일 반응형, 장 마감 상태 표시 |

## Open Questions

- KIS 모의투자 계정의 실제 REST API 호출 제한 → Phase 1에서 실증 필요
- 네이버 종목토론방 현재 렌더링 방식 (SSR vs CSR) → Phase 5 전에 검증 필요
- Cloud Run min-instances=1 정확한 월 비용 → Phase 2 배포 시 확인

---
*Synthesized: 2026-04-10*
