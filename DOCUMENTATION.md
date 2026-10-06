# Technical Documentation: P2P Video, Audio & Screen Sharing Web Application

## Overview
This application enables direct peer-to-peer (P2P) real-time audio calls, video calls, and screen sharing between devices (such as laptops and Android smartphones) without requiring custom backend media server deployment. It includes both a Web client and a native Android application wrapper.

---

## 1. Technologies Used, Usage & Rationale

| Technology / Component | What it is Used For | Why it was Chosen |
| :--- | :--- | :--- |
| **HTML5 (`index.html`)** | Provides the structure of the application (Lobby screen, Video grid layout, Controls bar, and QR code modal). | Standard, universal web structure readable by any browser on desktop or mobile without requiring plugins. |
| **CSS3 (`style.css`)** | Handles visual layout, dark-mode styling, responsive mobile design, glassmorphism overlays, and video frame positioning. | Ensures responsive rendering on smartphones and desktop monitors with fluid video containers and touch-friendly controls. |
| **Vanilla JavaScript (`app.js`)** | Manages application logic, media streams, peer connections, UI switching, device camera flipping, and event handling. | Zero build tools required. Can be shared directly as static files without transpilation (Babel/Webpack/Vite). |
| **WebRTC (Web Real-Time Communication)** | Native browser API for peer-to-peer audio, video, and data streaming between browsers. | Sub-second latency, end-to-end media encryption, direct P2P transport (data flows directly between peers without passing through a media server). |
| **PeerJS Library (`lib/peerjs.min.js`)** | Wraps browser WebRTC APIs (`RTCPeerConnection`, `RTCDataChannel`) and handles signaling over public cloud servers. | Abstracts complex SDP (Session Description Protocol) offer/answer exchanges and ICE candidate handling into a simple event-driven JavaScript API. |
| **Public STUN Servers (`stun.l.google.com:19302`)** | Assists peers in discovering their public IP address and port behind NATs (Network Address Translation). | Enables P2P connections across different home networks, mobile LTE/5G data, and Wi-Fi networks without paid infrastructure. |
| **MediaStreams API (`getUserMedia`)** | Captures camera feed and microphone audio from the user's hardware. | Standard browser API for real-time video/audio access across modern Android, iOS, Windows, and macOS browsers. |
| **Screen Capture API (`getDisplayMedia`)** | Captures monitor, browser tab, or application window for screen sharing. | Enables full desktop/tab sharing in real-time. Dynamically replaces camera stream in active WebRTC peer connection. |
| **QRCode.js (`lib/qrcode.min.js`)** | Generates dynamic QR codes in the browser for peer ID and connection link sharing. | Allows rapid connection pairing by scanning a QR code with a smartphone camera without manual typing. |
| **Android WebView & `WebViewAssetLoader`** | Hosts and renders the web app locally inside the native Android APK wrapper (`MainActivity.java`). | Serves bundled web files from `https://appassets.androidplatform.net/assets/index.html`, providing a secure HTTPS origin for WebRTC and camera permissions offline. |

---

## 2. File & Architecture Breakdown

```
/workspace/call-qt/
├── index.html        # Main HTML layout (Lobby, Video Viewport, Control Bar, Modal)
├── style.css         # Modern responsive dark-theme CSS layout
├── app.js            # Core WebRTC connection & media management script
├── DOCUMENTATION.md  # Comprehensive technical architecture document (this file)
├── README.md         # User guide for running, building, and sharing the application
├── lib/
│   ├── peerjs.min.js # Standalone PeerJS WebRTC wrapper library
│   └── qrcode.min.js # Standalone QR Code generation library
└── android/          # Native Android application module
    ├── app/build.gradle # Android app Gradle build configuration & copyWebAssets task
    └── app/src/main/java/com/callqt/app/MainActivity.java # WebView host with WebRTC permission handling
```

### File Purposes

1. **`index.html`**:
   - Contains a **Lobby Screen** for peer ID creation, connection input, and QR code display.
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
   - Dynamically manages track substitution using `RTCRtpSender.replaceTrack()` when toggling between video camera feed and screen capture (`getDisplayMedia`).
   - Implements mobile front/rear camera toggling (`facingMode: 'user'` vs `'environment'`).

4. **`android/app/src/main/java/com/callqt/app/MainActivity.java`**:
   - Configures `WebView` settings (JavaScript enabled, DOM storage, media playback gesture bypass).
   - Serves local web assets securely using `WebViewAssetLoader`.
   - Prompts for runtime Android camera/microphone permissions and auto-grants WebRTC permission requests in `WebChromeClient.onPermissionRequest`.

---

## 3. How Non-Hosted P2P Signaling Works

When files are not hosted on a dedicated server:
1. **Peer 1** opens `index.html` (or the Android app). PeerJS contacts the free public PeerJS cloud broker (`0.peerjs.com`) via WebSockets to obtain a temporary unique **Peer ID**.
2. **Peer 2** opens `index.html` (or the Android app) on their phone or PC and receives their own **Peer ID**.
3. **Signaling Exchange**: Peer 2 enters Peer 1's ID (or scans the QR code). The public signaling server routes the SDP offer/answer packets.
4. **Direct Media Flow**: Once signaling is complete, the video/audio streams are routed directly peer-to-peer between Peer 1 and Peer 2 using WebRTC encrypted SRTP channels.

---

## 4. Native Android Application & WebView Integration

### Automated Assets Syncing
The Gradle build file (`android/app/build.gradle`) defines a `copyWebAssets` task:
```groovy
task copyWebAssets(type: Copy) {
    from "${project.rootDir}/.."
    into 'src/main/assets'
    include 'index.html', 'style.css', 'app.js', 'lib/**'
}

preBuild.dependsOn copyWebAssets
```
This guarantees that whenever `./gradlew assembleDebug` or `gradle assembleDebug` is run, the latest web files are automatically bundled directly into the APK assets.

### Output APK Path
When built with `gradle assembleDebug` (or `./gradlew assembleDebug`), the compiled debug APK is created at:
- `android/app/build/outputs/apk/debug/app-debug.apk`

### Secure Local Asset Origin
Using `WebViewAssetLoader`, assets are served under `https://appassets.androidplatform.net/assets/index.html`. This ensures that modern browser APIs like WebRTC (`getUserMedia`) treat the web view as a secure context (`https://`) rather than restricting access under raw `file://` URLs.

---

## 5. Mobile Browser & Camera Permission Considerations

> [!IMPORTANT]
> **Mobile Camera/Mic Permissions Security Requirement:**
> Modern mobile web browsers enforce strict security policies for media access (`getUserMedia`):
> - `file://` protocol or HTTP over non-localhost may block camera/mic access on mobile web browsers.
> - **Native Android App (APK):** Solves this restriction completely by serving assets over `https://appassets.androidplatform.net/` via `WebViewAssetLoader` and handling Android system permission prompts natively.
> - **Web Browsers:** Host the static files on free static hosts like GitHub Pages, Cloudflare Pages, Netlify, or Vercel, or serve via a local network server (`python3 -m http.server 8080`).

