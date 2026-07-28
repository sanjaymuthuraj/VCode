import * as monaco from 'monaco-editor';
import './style.css';

// ----------------------------------------------------
// App State Variables
// ----------------------------------------------------
let socket = null;
let mySessionId = null;
let username = null;
let roomCode = null;
let participants = [];
let isInCall = false;

// WebRTC State
let localStream = null;
const peers = {}; // sessionId -> RTCPeerConnection

// UI Elements
const landingScreen = document.getElementById('landing-screen');
const workspaceScreen = document.getElementById('workspace-screen');
const usernameInput = document.getElementById('username-input');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const createRoomBtn = document.getElementById('create-room-btn');

const displayRoomCode = document.getElementById('display-room-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const collaborationStatus = document.getElementById('collaboration-status');
const languageSelector = document.getElementById('language-selector');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatBadge = document.getElementById('chat-badge');

const peopleList = document.getElementById('people-list');
const peopleCount = document.getElementById('people-count');

const joinCallBtn = document.getElementById('join-call-btn');
const callActions = document.getElementById('call-actions');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const leaveCallBtn = document.getElementById('leave-call-btn');
const videoGrid = document.getElementById('video-grid');

const uploadFileBtn = document.getElementById('upload-file-btn');
const fileUploader = document.getElementById('file-uploader');
const downloadFileBtn = document.getElementById('download-file-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

// Tabs State
let activeTab = 'tab-chat';
let unreadChatCount = 0;

// Resolve API Host names
const isHttps = window.location.protocol === 'https:';
const apiBase = `${isHttps ? 'https:' : 'http:'}//localhost:8080/api/rooms`;
const wsBase = `${isHttps ? 'wss:' : 'ws:'}//localhost:8080/ws/room`;

// Monaco Setup
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        if (label === 'json') return './json.worker.bundle.js';
        if (label === 'css' || label === 'scss' || label === 'less') return './css.worker.bundle.js';
        if (label === 'html' || label === 'handelbars' || label === 'razor') return './html.worker.bundle.js';
        if (label === 'typescript' || label === 'javascript') return './ts.worker.bundle.js';
        return './editor.worker.bundle.js';
    },
};

const editor = monaco.editor.create(document.getElementById('editor-container'), {
    value: '// Start typing collaborative code here...\n',
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    fontFamily: "'JetBrains Mono', Consolas, monospace",
    fontSize: 14,
    tabSize: 4,
    minimap: { enabled: false }
});

const editorModel = editor.getModel();

// Flag to prevent loopback sync loops
let isRemoteUpdating = false;

// Remote cursors decoration map
let remoteCursors = {}; // sessionId -> decorationIds array

// ----------------------------------------------------
// Landing Page Events
// ----------------------------------------------------
createRoomBtn.addEventListener('click', async () => {
    username = usernameInput.value.trim();
    if (!username) {
        alert("Please enter your display name.");
        return;
    }
    
    try {
        const res = await fetch(apiBase, { method: 'POST' });
        const data = await res.json();
        roomCode = data.roomCode;
        enterRoom();
    } catch (e) {
        alert("Failed to create room. Is the backend server running? " + e.message);
    }
});

joinRoomBtn.addEventListener('click', async () => {
    username = usernameInput.value.trim();
    roomCode = roomCodeInput.value.trim().toUpperCase();

    if (!username) {
        alert("Please enter your display name.");
        return;
    }
    if (!roomCode) {
        alert("Please enter a Room Code.");
        return;
    }

    try {
        const res = await fetch(`${apiBase}/${roomCode}`);
        const data = await res.json();
        if (data.exists) {
            enterRoom();
        } else {
            alert("Room not found. Please check the code and try again.");
        }
    } catch (e) {
        alert("Failed to connect to room registry: " + e.message);
    }
});

// ----------------------------------------------------
// Room Navigation and WebSocket Sync
// ----------------------------------------------------
function enterRoom() {
    landingScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');
    displayRoomCode.innerText = roomCode;
    
    // Connect WebSocket
    socket = new WebSocket(wsBase);
    
    socket.onopen = () => {
        collaborationStatus.innerText = "Connected";
        collaborationStatus.style.backgroundColor = "rgba(16, 185, 129, 0.15)";
        collaborationStatus.style.color = "#10b981";
        collaborationStatus.style.borderColor = "rgba(16, 185, 129, 0.3)";
        
        // Join message
        sendMessage({
            type: 'JOIN',
            roomCode: roomCode,
            username: username
        });
    };
    
    socket.onclose = () => {
        collaborationStatus.innerText = "Disconnected";
        collaborationStatus.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
        collaborationStatus.style.color = "#ef4444";
        collaborationStatus.style.borderColor = "rgba(239, 68, 68, 0.3)";
        cleanPeers();
    };
    
    socket.onerror = (err) => {
        console.error("Socket error", err);
    };
    
    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleSocketMessage(msg);
    };
}

