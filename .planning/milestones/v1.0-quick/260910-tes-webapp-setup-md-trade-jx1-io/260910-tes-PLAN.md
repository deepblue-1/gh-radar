---
phase: quick-260910-tes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/SETUP.md
autonomous: true
requirements: [AUTH-02]

estimate:
  tokens: 18000
  raw_tokens: 18000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "SETUP.md 를 처음 읽는 사람이 프로덕션 정본 도메인으로 https://trade.jx1.io 를 집는다 — vercel.app 을 정본으로 착각하지 않는다"
    - "vercel.app 콜백은 폐기 표기가 아니라 등록 유지 대상(롤백·프리뷰 안전망)으로 남아 있다 — 실제 Supabase 에 등록된 상태와 문서가 일치한다"
    - "Google Cloud Console 에는 Supabase URL 만 등록한다는 규칙이 커스텀 도메인 도입 후에도 최소한 이전만큼 명확하게 읽힌다"
    - "새 프론트 도메인을 붙이면 Cloud Run CORS 허용 목록도 같이 바꿔야 한다는 사실이 SETUP.md 안에서 발견된다"
    - "문서 골격(7개 ## 섹션)과 기존 Pitfall 문장들이 그대로 남는다 — 도메인 갱신이 재구조화로 번지지 않는다"
  artifacts:
    - webapp/SETUP.md
  key_links:
    - "§1.2 Redirect URLs ↔ Supabase Dashboard 실제 등록 상태 — 문서가 dashboard 의 거울이다. trade.jx1.io/auth/callback 과 gh-radar-webapp.vercel.app/auth/callback 둘 다 살아 있다"
    - "§2.4 등록 블록 ↔ Google Console — 이 블록에는 supabase.co/auth/v1/callback 하나만 있어야 한다. 앱 도메인이 여기 새는 순간 redirect_uri_mismatch"
    - "§3 프론트 origin ↔ Cloud Run CORS_ALLOWED_ORIGINS — 문서화되지 않으면 다음 도메인 전환 때 같은 사고를 반복한다"
---

<objective>
`webapp/SETUP.md` 의 프로덕션 도메인 기술을 `https://gh-radar-webapp.vercel.app` 에서 커스텀 도메인 `https://trade.jx1.io` 로 갱신한다. **문서 전용 — 코드·의존성·테스트 변경 없음.**

