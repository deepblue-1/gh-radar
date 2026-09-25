import Foundation

// RED 스텁 — 21-10 Task 1 GREEN 에서 D-14 경로표로 채운다.
enum GHTabID: String, CaseIterable {
    case home, search, trading, ai, me
    var path: String { "" }
    var title: String { "" }
}

enum TabRoutes {
    static func normalize(_ path: String) -> String { path }
    static func activeTab(forPath path: String) -> GHTabID? { nil }
    static func hidesTabBar(path: String) -> Bool { false }
}
