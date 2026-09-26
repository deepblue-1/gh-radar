---
status: diagnosed
phase: 21-gh-trade-mobile-app
source: 21-01-SUMMARY.md, 21-02-SUMMARY.md, 21-03-SUMMARY.md, 21-04-SUMMARY.md, 21-05-SUMMARY.md, 21-06-SUMMARY.md, 21-07-SUMMARY.md, 21-08-SUMMARY.md, 21-09-SUMMARY.md, 21-10-SUMMARY.md, 21-11-SUMMARY.md, 21-12-SUMMARY.md, 21-13-SUMMARY.md, 21-14-SUMMARY.md, 21-15-SUMMARY.md, 21-16-SUMMARY.md
started: 2026-09-26T00:52:04Z
updated: 2026-09-26T06:55:27Z
---

<!--
UAT 2차(실서버). 앱 = 운영 URL 빌드(https://trade.jx1.io) · 웹 = push bac3746 뒤 Vercel 프로덕션.
기기: iPhone 17 · iPad Pro 11-inch (M5) (iOS 27.0 시뮬레이터) · Android emulator-5554 (Medium_Phone_API_36.1).
항목 정의 정본 = 21-16-PLAN.md Task 2 <how-to-verify> 1~13 (14 = push 결정, 이미 push 됨).
UAT 1차(로컬 dev) 결과·수정은 21-16-SUMMARY.md 「UAT 1차 결과」.
status: diagnosed = 이슈 1건·신규 요청 3건의 원인/방향이 적혀 있고 /gsd-plan-phase 21 --gaps 로 넘길 준비가 됐다.
테스트 13 은 2026-09-26 사용자 보고로 pass. 열린 결정 N1·N2·N3 는 같은 날 사용자가 확정했다(각 갭의 「결정」 줄). G-21-1 은 sketch 007 C(높이 60) 채택.
UAT 3차(2026-09-26 · 21-24 push-then-recheck 뒤 운영 앱): 사용자 수정 요청 6건 → G-21-R3-1~6. 코드 리뷰(21-REVIEW.md) 13건 전부 처리 요청 → G-21-CR. 항목별 결정은 각 갭 「decision」 줄(2026-09-26 확정). 재리뷰·재검증 산출물은 -R2 파일로(21-REVIEW-R2.md · 21-VERIFICATION-R2.md) — 1차 기록 덮어쓰기 금지.
-->

## Current Test

[testing paused — 1 item outstanding (13 웹 회귀 · 사용자 보고 대기)]

## Tests

### 1. 탭바 시각 (D-02 · D-27a · D-15)
expected: 스케치 004 A 알약과 같다 — 높이 70 · 좌우 16 · 바닥 20(인셋 없는 기기 14) · 다크/라이트 색 · iPad 폭 560 가운데 · 하단 페이드 · Android 불투명 근사 수용 가능
result: issue
reported: "weekly-wine-app 도 이래? 좀 다른거 같은데? 탭바의 메뉴 하단에 라벨은 표시하지 말자."
severity: cosmetic

### 2. 활성 탭 (D-14) · 표시 (D-13)
expected: `/` 홈 · `/scanner`·`/themes`·`/watchlist`·`/search` 검색 · `/trading` 트레이딩 · `/chat` AI · `/me` 마이 · `/stocks/005930` 5개 전부 비활성 · iPad 가로에서도 탭바 표시
result: pass

### 3. 숨김 (D-12)
expected: `/login` 에서 탭바 없음 · 사이드바 드로어·키패드 시트·주문 확인 다이얼로그 열면 약 0.15초 뒤 사라지고 닫으면 돌아옴 · `/search` 입력 포커스 동안 숨김
result: pass

### 4. 탭 이동 (D-06 · D-06a)
expected: 탭을 눌러도 전체 새로고침 없이 바뀌고(트레이딩 상태줄 재연결 깜빡임 없음) 같은 탭 재탭 시 맨 위로
result: pass

### 5. 당겨서 새로고침 (D-04 · D-17 · D-16 · D-18)
expected: 홈·상승률 상위 당김 → 데이터 재수신 · 스피너 1초에 닫힘 · `/trading`·`/me` 는 relay 재탐침(입력값 유지) · 종목상세 당김 뒤 `POST …/news/refresh`·`…/discussions/refresh` 없음 · 호가 사다리·시트 열림 중 당김 안 됨
result: pass

### 6. 앱 셸 (D-09 · D-10 · D-25)
expected: iPad 가로 고정 사이드바 없음·햄버거 드로어 · 종목상세 챗 FAB 없음, 「AI 분석」 버튼이 챗 시트 · 「주문하기」 CTA·`/trading` 하단 패널·더티 바가 탭바 위 · 헤더가 상태바 뒤까지, 노치 가림 없음
result: pass

### 7. 네이티브 Google 로그인 (D-03)
expected: 마이 → 로그아웃 → `/login`(탭바 없음) → 「Google로 로그인」 → 계정 선택 → 홈 착지 · 두 번째 로그인 성공 · 취소 시 「Google 로그인을 취소하셨습니다…」
result: pass
note: "iOS 는 키체인 서명 수정(02f29df) 뒤 통과. Android 는 오케스트레이터가 운영에서 확인(Supabase id_token 200 · 홈 착지 · /trading 계좌 + 「DMA 실시간」). 이 라운드 초반 실패 2회는 Vercel 배포 완료 전(09:49 로드) 페이지를 싣고 있던 앱 → 옛 웹 OAuth 가 외부 Chrome/Safari 를 연 것으로, 재실행으로 해소. 에뮬레이터 Credential Manager 가 Play Services 업데이트 중 'No credentials available'(GoogleIdService 타임아웃) 2회 뒤 성공 — 실기기에서 관찰 필요"

### 8. 오프라인 (D-19)
expected: 비행기 모드로 새로 열거나 이동 → GH Trade 폴백(탭바 없음) · 복구 → 원래 경로 자동 복귀 · 탭 연타에 폴백 없음 · `/stocks/INVALID` 는 웹 404
result: pass

### 9. 테마 (D-23)
expected: `/me` 계정 카드 테마 전환 → 상태바·배경·탭바 즉시 변경 · 재실행 첫 화면부터 그 테마 · OS 다크모드 변경에 앱 테마 불변
result: pass

### 10. 회전 (D-24)
expected: iPhone 세로 고정 · iPad 4방향 회전
result: pass

### 11. Android 뒤로가기 (D-26)
expected: 시트 열림 → 뒤로 = 시트만 닫힘 → 이전 화면 → 탭 루트(홈 아님)면 홈 → 홈이면 종료 · 제스처/3버튼 내비 양쪽 탭바 바닥 여백 자연스러움
result: pass

### 12. 아이콘 · 스플래시 (D-22)
expected: 홈 화면 아이콘(다크 레이더) · 설정 앱 작은 아이콘에서도 레이더로 읽힘 · 스플래시 라이트/다크
result: pass

### 13. 웹 회귀 (브라우저 데스크톱 · iPhone Safari)
expected: 제목·로고 「GH Trade」 · 파비콘 · 사이드바 「검색」 → `/search` 허브 · `/me` 계정 카드 · iPhone Safari 가로 노치 가림 없음 · 기존 `gh-radar:` 저장 설정 유지
result: pass
reported: "웹회귀 문제없어" (2026-09-26)

## Summary

total: 13
passed: 12
issues: 1
pending: 0
skipped: 0
blocked: 0
new_requests: 3
uat3_issues: 6
code_review_findings: 13

## Gaps

- gap_id: G-21-1
  truth: "탭바가 사용자가 기대하는 weekly-wine-app 계열 모양이고, 탭 아이콘 아래 텍스트 라벨이 없다(접근성 라벨은 유지)"
  status: resolved
  resolved_by: 21-20-PLAN.md, 21-21-PLAN.md
  resolved_at: 2026-09-26
  recheck: "21-24 push-then-recheck — 실서버 앱 실기 확인은 /gsd-verify-work 21 에서"
  reason: "User reported: weekly-wine-app 도 이래? 좀 다른거 같은데? 탭바의 메뉴 하단에 라벨은 표시하지 말자."
  severity: cosmetic
  test: 1
  root_cause: "구현은 D-27a(스케치 004 A 알약) 상수를 그대로 따랐다 — 결함이 아니라 결정 변경 요청이다. 라벨 제거는 D-27a(「활성 = primary 라벨 10px」)와 어긋나므로 D-27a 를 개정해야 한다. weekly-wine 과의 눈에 띄는 차이(오케스트레이터 비교): (a) 활성 표시 — weekly-wine 은 아이콘+라벨을 감싸는 세로로 긴 둥근 사각형(radius 22 · 브랜드 12%), 우리는 아이콘 뒤 46pt 원만 있고 라벨이 원에 겹친다; (b) 색 — weekly-wine 와인 #5f0d3a / 토프 #b5ada7, 우리는 primary 파랑 / muted #6b7684(비활성이 더 어두움); (c) 우리는 1px line 테두리 + 그림자 0.18/r8, weekly-wine 은 테두리 없음 · iOS 그림자 0.12/r16 · Android 그림자 없음; (d) 유리 — weekly-wine iOS 는 흰색 82% 위 .extraLight 블러 + 점진 블러 페이드, 우리는 card 82% 틴트 아래 systemThinMaterial + 120 색 페이드(92%); Android 불투명도 우리 94% vs 86%; (e) weekly-wine 은 안쪽 여백 6pt · 22pt medium 아이콘 · 굵은 활성 라벨, 우리는 여백 없음 · 21pt regular 아이콘 · top 12. 라벨 외에 weekly-wine 의 어느 특성을 가져올지는 열린 디자인 결정이다(프로젝트 관례: HTML 목업 먼저 · 검토 게이트 후 구현)."
  artifacts:
    - path: "mobile/ios/App/App/GHTradeTabBar.swift"
      issue: "탭 라벨 UILabel 생성·배치·색(≈130, 154-159, 172-175, 184, 193). 제거 시 accessibilityLabel 은 유지하고 아이콘 수직 가운데 정렬로 바꿔야 한다"
    - path: "mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt"
      issue: "탭 라벨 TextView 생성·배치·색(≈123, 142-154, 163, 172). 제거 시 contentDescription 유지"
    - path: ".planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md"
      issue: "D-27a 가 「primary 라벨 10px」를 정본 상수로 박제 — 개정(D-27b 등) 필요"
    - path: ".planning/sketches/004-native-tab-bar/index.html"
      issue: "채택안 A 목업 — 새 목업(라벨 없음 + weekly-wine 특성 변형) 기준점"
  missing:
    - "라벨 없는 탭바 + weekly-wine 특성(활성 둥근 사각형 · 테두리 제거 · 그림자 · 유리/페이드 · 아이콘 크기/굵기 · 비활성 색) 조합 변형을 HTML 목업(다크/라이트 × 폰/iPad)으로 먼저 보여 주고 채택안을 받는다"
    - "채택안을 CONTEXT 에 D-27a 개정으로 박제"
    - "iOS GHTradeTabBar · Android GhTradeTabBar 에서 라벨 제거(접근성 라벨 유지) + 채택된 시각 상수 반영"
    - "탭바 높이가 바뀌면 웹 본문 하단 여백(--native-body-reserve 108 = 70+20+18)과 native-shell e2e 도 같이 조정"
  decision: "사용자 확정(2026-09-26): 라벨 제거 + sketch 007 C 채택 — 캡슐 인디케이터(아이콘 뒤 56×36 · primary 16%) · 테두리 없음 · 유리(블러 28+채도) · 넓고 옅은 그림자 · 높이 60(radius 30) · 바닥 규칙 유지 · 웹 본문 하단 여백 98. D-27a 개정 · iOS/Android 상수 · --native-tabbar-offset/--native-body-reserve · native-shell e2e 동반 수정"
  debug_session: ""

- gap_id: G-21-13
  truth: "웹 회귀 없음 — 제목·로고 「GH Trade」 · 파비콘 · 사이드바 검색 → /search · /me 계정 카드 · iPhone Safari 가로 노치 · 기존 gh-radar: 저장 설정 유지"
  status: resolved
  reason: "사용자 보고(2026-09-26): 웹회귀 문제없어 → pass. 갭 닫힘, 플랜 불필요"
  severity: minor
  test: 13
  root_cause: "결함 아님 — 미확인 항목"
  artifacts: []
  missing:
    - "사용자 재시험(브라우저 데스크톱 · iPhone Safari)만 필요. 코드 작업 없음. /gsd-verify-work 21 로 이어서 받는다. 갭 플랜을 만들지 않는다"
  debug_session: ""

- gap_id: G-21-N1
  truth: "첫 실행(저장된 테마 없음)의 기본 테마가 다크이고, 웹 기본값과 네이티브 첫 프레임 기본값이 같다"
  status: resolved
  resolved_by: 21-18-PLAN.md
  resolved_at: 2026-09-26
  recheck: "21-24 push-then-recheck — 실서버 앱 실기 확인은 /gsd-verify-work 21 에서"
  reason: "User requested: 기본 테마를 다크로 (UAT 2차 신규 요청)"
  severity: minor
  test: new-request
  root_cause: "세 곳 모두 라이트가 기본값이다 — 웹 next-themes defaultTheme=\"light\"(enableSystem=false), iOS ThemeStore.load() 가 미저장 시 .light, Android ThemeStore 가 미저장 시 \"light\". 한 곳만 바꾸면 네이티브 첫 프레임(창 배경·상태바·탭바)과 웹 첫 페인트가 어긋나 번쩍임이 생긴다(D-23 동기화 전제)."
  artifacts:
    - path: "webapp/src/components/providers/theme-provider.tsx"
      issue: "defaultTheme=\"light\" (21행)"
    - path: "mobile/ios/App/App/ThemeStore.swift"
      issue: "load() 기본값 .light (12행)"
    - path: "mobile/android/app/src/main/java/com/ghtrade/app/ThemeStore.kt"
      issue: "getString(KEY, \"light\") 기본값 (16행) · 주석 8행 「미저장은 라이트(웹 기본값)」"
    - path: "mobile/www/index.html"
      issue: "오프라인 폴백은 ?theme=dark 쿼리일 때만 다크 — 기본값 전달 경로 점검"
  missing:
    - "웹 defaultTheme · iOS/Android ThemeStore 기본값을 함께 dark 로 바꾸고, 저장값이 있는 기존 사용자는 그대로 둔다"
    - "열린 질문: 브라우저 사용자도 기본 다크인가, 앱만인가. 권장 = 웹·앱 공통(기본값이 갈리면 앱 첫 프레임과 웹 첫 페인트 동기화 규칙이 둘로 나뉜다) — 플랜 전에 사용자 확인"
    - "테마 관련 단위/e2e 테스트의 라이트 기본 가정 갱신"
  decision: "사용자 확정(2026-09-26): 기본 테마 = 다크, 앱·브라우저 공통 (저장값이 없을 때의 기본값)"
  debug_session: ""

- gap_id: G-21-N2
  truth: "사이드바 ThemeToggle 과 /me 계정 카드의 테마 아이콘이 같은 규칙을 따른다"
  status: resolved
  resolved_by: 21-19-PLAN.md
  resolved_at: 2026-09-26
  recheck: "21-24 push-then-recheck — 실서버 앱 실기 확인은 /gsd-verify-work 21 에서"
  reason: "User requested: 테마 아이콘 방향 통일 (UAT 2차 신규 요청)"
  severity: cosmetic
  test: new-request
  root_cause: "두 컴포넌트가 반대 규칙이다 — 사이드바 ThemeToggle 은 「현재 테마」(라이트=Sun, 다크=Moon), /me AccountCard 는 「누르면 갈 곳」(라이트=Moon, 다크=Sun, 주석 23행에 명시)."
  artifacts:
    - path: "webapp/src/components/layout/theme-toggle.tsx"
      issue: "Icon = current === 'light' ? Sun : Moon (현재 상태 표시) · aria-label 「라이트 모드 (클릭 시 다크 모드)」"
    - path: "webapp/src/components/me/account-card.tsx"
      issue: "다크일 때 Sun · 라이트일 때 Moon (목적지 표시, 23·96·98행)"
  missing:
    - "규칙 하나로 통일. 권장 = 「누르면 갈 곳」(목적지) 표시 — 한 번 누르는 토글 버튼에서 흔한 관례(macOS·GitHub·다수 문서 사이트)이고 아이콘이 행동을 예고한다. aria-label 은 두 곳 모두 「다크 모드로 전환」처럼 행동 문구로 맞춘다. 열린 질문으로 사용자 확인 후 확정"
    - "theme-toggle · account-card 테스트의 아이콘 기대값(data-icon) 갱신"
  decision: "사용자 확정(2026-09-26): 누르면 바뀔 테마(목적지)를 보여 준다 — 사이드바 ThemeToggle 을 AccountCard 규칙에 맞춘다"
  debug_session: ""

- gap_id: G-21-N3
  truth: "앱에서 홈 뉴스 링크를 누르면 외부 브라우저 앱이 아니라 앱 안 브라우저(iOS SFSafariViewController · Android Custom Tabs)로 열린다"
  status: resolved
  resolved_by: 21-17-PLAN.md, 21-22-PLAN.md
  resolved_at: 2026-09-26
  recheck: "21-24 push-then-recheck — 실서버 앱 실기 확인은 /gsd-verify-work 21 에서"
  reason: "User requested: 홈 뉴스 링크를 인앱 브라우저로 (UAT 2차 신규 요청)"
  severity: minor
  test: new-request
  root_cause: "뉴스 앵커는 target=\"_blank\" rel=\"noopener noreferrer\"(T-13-11 tabnabbing 방어)이고, Capacitor 기본 동작은 서버 호스트 밖 URL·새 창 요청을 시스템 브라우저로 넘긴다. 셸(NavigationDelegateProxy · GhTradeWebViewClient)에는 외부 링크를 가로채는 코드가 없다(iOS 는 실패 처리만 프록시, Android 는 onPageFinished·doUpdateVisitedHistory·onReceivedError 만 재정의)."
  artifacts:
    - path: "webapp/src/components/home/news-block.tsx"
      issue: "홈 뉴스 앵커 target=_blank (57행)"
    - path: "webapp/src/components/stock/news-item.tsx"
      issue: "종목상세 뉴스 앵커 target=_blank (39행) — 범위에 넣을지 결정 필요"
    - path: "mobile/ios/App/App/NavigationDelegateProxy.swift"
      issue: "decidePolicyFor / createWebViewWith 가로채기 없음"
    - path: "mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt"
      issue: "shouldOverrideUrlLoading 없음 · 새 창(onCreateWindow)은 BridgeWebChromeClient 기본"
  missing:
    - "방식 결정. (가) 네이티브 가로채기 — iOS: 서버 호스트 밖 http(s) 탐색·새 창 요청을 SFSafariViewController 로 표시(프레임워크 내장, 새 패키지 없음). Android: 호스트 밖 http(s) 를 Custom Tabs 로 — androidx.browser 의존성이 필요한지 먼저 확인(Capacitor 8 이 이미 끌어오는지 점검, 새 의존성이면 패키지 정당성 게이트). (나) @capacitor/browser 플러그인 + 웹에서 isNativeApp 분기 — 새 npm 패키지라 패키지 정당성 게이트 필요, 웹 코드 수정 지점이 앵커마다 생김. 권장 = (가): 웹 무수정 · 모든 외부 링크에 일관 · 새 JS 패키지 없음"
    - "범위 결정(열린 질문): 뉴스만인가 모든 외부 링크(종토방 원문·공시 등)인가. 권장 = 호스트 밖 http(s) 전부(규칙 하나가 링크별 분기보다 단순하고, OAuth 는 21-15 네이티브 로그인이라 영향 없음). 단 mailto:·tel:·앱 딥링크는 기존대로 시스템에 넘긴다"
    - "Supabase OAuth·Google 도메인 등 셸이 반드시 외부로 넘겨야 하는 호스트가 있는지 점검(네이티브 로그인 뒤에는 없어야 정상)"
  decision: "사용자 확정(2026-09-26): 사이트(서버 호스트) 밖 http(s) 링크 전부를 인앱 브라우저로. mailto·tel·앱 딥링크는 시스템에 넘긴다. 방식은 권장안(셸 네이티브 가로채기 · 새 패키지 없음)으로 진행하되 플랜에서 재확인"
  debug_session: ""

- gap_id: G-21-R3-1
  truth: "키보드가 올라올 때 탭바가 키보드보다 먼저(또는 같이) 즉시 사라지고, 키보드 위에 탭바가 걸려 있는 프레임이 보이지 않는다"
  status: failed
  reason: "User reported (UAT 3차): 키보드가 올라오면서 탭바가 내려갈 때, 탭바가 너무 늦게 내려가서 어색해. 탭바가 빨리 사라져야 될 거 같아."
  severity: minor
  test: uat3-1
  root_cause: "숨김 신호는 제때 온다(iOS keyboardWillShow · Android OnGlobalLayout 의 ime 가시성). 그러나 숨김 공통 경로가 리다이렉트/오버레이 깜빡임 방지용 150ms 대기 + 200ms 페이드(8pt 하강, 기본 ease)를 키보드 사유에도 똑같이 적용해 약 350ms 뒤에야 사라진다(iOS 키보드 ≈0.25s). iOS 는 userInfo duration/curve 를 읽지 않는다. Android 는 IME 인셋이 반영된 레이아웃 뒤에야 판정해 탭바(Gravity.BOTTOM)가 키보드 윗변 위로 한 번 끌려 올라간 뒤 숨는다(WindowInsetsAnimationCompat 미사용 — 기기 미확인 추정)."
  artifacts:
    - path: "mobile/ios/App/App/GHTradeBridgeViewController.swift"
      issue: "keyboardWillShow/WillHide(≈321-335) → updateTabBarVisibility 숨김 경로 asyncAfter 0.15 + animate 0.2(≈350-379). 초기 상태가 보임(≈188 · G-21-R3-4 와 공통 파일)"
    - path: "mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt"
      issue: "OnGlobalLayoutListener ime 판정(≈293-300) · 숨김 postDelayed 150 + 200ms 페이드(≈381-397)"
  missing:
    - "숨김 사유 구분(키보드 = 즉시). 키보드 숨김은 150ms 대기 없이 키보드보다 짧은 페이드(iOS: userInfo duration·curve 사용, 예 duration×0.5)로. translationY 는 빼거나 줄여 「바로 사라짐」으로"
    - "Android: 탭바에 ViewCompat.setWindowInsetsAnimationCallback — onPrepare(ime 표시 방향)에서 최종 레이아웃 전에 즉시 숨김. OnGlobalLayout 은 상태 보정용으로만"
    - "재표시 쪽에 짧은 디바운스(≈80-100ms)를 옮겨 입력칸 이동 때 willHide→willShow 연속을 흡수"
    - "선택: iOS KeyboardFrameEnd 가 하단을 실제로 가릴 때만 keyboardVisible(하드웨어·iPad 플로팅 키보드 오판 방지)"
  decision: "사용자 요청(2026-09-26): 탭바가 키보드보다 빨리 사라져야 한다 — 방향은 위 missing 그대로(추가 결정 없음)"
  debug_session: ""

- gap_id: G-21-R3-2
  truth: "앱(html.native-app)에서는 /trading 하단 공용 패널(잔고/미체결/전략 로그)이 보이지 않고, 앱에서 사라지는 전 종목 전략 로그는 마이 탭(/me)에서 볼 수 있다. 브라우저는 그대로다"
  status: failed
  reason: "User requested (UAT 3차): 앱 버전에서는 트레이딩 페이지 하단의 잔고/미체결/전략 로그를 숨겨줘. 탭바가 있으니까."
  severity: minor
  test: uat3-2
  root_cause: "SharedPanels(workbench/shared-panels.tsx)는 폰 폭에서 body 포털 fixed bottom(+ 흐름 안 spacer), 넓은 폭은 카드 격자 아래 일반 섹션이다. 앱에서는 globals.css(≈694-699)가 bottom 을 --native-tabbar-offset 으로 올려 탭바 위에 겹쳐 쌓는다. 숨김 분기는 첫 페인트 전 붙는 html.native-app 클래스(CSS) 가 하이드레이션 깜빡임이 없다(JS isNativeApp 은 SSR false)."
  artifacts:
    - path: "webapp/src/styles/globals.css"
      issue: "html.native-app [data-slot=shared-panels] bottom 보정(≈694-699) → display:none(패널 + shared-panels-spacer). 652 주석 대상 목록 갱신"
    - path: "webapp/src/components/trading/workbench/shared-panels.tsx"
      issue: "머리 주석 ⑤-c(≈54-58) 갱신. 숨기면 --wb-bottom-inset 이 0"
    - path: "webapp/src/components/trading/card/strategy-card.tsx"
      issue: "카드 더티 바 고정(≈651-680)이 innerHeight − --wb-bottom-inset 만 비켜 선다 — 앱 탭바 몫이 빠져 있어(기존 결함) 패널을 숨기면 바가 탭바 밑으로 들어간다. --native-tabbar-offset 은 calc 문자열이라 프로브 요소 computed bottom 으로 px 를 읽어 더해야 한다"
    - path: "webapp/src/components/trading/me-client.tsx"
      issue: "/me 에 미체결·잔고·전략 현황·오늘 주문은 있으나 전 종목 전략 로그가 없다"
    - path: "webapp/e2e/specs/trading-workbench.spec.ts"
      issue: "relay 목이 있는 곳 — installNativeApp 으로 390·1024 폭 앱 모드 패널 숨김 / 브라우저 표시 e2e 추가"
  missing:
    - "앱에서 공용 패널 + spacer 를 CSS 로 숨김(폰·iPad 모두). 브라우저 무변경"
    - "카드 더티 바 고정이 앱 탭바 높이를 비켜 서도록 보정(프로브로 px 해석)"
    - "마이 탭(/me)에 전 종목 전략 로그 섹션 추가 — 새 화면 요소이므로 HTML 목업(다크/라이트 · 폰) 먼저 보여 주고 채택 후 구현(프로젝트 관례)"
    - "잃는 동작 ② 잔고 행 → 카드 생성·포커스 ③ 카드 없는 종목 미체결 정정 진입은 이번 범위 밖(앱에서 없음)으로 기록 — 플랜에서 사용자에게 재확인만"
    - "e2e: 앱 모드 패널 숨김 · 브라우저 표시 · /me 전략 로그"
  decision: "사용자 확정(2026-09-26): 앱에서 숨기고(폰·iPad 공통) 마이 탭에 보강 — 보강 대상은 전 종목 전략 로그"
  debug_session: ""

- gap_id: G-21-R3-3
  truth: "주문금액(만원 단위) 키패드 칩이 「천만 · 오천만 · 1억 · 지우기」이고, 각각 현재 값에 1,000 · 5,000 · 10,000(만원)을 더한다"
  status: failed
  reason: "User requested (UAT 3차): 주문금액 입력 컴포넌트의 단위는 천만 오천만 1억. (만원 단위 입력이니까 1000 5000 10000)"
  severity: minor
  test: uat3-3
  root_cause: "칩 상수 webapp/src/lib/numpad.ts:91 `만원: [add(10), add(50), add(100), CLEAR]` — 라벨 「+10/+50/+100」. add() 헬퍼는 「+1,000」 라벨을 만들므로 라벨을 직접 적어야 한다. '만원' 칩을 쓰는 필드는 buyOrderAmount(lc-fields.ts:114) 하나, 터치 키패드 시트에서만 보인다. 상한: 클라이언트 9자리 · relay uint — 1억(10000) 문제없음."
  artifacts:
    - path: "webapp/src/lib/numpad.ts"
      issue: "91행 만원 칩 → {label:'천만', ariaLabel:'1,000만원 더하기', op:add 1000} · 오천만 5000 · 1억 10000 · CLEAR"
    - path: "webapp/src/lib/__tests__/numpad.test.ts"
      issue: "라벨 배열(≈90) · 「만원 +50 on 100 → 150」(≈144-146) 기대값 갱신"
    - path: ".planning/phases/20-toss-order-ticket/20-CONTEXT.md"
      issue: "D-17(≈59) 칩 정본 갱신"
  missing:
    - "칩 라벨·값 교체(더하기 유지) · 단위 테스트 갱신 · 20-CONTEXT D-17 정본 갱신"
  decision: "사용자 확정(2026-09-26): 라벨 천만/오천만/1억 · 값 1000/5000/10000(만원) · 동작은 지금처럼 더하기 유지"
  debug_session: ""

- gap_id: G-21-R3-4
  truth: "첫 로그인(및 전체 문서 로드) 뒤 탭바가 로그인 화면 잔상·빈 화면 위에 먼저 뜨지 않고, 새 페이지가 그려진 뒤 부드럽게 나타난다. iOS 콜드 스타트에서도 판정 전엔 숨김이다"
  status: failed
  reason: "User reported (UAT 3차): 처음 로그인할 때, 홈이 로딩중인데 탭바가 나와서 어색해. 어색하지 않게 조정해줘"
  severity: minor
  test: uat3-4
  root_cause: "네이티브가 URL 만 보고 즉시(대기 없이 200ms 페이드인) 표시한다 — iOS 는 webView.url KVO(provisional 단계부터 새 URL), Android 는 doUpdateVisitedHistory(커밋, 첫 페인트 전). 로그인은 location.replace 로 전체 문서를 다시 로드하므로 /login(숨김) → / 사이 로그인 잔상·빈 화면·스켈레톤 구간 내내 탭바가 먼저 떠 있다. 부가 결함: iOS 는 setupTabBar 끝에서 currentPath 기본값 \"/\" 로 보임 상태로 시작(Android 는 GONE 시작)."
  artifacts:
    - path: "mobile/ios/App/App/GHTradeBridgeViewController.swift"
      issue: "url KVO → handleURL → applyPath(≈293-317) 즉시 표시 · 초기 보임(≈39, 188)"
    - path: "mobile/ios/App/App/NavigationDelegateProxy.swift"
      issue: "didStartProvisionalNavigation/didCommit 에서 문서 로드 시작 표시(awaitingContent)"
    - path: "mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt"
      issue: "onUrlChanged → applyPath(≈312-335) 즉시 표시(≈398-406)"
    - path: "mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt"
      issue: "onPageStarted 에서 awaitingContent · doUpdateVisitedHistory(≈44-47)"
  missing:
    - "전체 문서 로드 시작 시 awaitingContent=true → shouldHideTabBar 에 포함 → 그 문서의 첫 route 메시지(하이드레이션 뒤, 기존 계약 재사용 — 웹 무수정) 또는 타임아웃(≈1.5s)에 해제하고 250-300ms ease-out 페이드인. SPA 탭 이동(pushState)은 영향 없음"
    - "iOS 초기 상태를 Android 처럼 숨김으로 시작"
    - "iOS/Android 빌드·스모크 + 로그인→홈 전환 실기 확인(UAT)"
  decision: "사용자 확정(2026-09-26): 화면이 그려진 뒤 표시(권장안 A — 기존 route 메시지를 준비 신호로 재사용, 웹 계약 변경 없음, 최대 1.5초 타임아웃). 홈 데이터 로드까지 기다리는 안은 채택 안 함"
  debug_session: ""

- gap_id: G-21-R3-5
  truth: "매수/매도 탭의 가격 섹션 카드(매수가격·주문금액 / 매도 가격)의 위 여백이 제목 있는 다른 카드와 맞고, 카드 안 위아래가 대칭이다"
  status: failed
  reason: "User reported (UAT 3차): 매수/매도탭에 매수가격 주문금액 있는 카드의 상단 여백이 다른 데보다 큰 거 같아. 카드 타이틀 라벨을 없애면서 여백이 중첩된 게 아닌가 싶은데 체크해줘."
  severity: cosmetic
  test: uat3-5
  root_cause: "라벨 제거 이력은 없다(가격 섹션은 49f42ea/20-04 부터 D-19 로 제목 없이 설계). 그러나 여백 중첩은 맞다 — SettingGroup 카드 pt-2.5(10px)는 제목 줄을 전제로 한 값인데, 제목 없는 가격 섹션은 첫 행이 min-h-[44px] items-center 라 행 안에 (44−22.5)/2≈10.75px 가 또 생긴다 → 카드 위에서 첫 글자까지 ≈20.75px(제목 있는 카드 ≈10.75px 의 약 2배), 같은 카드 아래쪽 ≈14.75px 와 비대칭."
  artifacts:
    - path: "webapp/src/components/trading/lc/setting-group.tsx"
      issue: "카드 px-2.5 pt-2.5 pb-1(≈281) → spec.title ? 'pt-2.5' : 'pt-1'"
    - path: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx"
      issue: "가격 섹션 테스트(≈180-190)에 pt-1 단언 추가(≈175 pt-2.5 는 제목 있는 buy 그룹이라 유지)"
  missing:
    - "제목 없는 그룹 상단 패딩을 pt-1 로 → 위 ≈14.75px 로 아래와 대칭 · 제목 있는 카드와 차이 4px 이내"
  decision: "진단 결과 보고 — 원인은 라벨 제거가 아니라 제목 전제 패딩 + 44px 행 내부 여백 중첩. 권장 수정 그대로 진행(손보는 표면 안 시각 결함)"
  debug_session: ""

- gap_id: G-21-R3-6
  truth: "트레이딩 종목카드의 닫기(✕) 버튼이 카드의 다른 아이콘 버튼과 크기가 조화롭고 터치 히트 영역이 44×44 이상이다"
  status: failed
  reason: "User reported (UAT 3차): 트레이딩 페이지에서 종목카드의 x 버튼이 너무 작아. 디자인 조화 생각해서 조정해줘."
  severity: cosmetic
  test: uat3-6
  root_cause: "card-header.tsx(≈275-287) 닫기 = 텍스트 글리프 「✕」 11px · 상자 h-[26px] px-2 → 히트 ≈27×26px. 카드에서 가장 작은 글자(ⓘ 13px · 종목명/현재가 15px). 비교: 종목정보 모달 닫기 h-8 w-8 + 14px, 수동주문 해제 44×44, 그룹 스위치 after: 로 44×44 확장, ui/button sm=h-8 · 아이콘 size-4. WCAG 2.5.8(24) 은 만족하나 HIG 44pt 에 못 미친다."
  artifacts:
    - path: "webapp/src/components/trading/card/card-header.tsx"
      issue: "닫기 버튼(≈275-287)"
  missing:
    - "시각 상자 size-8(32×32, 모달 닫기·Button sm 과 같음) + lucide X size-4(또는 글리프 14px) · 헤더 줄 높이 유지 -my-[3px] · 히트 after:-inset-1.5 로 44×44 · 색 --muted-fg / hover --fg · order-last·stopPropagation·aria-label·title 유지"
  decision: "진단 제안대로 조정(손보는 표면 안 시각 결함 — 별도 목업 없이 구현 후 UAT 에서 확인)"
  debug_session: ""

- gap_id: G-21-CR
  truth: "21-REVIEW.md 의 발견 13건(Warning WR-01~05 · Info IN-01~08)이 모두 수정되거나, 수정하지 않는 건은 근거가 기록돼 있다"
  status: failed
  reason: "User requested (2026-09-26): 코드 리뷰의 수정사항도 다 처리해줘"
  severity: major
  test: code-review
  root_cause: "21-REVIEW.md 참조(정본). 요지 — WR-01 로그인 next 가드가 /%5C 우회 허용(오픈 리다이렉트, native-bridge-provider isSafeInternalPath 공유로 해결) · WR-02 Android allowBackup=true 로 WebView 세션 쿠키가 백업에 실림 · WR-03 Android 브리지가 호출 프레임·스킴·포트를 보지 않음(addWebMessageListener 로 허용 출처 + isMainFrame) · WR-04 Radix Popover 에 오버레이 마커 없음(Android 뒤로가기가 팝오버 대신 페이지 이동, D-26 ① 위반) · WR-05 /search 늦은 응답이 새 검색어 결과로 표시. Info 8건(pullBlocked 초기화 · 운영 오프라인 페이지 localhost:3100 허용 · Android 오프라인 뒤로가기 루프 추정 · stock-detail-tabs 주석 108→98 · README 명령표 불일치 · themeColor OS 추종/옛 다크색 · 최근 검색 코드 형식 검증 · 스모크 기기 미지정)."
  artifacts:
    - path: ".planning/phases/21-gh-trade-mobile-app/21-REVIEW.md"
      issue: "발견 13건 정본(파일·줄·수정안)"
  missing:
    - "Warning 5건 전부 수정 + 회귀 테스트(WR-01 우회 케이스 단위 테스트 · WR-04 팝오버 뒤로가기 · WR-05 경쟁 응답)"
    - "Info 8건 전부 처리(추정 건 IN-03 은 재현 확인 후 수정 또는 근거 기록)"
    - "WR-03 은 Android 브리지 구조 변경이라 iOS 와 출처 규칙을 맞추고 네이티브 스모크로 확인"
    - "처리 후 재리뷰는 21-REVIEW-R2.md(1차 덮어쓰기 금지 · findings ID 라운드 네임스페이스)"
  decision: "사용자 확정(2026-09-26): 코드 리뷰 수정사항 전부 처리(Info 포함)"
  debug_session: ""
