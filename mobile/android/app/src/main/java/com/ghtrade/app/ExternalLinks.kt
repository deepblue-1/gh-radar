package com.ghtrade.app

import java.util.Locale

/**
 * 사이트(서버 호스트) 밖 http(s) 링크를 인앱 브라우저로 열지 판정한다 — CONTEXT D-28 · UAT G-21-N3.
 *
 * 순수 함수(JVM 단위 테스트 대상 · Android API 없음). 판정 순서 — 하나라도 걸리면 false(= Capacitor 기본 경로):
 *  1. 스킴이 `http`·`https` 가 아니다(mailto · tel · 앱 딥링크 · javascript · data · file · blob · intent · about …)
 *     → 시스템 인텐트/WebView 처리는 Capacitor 가 지금처럼 한다(T-21-43).
 *  2. 링크 호스트가 없다.
 *  3. 앱 호스트를 모른다 — 모르면 가로채지 않는다.
 *  4. 링크 호스트가 앱 호스트와 **소문자 정확 일치**다 — 접미사·포함 비교는 하지 않는다(위장 호스트는 외부 · T-21-44).
 *  5. 루프백(`localhost` · `127.0.0.1` · `::1` · `[::1]`)이다 — 로컬 에셋 서버 오프라인 폴백 · dev 서버.
 * 그 외는 true.
 *
 * iOS 21-22 `ExternalLinks.swift` 와 같은 표를 유지한다 — 표를 고치면 두 파일을 함께
 * (정본 표: `ExternalLinksTest` · iOS `mobile/scripts/external-links-check.swift`).
 */
object ExternalLinks {

    private val WEB_SCHEMES = setOf("http", "https")
    private val LOOPBACK_HOSTS = setOf("localhost", "127.0.0.1", "::1", "[::1]")

    fun opensInAppBrowser(scheme: String?, host: String?, appHost: String?): Boolean {
        val s = scheme?.lowercase(Locale.ROOT) ?: return false
        if (s !in WEB_SCHEMES) return false
        if (host.isNullOrEmpty()) return false
        if (appHost.isNullOrEmpty()) return false
        val h = host.lowercase(Locale.ROOT)
        if (h == appHost.lowercase(Locale.ROOT)) return false
        if (h in LOOPBACK_HOSTS) return false
        return true
    }
}