function sendMessage(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

// ----------------------------------------------------
// WebSocket Message Parser
// ----------------------------------------------------
function handleSocketMessage(msg) {
    switch (msg.type) {
        case 'ROOM_STATE':
            mySessionId = msg.yourSessionId;
            isRemoteUpdating = true;
            editorModel.setValue(msg.code);
            isRemoteUpdating = false;
            languageSelector.value = msg.language;
            monaco.editor.setModelLanguage(editorModel, msg.language);
            updateParticipants(msg.participants);
            break;
            
        case 'USER_LIST_UPDATE':
            updateParticipants(msg.participants);
            break;
            
        case 'CHAT':
            renderChatMessage(msg);
            break;
            
        case 'CODE_UPDATE':
            isRemoteUpdating = true;
            const currentSelection = editor.getSelection();
            const currentScroll = editor.getScrollTop();
            
            editor.executeEdits("remote-update", [{
                range: editorModel.getFullModelRange(),
                text: msg.code,
                forceMoveMarkers: true
            }]);
            
            if (currentSelection) {
                editor.setSelection(currentSelection);
            }
            editor.setScrollTop(currentScroll);
            isRemoteUpdating = false;
            break;
            
        case 'LANGUAGE_UPDATE':
            languageSelector.value = msg.language;
            monaco.editor.setModelLanguage(editorModel, msg.language);
            break;
            
        case 'CURSOR_UPDATE':
            renderRemoteCursor(msg.sessionId, msg.username, msg.position);
            break;
            
        case 'RTC_SIGNAL':
            handleRtcSignalPayload(msg.senderId, msg.senderName, msg.signal);
            break;
    }
}

// ----------------------------------------------------
// Tab Navigation & Visual Unreads
// ----------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        
        // Toggle tab button active state
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Show target panel
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        document.getElementById(targetTab).classList.add('active');
        
        activeTab = targetTab;
        
        // If chat becomes active, clear unread count badge
        if (activeTab === 'tab-chat') {
            unreadChatCount = 0;
            chatBadge.classList.add('hidden');
        }
    });
});

// ----------------------------------------------------
// Editor Live Sync Logic (Throttled Updates)
// ----------------------------------------------------
let typingTimeout = null;
editor.onDidChangeModelContent(() => {
    if (isRemoteUpdating) return;
    
    // Throttle / Debounce code sync (200ms)
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        sendMessage({
            type: 'CODE_UPDATE',
            code: editorModel.getValue()
        });
    }, 200);
});

// Cursor Position Tracking
editor.onDidChangeCursorPosition((e) => {
    sendMessage({
        type: 'CURSOR_UPDATE',
        position: {
            lineNumber: e.position.lineNumber,
            column: e.position.column
        }
    });
});

function renderRemoteCursor(senderId, senderName, position) {
    if (remoteCursors[senderId]) {
        editorModel.deltaDecorations(remoteCursors[senderId], []);
    }
    
    if (!position) return;
    
    remoteCursors[senderId] = editorModel.deltaDecorations([], [
        {
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            options: {
                className: 'remote-cursor-element',
                hoverMessage: { value: senderName },
                before: {
                    content: senderName,
                    inlineClassName: 'remote-cursor-tooltip'
                }
            }
        }
    ]);
}

// ----------------------------------------------------
// Chat Messaging Display
// ----------------------------------------------------
sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    sendMessage({
        type: 'CHAT',
        message: text
    });
    chatInput.value = '';
}

function renderChatMessage(msg) {
    const isSelf = msg.senderId === mySessionId;
    const isSystem = msg.senderId === 'system';
    
    const bubble = document.createElement('div');
    if (isSystem) {
        bubble.className = 'chat-bubble system';
        bubble.innerText = msg.message;
    } else {
        bubble.className = `chat-bubble ${isSelf ? 'self' : 'other'}`;
        
        const sender = document.createElement('span');
        sender.className = 'chat-sender';
        sender.innerText = msg.sender;
        bubble.appendChild(sender);
        
        const body = document.createElement('span');
        body.innerText = msg.message;
        bubble.appendChild(body);
    }
    
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Trigger unread notification badge on the chat tab
    if (activeTab !== 'tab-chat' && !isSystem && !isSelf) {
        unreadChatCount++;
        chatBadge.innerText = unreadChatCount;
        chatBadge.classList.remove('hidden');
    }
}

