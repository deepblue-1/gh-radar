# Quick Task 260706-ktd — SUMMARY

**Task:** intraday-sync 하락 종목 일봉 동결 수정 — ka10027 sort_tp 1+3 병합 + STEP2 필터 제거
**Date:** 2026-07-06
**Status:** 3/3 tasks complete

## 배경 (진단)

삼성전기(009150) 일봉차트에 7/6 당일 데이터가 반영되지 않는다는 사용자 리포트. 라이브 조사 결과:

- `stock_daily_ohlcv` 의 7/6 row 는 09:00:34 KST 생성 후 **한 번도 갱신 안 됨** (close +0.2% 동결). 반면 `stock_quotes` 는 종목상세 라우트의 on-demand ka10001 호출로 -6.23% 최신 유지 → 헤더 가격과 일봉 캔들 불일치.
- 원인 1: STEP1 의 ka10027 이 `sort_tp="1"`(상승+보합만) → 하락 전환 종목은 매분 일봉 갱신에서 탈락. SK하이닉스(000660)도 동일 동결 확인 — 하락 종목 전체의 구조적 문제.
- 원인 2: STEP2 의 `step1Codes` intersect 필터가 watchlist 종목의 ka10001 정확 OHLC 까지 차단. 필터의 원 도입 사유(upsertQuotesStep2 INSERT 시 NOT NULL violation)는 UPSERT→UPDATE 전환으로 이미 소멸.

상세 진단: 사용자 승인 플랜 `/Users/alex/.claude/plans/7-foamy-eagle.md`

## 변경 사항

| Commit | 내용 |
|--------|------|
| `18e79b2` | `fetchKa10027` 에 `sortTp` 파라미터 추가 (`sort_tp:"1"` 하드코딩 제거, 시그니처 `(client, token, sortTp="1", hardCap=5000)`) + fetchRanking 테스트 갱신 |
| `ad7feca` | `runIntradayCycle` STEP1 을 sort_tp=1(상승+보합) + sort_tp=3(하락+보합) 2회 호출 후 concat — dedupeMap 이 보합 중복 제거, 휴장일 가드는 병합 length===0 유지. STEP2 `step1Codes` intersect 필터/dropped 로그 제거 → `step2UpdatesRaw` 직접 전달 (안전 근거 주석 명시) |
| `a40ad53` | runCycle 테스트 추가 — sort_tp 1·3 병합 호출, 하락 종목 STEP1 포함, STEP2 필터 제거 검증 (`tests/runCycle.test.ts` 신규 155줄) |

## 검증

- 전체 vitest: 15 파일 / 95 tests green (회귀 0)
- `tsc --noEmit` exit 0
- 하드코딩 `sort_tp: "1"` / intersect 필터 코드 잔존 없음

## 배포 전 주의

- ka10027 페이지 호출 ~2배 → 사이클 +3~4초 (1분 주기 내 여유). 배포 후 429 빈도 모니터링.
- 배포 전 `scripts/smoke-intraday-sync.sh` 로 sort_tp=3 실응답 재확인 권장.

## 참고

- 실행자 worktree 의 미커밋 SUMMARY 가 worktree 정리 시 유실되어 orchestrator 가 실행자 최종 보고 기반으로 재작성함 (내용 동일).
