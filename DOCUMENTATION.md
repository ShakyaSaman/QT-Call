# Technical Documentation: P2P Video, Audio & Screen Sharing Web Application

## Overview
This web application enables direct peer-to-peer (P2P) real-time audio calls, video calls, and screen sharing between two devices (such as a laptop and a mobile smartphone) without requiring custom backend server deployment.

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

---

## 2. File & Architecture Breakdown

```
/workspace/call-qt/
├── index.html        # Main HTML layout (Lobby, Video Viewport, Control Bar, Modal)
├── style.css         # Modern responsive dark-theme CSS layout
├── app.js            # Core WebRTC connection & media management script
├── DOCUMENTATION.md  # Comprehensive technical architecture document (this file)
├── README.md         # User guide for running and sharing the application
└── lib/
    ├── peerjs.min.js # Standalone PeerJS WebRTC wrapper library
    └── qrcode.min.js # Standalone QR Code generation library
```

### File Purposes

1. **`index.html`**:
   - Contains a **Lobby Screen** for peer ID creation, connection input, and QR code display.
   - Contains a **Call Screen** with a primary remote video element and a floating picture-in-picture local video element.
   - Contains a **Controls Bar** with mute/unmute mic, toggle camera, flip camera (mobile), share screen, room info, and hangup buttons.
   - Loads standalone scripts from `lib/` to allow completely self-contained file distribution.

2. **`style.css`**:
   - Uses CSS CSS custom variables for consistent dark mode themes.
   - Provides responsive breakpoints (`@media (max-width: 640px)`) ensuring smooth UX on mobile phones.
   - Mirrored local video display (`transform: scaleX(-1)`) matching natural user camera expectations.

3. **`app.js`**:
   - Initializes a PeerJS node with a random 6-character short ID upon page load.
   - Handles incoming calls (`peer.on('call')`) and outgoing calls (`peer.call()`).
   - Dynamically manages track substitution using `RTCRtpSender.replaceTrack()` when toggling between video camera feed and screen capture (`getDisplayMedia`).
   - Implements mobile front/rear camera toggling (`facingMode: 'user'` vs `'environment'`).

---

## 3. How Non-Hosted P2P Signaling Works

When files are not hosted on a dedicated server:
1. **Peer 1** opens `index.html`. PeerJS contacts the free public PeerJS cloud broker (`0.peerjs.com`) via WebSockets to obtain a temporary unique **Peer ID**.
2. **Peer 2** opens `index.html` on their phone or PC and receives their own **Peer ID**.
3. **Signaling Exchange**: Peer 2 enters Peer 1's ID (or scans the QR code). The public signaling server routes the SDP offer/answer packets.
4. **Direct Media Flow**: Once signaling is complete, the video/audio streams are routed directly peer-to-peer between Peer 1 and Peer 2 using WebRTC encrypted SRTP channels.

---

## 4. Mobile Browser & Camera Permission Considerations

> [!IMPORTANT]
> **Mobile Camera/Mic Permissions Security Requirement:**
> Modern mobile browsers (iOS Safari, Android Chrome) enforce strict security policies for media access (`getUserMedia`):
> - `file://` protocol or HTTP over non-localhost may block camera/mic access on mobile devices.
> - **Recommended Usage for Mobile:**
>   1. Open the folder via a local server (e.g. `npx serve`, Python `python3 -m http.server 8080`, VS Code Live Server).
>   2. Or host the static files on free static hosts like GitHub Pages, Cloudflare Pages, Netlify, or Vercel.
>   3. Alternatively, for local network testing, serve over local IP with HTTPS or test via Chrome desktop.
