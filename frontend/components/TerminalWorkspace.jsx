import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const TerminalWorkspace = forwardRef(({ wsUrl, onStatusChange }, ref) => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const wsRef = useRef(null);
    const pendingInputRef = useRef([]);
    const [connectionId, setConnectionId] = useState(0);

    useImperativeHandle(ref, () => ({
        write(data) {
            const socket = wsRef.current;
            if (socket?.readyState === WebSocket.OPEN) {
                socket.send(data);
            } else {
                pendingInputRef.current.push(data);
            }
        },
        reconnect() {
            setConnectionId(value => value + 1);
        },
        clear() {
            xtermRef.current?.clear();
        }
    }), []);

    useEffect(() => {
        if (!terminalRef.current) return;

        let disposed = false;
        const term = new Terminal({
            theme: { background: '#0b0c10', foreground: '#f3f4f6', cursor: '#a5b4fc' },
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            fontSize: 14,
            cursorBlink: true,
            scrollback: 5_000
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        xtermRef.current = term;

        const fit = () => {
            if (!disposed && terminalRef.current?.clientWidth > 0 && terminalRef.current?.clientHeight > 0) {
                try { fitAddon.fit(); } catch { /* hidden panels can report incomplete dimensions */ }
            }
        };
        const resizeObserver = new ResizeObserver(fit);
        resizeObserver.observe(terminalRef.current);
        const initialFit = setTimeout(fit, 0);

        const sendOrQueue = (data) => {
            const socket = wsRef.current;
            if (socket?.readyState === WebSocket.OPEN) socket.send(data);
            else pendingInputRef.current.push(data);
        };
        const inputListener = term.onData(sendOrQueue);
        term.attachCustomKeyEventHandler((event) => {
            if (event.type !== 'keydown') return true;

            if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
                const selection = term.getSelection();
                if (selection) navigator.clipboard?.writeText(selection).catch(() => {});
                return false;
            }
            if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
                navigator.clipboard?.readText().then(text => {
                    if (text) sendOrQueue(text.replace(/\r?\n/g, '\r'));
                }).catch(() => {});
                return false;
            }
            if (event.ctrlKey && event.code === 'KeyL') {
                term.clear();
                return false;
            }
            return true;
        });

        onStatusChange?.('Connecting');
        let socket;
        try {
            socket = new WebSocket(wsUrl);
            wsRef.current = socket;
        } catch {
            term.writeln('\x1b[31mUnable to create a terminal connection.\x1b[0m');
            onStatusChange?.('Disconnected');
        }

        if (socket) {
            socket.onopen = () => {
                if (disposed) return;
                onStatusChange?.('Connected');
                term.writeln('\x1b[32m● Connected\x1b[0m  Type a command and press Enter.  \x1b[90mCtrl+L clear · Ctrl+Shift+C/V copy/paste\x1b[0m');
                const queuedInput = pendingInputRef.current.splice(0);
                queuedInput.forEach(data => socket.send(data));
                term.focus();
            };
            socket.onmessage = async (event) => {
                if (disposed) return;
                term.write(typeof event.data === 'string' ? event.data : await event.data.text());
            };
            socket.onerror = () => onStatusChange?.('Disconnected');
            socket.onclose = () => {
                if (!disposed) {
                    onStatusChange?.('Disconnected');
                    term.writeln('\r\n\x1b[31m● Disconnected. Use reconnect to start a new shell.\x1b[0m');
                }
            };
        }

        return () => {
            disposed = true;
            clearTimeout(initialFit);
            resizeObserver.disconnect();
            inputListener.dispose();
            if (wsRef.current === socket) wsRef.current = null;
            socket?.close();
            if (xtermRef.current === term) xtermRef.current = null;
            term.dispose();
        };
    }, [wsUrl, connectionId, onStatusChange]);

    return <div ref={terminalRef} className="terminal-workspace" />;
});

export default TerminalWorkspace;
