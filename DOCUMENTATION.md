# Technical Documentation: P2P Video, Audio & Screen Sharing Web Application

## Overview
This application enables direct peer-to-peer (P2P) real-time audio calls, video calls, and screen sharing between devices (such as laptops and Android smartphones) without requiring custom backend media server deployment. It includes both a Web client and a native Android application wrapper (`call-qt`).

---

## 1. Technologies Used, Usage & Rationale

| Technology / Component | What it is Used For | Why it was Chosen |
| :--- | :--- | :--- |
| **HTML5 (`index.html`)** | Provides the structure of the application (Lobby screen, Video grid layout, Controls bar, QR modal, and Battery restriction warning banner). | Standard, universal web structure readable by any browser on desktop or mobile without requiring plugins. |
| **CSS3 (`style.css`)** | Handles visual layout, dark-mode styling, responsive mobile design, glassmorphism overlays, and video frame positioning. | Ensures responsive rendering on smartphones and desktop monitors with fluid video containers and touch-friendly controls. |
| **Vanilla JavaScript (`app.js`)** | Manages application logic, media streams, peer connections, UI switching, device camera flipping, battery optimization checks, and event handling. | Zero build tools required. Can be shared directly as static files without transpilation (Babel/Webpack/Vite). |
| **WebRTC (Web Real-Time Communication)** | Native browser API for peer-to-peer audio, video, and data streaming between browsers. | Sub-second latency, end-to-end media encryption, direct P2P transport (data flows directly between peers without passing through a media server). |
| **PeerJS Library (`lib/peerjs.min.js`)** | Wraps browser WebRTC APIs (`RTCPeerConnection`, `RTCDataChannel`) and handles signaling over public cloud servers. | Abstracts complex SDP (Session Description Protocol) offer/answer exchanges and ICE candidate handling into a simple event-driven JavaScript API. |
| **Public STUN Servers (`stun.l.google.com:19302`)** | Assists peers in discovering their public IP address and port behind NATs (Network Address Translation). | Enables P2P connections across different home networks, mobile LTE/5G data, and Wi-Fi networks without paid infrastructure. |
| **MediaStreams API (`getUserMedia`)** | Captures camera feed and microphone audio from the user's hardware. | Standard browser API for real-time video/audio access across modern Android, iOS, Windows, and macOS browsers. |
| **Screen Capture API (`getDisplayMedia`)** | Captures monitor, browser tab, or application window with audio (`{ video: true, audio: true }`) for screen sharing. | Enables full desktop/tab sharing in real-time. Dynamically replaces video and audio tracks in active WebRTC peer connection. |
| **QRCode.js (`lib/qrcode.min.js`)** | Generates dynamic QR codes in the browser for peer ID and connection link sharing. | Allows rapid connection pairing by scanning a QR code with a smartphone camera without manual typing. |
| **Android WebView & `WebViewAssetLoader`** | Hosts and renders the web app locally inside the native Android APK wrapper (`MainActivity.java`). | Serves bundled web files from `https://appassets.androidplatform.net/assets/index.html`, providing a secure HTTPS origin for WebRTC and camera permissions offline. |
| **Android `MediaProjection` & Foreground Service** | Native Android screen capture service (`ScreenCaptureService.java`). | Bypasses WebView mobile browser screen capture blocks by capturing screen frames via native `VirtualDisplay` and streaming to WebRTC canvas. |

---

## 2. File & Architecture Breakdown

```
/workspace/call-qt/
├── index.html        # Main HTML layout (Lobby, Video Viewport, Control Bar, Battery Warning Banner, Modal)
├── style.css         # Modern responsive dark-theme CSS layout
├── app.js            # Core WebRTC connection, native Android JS bridge, media & battery management script
├── DOCUMENTATION.md  # Comprehensive technical architecture document (this file)
├── README.md         # User guide for running, building, and sharing the application
├── lib/
│   ├── peerjs.min.js # Standalone PeerJS WebRTC wrapper library
│   └── qrcode.min.js # Standalone QR Code generation library
└── android/          # Native Android application module
    ├── app/build.gradle # Android app Gradle build configuration & copyWebAssets task
    └── app/src/main/java/com/callqt/app/
        ├── MainActivity.java        # WebView host with JavascriptInterface & MediaProjection bridge
        └── ScreenCaptureService.java # Foreground service (type: mediaProjection) for background screen capture
```

### File Purposes

1. **`index.html`**:
   - Contains a **Lobby Screen** for peer ID creation, connection input, QR code display, and an Android **Battery Restriction Warning Banner**.
   - Contains a **Call Screen** with a primary remote video element and a floating picture-in-picture local video element.
   - Contains a **Controls Bar** with mute/unmute mic, toggle camera, flip camera (mobile), share screen, room info, and hangup buttons.
   - Loads standalone scripts from `lib/` to allow completely self-contained file distribution.

2. **`style.css`**:
   - Uses CSS custom variables for consistent dark mode themes.
   - Provides responsive breakpoints (`@media (max-width: 640px)`) ensuring smooth UX on mobile phones.
   - Mirrored local video display (`transform: scaleX(-1)`) matching natural user camera expectations.

3. **`app.js`**:
   - Initializes a PeerJS node with a random 6-character short ID upon page load.
   - Handles incoming calls (`peer.on('call')`) and outgoing calls (`peer.call()`).
   - Detects `window.AndroidNative` bridge interface when running inside the native Android APK wrapper.
   - Dynamically manages track substitution using `RTCRtpSender.replaceTrack()` when toggling between video camera feed and screen capture.
   - Transmits both video and system audio when screen sharing (`getDisplayMedia({ video: true, audio: true })`).
   - Checks battery optimization status (`isBatteryOptimizationIgnored`) and binds UI actions to prompt users to disable battery restrictions.

