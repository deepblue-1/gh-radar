---
phase: 26-shared-quote-feed
plan: 13
subsystem: ui
tags: [mockup, status-bar, quote-feed, relay, webapp, d-01, d-04, d-11, d-14, d-15]

requires:
  - phase: 26-12
    provides: "webapp RelayConnectionState.quoteState · subLimit(최신 1건 · 초기 null) — 목업의 입력 모델"
provides:
  - "배지 2축(「시세」 · 「주문」) 채택안 = 안 B 점형 — 목업 reference/quote-badge-mockup.html 머리 주석에 박제"
  - "26-14 정본 목록 — 시세 필 문구(모름 · live · down) · 주문 필 문구(ready · connecting 새 상수) · 톤 토큰 · 구독 한도 표시 · 폰 폭 줄바꿈 규칙"
affects: [26-14 webapp 시세 배지 구현, packages/shared RELAY_STATE_LABELS.connecting]

actuals:
  tokens: 26780
  tasks: 3
  commits: 1
plan_head_before: 30c4d4d3acbcdbf7c59ffe7cd7ba5f88489cf5ae

tech-stack:
  added: []
  patterns:
    - "UI 게이트: standalone HTML 목업 → checkpoint:decision → 채택 뒤에만 커밋 · 탈락안은 data-rejected=\"true\" 로 보존"

key-files:
  created:
    - .planning/phases/26-shared-quote-feed/reference/quote-badge-mockup.html
  modified: []

key-decisions:
  - "D-14 채택: 안 B 점형(「● 시세」 · 「● 주문」 · 끊김일 때만 「HH:MM:SS~ 멈춤」) · 2026-10-01 · 수정 없음"
  - "RELAY_STATE_LABELS.connecting 상수는 중립 「서버 연결 중…」 — 주문 필 접두 「주문」 과 합쳐 「주문 서버 연결 중…」 으로 읽힘 · 접두 생략 예외 규칙 없음(메모 ① (b))"
  - "브라우저 소켓 재연결 중 시세 필은 마지막 quoteState 값을 유지 — 회색 「시세 —」 로 낮추지 않음(메모 ②)"
  - "구독 한도는 칩 없이 시세 필 title/tooltip 만 · 스토어는 subLimit 최신 1건(메모 ③)"
  - "My page 점도 작업대와 같은 톤 점(--led-armed / --flat 점멸 / --destructive)(메모 ④)"
  - "폰 폭 360px 에서 시세 끊김이면 오른쪽 묶음이 둘째 줄로 내려가는 것을 허용 동작으로 둔다 — 필은 nowrap 단위, 잘림 · 말줄임 없음"

patterns-established:
  - "상태 축 톤: 정상 --led-armed · 진행/꺼짐 --flat · 끊김 --destructive · 접두 --muted-fg — 가격 방향 --up 을 상태에 쓰지 않는다"

requirements-completed: []

coverage:
  - id: D1
    description: "배지 2축 목업 한 장(두 상태줄 복제 · 안 A/B · 라이트/다크 × 상태 5종 · 폰 폭 360px · 프레임→필 매핑)"
    verification:
      - kind: other
        ref: "Task 1 <verify> grep — data-variant 46개 · --led-armed · --destructive · 「주문 서버 연결 중」 · 「이후 갱신 없음」 · 「구독 한도」 · 360px"
        status: pass
    human_judgment: true
    rationale: "시각 비교 목업 — 모양의 적정성은 사용자가 Task 2 에서 직접 보고 안 B 를 골랐다"
  - id: D2
    description: "채택안(안 B) 박제 — 머리 주석 「채택: 안 B · 2026-10-01 · 수정: 없음」 · 26-14 정본 목록 · 안 A 행 data-rejected=\"true\" · 게이트 뒤 커밋"
    verification:
      - kind: other
        ref: "Task 3 <verify> — grep -Eq '채택: 안 [AB]' && ! grep -q '채택: (미정)' && git status --porcelain(빈 출력)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-01
status: complete
---

# Phase 26 Plan 13: 배지 2축 목업 · 채택안 박제 Summary

