---
phase: quick-260908-qnf
plan: 01
subsystem: testing
tags: [supabase, migration, docker, buildkit, playwright, e2e, ui-copy, vitest]

requires:
  - phase: 15-dma-relay-kb-gh-trade-server-10-wss
    provides: "deferred-items.md · 15-LIVE-VERIFICATION.md 이관 목록 15건 중 6건(5·6·7·9·10·11)의 원인 분석"
provides:
  - "빈 DB 에서 supabase/migrations/*.sql 35건 전량 재생 가능 복구 (재해복구·신규 스테이징 전제)"
  - "server·intraday-sync·relay 빌드 컨텍스트에서 .env/.next/.vercel 실제 차단"
  - "선재 E2E 11건 청산 — discussions/discussion-filter/auth-guards/stock-detail-tabs 29건 green"
  - "상태 바 unauthorized 문구를 게이트 카드 제목과 분리 + UI-SPEC 소유처 명시"
affects: [supabase-migrations, deploy-server, deploy-intraday-sync, webapp-e2e, phase-15-ui-spec]

tech-stack:
  added: []
  patterns:
    - "이미 원격 적용된 마이그레이션 파일의 in-place 가산 보정 (더 이른 타임스탬프 신규 파일 금지 — --include-all 함정 회피)"
    - "일회용 postgres 컨테이너로 마이그레이션 이력 전량 재생 + has_function_privilege 실증 (공유 DB 접촉 0회)"
    - "docker builder 스테이지 직접 조회로 dockerignore 실효성 증명 (컨텍스트 전송량만으로 판단하지 않음)"

key-files:
  created:
    - server/Dockerfile.dockerignore
    - workers/intraday-sync/Dockerfile.dockerignore
  modified:
    - supabase/migrations/20260702160000_security_perf_advisor_fixes.sql
    - relay/Dockerfile.dockerignore
    - relay/.dockerignore
    - webapp/e2e/fixtures/discussions.ts
    - webapp/e2e/fixtures/stocks.ts
    - webapp/e2e/specs/discussions.spec.ts
    - webapp/e2e/specs/discussion-filter.spec.ts
    - webapp/e2e/specs/auth-guards.spec.ts
    - webapp/e2e/specs/stock-detail-tabs.spec.ts
    - webapp/src/components/orderbook/relay-status-bar.tsx
    - webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-UI-SPEC.md

key-decisions:
  - "rls_auto_enable() CREATE 는 이미 원격 적용된 20260702160000 파일 안 REVOKE 앞에 in-place 삽입 — 더 이른 타임스탬프 신규 파일은 이후 모든 db push 에 --include-all 함정을 남긴다"
  - "CREATE EVENT TRIGGER 는 넣지 않는다 — 클러스터 레벨 객체라 실제 Supabase 대상에서 권한 오류로 실패한다"
  - "relay/Dockerfile.dockerignore 에도 **/.next·.vercel 추가 — relay/Dockerfile 이 webapp 을 COPY 하지 않음을 확인한 뒤 판단"
  - "discussion-filter 스펙 3건은 envelope 이 아니라 CLASSIFY_PAUSED 가 원인이었다 — 단위 테스트와 같은 현행 계약으로 재작성 (retired Phase 08.1 계약을 되살리지 않는다)"
  - "게이트 카드 제목이 문구 정본이고 상태 바를 바꾼다 — 상태 바의 일은 연결 상태를 말하는 것이지 권한 없음의 이유를 반복하는 것이 아니다"
  - "server flake 는 3/3 통과로 수정하지 않는다 (시간 상자 규칙 ①) — server/vitest.config.ts 무변경"

patterns-established:
  - "E2E 스텁은 소비처 계약(DiscussionListResponse)을 정본으로 삼는다 — GET envelope / POST 배열은 서로 다른 계약이므로 한쪽만 고친다"
  - "기능이 비활성(CLASSIFY_PAUSED)으로 바뀌면 단위 테스트뿐 아니라 E2E 스펙도 같은 커밋에서 갱신한다"
  - "재시도 없는 one-shot 읽기(getAttribute/count)는 auto-retry 단언(toHaveAttribute/toHaveCount)으로 대체 — 단언 강도는 유지"

