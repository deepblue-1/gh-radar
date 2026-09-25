package com.ghtrade.app

import android.webkit.WebView
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebViewClient

/**
 * Capacitor `BridgeWebViewClient` 상속본 (Pitfall 4 — 통째 교체 금지).
 *
 * 모든 오버라이드는 super 를 먼저 부른다. 로컬 에셋 요청 가로채기와 HTTP 오류 콜백은
 * 오버라이드하지 않는다 — 로컬 에셋 서버(오프라인 페이지)가 살고, 404/5xx 는 웹 페이지 그대로 보인다(Pitfall 2).
 * 네트워크 오류 → 오프라인 폴백은 21-13 이 `onReceivedError` 로 더한다.
 */
class GhTradeWebViewClient(bridge: Bridge, private val host: MainActivity) : BridgeWebViewClient(bridge) {

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        if (url != null) host.onUrlChanged(url)
    }

    override fun doUpdateVisitedHistory(view: WebView?, url: String?, isReload: Boolean) {
        super.doUpdateVisitedHistory(view, url, isReload)
        if (url != null) host.onUrlChanged(url)
    }
}
