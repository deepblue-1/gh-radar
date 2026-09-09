---
phase: quick-260909-ftd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/dma-credentials.ts
  - scripts/dma-credentials.sh
autonomous: true
requirements: [QUICK-260909-FTD]

must_haves:
  truths:
    - "관리자가 `--email 대상 --from-email 원본` 으로 비밀번호 재입력 없이 기존 DMA 자격증명을 다른 gh-radar 계정에 연결할 수 있다"
    - "원본에 자격증명이 없거나, 대상==원본이거나, --dma-user 가 원본 행과 다르면 저장 없이 exit 1 로 끝난다"
    - "평문·암호문·AES 키는 stdout/stderr 어디에도 나오지 않는다"
    - "연결 성공 시 DMA 세션 공유(계좌 범위·주문 상태 혼입) 경고가 stderr 로 나온다"
    - "어느 cwd 에서 실행해도 `scripts/dma-credentials.sh --list` 가 동작한다"
  artifacts:
    - path: "scripts/dma-credentials.ts"
      provides: "--from-email 링크 모드 (runLink)"
      contains: "from-email"
    - path: "scripts/dma-credentials.sh"
      provides: "env·gcloud 환경을 대신 준비하는 실행 래퍼 (실행 권한 0755)"
      contains: "DMA_CRED_ENV_FILE"
  key_links:
    - from: "scripts/dma-credentials.ts"
      to: "relay/src/store/credentials.ts"
      via: "decryptDmaPassword / encryptDmaPassword 재수출 사용"
      pattern: "decryptDmaPassword"
    - from: "scripts/dma-credentials.sh"
      to: "scripts/dma-credentials.ts"
      via: "pnpm --filter @gh-radar/relay exec tsx"
      pattern: "dma-credentials\\.ts"
---

<objective>
`scripts/dma-credentials.ts` 에 `--from-email` 링크 모드를 추가하고, 어느 cwd 에서도 동작하는
`scripts/dma-credentials.sh` 래퍼를 새로 만든다.

목적:
- 이미 등록된 사용자의 DMA 자격증명을 **비밀번호 재입력 없이** 다른 gh-radar 계정에 연결한다.
  KB 비밀번호를 다시 묻는 것은 오타로 실계좌를 잠글 위험(T-15-10)을 매번 다시 여는 일이다.
- 오늘 `scripts/` 디렉터리에서 실행해 `source workers/master-sync/.env` 가 깨진 사고를
  래퍼가 구조적으로 막는다.

출력: 수정된 `scripts/dma-credentials.ts`, 신규 `scripts/dma-credentials.sh` (0755).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@scripts/dma-credentials.ts
@relay/src/store/credentials.ts
@scripts/deploy-relay.sh

<interfaces>
<!-- relay/src/store/credentials.ts 에서 이미 export 되어 있다. 새로 만들 필요 없다. -->

export function encryptDmaPassword(plain: string, userId: string, keyB64: string): string;
export function decryptDmaPassword(enc: string, userId: string, keyB64: string): string;

<!-- scripts/dma-credentials.ts 안의 기존 헬퍼 — 전부 재사용한다. -->

type Args = { list: boolean; email?: string; dmaUser?: string };
type Admin = ReturnType<typeof createRelaySupabase>;

function fail(message: string): never;                 // "오류: ..." 출력 후 exit 1
function usage(): never;                               // 사용법 출력 후 exit 1
function resolveCredKey(): string;                     // env DMA_CRED_KEY → Secret Manager
function createAdmin(): Admin;                         // SUPABASE_URL + SERVICE_ROLE_KEY
async function findUserIdByEmail(admin: Admin, email: string): Promise<string>;
async function runList(admin: Admin): Promise<void>;
async function runRegister(admin: Admin, email: string, dmaUser: string): Promise<void>;

<!-- dma_credentials 컬럼: user_id, dma_user_id, dma_password_enc, updated_at -->
</interfaces>

**환경 사실 (확인 완료 — 다시 조사하지 말 것):**
- `relay/tsconfig.json` 은 `include: ["src/**/*"]` + `rootDir: "./src"` 라
  `pnpm --filter @gh-radar/relay typecheck` 는 `scripts/` 를 **포함하지 않는다.**
  아래 Task 1 의 `<verify>` 에 적힌 standalone tsc 명령이 실제로 동작하며 현재 exit 0 이다.
- `workers/master-sync/.env` 에 `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 가 있다.
- `~/.config/gcloud/gh-radar-deployer.json` 이 존재한다.
</context>

<tasks>

<task type="auto">
  <name>Task 1: scripts/dma-credentials.ts 에 --from-email 링크 모드 추가</name>
  <files>scripts/dma-credentials.ts</files>
  <action>
기존 파일의 주석 밀도·섹션 구분선(`// ===...`)·한글 문체를 그대로 따른다. 새 함수 하나 +
인자 파싱 한 갈래 + 문서 갱신이 전부이며, 기존 함수는 시그니처를 바꾸지 않는다.

