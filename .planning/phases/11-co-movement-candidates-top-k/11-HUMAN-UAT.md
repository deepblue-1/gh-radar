---
status: partial
phase: 11-co-movement-candidates-top-k
source: [11-VERIFICATION.md]
started: 2026-06-11T09:55:00Z
updated: 2026-06-11T09:55:00Z
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
