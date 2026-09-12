---
phase: quick-260912-gyz
plan: 01
subsystem: webapp
tags: [ui, trading, limit-chaser, desktop, mobile, a11y]
status: complete

requires:
  - quick-260911-w5h (상따 모바일 전면 정리 · 헤더 8칸 · 가격 칩 축소)
  - "목업 260912-chaser-desktop.html 「안 A」(사용자 확정)"
provides:
  - "상따 헤더 카드에서 가격 칩 행 제거 (행 자체가 DOM 에 부재)"
  - "감시 대상 세그먼트 = 그 선택지의 호가 방향색 (매도잔량 --down · 매수잔량 --up)"
  - "상따 폼 확대 프로파일 (소제목·라벨·세그먼트 13px · 입력 38px · 체크박스 17px · --lw 76/104)"
  - "헤더 종목정보 8칸의 데스크톱(≥1280) 한 줄 가로 나열 (CSS 전용 분기)"
affects:
  - /trading/limit-chaser/{new,[key]} 한 화면뿐 (데이터·전송·판정 경로 불변)

tech-stack:
  added: []
  patterns:
    - "배치 분기는 CSS 전용 — 같은 JSX 한 벌이 `min-[1280px]:` 로 클래스만 갈아입는다"
    - "모바일 입력 글꼴 16px 하한 (iOS Safari 자동 확대 방지)"
    - "행 최소 높이는 입력 높이를 따른다 (입력 없는 행만 낮으면 세로 리듬이 끊긴다)"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts

decisions:
  - "세그먼트 색 축은 **호가 방향**이지 그룹이 아니다 — 파일 상단 ②-1(색·위치·문구 3중 일치)은 게이트 스위치·매수/매도 탭 규율이고 이 세그먼트는 그 예외임을 양쪽 주석에 박았다"
  - "`--lw` 를 76/104 로 올린 것은 글꼴 확대의 **부수 작업이 아니라 같은 커밋의 필수 조건**이다 — 13px 라벨 4글자 + 체크박스 17px 은 옛 64/88px 에서 조용히 잘린다"
  - "데스크톱 배치는 `min-[1280px]:` CSS 분기 전용 — 조건부 렌더·폭 측정 훅을 만들지 않았다(값 산출 복제 = 폭에 따라 다른 숫자)"
  - "현재가/등락률의 세로 스택(`flex-col items-end`)은 목업이 한 줄 baseline 이지만 **바꾸지 않았다** — 확정 스펙 밖이고 모바일까지 흔든다(플랜 §4 지시 그대로)"
  - "커밋에 `Co-Authored-By` 를 **넣었다** — 플랜은 금지였으나 디스패치 제약과 세션 attribution 지시가 명시 요구했고, 그 지시가 더 나중이자 상위다(아래 「플랜과 어긋난 지점」)"

metrics:
  duration: "약 35분"
  completed: 2026-09-12
  tasks: 2

actuals:
  tokens: 60000
  tasks: 2
  commits: 2
plan_head_before: faa3b93
---

# Quick 260912-gyz: 상따 후속 다듬기 4건 Summary

사용자가 목업(`260912-chaser-desktop.html` 「안 A」)으로 확정한 4건을 구현했다 — **전부 표시
변경**이고 데이터 경로 · 전송 cfg · 무장 판정식은 한 줄도 바뀌지 않았다.

## 태스크별 커밋

| # | 커밋 | 제목 | 테스트 변화 |
|---|------|------|-------------|
| 1 | `b49a5aa` | 가격 칩 행 삭제 + 감시 대상 방향색 + 폼 글자 확대 (①②③) | 63 files/763 → **63 files/767** |
| 2 | `a536474` | 데스크톱 종목정보 한 줄 가로 나열 (④ 안 A) | 767 → **63 files/771** |

기준선 대비 **감소 0 · 새 error 0 · lint warning 정확히 3건 그대로**(`ScannerEmpty` · `_msg` ·
`use-relay-socket` exhaustive-deps).

## 무엇이 바뀌었나

