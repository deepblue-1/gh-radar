---
phase: 32-account-axis
plan: 14
subsystem: relay
tags: [relay, deploy, vercel, strategy-sweeper, inbox, vi, live-uat]

requires:
  - phase: 32-account-axis
    provides: "32-11~32-13 — relay VI 슬롯 캐시(소유키 · 계좌 · 거래소) · vi.slot 계약 · 웹 단일 칸 VI 상태 제거"
provides:
  - "relay 프로덕션 = 7794dcd9(웨이브 ④ + strategy-sweeper n 프레임 수정) · 롤백 태그 55459fe5"
  - "webapp 프로덕션 = push df038c32..7794dcd9 · Vercel dpl_35D8jypqKXavte1jntVLg6BMHvEP(trade.jx1.io)"
  - "옛 서버 전략 끄기(strategy-sweeper)가 21 답 n 프레임에서 대상 계좌 슬롯을 모으는 수정(RED 17c9c4fd · GREEN 6a3067f7)"
  - "닫힌 인박스 노트 261016-vi-per-account.md(status done · done_commit eb2c36bb · 회신 절)"
  - "라이브 UAT ①~⑥ 통과 기록(교보119 VI 계좌별 실증)"
affects: []

actuals:
  tokens: 3000
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "21 답 n 프레임의 끝은 다음 요청의 64 로 잡는다 — 조회를 21(KRX) · 21(NXT) · 24 로 보내고 슬롯(계좌|거래소) 키로 61 을 모은다"

key-files:
  created: []
  modified:
    - relay/src/dma/strategy-sweeper.ts
    - relay/tests/strategy-sweeper.test.ts
    - .planning/phases/32-account-axis/deferred-items.md
    - docs/inbox/from-gh-trade/261016-vi-per-account.md

key-decisions:
  - "D-17 = slot-only: 브라우저 계약은 vi.slot 만 쓰고 구 vi 병합 프레임은 중단한다(사용자 결정). 배포~push 사이 약 2분 열린 옛 탭은 새로고침 전까지 VI 「모름」"
  - "relay 를 20:00 KST 전(NXT 애프터마켓 중 · 19:01 KST)에 배포 — 사용자 명시 지시(「준비되는 대로 바로」). 플랜의 「20:00 KST 이후」보다 사용자 지시가 우선, 롤백 태그 55459fe5 확보 뒤 진행"
  - "strategy-sweeper 결함은 같은 배포에 묶어 고침(사용자 승인 「같이 고침」) — 별도 후속으로 미루면 옛 서버에 켜진 VI 가 남을 수 있음"
  - "gh-trade 세션 SendMessage 회신은 보내지 않았다 — 정본 채널인 인박스 노트 회신 절이 전한다"

patterns-established:
  - "배포 플랜 SUMMARY 에 relay 태그 · 롤백 태그 · push 범위 · Vercel 배포 ID · push 에 같이 실린 남의 커밋을 함께 적는다"
  - "조용한 ok 금지: 판정 불가(거래소 미응답 · 파손 61)는 단계 시한 timeout → ok:false"

requirements-completed: [AXIS-01]

