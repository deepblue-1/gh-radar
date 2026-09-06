---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 20
subsystem: docs
tags: [phase-closure, verification, success-criteria, d-27, safety-gate, smoke, evidence]

# Dependency graph
requires:
  - phase: 15-dma-relay-kb-gh-trade-server-10-wss
    provides: "15-01~15-19 의 전 산출물 — 집계의 증거 원천"
  - plan: 15-07
    provides: "15-VPN-PREFLIGHT.md — D-03 선검증 7항목 결과"
  - plan: 15-19
    provides: "15-MOCK-ORDER-EVIDENCE.md — mock 주문 왕복 실측 기준선"
provides:
  - "15-LIVE-VERIFICATION.md — 실서버 검증 결정(A안 skip-live) + 미접속 실측 + SC-1~SC-8 집계 + 이관 15건"
  - "infra/relay/README.md §Phase 15 종결 상태 — 운영 정본(이미지 SHA·DMA_HOST·VPN 정책·알림·smoke·인증서 익일 재확인)"
  - "15-VALIDATION.md wave_0_complete: true + Status 59행 실행 결과"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "종결 plan 의 집계는 원 plan 의 주장을 인용하지 않고 산출물을 재실행해 확인한다 — 재실행 불가 항목은 출처를 괄호로 명시해 구분 가능하게 남긴다"
    - "안전 게이트(D-27)의 기본 경로는 '하지 않는 것'이며, 미수행 사실 자체를 실측 증거로 남긴다"

key-files:
  created:
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md
  modified:
    - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-VALIDATION.md
    - infra/relay/README.md

key-decisions:
  - "실서버(10.41.1.120)·실계좌 검증은 A안 skip-live — 사용자의 명시 지시가 없어 D-27 의 기본 경로를 따랐다. Claude 가 이 선택을 스스로 뒤집지 않는다"
  - "SC-4~SC-8 을 ⚠(부분 충족)로 남겼다 — mock·스텁으로만 증명된 것을 live-verified 로 승격하지 않는다"
  - "15-10-03 은 실제로 FAIL 이므로 ❌ 로 남겼다(활성 주식 2,749 중 isin NULL 42종목). 억지로 초록으로 만들지 않았다"
  - "STATE.md·ROADMAP.md 는 오케스트레이터 소유라 손대지 않았다 — STATE.md 에 남은 계정 ID 문자열은 제거 대신 이관 항목으로 기록"
  - "REQUIREMENTS.md 의 RELAY-01/02/03 을 Pending 그대로 뒀다 — SC-4~8 이 ⚠ 인 상태에서 Complete 표기는 증거와 어긋난다"

metrics:
  duration: "약 70분"
  completed: 2026-09-06
  tasks: 3
  commits: 1
  files_changed: 3
---

# Phase 15 Plan 20: 실서버 검증 결정 + SC-1~SC-8 집계 Summary

**D-27 안전 게이트를 미수행(A안)으로 닫고, phase 15 의 성공 기준 8개를 산출물 재실행으로 집계했다 — 충족 3 · 부분 충족 5 · 미충족 0. 부분 충족 5건의 병목은 사실상 하나(`dma_credentials` 0행)이며, 이관 항목 15건을 하나도 버리지 않고 남겼다.**

## Performance

- **Duration:** 약 70분
- **Tasks:** 3/3 (Task 1 결정 · Task 2 건너뜀 · Task 3 집계)
- **Commits:** 1 (`964dacd`)
- **Files:** 3 (신규 1 · 수정 2)

## Task 1 — 실서버 검증 여부 결정 (D-27)

**결정: A안 `skip-live`.** 사용자의 명시 지시가 없었다. D-27 은 "실서버 접속과 실계좌 주문은 사용자 지시가 있을 때만"이므로 지시 부재 시의 기본 경로는 미수행이며, executor 가 이 선택을 스스로 뒤집지 않는다.

선행 조건 4가지 중 **1(VPN 선검증)만 충족**이고, 2(gh-trade 17 배포)·3(users.toml user_id)은 미확인, 4(`dma_credentials` 매핑)는 **0행으로 미충족**이다. 즉 A안은 소극적 선택이 아니라 현재 유일하게 가능한 선택이었다 — B/C안을 골랐어도 server allowlist 가 `403 DMA_NOT_ALLOWED` 로 끊는다.

