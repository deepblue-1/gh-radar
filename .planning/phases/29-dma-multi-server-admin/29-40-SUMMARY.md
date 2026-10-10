---
phase: 29-dma-multi-server-admin
plan: 40
subsystem: admin
tags: [shared, relay, server, logging, masking, admin-overview, docs, requirements, traceability, g-1]
status: complete

requires:
  - phase: 29-37
    provides: "Admin 계좌 주문 서버 PUT 경로 · relay/Express 감사 줄(dma 마스킹)"
  - phase: 29-39
    provides: "작업대 계좌별 서버 칩 · 「재접속하면 적용」 배지 제거(WR-05 마무리)"
provides:
  - "shared `maskDmaUserId` 한 벌 — relay admin-api 감사 · relay 이관 도구(재수출) · Express 감사 로그가 같은 함수"
  - "개요 칩 `pendingTone`: 최근 결과 timeout → err 「응답 없음」(시트 응답 칩과 같은 색 · 문구)"
  - "infra/relay/README.md §계좌별 주문 서버(G-1) · 관찰자 정원 6 · 롤백 절 개명 SQL 옛 위치 안내"
  - "롤백 SQL 머리 정정 노트(주석만)"
  - "REQUIREMENTS.md 「DMA Admin」 ADMIN-01~12 · Traceability Pending 12행 · Coverage 65"
  - "29-REVIEW-DISPOSITION 11건 fixed + Source"
  - "29-CONTEXT D-10 · D-17 아래 G-1 대체 표기"
affects: [29-41, phase-29-reverification, verify-work]

actuals:
  tokens: 17400
  tasks: 2
  commits: 3
plan_head_before: f542b5304b6e01b83dc5c8c0d21de34d824bf825
plan_head_after: 63d00f08dd84ddba454bb93602a34efb80edaac1

tech-stack:
  added: []
  patterns:
    - "로그 마스킹 규칙은 shared 한 곳 — 소비처는 import(옛 import 경로는 재수출 한 줄로 호환)"
    - "원격 적용 마이그레이션의 낡은 주석은 파일을 고치지 않고 짝 롤백 파일 머리 · README 에 정정(18-24 선례)"
    - "결정 대체는 원문 결정 줄 아래 `[대체됨 — …]` 덧붙임 한 줄로만(원문 무수정)"

key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/29-40-SUMMARY.md
  modified:
    - packages/shared/src/admin.ts
    - packages/shared/src/__tests__/admin.test.ts
    - packages/shared/src/__tests__/admin-overview.test.ts
    - relay/src/admin/admin-api.ts
    - relay/src/store/dma-users-migrate.ts
    - relay/tests/admin-api.test.ts
    - server/src/routes/admin.ts
    - server/tests/routes/admin-dma.test.ts
    - infra/relay/README.md
    - supabase/rollback/29-gateway-key-rename-revert.sql
    - .planning/REQUIREMENTS.md
    - .planning/phases/29-dma-multi-server-admin/29-REVIEW-DISPOSITION.md
    - .planning/phases/29-dma-multi-server-admin/29-CONTEXT.md
    - .planning/phases/29-dma-multi-server-admin/deferred-items.md

key-decisions:
  - "29-40: DMA id 마스킹 정본 = shared maskDmaUserId(코드포인트 · 앞 min(2, floor(len/2))자 + ***(길이)) — relay admin-api 는 import, dma-users-migrate 는 재수출(scripts/migrate-dma-users.ts 가 그 경로로 import), Express maskDma 는 삭제"
  - "29-40: 개요 칩 timeout = err 「응답 없음」(시트 쪽에 맞춤) · offline 은 warn 그대로"
  - "29-40: ADMIN-06 · ADMIN-10 정의는 29-RESEARCH 문장 그대로 두고 줄 끝에 「G-1 갱신」 을 덧붙였다 — 「주문 서버 바뀜」 프레임 · 증권사 주문 라디오 뜻이 G-1 로 바뀐 사실을 정의부에서 보이게"
  - "29-40: Traceability 는 전부 Pending — requirements.mark-complete 는 실행하지 않았다(플랜 금지: 「Traceability 상태를 Complete 로 쓴다 — 재검증 몫」)"

patterns-established:
  - "로그 마스킹 한 벌: 감사 로그에 싣는 식별자 마스킹은 @gh-radar/shared 에만 정의"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-07, ADMIN-08, ADMIN-09, ADMIN-10, ADMIN-11, ADMIN-12]

