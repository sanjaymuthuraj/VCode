package com.vcode.backend.model;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class Room {
    private String roomCode;
    private Map<String, FileInfo> files = new ConcurrentHashMap<>();
    private Map<String, Participant> participants = new ConcurrentHashMap<>();

    public Room(String roomCode) {
        this.roomCode = roomCode;
        this.files.put("main.js", new FileInfo("// Start typing collaborative code here...\n", "javascript"));
    }

    public String getRoomCode() {
        return roomCode;
    }

    public Map<String, FileInfo> getFiles() {
        return files;
    }

    public Map<String, Participant> getParticipants() {
        return participants;
    }

    public static class Participant {
        private String sessionId;
        private String username;
        private String activeFile = "main.js";
        private CursorPosition cursorPosition;

        public Participant(String sessionId, String username) {
            this.sessionId = sessionId;
            this.username = username;
        }

        public String getSessionId() {
            return sessionId;
        }

        public String getUsername() {
            return username;
        }

        public String getActiveFile() {
            return activeFile;
        }

        public void setActiveFile(String activeFile) {
            this.activeFile = activeFile;
        }

        public CursorPosition getCursorPosition() {
            return cursorPosition;
        }

        public void setCursorPosition(CursorPosition cursorPosition) {
            this.cursorPosition = cursorPosition;
        }
    }

    public static class CursorPosition {
        private int lineNumber;
        private int column;

        public int getLineNumber() {
            return lineNumber;
        }

        public void setLineNumber(int lineNumber) {
            this.lineNumber = lineNumber;
        }

        public int getColumn() {
            return column;
        }

        public void setColumn(int column) {
            this.column = column;
        }
    }

    public static class FileInfo {
        private String content;
        private String language;

        public FileInfo() {}

        public FileInfo(String content, String language) {
            this.content = content;
            this.language = language;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }

        public String getLanguage() {
            return language;
        }

        public void setLanguage(String language) {
            this.language = language;
        }
    }
}