requirements-completed: [15-DEFER-05, 15-DEFER-06, 15-DEFER-07, 15-DEFER-09, 15-DEFER-10, 15-DEFER-11]

duration: 62min
completed: 2026-09-08
---

# Quick 260908-qnf: Phase 15 이관 6건 종결 Summary

**마이그레이션 이력 재생 가능성 복구 + BuildKit 이 읽지 않던 dockerignore 2건 실효화 + 선재 E2E 11건 청산 + 상태 바/게이트 문구 정본 분리 — production DB·배포에 변경 0.**

## Performance

- **Duration:** 약 62분 (검증 재실행 포함)
- **Started:** 2026-09-08 19:20 KST
- **Completed:** 2026-09-08 20:22 KST
- **Tasks:** 3/3
- **Files modified:** 13 (신규 2 · 수정 11)

## Accomplishments

- **이관 5 종결** — `public.rls_auto_enable()` 정의를 마이그레이션 이력에 보정. 빈 DB 에서 35개 파일 전량이 오류 0 으로 재생된다(실증). 재해복구·`db reset`·신규 스테이징이 막혀 있던 상태 해소.
- **이관 9 종결** — `server/.dockerignore` · `workers/intraday-sync/.dockerignore` 를 BuildKit 이 실제로 읽는 `Dockerfile.dockerignore` 이름으로 교정. builder 레이어에 `.env` 0건 · `server/tests` 부재를 컨테이너 안에서 직접 확인.
- **이관 6 종결** — baseline 11건 실패 → 0건. 원인이 둘이었다(문서에 기록된 envelope 계약 7건 + 미진단 `CLASSIFY_PAUSED` 3건 + auth-guards 1건).
- **이관 11 종결** — SK하이닉스·카카오 픽스처가 삼성 ISIN 을 상속해 세 종목이 같은 표준코드를 갖던 어긋남 해소.
- **이관 10 종결** — 상태 바 unauthorized 문구를 게이트 카드 제목과 분리하고, 재발 원인이었던 UI-SPEC 의 모호한 한 줄(`본문을 C13 게이트로 교체`)을 소유처 명시로 대체.
- **이관 7 판정** — server 테스트 3회 연속 전부 통과. 시간 상자 규칙 ①에 따라 **아무것도 고치지 않았다.**

## Task Commits

1. **Task 1-A: rls_auto_enable 보정 마이그레이션** — `a5187ce` (fix)
2. **Task 1-B: dockerignore 실효화** — `bccd89d` (fix)
3. **Task 2-B1: 토론 GET 스텁 envelope 교정 (+ stock-detail-tabs 단언 복원)** — `4458b90` (fix)
4. **Task 2-B1': 토론 필터 스펙을 CLASSIFY_PAUSED 현행 계약으로** — `3e5d572` (fix)
5. **Task 2-B2: auth-guards 루트 단언 갱신** — `663bf35` (fix)
6. **Task 2-B3: stocks 픽스처 ISIN 정합** — `6ce5137` (fix)
7. **Task 3-E: 상태 바 문구 분리 + UI-SPEC 갱신 + 회귀 테스트** — `18999b0` (fix)
8. **Task 2 보강: 쿨다운 단언 재시도화** — `82ce673` (fix)

## 항목별 "지금도 재현되는가" 재확인 결과

