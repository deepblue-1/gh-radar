---
phase: 29-dma-multi-server-admin
plan: 09
subsystem: database
tags: [supabase, postgres, pgtap, deploy-window, gateway-key-rename, visibility, rollback]

requires:
  - phase: 29-01
    provides: "dma_servers 레지스트리(KB120 · KB121 · KYOBO119 · KYOBO127) · app_users · dma_users · dma_app_access_map() SECURITY DEFINER"
  - phase: 29-05
    provides: "의도/반영 표 · RPC (이 플랜은 건드리지 않음 — 재생 순서상 선행)"
provides:
  - "supabase/deploy-window/29/01_gateway_key_rename.sql — 7개 표 KB→KB120 · KYOBO→KYOBO119 한 트랜잭션 · lock_timeout 5s · dma_credentials 기본값 KB120"
  - "supabase/deploy-window/29/02_dma_visibility_v2.sql — dma_visibility_identities v2 = 접근 맵(admin/trader + DMA 연결) × dma_servers 전 서버 키"
  - "supabase/rollback/29-gateway-key-rename-revert.sql — 수동 롤백: 역개명 + 기본값 KB + 20260929190000 뷰 본문 복원 · 새 키 행 유지"
  - "러너 scripts/verify-dma-orders-price-check.sh --with <sql> (반복 · 재생 뒤 · 테스트 전 · 순서 보존 · 없는 파일 2 · 적용 실패 5)"
  - "pgTAP 3종: gateway_key_rename(20) · gateway_key_rename_revert(21) · dma_visibility_v2(19) + 옛 키 픽스처 fixtures/29_pre_rename.sql"
affects: [29-24, 29-25]

actuals:
  tokens: 11482
  tasks: 2
  commits: 2
plan_head_before: 3424ef5e230f70018c9c3f4c43f8b889a066a277
plan_head_after: 77661705790b3d262b642dc116bbfaee5a648983

tech-stack:
  added: []
  patterns:
    - "배포 창 SQL 은 supabase/deploy-window/<phase>/ 에 둔다 — db push 경로 밖에서 대기, 런북이 배포 창에 새 버전 번호로 migrations 로 옮긴다"
    - "러너 --with 체인으로 「커밋되는 픽스처 → 배포 창 SQL → 롤백 SQL → 테스트」 순서를 일회용 컨테이너에서 재현"
    - "롤백 왕복 테스트는 픽스처에 새 키 대조군 행을 두어 「옛 키만 바뀐다」 를 양방향으로 단언"

key-files:
  created:
    - supabase/deploy-window/29/01_gateway_key_rename.sql
    - supabase/deploy-window/29/02_dma_visibility_v2.sql
    - supabase/rollback/29-gateway-key-rename-revert.sql
    - supabase/tests/fixtures/29_pre_rename.sql
    - supabase/tests/gateway_key_rename.test.sql
    - supabase/tests/gateway_key_rename_revert.test.sql
    - supabase/tests/dma_visibility_v2.test.sql
  modified:
    - scripts/verify-dma-orders-price-check.sh

key-decisions:
  - "가시성 v2 는 꺼진 서버 키(KB121 · KYOBO127)도 포함한다 — 가시성은 기록 조회라 연결 상태와 무관, 꺼진 서버의 과거 행이 사라지지 않게"
  - "레지스트리에 없는 키(옛 KB/KYOBO)로 남은 행은 v2 에서 아무에게도 안 보인다 — 그래서 v2 는 개명과 같은 배포 창에서만 적용"
  - "픽스처는 dma_journal_apply 실경로로 저널 · 투영 · 커서를 만든다(직접 INSERT 아님) — 개명 뒤 이어 적용 단언이 실제 함수 계약 위에서 돈다"
  - "러너 --with 적용 실패 종료 코드 5 = 마이그레이션 재생 실패와 같은 코드 · 없는 파일 2 = 인자 오류와 같은 코드"

patterns-established:
  - "deploy-window/29 · rollback/ 디렉터리: 원격 적용은 29-25 런북만 — 이 플랜은 운영 DB 무접촉"

requirements-completed: [ADMIN-01, ADMIN-03]