## Task 2 — 건너뜀. 미접속을 실측으로 남겼다

"안 했다"를 주장이 아니라 증거로 남겼다(전부 2026-09-06 실측):

| 확인 | 결과 |
|------|------|
| `systemctl is-active/is-enabled openconnect@kb` | `inactive` / `disabled` |
| `ip -br addr show tun0` | `Device "tun0" does not exist.` |
| `ip route show default` | `default via 10.10.0.1 dev ens4` |
| `systemctl list-timers 'kbvpn-*' --all` | `0 timers listed` |
| 컨테이너 `DMA_HOST` | **`127.0.0.1`** (로컬 mock) |
| 컨테이너 env 안 `10.41.1.120` | **0건** (`grep -c` → 0) |
| `dma_credentials` / `dma_orders` 행 수 | **0 / 0** |

env 조회는 키 이름 또는 지정 키 하나만 뽑았다 — 넓은 패턴 grep 은 `DMA_CRED_KEY` 값을 화면에 띄운다(15-08 에서 실제 발생한 사고).

## Task 3 — SC-1~SC-8 집계 + 문서 갱신 (`964dacd`)

### 집계 결과: ✅ 3 / ⚠ 5 / ❌ 0

| SC | 상태 | 핵심 증거 |
|----|------|-----------|
| SC-1 워크스페이스·생성물 | **✅** | `--check` exit 0 (신규·변경 0 / 삭제 없음) · `relay/src/generated` 42파일 |
| SC-2 VM·IP·방화벽·VPN 선검증 | **✅** | `radar-gw` RUNNING · 방화벽 정확히 3규칙 · 고정 IP 2개 `IN_USE` · 선검증 7항목 통과(시도 1/3) |
| SC-3 코덱·LivePing·백오프 | **✅** | relay 13 files / **202** tests — codec 15 · envelope 57 · dma-client 11 · session 9 · session-manager 8 · fake-gateway 12 |
| SC-4 wss 인증·allowlist·구독 | **⚠** | INV-6 운영 실측(4401 × 2) · `TAPE_BATCH_MS=200` · `SESSION_GRACE_MS=300_000`. **allowlist positive 경로는 스텁으로만** |
| SC-5 계좌 선언·팬아웃 | **⚠** | `account-declare` 8 · `account-state` 8 (가짜 게이트웨이). **실 와이어에서 `accounts` 수신 미확인** |
| SC-6 주문 릴레이 | **⚠** | server orders 27 · relay order-api 25 · order-store 10 · mock 와이어 실측(A/R rc=105/C, median 3.33ms) · 401 운영 확인. **INV-9·UI 왕복·`dma_orders` 전이·`GET /api/orders` 미증명** |
| SC-7 4탭·호가주문·E2E·Vercel | **⚠** | webapp 45 files / **380** (phase 15 UI 87건) · E2E 스펙 7+9 케이스 · Vercel env Production+Preview · 배포 Ready. **Playwright 15-20 재실행 불가 · 프로덕션 브라우저 관찰 불가** |
| SC-8 컨테이너·스크립트·알림·문서·실서버 금지 | **⚠** | 스크립트 `bash -n` 전부 PASS · 알림 정책 live `enabled=True` · smoke-relay 11/0/2 · smoke-server 14/0/0 · **실서버 접속 0**. **STATE.md 에 계정 ID 잔존 1건** |

### ⚠ 5건의 병목은 사실상 하나다

`dma_credentials` **0행**. 이 행이 allowlist(D-12)이므로 없으면 인증된 요청도 server 의 `isDmaAllowed` 에서 끊긴다. 그 결과 4건이 한꺼번에 미증명으로 남는다 — relay 도달성(`409 SESSION_NOT_READY`, INV-9) · 브라우저 UI 주문 왕복 · `dma_orders` status 전이 · `GET /api/orders` 목록 복원. **자격증명 행 1개 + 로그인 토큰이면 4건을 한 번에 측정할 수 있다.**

### 문서 갱신

