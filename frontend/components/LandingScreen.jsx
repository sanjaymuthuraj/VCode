import React, { useState } from 'react';

export default function LandingScreen({ onJoinRoom, onCreateRoom }) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');

    const handleJoin = () => {
        const trimmedName = name.trim();
        const trimmedCode = code.trim().toUpperCase();

        if (!trimmedName) {
            alert("Please enter your display name.");
            return;
        }
        if (!trimmedCode) {
            alert("Please enter a Room Code.");
            return;
        }
        onJoinRoom(trimmedName, trimmedCode);
    };

    const handleCreate = () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            alert("Please enter your display name.");
            return;
        }
        onCreateRoom(trimmedName);
    };

    return (
        <div className="landing-container">
            <div className="landing-card">
                <div className="landing-header">
                    <span className="landing-logo-icon">⚡</span>
                    <h1>VCode Collaborative</h1>
                    <p>Real-time group coding, chat, and video calls in your browser.</p>
                </div>
                
                <div className="landing-form">
                    <div className="form-group">
                        <label htmlFor="username-input">Your Display Name</label>
                        <input 
                            type="text" 
                            id="username-input" 
                            placeholder="e.g. Alice" 
                            autoComplete="off" 
                            maxLength={15}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="room-actions">
                        <section className="room-action-box join-room-box">
                            <div className="room-action-heading">
                                <span aria-hidden="true">↗</span>
                                <div>
                                    <h2>Join a Room</h2>
                                    <p>Enter a code from a teammate.</p>
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="room-code-input">Room Code</label>
                                <input
                                    type="text"
                                    id="room-code-input"
                                    placeholder="e.g. AB12XY"
                                    autoComplete="off"
                                    style={{ textTransform: 'uppercase' }}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                />
                            </div>
                            <button id="join-room-btn" className="btn btn-primary btn-block" onClick={handleJoin}>
                                Join Room
                            </button>
                        </section>

                        <section className="room-action-box create-room-box">
                            <div className="room-action-heading">
                                <span aria-hidden="true">+</span>
                                <div>
                                    <h2>Create a Room</h2>
                                    <p>Start a new space and invite your team.</p>
                                </div>
                            </div>
                            <button id="create-room-btn" className="btn btn-secondary btn-block" onClick={handleCreate}>
                                Create New Room
                            </button>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
