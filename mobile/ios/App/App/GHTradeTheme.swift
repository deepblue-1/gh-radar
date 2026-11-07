import UIKit

// GH Trade 네이티브 크롬 테마 · 팔레트.
//
// 정본 = CONTEXT D-27a 색 토큰(스케치 004) · 색 값은 웹 토큰
// `.planning/sketches/themes/toss-dark.css` / `toss-light.css`(Phase 20 토스 B 테마)를 hex 로 옮긴 것이다.
// 웹 토큰이 바뀌면 여기도 같이 바꾼다. Android `GhTradePalette` 와 같은 값을 유지한다(bg · primary).
// quick-261107-fbj 로 네이티브 하단 크롬이 없어져 남은 필드는 WebView/창 배경(bg)과 인앱 브라우저 틴트(primary)뿐이다.

enum GHTradeTheme: String {
    case light, dark

    /// 스피너 · 키보드 · 인앱 브라우저 등 시스템 크롬이 앱 테마를 따르도록 쓰는 값.
    var userInterfaceStyle: UIUserInterfaceStyle {
        self == .dark ? .dark : .light
    }
}

struct GHTradePalette {
    /// `--bg` — WebView · 스크롤 · 창 배경(첫 프레임 깜빡임 방지 · D-23).
    let bg: UIColor
    /// `--primary` — 인앱 브라우저(SFSafariViewController) 컨트롤 틴트(D-28).
    let primary: UIColor

    static func of(_ theme: GHTradeTheme) -> GHTradePalette {
        switch theme {
        case .dark:
            return GHTradePalette(
                bg: UIColor(hex: 0x0a0a0a),
                primary: UIColor(hex: 0x3485fa)
            )
        case .light:
            return GHTradePalette(
                bg: UIColor(hex: 0xffffff),
                primary: UIColor(hex: 0x3182f6)
            )
        }
    }
}

fileprivate extension UIColor {
    /// `0xRRGGBB` → sRGB UIColor.
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255,
            alpha: alpha
        )
    }
}
