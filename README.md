# P2P Video, Audio & Screen Share Web App

A lightweight, serverless real-time web application for connecting two devices via video, audio, and screen sharing.

---

## 🚀 Quick Start Guide

### Step 1: Open the App
1. Open `index.html` in your web browser (Google Chrome, Firefox, Safari, or Microsoft Edge).
2. The app will automatically generate your unique **Peer ID** (e.g. `a1b2c3`).

### Step 2: Share with Another Person / Mobile Phone
- **Option A (Share ID):** Copy your ID using the **📋 Copy** button and send it to your peer.
- **Option B (QR Code / Link):** Click **📱 Share QR Code / Link**, and scan the QR code using your smartphone camera or copy the share link.

### Step 3: Connect
1. The second person pastes your Peer ID into the **Remote Peer ID** input box.
2. Click **Connect Call**.
3. Accept camera and microphone permissions when prompted by the browser.

---

## 💻 Features

- **📹 Video Call:** HD video streaming with auto-camera mirror.
- **🎙️ Audio Call:** Real-time audio streaming with mute/unmute control.
- **💻 Screen Sharing:** Share your screen or individual windows during a call.
- **🔄 Mobile Camera Switch:** Flip between front and rear cameras on smartphone browsers.
- **📱 QR Code Pairing:** Instantly scan QR code on mobile phones to join calls.
- **🔒 Encrypted P2P:** Streams run directly peer-to-peer over WebRTC.

---

## 📁 File Structure

- `index.html`: Web page layout & UI screens.
- `style.css`: Responsive layout & dark theme stylesheet.
- `app.js`: WebRTC logic, stream handling, and controls.
- `lib/peerjs.min.js`: Local PeerJS library.
- `lib/qrcode.min.js`: Local QR Code generation library.
- `DOCUMENTATION.md`: Full technical description of technologies used, rationale, and architecture.

---

## ℹ️ Mobile Browser Notes
For mobile devices (iOS Safari / Android Chrome) to access camera and microphone permissions, open the file using a simple static web server (such as Python `python3 -m http.server 8000`, VS Code Live Server, or GitHub Pages).
