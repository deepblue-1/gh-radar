---
phase: 21-gh-trade-mobile-app
round: 2
reviewed: 2026-09-26T12:56:00Z
base: aba7954
head: 2743a46191fd7b138f52543278073b1e8d8449b4
round1_findings: 13
round1_fixed: 13
round1_partial: 0
round1_not_fixed: 0
round2_findings: 0
status: round1_resolved
---

# Phase 21: 코드 리뷰 라운드 2 — 1차 발견 처리 대조

> **규칙:** execute-phase 코드 리뷰가 이 라운드에 다시 돌면, 그 출력은 이 파일의 「라운드 2 발견」 절에 합친다. ID 에는 R2- 접두를 붙인다(예: `R2-WR-01`). 1차 기록인 `21-REVIEW.md` 는 덮어쓰지 않는다.

- 1차 정본: [21-REVIEW.md](./21-REVIEW.md) (2026-09-26T05:31:28Z · Warning 5 · Info 8 · 합계 13). 이 파일은 그 기록을 읽기만 했다.
- 라운드 범위: `aba7954..2743a461`. UAT 3차 갭 클로징 21-25 ~ 21-34 와, 그 사이에 끼어든 다른 세션 커밋이 들어 있다.
- 증거 명령은 21-35 실행 시점(2026-09-26 21:5x KST)에 HEAD `2743a461` 에서 다시 돌렸다. 단위·e2e 결과는 21-35 Task 1 게이트 값이다: relay 630 · webapp 2404 passed · Playwright 191 passed.
- 이 플랜에서는 별도의 전면 재리뷰를 하지 않았다(플랜 지시).

## 1차 발견 처리 대조

| ID | 처리 | 플랜 | 커밋 | 증거 (명령 → 결과) | 비고 |
|---|---|---|---|---|---|
| WR-01 | 수정 | 21-27 Task 1 | `05671f9` | `grep -rl isSafeInternalPath webapp/src \| grep -v __tests__` → login/page · auth/callback/route · native-bridge-provider · safe-path, 정의는 `safe-path.ts:11` 한 곳뿐. `page.test.tsx` 「?next=/%5Cevil.com → location.replace("/")」가 게이트 webapp 2404 passed 에 들어 있다 | 1차 제안대로 가드 셋을 한 함수로 합쳤다(콜백 포함) |
| WR-02 | 수정 | 21-29 Task 2 | `3d6e435` | `grep` 매니페스트 → `allowBackup="false"` · `fullBackupContent="false"` · `dataExtractionRules="@xml/data_extraction_rules"`. `res/xml/data_extraction_rules.xml` 이 있다. 21-29 aapt2 덤프에서 `BACKUP OFF OK` | cloud-backup · device-transfer 모두 root · file · database · sharedpref · external 를 제외한다 |
| WR-03 | 수정 | 21-28 Task 2 (iOS) · 21-29 Task 2 (Android · 21-25 답 a) | `d237822` · `3d6e435` | Android: `app/build.gradle:47` `androidx.webkit:webkit:$androidxWebkitVersion`, `GhTradeBridge.kt` 에서 `addWebMessageListener`·`isMainFrame` 3곳. 21-29 에뮬레이터 로그 `bridge channel=webmessage origin=http://localhost:3100`, 하위 프레임 `route /sub` 는 버려졌다. iOS: `GHTradeBridgeViewController.swift` 가 `securityOrigin` 으로 스킴·호스트·포트를 모두 비교한다. 게이트 `native:smoke:ios` · `native:smoke:android` 는 SMOKE OK 였다 | 21-25 사용자 답은 **a**(androidx.webkit 선언 + WebMessageListener)다. 남는 위험은 아래 근거 단락에 적었다 |
| WR-04 | 수정 | 21-27 Task 3 | `09de489` (RED) · `abd2146` (GREEN) | `grep NativeOverlayMarker webapp/src/components/ui/popover.tsx` → import(7) · `PopoverPrimitive.Content` 첫 자식(41). 21-27 단위 테스트: 팝오버 열림이 계수에 잡히고 `back()` 이 팝오버를 닫으며 브라우저 송신은 0 | 계수는 하나로 유지했다(21-27 결정). 팝오버가 열린 동안 탭바를 숨기는 것은 D-12 ③ 오버레이 규칙과 같은 판정이다. 실기 뒤로가기 확인은 실서버 재확인 대상(21-35 SUMMARY)에 넣었다 |
| WR-05 | 수정 | 21-27 Task 2 | `f3215e2` (RED) · `9b763d7` (GREEN) | `grep -c resultsQuery` → `hooks/use-debounced-search.ts` 4 · `search-page-client.tsx` 5. `grep -rn settledQuery webapp/src` → 0. `search-page-client.test.tsx` 「늦은 응답(WR-05)」 2건이 게이트에 들어 있다 | Enter 는 `resultsQuery === trimmed` 일 때만 이동한다 |
| IN-01 | 수정 | 21-29 Task 1 | `d430aec` | `grep -n "pullBlocked = false" MainActivity.kt` → 459행(`"ready"` 분기) | — |
| IN-02 | 수정 | 21-28 Task 2 (iOS 신호) · 21-29 Task 3 (Android 신호 · 폴백 페이지) | `d237822` · `446cd80` | `www/index.html` 에 `PROD_ORIGINS=['https://trade.jx1.io']` · `DEV_ORIGINS=['http://localhost:3100']` 가 따로 있고, `dev=1` 일 때만 둘을 합친다. `MainActivity.kt:264` · `GHTradeBridgeViewController.swift:344` 는 루프백 http 서버일 때만 `dev=1` 을 붙인다. `theme-default.spec.ts` 「오프라인 폴백 복귀 대상(IN-02)」 3건이 게이트 Playwright 에 들어 있다 | 1차 수정안 중 두 번째(`?dev=1` 일 때만 localhost 허용)를 택했다 |
| IN-03 | 수정 (재현 뒤) | 21-29 Task 3 | `446cd80` | 21-29 재현 기록: 수정 전에는 BACK 3회 모두 폴백으로 다시 들어갔다(누적 1→4, 앱이 앞에 남음) → **재현(루프)**. 수정 뒤에는 BACK 1회에 앱이 종료됐다. `grep -n "isOfflinePage -> finish()" MainActivity.kt` → 288행 | 1차 리뷰가 「재현 확인 필요」로 둔 항목이다. 에뮬레이터에서 루프가 재현돼 수정했다 |
| IN-04 | 수정 | 21-34 Task 1 | `86563a6b` | `grep -c 108 stock-detail-tabs.tsx` → 0. 주석은 「탭바 몫은 본문 98 (`--native-body-reserve` · IN-04)」 이다(247행) | — |
| IN-05 | 수정 | 21-28 Task 3 | `3f00e92` | `package.json` 의 `native:*` 13개를 README 에서 하나씩 grep 했다 → 빠진 것 0개. `native:check-external-links:ios` 행이 있고, `native:test:android` = `TabRoutesTest` · `ExternalLinksTest` 다 | — |
| IN-06 | 수정 | 21-27 Task 3 | `09de489` (RED) · `abd2146` (GREEN) | `layout.tsx:49` `themeColor: '#17171c'` 단일값이다. `ThemeColorSync`(theme-provider.tsx)가 클라 내비 뒤에도 `resolvedTheme` 에 맞춰 다시 적용한다. `theme-default.spec.ts` 「theme-color 메타 = 앱 테마(IN-06)」 3건이 게이트에 들어 있다 | 한 번 설정하는 것으로는 부족했다. App Router 가 내비마다 메타를 새로 만든다. 그래서 21-27 편차 1로 MutationObserver 를 써서 다시 적용한다 |
| IN-07 | 수정 | 21-27 Task 2 | `f3215e2` (RED) · `9b763d7` (GREEN) | `recent-search.ts:20` `RECENT_CODE_RE = /^[0-9A-Z]{6}$/`, `:33` sanitize 가 이 식으로 거른다. `recent-search.test.ts` IN-07(읽기 · push 2건)이 게이트에 들어 있다 | 쓰기(`pushRecentSearch`)도 형식이 맞지 않으면 저장하지 않는다 |
| IN-08 | 수정 | 21-28 Task 3 | `3f00e92` | `smoke-ios.sh` `IOS_DEVICE_UDID` 4곳 · `booted` 는 주석 1곳뿐. `smoke-android.sh` `ANDROID_SERIAL` 4곳. 21-35 게이트 `native:smoke:ios` 는 iPhone 17 과 iPad 가 둘 다 부팅된 상태에서 `── 시뮬레이터: iPhone 17 (3B11B38C-…)` 로 지정 기기에만 설치했다 | 21-28 실행 중에 1차 결함이 실제로 재현됐다. 옛 `booted` 별칭이 iPad 에 설치했다 |

