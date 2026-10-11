---
phase: quick-260914-jtj
plan: 01
subsystem: webapp/home
status: complete
tags: [home, clipboard, copy, a11y, refactor]
requires: []
provides:
  - "home-format.ts — 등락%·평균·정렬·KST 시각·복사 텍스트 포매터 단일 원천"
  - "CopyTextButton — idle/copied/failed 상태 + 정리되는 타이머의 재사용 복사 버튼(label·icon 변형)"
affects:
  - "홈(/) 주도 테마 섹션 제목 행, ThemeCard 헤더"
tech-stack:
  added: []
  patterns:
    - "getText lazy 호출 — 클릭 시점 스냅샷과 복사 텍스트 일치"
    - "sr-only role=status aria-live 안내 문구를 시각 라벨과 다르게 둬 정확 조회 충돌 방지"
key-files:
  created:
    - webapp/src/components/home/home-format.ts
    - webapp/src/components/home/copy-text-button.tsx
    - webapp/src/components/home/__tests__/home-format.test.ts
    - webapp/src/components/home/__tests__/copy-text-button.test.tsx
  modified:
    - webapp/src/components/home/theme-card.tsx
    - webapp/src/components/home/home-client.tsx
    - webapp/src/components/home/home-header.tsx
    - webapp/src/components/home/solo-card.tsx
    - webapp/src/components/home/__tests__/theme-card.test.tsx
    - webapp/src/components/home/__tests__/home-client.test.tsx
    - webapp/e2e/specs/home.spec.ts
decisions:
  - "아이콘 변형 피드백 말풍선은 아이콘 아래가 아니라 위(bottom-full)에 띄운다 — 아래는 ThemeCard '평균 등락' 캡션 끝을 가림(390px 실측)"
  - "formatChange·avgChange·toKstHhmm 은 home-format.ts 한 곳에만 정의 — 화면과 복사 텍스트가 같은 함수"
metrics:
  duration: "약 10분"
  completed: 2026-09-14
actuals:
  tokens: 6582
  tasks: 3
  commits: 0
plan_head_before: 8ef89ed
commit: pending (사용자 확인 후 커밋)
---

# Quick 260914-jtj: 홈 주도 테마 요약 클립보드 복사 Summary

홈 "주도 테마 N" 제목 행의 '전체 복사'(현재 스냅샷 전체 테마, `[주도 테마] {tradeDate} {KST HH:MM}` 헤더 + 번호 블록)와 각 ThemeCard 헤더의 '{테마명} 요약 복사' 아이콘 버튼(그 테마 블록만)을 `navigator.clipboard.writeText` 일반 텍스트로 구현했다. 등락% 문자열은 화면과 같은 `home-format.ts` 함수에서 나온다.

## 수행한 작업

| Task | 내용 | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | `home-format.ts`(formatChange·avgChange·sortStocksByChangeDesc·formatThemeBlock) + `CopyTextButton` + ThemeCard 헤더 아이콘 버튼 배선, 테마명 트리거 쿼리 정확 일치화(vitest 2곳, e2e 1곳) | pending (사용자 확인 후 커밋) |
| 2 | `toKstHhmm` 이전 + `formatThemesSummary`, HomeHeader 로컬 사본 제거, HomeClient 제목 행 '전체 복사' | pending (사용자 확인 후 커밋) |
| 3 | CopyTextButton 상태 머신 테스트 6건, SoloCard formatChange 사본 제거, 전체 게이트 | pending (사용자 확인 후 커밋) |

TDD 흐름: Task 1 RED(신규 2건 실패/기존 7건 통과) → GREEN 9/9. Task 2 RED(3건 실패 — formatThemesSummary 부재·버튼 부재) → GREEN 20/20. Task 3 은 Task 1 에서 컴포넌트가 이미 구현돼 테스트가 처음부터 통과했으므로, unmount 테스트를 **변이 검사**로 검증했다(타이머 cleanup 비활성화 → `expected 1 to be +0` 로 실패 확인 → 원복 후 통과).