- **`15-LIVE-VERIFICATION.md` (신규)** — §1 결정 · §2 미접속 실측 · §3 SC 집계표 · §4 ⚠ 상세와 해소 조건 · §5 이관 15건 · §6 자체 검증과 재현 명령 · §7 나중에 실서버 검증을 할 때 증명해야 할 것.
- **`15-VALIDATION.md`** — Wave 0 산출물 25종을 `test -f` 로 전수 확인 → `wave_0_complete: true`. Status 59행 갱신(✅57 / ⚠1 / ❌1). 재실행하지 못한 6행은 괄호로 출처와 이유를 명시했다.
- **`infra/relay/README.md`** — `## Phase 15 종결 상태` 절 추가(이미지 SHA · `DMA_HOST` 현재값 · VPN 수동 기동 정책 · 알림 정책 · 방화벽 · smoke 결과 · `--check-isin` FAIL). 인증서 **익일 재확인**(발급 09-05 → 확인 09-06) 기록으로 15-VALIDATION 의 "배포 직후 1회 + 다음 날 1회" 규약을 이행. 이미 해소된 "D-03 선검증을 막고 있는 미충족 전제" 절을 이력으로 정정.

## 검증 — 15-20 이 직접 재실행한 것

| 명령 | 결과 |
|------|------|
| `pnpm typecheck` / `pnpm build` | exit 0 / exit 0 |
| `pnpm --filter @gh-radar/relay test` | 13 files / **202** passed |
| `pnpm --filter @gh-radar/server test` | 30 files / **248** passed (1차 실행은 선재 flake 1건 — 아래) |
| `pnpm --filter webapp test` | 45 files / **380** passed, 1 skipped |
| `pnpm --filter @gh-radar/shared test` | 8 files / **99** passed |
| `pnpm --filter @gh-radar/master-sync test` | 4 files / **36** passed |
| `sync-relay-schema.sh --check` | exit 0 · 신규·변경 0 / 삭제 없음 / `.fbs` 최신 |
| `bash scripts/smoke-relay.sh` | **11 PASS / 0 FAIL / 2 SKIP** |
| `bash scripts/smoke-server.sh <prod>` | **14 PASS / 0 FAIL / 0 SKIP** |
| `bash scripts/smoke-relay.sh --check-isin` | 3 PASS / **1 FAIL** (ISIN-2) |
| 인증서 익일 재확인 | `CN=dma.jx1.io` · Let's Encrypt `CN=YE1` · `notAfter Dec 4 2026` |
| `vercel env ls` production/preview | `NEXT_PUBLIC_RELAY_WS_URL` 양쪽 등재 |
| `vercel inspect` | `dpl_JBH7qdf4Spzwo9eSBQpcN8sbgmxF` `target=production` `● Ready` |
| 비밀 패턴 grep (README + LIVE-VERIFICATION) | **0건** |

## Deviations from Plan

### 1. [계획 대비 축소] STATE.md 를 수정하지 않았다

plan 의 `files_modified` 와 Task 3 action 은 `.planning/STATE.md` 갱신(Current Position · Accumulated Context · Performance Metrics)을 지시하지만, **오케스트레이터가 STATE.md·ROADMAP.md 를 중앙에서 쓰겠다고 지시**했으므로 건드리지 않았다. 기록해야 할 내용은 `15-LIVE-VERIFICATION.md` 와 이 SUMMARY 에 남겼다.

**부작용:** Task 3 의 acceptance 2건이 이 executor 범위에서 판정 불가다.
- `grep -c 'Phase 15' .planning/STATE.md >= 2` — 오케스트레이터 갱신 후 성립할 것.
- 비밀 패턴 grep 0건 — **STATE.md 에서 1건 매치한다**(아래 항목 2).

### 2. [Rule 2 - 발견] STATE.md 에 KB VPN 계정 ID 잔존 — 제거하지 않고 이관

