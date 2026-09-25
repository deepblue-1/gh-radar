package com.ghtrade.app

import android.net.Uri
import android.util.Log
import com.getcapacitor.BridgeActivity
import org.json.JSONObject

/**
 * GH Trade Android 셸 (Phase 21 · D-02).
 *
 * Capacitor 가 만든 WebView 위에 붙는다 — `load()` 에서 `super.load()` 뒤에만 확장한다.
 *  - WebView 클라이언트는 `BridgeWebViewClient` 상속본을 `bridge.setWebViewClient` 로 설치한다.
 *    WebView 에 새 클라이언트 인스턴스를 직접 대입하면 로컬 에셋 서버·SystemBars 콜백이 끊긴다(Pitfall 4).
 *  - 웹 → 네이티브 채널은 `window.GhTradeBridge.postMessage(json)` 하나(`GhTradeBridge`).
 *  - 뒤로가기는 21-13 이 `onBackPressedDispatcher` 로 붙인다 — 옛 back 콜백 오버라이드는 Android 16 에서 불리지 않는다(Pitfall 5).
 *  - DecorView/루트에 인셋 리스너를 걸지 않는다 — SystemBars 의 리스너를 덮어쓴다(Pitfall 8).
 */
class MainActivity : BridgeActivity() {

    override fun load() {
        super.load()
        val wv = bridge.webView ?: return
        bridge.setWebViewClient(GhTradeWebViewClient(bridge, this))
        wv.addJavascriptInterface(GhTradeBridge(this), "GhTradeBridge")
    }

    /** 앱 호스트 = server.url 호스트(없으면 appUrl 호스트). 브리지 메시지 출처 검사에 쓴다(T-21-03). */
    fun serverHost(): String? {
        val url = bridge.config.serverUrl ?: bridge.appUrl ?: return null
        return Uri.parse(url).host
    }

    /** 페이지 로드 완료 · history 변경(pushState 포함)마다 불린다. 21-12 가 탭바 판정을 붙인다. */
    fun onUrlChanged(url: String) {
        Log.d(TAG, "url=$url")
    }

    /** `GhTradeBridge` 가 출처·타입 검사를 통과시킨 메시지만 UI 스레드에서 전달한다. */
    fun onNativeMessage(type: String, payload: JSONObject?) {
        when (type) {
            "ready" -> Log.i(
                TAG,
                "ready platform=${payload?.optString("platform")} nativeApp=${payload?.optBoolean("nativeApp")}",
            )
            // route · theme · overlay · pull 은 21-12 · 21-13 이 채운다(계획된 분할).
            else -> Log.d(TAG, "message type=$type")
        }
    }

    companion object {
        const val TAG = "GHTrade"
    }
}