### ① 가격 칩 행 전체 삭제 — `limit-chaser-client.tsx`

`data-slot="lc-price-chips"` 블록과 그 위 설명 주석을 통째로 지웠다. 고아가 된 것을 grep 으로
확인하고 함께 걷었다:

| 심볼 | 처리 | 근거 |
|---|---|---|
| `tickSize` 파생값 | 제거 | 소비처가 칩 하나뿐이었다 |
| `deriveTickSize` import | 제거 | 이 파일의 유일한 소비처가 `tickSize` 였다 |
| `PriceChip` 조각 정의 | 제거 | 호출부가 0 이 됐다 |
| `PriceChip` 위 고아 JSDoc 1줄 | 제거 | 사라진 요소를 설명하는 주석은 다음 사람에게 거짓말이다 |
| `basePrice` · `lowerLimit` · `KRW` · `priceText` · `priceTone` · `QuoteCell` | **유지** | 헤더 8칸과 `OrderbookLadder` 가 계속 쓴다 |

`order-panel.tsx` 의 `deriveTickSize` **정의**와 `stock-orderbook-section` 의 소비는 손대지
않았다(`faa3b93..HEAD` 기준 `order-panel.tsx` diff 0줄).

### ② 감시 대상 세그먼트 = 그 선택지의 방향색 — `limit-chaser-form.tsx`

선택 분기를 선택지별로 갈랐다: `side === '0'`(매도잔량) → `--down-bg`/`--down`,
`side === '1'`(매수잔량) → `--up-bg`/`--up`. 비선택은 그대로 `bg-transparent`·`--muted-fg`,
더티 테두리(`--primary`)는 컨테이너 쪽이라 무수정이다. 근거 두 문장(ⓐ 호가창 색 축과 같은 축
ⓑ 상단 ②-1 은 게이트·탭 규율이라 충돌 아님)을 세그먼트 블록 주석에 남기고, 파일 상단 ②-1 에도
예외 한 문장을 이었다.

전송 회귀는 기존 케이스(「세그먼트 클릭이 `buyWatchSide` 를 cfg 에 반영한다」)가 **무수정 통과**
하는 것으로 잠겼다.

### ③ 폼 글자 확대 — 목업 `.form.big`/`.mform.big` 전수 11종

`--lw` 64/88 → **76/104**, 소제목·`Row` 라벨·`CheckRow` 라벨·세그먼트 버튼 → **13px**(데스크톱
`--t-caption` override 전부 제거), 입력 래퍼·세그먼트 컨테이너·행 최소 높이 → **38px**(데스크톱
높이 override 제거), 체크박스 → **17px**, 단위 → 13/12px.

**★ 모바일 입력 글꼴 16px 은 그대로다.** 데스크톱만 `min-[1280px]:text-[15px]` 로 올렸다.
`NumInput` 주석을 확장해 「이 값이 iOS Safari 자동 확대를 막는 유일한 장치이므로 뒤의 어떤
통일 변경도 내려서는 안 된다」를 못박았고, 단위 테스트가 `text-[16px]` 존재와 `--t-caption`
부재를 함께 단언한다.

`Card` 의 JSDoc 에서 옛 64/88 을 정당화하던 문단(「라벨 11px + 체크박스 16px + gap 3px 이면
4글자가 64px 에 들어간다」)은 **통째로 교체**했다 — 그 문장은 이번 변경 뒤 거짓이다. 새 근거는
13px 라벨 4글자 + 체크박스 17px + gap 이고, 390px 잘림 조건(좌 40% 호가 / 우 60% 폼 · `main`
여백 8px · `--lw:76px` · 입력 16px)을 함께 적었다.

### ④ 데스크톱 종목정보 한 줄 가로 나열 — 「안 A」

컨테이너에 `min-[1280px]:flex flex-wrap items-baseline gap-x-[22px] gap-y-0 px-3.5 py-2` 를
얹고, `QuoteCell` 에 데스크톱 override 3종(`px-0 py-0 text-[12px]` · 라벨 `min-w-0` · 값
`ml-0`)을 더했다. 모바일 클래스는 **한 글자도 바뀌지 않았다.**

