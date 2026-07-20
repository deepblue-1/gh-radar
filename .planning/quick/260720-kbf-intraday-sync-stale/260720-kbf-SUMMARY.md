# Quick Task 260720-kbf: 휴장일 가짜 '상' 표시 수정 — Summary

**Date:** 2026-07-20
**Status:** Complete (코드 + 운영 + 배포 전부 완료)

## 문제

종목 상세 페이지(예: 044380 주연테크)에서 휴장일인 7/17에도 일봉 차트에 '상'(상한가) 마커가 표시됨.

**근본 원인:** 매분 실행되는 intraday-sync(키움) 워커가 행 날짜를 무조건 `todayIsoKst()`로 스탬핑하는데, 휴장일 판정이 "ka10027 응답 0행"뿐. 평일 휴장일에 키움이 직전 거래일 snapshot을 그대로 반환하면 전날 등락률(+30%)을 담은 가짜 행이 휴장일 날짜로 INSERT됨.

**오염 실측:** 2026-05-25(3,171행), 2026-06-03(1,322행), 2026-07-17(3,706행) — 총 8,199행. 세 날짜 모두 직전 거래일과 close+change_rate 84~89% 정확 일치로 stale 복제 확증.

**2차 피해:** `rebuild_limit_up`의 LEAD(date) 기반 "다음날 수익률" 통계가 가짜 행을 다음 거래일로 오인 (044380 7/16 이벤트의 next_open_ret가 -16.5%로 왜곡).

## 수행 내역

### Task 1 — stale 감지 가드 (commit `5aa08d5`)

- 신규 `workers/intraday-sync/src/pipeline/staleGuard.ts`:
  - `detectStaleSnapshot(updates, prevRows)`: close 정확 일치 + change_rate epsilon(0.005) 비교. comparable ≥ 30 AND ratio ≥ 0.8 → stale
  - `fetchPrevDayRows(supabase, sample≤100, todayIso)`: 직전 10일 범위에서 code별 최신 행 1회 조회
- `src/index.ts`: 0행 가드 → mapping+dedupe(앞으로 이동) → **stale 가드(신규, stale이면 warn + no-op)** → bootstrap → 기존 흐름
- 부수 효과: lessons.md에 기록됐던 프리마켓(08시대) stale 오염 계열도 같은 가드로 차단
- 테스트: `staleGuard.test.ts` 6케이스 신규 + `runCycle.test.ts` stale 시나리오 추가. 전체 105/105 green, tsc 통과

### Task 2 — 오염 데이터 정리 + 재빌드 (운영, 코드 없음)

- `stock_daily_ohlcv`에서 3개 휴장일 날짜 DELETE: **8,199행** (검증: 3개 날짜 모두 0행, 044380 7/17 행 소멸)
- `gh-radar-limit-up-sync` 잡 실행 → Completed (044380 7/16 이벤트 next_open_ret 30.00으로 복구 — 실제 다음 거래일 7/20 기준)
- `gh-radar-comovement-sync` 잡 실행 → Completed

### Task 3 — 배포 + lessons (commit `b077036`)

- `tasks/lessons.md`에 "stale 응답은 0행 가드로 못 잡는다" 교훈 기록
- `scripts/deploy-intraday-sync.sh`로 재배포: 잡 이미지 `intraday-sync:b077036`, 스케줄 변경 없음(`* 8-15 * * 1-5` Asia/Seoul)
- 알림 정책 단계는 NOTIFICATION_CHANNEL_ID 미설정으로 스킵 — 기존 정책(`gh-radar-intraday-sync-failure`)이 이미 존재해 무해

## 검증

- [x] 단위 테스트 105/105 (메인 트리 머지 후 재실행)
- [x] 3개 휴장일 날짜 행 수 0
- [x] 044380 7/17 행 소멸 → 웹앱 차트 '상' 마커 소멸
- [x] limit_up_events 7/16 next-day 통계 7/20 기준 복구
- [x] 재빌드 잡 2종 Completed
- [x] Cloud Run 잡 이미지 새 SHA 확인
- [ ] (관찰 항목) 다음 거래일 08시대 cycle 로그에서 stale skip warn 발생 여부 — 프리마켓 차단 실증

## 남긴 것

- 프론트 차트 마커의 change_rate 단독 판정은 사용자 결정으로 유지 (교차검증 미도입)
- 휴장일 캘린더 테이블 미도입 (stale 감지 heuristic으로 대체, 유지보수 불필요)
