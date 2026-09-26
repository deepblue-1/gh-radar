package com.ghtrade.app

import android.net.Uri
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONException
import org.json.JSONObject

/**
 * 웹 → 네이티브 채널 `window.GhTradeBridge.postMessage(json)` (D-12 · T-21-03 · WR-03).
 *
 * 채널(21-25 WR-03 답 a — `register` 한 곳에서 고른다):
 *  - WebMessageListener(`androidx.webkit`) — 허용 출처 규칙 = 서버 출처 하나 · 메인 프레임만 받는다.
 *    하위 프레임(서드파티 iframe)과 다른 출처 문서에는 객체 자체가 주입되지 않고, 와도 버린다.
 *  - 미지원 WebView 폴백 `addJavascriptInterface` — 모든 프레임에 노출되므로 최상위 URL 의 출처 전체(스킴·호스트·포트)로만 가린다
 *    (하위 프레임 판정은 이 경로에서 불가).
 * 두 채널 모두 웹 송신 계약(`postMessage(string)`)이 같다 — 웹 코드는 바뀌지 않는다.
 *
 * 공통 판정: 출처가 서버 URL 과 스킴·호스트·포트 모두 같지 않으면 버린다(dev `http://localhost:3100` ≠
 * 오프라인 `https://localhost`). JSON 파싱 실패 · 화이트리스트 밖 타입은 버린다. payload 는 `optJSONObject` 로만 읽는다.
 */
class GhTradeBridge(private val host: MainActivity) {

    /** 서버 출처로 채널을 등록한다(`MainActivity.load` — Capacitor 의 첫 로드가 시작되기 전 같은 UI 작업 안). */
    fun register(wv: WebView) {
        val server = host.serverUri()
        val scheme = server?.scheme?.lowercase()
        val hostName = server?.host?.lowercase()
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) && scheme != null && hostName != null) {
            // 기본 포트(http 80 · https 443)는 출처 문자열에서 뺀다 — 규칙 문법과 WebView 가 보고하는 출처가 같은 모양이 되게.
            val port = effectivePort(scheme, server.port)
            val origin = "$scheme://$hostName" + if (port != defaultPort(scheme)) ":$port" else ""
            WebViewCompat.addWebMessageListener(wv, JS_NAME, setOf(origin)) { _, message, sourceOrigin, isMainFrame, _ ->
                // 규칙이 이미 출처를 가렸어도 한 번 더 본다 — 하위 프레임 · 규칙 밖 출처는 버린다.
                if (!isMainFrame || !isAppOrigin(sourceOrigin)) return@addWebMessageListener
                handle(message.data ?: return@addWebMessageListener)
            }
            Log.i(MainActivity.TAG, "bridge channel=webmessage origin=$origin")
        } else {
            wv.addJavascriptInterface(this, JS_NAME)
            Log.i(MainActivity.TAG, "bridge channel=jsinterface")
        }
    }

    /** 폴백 채널(`addJavascriptInterface`) 진입점. JS 브리지 스레드에서 불리므로 곧바로 UI 스레드로 넘긴다. */
    @JavascriptInterface
    fun postMessage(json: String) {
        host.runOnUiThread {
            // 폴백은 호출 프레임을 알 수 없다 → 최상위 문서의 출처 전체로 가린다.
            val top = host.bridge.webView?.url?.let { Uri.parse(it) }
            if (isAppOrigin(top)) handle(json)
        }
    }

    /**
     * 서버 URI 와 스킴(소문자) · 호스트(소문자) · 포트(`Uri.port`, 없음 = -1) 전부 정확 일치. 하나라도 null 이면 false.
     * 포트는 양쪽 모두 기본 포트(http 80 · https 443)로 정규화해 비교한다 — 서버 URL 에 `:443` 을 적어도 운영 출처가 거부되지 않게(21-28 iOS 와 같음).
     */
    private fun isAppOrigin(uri: Uri?): Boolean {
        val server = host.serverUri() ?: return false
        val scheme = uri?.scheme?.lowercase() ?: return false
        val hostName = uri.host?.lowercase() ?: return false
        val serverScheme = server.scheme?.lowercase() ?: return false
        val serverHost = server.host?.lowercase() ?: return false
        return scheme == serverScheme && hostName == serverHost &&
            effectivePort(scheme, uri.port) == effectivePort(serverScheme, server.port)
    }

    private fun defaultPort(scheme: String): Int = when (scheme) {
        "http" -> 80
        "https" -> 443
        else -> -1
    }

    private fun effectivePort(scheme: String, port: Int): Int = if (port == -1) defaultPort(scheme) else port

    private fun handle(json: String) {
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
        const val JS_NAME = "GhTradeBridge"
        val ALLOWED_TYPES = setOf("ready", "route", "theme", "overlay", "pull")
    }
}
