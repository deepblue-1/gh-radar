---
phase: quick-260913-csp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .dockerignore
autonomous: true
quick_id: 260913-csp
must_haves:
  truths:
    - "`workers/master-sync/Dockerfile` 의 builder 스테이지를 빌드하면 `/app`·`/out` 어디에도 `.env*` 파일이 **0개**다 — 실제 `.env`(KRX_AUTH_KEY)도, 같은 디렉터리에 심은 `.env.bench-canary` 도 들어오지 않는다"
    - "같은 디렉터리에 심은 control 파일 `canary.txt` 는 builder 의 `/app/workers/master-sync/` 에 **1개** 있다 — 위의 0 이 「제외가 동작해서」이지 「검사가 죽어서」가 아님을 증명한다"
    - "`workers/master-sync`·`relay`·`server` 전체 빌드가 여전히 rc 0 이다 — 11개 Dockerfile 전부 `dist` 를 컨테이너 안에서 다시 만들므로 호스트 `dist/` 제외가 빌드를 깨지 않는다"
    - "최종 이미지(`tmp-ms`)의 `/app` 에 `.env*` 가 0개다(node_modules 제외) — 오늘도 깨끗했고 앞으로도 깨끗하다"
    - "`.env.example`·`.env.*.example`·`.env.sample`·`.env.template` 템플릿은 컨텍스트에 **남는다** — 비밀만 막고 문서는 막지 않는다"
    - "Dockerfile 11개와 `scripts/deploy-*.sh` 11개는 **한 줄도 바뀌지 않는다**"
    - "검증이 끝난 뒤 카나리 파일 2개와 임시 이미지 4개가 남아 있지 않다"
  artifacts:
    - .dockerignore
  key_links:
    - "`.dockerignore`(컨텍스트 루트) ↔ `scripts/deploy-*.sh` 11개의 `docker build -f <pkg>/Dockerfile .` — 컨텍스트 루트가 저장소 루트라서 루트 `.dockerignore` 하나가 11개 빌드 전부에 걸린다"
    - "`.dockerignore` 의 `**/.env` ↔ 각 Dockerfile 의 `COPY <pkg>/ ./<pkg>/` — 비밀이 builder 레이어로 들어오는 **유일한 경로**가 이 COPY 다"
    - "`**/dist` 제외 ↔ `RUN pnpm -F <pkg> build` + `RUN cp -r /app/workers/<name>/dist /out/dist` — dist 는 컨테이너 안에서 생기므로 호스트 dist 는 없어도 된다"
---

# 260913-csp — 빌드 컨텍스트에서 `.env` 를 차단하는 `.dockerignore` 추가

## 무엇이 문제인가 (2026-09-13 실측)

`scripts/deploy-*.sh` **11개 전부**가 저장소 루트를 빌드 컨텍스트로 쓴다:

```
docker build --platform=linux/amd64 -f <pkg>/Dockerfile .
```

그런데 **`.dockerignore` 가 없다.**

BuildKit 은 COPY 가 참조하는 경로만 전송하므로(실측 `transferring context: 1.30MB`)
`.claude/worktrees`(1.6G)·`node_modules`·`.vercel/.env.production.local` 같은 것은 **오늘은** 안 올라간다.
문제는 COPY 가 참조하는 경로 **안쪽**이다. 11개 Dockerfile 이 전부 같은 모양이고,

```
COPY workers/master-sync/ ./workers/master-sync/
```

이 한 줄이 그 디렉터리의 실제 `.env`(KRX_AUTH_KEY 보관)를 builder 스테이지의
`/app/workers/master-sync/` 로 복사한다. 양성 테스트로 확인했다 — 심어둔 카나리
`workers/master-sync/.env.bench-canary` 도 같이 들어갔고, 이어지는
`pnpm --prod --legacy deploy /out` 이 그것들을 `/out/.env`·`/out/.env.bench-canary` 로 **한 번 더** 복사했다.

**오늘 Artifact Registry 로 새지는 않는다.** 프로덕션 스테이지가 `/out/dist`·`/out/package.json`·
`/out/node_modules`·`packages/shared/dist` 만 복사하기 때문이다. 하지만

