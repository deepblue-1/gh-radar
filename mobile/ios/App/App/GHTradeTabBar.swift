import UIKit

// GH Trade 네이티브 하단 플로팅 탭바 — D-02 · D-15 · D-27b (스케치 007 C 「캡슐 인디케이터」 · 라벨 없음).
//
// 수치 정본 = CONTEXT D-27b: 높이 60 · radius 30(= 높이/2, 연속 곡률) · 라벨 없음(접근 이름은 accessibilityLabel) ·
// 아이콘 26 세로 가운데 · 활성 = 아이콘 뒤 캡슐 56×36 radius 18 `--primary` + filled/굵은 심볼 + primary 색 ·
// 비활성 `--muted-fg`. 색 토큰(bg · primary · muted · card)은 D-27a 그대로.
// 위치·폭(좌우 16 · 최대 560 · 바닥 max(inset − 14, 14))은 VC 의 Auto Layout 이 정한다(GHTradeBridgeViewController).
// 구조는 weekly-wine `CookieViewController.setupTabBar` 를 따르되 색은 팔레트로 교체 가능하게 뺐다(21-11 테마).

/// 탭바 본체. 자신은 투명 컨테이너로 그림자만 지고, 안쪽 `pill` 이 블러·덮개·테두리를 잘라 그린다.
final class GHTradeTabBar: UIView {

    /// 탭 탭(tap) 콜백 — 같은 탭 재탭도 호출된다(D-06 재탭 = 최상단 이동은 웹이 처리).
    var onSelect: ((GHTabID) -> Void)?

    /// 탭바 위로 깔리는 하단 페이드. VC 가 탭바보다 아래 계층에 따로 붙인다.
    let fadeView = GHTradeFadeView()

    private(set) var activeTab: GHTabID?

    private let pill = UIView()
    // UIKit 블러 반경은 조절할 수 없다 — 스케치의 「블러 18」 근사(RESEARCH Pattern 2).
    private let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
    private let tint = UIView()
    private let stack = UIStackView()
    private var items: [GHTradeTabItem] = []
    private var palette = GHTradePalette.of(.light)

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setup() {
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = .clear
        clipsToBounds = false

        // 그림자: CSS `0 2px 16px rgba(0,0,0,.18)` — CSS blur 16 ≒ UIKit shadowRadius 8.
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.18
        layer.shadowOffset = CGSize(width: 0, height: 2)
        layer.shadowRadius = 8

        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.layer.cornerRadius = 30
        pill.layer.cornerCurve = .continuous
        pill.clipsToBounds = true
        pill.layer.borderWidth = 1 / UIScreen.main.scale
        addSubview(pill)
        pin(pill, to: self)

        blur.translatesAutoresizingMaskIntoConstraints = false
        pill.addSubview(blur)
        pin(blur, to: pill)

        tint.translatesAutoresizingMaskIntoConstraints = false
        tint.isUserInteractionEnabled = false
        pill.addSubview(tint)
        pin(tint, to: pill)

        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.alignment = .fill
        pill.addSubview(stack)
        pin(stack, to: pill)

        for tab in GHTabID.allCases {
            let item = GHTradeTabItem(tab: tab)
            item.addTarget(self, action: #selector(itemTapped(_:)), for: .touchUpInside)
            stack.addArrangedSubview(item)
            items.append(item)
        }

        apply(palette)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // 그림자 경로를 알약 모양으로 고정 — 매 프레임 오프스크린 렌더 방지.
        layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: 30).cgPath
    }

    /// 활성 탭 표시. nil = 5탭 전부 비활성(D-14 — 종목상세 등 하위 경로).
    func setActive(_ tab: GHTabID?) {
        activeTab = tab
        for item in items {
            item.configure(active: item.tab == tab, palette: palette)
        }
    }

    /// 팔레트 교체(테마 전환 — 21-11). 덮개·테두리·강조·아이콘 색과 페이드를 함께 갱신한다.
    func apply(_ p: GHTradePalette) {
        palette = p
        tint.backgroundColor = p.card.withAlphaComponent(0.82)
        pill.layer.borderColor = p.line.cgColor
        for item in items {
            item.configure(active: item.tab == activeTab, palette: p)
        }
        fadeView.apply(bg: p.bg)
    }

    @objc private func itemTapped(_ sender: GHTradeTabItem) {
        onSelect?(sender.tab)
    }