- `QuoteCell` 호출 **정확히 8개** · `lc-quote-grid` 슬롯 **정확히 1개** (grep + DOM 단언 양쪽)
- 뷰포트 폭을 JS 로 재는 훅·조건부 렌더 **0개**
- 값·색·포맷 케이스 4건(개수·라벨 순서 / 대시 8개 / 값 8개 / 색 8개) **무수정 통과** — 값 산출이
  안 바뀌었다는 증거다
- 헤더 글꼴은 데스크톱만 확대(종목명 20 · 현재가 22 · 단축코드 12 · 등락률 13px)

## 테스트 — 깨진 것은 새 계약으로 다시 썼다

단언을 지워서 통과시킨 곳이 **0건**이다.

| 기존 케이스 | 처리 |
|---|---|
| 「가격 칩은 기준가 · 호가단위 2개뿐이다」 | **부재 단언으로 재작성** — 편집 진입 + 호가 도착에도 칩 행이 `null` 이고, 같은 케이스가 8칸은 여전히 있음을 함께 단언 |
| 「카드 크롬은 … `--lw` 가 64/88 로 갈린다」 | 76/104 로 재작성 + 옛 값 부재 단언 추가 |
| 「입력 치수가 모바일 36 · 데스크톱 32px …」 | 38px 단일 + 16/15px 로 재작성, 데스크톱 높이 override 부재까지 단언 |
| 「체크박스가 모바일 16 · 데스크톱 18px」 | 17px 단일로 재작성 |
| ④ 신규 진입 칩 부재 · 8칸 값/색/대시 4건 · 더티 테두리 · 전송 cfg 회귀 | **무수정 통과** |

새로 더한 케이스: 세그먼트 방향색 2건(양방향) · 13px 글꼴 4요소 1건 · 단위 글꼴 1건 ·
데스크톱 배치 3건 · 헤더 글꼴 1건.

## e2e — 고쳤을 뿐, 통과를 본 것이 아니다

`trading-limit-chaser.spec.ts` 테스트 2 의 칩 텍스트 단언(`상한가 {값}`)은 직전 quick 이 상한가
칩을 걷은 시점부터 **이미 거짓**이었다(Playwright 를 안 돌려서 드러나지 않았을 뿐이다). 삭제하지
않고 **살아 있는 표면으로 옮겨** 다시 썼다 — 칩 행은 `toHaveCount(0)`, 대신 `lc-quote-grid` 가
「상한」 라벨과 `LIVE_UPPER_LIMIT` 를 함께 담는다. 의도(폼과 화면이 같은 상한가를 말한다)는
유지된다. 테스트 1 의 부재 단언은 남기고 전제 주석만 「행 자체를 없앴다」로 고쳤다.

**Playwright 는 실행하지 않았다** — `pnpm -C webapp typecheck`(`tsconfig.e2e.json` 포함) 통과로만
확인했다.

## 검증 결과

| 게이트 | 기준 | 결과 |
|---|---|---|
| `pnpm -C webapp test` | 63 files · ≥763 passed · skipped 1 | **63 files · 771 passed · 1 skipped** ✅ |
| `pnpm -C webapp lint` | Warning 정확히 3 · Error 0 | **3 / 0** ✅ |
| `pnpm -C webapp typecheck` | exit 0 | **0** ✅ |
| `pnpm -C webapp build` | exit 0 | **0** ✅ |
| 칩 슬롯 · `PriceChip` · `order-panel` import | 각 0건 | **0 / 0 / 0** ✅ |
| `var(--down-bg)` · `[--lw:76px]` · `min-[1280px]:[--lw:104px]` | ≥1 / 1 / 1 | **2 / 1 / 1** ✅ |
| `<QuoteCell` · `lc-quote-grid` | 8 / 1 | **8 / 1** ✅ |
| `quote-format.ts` · `limit-chaser.ts` · `order-panel.tsx` diff | 0줄 | **0줄** ✅ |
| 커밋 | 태스크당 1개 · 한글 | **2개, 전부 한글** ✅ |

