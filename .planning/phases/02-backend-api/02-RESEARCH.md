# Phase 2: Backend API — Research

**Researched:** 2026-04-13
**Domain:** Express 5 REST API on Google Cloud Run (asia-northeast3) consuming Supabase
**Confidence:** HIGH (versions/commands verified via npm registry + 공식 문서)
**Phase requirements:** INFR-03

---

## 사용자 제약사항 (CONTEXT.md에서 승계)

> **이 섹션은 02-CONTEXT.md의 39개 결정사항(D-01 ~ D-39)을 verbatim 승계합니다. 플래너는 이 결정들을 재논의하지 않습니다.**

### Locked Decisions (요약 — 전문은 02-CONTEXT.md)

- **워크스페이스/타입:** D-01~D-05 — `server/` 워크스페이스, TS strict + Node 22 LTS, Express 5, `@gh-radar/shared` import, Supabase service_role 싱글턴
- **엔드포인트 계약:** D-06~D-12 — 4개 엔드포인트, 서버측 필터/정렬, 페이지네이션 없음, `upperLimitProximity` 서버 계산, 404 정형, ILIKE 검색
- **응답/에러:** D-13~D-16 — 루트 envelope 직접 반환, `{error:{code,message}}`, 단일 에러 미들웨어, 404 fallback
- **보안/CORS:** D-17~D-23 — 인증 없음, 정규식 허용 CORS whitelist, helmet 기본, 200 req/min IP rate limit, 16kb body, request-id 미들웨어, redact
- **로깅:** D-24~D-26 — pino JSON, 필수 필드(`request_id`, `route`, `method`, `status`, `latency_ms`, `user_agent`, `referer`), redact 경로
- **Cloud Run:** D-27~D-30 — asia-northeast3, CPU=1/Memory=512Mi/Concurrency=80, **min=1 / max=3 (비가역)**, 포트 8080, 타임아웃 300s 기본
- **이미지/Secret:** D-31~D-35 — 멀티스테이지 Dockerfile (`pnpm deploy`), `--platform=linux/amd64`, Artifact Registry `gh-radar`, Secret Manager는 `SUPABASE_SERVICE_ROLE_KEY`만, 환경변수 계약 명시
- **자동화/테스트:** D-36~D-38 — `scripts/deploy-server.sh` 수동 스크립트(가드 체크 포함), vitest+supertest+curl smoke 3계층, E2E/CI는 v2
- **선행조건:** D-39 — `gcloud config configurations create gh-radar` 분리, weekly-wine-bot ADC 충돌 주의

### Claude's Discretion (플래너가 본 리서치를 근거로 결정 — D-115)

- Supabase 클라이언트 재사용 패턴 (app.locals vs import 싱글턴) → §7에서 권고
- `ApiError` 계층 (단일 vs 세분화) → §5에서 권고
- `.select('*')` vs 명시적 컬럼 → §6에서 권고
- Zod 도입 여부/범위 → §5에서 권고
- pino-http 설정 세부값 → §5, §10에서 권고
- Dockerfile 베이스 이미지 정확 버전/보안 업데이트 → §8
- rate-limit 키 생성 전략 (`X-Forwarded-For` 신뢰 범위) → §5에서 권고
- `/api/scanner` `Cache-Control` 전략 → §11 Open Questions

### Deferred Ideas (OUT OF SCOPE — 플래너 무시)

GitHub Actions 자동 배포, Cloud Run 시간대별 min=1 스케줄링, Postgres FTS, 응답 캐시(CDN/Memorystore), API key/사용자 인증, RFC 9457 Problem Details, Readiness probe(Supabase 핑), 실 Cloud Run E2E.

---

## Phase Requirements

| ID | 설명 | Research Support |
|----|----|----|
| INFR-03 | Express API 서버 구축 + Cloud Run 배포 (min-instances=1) | §3 (gcloud deploy), §4~§7 (Express 구현), §8 (Dockerfile), §9 (deploy 스크립트), §10 (smoke 검증) |

---

## 2. 요약 (플래너가 가장 먼저 기억할 5가지)

1. **Express 5는 async 핸들러를 자동으로 에러 핸들러에 전달한다** — `express-async-handler` 같은 wrapper 의존성을 추가하지 말 것. `(req, res, next) => { throw err }` 는 `(err, req, res, next)` 미들웨어로 자동 전파됨. `[VERIFIED: expressjs.com/en/guide/migrating-5.html]`
2. **Cloud Run + express-rate-limit 함정:** `app.set('trust proxy', 1)`을 반드시 호출. 안 하면 모든 요청이 동일 IP로 집계돼 단일 사용자가 200 req/min을 다 소진시킨다. v7+는 trust proxy 설정 안 된 상태에서 X-Forwarded-For 보면 `ValidationError`도 던짐. `[VERIFIED: express-rate-limit wiki]`
3. **min-instances=1은 가역으로 보이지만 비용 직격타:** Cloud Run 서울 리전에서 1 vCPU + 512MiB가 24/7 실행되므로 월 약 \$15~25 발생 예상 — 플랜에 비용 메모 필요. STATE.md "Cloud Run 비용 확인" Blocker가 여기에 해당.
4. **`SUPABASE_SERVICE_ROLE_KEY`는 Secret Manager 단일 항목**이며 Cloud Run runtime SA에 `roles/secretmanager.secretAccessor`를 그 시크릿 리소스에 명시 grant해야 한다(프로젝트 단위 grant 지양). `[CITED: cloud.google.com/run/docs/configuring/services/secrets]`
5. **macOS arm64에서 `--platform=linux/amd64` 강제는 native 의존성 없는 한 OK**, 에뮬레이션 빌드 시간만 늘어남. 본 페이즈 dependencies(express, helmet, cors, pino, @supabase/supabase-js)는 모두 pure JS라 native rebuild 이슈 없음. `buildx`는 builder 인스턴스가 없으면 `docker build --platform=linux/amd64`만으로 충분.

**Primary recommendation:** Phase 1의 `workers/ingestion` 디렉토리 구조와 Dockerfile 패턴을 거의 그대로 미러링하되, 엔트리포인트만 일회성 `main()`이 아닌 Express `listen(8080)`으로 바꾼다. 추가로 `app.ts`(빌드만)와 `server.ts`(listen)를 분리해 supertest가 listen 없이 요청 가능하게 한다.

---

## 3. Cloud Run & GCP 인프라 (배포 명령어)

### 3.1 일회성 setup (사용자가 D-39에 따라 사전에 실행)

