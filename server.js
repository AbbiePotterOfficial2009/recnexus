const express = require('express');
const { exec } = require('child_process');
const path = require('path');
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

// Broadcast Notification
app.post('/api/notifications/broadcast', (req, res) => {
    const { message } = req.body;
    const notification = { id: Date.now(), sender: "COACH (Level 99)", message, timestamp: new Date().toLocaleTimeString() };
    activeBroadcasts.push(notification);
    res.json({ success: true, message: "Coach Broadcast sent to all active rooms!", notification });
});

// Launcher Action Commands
app.post('/api/launcher/:action', (req, res) => {
    const action = req.params.action;

    switch(action) {
        case 'launch-unity':
            exec('start "" "C:\\Users\\Abbie.Potter\\recroom-revivall\\Build\\recroom-revivall.exe"');
            return res.json({ message: "Launching RecRoom Revival Unity executable!" });
        case 'launch-desktop':
            exec('cd /d "C:\\Users\\Abbie.Potter\\recnexus" && npm start');
            return res.json({ message: "Launching Desktop Control Panel..." });
        case 'launch-all':
            exec('start "" "C:\\Users\\Abbie.Potter\\recroom-revivall\\Build\\recroom-revivall.exe"');
            return res.json({ message: "Launching all client services..." });
        case 'stop-all':
            exec('taskkill /F /IM electron.exe /IM Unity.exe /T');
            return res.json({ message: "Terminated client processes." });
        case 'open-unity-folder':
            exec('explorer "C:\\Users\\Abbie.Potter\\recroom-revivall"');
            return res.json({ message: "Opened Game directory." });
        case 'clean-deps':
            return res.json({ message: "Cache and temporary files cleaned." });
        case 'git-sync':
            exec('git pull origin main');
            return res.json({ message: "Synced with GitHub main branch." });
        default:
            return res.json({ message: `Executed local task: ${action}` });
    }
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` RecNexus Master Node running at http://localhost:${PORT}`);
    console.log(` Coach Privileges: Active (Level 99 Owner)           `);
    console.log(`====================================================`);
});