1. 비밀이 **로컬 빌드 캐시 레이어**에 남는다(레이어를 내보내거나 캐시를 공유하는 순간 유출),
2. 누군가 프로덕션 스테이지를 `COPY --from=builder /out ./` 로 **한 줄만** 고치면 그 즉시 이미지에 실린다.

지금 막는 것은 사고가 아니라 **그 사고로 가는 경로**다. 방어선을 Dockerfile 의 선의가 아니라
컨텍스트 차단으로 옮긴다.

## 이미 확인한 사실 (다시 캐지 마라)

- Dockerfile 11개(`relay`, `server`, `workers/{candle,co-movement,discussion,home,intraday,limit-up,master,news,theme}-sync`)의
  COPY 집합이 **완전히 동일**하다: 루트 `package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json`,
  `packages/shared/package.json`, `<pkg>/package.json` → `pnpm install --frozen-lockfile` →
  `COPY packages/shared/` + `COPY <pkg>/` → shared 빌드 → pkg 빌드 → `pnpm deploy /out`.
- `docs`·`infra`·`ops`·`supabase`·`scripts`·`tasks`·`webapp` 을 COPY 하는 Dockerfile 은 **하나도 없다**.
- 빌드 스크립트는 전부 `tsc`(shared 만 `tsup`)다. 외부 디렉터리를 참조하지 않는다.
- `pnpm-workspace.yaml` 은 `webapp` 을 멤버로 두지만 Dockerfile 이 `webapp/package.json` 을 복사하지
  **않으므로** 컨테이너 install 은 이미 webapp 없이 돈다. `webapp` 제외는 install 거동을 바꾸지 않는다.
- 저장소에 존재하는 env 파일 이름(내용은 읽지 않았다): `.vercel/.env.development.local`,
  `.vercel/.env.production.local`, `webapp/.env.development`, `webapp/.env.local`,
  `webapp/.env.local.example`, `webapp/.env.test.local`, `workers/master-sync/.env`.
  → **COPY 경로 안에 있는 것은 `workers/master-sync/.env` 하나뿐**이고, 나머지는 webapp/.vercel 이다.
  템플릿 재포함 패턴은 현재 매치되는 파일이 없는 **미래 대비**다(지금 동작을 바꾸지 않는다).

> **절대 금지:** 어떤 `.env` 파일의 **내용도 읽지 마라.** 시크릿 가드가 막고, 값이 대화에 들어와선 안 된다.
> 이 작업에 필요한 것은 **파일 이름**뿐이다.

## 위협 모델

| 경계 | 설명 |
|---|---|
| 호스트 작업트리 → Docker 빌드 컨텍스트 | 신뢰 경계. 여기를 통과한 파일은 레이어·캐시·레지스트리로 번진다 |

| ID | 카테고리 | 대상 | 심각도 | 처분 | 완화 |
|---|---|---|---|---|---|
| T-csp-01 | Information Disclosure | builder 레이어 / 로컬 빌드 캐시 | high | mitigate | 루트 `.dockerignore` 의 `**/.env`·`**/.env.*` 로 컨텍스트 진입 자체를 차단 |
| T-csp-02 | Information Disclosure | 미래의 `COPY --from=builder /out ./` | medium | mitigate | 동일. 비밀이 builder 에 아예 없으면 프로덕션 스테이지를 잘못 고쳐도 실릴 것이 없다 |
| T-csp-03 | Tampering | 호스트 `node_modules`/`dist` 가 설치 결과를 덮어씀 | medium | mitigate | `**/node_modules`·`**/dist` 제외로 빌드를 호스트 상태와 무관하게 만든다 |

패키지 매니저 신규 설치가 없으므로 공급망(`-SC`) 위협 항목은 해당 없음.

## 쓸 파일 — 루트 `.dockerignore` 정본

아래가 파일의 **전문**이다. 그대로 쓴다(주석 포함).

