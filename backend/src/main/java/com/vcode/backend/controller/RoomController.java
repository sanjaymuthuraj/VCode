package com.vcode.backend.controller;

import com.vcode.backend.handler.RoomWebSocketHandler;
import com.vcode.backend.model.Room;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin(origins = "*")
public class RoomController {

    private final RoomWebSocketHandler webSocketHandler;
    private final Random random = new Random();

    public RoomController(RoomWebSocketHandler webSocketHandler) {
        this.webSocketHandler = webSocketHandler;
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> createRoom() {
        String roomCode;
        Map<String, Room> activeRooms = webSocketHandler.getRooms();
        
        // Generate a unique 6-character room code
        do {
            roomCode = generateRandomCode(6);
        } while (activeRooms.containsKey(roomCode));

        // Instantiate and store the room
        Room room = new Room(roomCode);
        activeRooms.put(roomCode, room);

        Map<String, String> response = new HashMap<>();
        response.put("roomCode", roomCode);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{roomCode}")
    public ResponseEntity<Map<String, Object>> checkRoom(@PathVariable String roomCode) {
        String code = roomCode.trim().toUpperCase();
        boolean exists = webSocketHandler.getRooms().containsKey(code);

        Map<String, Object> response = new HashMap<>();
        response.put("exists", exists);
        response.put("roomCode", code);
        return ResponseEntity.ok(response);
    }

    private String generateRandomCode(int length) {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}