## 검증 게이트 결과

| 게이트 | 결과 |
| ------ | ---- |
| `pnpm -C webapp test` (vitest 전체) | 통과 — Test Files 70 passed, Tests 866 passed / 1 skipped (867), exit 0 |
| `pnpm -C webapp typecheck` (app + e2e tsconfig) | 통과 — exit 0 |
| `pnpm --filter @gh-radar/webapp lint` | 통과 — exit 0. 경고 3건은 모두 이번 변경과 무관한 기존 파일(theme-detail-client.tsx, strategy-status-card.test.tsx, use-relay-socket.ts) |
| grep: home 컴포넌트 3곳 로컬 헬퍼 정의 | 없음(통과) — `formatChange`·`avgChange`·`toKstHhmm` 정의는 `home-format.ts` 에만 존재 |
| grep: 토스트 의존성(sonner/react-hot-toast/react-toastify) | 없음(통과) |
| E2E `playwright test e2e/specs/home.spec.ts` | 통과 — 10 passed (setup 1 + home 9). 말풍선 위치 수정 후 재실행해도 10 passed |
| 시각 점검 390px / 1280px (임시 Playwright 스펙, 실행 후 삭제) | 통과 — 헤더 한 줄 유지(아이콘 32px 추가만), 말풍선 표시 전후 헤더 박스 동일, 말풍선이 캡션·평균값·테마명·전체 복사 버튼과 겹침 없음, '전체 복사' 우측 정렬 |
| 실제 브라우저 클립보드 (Chromium, clipboard-read 권한) | 카드 복사·전체 복사 모두 readText 결과가 잠긴 형식과 일치 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug · 시각 결함] 아이콘 버튼 '복사됨' 말풍선이 '평균 등락' 캡션을 가림**
- **발견:** 390px 시각 점검(계획 verification 항목)
- **문제:** 계획 지정 클래스 `top-full mt-1` 로 아이콘 아래에 띄우면 말풍선(x 324~369)이 오른쪽 정렬 캡션 끝(~x 333)과 겹쳐 "락" 글자를 덮음. 좌/우 배치는 평균값이나 카드 경계와 충돌.
- **수정:** `bottom-full mb-1` — 아이콘 위(카드 상단 패딩·섹션 간 여백)에 띄움. z-index 미부여는 그대로(sticky 탑바 위로 새지 않음). JSDoc 에 사유 기록.
- **검증:** 390/1280px 겹침 검사 전부 false, 헤더 박스 불변, 스크롤 상태 스크린샷 확인, vitest·typecheck·lint·home e2e 재실행 통과.
- **파일:** webapp/src/components/home/copy-text-button.tsx

### 그 외
- CopyTextButton 실패 테스트에 "console.error 인자에 복사 텍스트('hello')가 없음" 단언을 추가(T-jtj-03 로그 미노출 검증). 계획 범위 안의 보강.
- unmount 테스트는 계획의 1순위 방식(`vi.getTimerCount()` baseline 복귀)으로 안정 동작해 대체 방식은 쓰지 않음.

## Threat model 대응
- T-jtj-01: `writeText` 일반 텍스트만, ClipboardItem·dangerouslySetInnerHTML 없음.
- T-jtj-03: catch 에서 에러 객체만 로깅(테스트로 확인).
- T-jtj-04: API 부재 가드 + reject catch → '복사 실패' 표시(테스트로 확인).

## Known Stubs
없음.

## 커밋 상태
사용자 규칙(커밋 메시지 사전 확인·일괄 커밋)에 따라 `git add`/`git commit`/`git push` 를 하지 않았다. 모든 변경은 working tree 에 미커밋 상태로 남아 있다. `tasks/lessons.md` 의 기존 수정은 이번 작업과 무관하며 건드리지 않았다.

## Self-Check: PASSED
- 생성 파일 4개 존재 확인, 수정 파일 7개 `git status` 반영 확인.
- commit: pending (사용자 확인 후 커밋) — 해시 검증 대상 없음.
