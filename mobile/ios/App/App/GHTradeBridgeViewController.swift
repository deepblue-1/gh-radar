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
/// quick-261107-fbj 로 네이티브 하단 탭바 제거 — 이동은 웹 헤더 햄버거 드로어. 웹 오버레이 · 오프라인 페이지는
/// 당겨서 새로고침 가부만 정한다.
///
/// 21-11: 당겨서 새로고침(D-04 · D-17 — 웹 refresh 훅 · 1초 고정 스피너) · 테마 추종과 첫 프레임 저장값(D-23) ·
/// 네트워크 오류 전용 오프라인 폴백(D-19 — `NavigationDelegateProxy`) · 폰 세로 / iPad 4방향(D-24).
///
/// 21-22: D-28 호스트 밖 링크 = 인앱 브라우저(SFSafariViewController) — `NavigationDelegateProxy` 가 내비·UI 델리게이트 앞에 선다.
final class GHTradeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    private let log = Logger(subsystem: "com.ghtrade.app", category: "bridge")

    /// 웹이 보낼 수 있는 메시지 타입 화이트리스트(V5). 모르는 타입은 무시한다.
    /// `openSettings` — Phase 40 D-14 푸시 권한 거부 뒤 앱 설정 화면 열기(페이로드 없음).
    enum NativeMessageType: String {
        case ready, route, theme, overlay, pull, openSettings
    }

    static let messageHandlerName = "ghTrade"

    // MARK: - 표시 상태 (overlay · 오프라인 → 당겨서 새로고침 가부)

    private var urlObservation: NSKeyValueObservation?
    /// WebView 가 앱 서버가 아닌 문서(= `capacitor://localhost` 오프라인 폴백 · about:blank)를 보고 있다(D-12 ②).
    private(set) var isOfflinePage = false
    /// 웹 `overlay {open}` 신호(D-12 ③). 새 문서의 `ready` 에서 false 로 되돌린다(T-21-18 고착 방지).
    var overlayOpen = false
    /// 앱 테마. 바꾸는 곳은 `applyTheme` 하나 — 저장값(ThemeStore, 첫 프레임) · 웹 `theme` 메시지(D-23).
    /// 초기 자리값 = dark(D-23a — 저장값 없는 첫 프레임과 같은 값. capacitorDidLoad 의 ThemeStore.load() 가 곧 덮는다).
    private(set) var currentTheme: GHTradeTheme = .dark

    // MARK: - 당겨서 새로고침 상태 (D-04 · D-17)

    /// 오버레이·오프라인 페이지 동안 scrollView 에서 떼었다가 다시 붙이므로 보관한다(Pitfall 7).
    private var pullRefreshControl: UIRefreshControl?

    /// WKWebView.navigationDelegate 는 weak 다 → 프록시를 여기서 강하게 보관한다(D-19).
    private var navProxy: NavigationDelegateProxy?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // D-23 첫 프레임 — 웹이 뜨기 전 WebView 배경·상태바를 저장값으로(흰/검 깜빡임 방지).
        applyTheme(ThemeStore.load(), animated: false)
        guard let wv = webView else { return }
        // userContentController 는 핸들러를 강하게 잡는다 → 약한 참조 래퍼로 순환을 끊는다.
        wv.configuration.userContentController.add(WeakScriptMessageHandler(self), name: "ghTrade")
        // 오프라인 필터 — Capacitor 델리게이트를 교체하지 않고 앞에 세운다(원래 동작은 전부 전달, T-21-37).
        let proxy = NavigationDelegateProxy(original: wv.navigationDelegate, owner: self)
        navProxy = proxy
        wv.navigationDelegate = proxy
        // D-28 새 창 요청도 같은 프록시 — 원본 UI 델리게이트를 **교체 전에** 잡는다(알림·확인 창은 계속 Capacitor 로).
        // uiDelegate 는 weak — 프록시는 navProxy 가 강하게 보관한다.
        proxy.originalUI = wv.uiDelegate
        wv.uiDelegate = proxy
        setupPullToRefresh()
        observeURL()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // 풀블리드(D-25 · contentInsetAdjustmentBehavior .never)라 스피너가 상태바 뒤에 그려진다 → 안전영역 아래로 내린다.
        if let rc = pullRefreshControl {
            rc.bounds = CGRect(x: rc.bounds.origin.x, y: -view.safeAreaInsets.top,
                               width: rc.bounds.width, height: rc.bounds.height)
        }
    }

    // MARK: - 방향 (D-24 · Pitfall 9)

    /// Capacitor 는 infoDictionary 의 `UISupportedInterfaceOrientations`(폰 = 세로)만 읽는다 — `~ipad` 병합에 기대지 않고
    /// idiom 으로 확정한다. 폰 세로 고정 · iPad 4방향(Split View 허용 — UIRequiresFullScreen 없음).
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
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

        // WR-03: 보낸 프레임의 출처(WKSecurityOrigin) 스킴 · 호스트 · 포트가 앱 서버 URL 과 모두 같아야 한다 —
        // 호스트만 보면 dev(`http://localhost:3100`)와 오프라인 페이지(`capacitor://localhost`)가 같은 출처로 판정된다.
        // WKSecurityOrigin 은 기본 포트를 0 으로 준다 → 양쪽 모두 기본 포트(http 80 · https 443)를 0 으로 맞춘다.
        let o = message.frameInfo.securityOrigin
        let s = bridge?.config.serverURL
        func normalizedPort(_ port: Int, _ scheme: String) -> Int {
            (scheme == "http" && port == 80) || (scheme == "https" && port == 443) ? 0 : port
        }
        guard let s, let appScheme = s.scheme?.lowercased(), let appHost = s.host?.lowercased(),
              !o.host.isEmpty,
              o.protocol.lowercased() == appScheme,
              o.host.lowercased() == appHost,
              normalizedPort(o.port, appScheme) == normalizedPort(s.port ?? 0, appScheme)
        else {
            log.debug("ignored \(rawType, privacy: .public) from foreign origin")
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
                updatePullToRefreshAvailability()
            }
        case .route:
            // 화이트리스트에는 남긴다(Android 뒤로가기의 현재 경로 계약) — iOS 는 기록만 한다(quick-261107-fbj).
            log.debug("message \(rawType, privacy: .public)")
        case .overlay:
            overlayOpen = (payload?["open"] as? Bool) == true
            log.debug("overlay open=\(self.overlayOpen, privacy: .public)")
            updatePullToRefreshAvailability()
        case .theme:
            // T-21-02: "dark"/"light" 두 값만 받는다 — 그 외는 무시(저장도 하지 않는다).
            guard let raw = payload?["theme"] as? String, let t = GHTradeTheme(rawValue: raw) else { return }
            applyTheme(t, animated: true)
        case .pull:
            // Android 전용(SwipeRefreshLayout 내부 스크롤 신호). iOS 는 CSS overscroll-behavior 로 체이닝을 끊는다.
            log.debug("message \(rawType, privacy: .public)")
        case .openSettings:
            openAppSettings()
        }
    }

    /// 이 앱의 설정 화면(알림 항목 포함)을 연다(Phase 40 D-14). minimum iOS 15 라 알림 설정 직행 URL 은 쓰지 않는다.
    private func openAppSettings() {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            self.log.notice("openSettings")
            UIApplication.shared.open(url)
        }
    }

    // MARK: - 테마 (D-23 — 웹이 정본, 네이티브는 따라가며 마지막 값만 저장. OS 다크모드는 보지 않는다)

    /// 라이트 `#ffffff` · 다크 `#0a0a0a`(GHTradePalette.bg) 를 WebView/스크롤/창 배경에 칠하고
    /// 상태바 · 시스템 크롬(스피너·키보드)을 바꾼 뒤 저장한다.
    func applyTheme(_ t: GHTradeTheme, animated: Bool) {
        let p = GHTradePalette.of(t)
        let changed = t != currentTheme
        // 불투명이면 첫 페인트 전 흰 면이 비친다 — 배경색이 보이도록 투명 처리(weekly-wine setupPullToRefresh).
        webView?.isOpaque = false
        let apply = { [weak self] in
            guard let self else { return }
            self.currentTheme = t
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

    // MARK: - 오프라인 폴백 (D-19)

    /// 첫 로드·이동이 네트워크 오류로 실패했을 때 `NavigationDelegateProxy` 가 부른다.
    /// 앱 내장 `capacitor://localhost/index.html?to=<원래 URL>&theme=<현재>` 를 띄운다 — 페이지가 도달 탐침 성공 시
    /// `to`(허용 출처만 · T-21-06)로 돌아간다. 호스트가 앱 서버가 아니므로 당겨서 새로고침은 URL 규칙으로 꺼진다(D-12 ②).
    func showOffline(failedURL: URL?) {
        guard !isOfflinePage, let bridge, let wv = webView else { return }
        let target: URL
        if let failedURL, let scheme = failedURL.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            target = failedURL
        } else {
            target = bridge.config.serverURL
        }
        guard var c = URLComponents(url: bridge.config.localURL.appendingPathComponent("index.html"), resolvingAgainstBaseURL: false)
        else { return }
        var items = [
            URLQueryItem(name: "to", value: target.absoluteString),
            URLQueryItem(name: "theme", value: currentTheme.rawValue),
        ]
        // IN-02 — 폴백 페이지는 dev=1 일 때만 localhost 복귀를 허용한다(21-29). 서버 URL 이 루프백 http(dev 빌드)일 때만
        // 붙는다 — 운영 https 서버에는 없다.
        let server = bridge.config.serverURL
        if server.scheme?.lowercased() == "http", let h = server.host?.lowercased(), h == "localhost" || h == "127.0.0.1" {
            items.append(URLQueryItem(name: "dev", value: "1"))
        }
        c.queryItems = items
        // URLComponents 는 `+` 를 그대로 두는데 웹 URLSearchParams 는 공백으로 읽는다 → 명시 인코딩.
        let query = c.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        c.percentEncodedQuery = query
        guard let url = c.url else { return }
        log.notice("offline fallback for \(target.absoluteString, privacy: .public)")
        wv.load(URLRequest(url: url))
    }

    // MARK: - URL 관찰 (D-12 ② — 오프라인 페이지 판정)

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
        updatePullToRefreshAvailability()
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
