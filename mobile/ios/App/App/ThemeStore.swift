import Foundation

/// 웹 테마의 마지막 값 저장소(D-23).
///
/// 테마의 정본은 웹(next-themes)이다 — 네이티브는 웹 `theme {theme}` 메시지를 따라가며 마지막 값만 저장해
/// 다음 실행 첫 프레임(SceneDelegate 창 배경 · capacitorDidLoad)에 쓴다. OS 다크모드는 보지 않는다
/// (웹 `enableSystem=false`). 저장값이 없거나 모르는 값이면 웹 기본과 같은 light.
enum ThemeStore {
    static let key = "gh-trade.theme"

    static func load() -> GHTradeTheme {
        GHTradeTheme(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .light
    }

    static func save(_ t: GHTradeTheme) {
        UserDefaults.standard.set(t.rawValue, forKey: key)
    }
}
