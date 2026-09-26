package com.ghtrade.app

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.Interpolator
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.getcapacitor.BridgeActivity
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import kotlin.math.max

/**
 * GH Trade Android 셸 (Phase 21 · D-02).
 *
 * Capacitor 가 만든 WebView 위에 붙는다 — `load()` 에서 `super.load()` 뒤에만 확장한다.
 *  - WebView 클라이언트는 `BridgeWebViewClient` 상속본을 `bridge.setWebViewClient` 로 설치한다.
 *    WebView 에 새 클라이언트 인스턴스를 직접 대입하면 로컬 에셋 서버·SystemBars 콜백이 끊긴다(Pitfall 4).
 *  - 웹 → 네이티브 채널은 `window.GhTradeBridge.postMessage(json)` 하나(`GhTradeBridge` — WebMessageListener · 폴백 JS 인터페이스).
 *  - 뒤로가기(D-26)는 `onBackPressedDispatcher` 콜백 하나 — 옛 back 콜백 오버라이드는 Android 16 에서 불리지 않는다(Pitfall 5).
 *  - 당겨서 새로고침(D-04 · D-17)은 WebView 를 `SwipeRefreshLayout` 으로 감싸 웹 refresh 훅을 부르고 1초 뒤 스피너를 닫는다.
 *  - 테마(D-23)는 웹이 정본 — `applyTheme` 한 곳에서 시스템 바 아이콘 명암·배경·탭바·스피너를 바꾸고 저장한다.
 *    OS 다크모드(uiMode)는 보지 않는다. 창 상태바 색은 직접 칠하지 않는다(엣지투엣지 · SystemBars 와 충돌).
 *  - 방향(D-24): 폰 세로 · 태블릿(sw600dp) 전방향 — `R.bool.is_tablet` 으로 `onCreate` 에서 분기.
 *  - 오프라인(D-19): 메인 프레임 네트워크 오류에서만 로컬 폴백 `https://localhost/index.html` (`GhTradeWebViewClient`).
 *  - DecorView/루트/WebView 에 인셋 리스너를 걸지 않는다 — SystemBars 의 DecorView 리스너(CSS 안전영역 주입 · IME 패딩)를
 *    덮어쓴다(Pitfall 8). 인셋 리스너는 탭바 컨테이너에만 건다.
 *  - 하단 플로팅 탭바(21-12 · D-02 · D-27b — 21-21 라벨 없는 캡슐 60dp): 활성 판정 = `TabRoutes`(D-14) · 숨김 = 로그인/오프라인/오버레이/키보드(D-12) ·
 *    탭 = 웹 navigate 훅(D-06a — 클라 내비라 relay 소켓 유지). iOS `GHTradeBridgeViewController`(21-10)와 같은 동작.
 */
class MainActivity : BridgeActivity() {

    lateinit var tabBar: GhTradeTabBar
        private set

    /** 템플릿 CoordinatorLayout. 21-13 이 WebView 를 SwipeRefreshLayout 으로 감싸기 **전에** 잡아 둔다. */
    lateinit var rootLayout: ViewGroup
        private set

    /** 웹 테마(D-23 — 웹이 정본). 바꾸는 경로는 `applyTheme` 하나(시스템 바·배경·저장이 따로 놀지 않게). */
    // D-23a: 저장값 없는 기본과 같게, load() 가 곧 ThemeStore 값으로 덮는다.
    var currentTheme = "dark"
        private set

    /** 현재 앱 서버 문서의 정규화 경로(D-14). */
    var currentPath = "/"
        private set

    /** 현재 문서가 앱 서버(server.url 의 스킴+호스트) 밖 = 오프라인 로컬 페이지 등(D-12 ②). */
    var isOfflinePage = false
        private set

    /** 웹 `overlay {open, immediate?}` 신호(D-12 ③ · D-12a''). 새 문서의 `ready` 에서 false 로 되돌린다(T-21-18 고착 방지). */
    var overlayOpen = false
        private set

    /** 웹 `pull {blocked}` 신호 — 21-13 의 SwipeRefreshLayout 이 소비한다. */
    var pullBlocked = false
        private set

    /** WebView 를 감싼 당겨서 새로고침 레이아웃(D-04). 스피너 색은 `applyTheme` 이 정한다. */
    lateinit var swipeRefresh: SwipeRefreshLayout
        private set

    private var keyboardVisible = false
    private var hideRunnable: Runnable? = null

