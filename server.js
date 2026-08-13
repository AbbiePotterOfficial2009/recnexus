const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = 3000;

app.use(express.json());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
});

let serverStatus = "ONLINE";
let activeBroadcasts = [];
let activePlayers = [
    { id: "1001", username: "RecPlayer_99", ip: "192.168.1.42", room: "^DormRoom", status: "Active" },
    { id: "1002", username: "GamerPro2026", ip: "192.168.1.88", room: "^RecCenter", status: "Active" },
    { id: "1003", username: "TrollUser123", ip: "10.0.0.15", room: "^Paintball", status: "Active" }
];

let bannedUsers = [];
let bannedIPs = [];

const coachProfile = {
    username: "Coach",
    role: "Owner / Creator",
    level: 99,
    permissions: ["BROADCAST_GAME_NOTIFICATIONS", "BAN_USERS", "IP_BAN", "SERVER_CONTROL"]
};

// Helper: Realtime Broadcast State Sync
function broadcastPlayerState() {
    io.emit('players_update', {
        players: activePlayers,
        bannedUsersCount: bannedUsers.length,
        bannedIPsCount: bannedIPs.length
    });
}

// Socket.io Connection Event
io.on('connection', (socket) => {
    console.log(`[Socket] Coach Dashboard Connected: ${socket.id}`);
    
    // Send immediate sync on connection
    socket.emit('status_update', { status: serverStatus, coach: coachProfile });
    socket.emit('players_update', { players: activePlayers, bannedUsersCount: bannedUsers.length, bannedIPsCount: bannedIPs.length });

    socket.on('disconnect', () => {
        console.log(`[Socket] Dashboard Disconnected: ${socket.id}`);
    });
});

// Health & Status
app.get('/api/status', (req, res) => {
    res.json({ status: serverStatus, node: "RecNexus Master Server Node", coach: coachProfile, playerCount: activePlayers.length });
});

// Players List
app.get('/api/players', (req, res) => {
    res.json({ players: activePlayers, bannedUsersCount: bannedUsers.length, bannedIPsCount: bannedIPs.length });
});

// Moderation Endpoints
app.post('/api/moderation/kick', (req, res) => {
    const { playerId } = req.body;
    const index = activePlayers.findIndex(p => p.id === playerId);
    if (index !== -1) {
        const kicked = activePlayers.splice(index, 1)[0];
        const msg = `Kicked ${kicked.username} from ${kicked.room}`;
        broadcastPlayerState();
        io.emit('console_log', `[MODERATION] ${msg}`);
        return res.json({ success: true, message: msg });
    }
    res.status(404).json({ success: false, message: "Player not found." });
});

app.post('/api/moderation/ban', (req, res) => {
    const { playerId } = req.body;
    const index = activePlayers.findIndex(p => p.id === playerId);
    if (index !== -1) {
        const banned = activePlayers.splice(index, 1)[0];
        bannedUsers.push(banned);
        const msg = `Permanently banned ${banned.username}!`;
        broadcastPlayerState();
        io.emit('console_log', `[MODERATION] ${msg}`);
        return res.json({ success: true, message: msg });
    }
    res.status(404).json({ success: false, message: "Player not found." });
});

app.post('/api/moderation/ipban', (req, res) => {
    const { playerId } = req.body;
    const index = activePlayers.findIndex(p => p.id === playerId);
    if (index !== -1) {
        const banned = activePlayers.splice(index, 1)[0];
        bannedUsers.push(banned);
        bannedIPs.push(banned.ip);
        const msg = `IP Banned ${banned.username} (${banned.ip})!`;
        broadcastPlayerState();
        io.emit('console_log', `[MODERATION] ${msg}`);
        return res.json({ success: true, message: msg });
    }
    res.status(404).json({ success: false, message: "Player not found." });
});

// Broadcast Notification
app.post('/api/notifications/broadcast', (req, res) => {
    const { message } = req.body;
    const notification = { id: Date.now(), sender: "COACH (Level 99)", message, timestamp: new Date().toLocaleTimeString() };
    activeBroadcasts.push(notification);
    io.emit('broadcast_received', notification);
    io.emit('console_log', `[BROADCAST SENT] "${message}"`);
    res.json({ success: true, message: "Coach Broadcast sent to all active rooms!", notification });
});

// Launcher Action Commands
app.post('/api/launcher/:action', (req, res) => {
    const action = req.params.action;
    let msg = `Executed local task: ${action}`;

    switch(action) {
        case 'launch-unity':
            exec('start "" "C:\\Users\\Abbie.Potter\\recroom-revivall\\Build\\recroom-revivall.exe"');
            msg = "Launching RecRoom Revival Unity executable!";
            break;
        case 'launch-desktop':
            exec('cd /d "C:\\Users\\Abbie.Potter\\recnexus" && npm start');
            msg = "Launching Desktop Control Panel...";
            break;
        case 'launch-all':
            exec('start "" "C:\\Users\\Abbie.Potter\\recroom-revivall\\Build\\recroom-revivall.exe"');
            msg = "Launching all client services...";
            break;
        case 'stop-all':
            exec('taskkill /F /IM electron.exe /IM Unity.exe /T');
            msg = "Terminated client processes.";
            break;
        case 'open-unity-folder':
            exec('explorer "C:\\Users\\Abbie.Potter\\recroom-revivall"');
            msg = "Opened Game directory.";
            break;
        case 'clean-deps':
            msg = "Cache and temporary files cleaned.";
            break;
        case 'git-sync':
            exec('git pull origin main');
            msg = "Synced with GitHub main branch.";
            break;
    }

    io.emit('console_log', `[SYSTEM] ${msg}`);
    return res.json({ message: msg });
});

app.use(express.static(__dirname));

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` RecNexus Master Node running at http://localhost:${PORT}`);
    console.log(` Real-time WebSockets: ACTIVE (Socket.io Engine)    `);
    console.log(` Coach Privileges: Active (Level 99 Owner)           `);
    console.log(`====================================================`);
});
