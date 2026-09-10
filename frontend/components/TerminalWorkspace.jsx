import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const TerminalWorkspace = forwardRef(({ wsUrl }, ref) => {
    const terminalRef = useRef(null);
    const wsRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);

    useImperativeHandle(ref, () => ({
        write: (data) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(data);
            }
        }
    }));

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            theme: { background: '#0b0c10', foreground: '#f3f4f6' },
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            fontSize: 14,
            cursorBlink: true
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        
        term.open(terminalRef.current);
        fitAddon.fit();
        
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            term.writeln('\x1b[32m--- Terminal Connected ---\x1b[0m');
        };

        ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
                term.write(event.data);
            } else {
                // If it's a blob, convert to string
                event.data.text().then(text => term.write(text));
            }
        };

        ws.onclose = () => {
            term.writeln('\x1b[31m--- Terminal Disconnected ---\x1b[0m');
        };

        term.onData(data => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        // Also fit after a short delay in case container sizing finishes late
        setTimeout(() => fitAddon.fit(), 100);

        return () => {
            window.removeEventListener('resize', handleResize);
            ws.close();
            term.dispose();
        };
    }, [wsUrl]);

    return (
        <div ref={terminalRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}></div>
    );
});

export default TerminalWorkspace;
