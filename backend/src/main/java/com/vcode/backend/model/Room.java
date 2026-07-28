package com.vcode.backend.model;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class Room {
    private String roomCode;
    private String codeContent = "// Start typing collaborative code here...\n";
    private String language = "javascript";
    private Map<String, Participant> participants = new ConcurrentHashMap<>();

    public Room(String roomCode) {
        this.roomCode = roomCode;
    }

    public String getRoomCode() {
        return roomCode;
    }

    public String getCodeContent() {
        return codeContent;
    }

    public void setCodeContent(String codeContent) {
        this.codeContent = codeContent;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public Map<String, Participant> getParticipants() {
        return participants;
    }

    public static class Participant {
        private String sessionId;
        private String username;
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
}