4. **`android/app/src/main/java/com/callqt/app/MainActivity.java`**:
   - Configures `WebView` settings (JavaScript enabled, DOM storage, media playback gesture bypass).
   - Serves local web assets securely using `WebViewAssetLoader` over `https://appassets.androidplatform.net/`.
   - Prompts for runtime Android permissions and auto-grants WebRTC permission requests in `WebChromeClient.onPermissionRequest`.
   - Provides `@JavascriptInterface` (`AndroidNative`) methods to interact with native Android APIs (`startScreenShare`, `stopScreenShare`, `isBatteryOptimizationIgnored`, `openBatteryOptimizationSettings`).

5. **`android/app/src/main/java/com/callqt/app/ScreenCaptureService.java`**:
   - Implements a Android Foreground Service (`foregroundServiceType="mediaProjection"`) required by Android 10+ and Android 14+ for screen recording.

---

## 3. How Native Web Files (HTML, JS, CSS) Are Utilized in Android

Rather than hosting the web application on an external web server or loading raw `file://` URLs (which break WebRTC camera/microphone access on mobile devices), the Android application bundles the web assets directly into the APK and serves them through an internal secure origin:

### 1. Automated Assets Syncing during Gradle Build
The Gradle build configuration (`android/app/build.gradle`) defines a `copyWebAssets` build task:
```groovy
task copyWebAssets(type: Copy) {
    from "${project.rootDir}/.."
    into 'src/main/assets'
    include 'index.html', 'style.css', 'app.js', 'lib/**'
}

preBuild.dependsOn copyWebAssets
```
Whenever `gradle assembleDebug` or `./gradlew assembleDebug` is executed, Gradle copies `index.html`, `style.css`, `app.js`, and the `lib/` directory directly into `android/app/src/main/assets/`.

### 2. Secure HTTPS Origin via `WebViewAssetLoader`
Inside `MainActivity.java`, Android's `WebViewAssetLoader` intercepts requests to `/assets/`:
```java
final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();

webView.setWebViewClient(new WebViewClient() {
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return assetLoader.shouldInterceptRequest(request.getUrl());
    }
});

webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
```
This serves the local HTML, JS, and CSS files under `https://appassets.androidplatform.net/assets/index.html`. Android Chromium treats `appassets.androidplatform.net` as a secure HTTPS origin (`window.isSecureContext === true`), enabling full WebRTC media APIs (`getUserMedia`) without network dependencies.

### 3. Bidirectional JavaScript-to-Java Native Bridge (`AndroidNative`)
To allow the web application (`app.js`) to invoke native Android OS features, `MainActivity.java` registers a Java interface:
```java
webView.addJavascriptInterface(new WebAppInterface(), "AndroidNative");
```
This exposes methods to JavaScript under `window.AndroidNative`:
- `window.AndroidNative.isNativeAndroid()`: Returns `true` when running inside the Android APK.
- `window.AndroidNative.startScreenShare()`: Triggers native Android system `MediaProjection` screen recording dialog.
- `window.AndroidNative.stopScreenShare()`: Releases native VirtualDisplay and stops foreground capture service.
- `window.AndroidNative.isBatteryOptimizationIgnored()`: Checks if Android battery optimization is set to Unrestricted for the app.
- `window.AndroidNative.openBatteryOptimizationSettings()`: Opens Android Settings directly to allow users to turn off battery restrictions.

---

## 4. Native Screen Sharing & System Audio Capture

### 1. Native Android Screen Recording Bridge
When screen sharing is started inside the Android APK:
1. `app.js` calls `window.AndroidNative.startScreenShare()`.
2. `MainActivity.java` launches a `ScreenCaptureService` foreground service (`FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION`).
3. Android prompts the system screen capture dialog (`createScreenCaptureIntent`).
4. Upon user approval, a `VirtualDisplay` captures screen frames into an `ImageReader`.
5. Captured frames are encoded as Base64 JPEG data URLs and passed to `window.onNativeScreenFrame(dataUrl)` in `app.js`.
6. `app.js` draws the incoming frames onto a hidden HTML5 canvas and calls `canvas.captureStream(15)`, dynamically swapping the WebRTC video track via `RTCRtpSender.replaceTrack()`.

### 2. Desktop & Browser System Audio Sharing
When running in desktop browsers:
- `app.js` calls `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`.
- When the user selects a tab or application window with audio, both the screen video track and system audio track (`screenAudioTrack`) are captured and routed over WebRTC (`audioSender.replaceTrack(screenAudioTrack)`), allowing remote peers to hear audio playing from videos or applications on the shared screen.

---

## 5. Android Battery Optimization Management

Android OS battery optimization (Doze mode) can suspend background threads and foreground services like `MediaProjection`.

- **Permission**: The app requests `<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />` in `AndroidManifest.xml`.
- **User Prompt**: If battery optimizations are enabled, a banner is displayed in `index.html`. Clicking **🔋 Set Battery to Unrestricted** invokes `window.AndroidNative.openBatteryOptimizationSettings()`, bringing up Android's battery configuration screen for Call QT.

---

## 6. Build Instructions & Output APK

### Build Command:
```bash
cd android
gradle assembleDebug
```

### Output APK Path:
- `android/app/build/outputs/apk/debug/app-debug.apk`