// ----------------------------------------------------
// Participants View
// ----------------------------------------------------
function updateParticipants(newList) {
    participants = newList;
    peopleCount.innerText = participants.length;
    peopleList.innerHTML = '';
    
    participants.forEach(p => {
        const item = document.createElement('div');
        item.className = `person-item ${p.sessionId === mySessionId ? 'self' : ''}`;
        
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        item.appendChild(dot);
        
        const name = document.createElement('span');
        name.className = 'person-name';
        name.innerText = p.username;
        item.appendChild(name);
        
        peopleList.appendChild(item);
    });
    
    // Clean up decorations for disconnected users
    const participantIds = participants.map(p => p.sessionId);
    Object.keys(remoteCursors).forEach(sid => {
        if (!participantIds.includes(sid)) {
            editorModel.deltaDecorations(remoteCursors[sid], []);
            delete remoteCursors[sid];
        }
    });
}

// ----------------------------------------------------
// Full Mesh WebRTC Video Call Integration
// ----------------------------------------------------
joinCallBtn.addEventListener('click', startLocalCall);
leaveCallBtn.addEventListener('click', stopLocalCall);
toggleAudioBtn.addEventListener('click', toggleAudio);
toggleVideoBtn.addEventListener('click', toggleVideo);

async function startLocalCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        joinCallBtn.classList.add('hidden');
        callActions.classList.remove('hidden');
        
        // Render local video block
        renderVideoFrame('local', `${username} (You)`, localStream, true);
        
        isInCall = true;
        
        // Notify other participants in the room that we joined the call
        participants.forEach(p => {
            if (p.sessionId !== mySessionId) {
                sendMessage({
                    type: 'RTC_SIGNAL',
                    target: p.sessionId,
                    signal: { type: 'ready' }
                });
            }
        });
        
    } catch (e) {
        alert("Failed to acquire camera/microphone: " + e.message);
    }
}

function stopLocalCall() {
    isInCall = false;
    
    // Stop local camera streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Clean DOM elements
    removeVideoFrame('local');
    
    joinCallBtn.classList.remove('hidden');
    callActions.classList.add('hidden');
    
    // Close connections
    cleanPeers();
    
    // Notify others we left
    participants.forEach(p => {
        if (p.sessionId !== mySessionId) {
            sendMessage({
                type: 'RTC_SIGNAL',
                target: p.sessionId,
                signal: { type: 'leave' }
            });
        }
    });
}

function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            toggleAudioBtn.classList.toggle('active', audioTrack.enabled);
            toggleAudioBtn.innerText = audioTrack.enabled ? '🎤' : '🔇';
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            toggleVideoBtn.classList.toggle('active', videoTrack.enabled);
            toggleVideoBtn.innerText = videoTrack.enabled ? '📷' : '❌📷';
        }
    }
}

// Signaling Receiver
function handleRtcSignalPayload(senderId, senderName, signal) {
    if (!isInCall) return; // Ignore signals if we aren't in the call
    
    if (signal.type === 'ready') {
        // Someone has joined the call. Initiate peer connection if our ID is lexicographically greater
        if (mySessionId > senderId) {
            initiatePeerConnection(senderId, senderName);
        }
    } else if (signal.type === 'offer') {
        respondToOffer(senderId, senderName, signal.sdp);
    } else if (signal.type === 'answer') {
        const pc = peers[senderId];
        if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
        }
    } else if (signal.type === 'candidate') {
        const pc = peers[senderId];
        if (pc && signal.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => {
                console.error("Error adding Ice Candidate", e);
            });
        }
    } else if (signal.type === 'leave') {
        closePeerConnection(senderId);
    }
}

// Initiate RTCPeerConnection (Sends Offer)
async function initiatePeerConnection(targetId, targetName) {
    if (peers[targetId]) return; // Already connected
    
    const pc = createBasePeerConnection(targetId, targetName);
    peers[targetId] = pc;
    
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        sendMessage({
            type: 'RTC_SIGNAL',
            target: targetId,
            signal: { type: 'offer', sdp: offer.sdp }
        });
    } catch (e) {
        console.error("Failed to create offer for peer: " + targetId, e);
    }
}

// Respond to RTC Offer (Sends Answer)
async function respondToOffer(senderId, senderName, remoteSdp) {
    if (peers[senderId]) {
        // Re-connect
        closePeerConnection(senderId);
    }
    
    const pc = createBasePeerConnection(senderId, senderName);
    peers[senderId] = pc;
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: remoteSdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        sendMessage({
            type: 'RTC_SIGNAL',
            target: senderId,
            signal: { type: 'answer', sdp: answer.sdp }
        });
    } catch (e) {
        console.error("Failed to respond to offer from: " + senderId, e);
    }
}

