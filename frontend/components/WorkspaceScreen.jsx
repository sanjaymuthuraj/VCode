import React, { useState, useRef, useEffect } from 'react';
import EditorWorkspace from './EditorWorkspace';
import TerminalWorkspace from './TerminalWorkspace';
import { getTerminalWsUrl } from '../config';


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
    files,
    activeFile,
    onActiveFileChange,
    onFileCreate,
    onFileDelete,
    onFileRename,
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
    const [showSettings, setShowSettings] = useState(false);
    const [editorSettings, setEditorSettings] = useState({
        theme: 'vs-dark',
        wordWrap: 'off',
        minimap: false
    });
    const [isTerminalVisible, setIsTerminalVisible] = useState(true);
    const chatMessagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const terminalComponentRef = useRef(null);

    const terminalWsUrl = getTerminalWsUrl(roomCode);


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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Sidebar Navigation Tabs */}
                <div className="sidebar-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'tab-files' ? 'active' : ''}`}
                        onClick={() => handleTabChange('tab-files')}
                    >
                        <span>Files</span>
                    </button>
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                                    <div style={{display: 'flex', flexDirection: 'column'}}>
                                        <span className="person-name">{p.username}</span>
                                        <span style={{fontSize: '0.65rem', color: 'var(--text-muted)'}}>{p.activeFile || 'main.js'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Panel D: Files Explorer */}
                    <div className={`tab-panel ${activeTab === 'tab-files' ? 'active' : ''}`}>
                        <div className="people-list-container" style={{gap: '4px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 8px'}}>
                                <span style={{fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)'}}>EXPLORER</span>
                                <button className="icon-btn" style={{width: '24px', height: '24px'}} onClick={() => {
                                    const name = prompt("Enter new file name (e.g. script.js):");
                                    if (name && !files[name]) {
                                        let lang = 'plaintext';
                                        if (name.endsWith('.js')) lang = 'javascript';
                                        else if (name.endsWith('.ts')) lang = 'typescript';
                                        else if (name.endsWith('.py')) lang = 'python';
                                        else if (name.endsWith('.html')) lang = 'html';
                                        else if (name.endsWith('.css')) lang = 'css';
                                        else if (name.endsWith('.json')) lang = 'json';
                                        else if (name.endsWith('.java')) lang = 'java';
                                        else if (name.endsWith('.cpp')) lang = 'cpp';
                                        else if (name.endsWith('.md')) lang = 'markdown';
                                        onFileCreate(name, lang);
                                        onActiveFileChange(name);
                                    } else if (files[name]) {
                                        alert("File already exists!");
                                    }
                                }}>+</button>
                            </div>
                            {Object.keys(files).sort().map(filename => (
                                <div key={filename} 
                                    className={`person-item ${activeFile === filename ? 'self' : ''}`}
                                    style={{cursor: 'pointer', display: 'flex', justifyContent: 'space-between'}}
                                    onClick={() => onActiveFileChange(filename)}
                                >
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden'}}>
                                        <span style={{color: 'var(--text-muted)'}}>📄</span>
                                        <span className="person-name" style={{whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'}}>{filename}</span>
                                    </div>
                                    {filename !== 'main.js' && (
                                        <button className="icon-btn danger" style={{width: '20px', height: '20px', padding: 0, flexShrink: 0}} onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Delete ${filename}?`)) {
                                                onFileDelete(filename);
                                            }
                                        }}>×</button>
                                    )}
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
                        <span id="current-file-name">{activeFile}</span>
                        <span className={`status-badge ${connectionStatus.toLowerCase()}`}>
                            {connectionStatus}
                        </span>
                    </div>
                    
                    <div className="header-actions">
                        <button className="btn btn-primary" style={{marginRight: '8px', padding: '4px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px'}} title="Run Code in Terminal" onClick={() => {
                            setIsTerminalVisible(true);
                            // Brief delay if it just got toggled on
                            setTimeout(() => {
                                if (terminalComponentRef.current) {
                                    let cmd = '';
                                    const ext = activeFile.split('.').pop();
                                    if (ext === 'js') cmd = `node ${activeFile}\r\n`;
                                    else if (ext === 'py') cmd = `python ${activeFile}\r\n`;
                                    else if (ext === 'java') cmd = `javac ${activeFile} && java ${activeFile.split('.')[0]}\r\n`;
                                    else if (ext === 'cpp') cmd = `g++ ${activeFile} -o a.out && ./a.out\r\n`;
                                    else cmd = `echo "Cannot run ${activeFile}"\r\n`;
                                    
                                    terminalComponentRef.current.write(cmd);
                                }
                            }, 100);
                        }}>
                            ▶ Run
                        </button>
                        <button className="btn btn-secondary icon-btn" title="Toggle Terminal" onClick={() => setIsTerminalVisible(!isTerminalVisible)}>
                            {isTerminalVisible ? '🖥️' : '⌨️'}
                        </button>
                        <select 
                            className="select-dropdown" 
                            value={files[activeFile]?.language || 'plaintext'}
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

                        <div className="settings-dropdown-container" style={{position: 'relative', display: 'inline-block'}}>
                            <button className="btn btn-secondary icon-btn" title="Editor Settings" onClick={() => setShowSettings(!showSettings)}>
                                ⚙️
                            </button>
                            {showSettings && (
                                <div className="settings-menu" style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                    background: 'var(--bg-card)', border: '1px solid var(--border-color)', 
                                    padding: '12px', borderRadius: '8px', zIndex: 100, 
                                    minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '12px',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)'
                                }}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                        <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Theme</label>
                                        <select className="select-dropdown" style={{padding: '4px 8px'}} value={editorSettings.theme} onChange={(e) => setEditorSettings({...editorSettings, theme: e.target.value})}>
                                            <option value="vs-dark">Dark</option>
                                            <option value="vs">Light</option>
                                            <option value="hc-black">High Contrast</option>
                                        </select>
                                    </div>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                        <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Word Wrap</label>
                                        <input type="checkbox" checked={editorSettings.wordWrap === 'on'} onChange={(e) => setEditorSettings({...editorSettings, wordWrap: e.target.checked ? 'on' : 'off'})} />
                                    </div>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                        <label style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Minimap</label>
                                        <input type="checkbox" checked={editorSettings.minimap} onChange={(e) => setEditorSettings({...editorSettings, minimap: e.target.checked})} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <button className="btn btn-secondary" title="Upload local file to editor" onClick={handleUploadClick}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download
                        </button>
                    </div>
                </header>
                
                <div style={{ flex: 1, position: 'relative' }}>
                    <EditorWorkspace 
                        ref={editorComponentRef}
                        language={files[activeFile]?.language || 'plaintext'}
                        settings={editorSettings}
                        onCodeChange={onCodeChange}
                        onCursorChange={onCursorChange}
                    />
                </div>
                
                {isTerminalVisible && (
                    <div style={{height: '250px', borderTop: '1px solid var(--border-color)', backgroundColor: '#0b0c10', display: 'flex', flexDirection: 'column'}}>
                        <div style={{padding: '4px 12px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-header)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <span>TERMINAL</span>
                            <button className="icon-btn" style={{width: '20px', height: '20px', padding: 0}} onClick={() => setIsTerminalVisible(false)}>×</button>
                        </div>
                        <div style={{flex: 1, padding: '4px'}}>
                            <TerminalWorkspace ref={terminalComponentRef} wsUrl={terminalWsUrl} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