coverage:
  - id: D1
    description: "게이트웨이 키 in-place 개명 SQL — 7개 표 · 행 수/커서/전략 커서 보존 · 개명 뒤 KB120 같은 epoch 다음 seq 이어 적용 · 재적용 skipped · KB 커서 재생성 없음"
    requirement: ADMIN-01
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --with supabase/tests/fixtures/29_pre_rename.sql --with supabase/deploy-window/29/01_gateway_key_rename.sql --test supabase/tests/gateway_key_rename.test.sql"
        status: pass
    human_judgment: false
  - id: D2
    description: "롤백 역개명 SQL — 개명 → v2 → 역개명 왕복이 픽스처 상태와 같고 옛 뷰 의미 · 기본값 KB 복원 · 새 키 KB121 행 유지 · 옛 relay 가 KB 커서에서 이어 받음"
    requirement: ADMIN-01
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --with supabase/tests/fixtures/29_pre_rename.sql --with supabase/deploy-window/29/01_gateway_key_rename.sql --with supabase/deploy-window/29/02_dma_visibility_v2.sql --with supabase/rollback/29-gateway-key-rename-revert.sql --test supabase/tests/gateway_key_rename_revert.test.sql"
        status: pass
    human_judgment: false
  - id: D3
    description: "가시성 뷰 v2 — 허용 표 admin/trader + DMA 연결 × 레지스트리 · viewer/승인 대기/연결 없음 0 · 조회 RPC 2종 무수정 통과 · service_role 호출 · 권한"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --with supabase/deploy-window/29/02_dma_visibility_v2.sql --test supabase/tests/dma_visibility_v2.test.sql"
        status: pass
    human_judgment: false
  - id: D4
    description: "러너 --with 옵션 — 기존 호출(인자 없음 · --test 만) 출력 · 종료 코드 무변경"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-07
status: complete
---

# Phase 29 Plan 09: 배포 창 SQL — 게이트웨이 키 개명 · 가시성 v2 · 롤백 역개명 Summary

**KB→KB120 · KYOBO→KYOBO119 in-place 개명(7개 표 · 한 트랜잭션), 가시성 뷰 v2(허용 표 × 레지스트리), 역개명 롤백 SQL 을 `supabase/deploy-window/29/` · `supabase/rollback/` 에 두고, 러너 `--with` 체인으로 옛 키 DB → 개명 → 저널 이어 적용 · 왕복 · v2 매트릭스를 pgTAP 60단언으로 증명했다. 운영 DB 는 건드리지 않았다.**

## Performance

- **Duration:** 약 6분 (2026-10-06T16:18:38Z → 16:24:33Z)
- **Tasks:** 2/2
- **Files:** 생성 7 · 수정 1

## Accomplishments

- **트레이서(Task 1):** 옛 키 픽스처에 개명 SQL 을 적용하면 7개 표에 `KB`/`KYOBO` 가 0행, 행 수 · epoch · last_seq · 전략 커서가 그대로다. 개명 뒤 `dma_journal_apply('KB120', 'e29-kb', seq 6)` 은 applied 1 · 커서 6, seq 3 재적용은 skipped 1(체결 누적 무증가)이다. 중간 상태(개명만 적용, v2 전)에서도 옛 뷰가 개명된 자격증명 · 연결로 두 계좌를 그대로 보여 준다.
- **가시성 v2:** `dma_visibility_identities` 는 이름 · 열 · 타입이 그대로이고 본문만 `dma_app_access_map()` × `dma_servers` 로 바뀌었다. 그래서 `dma_visible_accounts` · 조회 RPC · server `dma-orders.ts` 는 고치지 않았다. trader/admin 은 레지스트리 전 서버 키로 계좌를 보고, viewer · 승인 대기 · 연결 없는 trader 는 0이다(D-21 403 유지).
- **롤백:** 개명 → v2 → 역개명 왕복 뒤 행 수 · 커서 · 투영 값 · 자격증명 기본값 `'KB'` · 옛 뷰 본문(자격증명 ∪ 연결 신원)이 개명 전과 같다. KB121 대조군 행은 남고, 옛 relay 는 `KB` 커서에서 seq 6 을 이어 받는다.
- **러너:** `--with <sql>` 은 반복할 수 있고 순서를 지킨다. 없는 파일은 exit 2, 적용 실패는 「ERROR: --with 적용 실패: <file>」 와 exit 5 다. 기본 호출 회귀(`dma_journal_apply.test.sql`)는 PASS 다.

## 픽스처 행 수 (`supabase/tests/fixtures/29_pre_rename.sql`)

| 표 | KB | KYOBO | 비고 |
|---|---|---|---|
| dma_journal_cursor | 1 | 1 | KB (e29-kb, 5 · 전략 e29-kb-s, 2) / KYOBO (e29-ky, 3 · 전략 NULL, 0) |
| dma_journal_events | 5 | 3 | `dma_journal_apply` 실경로 |
| dma_account_orders | 2 | 1 | 0000290001 전량 · 0000290002 부분 / 0000290101 부분 |
| dma_account_access | 1 | 1 | + 대조군 KB121 d29kb …0021 1행 |
| dma_strategy_events | 2 | 0 | 시세 kind 2 · 주문 kind 3 |
| dma_credentials | 1 | 0 | gateway 생략 → 기본값 'KB' |
| dma_gateway_identities | 0 | 1 | (KYOBO, d29ky) |

