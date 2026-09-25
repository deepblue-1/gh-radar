import Foundation

// 네이티브 탭바 경로표 — D-14(활성 판정) · D-12 ①(경로 숨김)의 iOS 정본.
//
// Foundation 전용이다(UIKit 금지): `scripts/check-tab-routes-ios.sh` 가 이 파일만 떼어 swiftc 로
// 컴파일해 `scripts/tab-routes-check.swift` 의 표 전체를 단언한다(Xcode 테스트 타깃 없음).
// Android `TabRoutes.kt`(21-12)와 **같은 표**를 유지해야 한다 — 한쪽만 바꾸지 말 것.

/// 하단 탭 5개. `allCases` 순서가 곧 화면 순서다(D-06: 홈 · 검색 · 트레이딩 · AI · 마이).
enum GHTabID: String, CaseIterable {
    case home, search, trading, ai, me

    /// 탭을 눌렀을 때 이동하는 웹 경로(D-06). 스크립트에 그대로 들어가므로 상수만 둔다(T-21-36).
    var path: String {
        switch self {
        case .home: return "/"
        case .search: return "/search"
        case .trading: return "/trading"
        case .ai: return "/chat"
        case .me: return "/me"
        }
    }

    var title: String {
        switch self {
        case .home: return "홈"
        case .search: return "검색"
        case .trading: return "트레이딩"
        case .ai: return "AI"
        case .me: return "마이"
        }
    }
}

enum TabRoutes {
    /// 쿼리·프래그먼트 제거 · 루트 외 끝 슬래시 제거 · 빈 문자열은 `/`.
    static func normalize(_ path: String) -> String {
        var p = path
        if let cut = p.firstIndex(where: { $0 == "?" || $0 == "#" }) {
            p = String(p[..<cut])
        }
        while p.count > 1 && p.hasSuffix("/") {
            p.removeLast()
        }
        return p.isEmpty ? "/" : p
    }

    /// D-14: 경로 **정확 일치**만 활성. 하위 경로(`/stocks/*` · `/themes/*` · `/trading/vi` 등)는 nil = 5탭 전부 비활성.
    static func activeTab(forPath path: String) -> GHTabID? {
        switch normalize(path) {
        case "/": return .home
        case "/search", "/scanner", "/themes", "/watchlist": return .search
        case "/trading": return .trading
        case "/chat": return .ai
        case "/me": return .me
        default: return nil
        }
    }

    /// D-12 ①: `/login` · `/auth` 와 그 하위에서는 탭바를 숨긴다(`/loginx` · `/author` 같은 접두 유사 경로는 제외).
    static func hidesTabBar(path: String) -> Bool {
        let p = normalize(path)
        return p == "/login" || p.hasPrefix("/login/") || p == "/auth" || p.hasPrefix("/auth/")
    }
}