| 이관 | 재확인 방법 | 결과 |
|------|-------------|------|
| 5 | `grep -rn rls_auto_enable supabase/` | **재현** — CREATE 없이 REVOKE 3줄만 (`20260702160000:23-25`) |
| 9 | `git ls-files \| grep dockerignore` + 배포 스크립트 컨텍스트 확인 | **재현** — `relay/Dockerfile.dockerignore` 만 유효, server·intraday-sync 는 고아. 두 빌드 모두 `-f <dir>/Dockerfile .` (컨텍스트 = 저장소 루트) |
| 6 | 3개 스펙 실행 (고치기 전) | **재현** — 11 failed / 10 passed |
| 11 | 픽스처 실측 | **부분 해소** — 15-14 가 타입·삼성·NULL_PRICE 는 이미 채웠고, 남은 어긋남은 SK하이닉스·카카오의 ISIN 상속 1건뿐 |
| 10 | `grep -rn "실시간 호가·주문 권한이 없어요" webapp/src` | **재현** — 상태 바 `relay-status-bar.tsx:123` + 게이트 `stock-orderbook-section.tsx:467` 2곳 (`server/src/errors.ts:64` 는 API 에러 표면이라 미대상) |
| 7 | `pnpm --filter @gh-radar/server test` ×3 | **재현되지 않음** — 3/3 통과 |

## 실측 수치

### Task 1-A — 빈 DB 이력 재생 (일회용 컨테이너, 공유 DB 접촉 0회)

`public.ecr.aws/supabase/postgres:17.6.1.104` 컨테이너 `qnf-pg`(54329) 생성 → `auth.jwt()` 스텁 1개만 사전 생성 → 파일명 순 전량 적용.

```
OK [1..35] — 35개 파일 전부 오류 0 (FAILED 0건)
rls_auto_enable_count=1
anon_execute=false
authenticated_execute=false
public_execute=false
prosecdef=true  rettype=event_trigger
```

`supabase migration list` 로 `20260702160000` 이 **Local == Remote** (이미 원격 적용)임을 먼저 확인해 in-place 보정이 production 무영향임을 못박았다. 검증 후 컨테이너 삭제.

### Task 1-B — dockerignore 실효 + 빌드 무회귀

```
docker build -f server/Dockerfile -t gh-radar-server:qnf-verify .   → exit 0 (BUILD OK)
transferring context: 43.74kB            (기대 <50MB 대비 3자릿수 여유)
```

컨텍스트 전송량은 BuildKit 의 증분 전송이라 절대치로 신뢰하기 어렵다. 그래서 **builder 스테이지를 직접 조회**해 제외가 실제로 적용됐음을 확인했다:

```
server/tests:        ABSENT      ← **/tests 제외가 실효
*.test.ts count:     0
any .env:            0
server/dist:         PRESENT     ← 컨테이너 안에서 pnpm build 가 만든 것 (정상)
```

`server/` 전체는 2.1MB(dist 1.3M · tests 200K · node_modules 28K · src 528K), `webapp/.next` 는 **546MB**. 검증용 이미지 2개는 삭제했다.

### Task 2 — E2E baseline vs 결과

| 시점 | discussions | discussion-filter | auth-guards | stock-detail-tabs | 합계 |
|------|-------------|-------------------|-------------|-------------------|------|
| 고치기 전 (baseline) | 6 실패 | 4 실패 | 1 실패 | — | **11 failed / 10 passed** |
| 고친 후 | 0 | 0 | 0 | 0 | **29 passed (0 failed)** |

목표 4개 스펙 + `orderbook.spec.ts` 동시 실행 최종 확인: **37 passed / exit 0**.

`pnpm --filter webapp typecheck` exit 0 · `pnpm --filter webapp test` **45 files / 393 passed (1 skipped)**.

### Task 3-F — server 테스트 시간 상자 (3회 연속)

| 회차 | exit | Test Files | Tests | Duration |
|------|------|-----------|-------|----------|
| 1 | 0 | 31 passed (31) | 268 passed (268) | 4.80s |
| 2 | 0 | 31 passed (31) | 268 passed (268) | 5.60s |
| 3 | 0 | 31 passed (31) | 268 passed (268) | 6.84s |

