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
        
        // Delay open and fit to ensure React has fully mounted and layout is calculated
        setTimeout(() => {
            if (terminalRef.current) {
                term.open(terminalRef.current);
                try {
                    if (terminalRef.current.clientWidth > 0) {
                        fitAddon.fit();
                    }
                } catch (e) {}
            }
        }, 50);
        
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        let ws;
        const connectTimeout = setTimeout(() => {
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                term.writeln('\x1b[32m--- Terminal Connected ---\x1b[0m');
            };

            ws.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    term.write(event.data);
                } else {
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
        }, 100);

        const handleResize = () => {
            try {
                if (terminalRef.current && terminalRef.current.clientWidth > 0) {
                    fitAddon.fit();
                }
            } catch (e) {}
        };
        window.addEventListener('resize', handleResize);

        // Also fit after a short delay in case container sizing finishes late
        setTimeout(handleResize, 100);

        return () => {
            clearTimeout(connectTimeout);
            window.removeEventListener('resize', handleResize);
            if (ws) {
                ws.close();
            }
            term.dispose();
        };
    }, [wsUrl]);

    return (
        <div ref={terminalRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}></div>
    );
});

export default TerminalWorkspace;
