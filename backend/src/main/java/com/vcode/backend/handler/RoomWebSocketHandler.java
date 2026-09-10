package com.vcode.backend.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vcode.backend.model.Room;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Component
public class RoomWebSocketHandler extends TextWebSocketHandler {

    private static final Pattern ROOM_CODE_PATTERN = Pattern.compile("[A-Z0-9]{6}");
    private static final Pattern FILE_NAME_PATTERN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._ -]{0,127}");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, String> sessionToRoomCode = new ConcurrentHashMap<>();

    // Expose rooms map for REST Controller
    public Map<String, Room> getRooms() {
        return rooms;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.put(session.getId(), session);
    }

    @Override
    @SuppressWarnings("unchecked")
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        Map<String, Object> msgData = objectMapper.readValue(payload, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

        String type = stringValue(msgData.get("type"));
        if (type == null) return;

        switch (type) {
            case "JOIN":
                handleJoin(session, msgData);
                break;
            case "CHAT":
                handleChat(session, msgData);
                break;
            case "CODE_UPDATE":
                handleCodeUpdate(session, msgData);
                break;
            case "LANGUAGE_UPDATE":
                handleLanguageUpdate(session, msgData);
                break;
            case "CURSOR_UPDATE":
                handleCursorUpdate(session, msgData);
                break;
            case "RTC_SIGNAL":
                handleRtcSignal(session, msgData);
                break;
            case "SWITCH_FILE":
                handleSwitchFile(session, msgData);
                break;
            case "FILE_CREATE":
                handleFileCreate(session, msgData);
                break;
            case "FILE_DELETE":
                handleFileDelete(session, msgData);
                break;
            case "FILE_RENAME":
                handleFileRename(session, msgData);
                break;
            default:
                System.out.println("Unknown websocket message type: " + type);
        }
    }

    private void handleJoin(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = stringValue(msgData.get("roomCode"));
        String username = stringValue(msgData.get("username"));

        if (roomCode == null || username == null) return;

        // Clean room code to be case insensitive and trimmed
        roomCode = roomCode.trim().toUpperCase();
        username = username.trim();
        if (!ROOM_CODE_PATTERN.matcher(roomCode).matches() || username.isEmpty() || username.length() > 15) return;

        String previousRoomCode = sessionToRoomCode.put(session.getId(), roomCode);
        if (previousRoomCode != null && !previousRoomCode.equals(roomCode)) {
            removeParticipant(session.getId(), previousRoomCode);
        }

        // Retrieve or create room
        Room room = rooms.computeIfAbsent(roomCode, Room::new);

        // Add participant
        Room.Participant participant = new Room.Participant(session.getId(), username);
        room.getParticipants().put(session.getId(), participant);

        // 1. Send current room state to the newly joined client
        Map<String, Object> stateMsg = new HashMap<>();
        stateMsg.put("type", "ROOM_STATE");
        stateMsg.put("roomCode", room.getRoomCode());
        stateMsg.put("files", room.getFiles());
        stateMsg.put("yourSessionId", session.getId());

        List<Map<String, String>> participantList = new ArrayList<>();
        for (Room.Participant p : room.getParticipants().values()) {
            Map<String, String> pMap = new HashMap<>();
            pMap.put("sessionId", p.getSessionId());
            pMap.put("username", p.getUsername());
            pMap.put("activeFile", p.getActiveFile());
            participantList.add(pMap);
        }
        stateMsg.put("participants", participantList);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(stateMsg)));

        // 2. Broadcast updated user list to all participants in this room
        broadcastUserList(roomCode);

        // 3. Broadcast join system notification to chat
        broadcastSystemMessage(roomCode, "User '" + username + "' has joined the room.");
    }

    private void handleChat(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;

        Room room = rooms.get(roomCode);
        if (room == null) return;

        Room.Participant p = room.getParticipants().get(session.getId());
        if (p == null) return;

        String chatText = stringValue(msgData.get("message"));
        if (chatText == null || chatText.isBlank() || chatText.length() > 4_000) return;

        Map<String, Object> chatMsg = new HashMap<>();
        chatMsg.put("type", "CHAT");
        chatMsg.put("sender", p.getUsername());
        chatMsg.put("senderId", p.getSessionId());
        chatMsg.put("message", chatText);

        broadcastToRoom(roomCode, chatMsg, null);
    }

    private void handleCodeUpdate(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;

        Room room = rooms.get(roomCode);
        if (room == null) return;

        String filename = stringValue(msgData.get("filename"));
        String code = stringValue(msgData.get("code"));
        if (!isValidFileName(filename) || code == null || code.length() > 1_000_000) return;
        
        Room.FileInfo file = room.getFiles().get(filename);
        if (file != null) {
            file.setContent(code);
            syncToDisk(roomCode, filename, code);
        }

        Map<String, Object> updateMsg = new HashMap<>();
        updateMsg.put("type", "CODE_UPDATE");
        updateMsg.put("filename", filename);
        updateMsg.put("code", code);
        updateMsg.put("senderId", session.getId());

        // Broadcast to all other sessions (exclude sender)
        broadcastToRoom(roomCode, updateMsg, session.getId());
    }

    private void handleLanguageUpdate(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;

        Room room = rooms.get(roomCode);
        if (room == null) return;

        String filename = stringValue(msgData.get("filename"));
        String language = stringValue(msgData.get("language"));
        if (!isValidFileName(filename) || language == null || language.length() > 32) return;
        
        Room.FileInfo file = room.getFiles().get(filename);
        if (file != null) {
            file.setLanguage(language);
        }

        Map<String, Object> updateMsg = new HashMap<>();
        updateMsg.put("type", "LANGUAGE_UPDATE");
        updateMsg.put("filename", filename);
        updateMsg.put("language", language);

        broadcastToRoom(roomCode, updateMsg, null);
    }

    @SuppressWarnings("unchecked")
    private void handleCursorUpdate(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;

        Room room = rooms.get(roomCode);
        if (room == null) return;

        Room.Participant p = room.getParticipants().get(session.getId());
        if (p == null) return;

        Map<String, Object> posMap = (Map<String, Object>) msgData.get("position");
        if (posMap == null) return;

        Number lineNumber = (Number) posMap.get("lineNumber");
        Number column = (Number) posMap.get("column");
        if (lineNumber == null || column == null || lineNumber.intValue() < 1 || column.intValue() < 1) return;
        Room.CursorPosition pos = new Room.CursorPosition();
        pos.setLineNumber(lineNumber.intValue());
        pos.setColumn(column.intValue());
        p.setCursorPosition(pos);

        Map<String, Object> cursorMsg = new HashMap<>();
        cursorMsg.put("type", "CURSOR_UPDATE");
        cursorMsg.put("sessionId", p.getSessionId());
        cursorMsg.put("username", p.getUsername());
        cursorMsg.put("filename", p.getActiveFile());
        cursorMsg.put("position", pos);

        // Broadcast cursor to other room members
        broadcastToRoom(roomCode, cursorMsg, session.getId());
    }
    
    private void handleSwitchFile(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;
        Room room = rooms.get(roomCode);
        if (room == null) return;
        Room.Participant p = room.getParticipants().get(session.getId());
        if (p == null) return;
        
        String filename = stringValue(msgData.get("filename"));
        if (!isValidFileName(filename) || !room.getFiles().containsKey(filename)) return;
        p.setActiveFile(filename);
        broadcastUserList(roomCode);
    }
    
    private void handleFileCreate(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;
        Room room = rooms.get(roomCode);
        if (room == null) return;
        
        String filename = stringValue(msgData.get("filename"));
        String content = stringValue(msgData.get("content"));
        if (content == null) content = "";
        String language = stringValue(msgData.get("language"));
        if (language == null) language = "plaintext";
        if (!isValidFileName(filename) || content.length() > 1_000_000 || language.length() > 32) return;
        
        room.getFiles().putIfAbsent(filename, new Room.FileInfo(content, language));
        syncToDisk(roomCode, filename, content);
        
        Map<String, Object> msg = new HashMap<>();
        msg.put("type", "FILE_CREATE");
        msg.put("filename", filename);
        msg.put("file", room.getFiles().get(filename));
        broadcastToRoom(roomCode, msg, null);
    }
    
    private void handleFileDelete(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;
        Room room = rooms.get(roomCode);
        if (room == null) return;
        
        String filename = stringValue(msgData.get("filename"));
        if (!isValidFileName(filename) || "main.js".equals(filename)) return; // Don't delete root file
        if (room.getFiles().remove(filename) == null) return;
        deleteFromDisk(roomCode, filename);
        
        Map<String, Object> msg = new HashMap<>();
        msg.put("type", "FILE_DELETE");
        msg.put("filename", filename);
        broadcastToRoom(roomCode, msg, null);
    }
    
    private void handleFileRename(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;
        Room room = rooms.get(roomCode);
        if (room == null) return;
        
        String oldName = stringValue(msgData.get("oldName"));
        String newName = stringValue(msgData.get("newName"));
        if (!isValidFileName(oldName) || !isValidFileName(newName) || "main.js".equals(oldName)
                || room.getFiles().containsKey(newName)) return; // Don't rename root file or overwrite a file
        
        Room.FileInfo file = room.getFiles().remove(oldName);
        if (file != null) {
            room.getFiles().put(newName, file);
            moveOnDisk(roomCode, oldName, newName);
            Map<String, Object> msg = new HashMap<>();
            msg.put("type", "FILE_RENAME");
            msg.put("oldName", oldName);
            msg.put("newName", newName);
            broadcastToRoom(roomCode, msg, null);
        }
    }

    private void handleRtcSignal(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String targetSessionId = (String) msgData.get("target");
        if (targetSessionId == null) return;

        WebSocketSession targetSession = sessions.get(targetSessionId);
        if (targetSession != null && targetSession.isOpen()) {
            String roomCode = sessionToRoomCode.get(session.getId());
            if (roomCode == null) return;

            Room room = rooms.get(roomCode);
            if (room == null) return;
            if (!room.getParticipants().containsKey(targetSessionId)) return;

            Room.Participant sender = room.getParticipants().get(session.getId());
            String senderName = (sender != null) ? sender.getUsername() : "Unknown";

            Map<String, Object> signalMsg = new HashMap<>();
            signalMsg.put("type", "RTC_SIGNAL");
            signalMsg.put("senderId", session.getId());
            signalMsg.put("senderName", senderName);
            signalMsg.put("signal", msgData.get("signal"));

            targetSession.sendMessage(new TextMessage(objectMapper.writeValueAsString(signalMsg)));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();
        sessions.remove(sessionId);

        String roomCode = sessionToRoomCode.remove(sessionId);
        if (roomCode != null) {
            Room room = rooms.get(roomCode);
            if (room != null) {
                Room.Participant p = room.getParticipants().remove(sessionId);
                String username = (p != null) ? p.getUsername() : "Someone";

                // Notify others that participant left
                broadcastUserList(roomCode);
                broadcastSystemMessage(roomCode, "User '" + username + "' has left the room.");

                // If room is empty, clean it up
                if (room.getParticipants().isEmpty()) {
                    rooms.remove(roomCode);
                }
            }
        }
    }

    // Helper to send message to room members
    private void broadcastToRoom(String roomCode, Map<String, Object> message, String excludeSessionId) throws IOException {
        Room room = rooms.get(roomCode);
        if (room == null) return;

        String payload = objectMapper.writeValueAsString(message);
        TextMessage textMessage = new TextMessage(payload);

        for (String sessId : room.getParticipants().keySet()) {
            if (sessId.equals(excludeSessionId)) continue;
            WebSocketSession session = sessions.get(sessId);
            if (session != null && session.isOpen()) {
                session.sendMessage(textMessage);
            }
        }
    }

    private void syncToDisk(String roomCode, String filename, String content) {
        try {
            Path roomDir = Paths.get(System.getProperty("java.io.tmpdir"), "vcode_rooms", roomCode);
            Files.createDirectories(roomDir);
            Files.writeString(roomDir.resolve(filename).normalize(), content != null ? content : "");
        } catch (IOException e) {
            System.err.println("Failed to sync file to disk: " + e.getMessage());
        }
    }

    private void deleteFromDisk(String roomCode, String filename) {
        try {
            Files.deleteIfExists(Paths.get(System.getProperty("java.io.tmpdir"), "vcode_rooms", roomCode, filename));
        } catch (IOException e) {
            System.err.println("Failed to delete file from disk: " + e.getMessage());
        }
    }

    private void moveOnDisk(String roomCode, String oldName, String newName) {
        try {
            Path roomDir = Paths.get(System.getProperty("java.io.tmpdir"), "vcode_rooms", roomCode);
            Path source = roomDir.resolve(oldName);
            if (Files.exists(source)) Files.move(source, roomDir.resolve(newName));
        } catch (IOException e) {
            System.err.println("Failed to rename file on disk: " + e.getMessage());
        }
    }

    private boolean isValidFileName(String filename) {
        return filename != null && !filename.equals(".") && !filename.equals("..")
                && FILE_NAME_PATTERN.matcher(filename).matches();
    }

    private String stringValue(Object value) {
        return value instanceof String ? (String) value : null;
    }

    private void removeParticipant(String sessionId, String roomCode) throws IOException {
        Room room = rooms.get(roomCode);
        if (room == null) return;
        room.getParticipants().remove(sessionId);
        if (room.getParticipants().isEmpty()) rooms.remove(roomCode, room);
        else broadcastUserList(roomCode);
    }

    private void broadcastUserList(String roomCode) throws IOException {
        Room room = rooms.get(roomCode);
        if (room == null) return;

        List<Map<String, String>> participantList = new ArrayList<>();
        for (Room.Participant p : room.getParticipants().values()) {
            Map<String, String> pMap = new HashMap<>();
            pMap.put("sessionId", p.getSessionId());
            pMap.put("username", p.getUsername());
            pMap.put("activeFile", p.getActiveFile());
            participantList.add(pMap);
        }

        Map<String, Object> updateMsg = new HashMap<>();
        updateMsg.put("type", "USER_LIST_UPDATE");
        updateMsg.put("participants", participantList);

        broadcastToRoom(roomCode, updateMsg, null);
    }

    private void broadcastSystemMessage(String roomCode, String text) throws IOException {
        Map<String, Object> sysMsg = new HashMap<>();
        sysMsg.put("type", "CHAT");
        sysMsg.put("sender", "System");
        sysMsg.put("senderId", "system");
        sysMsg.put("message", text);
        broadcastToRoom(roomCode, sysMsg, null);
    }
}
