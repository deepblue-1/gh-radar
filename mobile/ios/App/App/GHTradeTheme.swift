import UIKit

// GH Trade 네이티브 크롬 테마 · 팔레트.
//
// 정본 = CONTEXT D-27a (스케치 004 채택안) · 값은 웹 토큰 `.planning/sketches/themes/toss-dark.css` /
// `toss-light.css`(Phase 20 토스 B 테마)를 hex 로 옮긴 것이다. 웹 토큰이 바뀌면 여기도 같이 바꾼다.
// Android `GhTradePalette`(21-12)와 같은 값을 유지한다.

enum GHTradeTheme: String {
    case light, dark

    /// 탭바 블러 재질·키보드 등 시스템 크롬이 앱 테마를 따르도록 쓰는 값.
    var userInterfaceStyle: UIUserInterfaceStyle {
        self == .dark ? .dark : .light
    }
}

struct GHTradePalette {
    /// `--card` — 탭바 알약 덮개(82%).
    let card: UIColor
    /// `--bg` — 하단 페이드(92%).
    let bg: UIColor
    /// `--primary` — 활성 아이콘·라벨 · 강조 원(14%).
    let primary: UIColor
    /// `--muted-fg` — 비활성 아이콘·라벨.
    let muted: UIColor
    /// `--line` — 알약 1px 테두리.
    let line: UIColor

    static func of(_ theme: GHTradeTheme) -> GHTradePalette {
        switch theme {
        case .dark:
            return GHTradePalette(
                card: UIColor(hex: 0x202027),
                bg: UIColor(hex: 0x17171c),
                primary: UIColor(hex: 0x3485fa),
                muted: UIColor(hex: 0x9e9ea4),
                line: UIColor(white: 1, alpha: 0.07)
            )
        case .light:
            return GHTradePalette(
                card: UIColor(hex: 0xffffff),
                bg: UIColor(hex: 0xffffff),
                primary: UIColor(hex: 0x3182f6),
                muted: UIColor(hex: 0x6b7684),
                line: UIColor(hex: 0xe5e8eb)
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
