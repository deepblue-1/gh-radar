---
quick_id: 260911-mrl
slug: phase-16-trade-03-complete
status: complete
date: 2026-09-11
tasks: 3/3
commits: [40e3256, a1e791f, 1960c69]
files_modified:
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/phases/16-trading-limit-chaser-vi-my-page/16-VALIDATION.md
---

# Phase 16 종결 문서 정합 — TRADE-03 Complete 재판정 드리프트

## 무엇이 문제였나

`quick-260910-ogq` 가 2026-09-10 장중 실계좌 실측을 근거로 **TRADE-03 · RELAY-02 를 Pending → Complete** 로 재판정하고 `REQUIREMENTS.md` 를 갱신했다. **그런데 ROADMAP · STATE · 16-VALIDATION 이 따라가지 않았다** — 세 문서가 여전히 「TRADE-03 Pending」·「WinForms 동기화 미관측」이라고 말해 정본과 정면으로 모순됐다.

이 프로젝트가 반복해 온 드리프트 패턴이다(ROADMAP 상단 목록 미갱신 계열).

## 무엇을 했나

| Task | 대상 | 내용 | 커밋 |
|------|------|------|------|
| 1 | `ROADMAP.md` | 상단 목록 L33 의 「TRADE-03 은 Pending 유지」를 Complete 재판정 근거로 교체 + 상세 절에 `**Status:** Complete` 행 추가 | `40e3256` |
| 2 | `STATE.md` | frontmatter(`executing`→`completed`) · Current Position Status 행 · Session Continuity Next 블록 교체 | `a1e791f` |
| 3 | `16-VALIDATION.md` | 역사 블록 뒤에 날짜 있는 후속 절 추가 + Manual-Only 표 첫 행 ✅ 갱신 | `1960c69` |

## 규율을 지킨 지점

- **역사 기록을 덮어쓰지 않았다.** `16-VALIDATION.md` 의 「이 배포가 바꾸지 않는 것 (과장 방지)」 블록과 `STATE.md` 의 2026-09-09 「DMA_HOST 배포 회귀」 절은 **그 시점의 참인 기록**이라 한 글자도 고치지 않고 날짜 있는 후속만 덧붙였다. 실측: 16-VALIDATION 의 `git diff` 삭제 줄은 **1건**이고 그것은 의도한 Manual-Only 표 행 교체다.
- **열린 항목을 닫지 않았다.** smoke `INV-9` 는 `SMOKE_AUTH_TOKEN` 부재로 16-21 재작성 이후 **프로덕션 첫 실행 미수행** 그대로이며, 세 문서 모두에서 열린 항목으로 유지된다. **TRADE-03 조항의 결손이 아니라 프로브의 미실행**이라는 구분도 함께 적었다.
- **과장하지 않았다.** TRADE-03 Complete 의 근거는 `16-VERIFICATION.md` §Human Verification #1 이 애초에 **human-only** 로 지정한 항목에 대한 사용자의 양방향 직접 관찰이다 — 의도된 증거 형태다.
- **소스 코드 diff 0줄.** `git diff --stat -- ':!.planning'` 빈 출력. 포매터 미실행.

## 2026-09-11 에 닫힌 마지막 단서

2026-09-10 관찰 당시 「웹에서 매수전략 OFF → WinForms **메인폼 전략목록에서는 사라지나 종목창 매수주문 체크박스는 미반영**」이 남아 있었다.

- **원인은 gh-trade(WinForms) 클라이언트 측**이다. relay 는 `crud:"D"` 를 정상 전달했고 **그 증거가 메인폼 목록 제거**다. 메인폼 목록은 서버 전략 컬렉션에서 파생되는 뷰라 `D` 하나로 비지만, 종목창 체크박스는 별도 로컬 상태라 제거 이벤트를 반영하지 않았다 — 등록·수정(`C`)은 값이 실려 오니 갱신되는데 **삭제만 「실을 값이 없어」 아무도 안 건드리는** 비대칭이다.
- **사용자가 gh-trade 에서 수정했고 주문 끄기까지 정상 동작을 확인**했다(2026-09-11).
- **gh-radar 웹에는 같은 결함이 없다.** `webapp/src/components/trading/limit-chaser-client.tsx:265-274` 의 `server === null` 분기가 `setResetSeq` 로 폼을 리셋한다 — 철거를 다른 단말에서 받아도 스위치가 꺼진다. 비대칭은 WinForms 쪽에만 있었다.

## 이 quick 이 바꾸지 않은 것

- 요구사항 판정 자체(정본은 `REQUIREMENTS.md` Traceability — `quick-260910-ogq` 가 세움)
- `progress:` 블록의 plan 수치(변화 없음)
- 소스 코드 · 테스트 · 배포 상태
