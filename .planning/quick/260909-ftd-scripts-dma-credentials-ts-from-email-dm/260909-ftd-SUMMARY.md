---
phase: quick-260909-ftd
plan: 01
subsystem: scripts
tags: [dma, credentials, admin-script, security]
requires:
  - relay/src/store/credentials.ts (encryptDmaPassword / decryptDmaPassword)
  - relay/src/store/supabase.ts (createRelaySupabase)
provides:
  - "dma-credentials --from-email 링크 모드 (비밀번호 재입력 없는 계정 간 자격증명 연결)"
  - "scripts/dma-credentials.sh — cwd 무관 실행 래퍼"
affects:
  - "dma_credentials 테이블 (관리자 수기 경로만, 웹앱 경로 없음)"
tech-stack:
  added: []
  patterns:
    - "AAD=user_id 이므로 암호문 복사 대신 복호 → 대상 user_id 재암호화 → 라운드트립 검증"
    - "래퍼 첫 줄 cd 저장소 루트 — 상대경로 env 로드 사고 구조적 차단"
key-files:
  created:
    - scripts/dma-credentials.sh
  modified:
    - scripts/dma-credentials.ts
decisions:
  - "링크 모드에서 --dma-user 는 지정용이 아니라 확인용 — 불일치 시 저장 없이 exit 1"
  - "재암호화/복호 로직을 reencryptForTarget 헬퍼로 분리해 평문 스코프를 최소화"
  - "래퍼의 빈 키 검증은 배열 대신 문자열 누적 (bash 3.2 + set -e/-u 함정 회피)"
metrics:
  duration: "약 20분"
  completed: 2026-09-09
---

# Quick 260909-ftd: dma-credentials --from-email 링크 모드 + 실행 래퍼 Summary

이미 등록된 계정의 DMA 자격증명을 **비밀번호 재입력 없이** 다른 gh-radar 계정에 연결하는
`--from-email` 링크 모드를 추가하고, 어느 cwd 에서 실행해도 env·gcloud 준비가 되는
`scripts/dma-credentials.sh` 래퍼를 새로 만들었다.

## 무엇을 만들었나

### Task 1 — `scripts/dma-credentials.ts` 링크 모드 (`b9e5292`)

- `Args` 에 `fromEmail?` 추가, `parseArgs` 에 `--from-email` 갈래 추가.
  `--password`/`--dma-password` 거부 갈래는 그대로 유지.
- `usage()` 에 링크 모드 한 줄 추가.
- 새 함수 2개:
  - `runLink(admin, targetEmail, fromEmail, dmaUser?)` — 링크 모드 본체.
  - `reencryptForTarget(passwordEnc, sourceUserId, targetUserId, credKey)` — 복호 →
    재암호화 → 라운드트립 검증. **평문이 사는 유일한 스코프**이고 반환값은 암호문뿐이다.
- `main()` 에 `args.list` 처리 뒤·등록 분기 앞에 링크 분기 추가. 등록 모드의
  `--dma-user` 필수 조건은 그대로.
- 헤더 주석: "실행:" 블록에 링크 예시 + 래퍼 안내, "동작 / exit code" 절에 링크 모드
  규칙(복호→재암호화 이유, 거절 4조건) 추가. **D-17 블록은 유지**하고 링크 모드가
  D-17 이 경고하던 "같은 DMA user_id 공유"를 의도적으로 수행하는 경로임을 덧붙였다.

거절 조건(전부 **저장 없이** exit 1):

| 조건 | 근거 |
|------|------|
| 대상 == 원본 (이메일 비교 + user_id 비교 2중) | 자기 행 덮어쓰기는 얻는 것 없이 실패 시 멀쩡한 행만 잃음 |
| 원본 계정에 `dma_credentials` 행 없음 | 연결할 대상이 없음 |
| `--dma-user` 가 원본 행의 `dma_user_id` 와 다름 | 저장 암호문은 원본 id 의 비밀번호 → 틀린 비밀번호로 KB 로그인 → 계정 잠금 (T-15-10) |
| 재암호화 라운드트립 실패 | 어긋난 값 저장 시 relay 가 그 사용자를 영구 `unauthorized` 처리 |

### Task 2 — `scripts/dma-credentials.sh` 래퍼 (`3911923`, 0755)

1. `cd "$(dirname "$0")/.."` — 이 한 줄이 래퍼의 존재 이유(오늘 `scripts/` 안에서 실행해
   `source workers/master-sync/.env` 가 깨진 사고를 구조적으로 막는다).
2. `ENV_FILE="${DMA_CRED_ENV_FILE:-workers/master-sync/.env}"`, 부재 시 경로·기준 루트·
   덮어쓰기 방법을 안내하고 exit 1.
3. `set -a; source; set +a` 후 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 존재만 확인.
   비어 있으면 **키 이름만** 출력 (값 노출 금지 — deploy-relay.sh 동일 규약).
4. `CLOUDSDK_CORE_PROJECT` 기본 `gh-radar`, `GOOGLE_APPLICATION_CREDENTIALS` 미설정 +
   deployer 키 존재 시 자동 지정. 둘 다 없어도 실패시키지 않고 note 한 줄만 (— `--list` 는
   AES 키가 필요 없고 `DMA_CRED_KEY` 직접 주입 경로도 유효하다).
