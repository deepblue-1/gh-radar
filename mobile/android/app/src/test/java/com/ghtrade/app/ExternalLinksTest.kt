package com.ghtrade.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * D-28 사이트(서버 호스트) 밖 http(s) → 인앱 브라우저 판정 표 — `ExternalLinks.opensInAppBrowser` 의 정본.
 *
 * iOS `mobile/scripts/external-links-check.swift`(21-22)와 **같은 순서·같은 기대값**이다 —
 * 한쪽 표만 바꾸면 두 앱의 링크 동작이 갈린다. 표를 고치면 두 파일을 함께 고칠 것.
 * 표가 정본이다 — 케이스가 틀리면 표가 아니라 `ExternalLinks.kt` 를 고친다.
 * 실행: `pnpm --filter @gh-radar/mobile run native:test:android`
 */
class ExternalLinksTest {

    private data class Case(val no: Int, val scheme: String?, val host: String?, val appHost: String?, val expected: Boolean)

    @Test
    fun opensInAppBrowser() {
        val app = "trade.jx1.io"
        val cases = listOf(
            Case(1, "https", "n.news.naver.com", app, true),
            Case(2, "http", "example.com", app, true),
            Case(3, "HTTPS", "Example.COM", app, true), // 대소문자
            Case(4, "https", "trade.jx1.io", app, false), // 같은 호스트
            Case(5, "https", "TRADE.JX1.IO", app, false),
            Case(6, "https", "www.trade.jx1.io", app, true), // 다른 호스트 = 사이트 밖
            Case(7, "https", "trade.jx1.io.evil.com", app, true), // 접미사 위장 = 외부(T-21-44)
            Case(8, "https", "localhost", app, false), // 로컬 에셋 서버(오프라인 폴백)
            Case(9, "http", "localhost", "localhost", false), // dev
            Case(10, "http", "127.0.0.1", app, false),
            Case(11, "http", "::1", app, false),
            Case(12, "http", "[::1]", app, false),
            Case(13, "capacitor", "localhost", app, false),
            Case(14, "mailto", null, app, false),
            Case(15, "tel", null, app, false),
            Case(16, "javascript", null, app, false),
            Case(17, "data", null, app, false),
            Case(18, "file", "", app, false),
            Case(19, "blob", null, app, false),
            Case(20, "intent", "scan", app, false),
            Case(21, "about", null, app, false),
            Case(22, "kakaotalk", "inappbrowse", app, false), // 앱 딥링크
            Case(23, "https", "", app, false),
            Case(24, "https", null, app, false),
            Case(25, "https", "n.news.naver.com", null, false), // 앱 호스트 모름
            Case(26, null, null, app, false),
        )
        assertEquals("정본 표는 26케이스", 26, cases.size)
        for (c in cases) {
            assertEquals(
                "${c.no} ${c.scheme}://${c.host} app=${c.appHost}",
                c.expected,
                ExternalLinks.opensInAppBrowser(c.scheme, c.host, c.appHost),
            )
        }
    }
}