```bash
# gcloud configuration 분리 (weekly-wine-bot ADC 보호)
gcloud config configurations create gh-radar
gcloud config configurations activate gh-radar
gcloud auth login
gcloud config set account <gh-radar-email>
gcloud config set project <GCP_PROJECT_ID>
gcloud config set run/region asia-northeast3
gcloud config set artifacts/location asia-northeast3

# 필요한 API 활성화 (한 번만)
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# Artifact Registry repository 생성
gcloud artifacts repositories create gh-radar \
  --repository-format=docker \
  --location=asia-northeast3 \
  --description="gh-radar container images"

# Docker credHelper 등록 (로컬 push)
gcloud auth configure-docker asia-northeast3-docker.pkg.dev
```

`[CITED: cloud.google.com/artifact-registry/docs/repositories/create-repos]`

### 3.2 Secret Manager 등록 (SUPABASE_SERVICE_ROLE_KEY)

```bash
# 시크릿 생성 (한 번)
echo -n "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create gh-radar-supabase-service-role \
  --data-file=- \
  --replication-policy=automatic

# 값 변경 시 새 버전 추가
echo -n "$NEW_KEY" | gcloud secrets versions add gh-radar-supabase-service-role --data-file=-

# Cloud Run runtime SA(기본: PROJECT_NUMBER-compute@developer.gserviceaccount.com)에 권한 부여
PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding gh-radar-supabase-service-role \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

`[CITED: cloud.google.com/run/docs/configuring/services/secrets]`

**`:latest` vs 고정 버전:**
- 환경변수 주입(`--update-secrets=ENV=SECRET:VERSION`)은 **인스턴스 시작 시점**에 resolve된다. `:latest` 사용 시 새 revision 배포 또는 cold start 시점에 새 값 반영(우리는 min=1이라 cold start 거의 없음 → 새 값 반영 안 됨).
- **권장:** 키 로테이션 시 새 버전 번호로 명시 핀(`gh-radar-supabase-service-role:3`) 후 deploy. `latest`는 v1 단순성 선호 시 허용 — 단 키 로테이션 시 반드시 재배포 필요.

### 3.3 Cloud Run deploy 명령 (D-27~D-35 모두 만족)

```bash
SERVICE=gh-radar-server
REGION=asia-northeast3
REGISTRY=asia-northeast3-docker.pkg.dev/${GCP_PROJECT_ID}/gh-radar
SHA=$(git rev-parse --short HEAD)

gcloud run deploy ${SERVICE} \
  --image=${REGISTRY}/server:${SHA} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=80 \
  --min-instances=1 \
  --max-instances=3 \
  --timeout=300s \
  --set-env-vars="NODE_ENV=production,LOG_LEVEL=info,SUPABASE_URL=${SUPABASE_URL},CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}" \
  --update-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"
```

**플래그 주석:**
- `--allow-unauthenticated`: D-17(공개 API) 직접 만족. 만약 누락하면 401 반환.
- `--port=8080`: D-29. 컨테이너는 `process.env.PORT`(Cloud Run이 8080 주입)를 listen해야 함. 하드코딩하지 말 것.
- `--update-secrets`: 기존 시크릿 mount 보존. `--set-secrets`는 모든 시크릿 mount 초기화하므로 다중 시크릿 환경에서 위험. 본 페이즈는 시크릿 1개라 둘 다 안전하지만 patch-friendly한 `update`를 권장.
- `--set-env-vars`: 평문 환경변수 일괄 갱신 (기존값 덮어씀). 콤마 구분 안에 콤마가 필요한 값(`CORS_ALLOWED_ORIGINS` 같은)은 `--set-env-vars=^@^KEY1=v1@KEY2=a,b,c` 같은 delimiter 변경 문법을 쓰거나 `--update-env-vars`를 반복.

`[CITED: cloud.google.com/sdk/gcloud/reference/run/deploy]`

### 3.4 min-instances=1 검증 명령

```bash
# 1) 배포 후 즉시 — annotation 확인
gcloud run services describe gh-radar-server \
  --region=asia-northeast3 \
  --format='value(spec.template.metadata.annotations.autoscaling\.knative\.dev/minScale)'
# 출력이 "1"이면 OK

# 2) 동일 정보, 다른 경로
gcloud run services describe gh-radar-server \
  --region=asia-northeast3 \
  --format='yaml(spec.template.metadata.annotations)'

# 3) 실제 활성 인스턴스 — 메트릭 (Cloud Logging Console에서 확인)
gcloud monitoring metrics list \
  --filter='metric.type="run.googleapis.com/container/instance_count"'