5. `exec pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts "$@"` —
   종료코드 그대로 전달.

## 검증

| # | 명령 | 결과 |
|---|------|------|
| 1 | `cd relay && pnpm exec tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck --types node ../scripts/dma-credentials.ts` | exit 0 |
| 2 | `bash -n scripts/dma-credentials.sh` / `test -x` | exit 0 / 0755 (git mode 100755) |
| 3 | `/tmp` 에서 래퍼 `--list` | `등록된 매핑 2건` 출력, exit 0. service role key·AES 키 미노출 |
| 4 | `/tmp` 에서 래퍼 인자 없음 | `usage()` 출력(링크 모드 줄 포함) 후 exit 1 |
| 5 | 존재하지 않는 `DMA_CRED_ENV_FILE` | 경로·기준 루트·덮어쓰기 안내 후 exit 1 |
| 6 | `SUPABASE_SERVICE_ROLE_KEY` 없는 env 파일 | `다음 키가 비어 있습니다: SUPABASE_SERVICE_ROLE_KEY` (이름만) 후 exit 1 |
| 7 | `grep -nE "console\.(log\|error)\(.*(plain\|credKey\|password_enc\|encrypted)"` | 매치 0건 |
| 8 | `grep -c "D-17" scripts/dma-credentials.ts` | 3 (블록 유지) |

검증 3~6 은 worktree 에 `.env` 가 없어(gitignore) `DMA_CRED_ENV_FILE=/Users/alex/repos/gh-radar/workers/master-sync/.env`
로 지정해 실행했다. **읽기 전용 명령만 실행했고 `--from-email` 실제 등록은 실행하지 않았다**
(운영 DB 쓰기 — plan 의 명시 제외 항목).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 누락된 필수 기능] 재암호화 로직을 별도 헬퍼로 분리**
- **Found during:** Task 1
- **Issue:** plan 은 "새 함수 하나(`runLink`)"를 지시했으나, `try { ... } catch { fail(...) }`
  안에서 `encrypted` 를 `let` 으로 받으면 TypeScript 의 definite-assignment 분석에서
  `strict` 위반이 난다. 또 try 블록에 upsert 까지 넣으면 DB 오류가 "복호 실패" 로 잘못
  보고된다.
- **Fix:** `reencryptForTarget()` 헬퍼를 추가해 복호→재암호화→라운드트립만 감싸고 암호문을
  반환한다. 부수 효과로 **평문 변수의 lexical scope 가 더 좁아졌다** (plan 의 T-FTD-01 의도 강화).
- **Files modified:** `scripts/dma-credentials.ts`
- **Commit:** `b9e5292`

**2. [Rule 1 - 버그] 래퍼의 빈 키 검증에서 bash 배열 사용 제거**
- **Found during:** Task 2
- **Issue:** 최초 작성은 `MISSING=()` + `[[ -z ... ]] && MISSING+=(...)` 형태였다. 두 가지가
  깨진다 — (a) macOS 기본 bash 3.2 는 `set -u` 상태에서 빈 배열 참조(`${#a[@]}`)에
  unbound variable 로 죽는다, (b) `[[ ... ]] && ...` 는 조건이 거짓일 때 종료코드 1 을
  반환해 `set -e` 가 스크립트를 그 자리에서 끝낸다 — 즉 **키가 정상일 때 오히려 죽는다.**
- **Fix:** 문자열 누적 + 명시 `if` 문으로 교체. 이유를 주석으로 남겼다.
- **Files modified:** `scripts/dma-credentials.sh`
- **Commit:** `3911923`

### 계획 대비 조정

**커밋 분할.** plan 의 success_criteria 는 두 파일을 한 커밋으로 적었으나, 실행 지시는
"태스크당 원자 커밋" 이라 Task 1 / Task 2 를 각각 커밋했다. 메시지 형식(`feat(260909-ftd): ...`,
한글)은 유지했고 두 커밋의 합이 원래 의도한 단위와 같다.

**검증 경로.** plan 의 `<verify>` 는 `/Users/alex/repos/gh-radar/scripts/...` 절대경로를
가리키지만 실행은 worktree(`.claude/worktrees/agent-a9048cdea683f688b`) 안에서 이뤄지므로
worktree 사본을 대상으로 동일 명령을 돌렸다.

## Threat Flags

없음 — 새 네트워크 표면·인증 경로·스키마 변경이 없다. 신규 의존성도 없다(T-FTD-SC).

## Known Stubs

없음.

## 남은 것 (사용자 소관)

실제 링크 실행은 운영 DB 쓰기라 이 plan 에서 수행하지 않았다. 사용자가 직접 실행:

```bash
bash scripts/dma-credentials.sh --email <대상 이메일> --from-email <원본 이메일>
```

성공 시 stderr 로 두 가지가 나온다 — ① 기존 relay 세션은 즉시 갱신되지 않음,
② 같은 DMA user_id 를 공유하게 되므로 계좌 범위·주문 상태가 섞여 보임(D-17).
②를 원치 않으면 별도 DMA user_id 를 발급해 등록 모드로 따로 등록해야 한다.

## Self-Check: PASSED

- `scripts/dma-credentials.ts` FOUND (수정, commit `b9e5292`)
- `scripts/dma-credentials.sh` FOUND (신규 0755, commit `3911923`)
- commit `b9e5292` FOUND
- commit `3911923` FOUND
