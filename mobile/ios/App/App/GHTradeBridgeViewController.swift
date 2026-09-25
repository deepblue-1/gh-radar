import UIKit
import WebKit
import Capacitor
import os

/// GH Trade 루트 VC (Phase 21).
///
/// `SceneDelegate` 가 코드로 루트에 세운다(Pitfall 1·3 — storyboard `customClass` 는 보조일 뿐).
/// `loadView()` 가 `view = webView` 이므로 이 VC 의 루트 뷰가 곧 WKWebView 다 — 풀블리드(D-25)라
/// weekly-wine 의 `viewDidLayoutSubviews` 프레임 조작·쿠키 저장/복원은 가져오지 않는다.
///
/// 웹 → 네이티브 채널은 `ghTrade` 하나다. 본문은 JSON 문자열 `{"type": …, "payload": …}`.
/// 웹 쪽 송신부: `webapp/src/lib/native/native-detect.ts` (ready) · 21-04 `post-native.ts`.
final class GHTradeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    private let log = Logger(subsystem: "com.ghtrade.app", category: "bridge")

    /// 웹이 보낼 수 있는 메시지 타입 화이트리스트(V5). 모르는 타입은 무시한다.
    enum NativeMessageType: String {
        case ready, route, theme, overlay, pull
    }

    static let messageHandlerName = "ghTrade"

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let wv = webView else { return }
        // userContentController 는 핸들러를 강하게 잡는다 → 약한 참조 래퍼로 순환을 끊는다.
        wv.configuration.userContentController.add(WeakScriptMessageHandler(self), name: "ghTrade")
    }

    // MARK: - JS → Native

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // T-21-02: 메인 프레임 · 문자열 JSON · 화이트리스트 타입 · 앱 서버 호스트에서 온 것만 처리한다.
        guard message.name == Self.messageHandlerName,
              message.frameInfo.isMainFrame,
              let body = message.body as? String,
              let data = body.data(using: .utf8),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let rawType = obj["type"] as? String,
              let type = NativeMessageType(rawValue: rawType)
        else { return }

        let senderHost = message.frameInfo.request.url?.host
        let appHost = bridge?.config.serverURL.host
        guard let senderHost, let appHost, senderHost == appHost else {
            log.debug("ignored \(rawType, privacy: .public) from foreign host")
            return
        }

        switch type {
        case .ready:
            let payload = obj["payload"] as? [String: Any]
            let p = (payload?["platform"] as? String) ?? "unknown"
            let flag = (payload?["nativeApp"] as? Bool) ?? false
            log.notice("ready platform=\(p, privacy: .public) nativeApp=\(flag, privacy: .public)")
        case .route, .theme, .overlay, .pull:
            // 21-10 · 21-11 이 채운다.
            log.debug("message \(rawType, privacy: .public)")
        }
    }
}

/// `WKUserContentController` → 핸들러 강한 참조 순환 차단용 약한 참조 래퍼.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
