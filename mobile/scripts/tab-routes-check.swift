// TabRoutes 경로표 검사 (D-14 활성 판정 · D-12 ① 경로 숨김) — Xcode 테스트 타깃 없이 swiftc 로 돈다.
//
// 실행: `pnpm --filter @gh-radar/mobile run native:check-tab-routes:ios`
//   → scripts/check-tab-routes-ios.sh 가 이 파일을 main.swift 로 복사해
//     ios/App/App/TabRoutes.swift 와 함께 컴파일·실행한다(TabRoutes 는 Foundation 전용이어야 한다).
//
// 출력은 TAP 모양(`ok N - …` / `not ok N - …`) + 실패마다 `FAIL …` 한 줄 + `# tests/# pass/# fail` 요약.
// 전부 통과하면 마지막 줄이 `TAB ROUTES OK <n>` 이고, 하나라도 실패하면 exit 1.
// Android `TabRoutesTest.kt`(21-12)와 같은 표를 유지한다 — 한쪽만 바꾸지 말 것.

import Foundation

var total = 0
var failures = 0

func check(_ name: String, _ actual: String, _ expected: String) {
    total += 1
    if actual == expected {
        print("ok \(total) - \(name)")
    } else {
        failures += 1
        print("not ok \(total) - \(name)")
        print("FAIL \(name): expected \(expected) got \(actual)")
    }
}

func show(_ tab: GHTabID?) -> String { tab.map { $0.rawValue } ?? "nil" }

// normalize — 쿼리·프래그먼트 제거 · 루트 외 끝 슬래시 제거 · 빈 문자열 → "/"
let normalizeCases: [(String, String)] = [
    ("", "/"),
    ("/", "/"),
    ("/trading?focus=X", "/trading"),
    ("/scanner/", "/scanner"),
    ("/a#b", "/a"),
]
for (input, expected) in normalizeCases {
    check("normalize \"\(input)\"", TabRoutes.normalize(input), expected)
}

// activeTab — 정확 일치만(D-14). 하위 경로·접두 유사 경로·로그인은 5탭 전부 비활성(nil).
let activeCases: [(String, GHTabID?)] = [
    ("/", .home),
    ("", .home),
    ("/search", .search),
    ("/scanner", .search),
    ("/scanner/", .search),
    ("/themes", .search),
    ("/watchlist", .search),
    ("/trading", .trading),
    ("/trading?focus=X", .trading),
    ("/trading/", .trading),
    ("/chat", .ai),
    ("/me", .me),
    ("/stocks/005930", nil),
    ("/themes/abc", nil),
    ("/trading/vi", nil),
    ("/chat/123", nil),
    ("/me/x", nil),
    ("/searching", nil),
    ("/login", nil),
    ("/auth/callback", nil),
]
for (input, expected) in activeCases {
    check("activeTab \"\(input)\"", show(TabRoutes.activeTab(forPath: input)), show(expected))
}

// hidesTabBar — /login · /auth 와 그 하위만(D-12 ①). 접두만 같은 경로(/loginx · /author)는 표시.
let hideCases: [(String, Bool)] = [
    ("/login", true),
    ("/login/x", true),
    ("/auth", true),
    ("/auth/callback", true),
    ("/", false),
    ("/me", false),
    ("/loginx", false),
    ("/author", false),
]
for (input, expected) in hideCases {
    check("hidesTabBar \"\(input)\"", String(TabRoutes.hidesTabBar(path: input)), String(expected))
}

// GHTabID — D-06 순서·경로·제목 고정
check("GHTabID.allCases order", GHTabID.allCases.map { $0.rawValue }.joined(separator: ","), "home,search,trading,ai,me")
check("GHTabID.path", GHTabID.allCases.map { $0.path }.joined(separator: ","), "/,/search,/trading,/chat,/me")
check("GHTabID.title", GHTabID.allCases.map { $0.title }.joined(separator: ","), "홈,검색,트레이딩,AI,마이")

print("# tests \(total)")
print("# pass \(total - failures)")
print("# fail \(failures)")

if failures != 0 {
    exit(1)
}
print("TAB ROUTES OK \(total)")