## 러너 새 옵션 사용 예

```bash
bash scripts/verify-dma-orders-price-check.sh \
  --with supabase/tests/fixtures/29_pre_rename.sql \
  --with supabase/deploy-window/29/01_gateway_key_rename.sql \
  --test supabase/tests/gateway_key_rename.test.sql
```

## Task Commits

1. **Task 1: 트레이서 — 러너 `--with` · 옛 키 픽스처 → 개명 SQL → 저널 이어 적용** — `068f3836` (feat)
2. **Task 2: 가시성 v2 · 롤백 역개명 · 왕복 · v2 매트릭스** — `77661705` (feat)

## Verification

| 검사 | 결과 |
|---|---|
| gateway_key_rename.test.sql (fixture → 01) | 20/20 · `# RESULT: PASS` |
| gateway_key_rename_revert.test.sql (fixture → 01 → 02 → revert) | 21/21 · `# RESULT: PASS` |
| dma_visibility_v2.test.sql (02) | 19/19 · `# RESULT: PASS` |
| 러너 기본 호출 회귀 dma_journal_apply.test.sql | `# RESULT: PASS` |
| 음성 대조: 개명 없이 rename 테스트 | not ok 18 · exit 1 |
| 음성 대조: v2 없이 v2 테스트 | not ok 9 · exit 1 |
| 음성 대조: 역개명 없이 revert 테스트 | not ok 16 · exit 1 |
| `--with` 없는 파일 / 실패 SQL | exit 2 / exit 5 + 「ERROR: --with 적용 실패」 |
| `ls supabase/migrations \| grep -E 'gateway_key_rename\|visibility_v2'` | 비어 있음(배포 창 SQL 이 push 경로 밖) |
| AC grep: 개명 7줄 · lock_timeout · `--with` 8 · 역개명 7줄 · 뷰 재정의 · `dma_app_access_map()` · `FROM anon, authenticated` | 전부 PASS |

Tracer gate: Task 1 의 `<verify>` 를 커밋 직전 내용으로 다시 돌려 통과한 뒤 Task 2 로 넘어갔다(end-of-phase · automated-only).

## Deviations from Plan

### 자동 보완

**1. [Rule 2 - 누락 보완] 픽스처에 새 키 KB121 대조군 행 추가**
- **발견:** Task 2
- **문제:** must_have 「롤백은 새 키(KB121 · KYOBO127) 행을 남긴다」 를 단언할 행이 없었다. 플랜의 verify 명령(`--with` 체인)이 고정이라 별도 픽스처를 끼울 수 없었다.
- **수정:** `29_pre_rename.sql` 에 `dma_account_access (KB121, d29kb, …0021)` 1행을 넣었다. rename 테스트와 revert 테스트가 둘 다 이 행이 바뀌지 않았다고 단언한다(rename 19 → 20단언).
- **커밋:** `77661705`

**2. [경미] 픽스처 `dma_strategy_events` 1행 → 2행**
- 시세(kind 2) · 주문(kind 3) 이벤트를 모두 개명 대상으로 덮으려고 2행으로 했다. 단언 기준표는 픽스처 머리 주석이 정본이다.

**3. [실행 환경] master 브랜치 커밋**
- `git.base-branch --is-protected master` = true 이지만, 오케스트레이터가 sequential executor 로 main 작업 트리 · master 커밋을 명시했다(프로젝트 관례 — 메모리 「작업은 master 에서」). 경로를 지정해 stage 했고 push 는 하지 않았다.

## Issues Encountered

없음 — 세 pgTAP 모두 첫 실행에 green 이었고, 음성 대조로 공허한 테스트가 아님을 확인했다.

## Next Phase Readiness

- 29-25 런북: 옛 relay 정지 → `deploy-window/29/01` · `02` 를 새 버전 번호로 `supabase/migrations/` 에 옮겨 push → 새 relay. 롤백은 새 relay 정지 → `rollback/29-gateway-key-rename-revert.sql` 수동 실행 → 옛 relay.
- 29-24 README: KYOBO127 활성화 전 커서 시드 절차(Pitfall 2) — 개명 SQL 머리 주석이 그 README 를 가리킨다.

## Self-Check: PASSED

- FOUND: 생성 7개 · 수정 1개 파일 전부 존재
- FOUND: 068f3836 · 77661705 (HEAD 조상)
- `supabase/migrations/` 에 배포 창 SQL 없음
