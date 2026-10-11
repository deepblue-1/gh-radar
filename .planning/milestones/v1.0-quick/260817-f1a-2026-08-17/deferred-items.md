# Deferred Items — quick-260817-f1a

## 1. packages/shared theme.test.ts 실패 (선재 결함, 본 태스크 범위 외)

- **테스트:** `src/__tests__/theme.test.ts > ThemeStockSource > naver/alphasquare/ai/user 4 멤버를 런타임 tuple 로 노출`
- **증상:** `THEME_STOCK_SOURCES` 가 `["naver","alphasquare","user"]` (3개) 인데 테스트는 `ai` 포함 4개를 기대.
- **원인:** `22b37bc feat(quick-260706-erk): 공유 타입·테마 프론트에서 'ai' source 제거` 에서 상수만 바꾸고 테스트를 갱신하지 않음.
- **판정:** 본 태스크(휴장일 가드) 변경과 무관. `git stash` 없이도 base commit 3935c32 에서 동일 실패 재현 확인.
- **조치 제안:** 별도 quick task 로 테스트 기대값을 3개로 수정(`ai` 제거).