coverage:
  - id: D1
    description: "shared maskDmaUserId 한 벌(kim01 → ki***(5) · abc → a***(3) · ab → a***(2) · a → ***(1) · 김철 → 김***(2) · 빈 → ***(0))"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#maskDmaUserId — 로그 전용 DMA id 마스킹 한 벌 (IN-01 · 29-40) (6 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay admin-api 감사 · 이관 도구 · Express 감사 로그가 같은 id 를 같게 가린다(3자 id → a***(3))"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#S5 감사 로그 DMA id 마스킹 = shared maskDmaUserId 한 벌(IN-01 · 29-40) — 3자 id 는 앞 1자만(abc → a***(3))"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#감사 로그 DMA id 마스킹 = shared maskDmaUserId 한 벌(IN-01 · 29-40) — 3자 id 는 앞 1자만(abc → a***(3))"
        status: pass
      - kind: unit
        ref: "relay/tests/dma-users-migrate.test.ts#마스킹 — DMA id 는 앞 최대 2자(길이의 절반 이하) + 길이 · 이메일은 로컬 부분 앞 2자만"
        status: pass
    human_judgment: false
  - id: D3
    description: "개요 칩: 최근 결과 timeout → err 「응답 없음」 · offline → warn"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin-overview.test.ts#차이 있음 · 최근 결과 timeout → err 「응답 없음」(시트 응답 칩과 같은 색 · 문구 — IN-02)"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/admin-overview.test.ts#차이 있음 · 최근 결과 offline → warn(종전 그대로)"
        status: pass
    human_judgment: false
  - id: D4
    description: "README 관찰자 정원 6 · §계좌별 주문 서버(G-1) · 고아 쿼리 경로 · accountOrderServers · 롤백 정정 노트(주석만) · 원격 적용 마이그레이션 무수정"
    verification:
      - kind: other
        ref: "Task 2 <automated> grep 게이트(kMaxObservers 4 없음 · accountOrderServers · 29-orphan-dma-users.sql · 마이그레이션 최종 커밋 e2a12c34) → OK"
        status: pass
    human_judgment: true
    rationale: "README G-1 절 문장이 운영자에게 정확하고 읽히는지는 grep 이 판정하지 못한다 — 사실 원천(29-27~29-44 SUMMARY)과의 대조는 리뷰 몫"
  - id: D5
    description: "REQUIREMENTS.md ADMIN-01~12 정의 · Traceability Pending 12행 · Coverage 65 · 리뷰 처분 11건 fixed · CONTEXT D-10/D-17 대체 표기(덧붙임만)"
    verification:
      - kind: other
        ref: "Task 2 <automated> grep 게이트(ADMIN-01~12 정의 · `| ADMIN-NN |` 12행 · disposition open 0 · 대체 표기 줄 = D-10+1 · D-17+1) → OK; git diff --numstat 63d00f08^..63d00f08 -- 29-CONTEXT.md = 2 0"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-10
---

# Phase 29 Plan 40: Info 묶음 · 문서 · 추적성 정리 Summary

**DMA id 마스킹을 `@gh-radar/shared` 의 `maskDmaUserId` 한 벌로 모아 relay 감사 · 이관 도구 · Express 감사 로그가 같은 id 를 같게 가린다(`abc` → `a***(3)`). 개요 칩은 timeout 을 시트와 같은 err 「응답 없음」 으로 그린다. README 에는 관찰자 정원 6 과 G-1 운영 절을 넣었다. REQUIREMENTS 에 ADMIN-01~12 를 등록했고(Coverage 65 · 전부 Pending), 리뷰 11건을 fixed 로 처분했으며, 29-CONTEXT D-10 · D-17 아래에 G-1 대체 표기를 덧붙였다.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-10T17:17:35Z
- **Completed:** 2026-10-10T17:24:11Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- **IN-01:** shared `maskDmaUserId` 를 새로 두고 로컬 정의 세 벌을 지웠다. relay `admin-api` 는 import 하고, `dma-users-migrate` 는 재수출한다(`scripts/migrate-dma-users.ts` 가 그 경로로 import 한다). Express `maskDma` 는 삭제했다.
- **IN-02:** `pendingTone` 이 최근 결과 `timeout` 을 err 「응답 없음」 으로 그린다. 재조회 뒤 개요 칩과 시트 응답 칩이 같은 색 · 문구다.
- **README:** 503 원인 표의 `kMaxObservers` 를 4 에서 6 으로 고쳤다(journal + admin + quote). §계좌별 주문 서버(G-1)를 새로 썼다. 내용은 유효 서버 규칙 · Admin 계좌 줄 지정 · 즉시 재수립과 (가) 옛 서버 전략 끄기 · 미체결은 사용자 OCX 대사 · healthz `accountOrderServers` 본문 전용 · 고아 쿼리 · skipDisabled · 마감 10/15/20초다. 롤백 절과 DMA 서버 추가 5단계도 「기본 주문 서버」 로 맞췄다.
- **롤백 SQL 머리 정정 노트:** 짝 마이그레이션 머리 주석이 가리키는 `deploy-window/29/` 는 이동 전 위치라는 노트다. 바뀐 줄은 전부 `--` 주석이다. 원격 적용 파일의 마지막 커밋은 여전히 `e2a12c34` 다.
- **REQUIREMENTS.md:** 「DMA Admin」 절에 ADMIN-01~12 를 `[ ]` 로 두고, Traceability 12행은 Pending(29-27~29-44 재검증 대기)으로 넣었다. Coverage 는 53 → 65 이고, Last updated 에 한 줄을 더했다.
- **29-REVIEW-DISPOSITION:** 11건을 모두 fixed 로 바꾸고 Source 칸을 채웠다. frontmatter `open: 0` 이다.
- **29-CONTEXT:** D-10 · D-17 바로 아래에 `[대체됨 — G-1 · 사용자 확정 2026-10-10]` 한 줄씩을 덧붙였다(numstat 2 0 — 원문 무수정).