1) `Args` 타입에 `fromEmail?: string` 추가. `parseArgs` 에 `--from-email` 갈래 추가
   (`args.fromEmail = argv[(i += 1)]`). `--password`/`--dma-password` 거부 갈래는 그대로 둔다.

2) `usage()` 문자열에 링크 모드 한 줄 추가:
   `"  --email <대상> --from-email <원본>          기존 자격증명을 다른 계정에 연결(프롬프트 없음)"`.

3) 새 함수 `runLink(admin: Admin, targetEmail: string, fromEmail: string, dmaUser?: string): Promise<void>`
   를 `runRegister` 아래에 추가한다. 순서:
   - `targetEmail.trim().toLowerCase() === fromEmail.trim().toLowerCase()` 면
     `fail("대상과 원본이 같은 계정입니다.")`.
   - `findUserIdByEmail` 로 대상 `targetUserId` 와 원본 `sourceUserId` 를 각각 구한다.
     (이메일이 달라도 같은 user_id 로 해석되는 경우를 대비해 id 동일 시에도 같은 fail 로 막는다.)
   - 원본 행 조회: `.from("dma_credentials").select("dma_user_id, dma_password_enc")
     .eq("user_id", sourceUserId).maybeSingle()`. `error` 면 `fail(\`원본 조회 실패: ${error.message}\`)`,
     `data === null` 이면 `fail(\`원본 계정에 등록된 DMA 자격증명이 없습니다: ${fromEmail}\`)`.
   - `dmaUser` 가 주어졌고 원본 행의 `dma_user_id` 와 다르면 `fail` — 이유를 메시지에 적는다:
     저장된 암호문은 **그 dma_user_id 의 비밀번호**이므로 다른 id 로 연결하면 틀린 비밀번호로
     KB 로그인해 계정이 잠긴다(T-15-10). 최종 사용할 값은 `row.dma_user_id` 다.
   - `resolveCredKey()` → `decryptDmaPassword(row.dma_password_enc, sourceUserId, credKey)`
     → `encryptDmaPassword(plain, targetUserId, credKey)`.
     AAD 가 user_id 라서 **재암호화가 필수**다. 암호문을 그대로 복사하면 대상 행에서 tag 검증이
     실패해 relay 가 그 사용자를 영구히 `unauthorized` 로 만든다(D-18 행 이동 방지).
   - 라운드트립 검증: `decryptDmaPassword(재암호문, targetUserId, credKey)` 결과가 평문과
     같은지 확인하고 다르면 저장하지 않고 `fail("재암호화 검증 실패 — 저장하지 않았습니다.")`.
     복호 예외는 try/catch 로 감싸되 catch 블록에서 원본 예외 메시지를 그대로 출력하지 않는다
     (암호문 조각 유출 방지) — "복호에 실패했습니다. DMA_CRED_KEY 가 원본 등록 시점 키와
     같은지 확인하세요." 수준의 안내로 바꾼다.
   - upsert 는 `runRegister` 와 동일 형태 (`onConflict: "user_id"`, `updated_at` 갱신).
   - 성공 출력: `console.log(\`연결 완료: user_id=${targetUserId} dma_user_id=${row.dma_user_id} (원본 ${fromEmail})\`)`.
     이어서 stderr 안내 두 줄 —
       ① 기존 문구 유지: "참고: 이미 열려 있는 relay 세션은 즉시 갱신되지 않습니다 ...".
       ② 신규 경고: 게이트웨이가 **DMA user_id + broker** 로 세션을 합류시키므로 같은 DMA 계정을
          공유하는 gh-radar 사용자끼리 **계좌 범위와 주문 상태가 섞인다**는 내용.
   - 평문 변수는 이 함수 밖으로 반환하지 않는다. 로그·에러 메시지에 넣지 않는다.

4) `main()` 분기 추가 — `args.list` 처리 뒤, 기존 등록 분기 앞에:
   `if (args.fromEmail !== undefined) { if (args.email === undefined) usage();
    await runLink(admin, args.email, args.fromEmail, args.dmaUser); return; }`
   그 아래 기존 `if (args.email === undefined || args.dmaUser === undefined) usage();` 는 유지.
   (= `--dma-user` 는 링크 모드에서만 선택, 등록 모드에서는 여전히 필수)

