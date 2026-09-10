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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private final Map<String, Process> processMap = new ConcurrentHashMap<>();
    private final Map<String, Thread> readerThreadMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String query = session.getUri().getQuery();
        String roomCode = "default";
        if (query != null && query.contains("roomCode=")) {
            roomCode = query.split("roomCode=")[1].split("&")[0];
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
                        String output = new String(buffer, 0, len);
                        session.sendMessage(new TextMessage(output));
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
            out.write(message.getPayload().getBytes());
            out.flush();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        Process process = processMap.remove(session.getId());
        if (process != null) {
            process.destroy();
        }
        Thread thread = readerThreadMap.remove(session.getId());
        if (thread != null) {
            thread.interrupt();
        }
    }
}