```
# 왜 이 파일이 있는가 — 2026-09-13 실측, quick-260913-csp
#
# scripts/deploy-*.sh 11개 전부가 **저장소 루트를 빌드 컨텍스트**로 docker build 한다:
#   docker build --platform=linux/amd64 -f <pkg>/Dockerfile .
# 그래서 각 Dockerfile 의 `COPY <pkg>/ ./<pkg>/` 가 그 디렉터리의 .env 까지 builder 레이어로
# 복사한다. 실측: workers/master-sync/.env (KRX_AUTH_KEY) 와 심어둔 카나리가
# builder 의 /app/workers/master-sync/ 에 들어갔고, `pnpm --prod --legacy deploy /out` 이
# /out/ 으로 한 번 더 복사했다.
# 최종 이미지는 /out/{dist,package.json,node_modules} 만 복사하므로 레지스트리로 새지는
# 않았지만, 비밀이 로컬 빌드 캐시 레이어에 남고 누군가 프로덕션 스테이지를
# `COPY --from=builder /out ./` 로 한 줄 고치는 순간 이미지에 실린다. 그 경로를 막는다.
#
# 빼면 빌드가 깨지는 것들 — 11개 Dockerfile 이 COPY 하는 전부다:
#   루트 package.json · pnpm-workspace.yaml · pnpm-lock.yaml · tsconfig.base.json
#   packages/shared/** · relay/** · server/** · workers/**
# 패턴은 모두 **컨텍스트 루트 기준**이다(`scripts` 는 루트 scripts 만, 패키지 안의
# scripts 디렉터리는 건드리지 않는다).

# ── 비밀: .env 전면 차단 (템플릿만 예외) ───────────────────────────────
# 디렉터리가 아니라 **파일 글롭**으로 제외한다. `!` 재포함은 부모 디렉터리가
# 제외되지 않았을 때만 듣기 때문에, 파일 글롭 제외 + 파일 글롭 재포함이어야 한다.
**/.env
**/.env.*
!**/.env.example
!**/.env.*.example
!**/.env.sample
!**/.env.template

# ── 의존성·빌드 산출물: 컨테이너 안에서 다시 만든다 ────────────────────
# node_modules: pnpm install --frozen-lockfile 이 새로 만든다. 호스트 것을 올리면
#   워크스페이스 심링크가 설치 결과를 덮어써 빌드가 호스트 상태에 의존하게 된다.
# dist: `pnpm -F <pkg> build` 가 만들고, 워커는 `cp -r /app/workers/<n>/dist /out/dist`
#   로 그 **새로 만든** dist 를 쓴다. 호스트 dist 는 필요 없다.
# tsbuildinfo: dist 를 빼면서 이것만 남기면, 나중에 incremental 을 켜는 순간
#   tsc 가 "최신"으로 오판해 emit 을 건너뛴다(지금은 incremental 미사용). 항상 같이 뺀다.
**/node_modules
**/dist
**/*.tsbuildinfo
**/coverage
**/*.log

# ── 빌드가 쓰지 않는 루트 디렉터리 ─────────────────────────────────────
.git
.claude
.gsd
.planning
.vercel
tasks
docs
infra
ops
supabase
scripts
webapp

# ── OS 잡동사니 ────────────────────────────────────────────────────────
.DS_Store
**/.DS_Store
```

## 범위 밖 (건드리지 마라)

- **Dockerfile 11개·`scripts/deploy-*.sh` 11개 수정 금지.** 이 작업은 파일 **1개 추가**다.
- **Cloud Build / 빌드 VM 이전 금지.** 실측으로 가치 없음이 확인됐다(relay·server 클린 amd64 빌드 26–32초, push 4초).
- `.gitignore` 수정 금지. `.dockerignore` 와 역할이 다르다(`.gitignore` 는 이미 `.env` 를 막고 있고,
  `workers/master-sync/.env` 는 커밋돼 있지 않다 — 문제는 git 이 아니라 **docker 컨텍스트**였다).

## 태스크

### Task 1 — 루트 `.dockerignore` 작성

<task type="auto">
<name>Task 1: 루트 .dockerignore 작성</name>

<files>
.dockerignore
</files>

<action>
위 「쓸 파일 — 루트 `.dockerignore` 정본」 블록의 내용을 그대로 `/Users/alex/repos/gh-radar/.dockerignore` 로 쓴다.
패턴을 임의로 추가·삭제하지 마라. 특히 `packages`·`relay`·`server`·`workers`·루트 `package.json`·
`pnpm-workspace.yaml`·`pnpm-lock.yaml`·`tsconfig.base.json` 을 제외 목록에 올리면 11개 빌드가 전부 깨진다.
재포함(`!`) 4줄은 `**/.env.*` **뒤에** 와야 한다 — 마지막 매치가 이긴다.
이 태스크에서는 **커밋하지 않는다**. Task 2 의 검증이 끝난 뒤 한 번에 커밋한다.
</action>