**`/trading` 과 My page 상태줄의 「시세」 · 「주문」 2축 배지는 안 B 점형으로 정했다. 정상이면 「● 시세」 「● 주문」 만 보이고, 시세가 끊기면 「● 시세 09:41:52~ 멈춤」 이 적색으로 뜬다. 구독 한도는 시세 필 title 에만 나온다. 이 결정은 목업 머리 주석에 26-14 정본 목록으로 적어 두고 커밋했다.**

## Performance

- **Duration:** 이어받은 실행(Task 3 + 마무리) 약 5분. Task 1 목업 작성과 Task 2 사용자 검토는 앞선 실행에서 끝났다
- **Started:** 2026-09-30T15:27:31Z (이어받은 실행 기준)
- **Completed:** 2026-10-01 (KST)
- **Tasks:** 3/3 (Task 1 목업 · Task 2 checkpoint:decision · Task 3 박제)
- **Files modified:** 1 (신규)

## Accomplishments

- 목업 한 장을 만들었다. 두 상태줄(WorkbenchStatusBar · MeStatusBar)을 복제하고 안 A/B × 라이트/다크 × 상태 5종, 폰 폭 360px, 프레임→필 매핑 표를 담았다(data-variant 46개).
- 사용자가 2026-10-01 안 B 점형을 골랐고 수정 요청은 없었다. 세부 사항은 메모 ①~⑤ 권장 기본값을 따른다.
- 채택 내용과 26-14 정본 목록을 목업 머리 주석에, 채택 배너를 본문 상단에 기록했다. 탈락한 안 A 행 22개는 지우지 않고 `data-rejected="true"` 로 표시해 남겼다. 매핑 표의 connecting 행은 메모 ① (b) 로 고쳤다.
- 목업은 게이트를 통과한 뒤에만 커밋했다. 커밋에는 이 파일 하나만 들어갔다.

## 26-14 정본 목록 (안 B)

목업 머리 주석의 「26-14 정본 목록」 블록이 원본이다. 아래는 같은 내용이다.

**시세 필** (`data-slot="workbench-quote"`, WorkbenchStatusBar · MeStatusBar 공통, 주문 필 앞에 둔다)

| 입력 | 문구 | 톤 |
|---|---|---|
| `quoteState === null` (모름) | 시세 필을 그리지 않는다(주문 필만) | — |
| `{s:"live"}` | 「● 시세」 (상태어 없음) | 점 `--led-armed` |
| `{s:"down", since}` | 「● 시세 **HH:MM:SS~ 멈춤**」 (KST) | 점 · 상태어 `--destructive`, 접두 「시세」 `--muted-fg` |
| `{s:"down"}` (since 없음) | 「● 시세 **멈춤**」 | 같음 |

- 시세가 down 이어도 호가 · 체결 숫자는 흐리게 하거나 비우지 않는다(D-04, isStale 불변).
- 브라우저 소켓 재연결 중에도 마지막으로 받은 quoteState 를 그대로 보여 준다. 회색 「시세 —」 로 낮추지 않는다.

**주문 필** (기존 `workbench-dma` 자리, 접두 「DMA」 → 「주문」)

| status | 문구 | 톤 |
|---|---|---|
| `ready` | 「● 주문」 (상태어 없음) | 점 `--led-armed` |
| `connecting` (또는 idle 첫 페인트) | 「● 주문 **서버 연결 중…**」 | 점 `--flat` 점멸 |
| `reconnecting` 등 기타 | 「● 주문 **{RELAY_STATE_LABELS[status]}**」 | 점 `--flat` (진행 상태면 점멸) |

- `RELAY_STATE_LABELS.connecting` 상수는 **「서버 연결 중…」** 으로 바꾼다(지금은 「시세 서버 연결 중…」). 화면에는 접두와 합쳐 「주문 서버 연결 중…」 으로 보인다. 접두를 생략하는 예외 규칙은 두지 않는다.

**톤 토큰** (상태 축에만 쓴다): 정상 `--led-armed` · 진행/꺼짐 `--flat` · 끊김 `--destructive` · 접두 `--muted-fg`. 가격 방향 토큰 `--up` 은 쓰지 않는다. My page 점도 같은 톤을 쓴다(지금은 늘 회색).

