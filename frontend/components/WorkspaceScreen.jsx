import React, { useState, useRef, useEffect } from 'react';
import EditorWorkspace from './EditorWorkspace';

// Subcomponent to display video frame reactively
function VideoFrame({ id, displayName, stream, isMuted }) {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div id={`video-box-${id}`} className="video-box">
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted={isMuted} 
            />
            <div className="video-label">{displayName}</div>
        </div>
    );
}

export default function WorkspaceScreen({
    roomCode,
    username,
    connectionStatus,
    participants,
    chatMessages,
    unreadChatCount,
    setUnreadChatCount,
    language,
    onLanguageChange,
    onUploadFile,
    onDownloadFile,
    onLeaveRoom,
    onSendChatMessage,
    
    // Editor Ref
    editorComponentRef,
    onCodeChange,
    onCursorChange,

    // WebRTC properties
    isInCall,
    isAudioEnabled,
    isVideoEnabled,
    onJoinVideoCall,
    onLeaveVideoCall,
    onToggleAudio,
    onToggleVideo,
    videoStreams
}) {
    const [activeTab, setActiveTab] = useState('tab-chat');
    const [chatInput, setChatInput] = useState('');
    const chatMessagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Scroll chat messages to bottom on new messages
    useEffect(() => {
        if (chatMessagesEndRef.current) {
            chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages]);

    // Handle tab change
    const handleTabChange = (tabName) => {
        setActiveTab(tabName);
        if (tabName === 'tab-chat') {
            setUnreadChatCount(0);
        }
    };

    // Chat submit
    const handleChatSend = () => {
        const trimmed = chatInput.trim();
        if (trimmed) {
            onSendChatMessage(trimmed);
            setChatInput('');
        }
    };

    const handleChatKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleChatSend();
        }
    };

    // File Upload
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
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

            onUploadFile(text, lang);
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input element
    };

    // Copy room code
    const handleCopyCode = () => {
        navigator.clipboard.writeText(roomCode).then(() => {
            alert("Room Code copied to clipboard: " + roomCode);
        }).catch(err => {
            console.error("Failed to copy", err);
        });
    };

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="app-logo">
                        <span className="logo-icon">⚡</span>
                        <span className="logo-text">VCode</span>
                    </div>
                    <div className="room-code-badge">
                        <span>{roomCode || '------'}</span>
                        <button className="icon-btn" title="Copy Room Code" onClick={handleCopyCode}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Sidebar Navigation Tabs */}
                <div className="sidebar-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'tab-chat' ? 'active' : ''}`}
                        onClick={() => handleTabChange('tab-chat')}
                    >
                        <span>Chat</span>
                        <span className={`badge ${unreadChatCount === 0 ? 'hidden' : ''}`}>
                            {unreadChatCount}
                        </span>
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'tab-video' ? 'active' : ''}`}
                        onClick={() => handleTabChange('tab-video')}
                    >
                        <span>Video</span>
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'tab-people' ? 'active' : ''}`}
                        onClick={() => handleTabChange('tab-people')}
                    >
                        <span>People</span>
                        <span className="badge">{participants.length}</span>
                    </button>
                </div>

                {/* Sidebar Content Panels */}
                <div className="sidebar-content">
                    {/* Panel A: Chat */}
                    <div className={`tab-panel ${activeTab === 'tab-chat' ? 'active' : ''}`}>
                        <div className="chat-messages-container">
                            {chatMessages.map((msg, i) => {
                                const isSelf = msg.senderId === msg.mySessionId;
                                const isSystem = msg.senderId === 'system';
                                return (
                                    <div key={i} className={`chat-bubble ${isSystem ? 'system' : isSelf ? 'self' : 'other'}`}>
                                        {!isSystem && <span className="chat-sender">{msg.sender}</span>}
                                        <span>{msg.message}</span>
                                    </div>
                                );
                            })}
                            <div ref={chatMessagesEndRef} />
                        </div>
                        <div className="chat-input-bar">
                            <input 
                                type="text" 
                                placeholder="Type a message..." 
                                autoComplete="off"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={handleChatKeyDown}
                            />
                            <button className="btn btn-primary icon-btn" onClick={handleChatSend}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Panel B: Video Streams Grid */}
                    <div className={`tab-panel ${activeTab === 'tab-video' ? 'active' : ''}`}>
                        <div className="video-controls-header">
                            {!isInCall ? (
                                <button className="btn btn-primary btn-block" onClick={onJoinVideoCall}>
                                    Join Video Call
                                </button>
                            ) : (
                                <div className="call-actions-row">
                                    <button 
                                        className={`icon-btn ${isAudioEnabled ? 'active' : ''}`} 
                                        title="Mute/Unmute Mic"
                                        onClick={onToggleAudio}
                                    >
                                        {isAudioEnabled ? '🎤' : '🔇'}
                                    </button>
                                    <button 
                                        className={`icon-btn ${isVideoEnabled ? 'active' : ''}`} 
                                        title="Start/Stop Video"
                                        onClick={onToggleVideo}
                                    >
                                        {isVideoEnabled ? '📷' : '❌📷'}
                                    </button>
                                    <button 
                                        className="icon-btn danger" 
                                        title="Leave Video Call"
                                        onClick={onLeaveVideoCall}
                                    >
                                        ❌
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="video-grid">
                            {videoStreams.map(v => (
                                <VideoFrame 
                                    key={v.id} 
                                    id={v.id} 
                                    displayName={v.displayName} 
                                    stream={v.stream} 
                                    isMuted={v.isMuted} 
                                />
                            ))}
                        </div>
                    </div>

                    {/* Panel C: Participants List */}
                    <div className={`tab-panel ${activeTab === 'tab-people' ? 'active' : ''}`}>
                        <div className="people-list-container">
                            {participants.map(p => (
                                <div key={p.sessionId} className={`person-item ${p.isSelf ? 'self' : ''}`}>
                                    <span className="status-dot"></span>
                                    <span className="person-name">{p.username}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                
                <div className="sidebar-footer">
                    <button className="btn btn-danger btn-block" onClick={onLeaveRoom}>
                        Leave Room
                    </button>
                </div>
            </aside>
            
            <main className="main-content">
                <header className="editor-header">
                    <div className="editor-title-row">
                        <span className="file-icon">📄</span>
                        <span id="current-file-name">shared_workspace</span>
                        <span className={`status-badge ${connectionStatus.toLowerCase()}`}>
                            {connectionStatus}
                        </span>
                    </div>
                    
                    <div className="header-actions">
                        <select 
                            className="select-dropdown" 
                            value={language}
                            onChange={(e) => onLanguageChange(e.target.value)}
                        >
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                            <option value="html">HTML</option>
                            <option value="css">CSS</option>
                            <option value="json">JSON</option>
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                            <option value="cpp">C++</option>
                            <option value="markdown">Markdown</option>
                            <option value="plaintext">Plain Text</option>
                        </select>

                        <button className="btn btn-secondary" title="Upload local file to editor" onClick={handleUploadClick}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            Upload
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden" 
                            accept=".txt,.js,.ts,.html,.css,.json,.py,.java,.cpp,.md"
                            onChange={handleFileChange}
                        />

                        <button className="btn btn-primary" title="Download current code" onClick={onDownloadFile}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download
                        </button>
                    </div>
                </header>
                
                <EditorWorkspace 
                    ref={editorComponentRef}
                    language={language}
                    onCodeChange={onCodeChange}
                    onCursorChange={onCursorChange}
                />
            </main>
        </div>
    );
}
