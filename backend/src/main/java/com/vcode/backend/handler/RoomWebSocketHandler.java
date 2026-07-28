package com.vcode.backend.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vcode.backend.model.Room;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RoomWebSocketHandler extends TextWebSocketHandler {

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
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        Map<String, Object> msgData = objectMapper.readValue(payload, HashMap.class);

        String type = (String) msgData.get("type");
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
            default:
                System.out.println("Unknown websocket message type: " + type);
        }
    }

    private void handleJoin(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = (String) msgData.get("roomCode");
        String username = (String) msgData.get("username");

        if (roomCode == null || username == null) return;

        // Clean room code to be case insensitive and trimmed
        roomCode = roomCode.trim().toUpperCase();

        sessionToRoomCode.put(session.getId(), roomCode);

        // Retrieve or create room
        Room room = rooms.computeIfAbsent(roomCode, Room::new);

        // Add participant
        Room.Participant participant = new Room.Participant(session.getId(), username);
        room.getParticipants().put(session.getId(), participant);

        // 1. Send current room state to the newly joined client
        Map<String, Object> stateMsg = new HashMap<>();
        stateMsg.put("type", "ROOM_STATE");
        stateMsg.put("roomCode", room.getRoomCode());
        stateMsg.put("code", room.getCodeContent());
        stateMsg.put("language", room.getLanguage());
        stateMsg.put("yourSessionId", session.getId());

        List<Map<String, String>> participantList = new ArrayList<>();
        for (Room.Participant p : room.getParticipants().values()) {
            Map<String, String> pMap = new HashMap<>();
            pMap.put("sessionId", p.getSessionId());
            pMap.put("username", p.getUsername());
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

        String chatText = (String) msgData.get("message");

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

        String code = (String) msgData.get("code");
        room.setCodeContent(code);

        Map<String, Object> updateMsg = new HashMap<>();
        updateMsg.put("type", "CODE_UPDATE");
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

        String language = (String) msgData.get("language");
        room.setLanguage(language);

        Map<String, Object> updateMsg = new HashMap<>();
        updateMsg.put("type", "LANGUAGE_UPDATE");
        updateMsg.put("language", language);

        broadcastToRoom(roomCode, updateMsg, null);
    }

    private void handleCursorUpdate(WebSocketSession session, Map<String, Object> msgData) throws IOException {
        String roomCode = sessionToRoomCode.get(session.getId());
        if (roomCode == null) return;

        Room room = rooms.get(roomCode);
        if (room == null) return;

        Room.Participant p = room.getParticipants().get(session.getId());
        if (p == null) return;

        Map<String, Object> posMap = (Map<String, Object>) msgData.get("position");
        if (posMap == null) return;

        Room.CursorPosition pos = new Room.CursorPosition();
        pos.setLineNumber((Integer) posMap.get("lineNumber"));
        pos.setColumn((Integer) posMap.get("column"));
        p.setCursorPosition(pos);

        Map<String, Object> cursorMsg = new HashMap<>();
        cursorMsg.put("type", "CURSOR_UPDATE");
        cursorMsg.put("sessionId", p.getSessionId());
        cursorMsg.put("username", p.getUsername());
        cursorMsg.put("position", pos);

        // Broadcast cursor to other room members
        broadcastToRoom(roomCode, cursorMsg, session.getId());
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

    private void broadcastUserList(String roomCode) throws IOException {
        Room room = rooms.get(roomCode);
        if (room == null) return;

        List<Map<String, String>> participantList = new ArrayList<>();
        for (Room.Participant p : room.getParticipants().values()) {
            Map<String, String> pMap = new HashMap<>();
            pMap.put("sessionId", p.getSessionId());
            pMap.put("username", p.getUsername());
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
