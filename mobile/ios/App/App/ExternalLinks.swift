import Foundation

/// 사이트(서버 호스트) 밖 http(s) 링크를 인앱 브라우저(SFSafariViewController)로 열지 판정한다 — CONTEXT D-28 · UAT G-21-N3.
///
/// 순수 함수(Foundation 전용 — `scripts/check-external-links-ios.sh` 가 swiftc 단독 컴파일한다).
/// `opensInAppBrowser` 판정 순서 — 하나라도 걸리면 false(= Capacitor 기본 경로):
///  1. 스킴이 `http`·`https` 가 아니다(mailto · tel · 앱 딥링크 · javascript · data · file · blob · capacitor · about …)
///     → 시스템 핸드오프/WebView 처리는 Capacitor 가 지금처럼 한다(T-21-43).
///  2. 링크 호스트가 없다(nil · 빈 문자열).
///  3. 앱 호스트를 모른다 — 모르면 가로채지 않는다.
///  4. 링크 호스트가 앱 호스트와 **소문자 정확 일치**다 — 접미사·포함 비교는 하지 않는다(위장 호스트는 외부 · T-21-44).
///  5. 루프백(`localhost` · `127.0.0.1` · `::1` · `[::1]`)이다 — 로컬 에셋 서버 오프라인 폴백 · dev 서버.
/// 그 외는 true.
///
/// Android `ExternalLinks.kt` / `ExternalLinksTest.kt`(21-17)와 같은 표다 — 한쪽만 바꾸지 말 것
/// (정본 표: Android `ExternalLinksTest` · iOS `mobile/scripts/external-links-check.swift`).
enum ExternalLinks {

    private static let webSchemes: Set<String> = ["http", "https"]
    private static let loopbackHosts: Set<String> = ["localhost", "127.0.0.1", "::1", "[::1]"]

    static func opensInAppBrowser(scheme: String?, host: String?, appHost: String?) -> Bool {
        guard let s = scheme?.lowercased(), webSchemes.contains(s) else { return false }
        guard let host, !host.isEmpty else { return false }
        guard let appHost, !appHost.isEmpty else { return false }
        let h = host.lowercased()
        if h == appHost.lowercased() { return false }
        if loopbackHosts.contains(h) { return false }
        return true
    }

    /// 같은 앱 호스트의 http(s) 인가 — 같은 호스트 새 창 요청(`target=_blank` · `window.open`)을
    /// 같은 WebView 에 싣는 데 쓴다(Android 와 같은 동작). 소문자 정확 일치만.
    static func isSameAppHost(scheme: String?, host: String?, appHost: String?) -> Bool {
        guard let s = scheme?.lowercased(), webSchemes.contains(s) else { return false }
        guard let host, !host.isEmpty, let appHost, !appHost.isEmpty else { return false }
        return host.lowercased() == appHost.lowercased()
    }
}