    private func pin(_ child: UIView, to parent: UIView) {
        NSLayoutConstraint.activate([
            child.topAnchor.constraint(equalTo: parent.topAnchor),
            child.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
            child.trailingAnchor.constraint(equalTo: parent.trailingAnchor),
            child.bottomAnchor.constraint(equalTo: parent.bottomAnchor),
        ])
    }
}

/// 탭 한 칸 — 라벨 없음(D-27b). 캡슐 56×36 radius 18 · 아이콘 26 이 모두 셀 정중앙. 탭 이름은 VoiceOver 만 읽는다.
final class GHTradeTabItem: UIControl {

    let tab: GHTabID

    private let highlight = UIView()
    private let icon = UIImageView()

    init(tab: GHTabID) {
        self.tab = tab
        super.init(frame: .zero)
        setup()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setup() {
        highlight.translatesAutoresizingMaskIntoConstraints = false
        highlight.isUserInteractionEnabled = false
        highlight.layer.cornerRadius = 18
        highlight.layer.cornerCurve = .continuous
        highlight.isHidden = true
        addSubview(highlight)

        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.isUserInteractionEnabled = false
        icon.contentMode = .scaleAspectFit
        addSubview(icon)

        NSLayoutConstraint.activate([
            highlight.widthAnchor.constraint(equalToConstant: 56),
            highlight.heightAnchor.constraint(equalToConstant: 36),
            highlight.centerXAnchor.constraint(equalTo: centerXAnchor),
            highlight.centerYAnchor.constraint(equalTo: centerYAnchor),

            icon.widthAnchor.constraint(equalToConstant: 26),
            icon.heightAnchor.constraint(equalToConstant: 26),
            icon.centerXAnchor.constraint(equalTo: centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])

        // 시각 라벨은 없지만 접근 이름은 그대로 — VoiceOver 가 「홈」·「검색」… 을 읽는다(D-27b · T-21-51).
        isAccessibilityElement = true
        accessibilityLabel = tab.title
        accessibilityTraits = [.button]
    }

    override var isHighlighted: Bool {
        didSet { icon.alpha = isHighlighted ? 0.55 : 1 }
    }

    func configure(active: Bool, palette: GHTradePalette) {
        let color = active ? palette.primary : palette.muted
        highlight.isHidden = !active
        highlight.backgroundColor = palette.primary.withAlphaComponent(0.14)
        icon.image = Self.symbol(for: tab, active: active)
        icon.tintColor = color
        accessibilityTraits = active ? [.button, .selected] : [.button]
    }

    /// D-15 심볼 표. fill 변형이 없는 심볼(검색·트레이딩·AI)은 활성 시 굵기(semibold)로 구분한다.
    private static func symbolName(for tab: GHTabID, active: Bool) -> String {
        switch tab {
        case .home: return active ? "house.fill" : "house"
        case .search: return "magnifyingglass"
        case .trading: return "chart.line.uptrend.xyaxis"
        case .ai: return "sparkles"
        case .me: return active ? "person.crop.circle.fill" : "person.crop.circle"
        }
    }

    private static func symbol(for tab: GHTabID, active: Bool) -> UIImage? {
        let config = UIImage.SymbolConfiguration(pointSize: 21, weight: active ? .semibold : .regular)
        let name = symbolName(for: tab, active: active)
        if let image = UIImage(systemName: name, withConfiguration: config) {
            return image.withRenderingMode(.alwaysTemplate)
        }
        // Pitfall 20: 없는 심볼 이름은 조용히 nil — 디버그에서 즉시 드러내고 릴리스는 원으로 버틴다.
        assertionFailure("SF Symbol 없음: \(name)")
        return UIImage(systemName: "circle", withConfiguration: config)?.withRenderingMode(.alwaysTemplate)
    }
}

/// 탭바 위로 120pt 올라오는 하단 페이드 — 위 투명 → 70% 지점부터 `--bg` 92%. 터치는 통과시킨다.
final class GHTradeFadeView: UIView {

    private let gradient = CAGradientLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        backgroundColor = .clear
        gradient.locations = [0, 0.7, 1]
        layer.addSublayer(gradient)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        gradient.frame = bounds
        CATransaction.commit()
    }

    func apply(bg: UIColor) {
        // 같은 색의 알파만 바꿔 보간한다(투명 검정에서 시작하면 중간이 회색으로 탁해진다).
        gradient.colors = [
            bg.withAlphaComponent(0).cgColor,
            bg.withAlphaComponent(0.92).cgColor,
            bg.withAlphaComponent(0.92).cgColor,
        ]
    }
}
