---
status: diagnosed
phase: 21-gh-trade-mobile-app
source: 21-01-SUMMARY.md, 21-02-SUMMARY.md, 21-03-SUMMARY.md, 21-04-SUMMARY.md, 21-05-SUMMARY.md, 21-06-SUMMARY.md, 21-07-SUMMARY.md, 21-08-SUMMARY.md, 21-09-SUMMARY.md, 21-10-SUMMARY.md, 21-11-SUMMARY.md, 21-12-SUMMARY.md, 21-13-SUMMARY.md, 21-14-SUMMARY.md, 21-15-SUMMARY.md, 21-16-SUMMARY.md
started: 2026-09-26T00:52:04Z
updated: 2026-09-26T01:35:06Z
---

<!--
UAT 2차(실서버). 앱 = 운영 URL 빌드(https://trade.jx1.io) · 웹 = push bac3746 뒤 Vercel 프로덕션.
기기: iPhone 17 · iPad Pro 11-inch (M5) (iOS 27.0 시뮬레이터) · Android emulator-5554 (Medium_Phone_API_36.1).
항목 정의 정본 = 21-16-PLAN.md Task 2 <how-to-verify> 1~13 (14 = push 결정, 이미 push 됨).
UAT 1차(로컬 dev) 결과·수정은 21-16-SUMMARY.md 「UAT 1차 결과」.
status: diagnosed = 이슈 1건·신규 요청 3건의 원인/방향이 적혀 있고 /gsd-plan-phase 21 --gaps 로 넘길 준비가 됐다.
테스트 13 은 아직 [pending] 이라 /gsd-verify-work 21 로 이어서 받을 수 있다.
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
result: [pending]

## Summary

total: 13
passed: 11
issues: 1
pending: 1
skipped: 0
blocked: 0
new_requests: 3

## Gaps

- gap_id: G-21-1
  truth: "탭바가 사용자가 기대하는 weekly-wine-app 계열 모양이고, 탭 아이콘 아래 텍스트 라벨이 없다(접근성 라벨은 유지)"
  status: failed
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
  debug_session: ""

- gap_id: G-21-13
  truth: "웹 회귀 없음 — 제목·로고 「GH Trade」 · 파비콘 · 사이드바 검색 → /search · /me 계정 카드 · iPhone Safari 가로 노치 · 기존 gh-radar: 저장 설정 유지"
  status: pending
  reason: "사용자 보고 대기 — UAT 2차 답에 13번 결과가 없었다"
  severity: minor
  test: 13
  root_cause: "결함 아님 — 미확인 항목"
  artifacts: []
  missing:
    - "사용자 재시험(브라우저 데스크톱 · iPhone Safari)만 필요. 코드 작업 없음. /gsd-verify-work 21 로 이어서 받는다. 갭 플랜을 만들지 않는다"
  debug_session: ""

- gap_id: G-21-N1
  truth: "첫 실행(저장된 테마 없음)의 기본 테마가 다크이고, 웹 기본값과 네이티브 첫 프레임 기본값이 같다"
  status: failed
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
  debug_session: ""

- gap_id: G-21-N2
  truth: "사이드바 ThemeToggle 과 /me 계정 카드의 테마 아이콘이 같은 규칙을 따른다"
  status: failed
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
  debug_session: ""

- gap_id: G-21-N3
  truth: "앱에서 홈 뉴스 링크를 누르면 외부 브라우저 앱이 아니라 앱 안 브라우저(iOS SFSafariViewController · Android Custom Tabs)로 열린다"
  status: failed
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
  debug_session: ""
