package com.ghtrade.app

import android.util.Log
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebViewClient

/**
 * Capacitor `BridgeWebViewClient` 상속본 (Pitfall 4 — 통째 교체 금지).
 *
 * 모든 오버라이드는 super 를 먼저 부른다(예외 `shouldOverrideUrlLoading` — 호스트 밖 http(s) 만 가로채고 나머지는 super 결과를 그대로 반환). 로컬 에셋 요청 가로채기와 HTTP 오류 콜백은
 * 오버라이드하지 않는다 — 로컬 에셋 서버(오프라인 페이지)가 살고, 404/5xx 는 웹 페이지 그대로 보인다(Pitfall 2).
 * 네트워크 오류 → 오프라인 폴백은 `onReceivedError` 에서 메인 프레임 + 네트워크 오류 코드 4종만(D-19 · A2).
 * Capacitor `server.errorPath` 는 쓰지 않는다 — HTTP 4xx/5xx 에도 폴백을 띄운다.
 * 사이트(서버 호스트) 밖 http(s) 메인 프레임 이동은 Custom Tabs 로 연다(D-28) — 판정은 `ExternalLinks` 한 곳.
 */
class GhTradeWebViewClient(bridge: Bridge, private val host: MainActivity) : BridgeWebViewClient(bridge) {

    /**
     * D-28: 메인 프레임의 호스트 밖 http(s) 이동만 인앱 브라우저로 가로챈다.
     * Capacitor 는 멀티 윈도우를 켜지 않으므로 `target=_blank` · `window.open` 도 여기(메인 프레임 이동)로 온다.
     * 그 외(같은 호스트 → WebView · 비 http(s) → 시스템 인텐트 · data/blob → WebView · 하위 프레임)는 super 그대로.
     */
    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        if (request != null && request.isForMainFrame &&
            ExternalLinks.opensInAppBrowser(request.url.scheme, request.url.host, host.serverHost())
        ) {
            InAppBrowser.open(host, request.url, host.currentTheme)
            return true
        }
        return super.shouldOverrideUrlLoading(view, request)
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        if (url != null) host.onUrlChanged(url)
    }

    override fun doUpdateVisitedHistory(view: WebView?, url: String?, isReload: Boolean) {
        super.doUpdateVisitedHistory(view, url, isReload)
        if (url != null) host.onUrlChanged(url)
    }

    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
        super.onReceivedError(view, request, error)
        if (request == null || error == null || !request.isForMainFrame) return
        if (error.errorCode in NETWORK_ERRORS) {
            host.showOffline(request.url.toString())
        } else {
            Log.d(MainActivity.TAG, "main frame error ${error.errorCode} ignored (not network)")
        }
    }

    private companion object {
        /** 오프라인으로 보는 코드 — DNS 실패 · 연결 실패 · 읽기/쓰기 실패 · 타임아웃(A2). */
        val NETWORK_ERRORS = setOf(
            WebViewClient.ERROR_HOST_LOOKUP,
            WebViewClient.ERROR_CONNECT,
            WebViewClient.ERROR_IO,
            WebViewClient.ERROR_TIMEOUT,
        )
    }
}
