package com.vcode.backend.handler;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private static final Pattern ROOM_CODE_PATTERN = Pattern.compile("[A-Z0-9]{6}");

    private final Map<String, Process> processMap = new ConcurrentHashMap<>();
    private final Map<String, Thread> readerThreadMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String roomCode = extractRoomCode(session);
        if (roomCode == null) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        Path roomDir = Paths.get(System.getProperty("java.io.tmpdir"), "vcode_rooms", roomCode);
        Files.createDirectories(roomDir);

        ProcessBuilder pb;
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            pb = new ProcessBuilder("cmd.exe");
        } else {
            pb = new ProcessBuilder("/bin/bash", "-i");
        }
        
        pb.directory(roomDir.toFile());
        pb.redirectErrorStream(true);
        Process process = pb.start();
        processMap.put(session.getId(), process);
        
        Thread readerThread = new Thread(() -> {
            try {
                InputStream in = process.getInputStream();
                byte[] buffer = new byte[1024];
                int len;
                while ((len = in.read(buffer)) != -1) {
                    if (session.isOpen()) {
                        String output = new String(buffer, 0, len, StandardCharsets.UTF_8);
                        synchronized (session) {
                            session.sendMessage(new TextMessage(output));
                        }
                    } else {
                        break;
                    }
                }
            } catch (IOException e) {
                // Ignore disconnect exceptions
            }
        });
        readerThread.start();
        readerThreadMap.put(session.getId(), readerThread);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Process process = processMap.get(session.getId());
        if (process != null && process.isAlive()) {
            OutputStream out = process.getOutputStream();
            out.write(message.getPayload().getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        Process process = processMap.remove(session.getId());
        if (process != null) {
            process.destroy();
            if (process.isAlive()) process.destroyForcibly();
        }
        Thread thread = readerThreadMap.remove(session.getId());
        if (thread != null) {
            thread.interrupt();
        }
    }

    private String extractRoomCode(WebSocketSession session) {
        if (session.getUri() == null || session.getUri().getQuery() == null) return null;
        for (String parameter : session.getUri().getQuery().split("&")) {
            String[] pair = parameter.split("=", 2);
            if (pair.length == 2 && "roomCode".equals(pair[0])) {
                try {
                    String roomCode = java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8).trim().toUpperCase();
                    return ROOM_CODE_PATTERN.matcher(roomCode).matches() ? roomCode : null;
                } catch (IllegalArgumentException ignored) {
                    return null;
                }
            }
        }
        return null;
    }
}
