package com.ghtrade.app

import android.net.Uri
import android.webkit.JavascriptInterface
import org.json.JSONException
import org.json.JSONObject

/**
 * 웹 → 네이티브 채널 `window.GhTradeBridge.postMessage(json)` (D-12 · T-21-03).
 *
 * `addJavascriptInterface` 는 모든 프레임·출처에 이 객체를 노출한다 — 호출자를 신뢰하지 않는다.
 *  - 노출 메서드는 `postMessage` 하나.
 *  - JS 브리지 스레드에서 불리므로 곧바로 UI 스레드로 넘긴다.
 *  - 현재 WebView URL 호스트가 server.url 호스트가 아니면(오프라인 로컬 페이지 · 다른 출처) 버린다.
 *  - JSON 파싱 실패 · 화이트리스트 밖 타입은 버린다. payload 는 `optJSONObject` 로만 읽는다.
 */
class GhTradeBridge(private val host: MainActivity) {

    @JavascriptInterface
    fun postMessage(json: String) {
        host.runOnUiThread { handle(json) }
    }

    private fun handle(json: String) {
        val currentHost = host.bridge.webView?.url?.let { Uri.parse(it).host } ?: return
        if (currentHost != host.serverHost()) return

        val obj = try {
            JSONObject(json)
        } catch (_: JSONException) {
            return
        }
        val type = obj.optString("type")
        if (type !in ALLOWED_TYPES) return
        host.onNativeMessage(type, obj.optJSONObject("payload"))
    }

    private companion object {
        val ALLOWED_TYPES = setOf("ready", "route", "theme", "overlay", "pull")
    }
}
