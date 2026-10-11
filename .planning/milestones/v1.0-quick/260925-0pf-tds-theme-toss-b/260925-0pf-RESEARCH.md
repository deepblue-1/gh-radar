# 260925-0pf RESEARCH — TDS(토스 디자인 시스템) 공식 값

조사: 2026-09-24 (서브에이전트 · 출처 URL 병기). 등급: 공식 패키지 > 공식 문서 > 공식 사이트 CSS > 비공식.

## 결정 (사용자)
- 기준 팔레트: **공식 TDS 앱 팔레트 `@toss/tds-colors@0.1.0`** (토스증권 웹 tw 팔레트 아님)
- 서체: **Pretendard 유지** (TPS 는 재배포 불가 · 시스템 서체는 OS마다 다름)

## 색 — 공식 패키지
https://cdn.jsdelivr.net/npm/@toss/tds-colors@0.1.0/colors.light.css · colors.dark.css

| 토큰 | 라이트 | 다크 |
|---|---|---|
| grey50 | #f9fafb | #202027 |
| grey100 | #f2f4f6 | #2c2c35 |
| grey200 | #e5e8eb | #3c3c47 |
| grey300 | #d1d6db | #4d4d59 |
| grey400 | #b0b8c1 | #62626d |
| grey500 | #8b95a1 | #7e7e87 |
| grey600 | #6b7684 | #9e9ea4 |
| grey700 | #4e5968 | #c3c3c6 |
| grey800 | #333d4b | #e4e4e5 |
| grey900 | #191f28 | #ffffff |
| blue500 | #3182f6 | #3485fa |
| red500 | #f04452 | #f04251 |
| blue50 / red50 | #e8f3ff / #ffeeee | #202c4d / #3c2020 |
| background | #ffffff | #17171c |
| greyBackground (띠) | #f2f4f6 | #101013 |
| layeredBackground (카드·시트) | #ffffff | #202027 |
| floatBackground (다이얼로그·팝오버) | #ffffff | #2c2c35 |
| hairlineBorder (구분선) | #e5e8eb | #3c3c47 |
| dimmedBackground | rgba(0,0,0,.2) | rgba(0,0,0,.56) |

텍스트 역할 (tds-mobile 컴포넌트 실사용): 주 텍스트 grey800 · 가장 진한 grey900 · 보조 **grey600** · 3차 grey500 · 비활성 grey400.

## 타이포 — 공식 문서/패키지
https://tossmini-docs.toss.im/tds-mobile/foundation/typography/ · @toss/tds-typography@0.0.3

| 토큰 | size / line-height |
|---|---|
| t1 | 30 / 40 |
| t2 | 26 / 35 |
| t3 | 22 / 31 |
| t4 | 20 / 29 |
| t5 | 17 / 25.5 |
| st10 | 16 / 24 |
| t6 | 15 / 22.5 |
| st11 | 14 / 21 |
| t7 | 13 / 19.5 |
| st12 / st13 | 12 / 18 · 11 / 16.5 |

굵기: regular 400 · medium 500 · semibold 600 · bold 700. 버튼 600. ListRow 예: 위 t5 bold grey800 / 아래 t6 regular grey600.

## 버튼·radius — 공식 패키지 @toss/tds-mobile@2.5.1
| 크기 | 높이 | radius | 글자 |
|---|---|---|---|
| xlarge | 56 | 16 | t5 17 |
| large | 48 | 14 | t5 17 |
| medium | 38 | 10 | t6 15 |
| small | 32 | 8 | t7 13 |
BottomCTA = xlarge 56 · 좌우 20 · 하단 20/safe-area · 위로 bg 그라디언트. BottomSheet radius 28. Dialog radius 24. Toast 한 줄 radius 100.

## 현재 브랜치(f8280a4) 대비 차이 — 보정 대상
- 다크 세그먼트 선택 면 #454552 → grey200 #3c3c47 (또는 grey300 #4d4d59 — 대비 확인)
- 다크 faint #6b6b73 → grey500 #7e7e87 (3차) / 비활성은 grey400 #62626d
- 다크 띠 #0f0f12 → #101013
- 구분선: 흰 6% 투명 → hairlineBorder (다크 #3c3c47 / 라이트 #e5e8eb). 단 면 테두리는 계속 투명(무테 유지) — 행 구분선·입력 hairline 에만.
- 다크 red #f04452 → #f04251 (사실상 동일, 공식값으로)
- 라이트 보조 텍스트 #8b95a1(grey500) → **grey600 #6b7684**; 라이트 주 텍스트 fg-2 는 grey800 #333d4b, 가장 진한 fg 는 grey900 #191f28
- 타이포 스케일: 탭 16 → t5 17/600 · 라벨 13.5 → t6 15/400(보조색) · 값 16 → st10 16 또는 t5 17 /500 · 섹션 제목 t4 20/700 · 히어로 t1 30/700 유지
- 버튼: 폰 주문하기 CTA 54 → 56(radius 16), 주문 버튼 52 → 48(radius 14) 또는 56 — `lc` 가로 증가 0 규칙 준수(높이만)
- lightweight-charts 는 hex/rgb 만 — chart-colors.ts 도 공식값으로