## ⚠️ 미검증 항목 (플랜이 지정한 4가지)

1. **390px 에서 `10,000,000` + 단위가 안 잘리는가** — jsdom 에는 레이아웃이 없어 단위 테스트가
   증명할 수 없다. 근거는 목업이 그 폭에서 실제로 렌더해 확인한 것뿐이다(좌 40% 호가 / 우 60%
   폼 · `AppShell main` 여백 8px · `--lw:76px` · 입력 16px). **실기기 확인이 남는다.**
2. **1152px 에서 8칸이 한 줄에 들어가는가** — 같은 이유. 클래스 단언은 「그 유틸이 붙어 있다」를
   잠글 뿐 「실제로 한 줄에 들어간다」를 잠그지 않는다. 목업 실폭 렌더가 유일한 근거다.
3. **실기기 iOS Safari 에서 16px 입력이 확대를 일으키지 않는가** — 테스트는 클래스 존재만
   본다. 브라우저 동작 자체는 실기기에서만 확인된다.
4. **e2e 스펙은 고쳤을 뿐 통과를 본 것이 아니다** — Playwright 미실행. 타입만 통과했다.

추가로: **데스크톱 실화면에서 폼 글자 확대 뒤 세로 넘침이 없는가**도 미검증이다(입력 높이가
32 → 38px 로 올라가 카드 전체가 길어진다 — 목업 `.form.big` 이 330px 폭에서 확인한 범위까지만
근거가 있다).

## 플랜과 어긋난 지점 (정직하게)

1. **`Co-Authored-By` 를 넣었다.** 플랜과 `~/.claude/CLAUDE.md` 는 금지인데, 이번 디스패치
   제약과 세션 attribution 지시가 「커밋 메시지 마지막 줄에 `Co-Authored-By: Claude Opus 5
   (1M context)`」를 명시 요구했다. 더 나중이자 상위 지시를 따랐다. 되돌리려면 두 커밋을
   amend/rebase 해야 한다 — 아직 push 전이므로 쉽다.
2. **커밋 전 사용자 확인을 받지 못했다.** 플랜은 태스크마다 「메시지를 보여주고 확인」을
   요구하지만 이 실행은 사용자와 직접 대화할 수 없는 subagent 이고, 오케스트레이터 제약은
   「태스크당 원자적 커밋 1개」만 요구했다. 메시지 전문은 `git log` 에 그대로 있다.
3. **`master` 에 직접 커밋했다.** GSD 기본 가드는 보호 브랜치 커밋을 막지만, 이 저장소는
   `.planning/config.json` 의 `git.branching_strategy: "none"` 이고 디스패치가 명시적으로
   main tree(`master`) 순차 실행을 지시했으며, 직전 quick 들도 전부 `master` 커밋이다.
   드리프트가 아니라 설정된 운영 방식으로 판단해 진행했다.
4. **`.planning/` 산출물과 `STATE.md` 는 건드리지 않았다** — 제약대로 오케스트레이터의 docs
   커밋 몫으로 남겼다. 이 SUMMARY 파일만 작성했다.

`actuals.tokens: 60000` 은 **손댄 5개 파일 전문 기준 chars/4**(플랜 `raw_tokens: 50000` 과 같은
자)다. diff 만으로 재면 약 9,400 이다 — 두 자를 섞지 않도록 함께 적는다.

## Self-Check: PASSED

- `webapp/src/components/trading/limit-chaser-client.tsx` — FOUND
- `webapp/src/components/trading/limit-chaser-form.tsx` — FOUND
- `webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx` — FOUND
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — FOUND
- `webapp/e2e/specs/trading-limit-chaser.spec.ts` — FOUND
- 커밋 `b49a5aa` — FOUND
- 커밋 `a536474` — FOUND
- `git rev-list --count faa3b93..HEAD` = **2** (frontmatter `commits: 2` 와 일치)
