/**
 * P2P WebRTC Video, Audio, and Screen Sharing Application
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const lobbyScreen = document.getElementById('lobbyScreen');
    const callScreen = document.getElementById('callScreen');
    
    const myPeerIdInput = document.getElementById('myPeerId');
    const remotePeerIdInput = document.getElementById('remotePeerId');
    const copyIdBtn = document.getElementById('copyIdBtn');
    const connectBtn = document.getElementById('connectBtn');
    const showQrBtn = document.getElementById('showQrBtn');
    
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const localPlaceholder = document.getElementById('localPlaceholder');
    const remotePlaceholder = document.getElementById('remotePlaceholder');
    
    const toggleMicBtn = document.getElementById('toggleMicBtn');
    const toggleCamBtn = document.getElementById('toggleCamBtn');
    const switchCamBtn = document.getElementById('switchCamBtn');
    const shareScreenBtn = document.getElementById('shareScreenBtn');
    const showCallInfoBtn = document.getElementById('showCallInfoBtn');
    const hangupBtn = document.getElementById('hangupBtn');
    
    const connectionStatus = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    
    const qrModal = document.getElementById('qrModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const qrcodeContainer = document.getElementById('qrcode');
    const modalPeerIdText = document.getElementById('modalPeerIdText');
    const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');

    // --- State Variables ---
    let peer = null;
    let currentCall = null;
    let localStream = null;
    let screenStream = null;
    let isMicMuted = false;
    let isCamOff = false;
    let isScreenSharing = false;
    let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
    let qrcodeObj = null;

    // --- Helper Utility: Generate Clean Short ID ---
    function generateShortId() {
        return Math.random().toString(36).substring(2, 8);
    }

    // --- Update Status Badge ---
    function setStatus(state, text) {
        if (connectionStatus && statusText) {
            connectionStatus.className = `status-badge status-${state}`;
            statusText.textContent = text;
        }
    }

    // --- Check Mobile Device ---
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    if (isMobileDevice() && switchCamBtn) {
        switchCamBtn.classList.remove('hidden');
    }

    // --- Initialize PeerJS ---
    function initPeer() {
        const customId = generateShortId();
        
        // Show ID immediately so input field is never stuck on "Generating ID..."
        if (myPeerIdInput) myPeerIdInput.value = customId;
        if (modalPeerIdText) modalPeerIdText.textContent = customId;
        setStatus('connecting', 'Connecting Server...');

        if (typeof Peer === 'undefined') {
            console.error('PeerJS library not loaded!');
            setStatus('disconnected', 'PeerJS Missing');
            alert('PeerJS library failed to load. Please check your internet connection or local lib/ files.');
            return;
        }

        try {
            // Initialize PeerJS with STUN servers
            peer = new Peer(customId, {
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' }
                    ]
                },
                debug: 1
            });

            peer.on('open', (id) => {
                console.log('Peer connected to signaling server with ID:', id);
                if (myPeerIdInput) myPeerIdInput.value = id;
                if (modalPeerIdText) modalPeerIdText.textContent = id;
                setStatus('disconnected', 'Ready');

                // Check URL parameters for ?connect=ID
                const urlParams = new URLSearchParams(window.location.search);
                const connectId = urlParams.get('connect');
                if (connectId && remotePeerIdInput) {
                    remotePeerIdInput.value = connectId;
                }
            });

            peer.on('call', async (call) => {
                console.log('Incoming call from:', call.peer);
                setStatus('connecting', 'Incoming Call...');
                
                try {
                    if (!localStream) {
                        await startLocalStream();
                    }
                    
                    call.answer(localStream);
                    setupCallHandlers(call);
                    showCallScreen();
                } catch (err) {
                    console.error('Failed to answer call:', err);
                    alert('Could not access camera/mic to answer the call.');
                }
            });

            peer.on('error', (err) => {
                console.error('PeerJS Error:', err);
                setStatus('disconnected', 'Server Offline');
                if (err.type === 'peer-unavailable') {
                    alert('Could not find peer with that ID. Please check the ID and try again.');
                } else {
                    console.warn(`Peer warning/error: ${err.type || err.message || err}`);
                }
            });

            peer.on('disconnected', () => {
                setStatus('disconnected', 'Disconnected');
            });
        } catch (e) {
            console.error('Error initializing Peer:', e);
            setStatus('disconnected', 'Init Error');
        }
    }

    // --- Fallback Stream Generator (When Camera/Mic is Blocked) ---
    function createFallbackStream() {
        console.warn('Creating canvas fallback stream...');
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');

        // Draw animated placeholder canvas
        function draw() {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#38bdf8';
            ctx.font = '30px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('📱 Mobile Local File Mode', canvas.width / 2, canvas.height / 2 - 20);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '20px sans-serif';
            ctx.fillText('(Camera blocked by file:// URL)', canvas.width / 2, canvas.height / 2 + 20);
        }
        draw();

        const canvasStream = canvas.captureStream(10);
        return canvasStream;
    }

    // --- Access Camera & Microphone ---
    async function startLocalStream(facingMode = 'user') {
        try {
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            localVideo.srcObject = localStream;
            localPlaceholder.classList.add('hidden');
            localVideo.classList.remove('hidden');

            if (isMicMuted) {
                localStream.getAudioTracks().forEach(t => t.enabled = false);
            }
            if (isCamOff) {
                localStream.getVideoTracks().forEach(t => t.enabled = false);
            }

            return localStream;
        } catch (err) {
            console.warn('Camera/Mic permission failed or not available:', err);
            // Fallback 1: Audio only
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                localVideo.classList.add('hidden');
                localPlaceholder.classList.remove('hidden');
                return localStream;
            } catch (audioErr) {
                console.warn('Audio fallback failed. Using Canvas fallback stream:', audioErr);
                // Fallback 2: Canvas video stream so connection never breaks!
                localStream = createFallbackStream();
                localVideo.classList.add('hidden');
                localPlaceholder.classList.remove('hidden');
                return localStream;
            }
        }
    }

    // --- Connect to Remote Peer ---
    async function connectToPeer(remoteId) {
        if (!remoteId) {
            alert('Please enter a Remote Peer ID.');
            return;
        }

        if (peer && remoteId === peer.id) {
            alert('You cannot connect to your own ID!');
            return;
        }

        try {
            if (!localStream) {
                try {
                    await startLocalStream();
                } catch (mediaErr) {
                    console.error('Media stream error:', mediaErr);
                    setStatus('disconnected', 'Camera/Mic Blocked');
                    alert('Could not access Camera or Microphone. If on a mobile phone, please host on HTTPS or Netlify/GitHub Pages as mobile browsers block camera access on local file:// URLs.');
                    return;
                }
            }

            if (!peer || peer.disconnected) {
                alert('Signaling connection is offline. Please check your internet connection and refresh.');
                setStatus('disconnected', 'Offline');
                return;
            }

            const call = peer.call(remoteId, localStream);
            setupCallHandlers(call);
            showCallScreen();
        } catch (err) {
            console.error('Error starting outgoing call:', err);
            setStatus('disconnected', 'Call Failed');
            alert(`Call failed: ${err.message || 'Could not connect to target peer ID.'}`);
        }
    }

    // --- Setup Call Event Listeners ---
    function setupCallHandlers(call) {
        currentCall = call;

        call.on('stream', (remoteStream) => {
            console.log('Received remote stream');
            remoteVideo.srcObject = remoteStream;
            remotePlaceholder.classList.add('hidden');
            remoteVideo.classList.remove('hidden');
            setStatus('connected', 'Connected');
        });

        call.on('close', () => {
            endCall();
        });

        call.on('error', (err) => {
            console.error('Call Error:', err);
            endCall();
        });
    }

    // --- Screen Sharing ---
    async function toggleScreenShare() {
        if (!currentCall && !localStream) {
            alert('Start a call before sharing screen.');
            return;
        }

        if (isScreenSharing) {
            stopScreenShare();
        } else {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                const screenVideoTrack = screenStream.getVideoTracks()[0];
                
                screenVideoTrack.onended = () => {
                    stopScreenShare();
                };

                if (currentCall && currentCall.peerConnection) {
                    const senders = currentCall.peerConnection.getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenVideoTrack);
                    }
                }

                localVideo.srcObject = screenStream;
                isScreenSharing = true;
                shareScreenBtn.classList.add('active');
                shareScreenBtn.querySelector('.label').textContent = 'Stop Sharing';
            } catch (err) {
                console.error('Screen sharing canceled or failed:', err);
            }
        }
    }

    function stopScreenShare() {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }

        isScreenSharing = false;
        shareScreenBtn.classList.remove('active');
        shareScreenBtn.querySelector('.label').textContent = 'Share Screen';

        if (localStream) {
            const camTrack = localStream.getVideoTracks()[0];
            localVideo.srcObject = localStream;
            
            if (currentCall && currentCall.peerConnection && camTrack) {
                const senders = currentCall.peerConnection.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(camTrack);
                }
            }
        }
    }

    // --- Camera Flip for Mobile ---
    async function flipCamera() {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        await startLocalStream(currentFacingMode);

        if (currentCall && currentCall.peerConnection && localStream) {
            const newTrack = localStream.getVideoTracks()[0];
            const senders = currentCall.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender && newTrack) {
                videoSender.replaceTrack(newTrack);
            }
        }
    }

    // --- UI Navigation ---
    function showCallScreen() {
        lobbyScreen.classList.remove('active');
        callScreen.classList.add('active');
    }

    function showLobbyScreen() {
        callScreen.classList.remove('active');
        lobbyScreen.classList.add('active');
    }

    function endCall() {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }

        if (isScreenSharing) {
            stopScreenShare();
        }

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }

        remoteVideo.srcObject = null;
        localVideo.srcObject = null;
        remotePlaceholder.classList.remove('hidden');
        localPlaceholder.classList.remove('hidden');

        setStatus('disconnected', 'Call Ended');
        showLobbyScreen();
    }

    // --- QR Code Generator & Share Link ---
    function generateShareUrl() {
        const baseUrl = window.location.href.split('?')[0];
        return `${baseUrl}?connect=${peer ? peer.id : myPeerIdInput.value}`;
    }

    function openQrModal() {
        const idToShare = peer ? peer.id : myPeerIdInput.value;
        if (!idToShare) {
            alert('Peer ID not generated yet.');
            return;
        }
        
        const shareUrl = generateShareUrl();
        modalPeerIdText.textContent = idToShare;

        qrcodeContainer.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            qrcodeObj = new QRCode(qrcodeContainer, {
                text: shareUrl,
                width: 180,
                height: 180,
                colorDark : "#0f172a",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        } else {
            qrcodeContainer.textContent = 'QR Code library missing.';
        }

        qrModal.classList.add('active');
    }

    function closeQrModal() {
        qrModal.classList.remove('active');
    }

    // --- Event Listeners ---
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            const id = remotePeerIdInput.value.trim();
            connectToPeer(id);
        });
    }

    if (copyIdBtn) {
        copyIdBtn.addEventListener('click', () => {
            if (myPeerIdInput.value) {
                navigator.clipboard.writeText(myPeerIdInput.value);
                copyIdBtn.textContent = '✓ Copied';
                setTimeout(() => copyIdBtn.textContent = '📋 Copy', 2000);
            }
        });
    }

    if (showQrBtn) showQrBtn.addEventListener('click', openQrModal);
    if (showCallInfoBtn) showCallInfoBtn.addEventListener('click', openQrModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeQrModal);
    if (qrModal) {
        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) closeQrModal();
        });
    }

    if (copyShareLinkBtn) {
        copyShareLinkBtn.addEventListener('click', () => {
            const shareUrl = generateShareUrl();
            navigator.clipboard.writeText(shareUrl);
            copyShareLinkBtn.textContent = '✓ Link Copied!';
            setTimeout(() => copyShareLinkBtn.textContent = '📋 Copy Share Link', 2000);
        });
    }

    if (toggleMicBtn) {
        toggleMicBtn.addEventListener('click', () => {
            if (localStream) {
                isMicMuted = !isMicMuted;
                localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
                toggleMicBtn.classList.toggle('muted', isMicMuted);
                toggleMicBtn.querySelector('.icon').textContent = isMicMuted ? '🔇' : '🎙️';
                toggleMicBtn.querySelector('.label').textContent = isMicMuted ? 'Unmute' : 'Mute';
            }
        });
    }

    if (toggleCamBtn) {
        toggleCamBtn.addEventListener('click', () => {
            if (localStream) {
                isCamOff = !isCamOff;
                localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
                toggleCamBtn.classList.toggle('off', isCamOff);
                toggleCamBtn.querySelector('.icon').textContent = isCamOff ? '📷' : '📹';
                toggleCamBtn.querySelector('.label').textContent = isCamOff ? 'Camera On' : 'Camera Off';
                localPlaceholder.classList.toggle('hidden', !isCamOff);
                localVideo.classList.toggle('hidden', isCamOff);
            }
        });
    }

    if (switchCamBtn) switchCamBtn.addEventListener('click', flipCamera);
    if (shareScreenBtn) shareScreenBtn.addEventListener('click', toggleScreenShare);
    if (hangupBtn) hangupBtn.addEventListener('click', endCall);

    // Initialize peer
    initPeer();
});
