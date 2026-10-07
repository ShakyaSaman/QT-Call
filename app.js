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
    const batteryWarningBox = document.getElementById('batteryWarningBox');
    const fixBatteryBtn = document.getElementById('fixBatteryBtn');
    const screenShareBanner = document.getElementById('screenShareBanner');
    const bannerStopShareBtn = document.getElementById('bannerStopShareBtn');

    if (window.AndroidNative) {
        if (window.AndroidNative.isBatteryOptimizationIgnored && !window.AndroidNative.isBatteryOptimizationIgnored()) {
            if (batteryWarningBox) batteryWarningBox.classList.remove('hidden');
        }
        if (fixBatteryBtn && window.AndroidNative.openBatteryOptimizationSettings) {
            fixBatteryBtn.addEventListener('click', () => {
                window.AndroidNative.openBatteryOptimizationSettings();
            });
        }
    }

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

    // --- Web Audio API Mixer for simultaneous Mic + YouTube / Screen Audio ---
    let mixedAudioContext = null;
    let mixedAudioDestination = null;

    function mixMicrophoneAndScreenAudio(micTrack, screenAudioTrack) {
        if (!screenAudioTrack) return micTrack;
        if (!micTrack) return screenAudioTrack;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('AudioContext not available, falling back to mic track');
                return micTrack;
            }

            cleanupAudioMixer();

            mixedAudioContext = new AudioContextClass();
            mixedAudioDestination = mixedAudioContext.createMediaStreamDestination();

            // Microphone audio input
            const micStream = new MediaStream([micTrack]);
            const micSource = mixedAudioContext.createMediaStreamSource(micStream);
            const micGain = mixedAudioContext.createGain();
            micGain.gain.value = 1.0;
            micSource.connect(micGain);
            micGain.connect(mixedAudioDestination);

            // YouTube / Screen audio input
            const screenAudioStream = new MediaStream([screenAudioTrack]);
            const screenSource = mixedAudioContext.createMediaStreamSource(screenAudioStream);
            const screenGain = mixedAudioContext.createGain();
            screenGain.gain.value = 1.0;
            screenSource.connect(screenGain);
            screenGain.connect(mixedAudioDestination);

            if (mixedAudioContext.state === 'suspended') {
                mixedAudioContext.resume().catch(e => console.warn('Could not resume AudioContext:', e));
            }

            const mixedTrack = mixedAudioDestination.stream.getAudioTracks()[0];
            console.log('Successfully mixed Microphone voice and Screen/YouTube audio!');
            return mixedTrack || micTrack;
        } catch (err) {
            console.error('Audio mixing failed, using mic track:', err);
            return micTrack;
        }
    }

    function cleanupAudioMixer() {
        if (mixedAudioContext) {
            try {
                mixedAudioContext.close();
            } catch (e) {
                console.warn('Error closing mixedAudioContext:', e);
            }
            mixedAudioContext = null;
            mixedAudioDestination = null;
        }
    }

    // --- Screen Share UI State Handler (Banner + Control Buttons) ---
    function updateScreenShareUI(isSharing) {
        if (screenShareBanner) {
            if (isSharing) {
                screenShareBanner.classList.remove('hidden');
            } else {
                screenShareBanner.classList.add('hidden');
            }
        }

        if (shareScreenBtn) {
            const iconSpan = shareScreenBtn.querySelector('.icon');
            const labelSpan = shareScreenBtn.querySelector('.label');
            if (isSharing) {
                shareScreenBtn.classList.add('active', 'sharing-active');
                if (iconSpan) iconSpan.textContent = '⏹️';
                if (labelSpan) labelSpan.textContent = 'Stop Sharing';
                shareScreenBtn.setAttribute('title', 'Turn off screen share');
            } else {
                shareScreenBtn.classList.remove('active', 'sharing-active');
                if (iconSpan) iconSpan.textContent = '💻';
                if (labelSpan) labelSpan.textContent = 'Share Screen';
                shareScreenBtn.setAttribute('title', 'Share Screen');
            }
        }
    }

    // --- In-App Notification Helper (replaces window.alert for iframe compatibility) ---
    function showNotification(message) {
        console.warn(message);
        const toast = document.getElementById('toastNotification');
        const toastMsg = document.getElementById('toastMessage');
        if (toast && toastMsg) {
            toastMsg.textContent = message;
            toast.classList.remove('hidden');
            toast.style.opacity = '1';
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.classList.add('hidden'), 300);
            }, 4000);
        }
    }

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
            showNotification('PeerJS library failed to load. Please check your internet connection or local lib/ files.');
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

            let reconnectTimer = null;
            let heartbeatInterval = null;

            function startPeerHeartbeat() {
                clearInterval(heartbeatInterval);
                heartbeatInterval = setInterval(() => {
                    if (peer && !peer.destroyed) {
                        if (peer.disconnected) {
                            console.log('Peer disconnected from signaling server, attempting reconnect...');
                            peer.reconnect();
                        } else if (peer.socket && peer.socket._socket && peer.socket._socket.readyState === WebSocket.OPEN) {
                            try {
                                peer.socket._socket.send(JSON.stringify({ type: 'HEARTBEAT' }));
                            } catch (e) {}
                        }
                    }
                }, 15000);
            }

            peer.on('open', (id) => {
                console.log('Peer connected to signaling server with ID:', id);
                if (myPeerIdInput) myPeerIdInput.value = id;
                if (modalPeerIdText) modalPeerIdText.textContent = id;
                setStatus('disconnected', 'Ready');
                startPeerHeartbeat();

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
                    showNotification('Could not access camera/mic to answer the call.');
                }
            });

            peer.on('error', (err) => {
                console.warn('PeerJS Error/Warning:', err);
                if (err.type === 'peer-unavailable') {
                    showNotification('Could not find peer with that ID. Please check the ID and try again.');
                } else if (err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed' || (err.message && err.message.includes('Lost connection'))) {
                    console.warn('Signaling socket disconnected. Attempting auto-reconnect...');
                    setStatus('connecting', 'Reconnecting...');
                    clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(() => {
                        if (peer && !peer.destroyed && peer.disconnected) {
                            peer.reconnect();
                        }
                    }, 2500);
                } else {
                    console.warn(`Peer warning/error: ${err.type || err.message || err}`);
                }
            });

            peer.on('disconnected', () => {
                console.warn('Peer disconnected from signaling server, scheduling reconnect...');
                setStatus('connecting', 'Reconnecting...');
                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(() => {
                    if (peer && !peer.destroyed && peer.disconnected) {
                        peer.reconnect();
                    }
                }, 2500);
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
                audio: {
                    echoCancellation: true,
                    noiseSuppression: false, // Prevents aggressive filtering of YouTube/media audio
                    autoGainControl: true
                }
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
                    showNotification('Could not access Camera or Microphone. Please allow camera/microphone permissions in browser settings.');
                    return;
                }
            }

            if (!peer || peer.disconnected) {
                showNotification('Signaling connection is offline. Please check your internet connection and refresh.');
                setStatus('disconnected', 'Offline');
                return;
            }

            const call = peer.call(remoteId, localStream);
            setupCallHandlers(call);
            showCallScreen();
        } catch (err) {
            console.error('Error starting outgoing call:', err);
            setStatus('disconnected', 'Call Failed');
            showNotification(`Call failed: ${err.message || 'Could not connect to target peer ID.'}`);
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

    // --- Mobile Image Stream Sharing (Fallback for Phones without getDisplayMedia) ---
    function shareImageStream(imageFile) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width || 1280;
            canvas.height = img.height || 720;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            screenStream = canvas.captureStream(10);
            const screenVideoTrack = screenStream.getVideoTracks()[0];

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
        };
        img.src = URL.createObjectURL(imageFile);
    }

    // --- Native Android Screen Share Handlers ---
    let nativeScreenCanvas = null;
    let nativeScreenCtx = null;
    let nativeScreenImage = null;

    window.onNativeScreenShareStarted = () => {
        if (!nativeScreenCanvas) {
            nativeScreenCanvas = document.createElement('canvas');
            nativeScreenCanvas.width = 1280;
            nativeScreenCanvas.height = 720;
            nativeScreenCtx = nativeScreenCanvas.getContext('2d');
            nativeScreenImage = new Image();
        }

        screenStream = nativeScreenCanvas.captureStream(15);
        const screenVideoTrack = screenStream.getVideoTracks()[0];

        if (currentCall && currentCall.peerConnection) {
            const senders = currentCall.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender && screenVideoTrack) {
                videoSender.replaceTrack(screenVideoTrack);
            }

            // Keep speaker microphone transmitting in background
            if (localStream) {
                const micTrack = localStream.getAudioTracks()[0];
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                if (audioSender && micTrack) {
                    micTrack.enabled = !isMicMuted;
                    audioSender.replaceTrack(micTrack);
                }
            }
        }

        localVideo.srcObject = screenStream;
        isScreenSharing = true;
        updateScreenShareUI(true);
    };

    window.onNativeScreenFrame = (dataUrl) => {
        if (!isScreenSharing || !nativeScreenCtx) return;
        nativeScreenImage.onload = () => {
            if (nativeScreenCanvas.width !== nativeScreenImage.width) {
                nativeScreenCanvas.width = nativeScreenImage.width;
                nativeScreenCanvas.height = nativeScreenImage.height;
            }
            nativeScreenCtx.drawImage(nativeScreenImage, 0, 0);
        };
        nativeScreenImage.src = dataUrl;
    };

    window.onNativeScreenShareStopped = () => {
        stopScreenShare();
    };

    window.onNativeScreenShareError = (errorMsg) => {
        console.warn('Native Screen Share Error:', errorMsg);
        showNotification(errorMsg || 'Screen capture permission was denied.');
        stopScreenShare();
    };

    // --- Screen Sharing ---
    async function toggleScreenShare() {
        if (!currentCall && !localStream) {
            showNotification('Please start or join a call before sharing.');
            return;
        }

        if (isScreenSharing) {
            stopScreenShare();
        } else {
            // Check for Native Android Interface first
            if (window.AndroidNative && window.AndroidNative.startScreenShare) {
                window.AndroidNative.startScreenShare();
                return;
            }

            const displayMediaApi = (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) 
                ? navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
                : null;

            // If native screen capture is supported (Desktop & compatible Android Chrome)
            if (displayMediaApi) {
                try {
                    try {
                        screenStream = await displayMediaApi({
                            video: { cursor: 'always' },
                            audio: {
                                echoCancellation: false,
                                noiseSuppression: false,
                                autoGainControl: false
                            }
                        });
                    } catch (constraintErr) {
                        screenStream = await displayMediaApi(true);
                    }

                    const screenVideoTrack = screenStream.getVideoTracks()[0];
                    const screenAudioTrack = screenStream.getAudioTracks()[0] || null;

                    screenVideoTrack.onended = () => {
                        stopScreenShare();
                    };

                    if (currentCall && currentCall.peerConnection) {
                        const senders = currentCall.peerConnection.getSenders();
                        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                        if (videoSender && screenVideoTrack) {
                            videoSender.replaceTrack(screenVideoTrack);
                        }

                        // Mixed Audio: transmit BOTH speaker voice AND YouTube/screen audio
                        const micTrack = localStream ? localStream.getAudioTracks()[0] : null;
                        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

                        if (audioSender) {
                            if (screenAudioTrack && micTrack) {
                                const mixedTrack = mixMicrophoneAndScreenAudio(micTrack, screenAudioTrack);
                                audioSender.replaceTrack(mixedTrack);
                            } else if (micTrack) {
                                micTrack.enabled = !isMicMuted;
                                audioSender.replaceTrack(micTrack);
                            } else if (screenAudioTrack) {
                                audioSender.replaceTrack(screenAudioTrack);
                            }
                        }
                    }

                    localVideo.srcObject = screenStream;
                    isScreenSharing = true;
                    updateScreenShareUI(true);
                    return;
                } catch (err) {
                    console.warn('Native screen share failed or canceled, offering mobile photo share:', err);
                    if (err.name === 'NotAllowedError') return;
                }
            }

            // Fallback for Mobile Phones (iPhones, In-App Browsers, & unsupported mobile contexts):
            const confirmPhotoShare = confirm('Native screen recording is blocked by your mobile browser.\n\nWould you like to select a Screenshot or Photo/Document to share live on call?');
            if (confirmPhotoShare) {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        shareImageStream(file);
                    }
                };
                fileInput.click();
            }
        }
    }

    function stopScreenShare() {
        if (window.AndroidNative && window.AndroidNative.stopScreenShare && isScreenSharing) {
            window.AndroidNative.stopScreenShare();
        }

        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }

        cleanupAudioMixer();

        isScreenSharing = false;
        updateScreenShareUI(false);

        if (localStream) {
            const camTrack = localStream.getVideoTracks()[0];
            const micTrack = localStream.getAudioTracks()[0];
            localVideo.srcObject = localStream;
            
            if (currentCall && currentCall.peerConnection) {
                const senders = currentCall.peerConnection.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender && camTrack) {
                    camTrack.enabled = !isCamOff;
                    videoSender.replaceTrack(camTrack);
                }
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                if (audioSender && micTrack) {
                    micTrack.enabled = !isMicMuted;
                    audioSender.replaceTrack(micTrack);
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
            showNotification('Peer ID not generated yet.');
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
    if (bannerStopShareBtn) bannerStopShareBtn.addEventListener('click', stopScreenShare);
    if (hangupBtn) hangupBtn.addEventListener('click', endCall);

    // Initialize peer
    initPeer();
});