**3회 모두 통과 → 규칙 ① 적용, 아무것도 고치지 않았다.** `server/vitest.config.ts` 는 무변경이고 `testTimeout` 도 추가하지 않았다. 15-20 이 관측한 `stock-detail.test.ts` 5초 타임아웃은 이번 3회에서 재현되지 않았다. 이관 7 은 **"현 시점 재현 안 됨"** 으로 닫되, 구조(supertest 가 파일마다 임시 서버 bind/close)는 그대로이므로 재발 시 다시 계측할 것.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] discussion-filter 3건의 진짜 원인은 envelope 이 아니라 `CLASSIFY_PAUSED` 였다**

- **Found during:** Task 2 (envelope 교정 후 재실행)
- **Issue:** `deferred-items.md` 는 discussions 10건을 전부 "배열 픽스처 대 `{items,hasMore}` 계약" 으로 진단했다. envelope 을 고치자 7건이 green 이 됐지만 `discussion-filter` 3건은 계속 빨갰다. 실제 원인은 quick 260706-erk 가 Haiku 의미성 분류를 제거하면서 `discussion-page-client.tsx` 의 `CLASSIFY_PAUSED` 를 `true` 로 고정한 것이다 — 그때 단위 테스트(`discussion-page-client.test.tsx`)는 갱신됐는데 E2E 스펙만 Phase 08.1 시절 단언(토글 ON·noise 제외·meaningful 전용 카피)을 들고 있었다.
- **Fix:** 1·2·4 케이스를 단위 테스트와 **같은 계약**으로 재작성 — OFF/disabled · 클릭해도 URL·목록 불변 · meaningful 전용 카피 미노출. 단언을 지우거나 약화시키지 않고 "지금 보장해야 할 것" 으로 바꿨다. 분류를 다시 켤 때 되돌릴 지점을 파일 머리에 명시.
- **Files modified:** `webapp/e2e/specs/discussion-filter.spec.ts`
- **Commit:** `3e5d572`

**2. [Rule 1 - Bug] `stock-detail-tabs.spec.ts` 의 약화된 단언 복원**

- **Found during:** Task 2
- **Issue:** 4번 케이스가 `[data-testid^="stock-discussion-section"]` 접두사 매칭을 쓰면서 "픽스처가 구계약 배열을 반환하는 선재 결함이 있어 정상 상태를 강제할 수 없다" 는 주석을 달고 있었다. 픽스처를 고친 뒤에는 그 주석이 거짓이 되고, 약화된 단언이 로딩/에러 상태를 통과시킨다.
- **Fix:** 정확한 `getByTestId('stock-discussion-section')` 로 좁혔다. 10/10 green 확인.
- **Files modified:** `webapp/e2e/specs/stock-detail-tabs.spec.ts`
- **Commit:** `4458b90`

**3. [Rule 1 - Bug] 쿨다운 단언의 재시도 없는 one-shot 읽기**

- **Found during:** Task 2 회귀 게이트(전체 스위트 반복 실행)
- **Issue:** `discussions.spec.ts:145` 가 `toBeDisabled()` 직후 `getAttribute('data-remaining-seconds')` 를 한 번만 읽었다. 버튼은 **요청 진행 중(`isRefreshing`)에도 disabled** 라서 429 가 도착하기 전에 `toBeDisabled()` 가 통과할 수 있고, 그 틈에 속성이 아직 없어 `null` 이 읽힌다. 전체 스위트 5회 실행 중 2회 재현.
- **Fix:** 자동 재시도되는 `toHaveAttribute('data-remaining-seconds', /^\d+$/)` 를 앞에 두고 값을 읽는다. 초 범위 단언(0 초과 · 30 이하)은 그대로 — 강도를 낮추지 않고 결정성만 확보했다.
- **Files modified:** `webapp/e2e/specs/discussions.spec.ts`
- **Commit:** `82ce673`

**4. [Rule 2 - Correctness] `relay/.dockerignore` 의 stale 경로 참조 교정**