5) 헤더 주석 갱신:
   - "실행:" 블록에 링크 모드 예시 추가 (`--email <대상> --from-email <원본>`), 한 줄 설명 포함.
   - "동작 / exit code" 절에 링크 모드 규칙 요약 추가: 원본 행 없음/대상==원본/dma-user 불일치는
     저장 없이 exit 1, 비밀번호 프롬프트 없음, AAD 때문에 복호→재암호화한다는 사실.
   - **D-17 주석 블록은 그대로 유지한다** (삭제·축약 금지). 다만 링크 모드가 D-17 이 경고하던
     "같은 user_id 공유" 를 의도적으로 수행하는 경로라는 점을 한 문장으로 덧붙인다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar/relay && pnpm exec tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck --types node ../scripts/dma-credentials.ts && grep -n "from-email" ../scripts/dma-credentials.ts | head -5 && ! grep -nE "console\.(log|error)\(.*(plain|credKey|password_enc|encrypted)" ../scripts/dma-credentials.ts</automated>
  </verify>
  <done>
tsc exit 0. `--from-email` 이 parseArgs·usage·헤더 주석·main 분기에 모두 존재한다.
평문/키/암호문 변수를 console 로 내보내는 라인이 0개다. D-17 주석 블록이 남아 있다.
  </done>
</task>

<task type="auto">
  <name>Task 2: scripts/dma-credentials.sh 실행 래퍼 신규 작성</name>
  <files>scripts/dma-credentials.sh</files>
  <action>
`scripts/deploy-relay.sh` 의 스타일(`#!/usr/bin/env bash` + `set -euo pipefail` + 박스형 헤더
주석 + 한글 안내)을 따른다. 비밀 값은 어떤 경로로도 echo 하지 않는다.

헤더 주석에 담을 것:
  - 목적 한 줄: env·gcloud 인증 준비를 대신하고, **어느 cwd 에서 실행해도** 동작하게 한다.
    (`scripts/` 안에서 실행해 상대경로 `source workers/master-sync/.env` 가 깨진 사고 방지)
  - 사용 예 3가지:
      bash scripts/dma-credentials.sh --list
      bash scripts/dma-credentials.sh --email <이메일> --dma-user <DMA user_id>   # 비밀번호 프롬프트
      bash scripts/dma-credentials.sh --email <대상> --from-email <원본>          # 기존 자격증명 연결
  - 선택 env: `DMA_CRED_ENV_FILE`(기본 `workers/master-sync/.env`),
    `CLOUDSDK_CORE_PROJECT`(기본 `gh-radar`), `GOOGLE_APPLICATION_CREDENTIALS`.

본문 순서:
  1) `cd "$(dirname "$0")/.."` — 이후 모든 경로는 저장소 루트 기준. 이 한 줄이 이 래퍼의 존재 이유다.
  2) `ENV_FILE="${DMA_CRED_ENV_FILE:-workers/master-sync/.env}"`.
     파일이 없으면 안내 후 exit 1 — 어떤 파일을 찾았는지(경로만) 와
     `DMA_CRED_ENV_FILE=<경로> bash scripts/dma-credentials.sh ...` 로 덮어쓸 수 있다는 문구.
  3) `set -a; source "$ENV_FILE"; set +a` — 파일 내용은 출력하지 않는다.
     source 직후 `SUPABASE_URL` 과 `SUPABASE_SERVICE_ROLE_KEY` 가 비어 있지 않은지만 확인하고,
     비어 있으면 **어느 키가 비었는지 이름만** 찍고 exit 1 (값 금지 — deploy-relay.sh 동일 규약).
  4) `export CLOUDSDK_CORE_PROJECT="${CLOUDSDK_CORE_PROJECT:-gh-radar}"`.
     `GOOGLE_APPLICATION_CREDENTIALS` 가 비어 있고 `$HOME/.config/gcloud/gh-radar-deployer.json`
     이 존재하면 그 경로를 export (`DMA_CRED_KEY` 를 Secret Manager 에서 읽는 경로용).
     둘 다 없으면 실패시키지 않는다 — `--list` 는 AES 키가 필요 없고, `DMA_CRED_KEY` 를
     직접 넣어 실행하는 경로도 유효하다. 안내 한 줄만 stderr 로 남긴다.
  5) 준비 완료 요약 한 줄 (stderr): `env=<경로> project=<프로젝트>` 수준. 값 노출 없음.
  6) `exec pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts "$@"`
     — `exec` 라 종료코드가 그대로 전달된다. `"$@"` 인용 필수.
     relay 워크스페이스를 경유하는 이유(tsx·supabase-js 가 relay/node_modules 에만 있음)를
     주석 한 줄로 남긴다.

작성 후 `chmod +x scripts/dma-credentials.sh`.
  </action>
  <verify>
    <automated>cd /tmp && bash -n /Users/alex/repos/gh-radar/scripts/dma-credentials.sh && test -x /Users/alex/repos/gh-radar/scripts/dma-credentials.sh && bash /Users/alex/repos/gh-radar/scripts/dma-credentials.sh --list</automated>
  </verify>
  <done>