    /** D-12a: 키보드로 숨긴 탭바의 재표시 90ms 예약 — 그 사이 숨김이 다시 오면 취소된다(입력칸 이동 = 깜빡임 없음). */
    private var showRunnable: Runnable? = null

    /** D-12a: 지금 숨김이 키보드 사유 즉시 경로로 끝났다 — 재표시만 90ms 디바운스한다. */
    private var hiddenByKeyboard = false

    /**
     * D-12b: 전체 문서 로드 중 — 그 문서의 첫 `route`(하이드레이션 뒤) 또는 1.5초까지 탭바를 숨긴 채 기다린다.
     * 콜드 스타트 첫 문서도 대기로 시작한다(21-28 iOS 와 같음).
     */
    private var awaitingContent = true

    /** D-12b 1.5초 상한 — 첫 route 가 오지 않아도 반드시 풀린다(T-21-65 고착 방지). */
    private val awaitingTimeout = Runnable { endAwaitingContent("timeout") }
    private val mainHandler = Handler(Looper.getMainLooper())

    /** 대기 해제로 보일 때만 280ms 감속(다른 보임은 200ms 그대로). */
    private var revealingAfterLoad = false

    /** 마지막으로 시작한 탭바 애니메이션이 보임이다 — 보임 분기 멱등 판정(진행 중 보임 애니메이션을 갈아타지 않게). */
    private var shownTarget = false

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
        // 탭바가 rootLayout(템플릿 CoordinatorLayout)을 먼저 잡은 **뒤** WebView 를 감싼다 — 감싼 뒤엔 WebView 부모가 바뀐다.
        setupTabBar()
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
        // 탭바 폭(최대 560 · 화면 − 32)은 GhTradeTabBar.onMeasure 가 새 폭으로 다시 자른다(21-12). 스피너 위치만 다시 잡는다.
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
        if (::tabBar.isInitialized) tabBar.apply(p)
        ThemeStore.save(this, t)
    }

    // ── 오프라인 폴백 (D-19) ────────────────────────────────────────────────

    /**
     * 메인 프레임 네트워크 오류(`GhTradeWebViewClient`)에서만 불린다. 복귀 대상 판정은 폴백 페이지의 `safeTarget`
     * 허용 출처가 한다(T-21-06) — 여기서는 `URLEncoder` 로 인코딩만 한다(`+`·`&`·`#` 가 쿼리를 깨지 않게).
     * 호스트가 앱 서버가 아니므로 탭바·당김은 `onUrlChanged` 판정으로 꺼진다(D-12 ②).
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
            !isOfflinePage && currentPath != "/" && !TabRoutes.hidesTabBar(currentPath) -> {
                clearHistoryOnHome = true
                selectTab(TabId.HOME)
            }
            else -> finish()
        }
    }

    // ── 탭바 (D-02 · D-13 · D-27b) ─────────────────────────────────────────────

    private fun setupTabBar() {
        rootLayout = bridge.webView.parent as ViewGroup
        tabBar = GhTradeTabBar(this)
        val fade = tabBar.fadeView

        // 페이드 → 탭바 순서로 얹는다(탭바가 위, elevation 으로도 위). WebView 프레임은 건드리지 않는다(D-25 풀블리드).
        rootLayout.addView(fade, CoordinatorLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(86f)).apply {
            gravity = Gravity.BOTTOM
        })
        // 폭 = min(560, 화면 − 32): MATCH_PARENT + 좌우 16 에서 GhTradeTabBar.onMeasure 가 560 으로 자른다 · 가운데 정렬.
        rootLayout.addView(tabBar, CoordinatorLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(60f)).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            leftMargin = dp(16f)
            rightMargin = dp(16f)
            bottomMargin = dp(14f)
        })

        // 바닥 = 화면 끝에서 max(내비 인셋 − 14, 14)(D-27b 불변) — 웹 `--native-tabbar-offset` 과 같은 식(21-06).
        // Pitfall 8: 리스너는 탭바에만. SystemBars 가 DecorView 에서 다듬은 인셋(웹 CSS 주입값과 같은 값)이 여기로 내려온다.
        ViewCompat.setOnApplyWindowInsetsListener(tabBar) { v, insets ->
            val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            val lp = v.layoutParams as ViewGroup.MarginLayoutParams
            val margin = max(nav - dp(14f), dp(14f))
            if (lp.bottomMargin != margin) {
                lp.bottomMargin = margin
                v.requestLayout()
            }
            insets
        }
        ViewCompat.requestApplyInsets(tabBar)

        // D-12a' (G-21-R3-1): IME 애니메이션이 시작되는 순간(`onPrepare` — 레이아웃·첫 프레임 전) 키보드 사유로 즉시 숨긴다.
        // 전역 레이아웃 리스너만으로는 IME 인셋이 적용된 뒤에야 알게 돼 탭바가 키보드 위로 끌려 올라간 프레임이 보였다.
        // 콜백은 탭바에만 건다(Pitfall 8 — DecorView/루트/WebView 금지). 탭바는 자식이 없어 디스패치 모드는 영향이 없다.
        ViewCompat.setWindowInsetsAnimationCallback(tabBar, object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            override fun onPrepare(animation: WindowInsetsAnimationCompat) {
                if (animation.typeMask and WindowInsetsCompat.Type.ime() == 0) return
                // onPrepare 의 루트 창 인셋 = 애니메이션 전 상태 → IME 가 아직 안 보이면 올라오는 방향.
                val before = imeVisibleNow()
                Log.d(TAG, "ime anim prepare visibleBefore=$before duration=${animation.durationMillis}")
                if (!before) keyboardRising()
            }

            override fun onStart(
                animation: WindowInsetsAnimationCompat,
                bounds: WindowInsetsAnimationCompat.BoundsCompat,
            ): WindowInsetsAnimationCompat.BoundsCompat {
                // 보정: onPrepare 에서 방향을 못 읽었어도 끝 상태(= 지금 인셋)가 보임이면 첫 애니메이션 프레임 전에 숨긴다.
                if (animation.typeMask and WindowInsetsCompat.Type.ime() != 0 && !keyboardVisible && imeVisibleNow()) {
                    keyboardRising()
                }
                return bounds
            }

            override fun onProgress(
                insets: WindowInsetsCompat,
                runningAnimations: MutableList<WindowInsetsAnimationCompat>,
            ): WindowInsetsCompat = insets

            override fun onEnd(animation: WindowInsetsAnimationCompat) {
                if (animation.typeMask and WindowInsetsCompat.Type.ime() == 0) return
                // 내려가는 방향 · 취소된 올림은 끝에서 실제 가시성으로 맞춘다(재표시는 90ms 디바운스).
                val ime = imeVisibleNow()
                if (ime != keyboardVisible) {
                    keyboardVisible = ime
                    updateTabBarVisibility()
                }
            }
        })

        // 보정용(애니메이션 없이 IME 가 바뀌는 경우 — 하드웨어 키보드 전환 · 애니메이션 끔). 레이아웃 변화 때 루트 창 인셋을 읽기만 한다(Pitfall 8).
        rootLayout.viewTreeObserver.addOnGlobalLayoutListener {
            val ime = ViewCompat.getRootWindowInsets(rootLayout)?.isVisible(WindowInsetsCompat.Type.ime()) == true
            if (ime != keyboardVisible) {
                keyboardVisible = ime
                updateTabBarVisibility()
            }
        }

        tabBar.apply(GhTradePalette.of(currentTheme))
        tabBar.onSelect = { selectTab(it) }
        // 첫 앱 서버 URL 이 판정될 때까지 숨긴 채 시작한다(로그인 리다이렉트 전에 잠깐 보였다 사라지는 깜빡임 방지).
        tabBar.visibility = View.GONE
        tabBar.alpha = 0f
        fade.visibility = View.GONE
        fade.alpha = 0f
        // D-12b: 콜드 스타트 대기의 1.5초 상한을 여기서도 예약한다 — 첫 로드의 onPageStarted 가 클라이언트 설치 전에 지나가도 고착 없음.
        onDocumentStart()
    }

    private fun imeVisibleNow(): Boolean =
        ViewCompat.getRootWindowInsets(rootLayout)?.isVisible(WindowInsetsCompat.Type.ime()) == true

    private fun keyboardRising() {
        if (keyboardVisible) return
        keyboardVisible = true
        updateTabBarVisibility()
    }

    // ── 문서 로드 대기 (D-12b · G-21-R3-4) ──────────────────────────────────────

    /** 전체 문서 로드 시작(`GhTradeWebViewClient.onPageStarted`). SPA pushState 이동은 여기로 오지 않는다. */
    fun onDocumentStart() {
        Log.d(TAG, "document load started")
        awaitingContent = true
        mainHandler.removeCallbacks(awaitingTimeout)
        mainHandler.postDelayed(awaitingTimeout, 1500L)
        updateTabBarVisibility()
    }

    /** 첫 `route`(reason=route) 또는 1.5초 상한(reason=timeout)에서 대기를 푼다 — 보이게 되면 280ms 감속. */
    private fun endAwaitingContent(reason: String = "route") {
        if (!awaitingContent) return
        awaitingContent = false
        mainHandler.removeCallbacks(awaitingTimeout)
        Log.i(TAG, "document load wait ended reason=$reason")
        revealingAfterLoad = true
        updateTabBarVisibility()
        revealingAfterLoad = false
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
                // 뒤로가기 ③ 으로 온 홈 — 이전 항목을 지워 다음 뒤로가기가 종료가 되게 한다(홈↔하위 경로 왕복 루프 방지).
                clearHistoryOnHome = false
                bridge.webView?.clearHistory()
            }
        } else {
            tabBar.setActive(null)
            updateTabBarVisibility()
        }
    }

    private fun applyPath(path: String) {
        currentPath = TabRoutes.normalize(path)
        tabBar.setActive(TabRoutes.activeTabFor(currentPath))
        updateTabBarVisibility()
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
                if (overlayOpen) {
                    overlayOpen = false
                    updateTabBarVisibility()
                }
            }
            // SPA pushState 보강(D-14). 문자열 · `/` 시작만 받는다.
            "route" -> {
                val path = payload?.optString("path").orEmpty()
                Log.d(TAG, "route path=$path awaiting=$awaitingContent")
                if (path.startsWith("/") && !isOfflinePage) {
                    // D-12b: 이 문서의 첫 route = 하이드레이션 끝 → 대기 해제(경로 반영 전 — 보임이면 280ms 감속).
                    endAwaitingContent()
                    applyPath(path)
                }
            }
            "overlay" -> {
                overlayOpen = payload?.optBoolean("open") == true
                // D-12a'': 키패드(키보드 대체) 열림만 즉시 — 필드가 없으면 종전 D-12.
                val immediate = overlayOpen && payload?.optBoolean("immediate") == true
                Log.d(TAG, "overlay open=$overlayOpen immediate=$immediate")
                updateTabBarVisibility(immediate = immediate)
            }
            "pull" -> pullBlocked = payload?.optBoolean("blocked") == true
            // "dark"/"light" 두 값만 받는다(D-23).
            "theme" -> {
                val t = payload?.optString("theme")
                if (t == "dark" || t == "light") applyTheme(t)
            }
            else -> Log.d(TAG, "message type=$type")
        }
    }

    // ── 표시/숨김 ─────────────────────────────────────────────────────────────
    // D-12: 숨김은 150ms 지연 후 200ms 페이드(8dp 하강) · 보임은 지연 없이 200ms.
    // D-12a': 키보드 사유 숨김 = 지연·애니메이션 없이 즉시 GONE · 이동 없음 · 재표시 90ms 디바운스.
    // D-12a'': 키패드 시트 열림(overlay immediate)도 즉시 GONE · 재표시는 D-12.
    // D-12b: 문서 로드 대기 해제로 보일 때만 280ms 감속.
    // ViewPropertyAnimator 의 곡선은 다음 animate() 에도 남는다 → 모든 animate() 에 곡선을 명시한다.

    private fun shouldHideTabBar(): Boolean =
        TabRoutes.hidesTabBar(currentPath) || isOfflinePage || overlayOpen || keyboardVisible || awaitingContent

    fun updateTabBarVisibility(immediate: Boolean = false) {
        if (!::tabBar.isInitialized) return
        val fade = tabBar.fadeView
        hideRunnable?.let { tabBar.removeCallbacks(it) }
        hideRunnable = null

        if (shouldHideTabBar()) {
            // 숨김이 다시 왔다 — 키보드 재표시 예약은 취소(IME 내림 → 곧바로 다시 올림 = 깜빡임 없음).
            showRunnable?.let { tabBar.removeCallbacks(it) }
            showRunnable = null
            // 키보드가 내려갔는데 다른 사유로 여전히 숨김 → 이후 재표시는 키보드 디바운스 대상이 아니다.
            if (!keyboardVisible) hiddenByKeyboard = false
            if (tabBar.visibility != View.VISIBLE) return

            // D-12a' — 150ms 대기도 페이드도 없이 곧바로 숨긴다(이동 없음 — 키보드 윗변 위로 끌려 올라간 프레임이 남지 않게).
            // D-12a'': 키패드 시트 열림(웹 immediate)도 같은 경로.
            if (keyboardVisible || immediate) {
                shownTarget = false
                // 진행 중인 보임·숨김 애니메이터를 멈춘다(취소된 애니메이터의 withEndAction 은 실행되지 않는다).
                tabBar.animate().cancel()
                fade.animate().cancel()
                tabBar.translationY = 0f
                tabBar.alpha = 0f
                fade.alpha = 0f
                tabBar.visibility = View.GONE
                fade.visibility = View.GONE
                // 재표시 90ms 디바운스는 키보드 사유만 — 키패드 닫힘은 D-12 보임(200ms)으로 곧바로 돌아온다.
                if (keyboardVisible) hiddenByKeyboard = true
                return
            }

            // 리다이렉트·짧은 오버레이 깜빡임은 150ms 안에 취소된다(weekly-wine 방식).
            val r = Runnable {
                hideRunnable = null
                if (!shouldHideTabBar()) return@Runnable
                shownTarget = false
                fade.animate().alpha(0f).setDuration(200).setInterpolator(STANDARD).start()
                tabBar.animate().alpha(0f).translationY(dpF(8f)).setDuration(200).setInterpolator(STANDARD).withEndAction {
                    // 페이드 도중 다시 보이기로 바뀌었으면 숨기지 않는다(보임 쪽이 animate().cancel() 후 되살린다).
                    if (shouldHideTabBar()) {
                        tabBar.visibility = View.GONE
                        fade.visibility = View.GONE
                    }
                }.start()
            }
            hideRunnable = r
            tabBar.postDelayed(r, 150)
        } else {
            // D-12a — 키보드로 숨겼던 탭바는 90ms 뒤에 다시 보인다(그 사이 숨김 분기가 오면 예약 취소).
            if (hiddenByKeyboard) {
                if (showRunnable != null) return
                val r = Runnable {
                    showRunnable = null
                    hiddenByKeyboard = false
                    updateTabBarVisibility()
                }
                showRunnable = r
                tabBar.postDelayed(r, 90)
                return
            }
            showRunnable?.let { tabBar.removeCallbacks(it) }
            showRunnable = null
            // 이미 보이는 중(보임 애니메이션 진행 포함)이면 건드리지 않는다 — 대기 해제(280ms) 직후 applyPath 의 같은 보임 호출이
            // 진행 중 감속 애니메이션을 200ms 로 갈아타지 않게(21-28 iOS 와 같은 가드).
            if (shownTarget && tabBar.visibility == View.VISIBLE) return
            shownTarget = true
            // 진행 중인 숨김 애니메이션과 경합하지 않게 먼저 걷어낸다(weekly-wine onUrlChanged).
            tabBar.animate().cancel()
            fade.animate().cancel()
            tabBar.visibility = View.VISIBLE
            fade.visibility = View.VISIBLE
            val (ms, curve) = if (revealingAfterLoad) 280L to REVEAL else 200L to STANDARD
            tabBar.animate().alpha(1f).translationY(0f).setDuration(ms).setInterpolator(curve).start()
            fade.animate().alpha(1f).setDuration(ms).setInterpolator(curve).start()
        }
    }

    // ── 탭 이동 (D-06 · D-06a) ──────────────────────────────────────────────

    fun selectTab(tab: TabId) {
        // 반응성 — 이동 결과는 onUrlChanged · route 메시지가 다시 확정한다.
        tabBar.setActive(tab)
        val wv = bridge.webView ?: return

        if (isOfflinePage) {
            // 오프라인 폴백 문서에는 웹 훅이 없다 → 앱 서버 경로를 직접 로드한다.
            val server = bridge.config.serverUrl ?: return
            wv.loadUrl(server.trimEnd('/') + tab.path)
            return
        }

        // T-21-36: 스크립트에 들어가는 값은 TabId.path 상수뿐 — 외부 입력 없음.
        val p = tab.path
        wv.evaluateJavascript(
            "window.__ghTrade&&window.__ghTrade.navigate?window.__ghTrade.navigate('$p'):location.assign('$p')",
            null,
        )
    }

    private fun dpF(v: Float): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

    private fun dp(v: Float): Int = dpF(v).toInt()

    companion object {
        const val TAG = "GHTrade"

        /** 기본 페이드 곡선(ViewPropertyAnimator 기본값과 같음) · D-12b 대기 해제 감속. */
        private val STANDARD: Interpolator = AccelerateDecelerateInterpolator()
        private val REVEAL: Interpolator = DecelerateInterpolator()

        /** Capacitor 로컬 에셋 서버의 오프라인 폴백(`mobile/www/index.html`). */
        private const val OFFLINE_PAGE = "https://localhost/"
    }
}
