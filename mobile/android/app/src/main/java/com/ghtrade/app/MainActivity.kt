package com.ghtrade.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.getcapacitor.BridgeActivity
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder

/**
 * GH Trade Android 셸 (Phase 21 · D-02).
 *
 * Capacitor 가 만든 WebView 위에 붙는다 — `load()` 에서 `super.load()` 뒤에만 확장한다.
 *  - WebView 클라이언트는 `BridgeWebViewClient` 상속본을 `bridge.setWebViewClient` 로 설치한다.
 *    WebView 에 새 클라이언트 인스턴스를 직접 대입하면 로컬 에셋 서버·SystemBars 콜백이 끊긴다(Pitfall 4).
 *  - 웹 → 네이티브 채널은 `window.GhTradeBridge.postMessage(json)` 하나(`GhTradeBridge` — WebMessageListener · 폴백 JS 인터페이스).
 *  - 뒤로가기(D-26)는 `onBackPressedDispatcher` 콜백 하나 — 옛 back 콜백 오버라이드는 Android 16 에서 불리지 않는다(Pitfall 5).
 *  - 당겨서 새로고침(D-04 · D-17)은 WebView 를 `SwipeRefreshLayout` 으로 감싸 웹 refresh 훅을 부르고 1초 뒤 스피너를 닫는다.
 *  - 테마(D-23)는 웹이 정본 — `applyTheme` 한 곳에서 시스템 바 아이콘 명암·배경·스피너를 바꾸고 저장한다.
 *    OS 다크모드(uiMode)는 보지 않는다. 창 상태바 색은 직접 칠하지 않는다(엣지투엣지 · SystemBars 와 충돌).
 *  - 방향(D-24): 폰 세로 · 태블릿(sw600dp) 전방향 — `R.bool.is_tablet` 으로 `onCreate` 에서 분기.
 *  - 오프라인(D-19): 메인 프레임 네트워크 오류에서만 로컬 폴백 `https://localhost/index.html` (`GhTradeWebViewClient`).
 *  - DecorView/루트/WebView 에 인셋 리스너를 걸지 않는다 — SystemBars 의 DecorView 리스너(CSS 안전영역 주입 · IME 패딩)를
 *    덮어쓴다(Pitfall 8). 인셋 리스너를 걸지 않는다.
 *  - quick-261107-fbj 로 네이티브 하단 탭바 제거 — 이동은 웹 헤더 햄버거 드로어. 현재 경로(`currentPath`)는 뒤로가기 ④(홈으로)
 *    판정에만 쓴다(`AppRoutes`).
 */
class MainActivity : BridgeActivity() {

    /** 템플릿 CoordinatorLayout. 21-13 이 WebView 를 SwipeRefreshLayout 으로 감싸기 **전에** 잡아 둔다(스피너 위치가 읽는다). */
    lateinit var rootLayout: ViewGroup
        private set

    /** 웹 테마(D-23 — 웹이 정본). 바꾸는 경로는 `applyTheme` 하나(시스템 바·배경·저장이 따로 놀지 않게). */
    // D-23a: 저장값 없는 기본과 같게, load() 가 곧 ThemeStore 값으로 덮는다.
    var currentTheme = "dark"
        private set

    /** 현재 앱 서버 문서의 정규화 경로 — 뒤로가기 ④ 판정용(onUrlChanged · route 메시지가 갱신). */
    var currentPath = "/"
        private set

    /** 현재 문서가 앱 서버(server.url 의 스킴+호스트) 밖 = 오프라인 로컬 페이지 등(D-12 ②). */
    var isOfflinePage = false
        private set

    /** 웹 `overlay {open}` 신호(D-12 ③). 새 문서의 `ready` 에서 false 로 되돌린다(T-21-18 고착 방지). */
    var overlayOpen = false
        private set

    /** 웹 `pull {blocked}` 신호 — 21-13 의 SwipeRefreshLayout 이 소비한다. */
    var pullBlocked = false
        private set