coverage:
  - id: D1
    description: "relay 웨이브 ④ 배포 — 이미지 7794dcd9 · smoke 전 INV 통과(INV-9 · 10 건너뜀) · relay_docker 102줄 오류 · 스키마 위반 0건 · KB120 · KYOBO119 adminConns ready"
    requirement: AXIS-01
    verification:
      - kind: other
        ref: "bash scripts/smoke-relay.sh · healthz · Cloud Logging relay_docker"
        status: pass
    human_judgment: false
  - id: D2
    description: "strategy-sweeper 21 답 n 프레임 수정 — 대상 계좌 슬롯 수집 · 구 서버 호환 · 판정 불가 시 timeout 실패"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "relay/tests/strategy-sweeper.test.ts 32-14 (a) · (a') · (b) · (c) · (d) · (e) · (f)"
        status: pass
    human_judgment: false
  - id: D3
    description: "병합 트리 사전 게이트 — shared 빌드 · relay + webapp 타입체크 0 오류 · relay vitest 57 파일 1624 통과 · webapp vitest(layout · lib · me) 70 파일 1539 통과(1 skip) · playwright sidebar-tree + me 46 통과"
    verification:
      - kind: unit
        ref: "relay · webapp vitest · playwright sidebar-tree · me"
        status: pass
    human_judgment: false
  - id: D4
    description: "webapp push df038c32..7794dcd9 · Vercel dpl_35D8jypqKXavte1jntVLg6BMHvEP Ready(19:03 KST) · trade.jx1.io alias"
    requirement: AXIS-01
    verification:
      - kind: other
        ref: "git push origin master · Vercel 배포 Ready"
        status: pass
    human_judgment: false
  - id: D5
    description: "라이브 UAT ①~⑥ — 교보119 계좌 KRX · NXT VI 행 · KB 계좌와 동시 가동 · 사이드바 계좌 묶음 VI · /me 현황 VI · 한쪽 끄기 · WinForms VI 창 두 계좌"
    requirement: AXIS-01
    verification:
      - kind: manual_procedural
        ref: "trade.jx1.io 사용자 확인 2026-10-16 — 「다 잘돼」"
        status: pass
    human_judgment: true
    rationale: "실서버 gh-trade 3대와 실계좌 · WinForms 클라이언트가 필요하다 — 웹 E2E 하네스는 단일 세션이다"
  - id: D6
    description: "인박스 261016-vi-per-account.md 닫기 — status done · done_commit eb2c36bb · 회신 절(relay 태그 · 질문 2개 답 · 확인 결과)"
    requirement: AXIS-01
    verification:
      - kind: other
        ref: "NOTE_CLOSED 확인 · 경로 지정 커밋"
        status: pass
    human_judgment: false

duration: 메인 세션 진행
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 14: 웨이브 ④ relay 배포 · sweeper 수정 · 교보119 실증 · 인박스 닫기 Summary

**VI 계좌별(웨이브 ④)이 프로덕션에 나갔다. 순서는 relay 7794dcd9 → smoke 통과 → push df038c32..7794dcd9 → Vercel dpl_35D8jypqKXavte1jntVLg6BMHvEP 이다. 배포 전에 옛 서버 계좌 전략 끄기(strategy-sweeper)의 21 답 n 프레임 결함도 고쳤다. 교보119 실증 6항목은 사용자 확인으로 통과했고 인박스 노트는 done 으로 닫았다.**

## Accomplishments

- **relay 배포(Task 1):** 이미지 `7794dcd9` 를 detached worktree 에서 빌드해 2026-10-16 19:01 KST 에 배포했다. smoke-relay.sh 는 전 INV 가 통과했다(INV-9 · 10 은 비밀값이 필요해 건너뜀). 배포 뒤 `relay_docker` 는 102줄에 오류 · 스키마 위반 0건이고, healthz 의 adminConns 는 KB120 · KYOBO119 모두 ready 다.
- **strategy-sweeper 수정(배포 전 deviation):** 21 답이 n 프레임인 새 서버에서 대상 계좌의 켜진 VI 를 놓치던 결함을 고쳤다(RED `17c9c4fd` · GREEN `6a3067f7` · docs `80bcee0b`).
- **webapp push(Task 2):** smoke 직후 `df038c32..7794dcd9` 를 push 했고 Vercel 이 19:03 KST 에 Ready 가 됐다.
- **실증 · 인박스(Task 3):** human-check ①~⑥ 이 전부 통과했다. 인박스 노트를 `status: done` · `done_commit: eb2c36bb` 로 닫았다.

## 배포 기록 (Task 1 · 2 · 메인 세션)