## Task Commits

1. **Task 1 RED: 마스킹 한 벌 · timeout 칩 실패 테스트** — `3fa9d9f5` (test)
2. **Task 1 GREEN: shared maskDmaUserId · pendingTone timeout** — `dfab1288` (feat)
3. **Task 2: README · 롤백 노트 · REQUIREMENTS · 리뷰 처분 · CONTEXT 대체 표기** — `63d00f08` (docs)

REFACTOR 커밋 없음(정리할 것 없음).

## TDD Gate Compliance

- **RED** — 목표 `maskDmaUserId — … > kim01 → ki***(5) (앞 2자)`. 스켈레톤(빈 문자열 반환)을 상대로 계획 단언(`expected '' to be 'ki***(5)'`)에서 실패했다. junit 리포트를 classifier 에 넣어 `RED_EVIDENCE_OK`(target_test_failed · 59 수집 · 7 실패)를 받았다.
  - 의미 판정: 로드 · 문법 · 픽스처 오류는 없다. 7건 모두 계획 단언에서 실패했다(마스킹 6 + 개요 timeout 1).
  - relay S5 는 `dma: "a***(3)"` toMatchObject 에서, Express 는 `toContain("a***(3)")` 에서 실패했다(옛 규칙 출력 `ab***(3)`).
  - Express 테스트는 처음에 shared dist 미빌드로 `TypeError` 였다. 단언 순서를 바꾸고 스켈레톤을 빌드한 뒤 계획 단언 실패를 재확인했다.
- **GREEN** — shared 59/59 · relay admin-api + migrate 56/56 · server admin-dma + admin 106/106 · shared 전체 448 · webapp admin 129 pass. 타입 검사는 shared build · relay typecheck · typecheck:tests · server · webapp 모두 exit 0 이다.
- **트레이서 게이트** — interactive · end-of-phase · `<automated>` 만 있으므로 verify 를 다시 돌렸고 통과했다. 그대로 Task 2 로 넘어갔다.

## Files Created/Modified

- `packages/shared/src/admin.ts` — `maskDmaUserId`(머리 주석: IN-01 · 로그 전용 · 규칙) · `pendingTone` timeout 갈래
- `packages/shared/src/__tests__/admin.test.ts` — 마스킹 골든 6
- `packages/shared/src/__tests__/admin-overview.test.ts` — timeout → err · offline → warn
- `relay/src/admin/admin-api.ts` — 로컬 함수 삭제 · shared import
- `relay/src/store/dma-users-migrate.ts` — 로컬 함수 삭제 · shared import + 재수출
- `relay/tests/admin-api.test.ts` — S5(3자 id 감사 = shared 출력)
- `server/src/routes/admin.ts` — `maskDma` 삭제 · 호출 9곳을 shared `maskDmaUserId` 로
- `server/tests/routes/admin-dma.test.ts` — 3자 id 감사 줄 `a***(3)`
- `infra/relay/README.md` — 정원 6 · §계좌별 주문 서버(G-1) · 롤백 절 · 서버 추가 5단계 문구
- `supabase/rollback/29-gateway-key-rename-revert.sql` — 머리 정정 노트(주석만)
- `.planning/REQUIREMENTS.md` · `29-REVIEW-DISPOSITION.md` · `29-CONTEXT.md` · `deferred-items.md`

## 마스킹 출력 변화 (기존 단언 영향)

| 입력 | relay admin-api(옛) | 이관 도구(옛) | Express(옛) | 한 벌(새) |
|------|---------------------|---------------|-------------|-----------|
| `kim01` | `ki***(5)` | `ki***(5)` | `ki***(5)` | `ki***(5)` |
| `abc` | `ab***(3)` | `a***(3)` | `ab***(3)` | `a***(3)` |
| `ab` | `***(2)` | `a***(2)` | `***(2)` | `a***(2)` |
| `김철` | `***(2)` | `김***(2)` | `***(2)` | `김***(2)` |

