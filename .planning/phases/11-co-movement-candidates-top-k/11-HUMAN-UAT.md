---
status: partial
phase: 11-co-movement-candidates-top-k
source: [11-VERIFICATION.md]
started: 2026-06-11T09:55:00Z
updated: 2026-06-11T11:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. 종목상세 페이지 동조 후보 섹션 시각 확인
expected: |
  https://gh-radar-webapp.vercel.app/stocks/004090 (로그인 후):
  1. "이 종목의 테마" 칩 다음에 "동조 후보" 섹션(Waypoints 아이콘 + 캡션) 렌더
  2. 흥구석유(024060) 최상위 노출, 동반율 영역 "—" (co-surge 전용, "0%" 아님)
  3. 후보 >3 → "동조 후보 N개 더 보기" 버튼 → 클릭 → 전체 펼침 → "접기"
  4. 동반율 = 중립색(검정/흰색), 실시간 등락률 = 방향색(상승 빨강/하락 파랑)
  5. 강도바 하단 빨강 라인 존재
  6. 다크/라이트 토글 시 색 자동 전환
  7. 무테마 종목(005935 삼성전자우) → "동조 데이터 부족" 빈 상태 박스(CircleOff)
result: issue — 동반율이 비정상적으로 낮게 표시됨 (사용자 보고 2026-06-11). 원인 = REVIEW.md WR-01: confD0 필드에 raw 동반율 대신 랭킹용 가중값(conf_d0×1/√테마크기×앵커참여도)이 전달됨. WR-04(에러 1회 후 섹션 영구 숨김)도 동일 세션에서 함께 수정.

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

### GAP-1: 동반율 과소 표기 (WR-01) + 동조 섹션 state sticky (WR-04)
status: fixed — production 재배포 완료 (사용자 재검증 대기)
source: 사용자 시각 검증 + 11-REVIEW.md WR-01/WR-04
fix: confD0에 bestConfD0Raw 사용(랭킹 strength는 가중값 유지) + useEffect 시작 시 state 전체 리셋
commits: b7762e3 (WR-01), f2f76e3 (WR-04)
deploy: server `gh-radar-server-00027-9rl` (SHA c8a98ec) + webapp `dpl_VgLsWKG9pZJJWJ65a9rMvGvoSaGN` (4718byjsz). prod curl 검증 — 테마 후보 confD0 가중값→raw 동반율 상승(예: 인디에프 0.033→0.40, ×12), strength 랭킹 불변, co-surge 전용 "—" 계약 불변. 상세 11-DEPLOY-LOG.md. 시각 재검증(로그인 후 종목 이동 시 state 리셋·동반율 표기)은 사용자 수동.

### GAP-2: cosurge 점수 v2 — 직접동반 "횟수" → "강도비율×최근성×표본보정" (사용자 설계 피드백)
status: fixed — production 적용 + server 재배포 완료 (사용자 시각 재검증 대기)
source: 사용자 설계 피드백 (2026-06-11) — "X 가 급등 간 날 Y 가 얼마나 같이 갔느냐. 30% 갈 때 27% 따라갔으면 0.9. 최근일수록 더 크게. 직접동반 만점은 테마와 동일 1.0. 횟수/15 정규화 폐기."
fix: |
  - SQL `20260611150000_cosurge_pair_score_v2.sql`: cosurge_edges +4컬럼(w_sum_a/ws_sum_a/w_sum_b/ws_sum_b), rebuild_comovement() 가 방향별 (강도비율 s_t=LEAST(1,GREATEST(0,ret_other/ret_self)) × 최근성 w_t=power(0.5,경과일/365)) 누적. 페어 후보 게이트(≥10% 동반 ≥3일·적격성·광역일 제외)는 불변.
  - server computeComovement.ts: pairScore = (ws_sum/w_sum)×min(1,w_sum/W0), W0=1.5(CO_SURGE_W0). cosurgeCombined = 0.6·pairScore + 0.2·lift + 0.2·avgRet → 만점 1.0. CO_SURGE_CAP 횟수정규화 폐기. coSurgeCount 표시(칩 N회)·strength=max(theme,cosurge)·응답 계약 불변.
  - 테스트: 전체 163 green. 신규 시나리오 J(최근성: 동일 비율이면 최근>과거) · K(표본보정: 1회 우연 < 꾸준 다수).
commits: 3b84d44 (SQL v2), f6cc108 (server v2 + 테스트)
deploy: |
  마이그레이션 push → rebuild_comovement(24) REST RPC 200 (53.9s, 180s task-timeout 내 / 워커 무변경) → server `gh-radar-server-00028-xnw` (SHA f6cc108) 재배포 smoke 9/9 PASS.
  prod curl `GET /api/stocks/004090/co-movement?k=8` → 흥구석유(024060) rank#1 strength 0.9401 (v1 0.6558→상승, 강도비율 0.974), strength desc, 앵커 제외, 10필드·co-surge 전용 "—" 계약 불변. 상세 11-DEPLOY-LOG.md / 11-CALIBRATION.md v2 섹션.
  시각 재검증(로그인 후 `/stocks/004090` 동조 후보 상위 종목·강도바)은 사용자 수동.