| 항목 | 값 |
|------|-----|
| relay 이미지 태그 | `7794dcd9` (Phase 33 작업을 origin 에서 합친 머지 커밋 = push HEAD) — detached worktree 에서 빌드 · 배포 |
| 롤백 태그 | `55459fe5` (직전 라이브 APP_VERSION) |
| relay 배포 시각 | 2026-10-16 19:01 KST — NXT 애프터마켓 중, 사용자 명시 지시(「준비되는 대로 바로」) |
| healthz | adminConns KB120 · KYOBO119 ready |
| smoke-relay.sh | 전 INV 통과 (INV-9 · 10 은 비밀값 필요로 건너뜀) |
| Cloud Logging `relay_docker` | 배포 뒤 102줄 · 오류 · 스키마 위반 0건 |
| push | `df038c32..7794dcd9` (smoke 직후 약 2분 간격) |
| Vercel | `dpl_35D8jypqKXavte1jntVLg6BMHvEP` Ready 19:03 KST · trade.jx1.io alias |

**push 에 같이 실린 다른 세션 커밋:** Phase 33 세션 커밋(리뷰 수정 · 사이드바 메뉴)이 origin/master 에서 머지되어 함께 나갔다.

**배포 순서 전제:** gh-trade 서버 3대는 사용자 말로 이미 배포돼 있어 순서 (b) 의 전제(서버 배포 뒤 webapp push)가 충족됐다. 그래서 relay → webapp push 를 바로 이어서 했다.

### 병합 트리 사전 게이트

- shared 빌드 통과, relay + webapp 타입체크 0 오류
- relay vitest 57 파일 1624 통과
- webapp vitest(layout · lib · me) 70 파일 1539 통과 · 1 skip
- playwright sidebar-tree + me 46 통과

## strategy-sweeper n 프레임 수정

