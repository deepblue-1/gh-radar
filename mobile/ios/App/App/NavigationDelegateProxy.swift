import WebKit
import SafariServices
import os

/// Capacitor 내비게이션 델리게이트 앞에 서는 전달형 프록시(D-19 · RESEARCH Pattern 5).
///
/// Capacitor 의 `WebViewDelegationHandler` 는 앱 호스트 판정 · 외부 링크를 시스템으로 넘기기 · 플러그인
/// `shouldOverrideLoad` 를 맡는다 — 교체하면 그 동작이 사라진다(T-21-37). 그래서 직접 처리하는 것은
/// ① 실패 콜백 두 개(원본을 먼저 부른 뒤 오프라인 판정)와 ② 호스트 밖 http(s) 정책 결정(D-28 —
/// `ExternalLinks.opensInAppBrowser` 가 true 인 최상위 이동만 SFSafariViewController 로 연다)뿐이고,
/// 나머지 모든 콜백(가로채지 않은 정책 결정 포함)은 원본에 그대로 넘긴다 — 정책 결정은 명시 호출,
/// 그 외는 `responds(to:)` · `forwardingTarget(for:)` 자동 전달. 원형: weekly-wine `PaymentNavigationDelegate`.
///
/// 오프라인 폴백은 **네트워크 오류 코드만** 띄운다 — `-999`(취소: 리다이렉트·연속 이동) · HTTP 4xx/5xx 는
/// 오탐이므로 무시한다(Pitfall 2 · T-21-38). Capacitor 의 오류 경로 설정은 이 오탐 때문에 쓰지 않는다.
final class NavigationDelegateProxy: NSObject, WKNavigationDelegate {
    /// Capacitor `WebViewDelegationHandler` — bridge 가 강하게 보유한다.
    weak var original: WKNavigationDelegate?
    weak var owner: GHTradeBridgeViewController?

    private let log = Logger(subsystem: "com.ghtrade.app", category: "links")

    /// -1009 · -1001 · -1003 · -1004 · -1005 · -1020.
    private static let offlineCodes: Set<Int> = [
        NSURLErrorNotConnectedToInternet,
        NSURLErrorTimedOut,
        NSURLErrorCannotFindHost,
        NSURLErrorCannotConnectToHost,
        NSURLErrorNetworkConnectionLost,
        NSURLErrorDataNotAllowed,
    ]

    init(original: WKNavigationDelegate?, owner: GHTradeBridgeViewController) {
        self.original = original
        self.owner = owner
        super.init()
    }

    // MARK: - 호스트 밖 http(s) → 인앱 브라우저 (D-28 · G-21-N3)

    /// 최상위(새 창 요청 `targetFrame == nil` 포함) 이동이 호스트 밖 http(s) 면 취소하고 SFSafariViewController 로 연다.
    /// 그 외(같은 호스트 · 비 http(s) · 하위 프레임 · 앱 호스트 모름)는 원본(Capacitor)의 판정을 그대로 받는다.
    /// `decisionHandler` 는 모든 분기에서 정확히 한 번 부른다 — 가로채기: `.cancel` · 원본 있음: 원본이 부름 ·
    /// 원본 없음/미구현: `.allow`.
    /// ※ `WKWebpagePreferences` 를 받는 4인자 오버로드는 구현하지 않는다 — 구현하면 WebKit 이 그쪽만 불러 전달 경로가 바뀐다.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let topLevel = navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true
        if topLevel, let url = navigationAction.request.url,
           ExternalLinks.opensInAppBrowser(scheme: url.scheme, host: url.host, appHost: owner?.bridge?.config.serverURL.host) {
            decisionHandler(.cancel)
            presentInAppBrowser(url)
            return
        }
        // 선택적 프로토콜 메서드 — 원본이 없거나 구현하지 않으면 nil.
        let forwarded: Void? = original?.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        if forwarded == nil {
            decisionHandler(.allow)
        }
    }

    /// 앱 위 인앱 브라우저. URL 은 가공하지 않는다(세션 정보 덧붙임 없음 · T-21-45) — 로그는 호스트만.
    /// 전경 활성이 아니거나 이미 무언가 떠 있으면(연타 · T-21-47) 무시한다.
    private func presentInAppBrowser(_ url: URL) {
        guard let owner,
              owner.view.window?.windowScene?.activationState == .foregroundActive,
              owner.presentedViewController == nil
        else {
            log.debug("in-app browser skipped host=\(url.host ?? "-", privacy: .public)")
            return
        }
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        config.barCollapsingEnabled = true
        let vc = SFSafariViewController(url: url, configuration: config)
        vc.dismissButtonStyle = .close
        vc.preferredControlTintColor = GHTradePalette.of(owner.currentTheme).primary
        vc.overrideUserInterfaceStyle = owner.currentTheme.userInterfaceStyle
        log.notice("in-app browser host=\(url.host ?? "-", privacy: .public)")
        owner.present(vc, animated: true)
    }

    // MARK: - 실패 콜백 → 오프라인 폴백 (D-19)

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        handle(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFail: navigation, withError: error)
        handle(error)
    }

    private func handle(_ error: Error) {
        let e = error as NSError
        guard e.domain == NSURLErrorDomain,
              e.code != NSURLErrorCancelled,
              Self.offlineCodes.contains(e.code)
        else { return }
        owner?.showOffline(failedURL: e.userInfo[NSURLErrorFailingURLErrorKey] as? URL)
    }

    // MARK: - 구현하지 않은 델리게이트 메서드는 원본에 자동 전달

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let o = original, o.responds(to: aSelector) { return o }
        return super.forwardingTarget(for: aSelector)
    }
}