    /** WebView 를 감싼 당겨서 새로고침 레이아웃(D-04). 스피너 색은 `applyTheme` 이 정한다. */
    lateinit var swipeRefresh: SwipeRefreshLayout
        private set

    /** 뒤로가기로 홈에 보낸 직후 한 번 WebView 히스토리를 비운다 — 홈에서 다시 뒤로가기 = 종료가 되게(D-26). */
    private var clearHistoryOnHome = false

    override fun onCreate(savedInstanceState: Bundle?) {
        // D-24: 매니페스트 screenOrientation 은 enum 이라 리소스로 분기할 수 없다 → super 전에 코드로 정한다.
        // (Android 16 은 sw600dp 이상에서 방향 제한을 무시한다 — 태블릿은 어차피 전방향.)
        requestedOrientation = if (resources.getBoolean(R.bool.is_tablet)) {
            ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        super.onCreate(savedInstanceState)
        // D-26 · Pitfall 5: Android 16(targetSdk 36)은 옛 back 오버라이드를 부르지 않는다 → 디스패처 콜백만 쓴다.
        // `@capacitor/app` 은 설치돼 있지 않아 경합하는 콜백이 없다(Pitfall 12).
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = handleBack()
        })
    }

    override fun load() {
        super.load()
        val wv = bridge.webView ?: return
        bridge.setWebViewClient(GhTradeWebViewClient(bridge, this))
        // WR-03: WebMessageListener(서버 출처 · 메인 프레임만) — 미지원 WebView 는 JS 인터페이스 + 출처 전체 비교 폴백.
        GhTradeBridge(this).register(wv)
        // rootLayout(템플릿 CoordinatorLayout)을 먼저 잡은 **뒤** WebView 를 감싼다 — 감싼 뒤엔 WebView 부모가 바뀐다.
        rootLayout = wv.parent as ViewGroup
        wrapInSwipeRefresh(wv)
        // D-23 첫 프레임 = 저장된 마지막 웹 테마.
        applyTheme(ThemeStore.load(this))
        // SystemBars.load() 가 super.load() 안에서 메인 루퍼에 setStyle(DEFAULT = OS 다크모드 기준 아이콘 · DecorView 배경)을
        // post 해 둔다 → 그 뒤에 한 번 더 칠한다(같은 루퍼 FIFO — 우리 post 가 나중에 돈다, Pitfall 13).
        Handler(Looper.getMainLooper()).post { applyTheme(currentTheme) }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        // 회전·uiMode 변경 → SystemBars 가 super 안에서 OS 다크모드 스타일과 DecorView 배경으로 되돌린다 → 그 **뒤에** 재적용(Pitfall 13).
        super.onConfigurationChanged(newConfig)
        if (bridge?.webView == null) return
        applyTheme(currentTheme)
        // 스피너 위치만 다시 잡는다(상태바 높이가 방향에 따라 바뀐다).
        updateSpinnerOffset()
    }

    override fun onPause() {
        super.onPause()
        // 백그라운드 전환 때 Supabase 세션 쿠키를 디스크에 남긴다(프로세스가 죽어도 로그인 유지).
        CookieManager.getInstance().flush()
    }

    /** 앱 호스트 = server.url 호스트(없으면 appUrl 호스트). 브리지 메시지 출처 검사에 쓴다(T-21-03). */
    fun serverHost(): String? = serverUri()?.host

    /** 앱 서버 URI(server.url · 없으면 appUrl). 브리지 출처 판정(스킴·호스트·포트)의 기준(WR-03). */
    fun serverUri(): Uri? {
        val url = bridge.config.serverUrl ?: bridge.appUrl ?: return null
        return Uri.parse(url)
    }

    // ── 당겨서 새로고침 (D-04 · D-17 · Pitfall 7) ────────────────────────────────

    /** weekly-wine `setupPullToRefresh` 이식 — WebView 를 부모에서 떼어 같은 index·layoutParams 로 감싼다. */
    private fun wrapInSwipeRefresh(wv: WebView) {
        val parent = wv.parent as ViewGroup
        val index = parent.indexOfChild(wv)
        val lp = wv.layoutParams
        parent.removeView(wv)

        val swipe = SwipeRefreshLayout(this)
        swipe.addView(wv, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // 문서가 위로 스크롤돼 있음 · 웹이 내부 스크롤 당김을 막음(`pull {blocked}`) · 시트/다이얼로그 열림 · 오프라인 페이지
        // → 당김을 WebView 에 넘긴다(= 새로고침 비활성). `pull` 신호가 늦게 오는 경우는 웹 overscroll-behavior 가 보완(A13).
        swipe.setOnChildScrollUpCallback { _, _ ->
            wv.canScrollVertically(-1) || pullBlocked || overlayOpen || isOfflinePage
        }
        swipe.setOnRefreshListener {
            // 상수 스크립트만(외부 입력 없음). 훅 완료를 기다리지 않는다 — 스피너는 1초 고정(D-17).
            wv.evaluateJavascript(
                "window.__ghTrade&&window.__ghTrade.refresh?window.__ghTrade.refresh():location.reload()",
                null,
            )
            swipe.postDelayed({ swipe.isRefreshing = false }, 1000)
        }
        parent.addView(swipe, index, lp)
        swipeRefresh = swipe
        updateSpinnerOffset()
    }

    /**
     * 풀블리드라 기본 위치면 스피너가 상태바 밑에 깔린다 → 상태바 아래로 내린다.
     * 인셋 리스너를 새로 걸지 않고(Pitfall 8) 레이아웃이 붙은 뒤 루트 창 인셋을 한 번 읽는다.
     */
    private fun updateSpinnerOffset() {
        rootLayout.post {
            val top = ViewCompat.getRootWindowInsets(rootLayout)
                ?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: return@post
            // 기본값(-지름 → 64dp)을 상태바 높이만큼 내린 것 — 상태바 바로 아래에서 나와 top+64dp 에 멈춘다.
            swipeRefresh.setProgressViewOffset(false, top - dp(40f), top + dp(64f))
        }
    }

    // ── 테마 (D-23) ─────────────────────────────────────────────────────────

    /** 웹 테마를 네이티브 전부에 반영하고 저장한다. `theme` 은 "dark" 만 다크, 그 외는 라이트. */
    fun applyTheme(theme: String) {
        val t = if (theme == "dark") "dark" else "light"
        currentTheme = t
        val p = GhTradePalette.of(t)
        val light = t == "light"
        // 아이콘 명암만 바꾼다 — 상태바/내비바 배경은 웹 콘텐츠(풀블리드)가 비친다.
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = light
            isAppearanceLightNavigationBars = light
        }
        window.decorView.setBackgroundColor(p.bg)
        bridge?.webView?.setBackgroundColor(p.bg)
        if (::swipeRefresh.isInitialized) {
            swipeRefresh.setColorSchemeColors(p.primary)
            swipeRefresh.setProgressBackgroundColorSchemeColor(p.card)
        }
        ThemeStore.save(this, t)
    }

    // ── 오프라인 폴백 (D-19) ────────────────────────────────────────────────

    /**
     * 메인 프레임 네트워크 오류(`GhTradeWebViewClient`)에서만 불린다. 복귀 대상 판정은 폴백 페이지의 `safeTarget`
     * 허용 출처가 한다(T-21-06) — 여기서는 `URLEncoder` 로 인코딩만 한다(`+`·`&`·`#` 가 쿼리를 깨지 않게).
     * 호스트가 앱 서버가 아니므로 당김은 `onUrlChanged` 판정으로 꺼진다(D-12 ②).
     *
     * `loadUrl("https://localhost/…")` 는 쓸 수 없다 — server.url 이 있으면 Capacitor 로컬 서버가 `https://localhost` 요청을
     * 에셋이 아니라 실제 네트워크로 프록시한다(`WebViewLocalServer`: isMainUrl 은 serverUrl == null 일 때만 · 로컬 응답 예외는
     * `server.errorPath` 정확 일치뿐인데 errorPath 는 D-19 로 쓰지 않는다) → ERR_CONNECTION_REFUSED.
     * 그래서 cap sync 가 복사한 `www/index.html`(assets `public/index.html`)을 같은 URL 을 문서 주소로 삼아 직접 싣는다 —
     * 페이지의 `location.search`(`to`·`theme`)와 출처 판정은 그대로다. 페이지는 외부 리소스가 없다(21-11).
     */
    fun showOffline(failedUrl: String) {
        // 폴백 페이지 자신의 실패로 되부르지 않는다. 폴백에서 복귀하다 실패한 경우는 다시 폴백으로 돌아와야 하므로 막지 않는다.
        if (failedUrl.startsWith(OFFLINE_PAGE)) return
        val wv = bridge.webView ?: return
        val html = try {
            assets.open("public/index.html").bufferedReader().use { it.readText() }
        } catch (e: IOException) {
            Log.w(TAG, "offline page asset missing — fallback skipped", e)
            return
        }
        // IN-02: 폴백 페이지는 dev=1 이 있을 때만 localhost 복귀를 허용한다 — 서버가 루프백 http(dev 빌드)일 때만 붙인다.
        val server = serverUri()
        val dev = server?.scheme == "http" && (server.host == "localhost" || server.host == "127.0.0.1")
        val url = "https://localhost/index.html?to=" + URLEncoder.encode(failedUrl, "UTF-8") + "&theme=" + currentTheme +
            if (dev) "&dev=1" else ""
        Log.i(TAG, "offline fallback for $failedUrl")
        wv.loadDataWithBaseURL(url, html, "text/html", "UTF-8", url)
    }

    // ── 뒤로가기 (D-26) ───────────────────────────────────────────────────────

    /** ① 웹 오버레이 → 가장 위 시트만 닫기 ② 오프라인 폴백이면 종료(IN-03) ③ WebView 히스토리 ④ 홈이 아니면 홈 ⑤ 홈이면 종료. */
    private fun handleBack() {
        val wv = bridge.webView ?: return finish()
        if (overlayOpen) {
            // 웹 back() = 합성 Escape 로 가장 위 레이어만 닫고 true. 열린 게 없으면 false → 네이티브 순서로 넘어간다(21-04 계약).
            wv.evaluateJavascript("window.__ghTrade&&window.__ghTrade.back?window.__ghTrade.back():false") { result ->
                if (result != "true") navigateBack(wv)
            }
            return
        }
        navigateBack(wv)
    }

    private fun navigateBack(wv: WebView) {
        when {
            // IN-03: 오프라인 폴백에서의 뒤로가기 = 종료(21-13 첫 실행 오프라인과 같음). 세션 중 폴백이면 히스토리가
            // [앱 문서, 실패한 이동, 폴백] 이라 goBack 이 실패한 이동을 다시 불러 폴백으로 돌아오는 루프가 에뮬레이터에서 재현됐다.
            isOfflinePage -> finish()
            wv.canGoBack() -> wv.goBack()
            // 로그인/인증 화면에서 홈으로 보내면 미들웨어가 다시 로그인으로 돌려보낸다 → 그 화면에선 종료.
            !isOfflinePage && currentPath != "/" && !AppRoutes.isAuthPath(currentPath) -> {
                clearHistoryOnHome = true
                navigateHome()
            }
            else -> finish()
        }
    }

    /**
     * 뒤로가기 ④ — 웹 navigate 훅으로 홈(클라 내비라 relay 소켓 유지 · D-06a). 오프라인 폴백 문서는 ④ 판정이 이미 막는다.
     * T-21-36: 상수 스크립트만(외부 입력 없음).
     */
    private fun navigateHome() {
        bridge.webView?.evaluateJavascript(
            "window.__ghTrade&&window.__ghTrade.navigate?window.__ghTrade.navigate('/'):location.assign('/')",
            null,
        )
    }

    /** 페이지 로드 완료 · history 변경(pushState 포함)마다 불린다(`GhTradeWebViewClient`). */
    fun onUrlChanged(url: String) {
        val uri = Uri.parse(url)
        val server = serverUri()
        // 호스트만 비교하면 dev(`http://localhost:3100`)에서 로컬 오프라인 페이지(`https://localhost`)와 겹친다 → 스킴도 본다(21-10 과 같음).
        val onAppServer = server != null && uri.host == server.host && uri.scheme == server.scheme
        isOfflinePage = !onAppServer
        if (onAppServer) {
            applyPath(uri.path ?: "/")
            if (clearHistoryOnHome && currentPath == "/") {
                // 뒤로가기 ④ 로 온 홈 — 이전 항목을 지워 다음 뒤로가기가 종료가 되게 한다(홈↔하위 경로 왕복 루프 방지).
                clearHistoryOnHome = false
                bridge.webView?.clearHistory()
            }
        }
    }

    private fun applyPath(path: String) {
        currentPath = AppRoutes.normalize(path)
    }

    /** `GhTradeBridge` 가 출처·타입 검사를 통과시킨 메시지만 UI 스레드에서 전달한다. payload 는 표시 상태만 바꾼다(T-21-02). */
    fun onNativeMessage(type: String, payload: JSONObject?) {
        when (type) {
            "ready" -> {
                Log.i(
                    TAG,
                    "ready platform=${payload?.optString("platform")} nativeApp=${payload?.optBoolean("nativeApp")}",
                )
                // IN-01: 당김 차단도 새 문서에서 푼다 — 이전 문서의 마지막 `pull {blocked:true}` 가 첫 당김을 막지 않게(overlay 와 같은 이유).
                pullBlocked = false
                // 새 문서 = 웹 오버레이 참조계수 0 에서 시작 — 전체 로드로 닫힘 신호를 못 받은 경우를 푼다(T-21-18).
                overlayOpen = false
            }
            // SPA pushState 보강 — 뒤로가기 ④ 판정용 현재 경로. 문자열 · `/` 시작만 받는다.
            "route" -> {
                val path = payload?.optString("path").orEmpty()
                Log.d(TAG, "route path=$path")
                if (path.startsWith("/") && !isOfflinePage) applyPath(path)
            }
            "overlay" -> {
                overlayOpen = payload?.optBoolean("open") == true
                Log.d(TAG, "overlay open=$overlayOpen")
            }
            "pull" -> pullBlocked = payload?.optBoolean("blocked") == true
            // "dark"/"light" 두 값만 받는다(D-23).
            "theme" -> {
                val t = payload?.optString("theme")
                if (t == "dark" || t == "light") applyTheme(t)
            }
            // Phase 40 D-14: 푸시 권한을 거부한 사용자를 앱 알림 설정으로 보낸다(페이로드 없음).
            "openSettings" -> openAppNotificationSettings()
            else -> Log.d(TAG, "message type=$type")
        }
    }

    /**
     * 이 앱의 알림 설정 화면을 연다(Phase 40 D-14). API 26+ 는 앱 알림 설정 직행 ·
     * 그 아래는 앱 정보 화면(알림 항목이 거기 있다). 열 화면이 없으면 크래시 없이 경고 로그만 남긴다.
     */
    private fun openAppNotificationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
        }
        try {
            startActivity(intent)
            Log.i(TAG, "openSettings action=${intent.action}")
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "openSettings failed — no settings activity action=${intent.action}", e)
        }
    }

    private fun dpF(v: Float): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

    private fun dp(v: Float): Int = dpF(v).toInt()

    companion object {
        const val TAG = "GHTrade"

        /** Capacitor 로컬 에셋 서버의 오프라인 폴백(`mobile/www/index.html`). */
        private const val OFFLINE_PAGE = "https://localhost/"
    }
}
