const express = require('express');
const { exec } = require('child_process');
const app = express();
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
    { id: "1002", username: "GramerPro2026", ip: "192.168.1.88", room: "^RecCenter", status: "Active" },
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

app.get('/api/status', (req, res) => {
    res.json({ status: serverStatus, node: "RecNexus Master Server Node", coach: coachProfile, playerCount: activePlayers.length });
});

app.get('/api/players', (req, res) => {
    res.json({ players: activePlayers, bannedUsersCount: bannedUsers.length, bannedIPsCount: bannedIPs.length });
});

app.post('/api/moderation/kick', (req, res) => {
    const { playerId } = req.body;
    const index = activePlayers.findIndex(p => p.id === playerId);
    if (index !== -1) {
        const kicked = activePlayers.splice(index, 1)[0];
        return res.json({ success: true, message: `Kicked ${kicked.username} from ${kicked.room}` });
    }
    res.status(404).json({ success: false, message: "Player not found." });
});

app.post('/api/moderation/ban', (req, res) => {
    const { playerId } = req.body;
    const index = activePlayers.findIndex(p => p.id === playerId);
    if (index !== -1) {
        const banned = activePlayers.splice(index, 1)[0];
        bannedUsers.push(banned);
        return res.json({ success: true, message: `Permanently banned ${banned.username}!` });
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
        return res.json({ success: true, message: `IP Banned ${banned.username} (${banned.ip})!` });
    }
    res.status(404).json({ success: false, message: "Player not found." });
});

app.post('/api/notifications/broadcast', (req, res) => {
    const { message } = req.body;
    const notification = { id: Date.now(), sender: "COACH (Level 99)", message, timestamp: new Date().toLocaleTimeString() };
    activeBroadcasts.push(notification);
    res.json({ success: true, message: "Broadcast sent!", notification });
});

app.post('/api/launcher/:action', (req, res) => {
    const action = req.params.action;
    if (action === 'launch-unity') {
        exec('start "" "C:\\Users\\Abbie.Potter\\recroom-revivall\\Build\\recroom-revivall.exe"');
        return res.json({ message: "Launching RecRoom Revival game executable!" });
    }
    if (action === 'stop-all') {
        exec('taskkill /F /IM electron.exe /IM Unity.exe /T');
        return res.json({ message: "Terminated client processes." });
    }
    res.json({ message: `Triggered action: ${action}` });
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`RecNexus API Node running at http://localhost:${PORT}`);
});