// Setup common parameters of PeerConnection
function createBasePeerConnection(peerId, peerName) {
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    });
    
    // Add local tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
    
    // ICE candidate handler
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage({
                type: 'RTC_SIGNAL',
                target: peerId,
                signal: {
                    type: 'candidate',
                    candidate: event.candidate
                }
            });
        }
    };
    
    // Track listener
    pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        renderVideoFrame(peerId, peerName, remoteStream, false);
    };
    
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            closePeerConnection(peerId);
        }
    };
    
    return pc;
}

function renderVideoFrame(id, displayName, stream, isMuted) {
    let videoBox = document.getElementById(`video-box-${id}`);
    if (!videoBox) {
        videoBox = document.createElement('div');
        videoBox.id = `video-box-${id}`;
        videoBox.className = 'video-box';
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = isMuted;
        videoBox.appendChild(video);
        
        const label = document.createElement('div');
        label.className = 'video-label';
        label.innerText = displayName;
        videoBox.appendChild(label);
        
        videoGrid.appendChild(videoBox);
        video.srcObject = stream;
    } else {
        const video = videoBox.querySelector('video');
        if (video) video.srcObject = stream;
    }
}

function removeVideoFrame(id) {
    const videoBox = document.getElementById(`video-box-${id}`);
    if (videoBox) {
        const video = videoBox.querySelector('video');
        if (video) video.srcObject = null;
        videoBox.remove();
    }
}

function closePeerConnection(peerId) {
    const pc = peers[peerId];
    if (pc) {
        pc.close();
        delete peers[peerId];
    }
    removeVideoFrame(peerId);
}

function cleanPeers() {
    Object.keys(peers).forEach(id => {
        closePeerConnection(id);
    });
}

// ----------------------------------------------------
// Dropdown and Header Buttons Actions
// ----------------------------------------------------
languageSelector.addEventListener('change', () => {
    const lang = languageSelector.value;
    monaco.editor.setModelLanguage(editorModel, lang);
    
    sendMessage({
        type: 'LANGUAGE_UPDATE',
        language: lang
    });
});

copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(() => {
        alert("Room Code copied to clipboard: " + roomCode);
    }).catch(err => {
        console.error("Failed to copy", err);
    });
});

// File Upload
uploadFileBtn.addEventListener('click', () => {
    fileUploader.click();
});

fileUploader.addEventListener('change', () => {
    const file = fileUploader.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        
        // Guess language by extension
        const ext = file.name.split('.').pop().toLowerCase();
        let lang = 'plaintext';
        if (ext === 'js') lang = 'javascript';
        else if (ext === 'ts') lang = 'typescript';
        else if (ext === 'html') lang = 'html';
        else if (ext === 'css') lang = 'css';
        else if (ext === 'json') lang = 'json';
        else if (ext === 'py') lang = 'python';
        else if (ext === 'java') lang = 'java';
        else if (ext === 'cpp' || ext === 'cc' || ext === 'h') lang = 'cpp';
        else if (ext === 'md') lang = 'markdown';
        
        // Update local editor and broadcast
        editorModel.setValue(text);
        monaco.editor.setModelLanguage(editorModel, lang);
        languageSelector.value = lang;
        
        sendMessage({
            type: 'LANGUAGE_UPDATE',
            language: lang
        });
        sendMessage({
            type: 'CODE_UPDATE',
            code: text
        });
    };
    reader.readAsText(file);
    fileUploader.value = ''; // Reset uploader input
});

// File Download
downloadFileBtn.addEventListener('click', () => {
    const codeText = editorModel.getValue();
    const lang = languageSelector.value;
    
    // Guess file extension by language
    let ext = 'txt';
    if (lang === 'javascript') ext = 'js';
    else if (lang === 'typescript') ext = 'ts';
    else if (lang === 'html') ext = 'html';
    else if (lang === 'css') ext = 'css';
    else if (lang === 'json') ext = 'json';
    else if (lang === 'python') ext = 'py';
    else if (lang === 'java') ext = 'java';
    else if (lang === 'cpp') ext = 'cpp';
    else if (lang === 'markdown') ext = 'md';
    
    const filename = `code_room_${roomCode}.${ext}`;
    
    const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Leave Room
leaveRoomBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to leave the collaborative session?")) {
        if (isInCall) stopLocalCall();
        
        if (socket) {
            socket.close();
            socket = null;
        }
        
        // Clear editor
        isRemoteUpdating = true;
        editorModel.setValue('// Start typing collaborative code here...\n');
        isRemoteUpdating = false;
        
        // Reset state
        mySessionId = null;
        username = null;
        roomCode = null;
        participants = [];
        
        // Toggle screen visibility
        workspaceScreen.classList.add('hidden');
        landingScreen.classList.remove('hidden');
    }
});
