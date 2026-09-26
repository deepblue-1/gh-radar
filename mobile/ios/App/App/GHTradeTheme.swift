import UIKit

// GH Trade 네이티브 크롬 테마 · 팔레트.
//
// 정본 = CONTEXT D-27a 색 토큰(스케치 004) + D-27b 유리(스케치 007 C `--glass-hi`) · 색 값은 웹 토큰
// `.planning/sketches/themes/toss-dark.css` / `toss-light.css`(Phase 20 토스 B 테마)를 hex 로 옮긴 것이다.
// 웹 토큰이 바뀌면 여기도 같이 바꾼다.
// Android `GhTradePalette` 와 같은 값을 유지한다(glass RGB 동일 · Android 는 실블러가 없어 glassAlpha 대신
// 94% 근사 — A10).

enum GHTradeTheme: String {
    case light, dark

    /// 탭바 블러 재질·키보드 등 시스템 크롬이 앱 테마를 따르도록 쓰는 값.
    var userInterfaceStyle: UIUserInterfaceStyle {
        self == .dark ? .dark : .light
    }
}

struct GHTradePalette {
    /// `--card` — 카드 면 색 토큰(D-27a · 탭바 덮개는 D-27b 부터 `glass`).
    let card: UIColor
    /// `--bg` — 하단 페이드(80% · D-27b).
    let bg: UIColor
    /// `--primary` — 활성 아이콘 · 캡슐(16%).
    let primary: UIColor
    /// `--muted-fg` — 비활성 아이콘.
    let muted: UIColor
    /// 스케치 007 `--glass-hi` 의 불투명 RGB — 탭바 유리 틴트(테두리 없음 · D-27b).
    let glass: UIColor
    /// `--glass-hi` 알파(다크 0.62 · 라이트 0.72) — ultra-thin 재질 위 틴트 불투명도.
    let glassAlpha: CGFloat

    static func of(_ theme: GHTradeTheme) -> GHTradePalette {
        switch theme {
        case .dark:
            return GHTradePalette(
                card: UIColor(hex: 0x202027),
                bg: UIColor(hex: 0x17171c),
                primary: UIColor(hex: 0x3485fa),
                muted: UIColor(hex: 0x9e9ea4),
                glass: UIColor(hex: 0x2c2c35),
                glassAlpha: 0.62
            )
        case .light:
            return GHTradePalette(
                card: UIColor(hex: 0xffffff),
                bg: UIColor(hex: 0xffffff),
                primary: UIColor(hex: 0x3182f6),
                muted: UIColor(hex: 0x6b7684),
                glass: UIColor(hex: 0xffffff),
                glassAlpha: 0.72
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
