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
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
