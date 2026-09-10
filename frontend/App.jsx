import React, { useState, useEffect, useRef } from 'react';
import LandingScreen from './components/LandingScreen';
import WorkspaceScreen from './components/WorkspaceScreen';
import { API_BASE as apiBase, WS_ROOM_URL as wsBase } from './config';


export default function App() {
    const [screen, setScreen] = useState('landing'); // 'landing' | 'workspace'
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [participants, setParticipants] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [files, setFiles] = useState({});
    const [activeFile, setActiveFile] = useState('main.js');
    const [mySessionId, setMySessionId] = useState(null);

    // WebRTC video call states
    const [isInCall, setIsInCall] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [videoStreams, setVideoStreams] = useState([]); // [{ id, displayName, stream, isMuted }]

    // Connection & element references to prevent stale closures
    const socketRef = useRef(null);
    const peersRef = useRef({}); // sessionId -> RTCPeerConnection
    const editorComponentRef = useRef(null);

    const mySessionIdRef = useRef(null);
    const participantsRef = useRef([]);
    const localStreamRef = useRef(null);
    const isInCallRef = useRef(false);
    const usernameRef = useRef('');
    const roomCodeRef = useRef('');

    const filesRef = useRef({});
    const activeFileRef = useRef('main.js');

    // Sync state values to refs
    useEffect(() => { mySessionIdRef.current = mySessionId; }, [mySessionId]);
    useEffect(() => { participantsRef.current = participants; }, [participants]);
    useEffect(() => { isInCallRef.current = isInCall; }, [isInCall]);
    useEffect(() => { usernameRef.current = username; }, [username]);
    useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);
    useEffect(() => { filesRef.current = files; }, [files]);
    useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

    // WebSocket send helper
    const sendMessage = (data) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(data));
        }
    };

    // Clean up peer connections on unmount
    useEffect(() => {
        return () => {
            stopLocalCall();
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    // WebSocket Message Parser
    const handleSocketMessage = (msg) => {
        switch (msg.type) {
            case 'ROOM_STATE':
                setMySessionId(msg.yourSessionId);
                setFiles(msg.files || {});
                setActiveFile('main.js');
                if (msg.files && msg.files['main.js']) {
                    editorComponentRef.current?.setValue(msg.files['main.js'].content);
                }
                updateParticipantsList(msg.participants, msg.yourSessionId);
                break;
                
            case 'USER_LIST_UPDATE':
                updateParticipantsList(msg.participants, mySessionIdRef.current);
                break;
                
            case 'CHAT':
                setChatMessages(prev => [...prev, {
                    senderId: msg.senderId,
                    sender: msg.sender,
                    message: msg.message,
                    mySessionId: mySessionIdRef.current
                }]);
                if (msg.senderId !== mySessionIdRef.current && msg.senderId !== 'system') {
                    setUnreadChatCount(prev => prev + 1);
                }
                break;
                
            case 'CODE_UPDATE':
                setFiles(prev => ({
                    ...prev,
                    [msg.filename]: { ...prev[msg.filename], content: msg.code }
                }));
                if (msg.filename === activeFileRef.current) {
                    editorComponentRef.current?.setValue(msg.code);
                }
                break;
                
            case 'LANGUAGE_UPDATE':
                setFiles(prev => ({
                    ...prev,
                    [msg.filename]: { ...prev[msg.filename], language: msg.language }
                }));
                break;
                
            case 'FILE_CREATE':
                setFiles(prev => ({ ...prev, [msg.filename]: msg.file }));
                break;
                
            case 'FILE_DELETE':
                setFiles(prev => {
                    const newFiles = { ...prev };
                    delete newFiles[msg.filename];
                    return newFiles;
                });
                if (activeFileRef.current === msg.filename) {
                    setActiveFile('main.js');
                    const mainContent = filesRef.current['main.js']?.content || '';
                    editorComponentRef.current?.setValue(mainContent);
                }
                break;
                
            case 'FILE_RENAME':
                setFiles(prev => {
                    const newFiles = { ...prev };
                    const file = newFiles[msg.oldName];
                    delete newFiles[msg.oldName];
                    if (file) newFiles[msg.newName] = file;
                    return newFiles;
                });
                if (activeFileRef.current === msg.oldName) {
                    setActiveFile(msg.newName);
                }
                break;
                
            case 'CURSOR_UPDATE':
                if (msg.filename === activeFileRef.current) {
                    editorComponentRef.current?.updateRemoteCursor(msg.sessionId, msg.username, msg.position);
                } else {
                    editorComponentRef.current?.clearRemoteCursor(msg.sessionId);
                }
                break;
                
            case 'RTC_SIGNAL':
                handleRtcSignalPayload(msg.senderId, msg.senderName, msg.signal);
                break;
        }
    };

    const updateParticipantsList = (newList, currentMySessionId) => {
        const formatted = newList.map(p => ({
            sessionId: p.sessionId,
            username: p.username,
            activeFile: p.activeFile,
            isSelf: p.sessionId === currentMySessionId
        }));

        // Clean up decorations for disconnected users
        const oldSessionIds = participantsRef.current.map(p => p.sessionId);
        const newSessionIds = newList.map(p => p.sessionId);
        oldSessionIds.forEach(sid => {
            if (!newSessionIds.includes(sid)) {
                editorComponentRef.current?.clearRemoteCursor(sid);
            }
        });

        setParticipants(formatted);
    };

    // Establish WebSocket Connection
    const enterRoom = (name, code) => {
        setUsername(name);
        setRoomCode(code);
        setScreen('workspace');
        setConnectionStatus('Connecting');

        const socket = new WebSocket(wsBase);
        socketRef.current = socket;

        socket.onopen = () => {
            setConnectionStatus('Connected');
            sendMessage({
                type: 'JOIN',
                roomCode: code,
                username: name
            });
        };

        socket.onclose = () => {
            setConnectionStatus('Disconnected');
            stopLocalCall();
            editorComponentRef.current?.clearAllRemoteCursors();
        };

        socket.onerror = (err) => {
            console.error("Socket error", err);
        };

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleSocketMessage(msg);
            } catch (error) {
                console.error('Received an invalid server message', error);
            }
        };
    };

    // Join and Create Lobby Handlers
    const handleJoinRoom = async (name, code) => {
        try {
            const res = await fetch(`${apiBase}/${code}`);
            const data = await res.json();
            if (data.exists) {
                enterRoom(name, code);
            } else {
                alert("Room not found. Please check the code and try again.");
            }
        } catch (e) {
            alert("Failed to connect to room registry: " + e.message);
        }
    };

    const handleCreateRoom = async (name) => {
        try {
            const res = await fetch(apiBase, { method: 'POST' });
            const data = await res.json();
            enterRoom(name, data.roomCode);
        } catch (e) {
            alert("Failed to create room. Is the backend server running? " + e.message);
        }
    };

    const handleLeaveRoom = () => {
        if (window.confirm("Are you sure you want to leave the collaborative session?")) {
            stopLocalCall();
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
            setScreen('landing');
            setUsername('');
            setRoomCode('');
            setParticipants([]);
            setChatMessages([]);
            setUnreadChatCount(0);
            setMySessionId(null);
        }
    };

    const handleSendChatMessage = (msgText) => {
        sendMessage({
            type: 'CHAT',
            message: msgText
        });
    };

    // Editor sync callbacks
    const handleCodeChange = (val) => {
        sendMessage({
            type: 'CODE_UPDATE',
            filename: activeFileRef.current,
            code: val
        });
    };

    const handleCursorChange = (pos) => {
        sendMessage({
            type: 'CURSOR_UPDATE',
            filename: activeFileRef.current,
            position: {
                lineNumber: pos.lineNumber,
                column: pos.column
            }
        });
    };

    const handleLanguageChange = (lang) => {
        setFiles(prev => ({
            ...prev,
            [activeFileRef.current]: { ...prev[activeFileRef.current], language: lang }
        }));
        sendMessage({
            type: 'LANGUAGE_UPDATE',
            filename: activeFileRef.current,
            language: lang
        });
    };
    
    const handleActiveFileChange = (filename) => {
        setActiveFile(filename);
        if (filesRef.current[filename]) {
            editorComponentRef.current?.setValue(filesRef.current[filename].content);
        }
        sendMessage({
            type: 'SWITCH_FILE',
            filename: filename
        });
        editorComponentRef.current?.clearAllRemoteCursors();
    };

    const handleFileCreate = (filename, language = 'plaintext') => {
        sendMessage({ type: 'FILE_CREATE', filename, language, content: '' });
    };

    const handleFileDelete = (filename) => {
        sendMessage({ type: 'FILE_DELETE', filename });
    };

    const handleFileRename = (oldName, newName) => {
        sendMessage({ type: 'FILE_RENAME', oldName, newName });
    };

    const handleUploadFile = (text, lang) => {
        editorComponentRef.current?.setValue(text);
        setFiles(prev => ({
            ...prev,
            [activeFileRef.current]: { content: text, language: lang }
        }));
        sendMessage({
            type: 'LANGUAGE_UPDATE',
            filename: activeFileRef.current,
            language: lang
        });
        sendMessage({
            type: 'CODE_UPDATE',
            filename: activeFileRef.current,
            code: text
        });
    };

    const handleDownloadFile = () => {
        const codeText = editorComponentRef.current?.getValue() || '';
        const currentFile = filesRef.current[activeFileRef.current];
        const lang = currentFile ? currentFile.language : 'plaintext';
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
        
        const filename = `code_room_${roomCode}_${activeFileRef.current.split('.')[0]}.${ext}`;
        const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ----------------------------------------------------
    // Full Mesh WebRTC Video Call Integration
    // ----------------------------------------------------
    const startLocalCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            setIsInCall(true);
            setIsAudioEnabled(true);
            setIsVideoEnabled(true);

            // Add local stream to view state
            setVideoStreams(prev => [
                ...prev.filter(v => v.id !== 'local'),
                {
                    id: 'local',
                    displayName: `${usernameRef.current} (You)`,
                    stream: stream,
                    isMuted: true
                }
            ]);

            // Notify other participants we joined the call
            participantsRef.current.forEach(p => {
                if (p.sessionId !== mySessionIdRef.current) {
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
    };

    const stopLocalCall = () => {
        setIsInCall(false);
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        setVideoStreams([]);

        // Close peer connections
        Object.keys(peersRef.current).forEach(id => {
            closePeerConnection(id);
        });

        // Notify others we left
        participantsRef.current.forEach(p => {
            if (p.sessionId !== mySessionIdRef.current) {
                sendMessage({
                    type: 'RTC_SIGNAL',
                    target: p.sessionId,
                    signal: { type: 'leave' }
                });
            }
        });
    };

    const toggleAudio = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioEnabled(audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoEnabled(videoTrack.enabled);
            }
        }
    };

    const handleRtcSignalPayload = (senderId, senderName, signal) => {
        if (!isInCallRef.current) return;
        
        if (signal.type === 'ready') {
            if (mySessionIdRef.current > senderId) {
                initiatePeerConnection(senderId, senderName);
            }
        } else if (signal.type === 'offer') {
            respondToOffer(senderId, senderName, signal.sdp);
        } else if (signal.type === 'answer') {
            const pc = peersRef.current[senderId];
            if (pc) {
                pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            }
        } else if (signal.type === 'candidate') {
            const pc = peersRef.current[senderId];
            if (pc && signal.candidate) {
                pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => {
                    console.error("Error adding Ice Candidate", e);
                });
            }
        } else if (signal.type === 'leave') {
            closePeerConnection(senderId);
        }
    };

    const initiatePeerConnection = async (targetId, targetName) => {
        if (peersRef.current[targetId]) return;
        
        const pc = createBasePeerConnection(targetId, targetName);
        peersRef.current[targetId] = pc;
        
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
    };

    const respondToOffer = async (senderId, senderName, remoteSdp) => {
        if (peersRef.current[senderId]) {
            closePeerConnection(senderId);
        }
        
        const pc = createBasePeerConnection(senderId, senderName);
        peersRef.current[senderId] = pc;
        
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
    };

    const createBasePeerConnection = (peerId, peerName) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }
        
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
        
        pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            setVideoStreams(prev => {
                const filtered = prev.filter(v => v.id !== peerId);
                return [...filtered, {
                    id: peerId,
                    displayName: peerName,
                    stream: remoteStream,
                    isMuted: false
                }];
            });
        };
        
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                closePeerConnection(peerId);
            }
        };
        
        return pc;
    };

    const closePeerConnection = (peerId) => {
        const pc = peersRef.current[peerId];
        if (pc) {
            pc.close();
            delete peersRef.current[peerId];
        }
        setVideoStreams(prev => prev.filter(v => v.id !== peerId));
    };

    return (
        <div style={{ height: '100%' }}>
            {screen === 'landing' ? (
                <LandingScreen 
                    onJoinRoom={handleJoinRoom} 
                    onCreateRoom={handleCreateRoom} 
                />
            ) : (
                <WorkspaceScreen 
                    roomCode={roomCode}
                    username={username}
                    connectionStatus={connectionStatus}
                    participants={participants}
                    chatMessages={chatMessages}
                    unreadChatCount={unreadChatCount}
                    setUnreadChatCount={setUnreadChatCount}
                    files={files}
                    activeFile={activeFile}
                    onActiveFileChange={handleActiveFileChange}
                    onFileCreate={handleFileCreate}
                    onFileDelete={handleFileDelete}
                    onFileRename={handleFileRename}
                    onLanguageChange={handleLanguageChange}
                    onUploadFile={handleUploadFile}
                    onDownloadFile={handleDownloadFile}
                    onLeaveRoom={handleLeaveRoom}
                    onSendChatMessage={handleSendChatMessage}
                    
                    editorComponentRef={editorComponentRef}
                    onCodeChange={handleCodeChange}
                    onCursorChange={handleCursorChange}

                    isInCall={isInCall}
                    isAudioEnabled={isAudioEnabled}
                    isVideoEnabled={isVideoEnabled}
                    onJoinVideoCall={startLocalCall}
                    onLeaveVideoCall={stopLocalCall}
                    onToggleAudio={toggleAudio}
                    onToggleVideo={toggleVideo}
                    videoStreams={videoStreams}
                />
            )}
        </div>
    );
}
