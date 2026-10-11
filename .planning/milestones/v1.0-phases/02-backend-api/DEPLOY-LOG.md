# Phase 2 — Cloud Run 배포 로그

- **배포 일시 (UTC):** 2026-04-13T10:10Z
- **GCP 프로젝트:** `gh-radar`
- **리전:** `asia-northeast3`
- **서비스:** `gh-radar-server`
- **현재 Revision:** `gh-radar-server-00003-56n`
- **공개 URL:** https://gh-radar-server-1023658565518.asia-northeast3.run.app
- **이미지:** `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/server:62dbe47`

## 배포 구성

| 항목 | 값 |
|------|-----|
| CPU | 1 |
| Memory | 512Mi |
| Concurrency | 80 |
| min-instances | 1 |
| max-instances | 3 |
| Timeout | 300s |
| Port | 8080 |
| Runtime | Node 22 LTS (alpine) |
| 사용자 | non-root `app` |

## 환경변수

| Key | Source | Value |
|-----|--------|-------|
| `NODE_ENV` | inline | `production` |
| `LOG_LEVEL` | inline | `info` |
| `SUPABASE_URL` | inline | `https://ivdbzxgaapbmrxreyuht.supabase.co` |
| `CORS_ALLOWED_ORIGINS` | inline | `http://localhost:3030,https://gh-radar.vercel.app` |
| `APP_VERSION` | inline (GIT_SHA) | `62dbe47` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Manager | `gh-radar-supabase-service-role:latest` |

## IAM

- Cloud Run SA: `1023658565518-compute@developer.gserviceaccount.com`
  - `roles/secretmanager.secretAccessor` on `gh-radar-supabase-service-role`
- Public: `allUsers` → `roles/run.invoker` (조직 정책 `iam.allowedPolicyMemberDomains` 프로젝트 override 후 부여)

## Invariant 검증 결과 (INV-1 ~ INV-9)

| INV | 내용 | 결과 |
|-----|------|------|
| INV-1 | `/api/health` status=ok, 구조 검증 | ✅ PASS |
| INV-2 | `/api/scanner` → array, `upperLimitProximity:number` | ✅ PASS |
| INV-3 | `/api/stocks/:code` scanner 응답 코드로 조회 일치 | ✅ PASS |
| INV-4 | `/api/stocks/000000` → 404 + `STOCK_NOT_FOUND` | ✅ PASS |
| INV-5 | `/api/stocks/search` scanner name 한 글자 검색 ≥1건 | ✅ PASS |
| INV-6 | CORS preflight 허용 origin (`https://gh-radar.vercel.app`) → 200/204 | ✅ PASS |
| INV-7 | CORS preflight 비허용 origin → ACAO 헤더 부재 | ✅ PASS |
| INV-8 | 201회 연속 요청 → 마지막 응답 429 | ✅ PASS |
| INV-9 | `X-Request-Id` 응답 헤더 존재 | ✅ PASS |

**결과: 9/9 PASS**

## 배포 중 조우한 이슈와 해결

1. **ERR_MODULE_NOT_FOUND: express**
   - 원인: pnpm v10 isolated node_modules 구조에서 `/app/node_modules`에는 hoisted 링크만 존재, 실제 의존성은 `.pnpm/` 내부에 격리
   - 해결: `pnpm --filter --prod --legacy deploy /out` 으로 runtime-only hoisted 트리 생성 후 그것을 복사 (커밋 `62dbe47`)

2. **조직 정책 `iam.allowedPolicyMemberDomains` 가 `allUsers` 차단**
   - 원인: `jx1.io` Workspace 조직 정책
   - 해결: `alex@jx1.io` 에 `roles/orgpolicy.policyAdmin` 부여 → `gh-radar` 프로젝트 범위로 `allValues: ALLOW` override → `allUsers` invoker 바인딩 성공 (전파 대기 ~45s)

3. **INV-3/INV-5 smoke 데이터 의존성**
   - 원인: 하드코딩된 `005930`(삼성전자), `q=삼성`은 KIS 등락률 순위 결과에 포함되지 않음 → DB 미존재
   - 해결: smoke 스크립트를 `scanner` 응답의 첫 종목 `code`/`name` 기반으로 동적화

## 운영 참고

- **예상 월 비용**: min-instances=1 + 1 vCPU + 512Mi 상시 → 약 $15~25 (서울 리전)
- **로그**: https://console.cloud.google.com/logs/viewer?project=gh-radar
- **콘솔**: https://console.cloud.google.com/run/detail/asia-northeast3/gh-radar-server?project=gh-radar
- **재배포**:
  ```bash
  export GCP_PROJECT_ID=gh-radar
  export SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co
  export CORS_ALLOWED_ORIGINS="http://localhost:3030,https://gh-radar.vercel.app"
  bash scripts/deploy-server.sh
  ```
- **CORS 갱신**: 프론트 배포 후 실제 Vercel 도메인으로 `CORS_ALLOWED_ORIGINS` 교체 + 재배포
