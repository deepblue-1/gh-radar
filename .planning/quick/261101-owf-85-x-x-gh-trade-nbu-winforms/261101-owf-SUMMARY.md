---
phase: quick-261101-owf
plan: 01
subsystem: relay · shared · webapp(상따 카드 「상한가」 탭)
tags: [limit-feature-85, winforms-parity, gh-trade-nbu]
status: complete
requires:
  - gh-trade bac82294 (85 upper_max_fill_krw · upper_max_fill_date 말미 append)
  - gh-radar d59f7ed8 (relay 생성물 접근자)
provides:
  - "relay limit.feature 프레임 upperMaxFillKrw(원) · upperMaxFillDate(KST yyyymmdd)"
  - "shared limitFeatureCells 창구 셋째 칸 「최대체결 X.X억」 · limitFeatureTooltip 「최대체결 M/d 기록」 줄"
affects:
  - 상따 카드 「상한가」 탭 창구 행 셋째 칸 · 표 title
key-decisions:
  - "칸 모양 · 문구 · 색 · 오늘 판정은 WinForms bac82294 원문 그대로(오늘 = gwTimeMs KST 달력 날짜, 0 이면 지금 시각 — 06:00 리셋과 무관)"
  - "폰 밴드(lc < 685)만 「최대 X.X억」 — 목업 ④ B 사용자 채택(WinForms 에 폰 밴드 없음)"
  - "구 relay(키 없음) · 구 서버(0/0) · kind 15 다리 → 「최대체결 —」 muted"
---

# quick-261101-owf 요약

목업 `reference/mockup-max-fill.html` 검토 후 구현(①~③ WinForms 원문, ④ 폰 밴드 B 채택).

## 바뀐 것

- **relay** `parseLimitFeature` — `upperMaxFillKrw`(toNum 경계) · `upperMaxFillDate` 디코드. 테스트 헬퍼 입력 2개(기본 미기록 = 구 서버),
  envelope.test(값 · 기본 0/0 · 2^53 클램프) · fanout.test LF3.
- **shared** `RelayLimitFeatureMsg` optional 두 필드. `limitFeatureCells` 창구 셋째 칸:
  0 · 키 없음 → 「최대체결 —」(muted) / 날짜 = 오늘 → 「최대체결 {억}」(fg) / 그 밖 → 같은 문구 muted. 폰 문구 「최대 {억}」.
  `limitFeatureTooltip` — 깨짐확률 꼬리 제거, 값 > 0 ∧ 날짜 ≠ 0 ∧ 날짜 ≠ 오늘이면 마지막 줄 「최대체결 M/d 기록」.
- **webapp** 컴포넌트 코드는 그대로(주석만) — shared 뷰 모델이 narrow 를 주면 기존 두 span 컨테이너 쿼리로 갈린다.
- kind 15 `limitFeatureLogParts` 는 손대지 않음(확률 문구 유지 · shared 테스트 통과로 확인).

## 검증

- relay typecheck · typecheck:tests 통과, relay vitest 전체 61파일 1849건 통과(lc-change-mask 포함 — 옆 세션 bce42b6a 반영 상태).
- shared vitest 26파일 854건 통과 · tsc 통과 · build.
- webapp typecheck(앱 + e2e) 통과, limit-feature-table · card-tabs · order-log vitest 106건 통과.
- e2e P28-2(390 폰) 통과 — 셋째 칸 보이는 글자 「최대 123.5억」 잘림 없음(스크린샷 확인), title 끝 「HH:mm:ss 기준」.

## 남은 확인

- 11/2 장중 상한가 종목 카드에서 셋째 칸이 오늘 날짜(검정)로 나오는지 실값 확인.