- **Found during:** Task 1-B (`git mv` 직후)
- **Issue:** 머리 주석이 `server/.dockerignore 와 동일 규약` 을 가리키는데 그 파일이 rename 으로 사라졌다.
- **Fix:** `server/Dockerfile.dockerignore` 로 갱신. 같은 커밋에서 `relay` 양쪽에 `**/.next` · `.vercel` · `**/test-results` · `**/playwright-report` 도 추가했다(`relay/Dockerfile` 이 webapp 을 COPY 하지 않음을 실측 확인 — relay 빌드 컨텍스트도 546MB 줄어든다).
- **Files modified:** `relay/.dockerignore`, `relay/Dockerfile.dockerignore`
- **Commit:** `bccd89d`

---

**Total deviations:** 4 auto-fixed (Rule 1 ×3 / Rule 2 ×1). 아키텍처 변경 없음, 의존성 추가 없음.

## 이관 (범위 밖 — 고치지 않음)

### 1. 선재 E2E 실패 3건 — `a11y.spec:37` · `news.spec:117` · `search.spec:17`

`pnpm --filter webapp exec playwright test` **전체** 는 아직 exit 0 이 아니다. 남은 3건은 **이 quick 이 만든 것이 아니고 플랜 범위 밖 파일**이다. 인과관계를 추정이 아니라 **실험으로 배제**했다:

> 이 quick 이 건드린 webapp 파일 3개(`e2e/fixtures/stocks.ts` · `e2e/fixtures/discussions.ts` · `src/components/orderbook/relay-status-bar.tsx`)를 quick 이전 커밋(`399ade3`) 버전으로 되돌려 세 스펙을 실행 → **동일하게 3건 실패**. 되돌린 파일은 즉시 복원했다(작업 트리 clean 확인).

또한 `git diff 399ade3 HEAD -- webapp/e2e/specs/search.spec.ts webapp/e2e/fixtures/mock-api.ts webapp/src/hooks/use-cmdk-shortcut.ts webapp/src/app/scanner webapp/src/components/layout webapp/src/components/search` 가 **빈 diff** 다 — 실패하는 테스트와 그 대상 코드가 전부 무변경이다.

| 스펙 | 증상 | 관측된 원인 |
|------|------|-------------|
| `a11y.spec.ts:37` `/stocks/005930` | `aria-prohibited-attr` (serious) 1건: `<div data-slot="skeleton" aria-label="일봉 차트 로딩 중">` — role 없는 div 에 aria-label | 일봉 차트 API 가 목되지 않아 스켈레톤이 스캔 시점까지 남는다. 로컬 :8080 백엔드가 떠 있지 않고 `NEXT_PUBLIC_API_BASE_URL` 도 주석 처리 상태 |
| `news.spec.ts:117` | `getByTestId('news-item').count()` 가 0 | 재시도 없는 one-shot `count()` (deviation 3 과 같은 클래스). `toHaveCount` 로 바꾸면 해소될 가능성이 높다 |
| `search.spec.ts:17` ⌘K | `getByRole('dialog')` 미발견 | `page.goto` 직후 `page.evaluate` 로 keydown 을 **한 번만** dispatch — React hydration 이 document keydown 리스너를 붙이기 전이면 이벤트가 유실되고 재시도가 없다 |

**권고:** ① `news`/`search` 는 재시도 단언·hydration 대기로 결정화(1~2줄), ② `a11y` 는 스켈레톤의 `aria-label` 을 `role="status"` 와 함께 쓰거나 차트 API 를 목에 추가. 셋 다 30분 이내 quick 감이지만 이 quick 의 6개 이관과 무관해 손대지 않았다.

**참고 — 관측 이력:** 전체 스위트 5회 실행 중 1회(19:47)는 `79 passed / 9 skipped / 0 failed` 로 **exit 0** 이었다. 이후 실행에서는 위 3건이 저부하(load1 2.8~3.9)에서도 결정적으로 재현된다. 즉 "부하 때문에 흔들리는 것" 이 아니라 **환경 의존적으로 안정화된 실패**이며, 목표 4개 스펙은 5회 전부 29/29 green 이었다.

