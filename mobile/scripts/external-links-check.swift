// ExternalLinks 판정표 검사 (D-28 호스트 밖 http(s) → 인앱 브라우저) — Xcode 테스트 타깃 없이 swiftc 로 돈다.
//
// 실행: `pnpm --filter @gh-radar/mobile run native:check-external-links:ios`
//   → scripts/check-external-links-ios.sh 가 이 파일을 main.swift 로 복사해
//     ios/App/App/ExternalLinks.swift 와 함께 컴파일·실행한다(ExternalLinks 는 Foundation 전용이어야 한다).
//
// 출력은 TAP 모양(`ok N - …` / `not ok N - …`) + 실패마다 `FAIL …` 한 줄 + `# tests/# pass/# fail` 요약.
// 전부 통과하면 마지막 줄이 `EXTERNAL LINKS OK <n>` 이고, 하나라도 실패하면 exit 1.
//
// 표 1 은 Android `mobile/android/app/src/test/java/com/ghtrade/app/ExternalLinksTest.kt`(21-17)와
// **같은 순서·같은 기대값**이다(nil = Kotlin null) — 한쪽 표만 바꾸면 두 앱의 링크 동작이 갈린다.
// 표가 정본이다 — 케이스가 틀리면 표가 아니라 `ExternalLinks.swift` 를 고친다.

import Foundation

var total = 0
var failures = 0

func check(_ name: String, _ actual: Bool, _ expected: Bool) {
    total += 1
    if actual == expected {
        print("ok \(total) - \(name)")
    } else {
        failures += 1
        print("not ok \(total) - \(name)")
        print("FAIL \(name): expected \(expected) got \(actual)")
    }
}

func show(_ s: String?) -> String { s ?? "null" }

let app = "trade.jx1.io"

// 표 1 — opensInAppBrowser (Android ExternalLinksTest 정본 26케이스)
let cases: [(no: Int, scheme: String?, host: String?, appHost: String?, expected: Bool)] = [
    (1, "https", "n.news.naver.com", app, true),
    (2, "http", "example.com", app, true),
    (3, "HTTPS", "Example.COM", app, true), // 대소문자
    (4, "https", "trade.jx1.io", app, false), // 같은 호스트
    (5, "https", "TRADE.JX1.IO", app, false),
    (6, "https", "www.trade.jx1.io", app, true), // 다른 호스트 = 사이트 밖
    (7, "https", "trade.jx1.io.evil.com", app, true), // 접미사 위장 = 외부(T-21-44)
    (8, "https", "localhost", app, false), // 로컬 에셋 서버(오프라인 폴백)
    (9, "http", "localhost", "localhost", false), // dev
    (10, "http", "127.0.0.1", app, false),
    (11, "http", "::1", app, false),
    (12, "http", "[::1]", app, false),
    (13, "capacitor", "localhost", app, false),
    (14, "mailto", nil, app, false),
    (15, "tel", nil, app, false),
    (16, "javascript", nil, app, false),
    (17, "data", nil, app, false),
    (18, "file", "", app, false),
    (19, "blob", nil, app, false),
    (20, "intent", "scan", app, false),
    (21, "about", nil, app, false),
    (22, "kakaotalk", "inappbrowse", app, false), // 앱 딥링크
    (23, "https", "", app, false),
    (24, "https", nil, app, false),
    (25, "https", "n.news.naver.com", nil, false), // 앱 호스트 모름
    (26, nil, nil, app, false),
]
if cases.count != 26 {
    failures += 1
    print("FAIL 정본 표는 26케이스: got \(cases.count)")
}
for c in cases {
    check(
        "opensInAppBrowser \(c.no) \(show(c.scheme))://\(show(c.host)) app=\(show(c.appHost))",
        ExternalLinks.opensInAppBrowser(scheme: c.scheme, host: c.host, appHost: c.appHost),
        c.expected
    )
}

// 표 2 — isSameAppHost (같은 호스트 새 창 요청 → 같은 WebView)
let sameCases: [(scheme: String?, host: String?, appHost: String?, expected: Bool)] = [
    ("https", "trade.jx1.io", "trade.jx1.io", true),
    ("HTTPS", "TRADE.JX1.IO", "trade.jx1.io", true),
    ("http", "localhost", "localhost", true),
    ("https", "n.news.naver.com", "trade.jx1.io", false),
    ("mailto", nil, "trade.jx1.io", false),
    ("https", "trade.jx1.io", nil, false),
]
for c in sameCases {
    check(
        "isSameAppHost \(show(c.scheme))://\(show(c.host)) app=\(show(c.appHost))",
        ExternalLinks.isSameAppHost(scheme: c.scheme, host: c.host, appHost: c.appHost),
        c.expected
    )
}

print("# tests \(total)")
print("# pass \(total - failures)")
print("# fail \(failures)")

if failures != 0 {
    exit(1)
}
print("EXTERNAL LINKS OK \(total)")
