---
phase: 28-limitup-feature-ingest
plan: 07
subsystem: shared · webapp (작업대 상따 카드 탭 「상한가」)
tags: [shared, limit-feature, member-codes, winforms-parity, react, container-query, playwright]
status: complete

requires:
  - phase: 28-limitup-feature-ingest
    provides: "28-01 limitFeatureCells(지금 행) · LimitFeatureTable · 카드 탭 「상한가」 · P28-1 / 28-05 스냅샷 · 접힘 드롭 · P28-1b"
provides:
  - "shared MEMBER_CODES(61) · memberName — gh-trade MemberCodes.cs 이식(키 · 이름 · 외국계 순서까지 스크립트 대조 일치)"
  - "shared roundPctHalfEven · formatManQty · limitFeatureCells 9칸 완성(10초 · 창구 · narrow) · limitFeatureTooltip · LIMIT_FEATURE_ROW_HEADERS"
  - "webapp LimitFeatureTable 폰/넓은 span(@min-[685px]/lc) · title · data-stale · 칸 memo / 탭 제목 접미 stale"
  - "e2e P28-2 — 390 폰 축약 · 창구 말줄임 + title · 긴 탭 제목 한 줄 · 높이 불변 · 1280 전체 숫자"
affects: [28-09, 28-12, 28-13, 28-14]

plan_head_before: 3985956181210aaa01b6dc677626ec786a4c889c
actuals:
  tokens: 11100   # chars/4 over 28-07 자기 커밋 3개의 추가 줄(44,405 chars · 12 files)
  tasks: 3
  commits: 5      # MEASURED rev-list 39859561..HEAD — 그중 28-07 자기 커밋 3개 · 나머지 2개는 동시 세션(4f0d1c86 fix(27) IN-04 · 256a87c8 docs(lessons))

tech-stack:
  added: []
  patterns:
    - ".NET Math.Round 기본(짝수 반올림)을 몫 · 나머지 정수 산술로 재현(roundPctHalfEven)"
    - "밴드별 문구는 같은 칸 안 두 span + 컨테이너 쿼리 클래스 — 폭 측정 JS 없음(QuoteGrid10 · orderbook-ladder 선례)"
    - "1초 갱신 표는 칸 단위 memo(text · tone · strong · narrow 얕은 비교) + 같은 문자열 title"

key-files:
  created:
    - packages/shared/src/member-codes.ts
    - packages/shared/src/__tests__/member-codes.test.ts
    - webapp/src/components/trading/__tests__/limit-feature-table.test.tsx
  modified:
    - packages/shared/src/limit-feature.ts
    - packages/shared/src/__tests__/limit-feature.test.ts
    - packages/shared/src/index.ts
    - webapp/src/components/trading/card/limit-feature-table.tsx
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
    - webapp/src/lib/__tests__/trading-alerts.test.ts
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "MEMBER_CODES 는 손으로 옮기지 않고 C# 사전 줄을 perl 치환으로 생성한 뒤 (키 · 이름 · 외국계) 3중 순서 대조로 검증했다 — 오탈자 여지를 없앴다"
  - "행 머리 「지금 · 10초 · 창구」 를 shared LIMIT_FEATURE_ROW_HEADERS 로 올렸다 — 표 th 와 툴팁 줄 머리가 한 벌(WinForms LimitFeatureTable.RowHeaders 동형)"
  - "깨짐확률 「18.3%」 는 bp 십분위 정수(0 에서 먼 쪽)로 — formatEok · formatRatePct 와 같은 Pitfall 6 규율. 「잔량 취소」 칸은 WinForms 처럼 0 이어도 --down"
  - "툴팁 시각은 gwTimeMs + 9h 정수 산술(밀리초 절사 = WinForms FormatTimeKst(...).Substring(0, 8)) · gwTimeMs ≤ 0 이면 확률 꼬리만 「깨짐확률은 N초 안」 줄로(원문 else-if 갈래)"
  - "alertTabFor 전수 테스트는 Record<TradingAlertKind, true> 로 종류 목록을 잡는다 — 유니온에 종류가 늘면 타입 오류로 먼저 깨진다"

