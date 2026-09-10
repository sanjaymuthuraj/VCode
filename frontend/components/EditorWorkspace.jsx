import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as monaco from 'monaco-editor';

// Configure Monaco Environment for Webworkers
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        if (label === 'json') return './json.worker.bundle.js';
        if (label === 'css' || label === 'scss' || label === 'less') return './css.worker.bundle.js';
        if (label === 'html' || label === 'handlebars' || label === 'razor') return './html.worker.bundle.js';
        if (label === 'typescript' || label === 'javascript') return './ts.worker.bundle.js';
        return './editor.worker.bundle.js';
    },
};

const EditorWorkspace = forwardRef(({ onCodeChange, onCursorChange, language, settings }, ref) => {
    const containerRef = useRef(null);
    const editorRef = useRef(null);
    const editorModelRef = useRef(null);
    const remoteCursorsRef = useRef({}); // sessionId -> decorationIds array
    const isRemoteUpdatingRef = useRef(false);
    const typingTimeoutRef = useRef(null);

    // Expose control methods to parent component
    useImperativeHandle(ref, () => ({
        setValue(val) {
            if (editorModelRef.current) {
                isRemoteUpdatingRef.current = true;
                const currentSelection = editorRef.current?.getSelection();
                const currentScroll = editorRef.current?.getScrollTop();
                
                editorRef.current?.executeEdits("remote-update", [{
                    range: editorModelRef.current.getFullModelRange(),
                    text: val,
                    forceMoveMarkers: true
                }]);
                
                if (currentSelection) {
                    editorRef.current?.setSelection(currentSelection);
                }
                if (currentScroll !== undefined) {
                    editorRef.current?.setScrollTop(currentScroll);
                }
                isRemoteUpdatingRef.current = false;
            }
        },
        getValue() {
            return editorModelRef.current ? editorModelRef.current.getValue() : '';
        },
        updateRemoteCursor(senderId, senderName, position) {
            if (!editorModelRef.current) return;
            
            // Remove existing decorations
            if (remoteCursorsRef.current[senderId]) {
                editorModelRef.current.deltaDecorations(remoteCursorsRef.current[senderId], []);
            }
            
            if (!position || !Number.isInteger(position.lineNumber) || !Number.isInteger(position.column)
                || position.lineNumber < 1 || position.column < 1) return;
            
            // Add new decorations
            const lineNumber = Math.min(position.lineNumber, editorModelRef.current.getLineCount());
            const column = Math.min(position.column, editorModelRef.current.getLineMaxColumn(lineNumber));
            remoteCursorsRef.current[senderId] = editorModelRef.current.deltaDecorations([], [
                {
                    range: new monaco.Range(lineNumber, column, lineNumber, column),
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
        },
        clearRemoteCursor(senderId) {
            if (editorModelRef.current && remoteCursorsRef.current[senderId]) {
                editorModelRef.current.deltaDecorations(remoteCursorsRef.current[senderId], []);
                delete remoteCursorsRef.current[senderId];
            }
        },
        clearAllRemoteCursors() {
            if (!editorModelRef.current) return;
            Object.keys(remoteCursorsRef.current).forEach(sid => {
                editorModelRef.current.deltaDecorations(remoteCursorsRef.current[sid], []);
            });
            remoteCursorsRef.current = {};
        }
    }));

    // Initialize Monaco Editor
    useEffect(() => {
        if (!containerRef.current) return;

        const editorInstance = monaco.editor.create(containerRef.current, {
            value: '// Start typing collaborative code here...\n',
            language: language || 'javascript',
            theme: settings?.theme || 'vs-dark',
            automaticLayout: true,
            wordWrap: settings?.wordWrap || 'off',
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            fontSize: 14,
            tabSize: 4,
            minimap: { enabled: settings?.minimap || false }
        });

        editorRef.current = editorInstance;
        editorModelRef.current = editorInstance.getModel();

        // Listen for code typing (debounced)
        const didChangeContentListener = editorInstance.onDidChangeModelContent(() => {
            if (isRemoteUpdatingRef.current) return;

            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            typingTimeoutRef.current = setTimeout(() => {
                const val = editorModelRef.current.getValue();
                onCodeChange(val);
            }, 200);
        });

        // Listen for cursor moves
        const didChangeCursorListener = editorInstance.onDidChangeCursorPosition((e) => {
            onCursorChange(e.position);
        });

        return () => {
            didChangeContentListener.dispose();
            didChangeCursorListener.dispose();
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            editorInstance.dispose();
        };
    }, []);

    // Sync language changes from props
    useEffect(() => {
        if (editorModelRef.current && language) {
            monaco.editor.setModelLanguage(editorModelRef.current, language);
        }
    }, [language]);

    // Sync settings changes
    useEffect(() => {
        if (editorRef.current && settings) {
            monaco.editor.setTheme(settings.theme);
            editorRef.current.updateOptions({
                wordWrap: settings.wordWrap,
                minimap: { enabled: settings.minimap }
            });
        }
    }, [settings]);

    return <div id="editor-container" ref={containerRef} style={{ height: '100%', width: '100%' }}></div>;
});

export default EditorWorkspace;