`bash -n` 통과, 실행 권한 있음. `/tmp` 에서 실행해도 `--list` 가 등록 현황을 출력하고 exit 0.
(읽기 전용 — DB 쓰기 없음.) 출력 어디에도 service role key·AES 키가 없다.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 관리자 셸 → 스크립트 | 이메일·dma_user_id 인자가 신뢰 경계를 넘는다 |
| 스크립트 → Supabase (service_role) | RLS 를 우회하는 전권 키를 들고 `dma_credentials` 를 쓴다 |
| 스크립트 메모리 → 터미널/로그 | 평문 KB 비밀번호와 AES 키가 존재하는 유일한 지점 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-FTD-01 | Information Disclosure | `runLink` 평문/키/암호문 | mitigate | 평문·`credKey`·암호문을 console 인자로 쓰지 않는다. 복호 예외 메시지도 원문 대신 안내 문구로 치환. Task 1 verify 의 grep 게이트가 강제 |
| T-FTD-02 | Elevation of Privilege | 임의 계정에 자격증명 링크 | accept | 실행 자체가 service_role 키 보유자(관리자) 전용. 웹앱 경로 없음(D-18). 다만 대상==원본 차단 + 원본 행 부재 시 즉시 exit 1 로 오조작을 줄임 |
| T-FTD-03 | Tampering | 원본 암호문을 대상 행에 그대로 복사 | mitigate | AAD=user_id 라 복사 시 relay 가 영구 `unauthorized`. 반드시 복호→재암호화하고 재복호 라운드트립으로 저장 전 검증 |
| T-FTD-04 | Spoofing/Repudiation | 잘못된 `--dma-user` 로 연결 → 틀린 비밀번호로 KB 로그인 → 계정 잠금 | mitigate | `--dma-user` 가 원본 행과 다르면 저장 없이 exit 1 (T-15-10 동일 근거) |
| T-FTD-05 | Information Disclosure | 래퍼가 `.env` 내용을 화면에 흘림 | mitigate | `set -a; source` 만 사용. 값 echo 금지, 검증은 "빈 키 이름"만 출력 |
| T-FTD-SC | Tampering | 패키지 설치 | n/a | 신규 의존성 없음 — 기존 `tsx`/`@supabase/supabase-js` 만 사용 |
</threat_model>

<verification>
1. `cd relay && pnpm exec tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck --types node ../scripts/dma-credentials.ts` → exit 0
   (`pnpm --filter @gh-radar/relay typecheck` 는 `scripts/` 를 보지 않으므로 이 명령이 정본이다)
2. `cd /tmp && bash /Users/alex/repos/gh-radar/scripts/dma-credentials.sh --list` → 등록 현황 출력, exit 0
3. `bash scripts/dma-credentials.sh` (인자 없음) → `usage()` 출력 후 exit 1
4. `grep -c "D-17" scripts/dma-credentials.ts` ≥ 1 — 기존 D-17 주석 유지 확인

**하지 않는 것:** `--from-email` 실제 실행은 운영 DB 쓰기라 이 plan 의 verify 에 넣지 않는다.
사용자가 직접 실행하거나 별도 승인 후 진행한다.
</verification>

<success_criteria>
- [ ] `scripts/dma-credentials.ts` 가 `--from-email` 을 파싱하고 `runLink` 로 분기한다
- [ ] 원본 행 없음 / 대상==원본 / `--dma-user` 불일치 → 저장 없이 exit 1
- [ ] 복호 → 재암호화(AAD=대상 user_id) → 재복호 검증 → upsert 순서를 지킨다
- [ ] 평문·AES 키·암호문이 stdout/stderr 에 나오지 않는다
- [ ] 성공 시 DMA 세션 공유 경고 + 기존 relay 세션 미갱신 안내 둘 다 stderr 로 나온다
- [ ] `scripts/dma-credentials.sh` 가 0755 이고 `/tmp` 에서 `--list` 실행에 성공한다
- [ ] env 파일 부재 시 안내 후 exit 1, `DMA_CRED_ENV_FILE` 로 덮어쓸 수 있다
- [ ] 헤더 주석 "실행:" 예시와 `usage()` 에 링크 모드가 반영됐고 D-17 주석이 남아 있다
- [ ] 커밋: `feat(260909-ftd): dma-credentials 에 --from-email 링크 모드와 실행 래퍼를 추가한다`
      (코드 파일 2개만. 문서 아티팩트는 오케스트레이터 소관)
</success_criteria>

<output>
Create `.planning/quick/260909-ftd-scripts-dma-credentials-ts-from-email-dm/260909-ftd-SUMMARY.md` when done
</output>