- **결함:** sweeper 는 거래소마다 21 을 보내고 첫 61 한 프레임을 그 거래소의 답으로 접었다. 새 서버(gh-trade Phase 33)는 21 답이 「선언 계좌마다 61 1프레임 + 선언 밖 등록 슬롯」 이라, 끌 대상 계좌의 슬롯이 첫 프레임이 아니면 켜진 VI 를 못 보고 `ok` 로 끝났다. 옛 서버에 VI 가 켜진 채 남을 수 있는 안전 결함이다.
- **설계:** 조회마다 21(KRX) · 21(NXT) · 24 를 보내고 **64 를 두 21 답의 끝**으로 쓴다. 61 은 `parsed.slot`(계좌|거래소) 키로 모아 나중 프레임이 이기고, 대상 계좌의 run 등록본만 11 run:false 로 끈다.
- **가드 둘:** (1) 모든 거래소가 답했을 때만 64 를 끝으로 받는다(앞선 요청의 64 로 창이 일찍 닫히지 않게). (2) 파손 61 이 섞인 창은 쓰지 않는다. 판정 불가면 기존 단계 시한 `timeout` → `ok:false` 로 끝난다. 조용한 ok 는 없다.
- **호환:** 거래소당 61 1프레임인 구 서버도 그대로 동작한다. 와이어 요청 수는 같고 순서만 24 · 21 · 21 → 21 · 21 · 24 다.
- **테스트:** `strategy-sweeper.test.ts` 32-14 (a) · (a') · (b) RED→GREEN, (c) 구 서버 · (d) 남의 64 · (e) 21 무응답 · (f) 파손 61. 요청 순서 단언(`strategy-sweeper` · `order-server-resync`)은 21 · 21 · 24 로 갱신했다. relay 전체 1624 통과.
- **기록:** deferred-items 「32-11 실행 중」 항목을 해결로 갱신했다(`80bcee0b`).

## 라이브 UAT (Task 3 human-check · trade.jx1.io)

사용자 답은 「다 잘돼」(2026-10-16) 이다.

| # | 항목 | 결과 |
|---|------|------|
| ① | 교보119 계좌 KRX · NXT VI 행 · 켜면 가동 | 통과 |
| ② | KB 계좌 VI 행 따로 · 동시 가동 | 통과 |
| ③ | 사이드바 KB · 교보 묶음 각각 「VI」 | 통과 |
| ④ | /me 교보 칩 → 현황 VI 「가동」 | 통과 |
| ⑤ | 한쪽 끄기 · 다른 쪽 그대로 | 통과 |
| ⑥ | WinForms VI 창 두 계좌 각자 켜짐 | 통과 |

## Task Commits

1. **Task 1: relay ④ 배포** — 코드 커밋 없음(배포 작업). 배포 이미지 = 머지 커밋 `7794dcd9`.
2. **Task 2: webapp push** — 코드 커밋 없음. push `df038c32..7794dcd9`.
3. **Task 3: 인박스 닫기** — `948f26b2`(docs: 회신 절 · status done · done_commit `eb2c36bb`).
4. **Deviation 코드:** `17c9c4fd`(RED) · `6a3067f7`(GREEN) · `80bcee0b`(docs).

## Deviations from Plan

**1. [사용자 지시] relay 를 20:00 KST 전에 배포**
- 플랜은 20:00 KST 이후 배포다. 사용자가 「준비되는 대로 바로」 로 명시 지시해 19:01 KST(NXT 애프터마켓 중)에 배포했다.
- 롤백 태그 `55459fe5` 를 확보했고 healthz · smoke · Cloud Logging 이 모두 정상이었다. 순서(relay 먼저 · push 나중)는 지켰다.

**2. [사용자 승인] strategy-sweeper n 프레임 결함을 같은 배포에 묶어 수정**
- 플랜 범위 밖 코드 변경이다. 사용자가 「같이 고침」 으로 승인했다. RED → GREEN 순서와 전체 relay 회귀를 지켰다.

**3. [순서 단축] gh-trade 회신 후 대기 없이 push**
- gh-trade 서버 배포는 이미 끝나 있었다(사용자 진술). 그래서 relay 배포 회신 뒤 서버 배포를 기다리지 않고 smoke 직후 push 했다. 약 2분 동안 열려 있던 옛 탭은 slot-only(D-17) 때문에 새로고침 전까지 VI 가 「모름」 으로 보인다.

**4. gh-trade SendMessage 회신 생략**
- 정본 채널인 인박스 노트 회신 절이 relay 배포 태그 · 질문 2개 답 · 확인 결과를 전한다.

## Issues Encountered

없음.

## Deferred (범위 밖 · deferred-items.md)

- **P31-3 「777주」 ≠ 「비교가격 필요」**(trading-workbench.spec): quick 261012 부터 있던 결함. 이번 플랜에서 고치지 않았다.
- **드로어 실제 폭 = 뷰포트 75%:** shadcn `data-[side=left]:w-3/4` 가 이기는 기존 동작.

## Known Stubs

없음.

## User Setup Required

None.

## Next Phase Readiness

- 웨이브 ④ 가 프로덕션에 있고 인박스 노트가 닫혔다. Phase 32 의 계획 플랜은 이 플랜으로 끝난다.
- relay 라이브 버전은 `7794dcd9`, 롤백 태그는 `55459fe5` 다.

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*

## Self-Check: PASSED

- 커밋 `7794dcd9` · `55459fe5` · `17c9c4fd` · `6a3067f7` · `80bcee0b` · `948f26b2` · `eb2c36bb` · `df038c32` 가 `git cat-file -e <hash>^{commit}` 로 존재 확인됨
- 인박스 노트 `docs/inbox/from-gh-trade/261016-vi-per-account.md` 에 `## 회신` 절 · `status: done` · `done_commit: eb2c36bb`
- STATE · ROADMAP · REQUIREMENTS 미변경(오케스트레이터 몫)