- **발견:** Task 3 acceptance 의 `grep -riE 'kbs124|passwd=|password:'` 를 돌리니 `.planning/STATE.md:344` 에서 1건 매치.
- **성격:** 비밀번호가 아니라 **계정 ID** 다. 그러나 `15-VPN-PREFLIGHT.md` 가 스스로 세운 규율이 "접속 비밀 값·계정 ID·서버 주소·인증서 핀을 기록하지 않는다"이므로 문자열 자체가 규율 위반이다.
- **범위:** `.planning/` 기획 문서 **13개**(STATE·ROADMAP·REQUIREMENTS·CONTEXT·RESEARCH·PATTERNS·DISCUSSION-LOG·VALIDATION·15-05/06/07/19/20-PLAN). discuss/research/plan 단계에서 들어갔다.
- **왜 안 고쳤나:** STATE·ROADMAP 은 오케스트레이터 소유이고, 나머지도 확정된 기획 산출물이라 종결 plan 이 임의 편집할 대상이 아니다. **실제 비밀번호 값은 어디에도 없다**(Secret Manager + VM `/etc/kbvpn.env` 0600).
- **조치:** `15-LIVE-VERIFICATION.md` §4-E · §5-14 로 이관. 별도 quick task 로 마스킹할 것.

### 3. [범위 밖] REQUIREMENTS.md 의 RELAY-01/02/03 을 Pending 그대로 뒀다

SC-4~SC-8 이 ⚠ 인 상태에서 `Complete` 로 올리는 것은 증거와 어긋난다. plan 의 files_modified 에도 없다. `15-LIVE-VERIFICATION.md` §5-15 에 판단 사항으로 이관했다.

### 4. [관측] server 테스트 선재 flake 재현

1차 실행에서 `tests/routes/stock-detail.test.ts` 1건이 5초 타임아웃(30 files / 247 passed), **2차 실행은 30 files / 248 전부 통과**. `deferred-items.md` 의 "server ECONNRESET/타임아웃 flake 잔존"과 같은 계열이다. 15-20 의 변경(문서 3개)과 무관하므로 고치지 않고 기록만 남겼다.

### 5. [해소 확인] shared `THEME_STOCK_SOURCES` 선재 실패는 이미 고쳐져 있었다

`deferred-items.md` 의 15-01 항목이다. `2206bb1 fix(shared): theme source tuple 테스트를 3멤버 현행 계약에 맞춤` 으로 해결됐고, 재실행 결과 shared **8 files / 99 전부 통과**. 이관 목록에서 "해소됨"으로 표기했다.

## Known Stubs

없다 — 이 plan 은 코드를 만들지 않는다. 다만 **phase 전체에는 검증 공백이 있고**, 그것을 스텁으로 감추지 않고 `15-LIVE-VERIFICATION.md` §4 에 미증명 항목으로 열거했다. 특히 SC-4 의 allowlist positive 경로는 **스텁 Supabase**(`webapp/e2e/fixtures/relay.ts`)로만 증명됐으며, 운영 `dma_credentials` 로는 증명되지 않았다.

## Threat Flags

없음 — 신규 네트워크 표면·인증 경로·파일 접근·스키마 변경이 0건이다. 오히려 이 plan 의 산출물은 T-15-28(무단 실서버 접속)이 **발생하지 않았음**을 실측으로 고정한다.

## 오케스트레이터가 이어서 할 일

1. `STATE.md` — Current Position 을 Phase 15 완료로, Accumulated Context §Roadmap Evolution 에 phase 15 결과 한 문단(VM/고정 IP/방화벽 3규칙, VPN 선검증 요약, relay 이미지 `4ba6f83`, mock 검증 범위, **실서버 미검증**, ⚠ 5건), Performance Metrics 에 15-01~15-20 행.
2. `ROADMAP.md` — Phase 15 를 20/20 으로. **성공 기준은 8개 중 3개만 완전 충족**임을 함께 남길 것.
3. `STATE.md:344` 의 계정 ID 문자열 마스킹(같은 문자열이 기획 문서 13개에 있다).
4. `REQUIREMENTS.md` RELAY-01/02/03 의 Pending 유지 여부 판단.

## Self-Check: PASSED

- `15-LIVE-VERIFICATION.md` 존재 — FOUND
- `15-VALIDATION.md` `wave_0_complete: true` — FOUND
- `infra/relay/README.md` §Phase 15 종결 상태 — FOUND
- 커밋 `964dacd` — FOUND (`git log --oneline`)
- SC 집계표 8행 + `SC-8` 7회 등장 — FOUND
- 비밀 패턴 grep (README + LIVE-VERIFICATION) 0건 — FOUND
- `.planning/STATE.md` · `.planning/ROADMAP.md` 무변경 — FOUND (`git status --short` 0줄)