### 2. dockerignore 가 아예 없는 워커 9종

`workers/` 의 나머지 워커에는 `.dockerignore` 계열 파일이 처음부터 없다. **무효화된 것이 아니라 원래 없었던 것**이라 이 quick 의 버그 클래스가 아니다. 다만 이들도 저장소 루트를 컨텍스트로 쓰므로 `.env`·`webapp/.next`(546MB)가 컨텍스트에 들어간다 — 같은 템플릿을 복사하는 후속 quick 을 권한다.

### 3. `relay/.dockerignore` 는 영구적으로 읽히지 않는다

`relay/Dockerfile.dockerignore` 와 내용이 같아야 하는 사문 파일이다(파일 자신의 주석이 "두 파일을 함께 고쳐야 한다" 고 적고 있다). 15-05 가 의도적으로 남긴 쌍이라 삭제는 이 quick 범위 밖으로 뒀고, 이번 변경은 양쪽에 똑같이 반영했다. 동기화 부담을 없애려면 삭제가 맞다.

### 4. 이관 7(server flake) 은 "현 시점 재현 안 됨" 으로 닫는다

3/3 통과라 수정 근거가 없다. 원인 구조(supertest 가 파일마다 임시 서버를 bind/close)는 그대로 남아 있으므로, 재발하면 그때 회차·파일·에러 문자열을 다시 계측할 것.

## Known Stubs

없음. 이 quick 은 새 표면을 만들지 않았고 자리표시 값·미배선 컴포넌트를 남기지 않았다.

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·스키마 변경을 추가하지 않았다. 플랜 `<threat_model>` 의 T-QNF-01/02/03/04 는 전부 `mitigate` 로 처리했고 실증 근거는 위 "실측 수치" 에 있다:

- **T-QNF-01 (Information Disclosure)** — builder 레이어 `.env` 0건 실측.
- **T-QNF-02 (Tampering)** — 본문을 `db dump` 실측 덤프에서 글자 그대로 이식. `db push` 미실행.
- **T-QNF-03 (Elevation of Privilege)** — 재생 DB 에서 `has_function_privilege` anon/authenticated/PUBLIC 전부 `false`.
- **T-QNF-04 (DoS)** — 35건 전량 재생 성공.
- **T-QNF-05** 는 `accept` 그대로(원격 재실행 경로 없음).

## Production 무영향 확인

- `supabase db push` **미실행** (읽기 전용 `supabase migration list` 만 사용)
- `scripts/deploy-*.sh` **미실행** — `docker build` 는 로컬 태그로만, push 없음. 검증 이미지 2개 삭제 완료
- 실계좌·게이트웨이·relay VM 접촉 없음
- 공유 Supabase 스키마 변경 0 — 마이그레이션 재생은 일회용 컨테이너(`qnf-pg`, 삭제 완료) 안에서만

## Self-Check: PASSED

파일 존재 확인:
- FOUND: `supabase/migrations/20260702160000_security_perf_advisor_fixes.sql` (`CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"()` 포함, REVOKE 보다 앞)
- FOUND: `server/Dockerfile.dockerignore` (`.env` 포함)
- FOUND: `workers/intraday-sync/Dockerfile.dockerignore`
- FOUND: `webapp/e2e/fixtures/discussions.ts` (`hasMore` 포함)
- FOUND: `webapp/src/components/orderbook/relay-status-bar.tsx` (`실시간 연결을 시작하지 않았어요`)
- 고아 `.dockerignore` 없음 — `git ls-files | grep dockerignore` → `relay/.dockerignore`(의도된 쌍) · `relay/Dockerfile.dockerignore` · `server/Dockerfile.dockerignore` · `workers/intraday-sync/Dockerfile.dockerignore`

커밋 확인: `a5187ce` · `bccd89d` · `4458b90` · `3e5d572` · `663bf35` · `6ce5137` · `18999b0` · `82ce673` 전부 `master` 에 존재.