<verify>
  <automated>cd /Users/alex/repos/gh-radar && test -f .dockerignore && grep -v '^#' .dockerignore | grep -cx '\*\*/\.env' | grep -qx 1 && grep -v '^#' .dockerignore | grep -cx '!\*\*/\.env\.example' | grep -qx 1 && ! (grep -v '^#' .dockerignore | grep -qxE 'packages|relay|server|workers|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json') && echo OK</automated>
</verify>

<done>
`.dockerignore` 가 정본과 동일하고, 위 구조 검사가 `OK` 를 출력한다.
(주석 줄이 검사를 오염시키지 않도록 `grep -v '^#'` 로 먼저 걸렀다 — 헤더 주석에 `.env` 가 나오기 때문이다.)
</done>
</task>

### Task 2 — 카나리 양성/음성 + 전체 빌드 스모크 → 정리 → 커밋

<task type="auto">
<name>Task 2: 카나리 양성/음성 + 전체 빌드 스모크 → 정리 → 커밋</name>

<precondition>
`docker info` 가 rc 0 이다(데몬 기동). 실패하면 멈추고 보고하라 — 검증을 건너뛰고 통과로 처리하는 것은 금지다.
</precondition>

<files>
workers/master-sync/.env.bench-canary (임시, 반드시 삭제)
workers/master-sync/canary.txt (임시, 반드시 삭제)
</files>

<action>
아래 5단계를 **순서대로** 돌린다. 기대값이 하나라도 어긋나면 멈추고 실제 출력을 보고하라.
카나리 파일은 Bash 로 만든다(`printf 'CANARY=1\n' > workers/master-sync/.env.bench-canary`,
`printf 'control\n' > workers/master-sync/canary.txt`). 가드가 `.env.bench-canary` 생성·삭제를 막으면
`GATE_BLOCKED` 로 보고하고 **통과로 처리하지 마라**.
실제 `workers/master-sync/.env` 는 읽지도, 옮기지도, 지우지도 마라.

① 카나리 2개를 심고 builder 스테이지 빌드:
   `docker build --platform=linux/amd64 -f workers/master-sync/Dockerfile --target builder -t tmp-ms-builder .` → rc 0

② 음성(차단) 확인 — **0 이어야 한다**:
   `docker run --rm --platform=linux/amd64 tmp-ms-builder sh -c 'find /app /out -maxdepth 3 -name ".env*" -not -path "*/node_modules/*" | wc -l'`
   실제 `.env` 와 카나리 둘 다 사라졌다는 뜻이다.

③ 양성(검사 생존) 확인 — **1 이어야 한다**:
   `docker run --rm --platform=linux/amd64 tmp-ms-builder sh -c 'find /app -maxdepth 3 -name canary.txt | wc -l'`
   control 파일은 제외 대상이 아니므로 들어와야 한다. 여기서 0 이 나오면 ②의 0 은 **검사가 죽은 것**이고
   `.dockerignore` 의 효과를 증명하지 못한다 → 실패로 보고하라.

④ 전체 빌드 스모크 — 3개 모두 rc 0:
   `docker build --platform=linux/amd64 -f workers/master-sync/Dockerfile -t tmp-ms .`
   `docker build --platform=linux/amd64 -f relay/Dockerfile -t tmp-relay .`
   `docker build --platform=linux/amd64 -f server/Dockerfile -t tmp-server .`
   이어서 최종 이미지 확인:
   `docker run --rm --platform=linux/amd64 tmp-ms sh -c 'find /app -xdev -name ".env*" -not -path "*/node_modules/*" | wc -l'` → **0**
   `docker run --rm --platform=linux/amd64 tmp-ms sh -c 'find /app -xdev -name "package.json" -not -path "*/node_modules/*" | wc -l'` → **1 이상**(검사 생존)
   `docker run --rm --platform=linux/amd64 tmp-ms sh -c 'find / -xdev -name ".env*" 2>/dev/null | wc -l'` → **0**
   마지막 것이 0 이 아니면 경로 목록을 그대로 출력해 보고하고 **멈춰라**(비root `app` 유저라
   권한 오류가 섞일 수 있다 — 숫자만 보고 넘기지 마라).

