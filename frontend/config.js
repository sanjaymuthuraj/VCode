const rawBackend = process.env.BACKEND_URL || 'localhost:8080';
const cleanHost = rawBackend.replace(/^https?:\/\//, '').replace(/\/$/, '');

const isHttps = window.location.protocol === 'https:' || cleanHost.includes('onrender.com');
const httpProto = isHttps ? 'https:' : 'http:';
const wsProto = isHttps ? 'wss:' : 'ws:';

export const API_BASE = `${httpProto}//${cleanHost}/api/rooms`;
export const WS_ROOM_URL = `${wsProto}//${cleanHost}/ws/room`;
export const getTerminalWsUrl = (roomCode) => `${wsProto}//${cleanHost}/ws/terminal?roomCode=${roomCode}`;