Purpose: 2026-09-10 에 `trade.jx1.io` 가 Vercel 프로젝트 `gh-radar-webapp` 앞단에 실제로 붙었고(Let's Encrypt 인증서 발급, HTTP→HTTPS 308, `/` · `/login` · `/auth/callback` 라우트 실측 완료), Supabase Auth 의 Site URL 도 이미 `https://trade.jx1.io` 로 바뀌었다. SETUP.md 만 옛 도메인을 정본으로 기술하고 있어, 이 문서로 신규 환경을 세팅하는 사람이 **실제 대시보드 상태와 어긋난 값을 넣게 된다.**

부수적으로, 이번 전환에서 실제로 밟은 함정 — 새 프론트 도메인이 Cloud Run `CORS_ALLOWED_ORIGINS` 에 없으면 페이지는 뜨는데 모든 API 호출만 조용히 죽는다 — 를 문서의 기존 자리(§3 환경변수 · §6 Pitfalls 표)에 한 줄씩 남긴다.

Output: 갱신된 `webapp/SETUP.md` 한 파일.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@webapp/SETUP.md
</context>

<verified_facts>
아래는 2026-09-10 실측으로 확정된 사실이다. **재검증하지 말고 그대로 인용할 것.**

- DNS: Cloudflare `jx1.io` zone → `CNAME trade → cname.vercel-dns.com`, **Proxy status = DNS only (grey cloud)**. Vercel 이 이미 Edge CDN + 자동 TLS 를 제공하므로 의도적으로 프록시하지 않는다. (형제 도메인 `w-admin.jx1.io` 는 프록시 상태이지만 그것은 다른 프로젝트이고 따라할 패턴이 아니다.)
- TLS: Let's Encrypt `CN=trade.jx1.io`, 2026-12-09 까지 유효, 자동 갱신.
- HTTP → HTTPS: 308 Permanent Redirect, HSTS `max-age=63072000`.
- 라우트 실측: `/` 200 · `/login` 200 · `/auth/callback` 307, `server: Vercel` / `x-vercel-id: icn1`.
- Cloud Run `gh-radar-server` (region `asia-northeast3`) 의 `CORS_ALLOWED_ORIGINS` 갱신 후 리비전 `gh-radar-server-00044-4w9` 100% 트래픽. 현재 값:
  `https://trade.jx1.io,https://gh-radar-webapp.vercel.app,/^https:\/\/gh-radar-.*\.vercel\.app$/`
  Preflight 실측: `Origin: https://trade.jx1.io` → 204 + `access-control-allow-origin: https://trade.jx1.io`. 기존 vercel.app origin 도 회귀 없음.
- Supabase Auth URL Configuration: Site URL → `https://trade.jx1.io`, Redirect URLs 에 `https://trade.jx1.io/auth/callback` 추가. **기존 `https://gh-radar-webapp.vercel.app/auth/callback` 항목은 삭제하지 않고 유지**(롤백·프리뷰 안전망).
- `https://gh-radar-webapp.vercel.app` 는 **폐기되지 않았다.** 여전히 유효하고 도달 가능하다. 문서는 trade.jx1.io 를 프로덕션 정본으로 제시하되 vercel.app 을 「등록 유지 중인 대체 경로」로 남겨야 한다.
</verified_facts>

<hard_constraints>
1. **Google Cloud Console 규칙을 절대 훼손하지 말 것.** SETUP.md 는 §2 서두 blockquote 와 §6 표 첫 행에서 「Google Cloud Console 의 Authorized redirect URIs 에는 **Supabase URL 만** 등록한다. 앱 URL 은 Supabase Dashboard §1.2 의 Redirect URLs 에만」을 규정한다. 커스텀 도메인 도입은 이 규칙을 **바꾸지 않는다.** 편집 결과가 직접적으로든 함의로든 독자에게 `https://trade.jx1.io/auth/callback` 을 Google Console 에 등록하라고 읽히면 안 된다. 편집 후에 규칙이 편집 전보다 **덜** 명확해서도 안 된다.
2. **§2.4 등록 블록은 불변.** `### 2.4` 블록의 코드 펜스 안에는 `https://<supabase-project-ref>.supabase.co/auth/v1/callback` 한 줄만 있어야 한다. 앱 콜백 URL 이 이 블록에 새면 안 된다.
3. **재구조화 금지.** `## ` 최상위 섹션 7개(1~7)의 개수·순서·제목을 바꾸지 않는다. 새 문단은 **기존 구조 안에 추가**(blockquote 1개 · 표 행 1개)만 허용.
4. **스코프 밖 파일 금지.** `tasks/lessons.md` · `scripts/smoke-server.sh` · `server/tests/**` 도 `vercel.app` 을 언급하지만 손대지 않는다. 테스트 픽스처는 wildcard 정규식을 검증 중이라 현재가 정답이고, smoke 스크립트의 Origin 헤더는 변경되지 않은 allow-list 에 대해 여전히 통과한다. 코드·의존성·테스트 변경 0.
</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: §1.2 URL Configuration 과 §2 Pitfall 2 를 trade.jx1.io 정본으로 갱신</name>
  <files>webapp/SETUP.md</files>
  <precondition>`webapp/SETUP.md` 가 존재하고, `grep -n 'gh-radar-webapp\.vercel\.app' webapp/SETUP.md` 가 §1.2 Site URL 행 · §1.2 Redirect URLs 행 · §2 서두 blockquote 세 지점을 실제로 반환한다. 계획 시점의 행번호(25 · 27 · 54)는 참고값일 뿐이므로 편집 전에 grep 으로 실제 위치를 다시 고정할 것.</precondition>
  <read_first>
`webapp/SETUP.md` 를 통째로 한 번 읽고 §1.2(URL Configuration) · §2 서두 blockquote · §2.4 등록 블록 · §6 Pitfalls 표를 동시에 파악한다. 편집 전 `grep -n 'vercel\.app\|jx1' webapp/SETUP.md` 로 실제 잔존 지점을 전수 확인한다 — 이 grep 이 계획서의 행번호보다 우선한다. 편집으로 행이 밀리므로 grep 은 편집 **전에** 한 번만 돌리고 결과를 근거로 문자열 치환한다.
  </read_first>
  <action>
세 지점을 치환한다.

**(a) §1.2 Site URL 행.** `- **Site URL:** ` 뒤의 값을 `https://gh-radar-webapp.vercel.app` 에서 `https://trade.jx1.io` 로 바꾼다. 백틱 코드 스팬 형식은 그대로 유지한다.

**(b) §1.2 Redirect URLs 목록.** 목록 맨 앞에 trade 도메인 항목을 넣고 vercel 항목은 **삭제하지 말고** 그 아래에 남긴다. 남기는 이유(롤백·프리뷰 안전망으로 Supabase 에 실제 등록 유지 중)를 각 항목 뒤 괄호에 한 구절로 붙인다. `http://localhost:3100/auth/callback` 항목과 그 dev.sh PORT=3100 경고, 그리고 그 아래 Vercel preview URL 개별 등록 항목(wildcard 미지원 · Pitfall 8 참조)은 **문자 그대로 보존**한다. 목록 아래 「대안: Preview 배포는 로그인 smoke 를 스킵하거나…」 blockquote 도 손대지 않는다.

결과 형태:

- Site URL 은 `https://trade.jx1.io`
- Redirect URLs 는 위에서부터 ① trade 도메인 콜백(프로덕션 정본) ② vercel 기본 도메인 콜백(폐기 아님 · 롤백/프리뷰 안전망으로 등록 유지) ③ localhost:3100 콜백(기존 경고 그대로) ④ preview URL 개별 등록 안내(기존 문장 그대로)

**(c) §2 서두 Pitfall 2 blockquote.** 「여기에 등록하면 오류가 난다」의 **금지 예시** URL 을 새 프로덕션 도메인 기준으로 갱신한다 — 이 blockquote 안의 앱 도메인은 등록하라는 값이 아니라 **등록하면 안 되는 값**이므로, 갱신 후에도 여전히 부정 예시로 읽혀야 한다. 동시에 규칙을 한 단계 더 못박는 문장을 추가한다: 커스텀 도메인이 생겼다고 이 규칙이 바뀌지 않으며 **어느 앱 도메인이든**(trade 커스텀 도메인이든 vercel 기본 도메인이든) Google Console 에는 등록하지 않는다는 취지. 「이유: Google → Supabase → gh-radar 앱 순으로 리다이렉트…」 문단과 「앱 URL 은 Supabase Dashboard §1.2 의 Redirect URLs 에만 등록한다」 문장은 보존한다.

**§2.4 블록은 열지도 말 것.** 코드 펜스 안 supabase `auth/v1` 콜백 한 줄과 그 아래 두 불릿은 한 글자도 바꾸지 않는다(hard_constraints 2).

<!-- planner-discipline-allow: auth/callback -->
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && grep -q '^- \*\*Site URL:\*\* `https://trade\.jx1\.io`' webapp/SETUP.md && grep -q 'https://trade\.jx1\.io/auth/callback' webapp/SETUP.md && grep -q 'https://gh-radar-webapp\.vercel\.app/auth/callback' webapp/SETUP.md && grep -q 'localhost:3100/auth/callback' webapp/SETUP.md && grep -q 'wildcard' webapp/SETUP.md && grep -q 'Pitfall 8' webapp/SETUP.md && test "$(sed -n '/^### 2\.4 /,/^### 2\.5 /p' webapp/SETUP.md | grep -v '^#' | grep -c 'auth/callback')" -eq 0 && test "$(sed -n '/^### 2\.4 /,/^### 2\.5 /p' webapp/SETUP.md | grep -v '^#' | grep -c 'auth/v1/callback')" -eq 1 && test "$(sed -n '/^## 2\. /,/^### 2\.1 /p' webapp/SETUP.md | grep -v '^#' | grep -c 'gh-radar-webapp')" -eq 0 && test "$(sed -n '/^## 2\. /,/^### 2\.1 /p' webapp/SETUP.md | grep -v '^#' | grep -c 'trade\.jx1\.io')" -ge 1 && grep -q 'Supabase URL 만' webapp/SETUP.md && test "$(grep -c '^## ' webapp/SETUP.md)" -eq 7 && echo PASS</automated>
    <human-check>§2 서두 blockquote 를 소리내어 읽었을 때 「Google Console 에는 앱 도메인을 넣지 않는다」로 읽히는가 — 「trade.jx1.io 를 Google Console 에 넣어라」로 오독될 여지가 0인가.</human-check>
  </verify>
  <done>
`- **Site URL:**` 행이 `https://trade.jx1.io` 를 가리킨다. Redirect URLs 목록에 trade 콜백과 vercel 콜백이 **둘 다** 있고 localhost:3100 항목과 wildcard 미지원(Pitfall 8) 안내가 온전하다. §2 서두 blockquote 에 `gh-radar-webapp` 문자열이 남아 있지 않고 trade 도메인이 부정 예시로 들어가 있으며 「Supabase URL 만」 규칙 문장이 살아 있다. §2.4 블록에는 supabase `auth/v1` 콜백 1건 · 앱 콜백 0건. `## ` 섹션 수 7 유지.
  </done>
</task>

<task type="auto">
  <name>Task 2: 프론트 도메인 ↔ Cloud Run CORS 결합을 §3 과 §6 에 기록</name>
  <files>webapp/SETUP.md</files>
  <precondition>Task 1 이 완료되어 `webapp/SETUP.md` 가 trade.jx1.io 를 정본으로 기술하고 있고, `## 3. Vercel 환경변수` 와 `## 6. 자주 발생하는 문제 (Pitfalls)` 섹션이 문서에 그대로 존재한다.</precondition>
  <read_first>
`webapp/SETUP.md` §3 의 환경변수 표(`NEXT_PUBLIC_API_BASE_URL` 행이 Cloud Run URL 을 가리킨다) → service_role 경고 blockquote → `vercel env ls` 확인 명령 순서, 그리고 §6 Pitfalls 표의 열 구성(`| 증상 | 원인 | 해결 |`)을 확인한다.
  </read_first>
  <action>
새 문단을 **기존 구조 안에 추가만** 한다 — 표를 재배치하거나 섹션을 신설하지 않는다(hard_constraints 3).

**(a) §3 에 blockquote 1개 추가.** 기존 service_role 경고 blockquote **바로 뒤**, `확인 명령 (Vercel CLI 설치 전제):` 문장 **앞**에 새 경고 blockquote 를 넣는다. service_role 경고와 환경변수 표의 인접 관계를 깨지 않기 위한 위치다. 담을 내용:

- 프론트 도메인을 새로 붙이면 백엔드 허용 목록도 같이 바꿔야 한다는 선언.
- 증상의 비대칭성 — 페이지는 정상 렌더되는데 API 호출만 브라우저에서 전부 차단되므로 「배포는 됐는데 데이터만 안 나온다」로 보여 원인 파악이 늦어진다.
- 대상: Cloud Run 서비스 `gh-radar-server` (region `asia-northeast3`) 의 `CORS_ALLOWED_ORIGINS` 환경변수. 값을 바꾸면 **새 리비전 배포가 필요**하다.
- 2026-09-10 `trade.jx1.io` 전환 시점의 실제 값(verified_facts 의 문자열 그대로)과 그때 배포된 리비전 `gh-radar-server-00044-4w9` 을 근거로 기록. 값 안의 정규식 항목은 백틱 코드 스팬으로 감싸 마크다운이 먹지 않게 한다.
- 현재 값 확인 방법으로 `gcloud run services describe gh-radar-server --region asia-northeast3` 를 제시한다. 여기에 없는 플래그를 지어내지 말 것.

**(b) §6 Pitfalls 표에 행 1개 추가.** 표 맨 아래에 열 3개 형식(`| 증상 | 원인 | 해결 |`)을 지켜 한 행을 붙인다. 증상은 「로그인은 되는데 화면에 데이터가 전혀 없고 브라우저 콘솔에 CORS 오류」, 원인은 「새 프론트 origin 이 Cloud Run `CORS_ALLOWED_ORIGINS` 에 없음」, 해결은 §3 의 새 blockquote 를 가리키며 해당 origin 추가 후 재배포. 기존 6개 행은 순서·문구 모두 보존한다. 특히 첫 행(redirect_uri_mismatch → Google Console 에는 Supabase URL 만)은 hard_constraints 1 의 일부이므로 한 글자도 바꾸지 않는다.

이 두 곳 외에는 아무것도 건드리지 않는다. 새 `##` 섹션을 만들지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && test "$(sed -n '/^## 3\. /,/^## 4\. /p' webapp/SETUP.md | grep -c 'CORS_ALLOWED_ORIGINS')" -ge 1 && test "$(sed -n '/^## 6\. /,/^## 7\. /p' webapp/SETUP.md | grep -c 'CORS_ALLOWED_ORIGINS')" -ge 1 && sed -n '/^## 3\. /,/^## 4\. /p' webapp/SETUP.md | grep -q 'gh-radar-server' && sed -n '/^## 3\. /,/^## 4\. /p' webapp/SETUP.md | grep -q 'asia-northeast3' && test "$(sed -n '/^## 6\. /,/^## 7\. /p' webapp/SETUP.md | grep -c '^|')" -eq 9 && sed -n '/^## 6\. /,/^## 7\. /p' webapp/SETUP.md | grep -q 'redirect_uri_mismatch' && sed -n '/^## 6\. /,/^## 7\. /p' webapp/SETUP.md | grep -q 'Supabase URL 만' && test "$(grep -c '^## ' webapp/SETUP.md)" -eq 7 && test "$(git diff --name-only -- webapp/SETUP.md | wc -l | tr -d ' ')" -eq 1 && test "$(git status --porcelain -- server webapp/src scripts tasks package.json pnpm-lock.yaml | wc -l | tr -d ' ')" -eq 0 && echo PASS</automated>
  </verify>
  <done>
§3 안에 `CORS_ALLOWED_ORIGINS` · `gh-radar-server` · `asia-northeast3` 를 담은 경고 blockquote 가 있다. §6 표가 헤더 2행 + 데이터 7행 = 9개 파이프 행(기존 6행 + 신규 1행)이고 첫 데이터 행의 redirect_uri_mismatch / 「Supabase URL 만」 문구가 그대로다. `## ` 섹션 수 7 유지. git 변경 파일은 `webapp/SETUP.md` 하나뿐이고 `server/` · `webapp/src/` · `scripts/` · `tasks/` · 의존성 파일에는 변경이 0건이다.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저(trade.jx1.io) → Cloud Run API | 신뢰되지 않은 origin 이 API 를 호출한다. CORS allow-list 가 경계 정책이다 |
| Google OAuth → Supabase → 앱 콜백 | redirect URI 등록 위치가 인증 코드가 전달될 도착지를 결정한다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick260910tes-01 | Spoofing | 문서가 유도하는 Google Console redirect URI 등록 | high | mitigate | Task 1 (c) 가 앱 도메인을 Google Console 에 등록하지 말라는 규칙을 부정 예시 형태로 유지·강화. Task 1 verify 의 §2.4 region 게이트가 앱 콜백 0건을 잠근다 |
| T-quick260910tes-02 | Information Disclosure | 문서에 기록되는 CORS allow-list 값 | low | accept | 기록되는 값은 공개 origin 목록과 Cloud Run 리비전 ID 뿐 — 비밀값(키·토큰) 아님. service_role 경고(§3)는 손대지 않으므로 기존 방어 유지 |
| T-quick260910tes-03 | Tampering | 의존성 설치 | low | accept | 이 plan 은 npm/pip/cargo 설치를 수행하지 않는다. 패키지 변경 0 — Task 2 verify 가 `package.json` / `pnpm-lock.yaml` 무변경을 게이트로 잠근다 |
| T-quick260910tes-04 | Denial of Service | 새 프론트 도메인 도입 시 CORS 누락 | medium | mitigate | Task 2 가 이 결합을 §3 · §6 에 문서화하여 다음 도메인 전환에서 같은 전면 API 차단이 반복되지 않게 한다 |
</threat_model>

<verification>
1. Task 1 · Task 2 의 `<automated>` 게이트 두 개가 모두 `PASS` 를 출력한다.
2. `git diff -- webapp/SETUP.md` 를 눈으로 읽어 변경이 (a) §1.2 세 항목 (b) §2 서두 blockquote (c) §3 신규 blockquote (d) §6 신규 표 행 — 이 네 덩어리로만 구성됐음을 확인한다.
3. `git status --porcelain` 에 `webapp/SETUP.md` 외 소스 파일 변경이 없다.
4. 편집 후 `grep -n 'vercel\.app' webapp/SETUP.md` 결과의 각 잔존 행이 의도된 것인지 한 줄씩 판정한다 — 남아도 되는 것은 ① §1.2 의 vercel 콜백 등록 유지 항목 ② §1.2 의 wildcard 미지원 안내(`*-vercel.app`) ③ §1.2 아래 preview alias 대안 blockquote ④ §3 의 `vercel env` CLI 명령들 ⑤ §3 신규 CORS 노트 안의 allow-list 값. 그 외 위치에 `gh-radar-webapp.vercel.app` 이 **정본으로** 남아 있으면 실패다.
</verification>

<success_criteria>
- `webapp/SETUP.md` 가 `https://trade.jx1.io` 를 프로덕션 정본으로, `https://gh-radar-webapp.vercel.app` 을 등록 유지 중인 대체 경로로 기술한다.
- Google Cloud Console 규칙(§2 서두 · §2.4 · §6 첫 행)이 편집 전보다 약해지지 않았고 §2.4 등록 블록은 무변경이다.
- 프론트 도메인 ↔ Cloud Run `CORS_ALLOWED_ORIGINS` 결합이 §3 과 §6 에 각각 한 자리씩 기록됐다.
- 변경 파일은 `webapp/SETUP.md` 단 하나. 코드·테스트·의존성 변경 0.
- 위 `<verification>` 4 항목 전부 통과.
</success_criteria>

<output>
Create `.planning/quick/260910-tes-webapp-setup-md-trade-jx1-io/260910-tes-SUMMARY.md` when done
</output>