**집계:** 수정 13 · 부분 수정 0 · 수정 안 함 0.

## 근거 단락

「수정 안 함」 · 「부분 수정」 행은 없다. 아래 두 단락은 「수정」 행에 남은 위험과 확인 범위를 적는다.

**WR-03 — 폴백 채널의 남는 위험.** 21-25 사용자 답은 a 였다. 그래서 답 b(선언 없이 기존 채널 유지)의 남는 위험은 생기지 않는다. 다만 `GhTradeBridge.kt` 는 `WEB_MESSAGE_LISTENER` 를 지원하지 않는 WebView 에서 `addJavascriptInterface` 로 폴백한다(43행). 이 경로는 여전히 모든 프레임에 객체를 노출한다. 가리는 기준은 최상위 URL 의 출처 전체(스킴·호스트·포트)뿐이고, 프레임은 검사하지 않는다. 1차 지적의 「호스트만 비교」는 닫혔다. 하지만 「하위 프레임이 보낼 수 있다」는 구형 WebView 에서만 남는다. 지금 webapp 에는 iframe 이 없다. 그리고 에뮬레이터(API 36)·최신 WebView 는 webmessage 채널을 쓴다(21-29 로그). 그래서 이 잔여 위험은 수용한다. iframe 을 들이는 변경이 생기면 폴백 경로를 막거나 `minSdk`·WebView 하한을 올리는 것을 다시 검토한다.

**WR-04 · IN-03 — 실기 체감 확인.** WR-04 는 단위 테스트로 계수와 `back()` 동작을 확인했다. Android 실기에서 「팝오버 열림 중 뒤로가기 = 팝오버만 닫힘」은 사용자 확인이 남아 있다. 21-35 SUMMARY 「실서버 재확인 대상」의 「WR-04 상따 설정 팝오버 뒤로가기」 행이 이것이다. IN-03 은 에뮬레이터 dev 빌드에서 재현하고 수정까지 확인했다. 운영 빌드에서 오프라인 전환을 반복하는 체감은 21-36 UAT 몫이다.

## 라운드 2 발견

아직 없다. 이 라운드에 execute-phase 코드 리뷰가 다시 돌면 그 결과를 여기에 합친다. ID 는 `R2-CR-nn` · `R2-WR-nn` · `R2-IN-nn` 으로 붙이고, 이 절 머리의 frontmatter `round2_findings` 도 갱신한다.

---

_대조 작성: 2026-09-26T12:56:00Z · 21-35 Task 2 (gsd-executor)_