```

`[CITED: cloud.google.com/run/docs/configuring/min-instances]`

### 3.5 비용 메모 (STATE.md Blocker 해소용)

- 서울 리전, 1 vCPU + 512MiB, 24/7 항상 1 인스턴스 idle:
  - CPU(allocated, idle): 약 \$0.0000180/vCPU-s × 86400s/day × 30days × 1 vCPU ≈ \$46.6/월 (always-allocated)
  - **Cloud Run 2nd-gen + min-instances 시 idle CPU는 throttled 적용 가능** → CPU-time만 청구, 약 \$5~10/월
  - Memory: 512MiB × 30일 × 24h ≈ \$1.85/월
  - **min=1에서 idle 시 CPU-throttled 모드(기본값) 기준 약 월 \$8~12 예상**
- `--cpu-throttling`(기본) vs `--no-cpu-throttling`: 본 페이즈는 SSE 같은 백그라운드 작업 없으므로 throttled 유지 → 비용 절감.

`[ASSUMED: 정확한 가격은 GCP 가격 계산기로 재확인 필요. 위 추정은 plan에 비용 노트로 포함]`

---

## 4. Express 5 마이그레이션 노트 (Phase 2 코드에 영향)

**검증 출처:** `[VERIFIED: expressjs.com/en/guide/migrating-5.html]`, npm `express@5.2.1`

| 변경 | Phase 2 영향 | 대응 |
|---|----|----|
| async 핸들러 자동 에러 전파 | 4개 엔드포인트 모두 async — wrapper 불필요 | `express-async-handler` 의존성 추가 금지 |
| `req.query` immutable (getter) | sort/filter 미들웨어가 정규화하려고 mutate하면 TypeError | 별도 `const normalized = { ...req.query, ... }` 사용 |
| `res.json(obj, status)` 제거 | 에러 미들웨어에서 `res.status(404).json(...)` 체이닝 강제 | 모든 응답 코드는 `res.status(N).json()` 패턴 |
| `res.status(string)` 제거 (정수만) | 직접 작성 코드는 안전 | 검증 시 lint 룰 추가 고려 |
| path-to-regexp wildcard 변경 (`/*` → `/*splat`, optional은 `{}`) | 우리 라우트는 `/api/scanner`, `/api/stocks/:code`, `/api/stocks/search`, `/api/health`, 404 fallback `app.use((req,res)=>...)` | 와일드카드 안 씀. **404 fallback은 `app.use(handler)` 형태로 작성** (`app.all('*', ...)` 대신) — Express 5 권장 |
| `res.redirect(url, status)` 인자 순서 뒤집힘 | redirect 사용 안 함 | N/A |
| Node 18+ 필수 | Node 22 LTS 사용 | OK (Active LTS, 2024-10-29부터) |

**404 fallback 권장 패턴 (Express 5 안전):**

```ts
// 모든 라우터 등록 후 마지막에
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});
```

---

## 5. 미들웨어 스택 구현 (D-17~D-22, D-26)

### 5.1 권장 등록 순서 (`app.ts`)

```ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';

const app = express();

// 1) Cloud Run = 신뢰할 단일 proxy 1단
app.set('trust proxy', 1);

// 2) request-id (가장 먼저 — 후속 미들웨어가 req.id 사용)
app.use(requestId());

// 3) pino-http (request-id 이후, body parser 이전)
app.use(pinoHttp({ logger, genReqId: (req) => req.id }));

// 4) helmet (보안 헤더)
app.use(helmet());

// 5) CORS (preflight를 rate-limit/body parser 전에 처리)
app.use(cors(corsOptions()));

// 6) body parser
app.use(express.json({ limit: '16kb' }));

// 7) rate limiter (라우터 등록 전, 모든 /api/* 적용)
app.use('/api', apiRateLimiter());

// 8) routes
app.use('/api/scanner', scannerRouter);
app.use('/api/stocks', stocksRouter);
app.use('/api/health', healthRouter);

// 9) 404 fallback
app.use(notFoundHandler);

// 10) error handler (마지막)
app.use(errorHandler);

export { app };
```

### 5.2 request-id 미들웨어 (D-22)

```ts
// src/middleware/request-id.ts
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    const id = incoming && /^[A-Za-z0-9_-]{1,128}$/.test(incoming)
      ? incoming
      : randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}

// types/express.d.ts
declare global {
  namespace Express {
    interface Request { id: string }
  }
}
```

`[VERIFIED: express 5.2.1 has no built-in req.id; this is the standard pattern]`

### 5.3 CORS allowed origins 파서 (D-18)

`CORS_ALLOWED_ORIGINS` 형식: 쉼표 구분, `/.../` 리터럴은 정규식.

```ts
// src/services/cors-config.ts
import type { CorsOptions } from 'cors';

export function parseAllowedOrigins(raw: string | undefined): Array<string | RegExp> {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(item => {
    const m = item.match(/^\/(.*)\/([gimsuy]*)$/);
    return m ? new RegExp(m[1], m[2]) : item;
  });
}

export function corsOptions(): CorsOptions {
  const allowed = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  return {
    origin: (origin, cb) => {
      // origin 없음(서버-서버, curl) 허용
      if (!origin) return cb(null, true);
      const ok = allowed.some(rule =>
        typeof rule === 'string' ? rule === origin : rule.test(origin)
      );
      cb(ok ? null : new Error('CORS_NOT_ALLOWED'), ok);
    },
    credentials: false, // 인증 없음
    maxAge: 600, // preflight 캐시 10분
  };
}
```

`[CITED: github.com/expressjs/cors README]` — 함수형 origin은 CorsRequest preflight도 자동 처리.

### 5.4 Rate limiter (D-20)

```ts
// src/middleware/rate-limit.ts
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export function apiRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 200,
    standardHeaders: 'draft-7',  // RateLimit-* 표준 헤더
    legacyHeaders: false,
    // Cloud Run = trust proxy 1; req.ip는 X-Forwarded-For 좌측 첫번째
    keyGenerator: (req, res) => ipKeyGenerator(req.ip ?? '', 64),
    handler: (req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, retry later.' }
      });
    },
  });
}
```

**중요 함정:**
- `app.set('trust proxy', 1)` 미설정 시 v7+에서 `ValidationError: trust proxy false but X-Forwarded-For set` 던짐. `[VERIFIED: express-rate-limit GitHub Issue #3583]`
- IPv6 `::1` 등이 들어오면 `ipKeyGenerator` 헬퍼로 /64 prefix subnet 키 생성 권장 — Cloud Run은 IPv4 클라이언트가 대부분이지만 미래 호환.
- 메모리 저장소: min=1/max=3에서 인스턴스가 늘면 IP별 카운트가 인스턴스마다 분리됨 → 실효 limit이 200×N. v1 트래픽에선 무시 가능. v2에서 Upstash Redis 저장소(`rate-limit-redis`) 도입.

`[VERIFIED: express-rate-limit@8.3.2, ipKeyGenerator export 존재]`

### 5.5 helmet (D-19)

```ts
app.use(helmet());
```

JSON API라 CSP 기본값으로 충분. 추가 옵션 불필요.

`[VERIFIED: helmet@8.1.0]`

### 5.6 에러 핸들러 + ApiError 계층 (D-14, D-15)

**권장: 단일 베이스 클래스 + status/code 필드** (분류만으로 충분; sub-class는 v2에서 도입).

```ts
// src/errors.ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const StockNotFound = (code: string) =>
  new ApiError(404, 'STOCK_NOT_FOUND', `Stock ${code} not found`);
export const InvalidQueryParam = (param: string, reason: string) =>
  new ApiError(400, 'INVALID_QUERY_PARAM', `${param}: ${reason}`);
export const ValidationFailed = (msg: string) =>
  new ApiError(400, 'VALIDATION_FAILED', msg);

// src/middleware/error-handler.ts
import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../errors';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    req.log?.warn({ err, code: err.code }, 'api error');
    res.status(err.status).json({
      error: { code: err.code, message: err.message }
    });
    return;
  }
  // CORS 거부
  if (err?.message === 'CORS_NOT_ALLOWED') {
    res.status(403).json({ error: { code: 'CORS_NOT_ALLOWED', message: 'Origin not allowed' } });
    return;
  }
  req.log?.error({ err }, 'unhandled error');
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Internal server error' : (err?.message ?? 'unknown'),
    }
  });
};
```

### 5.7 Zod 도입 권고

**권고: Zod 도입.** 4개 엔드포인트의 query string 검증(`market`, `minRate`, `sort`, `limit`)에 정형 에러(`VALIDATION_FAILED`)를 만들기 위한 가장 단순한 방법.

- 범위: query string parsing only. 응답 직렬화엔 사용 안 함(과한 런타임 오버헤드).
- 패키지: `zod` 4.x.
- 패턴:
  ```ts
  const ScannerQuery = z.object({
    market: z.enum(['KOSPI','KOSDAQ','ALL']).default('ALL'),
    minRate: z.coerce.number().optional(),
    sort: z.enum(['rate_desc','rate_asc','volume_desc']).default('rate_desc'),
    limit: z.coerce.number().int().min(1).max(10000).optional(),
  });
  // 라우터에서:
  const parsed = ScannerQuery.safeParse(req.query);
  if (!parsed.success) throw new ApiError(400, 'INVALID_QUERY_PARAM', parsed.error.issues[0].message);
  ```

대안: `express-validator` — 더 무겁고 미들웨어 체인에 강결합. 권장하지 않음.

---

## 6. Supabase 접근 패턴

### 6.1 클라이언트 싱글턴 (D-05) — Phase 1 미러

```ts
// server/src/services/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }, // 서버 측 service_role
});
```

`[VERIFIED: workers/ingestion/src/services/supabase.ts와 동일 패턴]`
`[VERIFIED: @supabase/supabase-js@2.103.0]`

### 6.2 컬럼 선택 전략 (Discretion 해결)

**권고: 명시적 컬럼 목록.** `.select('*')` 대신 응답에 필요한 컬럼만 명시.

이유:
1. 새 컬럼 추가 시 자동으로 응답에 포함되는 사고 방지(미래 PII/내부 필드)
2. 네트워크 페이로드 명시적 — gzip 후 ~60KB 추정의 근거
3. TS 타입 추론 좁힘

```ts
const COLS = 'code,name,market,price,change_amount,change_rate,volume,open,high,low,market_cap,upper_limit,lower_limit,updated_at';

const { data, error } = await supabase
  .from('stocks')
  .select(COLS)
  .order('change_rate', { ascending: false });
```

### 6.3 snake_case → camelCase 변환

DB는 `change_rate`, `upper_limit` 등 snake_case. `Stock` 타입은 `changeRate`, `upperLimit` camelCase. **수동 매퍼 함수**(`src/mappers/stock.ts`) 작성:

```ts
import type { Stock, Market } from '@gh-radar/shared';

type StockRow = {
  code: string; name: string; market: string;
  price: string; change_amount: string; change_rate: string;
  volume: number;
  open: string | null; high: string | null; low: string | null;
  market_cap: number | null;
  upper_limit: string; lower_limit: string;
  updated_at: string;
};

export function rowToStock(r: StockRow): Stock & { upperLimitProximity: number } {
  const upper = Number(r.upper_limit);
  const price = Number(r.price);
  return {
    code: r.code,
    name: r.name,
    market: r.market as Market,
    price,
    changeAmount: Number(r.change_amount),
    changeRate: Number(r.change_rate),
    volume: r.volume,
    open: Number(r.open ?? 0),
    high: Number(r.high ?? 0),
    low: Number(r.low ?? 0),
    marketCap: Number(r.market_cap ?? 0),
    upperLimit: upper,
    lowerLimit: Number(r.lower_limit),
    updatedAt: r.updated_at,
    upperLimitProximity: upper > 0 ? price / upper : 0,  // D-09
  };
}
```

**중요:** Supabase JS는 `numeric` 컬럼을 **string으로 반환**(JS Number로 정밀도 손실 방지). `Number()` 캐스팅 필수.

`[VERIFIED: supabase-js README, postgres numeric → string default]`

### 6.4 ILIKE 검색 (D-11)

```ts
// /api/stocks/search?q=삼성
const { data, error } = await supabase
  .from('stocks')
  .select(COLS)
  .or(`name.ilike.%${escape(q)}%,code.ilike.%${escape(q)}%`)
  .order('name', { ascending: true })
  .limit(20);
```

**보안:** `q` 입력에 `,`, `)`, `%` 같은 메타문자가 들어가면 PostgREST의 `or` 표현식이 깨질 수 있다. `escape` 함수로 `,`와 `(`/`)` 제거 또는 % 이스케이프.

```ts
function escape(s: string) {
  return s.replace(/[,()%]/g, '');  // 단순 — v1 충분
}
```

### 6.5 404 처리 (D-10)

```ts
// /api/stocks/:code
const { data, error } = await supabase
  .from('stocks')
  .select(COLS)
  .eq('code', code)
  .maybeSingle();  // ★ single()이 아니라 maybeSingle() — 0건이면 data=null, error=null

if (error) throw error;
if (!data) throw StockNotFound(code);
```

`.single()`은 0건 시 `PGRST116` 에러 — `.maybeSingle()`이 의도 더 명확.

`[CITED: supabase.com/docs/reference/javascript/maybesingle]`

---

## 7. 테스트 전략 (D-37)

### 7.1 vitest 유닛 — 순수 함수만

대상:
- `parseAllowedOrigins` (CORS 파서) — 정규식 리터럴 인식, 빈/undefined, 다중 origin
- `rowToStock` 매퍼 — string→number 변환, upperLimitProximity 계산, null marketCap 처리
- ScannerQuery zod 스키마 — 각 invalid 케이스
- escape (검색 쿼리 sanitizer)

### 7.2 supertest 통합 — `app.ts` import해 listen 없이

**핵심 분리:**

```ts
// src/app.ts — Express 인스턴스만 빌드
export function createApp(deps: { supabase: SupabaseClient }): express.Express {
  const app = express();
  app.locals.supabase = deps.supabase;
  // ... 미들웨어 + 라우터
  return app;
}

// src/server.ts — 프로덕션 엔트리
import { createApp } from './app';
import { supabase } from './services/supabase';
const app = createApp({ supabase });
app.listen(Number(process.env.PORT ?? 8080), () => logger.info('listening'));
```

**테스트:**

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { mockSupabase } from './fixtures/supabase-mock';

it('returns 404 with STOCK_NOT_FOUND for missing code', async () => {
  const app = createApp({ supabase: mockSupabase({ stocks: [] }) });
  const res = await request(app).get('/api/stocks/999999');
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('STOCK_NOT_FOUND');
});
```

### 7.3 Supabase mock 패턴 권고 (Discretion 해결)

**선택: dependency injection via `createApp(deps)`.** `app.locals.supabase`로 라우터에 전달.

이유 vs vitest module mock(`vi.mock('../src/services/supabase')`):
- 명시성: 의존성이 함수 시그니처에 노출 → 미래 라우터 추가 시 누구나 어떤 deps가 필요한지 즉시 파악
- supertest 호환성: 같은 테스트 파일에서 `mockSupabase({ ... fixtures })` 여러 인스턴스 동시 운영 가능
- vi.mock은 호이스팅/순서 의존이 있어 디버깅 어려움

**mock 구현 스케치:**

```ts
// tests/fixtures/supabase-mock.ts
export function mockSupabase(state: { stocks: StockRow[] }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((col, val) => ({ ...builder, _filter: { col, val } })),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => {
      const row = state.stocks.find(s => s.code === builder._filter?.val);
      return { data: row ?? null, error: null };
    }),
    then: (resolve: any) => resolve({ data: state.stocks, error: null }),
  };
  return { from: vi.fn().mockReturnValue(builder) } as unknown as SupabaseClient;
}
```

대안 검토: 로컬 Supabase(`supabase start`)는 통합 정확도 ↑ but 로컬 docker 의존성 추가, CI 미사용 정책(D-38)과 부조화. v1에서는 mock으로 충분.

### 7.4 배포 후 curl smoke

`scripts/deploy-server.sh` 말미. §10 Validation Architecture 참조.

---

## 8. Dockerfile 템플릿 (D-31, D-32)

`workers/ingestion/Dockerfile` 패턴을 그대로 mirror하되 엔트리포인트만 교체.

```dockerfile
# server/Dockerfile

# === Builder ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# 의존성 캐시 최적화
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/

RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY packages/shared/ ./packages/shared/
COPY server/ ./server/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/server build

# === Production ===
FROM node:22-alpine
WORKDIR /app

# non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@gh-radar/shared/package.json

USER app
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

**`.dockerignore`:**

```
node_modules
**/node_modules
**/dist
.git
.env
.env.*
*.md
.planning
tests
**/*.test.ts
```

**Healthcheck 미포함:** Cloud Run은 자체 startup probe(컨테이너가 PORT를 listen하면 healthy로 간주)와 liveness probe를 갖는다. Dockerfile `HEALTHCHECK`는 무시되므로 추가 불필요.

`[CITED: cloud.google.com/run/docs/configuring/healthchecks]`

**arm64 → amd64 빌드:**

```bash
docker build --platform=linux/amd64 -t $IMAGE -f server/Dockerfile .
```

native deps(bcrypt, sharp 등) 없으므로 emulation 빌드 시간 ~1.5x 증가만 감수. `buildx` 불필요.

`[VERIFIED: 본 페이즈 의존성 모두 pure JS — express, helmet, cors, pino, @supabase/supabase-js, zod, express-rate-limit]`

---

## 9. 배포 스크립트 구조 (D-36)

`scripts/deploy-server.sh` 섹션:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증
# ═══════════════════════════════════════════════════════════════
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: export GCP_PROJECT_ID=<your-project-id>" >&2
  exit 1
fi

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]]; then
  echo "ERROR: active gcloud configuration is '$ACTIVE_CONFIG', expected '$EXPECTED_CONFIG'" >&2
  echo "Hint: gcloud config configurations activate $EXPECTED_CONFIG" >&2
  exit 1
fi

if [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: active project is '$ACTIVE_PROJECT', expected '$EXPECTED_PROJECT'" >&2
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
SERVICE=gh-radar-server
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/server:${SHA}"
IMAGE_LATEST="${REGISTRY}/server:latest"

# ═══════════════════════════════════════════════════════════════
# Section 3: Build (amd64 강제)
# ═══════════════════════════════════════════════════════════════
docker build \
  --platform=linux/amd64 \
  -f server/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# ═══════════════════════════════════════════════════════════════
# Section 4: Push
# ═══════════════════════════════════════════════════════════════
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# ═══════════════════════════════════════════════════════════════
# Section 5: Deploy
# ═══════════════════════════════════════════════════════════════
: "${SUPABASE_URL:?SUPABASE_URL must be set}"
: "${CORS_ALLOWED_ORIGINS:?CORS_ALLOWED_ORIGINS must be set}"

# 콤마 escape — CORS_ALLOWED_ORIGINS이 콤마 포함
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=80 \
  --min-instances=1 \
  --max-instances=3 \
  --timeout=300s \
  --set-env-vars="^@^NODE_ENV=production@LOG_LEVEL=info@SUPABASE_URL=${SUPABASE_URL}@CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}" \
  --update-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

# ═══════════════════════════════════════════════════════════════
# Section 6: Smoke (§10 Validation Architecture)
# ═══════════════════════════════════════════════════════════════
URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
echo ""
echo "Deployed: $URL"
echo ""

bash scripts/smoke-server.sh "$URL"
```

`smoke-server.sh`는 §10의 invariant 6개를 curl로 검증.

---

## 10. Validation Architecture (Nyquist) — 필수 섹션

### 10.1 Test Framework

| Property | Value |
|----|----|
| Framework | vitest 4.x (Phase 1과 동일) `[VERIFIED: vitest@4.1.4]` |
| Config file | `server/vitest.config.ts` (Phase 1 패턴 미러) |
| Quick run command | `pnpm -F @gh-radar/server test --run` |
| Full suite command | `pnpm -F @gh-radar/server test --run && bash scripts/smoke-server.sh $URL` |
| Integration helper | supertest 7.x `[VERIFIED: supertest@7.2.2]` |

### 10.2 Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Status |
|---|----|---|---|---|
| INFR-03 | `/api/health`은 200 + `{status,timestamp,version}` 반환 | unit (supertest) | `vitest run tests/health.test.ts` | ❌ Wave 0 |
| INFR-03 | `/api/scanner` 응답에 `upperLimitProximity` 포함 | unit (supertest+mock) | `vitest run tests/scanner.test.ts` | ❌ Wave 0 |
| INFR-03 | `/api/stocks/:code` 미존재 → 404 STOCK_NOT_FOUND | unit (supertest+mock) | `vitest run tests/stock-detail.test.ts` | ❌ Wave 0 |
| INFR-03 | `/api/stocks/search?q=` ILIKE + ≤20 결과 | unit (supertest+mock) | `vitest run tests/search.test.ts` | ❌ Wave 0 |
| INFR-03 | CORS 허용/거부 origin 분기 | unit (supertest preflight) | `vitest run tests/cors.test.ts` | ❌ Wave 0 |
| INFR-03 | rate limit 201 req → 429 | unit (supertest 루프) | `vitest run tests/rate-limit.test.ts` | ❌ Wave 0 |
| INFR-03 | `X-Request-Id` 응답 헤더 echo + generate | unit (supertest) | `vitest run tests/request-id.test.ts` | ❌ Wave 0 |
| INFR-03 (배포) | min-instances=1 실제 적용 | manual | `gcloud run services describe ... --format='value(spec.template.metadata.annotations.autoscaling\.knative\.dev/minScale)'` → "1" | ❌ Wave 0 |
| INFR-03 (배포) | 배포 후 health 200 | smoke (curl) | `curl -fsS $URL/api/health \| jq -e '.status=="ok"'` | ❌ Wave 0 |
| INFR-03 (배포) | 배포 후 scanner 200 + 배열 | smoke (curl) | `curl -fsS $URL/api/scanner \| jq -e 'type=="array" and length>0'` | ❌ Wave 0 |
| INFR-03 (배포) | 005930(삼성전자) 상세 200 | smoke (curl) | `curl -fsS $URL/api/stocks/005930 \| jq -e '.code=="005930"'` | ❌ Wave 0 |

### 10.3 Smoke-Test Invariants (배포 게이트)

ROADMAP Phase 2 Success Criteria 4개에 매핑:

| # | Invariant | 검증 명령 | SC mapping |
|---|----|----|---|
| INV-1 | `GET /api/health` → 200 + `{status:'ok', timestamp:string, version:string}` | `curl -fsS $URL/api/health \| jq -e '.status=="ok" and (.timestamp\|type=="string") and (.version\|type=="string")'` | SC#1 (공개 URL 접근) |
| INV-2 | `GET /api/scanner` → 200 + 배열, 각 원소에 `upperLimitProximity:number` 존재 | `curl -fsS $URL/api/scanner \| jq -e 'type=="array" and (.[0].upperLimitProximity\|type=="number")'` | SC#3 (scanner endpoint) |
| INV-3 | `GET /api/stocks/005930` → 200 + `code=="005930"`, `name`은 한글 문자열 | `curl -fsS $URL/api/stocks/005930 \| jq -e '.code=="005930"'` | SC#4 (개별 종목) |
| INV-4 | `GET /api/stocks/000000` → 404 + `error.code=="STOCK_NOT_FOUND"` | `curl -s -o /tmp/r -w '%{http_code}' $URL/api/stocks/000000 \| grep -q 404 && jq -e '.error.code=="STOCK_NOT_FOUND"' /tmp/r` | SC#4 (404 경로) |
| INV-5 | `GET /api/stocks/search?q=삼성` → 200 + 배열 ≤20, 각 원소에 `name` 또는 `code`에 "삼성" 매치 | `curl -fsS "$URL/api/stocks/search?q=%EC%82%BC%EC%84%B1" \| jq -e 'type=="array" and length<=20 and length>0'` | SC#3 (Supabase 읽기 검증) |
| INV-6 | CORS preflight (허용 origin) → 200/204 + `Access-Control-Allow-Origin` 헤더 | `curl -fsS -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: https://gh-radar.vercel.app" -H "Access-Control-Request-Method: GET" $URL/api/scanner \| grep -qE '^(200\|204)$'` | SC#1 |
| INV-7 | CORS preflight (비허용 origin) → 4xx 또는 `Access-Control-Allow-Origin` 헤더 부재 | `! curl -fsS -X OPTIONS -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: GET" $URL/api/scanner -D - \| grep -qi access-control-allow-origin` | SC#1 |
| INV-8 | rate limit: 201개 연속 요청 시 마지막은 429 + `error.code=="RATE_LIMITED"` | `for i in $(seq 1 201); do curl -s -o /dev/null -w '%{http_code}\n' $URL/api/health; done \| tail -1 \| grep -q 429` | SC#1, D-20 |
| INV-9 | `X-Request-Id` 응답 헤더 항상 존재 | `curl -fsS -D - $URL/api/health -o /dev/null \| grep -qi 'x-request-id:'` | D-22 |
| INV-10 | min-instances=1 적용 확인 | `[[ "$(gcloud run services describe gh-radar-server --region=asia-northeast3 --format='value(spec.template.metadata.annotations.autoscaling\.knative\.dev/minScale)')" == "1" ]]` | SC#2 (비가역) |
| INV-11 | 응답 로그가 `request_id`, `status`, `latency_ms` 필드 포함 (Cloud Logging) | `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gh-radar-server"' --limit=1 --format=json \| jq -e '.[0].jsonPayload.request_id and .[0].jsonPayload.status and .[0].jsonPayload.latency_ms'` | D-25 |

### 10.4 Sampling Rate

- **Per task commit:** `pnpm -F @gh-radar/server test --run` (vitest unit + supertest, ~5초)
- **Per wave merge:** 위 + `pnpm -F @gh-radar/server build` + dockerfile 빌드 dry-run
- **Phase gate:** 위 + 실 Cloud Run 배포 + INV-1 ~ INV-11 모두 PASS

### 10.5 Wave 0 Gaps

- [ ] `server/vitest.config.ts` — Phase 1 ingestion vitest config 미러
- [ ] `server/tests/conftest.ts` 또는 `tests/setup.ts` — global mock helper, env 격리
- [ ] `server/tests/fixtures/supabase-mock.ts` — §7.3 mock 구현
- [ ] `server/tests/fixtures/stocks.ts` — 005930 삼성전자 등 샘플 row 데이터
- [ ] `scripts/smoke-server.sh` — INV-1 ~ INV-11 curl 스크립트
- [ ] supertest 설치: `pnpm -F @gh-radar/server add -D supertest@7 @types/supertest`
- [ ] vitest 설치: `pnpm -F @gh-radar/server add -D vitest@4`

---

## 11. Open Questions (RESOLVED 2026-04-13)

### Q1. `/api/scanner` Cache-Control 헤더 (Discretion)

**옵션:**
- (A) `Cache-Control: no-store` — 항상 최신 데이터 (단순)
- (B) `Cache-Control: public, max-age=30, s-maxage=30` — 30초 캐시 (Cloud Run 응답 절감)
- (C) `Cache-Control: public, max-age=60` — 1분 폴링과 동기화

**권고:** v1은 (A) `no-store`로 단순 시작. v2에서 트래픽 봐서 (C)로 전환 검토. min=1이라 비용 절감 동기 약함.

**RESOLVED:** 권고 A 채택 (no-store) — 02-03-PLAN.md Task 1 scanner.ts Cache-Control 헤더.

### Q2. `version` 필드 (health 응답) 출처

**옵션:**
- (A) `package.json` version + git SHA: `${pkg.version}-${process.env.GIT_SHA ?? 'dev'}`
- (B) 빌드 시 환경변수 주입: Dockerfile `ARG GIT_SHA` → `ENV APP_VERSION=...`
- (C) 단순 `package.json` version만

**권고:** (B). deploy 스크립트가 이미 `git rev-parse --short HEAD` 알고 있음. `docker build --build-arg GIT_SHA=$SHA` 추가 → Dockerfile에서 `ARG GIT_SHA` `ENV APP_VERSION=$GIT_SHA` → 런타임 `process.env.APP_VERSION` 읽기.

**RESOLVED:** 권고 B 채택 (ARG GIT_SHA + ENV APP_VERSION) — 02-04-PLAN.md Task 1 Dockerfile + Task 2 deploy-server.sh `--build-arg GIT_SHA=${SHA}`.

### Q3. pino-http 로그 레벨 정책

성공 로그(2xx)는 매 분 폴링 시 노이즈가 큼.

**옵션:**
- (A) 모든 요청 `info` (일관성)
- (B) 2xx는 `debug`, 4xx는 `warn`, 5xx는 `error` (시그널 ↑)

**권고:** (B). pino-http의 `customLogLevel` 옵션 사용:
```ts
pinoHttp({
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'info';
    return 'debug';
  },
});
```
LOG_LEVEL=info(기본) 시 2xx 로그 자연스럽게 억제, 운영 시 비용 ↓.

**RESOLVED:** 권고 B 채택 (customLogLevel) — 02-02-PLAN.md Task 1 pino-http 미들웨어(`server/src/middleware/pino-http.ts`).

### Q4. `@google-cloud/pino-logging-gcp-config` 도입 여부

**옵션:**
- (A) 직접 formatter 작성 (Phase 1 패턴 — 의존성 0개)
- (B) `@google-cloud/pino-logging-gcp-config` 도입 (severity 매핑 + ServiceContext 자동)

**권고:** (B). 16줄 formatter를 직접 쓰는 것보다, `[VERIFIED: @google-cloud/pino-logging-gcp-config@1.3.3]`을 도입하면 Cloud Logging severity, message 필드 rename(`msg` → `message`), nanosec 타임스탬프, Error stack→`stack_trace`(Error Reporting 자동 연동)까지 한 줄로 해결. Phase 1 워커도 차후 같은 패턴으로 통일 가능.

```ts
import pino from 'pino';
import { createGcpLoggingPinoConfig } from '@google-cloud/pino-logging-gcp-config';
export const logger = pino(createGcpLoggingPinoConfig(
  { serviceContext: { service: 'gh-radar-server', version: process.env.APP_VERSION ?? 'dev' } },
  { level: process.env.LOG_LEVEL ?? 'info', redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.supabase_service_role_key', '*.access_token', '*.refresh_token'], censor: '[REDACTED]' } },
));
```

**RESOLVED:** 권고 B 채택 (@google-cloud/pino-logging-gcp-config) — 02-01-PLAN.md Task 2 `server/src/logger.ts` + `pnpm add @google-cloud/pino-logging-gcp-config` 의존성.

### Q5. CORS 거부 응답 코드

cors 미들웨어가 throw하면 §5.6의 errorHandler가 잡아 403 반환. 일부 팀은 200+빈 헤더(브라우저가 자체 차단) 선호. **권고:** 명시적 403 — 디버깅 용이.

**RESOLVED:** 권고 채택 (명시적 403 + CORS_NOT_ALLOWED) — 02-02-PLAN.md Task 2 errorHandler `Error('CORS_NOT_ALLOWED')` → 403 분기.

---

## 12. 환경 가용성 (Environment Availability)

| Dependency | Required By | Available | Version | Fallback |
|---|----|---|---|----|
| Node.js 22 LTS | 모든 워크스페이스 (로컬 + Docker) | (사용자 환경) `.nvmrc=22` | node:22-alpine 이미지 + 로컬 22 | node:22-slim (Debian) 시 alpine issue |
| pnpm 10 | 워크스페이스 빌드 | (사용자 환경) Phase 1 검증됨 | 10.x | — |
| Docker | 이미지 빌드 | (사용자 환경 가정) | — | Cloud Build (D-32에서 명시 제외) |
| gcloud CLI | 배포 | (사용자 환경 가정) D-39 사전 준비 | — | 콘솔 수동 (비권장) |
| GCP 프로젝트 | 배포 대상 | (사용자 사전 준비) | — | — |
| Artifact Registry repo `gh-radar` | 이미지 push | 미생성 — §3.1 사전 setup 단계 | — | 첫 배포 전 생성 필요 |
| Secret `gh-radar-supabase-service-role` | 런타임 service_role 키 | 미생성 — §3.2 setup 필요 | — | 첫 배포 전 생성 필요 |
| Supabase 프로젝트 (Phase 1) | DB 읽기 | ✓ Phase 1에서 생성 완료 | — | — |

**Missing dependencies (no fallback):**
- Artifact Registry repo, Secret Manager 시크릿 — §3.1 / §3.2 setup 단계가 첫 배포 wave에 포함되어야 함

---

## 13. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|----|----|----|---|
| async 에러 catch | `try/catch` 모든 핸들러 | Express 5 native async 전파 | Express 5에서 자동, wrapper 불필요 |
| 보안 헤더 | 직접 `res.setHeader('X-Frame-Options', ...)` | helmet | 14개 헤더 한꺼번에, 기본값이 OWASP 권장 |
| CORS preflight | `app.options` 수동 핸들러 | cors 미들웨어 | preflight + 실제 요청 헤더 동시 처리 |
| rate limiting | Map 기반 카운터 | express-rate-limit + ipKeyGenerator | IPv6 subnet, draft-7 헤더, RateLimit-* 표준 |
| request ID | Math.random() | crypto.randomUUID() + 헤더 echo | UUID v4 충돌 확률 사실상 0 |
| 로그 severity 매핑 | 직접 formatter | `@google-cloud/pino-logging-gcp-config` | Cloud Logging + Error Reporting 자동 통합 |
| query string 검증 | 수동 `if/else` | zod safeParse | 타입 추론 + 통일된 에러 메시지 |
| Supabase row → camelCase | 일반화 라이브러리(humps 등) | 명시적 매퍼 함수 | 컬럼 16개로 명시가 더 안전+빠름 |

---

## 14. Common Pitfalls

### Pitfall 1: `app.set('trust proxy')` 미설정 → rate limit 무효화
**증상:** Cloud Run 배포 후 모든 요청이 같은 internal IP로 집계 → 어느 사용자 한 명이 200 req/min 다 소진 → 다른 사용자 전부 429.
**원인:** Express 기본 `req.ip`는 socket IP. Cloud Run에선 GFE가 X-Forwarded-For 추가하지만 trust proxy=false이면 무시.
**예방:** `app.set('trust proxy', 1)` 호출. Express 5에서도 동일.
**조기 감지:** `/ip` 디버그 라우트(개발 환경만) → 실제 클라이언트 IP 확인.

### Pitfall 2: Secret Manager 권한 부여 누락 → 배포는 성공, 첫 요청에서 500
**증상:** `gcloud run deploy` 성공 → 컨테이너 시작 시 `Permission denied accessing secret` → SUPABASE_SERVICE_ROLE_KEY 미주입 → `loadConfig()` throw → 컨테이너 죽음 → 무한 cold start 루프.
**원인:** Cloud Run runtime SA(`PROJECT_NUMBER-compute@`)에 secretmanager.secretAccessor 미부여.
**예방:** §3.2 IAM 명령 setup wave에 포함. 배포 전에 한 번만.
**조기 감지:** `gcloud logging read 'severity=ERROR'` 첫 분 내 확인.

### Pitfall 3: `numeric` 컬럼을 number로 가정하고 산술 연산 → NaN
**증상:** Supabase에서 받은 `r.upper_limit`이 `"30000.00"` (string). `r.price / r.upper_limit` → NaN. JSON 직렬화 시 `null`로 빠짐.
**원인:** PostgREST는 numeric을 정밀도 보존 위해 string으로 직렬화.
**예방:** `Number(r.upper_limit)` 명시 캐스팅. 매퍼 함수에서만 변환.
**조기 감지:** vitest unit `rowToStock` 테스트 — `expect(typeof result.price).toBe('number')`.

### Pitfall 4: `--set-env-vars`로 CORS_ALLOWED_ORIGINS 같은 콤마 포함 값 전달 → 파싱 깨짐
**증상:** `CORS_ALLOWED_ORIGINS=a,b,c`를 `--set-env-vars="CORS_ALLOWED_ORIGINS=a,b,c"` 전달 → gcloud가 콤마를 env var separator로 해석 → `CORS_ALLOWED_ORIGINS=a` + 의도치 않은 `b=` `c=` 환경변수 생성.
**예방:** `^@^` delimiter 변경 문법: `--set-env-vars="^@^KEY1=v@KEY2=a,b,c"`. §3.3 deploy 명령 참조.
**조기 감지:** 배포 후 `gcloud run services describe ... --format='value(spec.template.spec.containers[0].env)'`로 실제 mount된 값 확인.

### Pitfall 5: Express 5 path-to-regexp `/*` 사용 시 즉시 throw
**증상:** Express 4 습관으로 `app.get('/*', ...)` 작성 → 시작 시 `TypeError: Missing parameter name`.
**원인:** v5는 wildcard에 이름 강제 (`/*splat`).
**예방:** 우리 페이즈는 wildcard 라우트 없음. 404 fallback은 `app.use(handler)` 패턴 사용 (path 인자 없음).

### Pitfall 6: macOS arm64에서 amd64 빌드 후 native deps 포함된 경우 segfault
**증상:** 본 페이즈 직접 영향 없음(pure JS deps만). 그러나 미래에 sharp/bcrypt 추가 시 발생.
**예방:** 새 의존성 추가 시 `npm view <pkg> dependencies` 확인. native 있으면 `--platform=linux/amd64` + builder 인스턴스 또는 multi-arch 이미지 빌드 필요.

---

## 15. State of the Art

| 옛 패턴 | 현재 패턴 | 변화 시점 | 영향 |
|---|----|----|---|
| `express-async-handler` wrapper | Express 5 native async 전파 | Express 5.0 (2024) | 의존성 1개 제거 |
| `bodyParser` 패키지 | `express.json()` 빌트인 | Express 4.16 | OK (이미 빌트인) |
| `morgan` 로깅 | `pino-http` JSON | Cloud Logging 보급 | structured log + Cloud Logging severity 직접 매핑 |
| 직접 GCP severity formatter | `@google-cloud/pino-logging-gcp-config` | 2024 GA | maintained library, OpenTelemetry trace 매핑 포함 |
| express-rate-limit `max` 옵션 | `limit` 옵션 | v7 (2024) | `max`도 동작하지만 deprecation warning |

**Deprecated/사용 금지:**
- `express-async-handler` — Express 5에서 불필요
- `body-parser` 직접 import — `express.json()` 사용
- `morgan` — 비구조화 로그, Cloud Logging severity 인식 안 함

---

## 16. Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|----|----|----|
| A1 | Cloud Run min=1 비용 월 \$8~12 (CPU throttled 모드) | §3.5 | 비용 추정만 어긋남, 기능 영향 없음 |
| A2 | Phase 1에서 수정한 stocks 테이블 컬럼명/타입은 §6.3 매퍼와 일치 | §6.3 | 매퍼 컬럼명 mismatch → 런타임 NaN/null. **마이그레이션 SQL 재확인은 본 리서치 §13~14에서 완료, OK** |
| A3 | Cloud Run 기본 runtime SA가 Compute Engine default SA(`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) | §3.2 | GCP Org 정책에서 다른 SA 강제 시 권한 부여 SA 변경 필요 |
| A4 | macOS arm64 → amd64 빌드 시 본 페이즈 모든 deps에서 native 컴파일 없음 | §8 | sharp/bcrypt 등 추가 시 buildx 필요 |
| A5 | Cloud Run에서 외부 → 컨테이너 사이 proxy 단계는 1단(GFE만) | §5.4 | LB 추가 시 trust proxy 값 조정 필요. 본 페이즈는 LB 없음 |

---

## 17. References

### Primary (HIGH confidence — 공식 문서)
- Express 5 migration: https://expressjs.com/en/guide/migrating-5.html
- Cloud Run secrets: https://cloud.google.com/run/docs/configuring/services/secrets
- Cloud Run min-instances: https://cloud.google.com/run/docs/configuring/min-instances
- Cloud Run healthchecks: https://cloud.google.com/run/docs/configuring/healthchecks
- gcloud run deploy: https://cloud.google.com/sdk/gcloud/reference/run/deploy
- Artifact Registry create-repos: https://cloud.google.com/artifact-registry/docs/repositories/create-repos
- Supabase JS reference: https://supabase.com/docs/reference/javascript
- Supabase maybeSingle: https://supabase.com/docs/reference/javascript/maybesingle
- @google-cloud/pino-logging-gcp-config 가이드: https://googlecloudplatform.github.io/cloud-solutions/pino-logging-gcp-config/

### Secondary (MEDIUM — verified)
- express-rate-limit Troubleshooting Proxy Issues wiki: https://github.com/express-rate-limit/express-rate-limit/wiki/Troubleshooting-Proxy-Issues
- expressjs/cors README: https://github.com/expressjs/cors

### npm registry (versions verified 2026-04-13)
- express@5.2.1 · helmet@8.1.0 · cors@2.8.6 · express-rate-limit@8.3.2
- pino@10.3.1 · pino-http@11.0.0 · @google-cloud/pino-logging-gcp-config@1.3.3
- @supabase/supabase-js@2.103.0 · vitest@4.1.4 · supertest@7.2.2 · @types/supertest@6.0.2
- typescript@5.0.6 (latest 5.x verify) · tsx@4.21.0 · uuid@13.0.0

### 인접 코드베이스 (read)
- `/Users/alex/repos/gh-radar/workers/ingestion/Dockerfile` — 멀티스테이지 템플릿
- `/Users/alex/repos/gh-radar/workers/ingestion/src/services/supabase.ts` — 싱글턴 패턴
- `/Users/alex/repos/gh-radar/workers/ingestion/src/logger.ts` — pino redact
- `/Users/alex/repos/gh-radar/packages/shared/src/stock.ts` — Stock 타입
- `/Users/alex/repos/gh-radar/supabase/migrations/20260413120000_init_tables.sql` — stocks 컬럼명/타입

---

## Metadata

**Confidence breakdown:**
- Cloud Run/GCP 명령: HIGH — 공식 문서 verbatim 인용
- Express 5 migration: HIGH — 공식 마이그레이션 가이드
- 미들웨어 코드 스니펫: HIGH — npm verified version + 공식 README
- Supabase 패턴: HIGH — Phase 1 코드 직접 참조 + Supabase 공식
- 비용 추정 (§3.5): LOW — 사용자 GCP 가격 계산기 재확인 권장
- min=1 cold start 회피 검증 명령: HIGH — gcloud reference

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (30일 — Express/Cloud Run/Supabase 모두 stable)

---

## RESEARCH COMPLETE
