import UIKit
import WebKit
import Capacitor
import os

/// GH Trade 루트 VC (Phase 21).
///
/// `SceneDelegate` 가 코드로 루트에 세운다(Pitfall 1·3 — storyboard `customClass` 는 보조일 뿐).
/// `loadView()` 가 `view = webView` 이므로 이 VC 의 루트 뷰가 곧 WKWebView 다 — 풀블리드(D-25)라
/// weekly-wine 의 `viewDidLayoutSubviews` 프레임 조작·쿠키 저장/복원은 가져오지 않는다.
///
/// 웹 → 네이티브 채널은 `ghTrade` 하나다. 본문은 JSON 문자열 `{"type": …, "payload": …}`.
/// 웹 쪽 송신부: `webapp/src/lib/native/native-detect.ts` (ready) · 21-04 `post-native.ts`.
///
/// 하단 플로팅 탭바(21-10 · D-02 · D-27a)는 WebView 위에 `addSubview` 로 얹는다.
/// 활성 = `TabRoutes.activeTab`(D-14) · 숨김 = 로그인 경로 · 오프라인 페이지 · 웹 오버레이 · 키보드(D-12) ·
/// 탭 = 웹 navigate 훅 evaluate(D-06a, 클라 내비라 relay 소켓 유지).
///
/// 21-11: 당겨서 새로고침(D-04 · D-17 — 웹 refresh 훅 · 1초 고정 스피너) · 테마 추종과 첫 프레임 저장값(D-23).
final class GHTradeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    private let log = Logger(subsystem: "com.ghtrade.app", category: "bridge")

    /// 웹이 보낼 수 있는 메시지 타입 화이트리스트(V5). 모르는 타입은 무시한다.
    enum NativeMessageType: String {
        case ready, route, theme, overlay, pull
    }

    static let messageHandlerName = "ghTrade"

    // MARK: - 탭바 상태 (21-10)

    private let tabBar = GHTradeTabBar()
    private var urlObservation: NSKeyValueObservation?
    private var hideWork: DispatchWorkItem?
    private(set) var currentPath = "/"
    /// WebView 가 앱 서버가 아닌 문서(= `capacitor://localhost` 오프라인 폴백 · about:blank)를 보고 있다(D-12 ②).
    private(set) var isOfflinePage = false
    /// 웹 `overlay {open}` 신호(D-12 ③). 새 문서의 `ready` 에서 false 로 되돌린다(T-21-18 고착 방지).
    var overlayOpen = false
    private var keyboardVisible = false
    /// 앱 테마. 바꾸는 곳은 `applyTheme` 하나 — 저장값(ThemeStore, 첫 프레임) · 웹 `theme` 메시지(D-23).
    private(set) var currentTheme: GHTradeTheme = .light {
        didSet { applyTabBarTheme() }
    }

    // MARK: - 당겨서 새로고침 상태 (D-04 · D-17)

    /// 오버레이·오프라인 페이지 동안 scrollView 에서 떼었다가 다시 붙이므로 보관한다(Pitfall 7).
    private var pullRefreshControl: UIRefreshControl?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // D-23 첫 프레임 — 웹이 뜨기 전 WebView 배경·상태바를 저장값으로(흰/검 깜빡임 방지).
        applyTheme(ThemeStore.load(), animated: false)
        guard let wv = webView else { return }
        // userContentController 는 핸들러를 강하게 잡는다 → 약한 참조 래퍼로 순환을 끊는다.
        wv.configuration.userContentController.add(WeakScriptMessageHandler(self), name: "ghTrade")
        setupPullToRefresh()
        setupTabBar()
        observeURL()
        observeKeyboard()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // 풀블리드(D-25 · contentInsetAdjustmentBehavior .never)라 스피너가 상태바 뒤에 그려진다 → 안전영역 아래로 내린다.
        if let rc = pullRefreshControl {
            rc.bounds = CGRect(x: rc.bounds.origin.x, y: -view.safeAreaInsets.top,
                               width: rc.bounds.width, height: rc.bounds.height)
        }
    }

    // MARK: - 상태바 (Pitfall 13)

    /// SystemBars 플러그인이 load 때 `statusBarStyle = .default`(OS 다크모드 추종)로 덮는다 → 앱 테마 값을 직접 반환.
    override var preferredStatusBarStyle: UIStatusBarStyle {
        currentTheme == .dark ? .lightContent : .darkContent
    }

    // MARK: - JS → Native

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // T-21-02: 메인 프레임 · 문자열 JSON · 화이트리스트 타입 · 앱 서버 호스트에서 온 것만 처리한다.
        guard message.name == Self.messageHandlerName,
              message.frameInfo.isMainFrame,
              let body = message.body as? String,
              let data = body.data(using: .utf8),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let rawType = obj["type"] as? String,
              let type = NativeMessageType(rawValue: rawType)
        else { return }

        let senderHost = message.frameInfo.request.url?.host
        let appHost = bridge?.config.serverURL.host
        guard let senderHost, let appHost, senderHost == appHost else {
            log.debug("ignored \(rawType, privacy: .public) from foreign host")
            return
        }

        let payload = obj["payload"] as? [String: Any]
        switch type {
        case .ready:
            let p = (payload?["platform"] as? String) ?? "unknown"
            let flag = (payload?["nativeApp"] as? Bool) ?? false
            log.notice("ready platform=\(p, privacy: .public) nativeApp=\(flag, privacy: .public)")
            // 새 문서 = 웹 오버레이 참조계수 0 에서 시작 — 전체 로드로 닫힘 신호를 못 받은 경우를 푼다(T-21-18).
            if overlayOpen {
                overlayOpen = false
                updateTabBarVisibility(animated: true)
            }
        case .route:
            // SPA pushState 보강(D-14). 문자열 · `/` 시작만 받는다(T-21-02) — 표시 상태만 바뀐다.
            guard let path = payload?["path"] as? String, path.hasPrefix("/") else { return }
            applyPath(path)
        case .overlay:
            overlayOpen = (payload?["open"] as? Bool) == true
            updateTabBarVisibility(animated: true)
        case .theme:
            // T-21-02: "dark"/"light" 두 값만 받는다 — 그 외는 무시(저장도 하지 않는다).
            guard let raw = payload?["theme"] as? String, let t = GHTradeTheme(rawValue: raw) else { return }
            applyTheme(t, animated: true)
        case .pull:
            // Android 전용(SwipeRefreshLayout 내부 스크롤 신호). iOS 는 CSS overscroll-behavior 로 체이닝을 끊는다.
            log.debug("message \(rawType, privacy: .public)")
        }
    }

    // MARK: - 탭바 (D-02 · D-13 · D-27a)

    private func setupTabBar() {
        let fade = tabBar.fadeView
        // 페이드 → 탭바 순서로 얹는다(탭바가 위). view == webView 다 — WebView 프레임은 건드리지 않는다(D-25 풀블리드).
        view.addSubview(fade)
        view.addSubview(tabBar)

        // 바닥 = 화면 끝에서 max(inset − 14, 14): 안전영역 바닥 + 14(우선) · 화면 끝 −14 이하(필수).
        // 인셋 34 기기 → 화면 끝 20 · 인셋 0 기기 → 14 (D-27a).
        let bottomToSafeArea = tabBar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: 14)
        bottomToSafeArea.priority = .defaultHigh
        // 폭 = 화면 − 32(우선) · 최대 560(필수, iPad 가운데). 폭 기준 숨김 분기는 없다(D-13).
        let widthToView = tabBar.widthAnchor.constraint(equalTo: view.widthAnchor, constant: -32)
        widthToView.priority = .defaultHigh

        NSLayoutConstraint.activate([
            fade.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            fade.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            fade.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            fade.heightAnchor.constraint(equalToConstant: 120),

            tabBar.heightAnchor.constraint(equalToConstant: 70),
            tabBar.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            tabBar.widthAnchor.constraint(lessThanOrEqualToConstant: 560),
            widthToView,
            tabBar.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 16),
            tabBar.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -16),
            bottomToSafeArea,
            tabBar.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -14),
        ])

        applyTabBarTheme()
        tabBar.onSelect = { [weak self] tab in self?.selectTab(tab) }
        tabBar.setActive(TabRoutes.activeTab(forPath: currentPath))
        updateTabBarVisibility(animated: false)
    }

    // MARK: - 테마 (D-23 — 웹이 정본, 네이티브는 따라가며 마지막 값만 저장. OS 다크모드는 보지 않는다)

    /// 라이트 `#ffffff` · 다크 `#17171c`(GHTradePalette.bg) 를 WebView/스크롤/창 배경에 칠하고
    /// 상태바 · 시스템 크롬(스피너·키보드) · 탭바/페이드 팔레트를 바꾼 뒤 저장한다.
    func applyTheme(_ t: GHTradeTheme, animated: Bool) {
        let p = GHTradePalette.of(t)
        let changed = t != currentTheme
        // 불투명이면 첫 페인트 전 흰 면이 비친다 — 배경색이 보이도록 투명 처리(weekly-wine setupPullToRefresh).
        webView?.isOpaque = false
        let apply = { [weak self] in
            guard let self else { return }
            self.currentTheme = t   // didSet → 탭바·페이드 팔레트
            // 이 VC 의 뷰 계층(리프레시 스피너 · 키보드 · WebView 기본 color-scheme)이 앱 테마를 따르게 한다.
            self.overrideUserInterfaceStyle = t.userInterfaceStyle
            // view == webView (loadView final) — WebView 와 스크롤 배경, 창 배경을 같이 칠한다.
            self.webView?.backgroundColor = p.bg
            self.webView?.scrollView.backgroundColor = p.bg
            self.viewIfLoaded?.window?.backgroundColor = p.bg
            self.setNeedsStatusBarAppearanceUpdate()
        }
        if animated && changed {
            UIView.animate(withDuration: 0.2, animations: apply)
        } else {
            apply()
        }
        ThemeStore.save(t)
    }

    private func applyTabBarTheme() {
        // 블러 재질(systemThinMaterial)도 앱 테마를 따르게 한다 — OS 다크모드와 앱 테마가 다를 때 대비.
        tabBar.overrideUserInterfaceStyle = currentTheme.userInterfaceStyle
        tabBar.apply(GHTradePalette.of(currentTheme))
    }

    // MARK: - 당겨서 새로고침 (D-04 · D-17 — weekly-wine setupPullToRefresh 이식, 핸들러만 교체)

    private func setupPullToRefresh() {
        guard let wv = webView else { return }
        // ★ Capacitor 가 scrollView.bounces = false 로 둔다 — 되돌리지 않으면 UIRefreshControl 이 당겨지지 않는다(Pitfall 7).
        wv.scrollView.bounces = true
        let rc = UIRefreshControl()
        rc.addTarget(self, action: #selector(handleRefresh(_:)), for: .valueChanged)
        wv.scrollView.refreshControl = rc
        pullRefreshControl = rc
    }

    @objc private func handleRefresh(_ sender: UIRefreshControl) {
        // 페이지가 등록한 refresh 훅(21-04 · 21-07), 없으면 문서 재로드. 스크립트는 상수 — 외부 입력 없음.
        webView?.evaluateJavaScript("window.__ghTrade&&window.__ghTrade.refresh?window.__ghTrade.refresh():location.reload()") { [weak self] _, error in
            // 훅이 Promise 를 돌려주면 WebKit 이 직렬화 실패로 error 를 줄 수 있다 — 호출은 이미 일어났으므로 기록만 한다.
            if let error {
                self?.log.debug("refresh evaluate: \(error.localizedDescription, privacy: .public)")
            }
        }
        // D-17: 훅 완료와 무관하게 1초 고정으로 스피너를 닫는다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            sender.endRefreshing()
        }
    }

    /// 오버레이(키패드 시트 등) 열림 · 오프라인 페이지 동안 당김 새로고침을 뗀다 — 편집 중 당김으로 입력 유실 방지(Pitfall 7).
    private func updatePullToRefreshAvailability() {
        guard let wv = webView, let rc = pullRefreshControl else { return }
        let enabled = !(overlayOpen || isOfflinePage)
        if enabled {
            if wv.scrollView.refreshControl !== rc { wv.scrollView.refreshControl = rc }
        } else if wv.scrollView.refreshControl != nil {
            // 새로고침 도중 떼면 스크롤 인셋이 남는다 → 먼저 닫는다.
            if rc.isRefreshing { rc.endRefreshing() }
            wv.scrollView.refreshControl = nil
        }
    }

    // MARK: - URL 관찰 (D-14 · D-12 ②)

    private func observeURL() {
        urlObservation = webView?.observe(\.url, options: [.new]) { [weak self] wv, _ in
            DispatchQueue.main.async { self?.handleURL(wv.url) }
        }
    }

    private func handleURL(_ url: URL?) {
        guard let url else { return }
        let server = bridge?.config.serverURL
        // 호스트만 비교하면 dev(`http://localhost:3100`)에서 오프라인 페이지(`capacitor://localhost`)와 겹친다 → 스킴도 본다.
        let onAppServer = url.host == server?.host && url.scheme == server?.scheme
        isOfflinePage = !onAppServer
        if onAppServer {
            applyPath(url.path)
        } else {
            tabBar.setActive(nil)
            updateTabBarVisibility(animated: true)
        }
    }

    private func applyPath(_ path: String) {
        currentPath = TabRoutes.normalize(path)
        tabBar.setActive(TabRoutes.activeTab(forPath: currentPath))
        updateTabBarVisibility(animated: true)
    }

    // MARK: - 키보드 (Claude's Discretion — 입력 중 탭바 숨김)

    private func observeKeyboard() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow), name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide), name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillShow(_ note: Notification) {
        keyboardVisible = true
        updateTabBarVisibility(animated: true)
    }

    @objc private func keyboardWillHide(_ note: Notification) {
        keyboardVisible = false
        updateTabBarVisibility(animated: true)
    }

    // MARK: - 표시/숨김 (D-12: 숨김은 150ms 지연 후 0.2s 페이드 · 보임은 지연 없이 0.2s)

    private var shouldHideTabBar: Bool {
        TabRoutes.hidesTabBar(path: currentPath) || isOfflinePage || overlayOpen || keyboardVisible
    }

    func updateTabBarVisibility(animated: Bool) {
        // 오버레이·오프라인 상태가 바뀌는 모든 경로가 여기를 지난다 → 새로고침 가능 여부도 같은 시점에 맞춘다.
        updatePullToRefreshAvailability()
        let fade = tabBar.fadeView
        hideWork?.cancel()
        hideWork = nil

        if shouldHideTabBar {
            guard !tabBar.isHidden else { return }
            let hide = { [weak self] in
                guard let self else { return }
                self.tabBar.alpha = 0
                fade.alpha = 0
                self.tabBar.transform = CGAffineTransform(translationX: 0, y: 8)
            }
            let finish = { [weak self] in
                // 페이드 도중 다시 보이기로 바뀌었으면 숨기지 않는다.
                guard let self, self.shouldHideTabBar else { return }
                self.tabBar.isHidden = true
                fade.isHidden = true
            }
            guard animated else {
                hide()
                finish()
                return
            }
            // 리다이렉트·짧은 오버레이 깜빡임은 150ms 안에 취소된다(weekly-wine filterState 방식).
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.hideWork = nil
                guard self.shouldHideTabBar else { return }
                UIView.animate(withDuration: 0.2, animations: hide) { finished in
                    if finished { finish() }
                }
            }
            hideWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
        } else {
            // 진행 중인 숨김 애니메이션과 경합하지 않게 먼저 걷어낸다(weekly-wine observeURL).
            tabBar.layer.removeAllAnimations()
            fade.layer.removeAllAnimations()
            tabBar.isHidden = false
            fade.isHidden = false
            let show = { [weak self] in
                self?.tabBar.alpha = 1
                fade.alpha = 1
                self?.tabBar.transform = .identity
            }
            if animated {
                UIView.animate(withDuration: 0.2, animations: show)
            } else {
                show()
            }
        }
    }

    // MARK: - 탭 이동 (D-06 · D-06a)

    func selectTab(_ tab: GHTabID) {
        // 반응성 — 이동 결과는 URL KVO · route 메시지가 다시 확정한다.
        tabBar.setActive(tab)
        guard let wv = webView else { return }

        if isOfflinePage {
            // 오프라인 폴백 문서에는 웹 훅이 없다 → 앱 서버 경로를 직접 로드한다.
            guard let server = bridge?.config.serverURL else { return }
            let url = tab == .home ? server : server.appendingPathComponent(String(tab.path.dropFirst()))
            wv.load(URLRequest(url: url))
            return
        }

        // T-21-36: 스크립트에 들어가는 값은 GHTabID.path 상수뿐 — 외부 입력 없음.
        let p = tab.path
        let js = "window.__ghTrade&&window.__ghTrade.navigate?window.__ghTrade.navigate('\(p)'):location.assign('\(p)')"
        wv.evaluateJavaScript(js) { [weak self] _, error in
            if let error {
                self?.log.error("tab navigate failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}

/// `WKUserContentController` → 핸들러 강한 참조 순환 차단용 약한 참조 래퍼.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