**구독 한도** (`subLimit` 최신 1건): 칩은 없고 시세 필 title/tooltip 에만 나온다.
- `scope:"user"` → 「구독 한도 — 내 구독 종목이 200개에 닿아 {종목}({코드} · {거래소}) 시세를 받지 못했어요. 쓰지 않는 카드를 닫으면 다시 받을 수 있어요.」
- `scope:"global"` → 「구독 한도 — 시세 공유 연결이 전체 2000종목에 닿아 {종목}({코드} · {거래소}) 시세를 받지 못했어요. …」

**폰 폭 줄바꿈 규칙** (뷰포트 360px, 상태줄 344px): 필과 배지는 각각 `white-space:nowrap` 단위다. 그래서 줄은 필 사이에서만 바뀌고 글자는 잘리지 않는다. 정상이면 한 줄에 들어간다. 시세가 끊겨 「~ 멈춤」 이 붙거나 긴 77 배지가 있으면 오른쪽 묶음(알림음 · 반영 시각)이 둘째 줄 오른쪽 끝으로 내려간다. 이것은 허용 동작이며 말줄임이나 숨김은 쓰지 않는다. 단 수 세그먼트는 지금처럼 폰 폭에서 DOM 에서 빠진다.

## Task Commits

1. **Task 1: 배지 2축 목업 한 장** — 커밋 없음(D-14 게이트 전이라 일부러 커밋하지 않음. Task 3 커밋에 포함)
2. **Task 2: D-14 목업 검토(checkpoint:decision)** — 사용자 답: 안 B, 수정 없음
3. **Task 3: 채택안 박제** — `f5e1bfce` (docs)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `.planning/phases/26-shared-quote-feed/reference/quote-badge-mockup.html` — 배지 2축 목업. 머리 주석에 채택 기록과 26-14 정본 목록, 본문에 채택 배너, 안 A 행 `data-rejected="true"`

## Decisions Made

- 안 B 점형 채택(2026-10-01, 수정 없음). 정상일 때 짧고 이상할 때만 글자가 붙는다.
- 메모 ① (b): connecting 상수를 중립 문구로 바꾼다. connecting 은 브라우저→relay 소켓 첫 연결 시도이고 이 소켓은 시세와 주문을 함께 싣기 때문이다. 예외 규칙 없이 「주문 서버 연결 중…」 으로 읽힌다.
- 메모 ②: 재연결 중에는 시세 필을 마지막 값 그대로 둔다(스토어가 quoteState 를 지우지 않는 26-12 동작과 맞춘다).
- 메모 ③: 안 B 에는 구독 한도 칩이 없다(플랜의 안 B 정의 그대로).
- 메모 ④: My page 점도 작업대와 같은 톤을 쓴다.

## Deviations from Plan

None - plan executed exactly as written.

참고: 플랜의 Task 1 검사는 목업에 「주문 서버 연결 중」 문구가 있는지 grep 한다. 이 문구는 화면 문구(접두 「주문」 + 「서버 연결 중…」)로 그대로 남아 있다. 바뀐 것은 상수 값뿐이고, 이는 머리 주석과 매핑 표에 적어 두었다.

## Issues Encountered

- 이 실행은 `master` 에 직접 커밋했다. `git.base-branch --is-protected master` 는 true 를 돌려주지만, 오케스트레이터가 순차 · 비격리(main tree, master) 실행을 지시했고 사용자 규칙도 「작업은 master 에서」 다. 26-12 도 같은 방식으로 진행했다. 오작동으로 브랜치가 바뀐 경우가 아니라 의도한 동작이다.
- 커밋은 목업 파일 하나를 경로로 지정해 스테이징했다. 다른 세션 산출물(milestone.lock · shots/ · research/.cache)은 건드리지 않았다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 26-14 가 위 정본 목록으로 바로 구현할 수 있다. 할 일은 quotePillOf 문구 · 톤 · 슬롯, 주문 필 접두 변경, `RELAY_STATE_LABELS.connecting` 상수 변경, My page 톤 점이다.
- 26-14 에서 확인할 점: `RELAY_STATE_LABELS.connecting` 을 바꾸면 이 상수를 쓰는 다른 표면(있다면)에서도 문구가 「서버 연결 중…」 으로 바뀐다. 사용처를 grep 해 확인할 것.
- 블로커 없음.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-10-01*

## Self-Check: PASSED