patterns-established:
  - "e2e 음성 대조: 넓은 span 의 `hidden @min-[685px]/lc:inline` 을 `inline` 으로 바꾸면 P28-2 가 「신규 +1.2만잔량 신규 +12,400」 으로 실패하는지 확인한 뒤 되돌린다"

requirements-completed: [D-02, D-03, D-04, D-05]

coverage:
  - id: D1
    description: "회원번호 → 회원사명 표(gh-trade MemberCodes 61개) · memberName(공백 제거 · 6자리 → 앞 5자리 · 미매핑 코드 그대로)"
    requirement: D-03
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/member-codes.test.ts (6건)"
        status: pass
      - kind: command
        ref: "키 목록 grep 대조(플랜 verify 2) + perl (키|이름|외국계) 순서 diff — 둘 다 일치"
        status: pass
    human_judgment: false
  - id: D2
    description: "9칸 완성 — 10초 행(짝수 반올림 우세 % · 반반 · 체결 없음 · 잔량 신규/취소 + 폰 narrow · 체결 N주) · 창구 행(FirstMember · formatManQty · 깨짐확률 / 관찰 중) · 툴팁 — WinForms BuildLimitFeatureCells · ApplyLimitFeatureTable 문자열 대조"
    requirement: D-03
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/limit-feature.test.ts#Phase 28 9칸 완성 (26건 추가 · 파일 46건)"
        status: pass
    human_judgment: false
  - id: D3
    description: "웹 표 — 폰/넓은 두 span(CSS 컨테이너 쿼리만) · title = limitFeatureTooltip · 85 없음 9칸 「—」 · title 없음 · isStale data-stale + .55 · 칸 tone"
    requirement: D-03
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-feature-table.test.tsx (9건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P28-2 9칸 폰 축약 · 높이 · 툴팁"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-04 — 탭 제목 접미 stale 감쇠 · alertTabFor 는 어떤 알림 종류 × 옵션에도 「limit」 을 내지 않는다 · 긴 탭 제목 「상한가 · 잠김 1분 3초」 에도 390 탭 줄 한 줄 · 버튼 카드 안"
    requirement: D-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/trading-alerts.test.ts#Phase 28 D-04 — 어떤 알림 종류 · 옵션 조합도 「상한가」 탭을 열지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-tabs.test.tsx#접속 끊김(isStale)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P28-2 (a)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-02 — 탭 본문 scrollHeight == clientHeight · 카드 높이 탭 전환 전후 동일(390 · 1280) · 말줄임 칸이 있어도 높이 그대로"
    requirement: D-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P28-2 (b)(d)(e) · P28-1"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-tabs.test.tsx#탭 본문 래퍼는 「상한가」 에서도 공통 고정 높이"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-05 — 접힌 카드 헤더 무변경 재확인(이 플랜은 card-header.tsx 를 건드리지 않았다 · P28-1b 「잠김」 미포함 단언 통과)"
    requirement: D-05
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P28-1b"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-10-05
---

# Phase 28 Plan 07: 카드 탭 「상한가」 9칸 완성 Summary

**WinForms `tblLimitFeature` 와 같은 글자의 9칸 — gh-trade `MemberCodes` 61개 이식 · .NET 짝수 반올림 우세 % · 「+5.2만」 만 단위 · 툴팁을 shared 순수 함수 한 벌로 만들고, 웹 표는 카드 `lc` 폰 밴드에서 「신규 +1.2만」 · 「취소 -2,300」 으로 CSS 만으로 줄이며 접속이 끊겨도 값을 지우지 않는다(Playwright P28-2 green)**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-10-05T09:39:24Z
- **Completed:** 2026-10-05T09:52Z
- **Tasks:** 3/3
- **Files modified:** 11 (신규 3 · 수정 8)

## Accomplishments

- `member-codes.ts` — C# `_members` 사전 61줄을 그대로 옮긴 `MEMBER_CODES` + `memberName`. 손으로 옮기지 않고 C# 줄을 perl 치환으로 생성했다.
- `limit-feature.ts` — `roundPctHalfEven`(12.5 → 12 · 37.5 → 38) · `formatManQty`(12,500 → 「+1.3만」 · -2,300 → 「-2,300」 · 0 → 「0」) · 10초 · 창구 행 6칸 · 잠김 중 `narrow` · `limitFeatureTooltip`(행 머리 3줄 + 「HH:mm:ss 기준 · 깨짐확률은 N초 안」). 28-01 의 「—」 자리표시 주석을 걷어냈다.
- `LimitFeatureTable` — 같은 칸 안 폰 span(`@min-[685px]/lc:hidden`) · 넓은 span(`hidden @min-[685px]/lc:inline`) · 표 `title` · `data-stale` + `opacity-[.55]` · `memo` 칸. 탭 제목 접미도 stale 감쇠.
- e2e P28-2 — 390: 긴 탭 제목에도 탭 줄 7원소 중심선 한 줄 · 버튼 카드 안 · 높이 불변 · 보이는 글자 「신규 +1.2만」 · 창구 칸 실제 말줄임(scrollWidth > clientWidth) + title 전체 문장 / 1280: 「잔량 신규 +12,400」.

## Task Commits

1. **Task 1: 회원사 표** — `7dc6412a` (feat)
2. **Task 2: 9칸 완성 · 툴팁** — `c4c06a41` (feat)
3. **Task 3: 웹 표 완성 · e2e P28-2** — `2cf77c2d` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

같은 구간에 동시 세션 커밋 2개가 끼어 있다(`4f0d1c86` fix(27) IN-04 · `256a87c8` docs(lessons)) — `actuals.commits: 5` 는 측정값 그대로다.

## 회원사 키 대조

```bash
# 플랜 verify 2 — 키 목록
a="$(grep -o '{ "[0-9]\{5\}"' /Users/alex/repos/gh-trade/client/Services/Data/MemberCodes.cs | grep -o '[0-9]\{5\}' | sort)" \
  && b="$(grep -o '"[0-9]\{5\}": {' packages/shared/src/member-codes.ts | grep -o '[0-9]\{5\}' | sort)" \
  && test -n "$a" && test "$a" = "$b"                                  # → 일치(종료 0)
# 추가 — (키|이름|외국계) 를 원본 순서 그대로 diff
diff <(perl -ne 'print "$1|$2|$3\n" if /\{ "(\d{5})", new MemberInfo\("([^"]*)", (true|false)\)/' /Users/alex/repos/gh-trade/client/Services/Data/MemberCodes.cs) \
     <(perl -ne 'print "$1|$2|$3\n" if /"(\d{5})": \{ name: "([^"]*)", foreign: (true|false) \}/' packages/shared/src/member-codes.ts)   # → 차이 0
```

61개 · 61개, 순서까지 같다.

## 골든 케이스 수

| 파일 | 건수 |
|---|---|
| `packages/shared/src/__tests__/member-codes.test.ts` | 6 (신규) |
| `packages/shared/src/__tests__/limit-feature.test.ts` | 46 (28-01 20 → 「9칸 완성」 26건 추가, 28-01 의 「6칸 —」 단언 1건은 새 기대값으로 교체) |
| `webapp/src/components/trading/__tests__/limit-feature-table.test.tsx` | 9 (신규) |
| `card-tabs.test.tsx` Phase 28 | 5 → 7 (높이 클래스 불변 · stale) + 기존 9칸 단언 갱신 |
| `trading-alerts.test.ts` | +1 (7종 × 4조합 = 28 호출 「limit」 미반환) |

UI-SPEC 검증 훅 문자열 「매도벽 0」 · 「잔량 신규 0」 · 「1분 3초」 · 짝수 반올림이 골든에 있다.

## Files Created/Modified

- `packages/shared/src/member-codes.ts` — 회원사 표 · `memberName`(신규)
- `packages/shared/src/limit-feature.ts` — 숫자 함수 · 9칸 · 툴팁 · 행 머리
- `packages/shared/src/index.ts` — export
- `webapp/src/components/trading/card/limit-feature-table.tsx` — 두 span · title · stale · memo
- `webapp/src/components/trading/card/card-tabs.tsx` — `isStale` 를 표 · 접미에 연결
- 테스트 · e2e — 위 표

## Decisions Made

- 행 머리를 shared `LIMIT_FEATURE_ROW_HEADERS` 로 올렸다 — 표 `th` 와 툴팁 줄 머리가 같은 상수(웹 쪽 `ROW_HEADS` 중복 제거).
- 깨짐확률 · 만 단위는 Pitfall 6 규율대로 정수 십분위(0 에서 먼 쪽). 「잔량 취소」 칸은 WinForms 원문대로 0 이어도 `--down`.
- 툴팁 시각 없음(gwTimeMs ≤ 0)이면 확률 꼬리만 별도 줄 — WinForms `else if (horizon)` 갈래 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 단언이 이 플랜의 새 칸으로 깨짐**
- **Found during:** Task 3
- **Issue:** `card-tabs.test.tsx` 「10초 · 창구 6칸 「—」」 와 e2e P28-1 `cells.nth(3) toHaveText('—')` 가 9칸 완성으로 더는 맞지 않는다(플랜 Task 2 가 shared 쪽 같은 단언 교체만 적었다).
- **Fix:** 새 WinForms 문구로 갱신 — card-tabs 9칸(폰/넓은 두 span textContent 포함) · P28-1 「매수 우세 63%」 · 「매수 키움증권 +5.2만」.
- **Files modified:** `webapp/src/components/trading/__tests__/card-tabs.test.tsx`, `webapp/e2e/specs/trading-workbench.spec.ts`
- **Verification:** 단위 80 passed · e2e P28-1 passed
- **Committed in:** `2cf77c2d`

**2. [테스트 입력 정정] 6자리 회원번호 예시**
- Task 2 첫 GREEN 실행에서 내가 쓴 `"000050"`(→ 앞 5자리 `00005` 미래에셋증권)이 「키움증권」 기대와 어긋났다 — 구현이 C# 대로 맞고 입력이 틀렸다. 6자리 꼴 `"000500"`(→ `00050`)으로 고쳤다. 커밋 전 수정 — `c4c06a41`.

---

**Total deviations:** 1 auto-fixed (Rule 1) + 테스트 입력 정정 1
**Impact on plan:** 범위 확장 없음.

## Issues Encountered

- pre-commit 보호 브랜치 단언(`master`)은 28-01 과 같은 이유(프로젝트 규칙 「작업은 master 에서」 · 디스패치 「branch master · normal commits」)로 적용하지 않았다.
- `.next` 캐시 문제 없음 — e2e 첫 실행부터 통과.

## Verification

- shared: `member-codes` · `limit-feature` 52 passed · 전체 **16 files · 353 passed** · build green.
- webapp: `typecheck`(e2e tsconfig 포함) 0 오류 · 대상 3파일 80 passed · 전체 단위 **142 files · 3364 passed · 1 skipped**.
- e2e: `-g "P28-"` **3 passed**(P28-1 · P28-1b · P28-2) · `trading-workbench.spec.ts` + `order-log.spec.ts` **87 passed**.
- 음성 대조: 넓은 span 을 `inline` 으로 바꾸면 P28-2 가 `"신규 +1.2만잔량 신규 +12,400"` 으로 실패 → 되돌려 통과.
- 시각 확인(스크린샷 — 스크래치패드 `p28-2-390.png` · `p28-2-1280.png`, 커밋하지 않음): 390 탭 줄 한 줄 · 「신규 +1.2만」 · 「취소 -2,300」 · 창구 칸 말줄임 · 1280 전체 숫자 · 잘림 · 겹침 없음. 손볼 시각 결함 없음.
- 수락 grep: `@min-[685px]/lc:hidden` 1 · `hidden @min-[685px]/lc:inline` 1 · `data-stale` 2 · `limitFeatureTooltip` 3 · 뷰포트 JS 0 · `"limit"` 1 · `P28-2` 1.

## Known Stubs

없음 — 28-01 의 10초 · 창구 6칸 「—」 스텁과 `isStale` 전달만 스텁을 이 플랜이 닫았다.

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 28-09(kind 15 문장)는 `memberName` · `formatEok` · `formatDuration` 를, 28-12/13(보고서)은 `memberName` · `formatManQty` 를 그대로 import 한다.
- 실 85 장중 확인은 gh-trade 서버 Phase 27 배포 · 28-14 relay 배포 뒤 수동 항목.

---
*Phase: 28-limitup-feature-ingest*
*Completed: 2026-10-05*

## Self-Check: PASSED
