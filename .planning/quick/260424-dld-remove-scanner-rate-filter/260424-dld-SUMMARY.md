---
quick_id: 260424-dld
slug: remove-scanner-rate-filter
description: 스캐너 사용자 조정 등락률 필터 제거 + 서버 고정 10% 하한 적용
date: 2026-04-24
status: completed
---

# Quick Task 260424-dld — 스캐너 등락률 필터 정리 SUMMARY

## Result

두 단계로 진행:

1. **사용자 조정 슬라이더 제거** — `min/minRate` URL 파라미터·ScannerState 필드·Popover/Slider UI 완전 삭제. `top_movers` 는 news-sync/discussion-sync 워커의 타겟 목록이기도 해서 워커 쪽 수집 기준은 건드리지 않음.
2. **서버 고정 10% 하한 도입** — `/api/scanner` 에서 `const SCANNER_MIN_CHANGE_RATE = 10` 을 기준으로 `changeRate < 10%` 종목을 응답에서 제외. 조용한 장에 KIS 등락률 순위 끝자락에 붙는 저등락 종목(예: 1~3%)이 스캐너에 섞이지 않도록.

사용자 관점: 등락률 슬라이더는 사라졌고, 스캐너에는 "등락률 10% 이상" 종목만 마켓 필터와 함께 표시된다. 페이지 안내문에 "등락률 10% 이상" 을 명시했다.

## Files changed

**서버 — 10% 하한 + minRate 파라미터 제거:**
- `server/src/schemas/scanner.ts` — `ScannerQuery` 에서 `minRate` 필드 삭제 (사용자 조정 입력 제거).
- `server/src/routes/scanner.ts` — `minRate` 구조분해/필터 블록 삭제. 대신 `const SCANNER_MIN_CHANGE_RATE = 10` 상수 추가 + 평탄화 직후 `changeRate >= 10` 고정 컷 적용.
- `server/tests/routes/scanner.test.ts` — minRate 파라미터 테스트 2건 제거. 스캐너 픽스처를 10% 이상(samsung 15.5, kakao 12.3, kosdaq 11.7) 으로 조정. "changeRate<10% 제외" 회귀 테스트 추가. "stock_quotes 없는 종목" 테스트는 "changeRate=0 → 컷에 걸려 제외" 로 의미 갱신.

**웹앱 — 슬라이더/URL 파라미터/상태 제거:**
- `webapp/src/lib/scanner-query.ts` — `ScannerState` 를 `{ market }` 로 축소, `SCANNER_MIN_RATE`/`SCANNER_MAX_RATE`/`parseMin` 제거, `DEFAULT_SCANNER_STATE = { market: 'ALL' }`.
- `webapp/src/lib/scanner-query.test.ts` — min describe 블록 제거, market 파싱 + legacy `?min=25` 무시 회귀 테스트 추가.
- `webapp/src/lib/scanner-api.ts` — 요청 `URLSearchParams` 에서 `minRate` 삭제.
- `webapp/src/lib/scanner-api.test.ts` — `STATE` 픽스처를 `{ market: 'ALL' }` 로 수정.
- `webapp/src/components/scanner/scanner-client.tsx` — polling key/deps 에서 `state.min` 제거. 페이지 설명을 "상한가 근접 종목(등락률 10% 이상)을 실시간으로 추적합니다. 마켓을 선택해 리스트를 확인하세요." 로 갱신.
- `webapp/src/components/scanner/scanner-filters.tsx` — 등락률 Popover + Slider + `localMin`/debounce state 전부 제거, Slider import 제거. 마켓 Popover 만 유지.

## Verification

- `pnpm --filter server test -- scanner` → **105 passed / 17 files** (minRate 테스트 제거 + "changeRate<10% 제외" 회귀 테스트 추가 후 통과).
- `pnpm --filter webapp test -- scanner-query` → **135 passed / 1 skipped / 22 files** 통과.
- `pnpm -w typecheck` → 7개 워크스페이스 통과.
- `grep -nE "minRate|SCANNER_MIN_RATE|SCANNER_MAX_RATE|state\.min|localMin|handleSliderChange" webapp/src server/src server/tests` → 빈 결과.
- 서버 상수: `SCANNER_MIN_CHANGE_RATE = 10` ([server/src/routes/scanner.ts](server/src/routes/scanner.ts)) — 향후 조정 시 이 한 곳만 바꾸면 됨.

## Compatibility

- 레거시 URL `?min=25&market=KOSPI` 공유 시: 프론트 파서가 `min` 을 조용히 무시하고 `market=KOSPI` 만 적용한다. 서버 스키마도 `minRate` 를 받지 않으므로 미지정으로 간주하여 무시 (zod strict 아님). 회귀 테스트 추가됨.

## Out-of-scope / follow-ups

- Scanner 워커(`workers/ingestion/src/pipeline/upsert.ts`) 의 top_movers 수집 기준은 손대지 않음. news-sync/discussion-sync 워커가 top_movers 를 타겟 목록으로 쓰므로, 워커 레벨 컷은 다운스트림(뉴스/토론) 범위까지 줄여서 부작용이 크다. 노출 컷은 API 응답에서 처리하는 쪽이 안전.
- UI-SPEC / Phase 05 PLAN 문서의 "slider 10~29%" 기록은 역사 기록으로 남겨둠 (archived 이후 수정 대상).
- 현재 10% 는 상수(`SCANNER_MIN_CHANGE_RATE`) — 추후 env 로 빼야 할 정도의 운영 요구가 생기면 한 곳만 바꾸면 됨.