기존 테스트 단언(`ki***(5)` · `tr***(4)` · `tr***(8)` · `dm***(5)` · `d***(2)` · `***(1)`)은 새 규칙과 값이 같다. 바꾼 단언 행은 없다.

## Decisions Made

- 마스킹 정본은 shared 다. 이관 도구 경로는 재수출로 남겼다. 스크립트가 그 경로로 import 하기 때문이다.
- ADMIN-06 · ADMIN-10 은 RESEARCH 문장 그대로 두고 줄 끝에 「G-1 갱신」 을 덧붙였다. 오케스트레이터 지시는 「REQUIREMENTS 문장이 실제 구현과 맞을 것」 이다.
- Traceability 상태 문구의 갭 클로징 범위를 플랜 예시 `29-27~29-41` 대신 실제 범위 `29-27~29-44` 로 썼다(29-42~29-44 도 이 갭 클로징이다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정합] README 서버 추가 5단계와 롤백 절의 문구 보강**
- **Found during:** Task 2
- **Issue:** 서버 추가 5단계의 「주문 서버는 증권사당 1대」 가 G-1 뒤 「기본 주문 서버」 와 어긋났다. 롤백 SQL 머리 노트는 「README 에도 정정」 이라 말하는데 README 에는 그 안내가 없었다.
- **Fix:** 5단계를 「기본 주문 서버」 + §계좌별 주문 서버 가리킴으로 바꿨다. 롤백 절 2번 아래에 옛 위치 안내 두 줄을 넣었다.
- **Files modified:** infra/relay/README.md
- **Committed in:** 63d00f08

### 실행하지 않은 단계

**2. `requirements.mark-complete` 미실행 — 플랜 금지 우선**
- `requirements.ready-ids` 결과는 9/12 ready 였다. ADMIN-03 · ADMIN-06 · ADMIN-12 는 29-41 이 함께 선언해서 막혔다.
- 그런데 이 플랜 prohibitions 는 「MUST NOT Traceability 상태를 Complete 로 쓴다 — 재검증 몫」 이다. 그래서 mark-complete 는 돌리지 않았다. 12건 모두 `[ ]` · Pending 이다.
- Complete 판정은 갭 클로징 재검증(verify-work)이 한다.

**Total deviations:** 1 auto-fixed (Rule 2) + 1 의도적 미실행(플랜 금지)
**Impact on plan:** 범위 확장 없음.

## Issues Encountered

- **로컬 단계 대 오케스트레이터 지시:** 이 플랜의 prohibitions 에는 「ROADMAP.md · STATE.md 를 고친다」 금지도 있다. 오케스트레이터는 순차 실행(main tree)에서 STATE · ROADMAP 갱신을 명시 지시했다. 금지 사유가 worktree 복원 함정이므로 순차 실행에는 해당하지 않는다고 보고 오케스트레이터 지시를 따른다.
- **windows ledger:** `.planning/WINDOWS.md` frontmatter 계수 불일치로 `gsd-tools windows append` 가 거부된다는 사전 고지에 따라 ledger 기록을 건너뛰었다. 기록할 스텁 · 건너뛴 테스트 · 미실행 verify 는 없다.
- **이연 1건(deferred-items.md):** `relay/src/quote/feed.ts` 19행 주석의 관찰자 정원이 아직 4 다. 플랜 파일 범위 밖이고 동작 영향은 없다.

## Known Stubs

없음.

## User Setup Required

None — 외부 서비스 설정 불필요. 배포 · DB 적용 없음(문서 · 코드 커밋만, push 안 함).

## Next Phase Readiness

- 29-41 이 남았다(ADMIN-03 · ADMIN-06 · ADMIN-12 공유).
- 29 갭 클로징이 끝나면 재검증이 ADMIN-01~12 Traceability 를 판정한다.
- 열린 인박스 `261010-kb-order-ip-mac.md` 는 이 플랜 범위 밖이다(README · 요구사항에 넣지 않았다).

## Self-Check: PASSED

- FOUND: packages/shared/src/admin.ts · relay/src/admin/admin-api.ts · relay/src/store/dma-users-migrate.ts · server/src/routes/admin.ts · infra/relay/README.md · supabase/rollback/29-gateway-key-rename-revert.sql · .planning/REQUIREMENTS.md
- FOUND commits: 3fa9d9f5 · dfab1288 · 63d00f08 (`check evaluation-scope --plan 29-40 --commits-only` = resolved · 3 commits)
- Acceptance: `export function maskDmaUserId` 1 · 로컬 `function maskDma(UserId)?(` 0/0/0 · timeout 케이스 존재 · Task 2 grep 게이트 OK · CONTEXT numstat 2 0 · 롤백 diff 비주석 줄 0 · 마이그레이션 최종 커밋 e2a12c34

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*
