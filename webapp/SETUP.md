# webapp Setup — Phase 06.2 Auth + Watchlist

이 문서는 Phase 06.2 이후 Google OAuth 로그인 + 관심종목(Watchlist) 기능을 운영하기 위한
수동 설정 절차를 단계별로 기록한다. 신규 환경(프로덕션, staging, 개발자 로컬)에 코드를
배포할 때 참조한다.

> **범위 노트** — Phase 06.2 는 Google OAuth 단일 프로바이더 노선이다. 이메일/비밀번호
> 로그인 및 Kakao 소셜 로그인은 이번 phase 범위가 아니며 후속 phase 에서 다룬다.

---

## 1. Supabase Dashboard 설정

### 1.1 Google OAuth Provider 활성화

1. Supabase Dashboard → Project `gh-radar` → Authentication → Providers
2. Google 항목을 클릭하여 **Enabled** 토글을 ON 으로 변경
3. 아래 §2 Google Cloud Console 단계에서 얻은 **Client ID** 와 **Client Secret** 을 입력하고 Save
4. Google 항목 우측 상단의 **Callback URL (for OAuth)** 값을 복사해둔다 — §2.4 의 Authorized redirect URI 에 이 값을 그대로 등록한다 (형태: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`)

### 1.2 URL Configuration

Supabase Dashboard → Authentication → URL Configuration

- **Site URL:** `https://gh-radar-webapp.vercel.app`
- **Redirect URLs (모두 등록):**
  - `https://gh-radar-webapp.vercel.app/auth/callback`
  - `http://localhost:3100/auth/callback` (⚠ dev.sh 가 강제하는 포트 — 3000 아님)
  - 필요 시 Vercel preview URL 을 **개별 등록** (⚠ wildcard `https://*-vercel.app/auth/callback` 형태는 지원되지 않음 — Pitfall 8 참조)

> 대안: Preview 배포는 로그인 smoke 를 스킵하거나, `vercel.json` 에서 preview 에 고정
> 별칭(alias)을 설정하여 redirect URL 을 한 번만 등록하는 방식도 가능.

### 1.3 watchlists 스키마 적용 (Plan 02 에서 완료됨)

- 마이그레이션: `supabase/migrations/20260416120000_watchlists.sql`
- 적용 명령 (신규 환경):
  ```bash
  supabase db push
  ```
- 적용 확인 (Table Editor):
  - `public.watchlists` 테이블 존재 (컬럼: `user_id`, `stock_code`, `added_at`, `position`)
  - 4 개의 RLS 정책 (SELECT/INSERT/UPDATE/DELETE) 모두 `auth.uid() = user_id` 기반
  - Trigger `trg_enforce_watchlist_limit` (50 개 제한 강제)
  - `stocks` / `stock_quotes` 의 RLS 정책이 `read_*` 네이밍 + `TO anon, authenticated` 로 확장되어 있는지 확인 (Pitfall 3 예방)
- 상세 스키마 문서: [`supabase/SCHEMA.md`](../supabase/SCHEMA.md) §watchlists

---

## 2. Google Cloud Console — OAuth 2.0 Client 발급

> ⚠ **Pitfall 2 — redirect URI 혼동 주의:**
> Google Cloud Console 의 Authorized redirect URIs 에는 **Supabase URL 만** 등록한다.
> gh-radar 앱의 `https://gh-radar-webapp.vercel.app/auth/callback` 을 여기에 등록하면
> OAuth 플로우 시 "Error 400: redirect_uri_mismatch" 오류가 발생한다.
>
> 이유: Google → Supabase → gh-radar 앱 순으로 리다이렉트가 이루어지며, Google 관점에서는
> Supabase URL 만 보인다. 앱 URL 은 Supabase Dashboard §1.2 의 Redirect URLs 에만 등록한다.

### 2.1 프로젝트 선택

1. <https://console.cloud.google.com/> 접속
2. 상단 프로젝트 드롭다운에서 사용할 프로젝트 선택 (없으면 신규 생성)

### 2.2 OAuth 동의 화면 구성 (최초 1 회)

1. APIs & Services → OAuth consent screen
2. User Type: **External** 선택 → Create
3. App name (예: `gh-radar`), User support email, Developer contact information 입력
4. Scopes 는 기본값 (`email`, `profile`, `openid`) 유지 — 추가 스코프 불필요
5. Test users (개발 단계): 본인 Google 계정 + E2E 테스트용 계정 추가

### 2.3 OAuth 2.0 Client ID 발급

1. APIs & Services → Credentials → **Create Credentials** → **OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Name: `gh-radar webapp` (임의)

### 2.4 Authorized redirect URIs 등록 (이것만)

```
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

- `<supabase-project-ref>` 는 Supabase Dashboard 좌측 상단 프로젝트 URL (`https://<ref>.supabase.co`) 에서 확인
- 또는 §1.1 단계 4 에서 복사해둔 Callback URL 을 그대로 붙여넣는다

### 2.5 Client ID / Secret 복사 → Supabase 에 입력

1. 발급 완료 후 나타나는 Client ID + Client Secret 을 복사
2. Supabase Dashboard §1.1 의 Google provider 폼에 입력 후 Save

---

## 3. Vercel 환경변수

아래 변수들이 Vercel Production + Preview 환경에 설정되어 있는지 확인한다.

| Key | 값 출처 |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → **anon public** key |
| `NEXT_PUBLIC_API_BASE_URL` | Phase 2 Cloud Run URL (예: `https://gh-radar-server-1023658565518.asia-northeast3.run.app`) — Phase 4 에서 이미 설정되었을 가능성 높음 |

> ⚠ **service_role key 는 webapp Vercel 환경에 절대 설정하지 말 것.**
> service_role 키는 RLS 를 완전히 우회할 수 있어 클라이언트 번들에 노출되면 보안 사고로
> 직결된다. webapp 은 anon key 만 사용하며, 사용자 인증 후 RLS 가 `auth.uid()` 기반으로
> row-level 접근 제어를 수행한다. service_role 키는 E2E 시딩 스크립트 (§5) 또는 백엔드
> worker 등 신뢰 영역에서만 사용한다.

확인 명령 (Vercel CLI 설치 전제):

```bash
cd webapp
vercel env ls
```

필요 시 추가 등록:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Preview 환경에도 동일하게 추가
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
```

---

## 4. 로컬 개발

1. 환경변수 템플릿 복사:
   ```bash
   cp webapp/.env.local.example webapp/.env.local
   ```
2. `webapp/.env.local` 의 Supabase 관련 값을 채운다 (Vercel env 와 동일한 값):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. 개발 서버 기동 (**루트의 `./dev.sh` 가 PORT=3100 강제** — pnpm dev 직접 호출 시에도 PORT=3100 설정 필수):
   ```bash
   ./dev.sh --webapp-only
   # 또는
   PORT=3100 pnpm --filter @gh-radar/webapp dev
   ```
4. Smoke 테스트:
   - `http://localhost:3100/login` 이동
   - "Google로 로그인" 버튼 클릭
   - Google OAuth 동의 플로우 완료 후 `/scanner` 로 자동 리다이렉트되는지 확인
   - 사이드바 하단 유저 섹션 (아바타 + 이름) 표시 확인 → 클릭 시 팝오버에 이메일 + 로그아웃 버튼 노출

> `.env.local` 은 `.gitignore` 에 포함되어 있으며 **절대 커밋하지 않는다**. 실수로 스테이징되면
> `git restore --staged webapp/.env.local` 로 되돌린다.

---

## 5. E2E 테스트 유저 프로비저닝 (Plan 08 전제)

Playwright E2E 스위트는 **Google OAuth 를 자동으로 통과할 수 없다** (Google 로그인 화면은
자동화 감지로 차단됨). 대신 Supabase Admin API 로 사전에 발급된 테스트 유저의 세션
쿠키를 `storageState` 로 주입하여 로그인 상태를 재현한다.

### 5.1 환경변수 설정

쉘 또는 `.env.test.local` (gitignore 대상) 에 다음을 설정:

```bash
export SUPABASE_URL="<Supabase URL — https://<ref>.supabase.co>"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key — 절대 커밋 금지>"
export E2E_TEST_EMAIL="e2e@gh-radar.local"
export E2E_TEST_PASSWORD="<32자 이상 랜덤 문자열>"
```

> ⚠ `SUPABASE_SERVICE_ROLE_KEY` 는 **시딩 스크립트 실행 시에만** 사용한다.
> webapp runtime 프로세스 (dev / build / Vercel) 에는 절대 주입하지 않는다 — §3 경고 참조.

### 5.2 시딩 스크립트 실행

```bash
pnpm --filter @gh-radar/webapp exec tsx scripts/seed-test-user.ts
```

> 스크립트 구현은 Phase 06.2 Plan 08 에서 제공된다 (`webapp/scripts/seed-test-user.ts`).
> 스크립트는 `createUser` (admin API) 로 유저를 생성하고 이메일 확인을 자동 승인하여
> Playwright setup project 가 로그인에 사용할 수 있게 한다.

### 5.3 Playwright 실행

```bash
pnpm --filter @gh-radar/webapp test:e2e
```

setup project 가 `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` 로 `signInWithPassword` 후
`storageState` 를 저장 → 각 spec 은 이 state 를 로드하여 로그인된 상태로 시작한다.

---

## 6. 자주 발생하는 문제 (Pitfalls)

| 증상 | 원인 | 해결 |
|------|------|------|
| "Error 400: redirect_uri_mismatch" (Google 화면) | Google Cloud Console §2.4 에 앱 URL 이 등록됨 | Google Console 에는 **Supabase URL 만** 등록. 앱 URL 은 Supabase Dashboard §1.2 의 Redirect URLs 에만. |
| 로그인 직후 `/login` 으로 다시 튕김 (루프) | middleware 3단 쿠키 동기화 깨짐 | `webapp/src/lib/supabase/middleware.ts` 의 `supabaseResponse = NextResponse.next({ request })` 재생성 위치를 공식 패턴 그대로 유지했는지 확인 (Pitfall 1). |
| Watchlist 페이지에서 종목명이 비어있음 (`stock: null`) | `stocks` / `stock_quotes` RLS 가 `authenticated` 역할을 포함하지 않음 | Plan 02 마이그레이션의 `TO anon, authenticated` 확장이 누락되지 않았는지 재확인 (Pitfall 3). |
| Vercel Preview URL 에서만 로그인 실패, Production 정상 | Preview URL 이 Supabase Redirect URLs 에 없음 | Preview URL 을 개별 등록하거나, preview smoke 를 스킵 (Pitfall 8). wildcard 미지원. |
| Safari / Firefox 에서만 로그아웃됨 | JWT 가 4KB 초과 + 쿠키 chunk 가 일부만 전달 | middleware 의 `getAll` / `setAll` 이 모든 chunk 쿠키를 순회하는지 확인 (Pitfall 4). 특정 쿠키 이름 하드코딩 금지. |
| Server Component 런타임 오류 `cookieStore.getAll is not a function` | Next.js 15 `cookies()` async 미준수 | `webapp/src/lib/supabase/server.ts` 의 `const cookieStore = await cookies()` 확인 (Pitfall 5). |

---

## 7. 관련 참조

- 마이그레이션: [`supabase/migrations/20260416120000_watchlists.sql`](../supabase/migrations/20260416120000_watchlists.sql)
- Watchlist RLS 스키마 문서: [`supabase/SCHEMA.md`](../supabase/SCHEMA.md) §watchlists
- Phase 06.2 컨텍스트: [`.planning/phases/06.2-auth-watchlist/06.2-CONTEXT.md`](../.planning/phases/06.2-auth-watchlist/06.2-CONTEXT.md)
- Phase 06.2 리서치 (Pitfall 전체): [`.planning/phases/06.2-auth-watchlist/06.2-RESEARCH.md`](../.planning/phases/06.2-auth-watchlist/06.2-RESEARCH.md)
- 인증 UI 계약: [`.planning/phases/06.2-auth-watchlist/06.2-UI-SPEC.md`](../.planning/phases/06.2-auth-watchlist/06.2-UI-SPEC.md)
- weekly-wine-bot admin 참조 구현 (Supabase 3-파일 클라이언트 원본): `~/repos/weekly-wine-bot/admin/`