⑤ 정리 — 남기면 안 된다:
   카나리 2개 삭제, `docker image rm -f tmp-ms-builder tmp-ms tmp-relay tmp-server`,
   `git status --porcelain` 에 `.dockerignore`(`?? .dockerignore`) 외의 **코드/설정 변경이 없어야** 한다.
   `.planning/quick/260913-csp-dockerignore/` 아티팩트는 이 quick 의 산출물이므로 예외다.
   `?? workers/master-sync/.env.bench-canary` 나 `?? workers/master-sync/canary.txt` 가 보이면 정리 실패다
   (둘 다 `.gitignore` 패턴에 걸리지 않아 git 에 보인다 — 이게 정리 여부를 잡는 실제 게이트다).

게이트 순서 주의: `<verify>` 의 **첫** 블록은 카나리를 스스로 심고 그대로 남긴다(①~④ 재현용).
**두 번째** 블록은 ⑤ 정리가 끝난 **뒤에** 돌려야 통과한다. 두 블록을 뒤집어 돌리지 마라.

그 다음 커밋 **1개**:
   `chore(quick-260913-csp): 빌드 컨텍스트에서 .env 를 차단하는 .dockerignore 추가`
   한글 본문에 ②③의 측정값(0 / 1)과 ④의 rc 0 을 적는다.
   **`Co-Authored-By` 트레일러를 넣지 마라** — 프로젝트 규칙이다(CLAUDE.md 「Co-Authored-By 절대 넣지 않기」).
   **푸시·배포 금지** — 오케스트레이터가 한다.
</action>

<verify>
  <automated>cd /Users/alex/repos/gh-radar && printf 'CANARY=1\n' > workers/master-sync/.env.bench-canary && printf 'control\n' > workers/master-sync/canary.txt && docker build --platform=linux/amd64 -f workers/master-sync/Dockerfile --target builder -t tmp-ms-builder . >/dev/null && test "$(docker run --rm --platform=linux/amd64 tmp-ms-builder sh -c 'find /app /out -maxdepth 3 -name ".env*" -not -path "*/node_modules/*" | wc -l' | tr -d ' ')" = 0 && test "$(docker run --rm --platform=linux/amd64 tmp-ms-builder sh -c 'find /app -maxdepth 3 -name canary.txt | wc -l' | tr -d ' ')" = 1 && docker build --platform=linux/amd64 -f workers/master-sync/Dockerfile -t tmp-ms . >/dev/null && docker build --platform=linux/amd64 -f relay/Dockerfile -t tmp-relay . >/dev/null && docker build --platform=linux/amd64 -f server/Dockerfile -t tmp-server . >/dev/null && test "$(docker run --rm --platform=linux/amd64 tmp-ms sh -c 'find / -xdev -name ".env*" 2>/dev/null | wc -l' | tr -d ' ')" = 0 && echo GATES_OK</automated>
  <automated>cd /Users/alex/repos/gh-radar && test ! -e workers/master-sync/.env.bench-canary && test ! -e workers/master-sync/canary.txt && test -f workers/master-sync/.env && git diff --quiet -- relay/Dockerfile server/Dockerfile workers scripts && echo CLEANUP_OK</automated>
</verify>

<done>
①~④ 기대값 전부 일치(②=0, ③=1, ④ 빌드 3개 rc 0 + 최종 이미지 `.env*` 0 + 생존검사 ≥1),
⑤ 정리 완료(카나리 0개·임시 이미지 0개·실제 `.env` 는 제자리), Dockerfile·deploy 스크립트 무변경,
`.dockerignore` 만 담은 커밋 1개 생성. 푸시는 하지 않았다.
</done>
</task>

## 검증 요약 (왜 이 테스트가 증거인가)

음성 테스트만 있으면 「0 이 나왔다」가 **제외 때문인지 검사가 죽어서인지** 구별되지 않는다.
그래서 같은 디렉터리에 control 파일(`canary.txt`)을 함께 심는다. `.env*` = 0 **이면서** `canary.txt` = 1
이라야 「`.dockerignore` 가 고르게 골라냈다」가 증명된다. 전체 빌드 3개(워커 1 + relay + server)는
제외가 **빌드를 깨지 않음**을 덮는다 — 세 Dockerfile 이 전체 11개의 모양을 전부 대표한다.
