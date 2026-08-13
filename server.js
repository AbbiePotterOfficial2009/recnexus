const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Secure Session Configuration
app.use(session({
    secret: 'recnexus_coach_secret_key_2026_99',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// In-Memory User Database with Pre-Hashed Passwords
// Default Passwords: Coach Admin -> "CoachPass99!" | Players -> "password123"
const usersDB = [
    {
        id: "coach_100",
        username: "Coach",
        gamertag: "Coach_Level99",
        passwordHash: bcrypt.hashSync("CoachPass99!", 10),
        role: "ADMIN",
        level: 99
    },
    {
        id: "1001",
        username: "RecPlayer_99",
        gamertag: "RecPlayer_99",
        passwordHash: bcrypt.hashSync("password123", 10),
        role: "PLAYER",
        level: 15
    },
    {
        id: "1002",
        username: "GamerPro2026",
        gamertag: "GamerPro2026",
        passwordHash: bcrypt.hashSync("password123", 10),
        role: "PLAYER",
        level: 42
    }
];

let serverStatus = "ONLINE";
let activeBroadcasts = [];
let activePlayers = [
    { id: "1001", username: "RecPlayer_99", ip: "192.168.1.42", room: "^DormRoom", status: "Active" },
    { id: "1002", username: "GamerPro2026", ip: "192.168.1.88", room: "^RecCenter", status: "Active" }
];

let bannedUsers = [];
let bannedIPs = [];

// --- AUTHENTICATION MIDDLEWARE ---
function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'ADMIN') return next();
    return res.status(403).json({ success: false, message: "Forbidden. Coach Level 99 privileges required." });
}

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/login', (req, res) => {
    const { loginType, gamertag, password } = req.body;

    if (!gamertag || !password) {
        return res.status(400).json({ success: false, message: "Gamertag/Username and password required." });
    }

    const user = usersDB.find(u => u.gamertag.toLowerCase() === gamertag.toLowerCase() || u.username.toLowerCase() === gamertag.toLowerCase());
    
    if (!user) {
        return res.status(401).json({ success: false, message: "Account not found." });
    }

    if (loginType === 'ADMIN' && user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: "Access denied. Account lacks Coach privileges." });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
        return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    // Save user session
    req.session.user = {
        id: user.id,
        username: user.username,
        gamertag: user.gamertag,
        role: user.role,
        level: user.level
    };

    res.json({
        success: true,
        message: `Welcome back, ${user.gamertag}!`,
        user: req.session.user
    });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: "Logged out successfully." });
});

app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ authenticated: true, user: req.session.user });
    }
    res.json({ authenticated: false });
});

// Realtime Helper
function broadcastPlayerState() {
    io.emit('players_update', {
        players: activePlayers,
        bannedUsersCount: bannedUsers.length,
        bannedIPsCount: bannedIPs.length
    });
}

// Socket.io Connection Logic
io.on('connection', (socket) => {
    socket.emit('status_update', { status: serverStatus });
    socket.emit('players_update', { players: activePlayers, bannedUsersCount: bannedUsers.length, bannedIPsCount: bannedIPs.length });
});

// --- PUBLIC & AUTHENTICATED ENDPOINTS ---
app.get('/api/status', (req, res) => {
    res.json({ status: serverStatus, node: "RecNexus Master Server Node", playerCount: activePlayers.length });
});

app.get('/api/players', requireAuth, (req, res) => {
    res.json({ players: activePlayers, bannedUsersCount: bannedUsers.length, bannedIPsCount: bannedIPs.length });
});

// --- SECURE COACH MODERATION ENDPOINTS (Admin Only) ---
app.post('/api/moderation/kick', requireAdmin, (req, res) => {
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

app.post('/api/moderation/ban', requireAdmin, (req, res) => {
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

app.post('/api/moderation/ipban', requireAdmin, (req, res) => {
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

app.post('/api/notifications/broadcast', requireAdmin, (req, res) => {
    const { message } = req.body;
    const notification = { id: Date.now(), sender: "COACH (Level 99)", message, timestamp: new Date().toLocaleTimeString() };
    activeBroadcasts.push(notification);
    io.emit('broadcast_received', notification);
    io.emit('console_log', `[BROADCAST SENT] "${message}"`);
    res.json({ success: true, message: "Coach Broadcast sent to all active rooms!", notification });
});

// Launcher Commands (Public user can launch Unity; Admin can trigger all)
app.post('/api/launcher/:action', requireAuth, (req, res) => {
    const action = req.params.action;
    const userRole = req.session.user.role;

    if ((action === 'stop-all' || action === 'git-sync') && userRole !== 'ADMIN') {
        return res.status(403).json({ success: false, message: "Command restricted to Coach Level 99 Admin." });
    }

    let msg = `Executed: ${action}`;
    switch(action) {
        case 'launch-unity':
            exec('start "" "C:\\Users\\Abbie.Potter\\recroom-revivall\\Build\\recroom-revivall.exe"');
            msg = `Launching RecRoom Revival client for ${req.session.user.gamertag}...`;
            break;
        case 'open-unity-folder':
            exec('explorer "C:\\Users\\Abbie.Potter\\recroom-revivall"');
            msg = "Opened Game directory.";
            break;
        case 'stop-all':
            exec('taskkill /F /IM electron.exe /IM Unity.exe /T');
            msg = "Terminated client processes.";
            break;
        case 'git-sync':
            exec('git pull origin main');
            msg = "Synced with GitHub main branch.";
            break;
    }

    io.emit('console_log', `[SYSTEM] ${msg}`);
    return res.json({ success: true, message: msg });
});

app.use(express.static(__dirname));

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` RecNexus Master Server running at http://localhost:${PORT}`);
    console.log(` Security Layer: Active (bcryptjs + Express Sessions)`);
    console.log(` Coach Privileges: Restricted Access                 `);
    console.log(`====================================================`);
});
