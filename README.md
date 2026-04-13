# gh-radar

한국 주식 트레이더를 위한 실시간 종목 정보 웹앱. 상한가에 근접한 종목을 실시간으로 스캔하고, 관심 종목의 뉴스와 네이버 종목토론방 정보를 AI가 요약하여 제공한다.

## 아키텍처

```
┌─────────────┐    ┌──────────────┐    ┌────────────┐
│ KIS OpenAPI │───>│   workers/   │───>│  Supabase  │
│ (시세 데이터)│    │  ingestion   │    │ (PostgreSQL)│
└─────────────┘    └──────────────┘    └─────┬──────┘
                                             │
                   ┌──────────────┐          │
                   │   server/    │<─────────┘
                   │ (Express API)│
                   └──────┬───────┘
                          │
                   ┌──────┴───────┐
                   │   webapp/    │
                   │  (Next.js)   │
                   └──────────────┘
```

## 워크스페이스

| 워크스페이스 | 설명 | Phase |
|---|---|---|
| `packages/shared` | 도메인 타입 (Stock, NewsArticle 등) | 1 |
| `workers/ingestion` | KIS API → Supabase 시세 수집 워커 | 1 |
| `server` | Express REST API + SSE | 2 |
| `webapp` | Next.js 프론트엔드 | 4 |

## 빠른 시작

```bash
# 1. 의존성 설치
pnpm install

# 2. 공유 패키지 빌드
pnpm -F @gh-radar/shared build

# 3. 환경변수 설정
cp workers/ingestion/.env.example workers/ingestion/.env
# .env 파일에 실제 값 채우기

# 4. Supabase 마이그레이션
supabase link --project-ref <your-project-ref>
supabase db push

# 5. 인제스천 워커 실행 (장 시간에만 데이터 수집)
pnpm -F @gh-radar/ingestion dev

# 6. 테스트
pnpm -F @gh-radar/ingestion test
```

## 환경변수

| 변수 | 설명 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 시크릿 키 |
| `KIS_APP_KEY` | 한국투자증권 OpenAPI 앱 키 |
| `KIS_APP_SECRET` | 한국투자증권 OpenAPI 앱 시크릿 |
| `KIS_ACCOUNT_NUMBER` | 계좌번호 (형식: `XXXXXXXX-XX`) |
| `KIS_BASE_URL` | KIS API base URL |
| `LOG_LEVEL` | 로그 레벨 (기본: `info`) |

## 기술 스택

- **언어:** TypeScript
- **패키지 매니저:** pnpm (workspaces)
- **데이터베이스:** Supabase (PostgreSQL)
- **시세 데이터:** 한국투자증권 KIS OpenAPI
- **프론트엔드:** Next.js 15 + Tailwind + shadcn/ui
- **백엔드:** Express 5 + Cloud Run
- **AI 요약:** Claude Haiku 4.5
