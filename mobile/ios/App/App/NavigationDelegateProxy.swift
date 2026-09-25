import WebKit

/// Capacitor 내비게이션 델리게이트 앞에 서는 전달형 프록시(D-19 · RESEARCH Pattern 5).
///
/// Capacitor 의 `WebViewDelegationHandler` 는 앱 호스트 판정 · 외부 링크를 시스템으로 넘기기 · 플러그인
/// `shouldOverrideLoad` 를 맡는다 — 교체하면 그 동작이 사라진다(T-21-37). 그래서 실패 콜백 두 개만 구현하고
/// (원본을 먼저 부른 뒤) 나머지 모든 콜백(정책 결정 포함)은 `responds(to:)` · `forwardingTarget(for:)` 로
/// 원본에 자동 전달한다. 원형: weekly-wine `PaymentNavigationDelegate`.
///
/// 오프라인 폴백은 **네트워크 오류 코드만** 띄운다 — `-999`(취소: 리다이렉트·연속 이동) · HTTP 4xx/5xx 는
/// 오탐이므로 무시한다(Pitfall 2 · T-21-38). Capacitor 의 오류 경로 설정은 이 오탐 때문에 쓰지 않는다.
final class NavigationDelegateProxy: NSObject, WKNavigationDelegate {
    /// Capacitor `WebViewDelegationHandler` — bridge 가 강하게 보유한다.
    weak var original: WKNavigationDelegate?
    weak var owner: GHTradeBridgeViewController?

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
