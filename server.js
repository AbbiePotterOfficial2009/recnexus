const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'recnexus_master_key_2026_prod',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// --- IN-MEMORY DATABASES ---
const usersDB = [
    {
        id: "usr_admin_100",
        username: "Coach",
        gamertag: "Coach_Level99",
        email: "coach@recnexus.net",
        passwordHash: bcrypt.hashSync("CoachPass99!", 10),
        role: "ADMIN",
        createdAt: new Date().toISOString()
    },
    {
        id: "usr_staff_101",
        username: "SupportMod1",
        gamertag: "SupportDesk_Alex",
        email: "alex@recnexus.net",
        passwordHash: bcrypt.hashSync("StaffPass2026!", 10),
        role: "STAFF",
        createdAt: new Date().toISOString()
    },
    {
        id: "usr_player_102",
        username: "GamerPro2026",
        gamertag: "GamerPro2026",
        email: "gamer@recnexus.net",
        passwordHash: bcrypt.hashSync("password123", 10),
        role: "PLAYER",
        createdAt: new Date().toISOString()
    }
];

const passwordResetTokens = []; // { email, token, expiresAt }
const supportTickets = [];       // { id, gamertag, email, category, subject, description, status, staffReply, updatedAt }
const activePlayers = [
    { id: "usr_player_102", username: "GamerPro2026", ip: "192.168.1.88", room: "^RecCenter", status: "Active" }
];

let faqDatabase = [
    {
        id: "faq_1",
        keywords: ["connect", "join", "launch", "start", "play"],
        question: "How do I connect to RecRoom Revival?",
        answer: "Log into your RecNexus Gamertag account on the home dashboard and click 'Play Game' to start your connected session!"
    },
    {
        id: "faq_2",
        keywords: ["ban", "kicked", "moderation", "rules", "coach"],
        question: "Why was I kicked or banned?",
        answer: "Coach Level 99 and Support Staff enforce community guidelines. If you feel an action was taken in error, submit a ticket in the Support tab."
    },
    {
        id: "faq_3",
        keywords: ["password", "reset", "forgot", "login", "account"],
        question: "How do I reset my password?",
        answer: "Click 'Forgot Password' on the login screen, enter your email address, and use the generated reset token link."
    }
];

// --- AUTH MIDDLEWARE ---
function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
}

function requireStaffOrAdmin(req, res, next) {
    if (req.session && req.session.user && (req.session.user.role === 'STAFF' || req.session.user.role === 'ADMIN')) return next();
    return res.status(403).json({ success: false, message: "Forbidden. Support Staff or Coach access required." });
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'ADMIN') return next();
    return res.status(403).json({ success: false, message: "Forbidden. Coach Level 99 privileges required." });
}

// --- USER & AUTHENTICATION ENDPOINTS ---

// Register Lifetime Public Account
app.post('/api/auth/register', (req, res) => {
    const { gamertag, email, password } = req.body;

    if (!gamertag || !email || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const existingUser = usersDB.find(u => u.gamertag.toLowerCase() === gamertag.toLowerCase() || u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
        return res.status(400).json({ success: false, message: "Gamertag or Email is already registered." });
    }

    const newUser = {
        id: `usr_${Date.now()}`,
        username: gamertag,
        gamertag,
        email,
        passwordHash: bcrypt.hashSync(password, 10),
        role: "PLAYER",
        createdAt: new Date().toISOString()
    };

    usersDB.push(newUser);

    req.session.user = { id: newUser.id, username: newUser.username, gamertag: newUser.gamertag, role: newUser.role, email: newUser.email };
    res.json({ success: true, message: "Lifetime Account created successfully!", user: req.session.user });
});

// Login Endpoint
app.post('/api/auth/login', (req, res) => {
    const { loginType, gamertag, password } = req.body;
    const user = usersDB.find(u => u.gamertag.toLowerCase() === gamertag.toLowerCase() || u.email.toLowerCase() === gamertag.toLowerCase());

    if (!user) return res.status(401).json({ success: false, message: "Account not found." });

    if (loginType === 'STAFF' && user.role !== 'STAFF' && user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: "Access denied. Support Staff privileges required." });
    }

    if (loginType === 'ADMIN' && user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: "Access denied. Coach Level 99 privileges required." });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid password." });

    req.session.user = { id: user.id, username: user.username, gamertag: user.gamertag, email: user.email, role: user.role };
    res.json({ success: true, message: `Welcome back, ${user.gamertag}!`, user: req.session.user });
});

// Password Reset Request (Generates Token Link)
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    const user = usersDB.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
        // Return success even if not found to prevent user enumeration
        return res.json({ success: true, message: "If an account exists with that email, a password reset token has been created." });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 Minutes

    passwordResetTokens.push({ email: user.email, token, expiresAt });

    const mockResetLink = `http://localhost:${PORT}/#reset-password?token=${token}`;
    console.log(`[PASSWORD RESET SENT] Email: ${user.email} | Token Link: ${mockResetLink}`);

    res.json({
        success: true,
        message: "Password reset link generated!",
        debugToken: token,
        resetUrl: mockResetLink
    });
});

// Execute Password Reset
app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    const resetEntry = passwordResetTokens.find(r => r.token === token && r.expiresAt > Date.now());

    if (!resetEntry) {
        return res.status(400).json({ success: false, message: "Invalid or expired password reset token." });
    }

    const user = usersDB.find(u => u.email.toLowerCase() === resetEntry.email.toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    // Invalidate token
    const tokenIndex = passwordResetTokens.findIndex(r => r.token === token);
    if (tokenIndex !== -1) passwordResetTokens.splice(tokenIndex, 1);

    res.json({ success: true, message: "Password updated successfully! You can now log in." });
});

app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.user) return res.json({ authenticated: true, user: req.session.user });
    res.json({ authenticated: false });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: "Logged out." });
});

// --- AI CHATBOT & FAQ KNOWLEDGE BASE ---
app.post('/api/chat/ask', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, answer: "Please ask a valid question." });

    const lowerQuery = message.toLowerCase();
    
    // Find best keyword match in FAQ DB
    let bestMatch = null;
    let highestScore = 0;

    faqDatabase.forEach(faq => {
        let score = 0;
        faq.keywords.forEach(kw => {
            if (lowerQuery.includes(kw.toLowerCase())) score += 1;
        });
        if (score > highestScore) {
            highestScore = score;
            bestMatch = faq;
        }
    });

    if (bestMatch && highestScore > 0) {
        return res.json({ success: true, matched: true, answer: bestMatch.answer, questionTitle: bestMatch.question });
    }

    res.json({
        success: true,
        matched: false,
        answer: "I couldn't find an exact match in the RecNexus knowledge base. Would you like me to open a ticket for our Support Staff?"
    });
});

app.post('/api/admin/faq', requireAdmin, (req, res) => {
    const { question, answer, keywords } = req.body;
    const newFaq = { id: `faq_${Date.now()}`, keywords: keywords || [], question, answer };
    faqDatabase.push(newFaq);
    res.json({ success: true, message: "FAQ added to AI Knowledge Base!", faq: newFaq });
});

// --- SUPPORT TICKETING SYSTEM ---
app.post('/api/support/ticket', requireAuth, (req, res) => {
    const { category, subject, description } = req.body;
    const newTicket = {
        id: `TCK-${Math.floor(1000 + Math.random() * 9000)}`,
        gamertag: req.session.user.gamertag,
        email: req.session.user.email,
        category: category || "General",
        subject,
        description,
        status: "OPEN",
        staffReply: null,
        createdAt: new Date().toLocaleTimeString()
    };

    supportTickets.push(newTicket);
    io.emit('ticket_created', newTicket);
    res.json({ success: true, message: "Support ticket submitted successfully!", ticket: newTicket });
});

app.get('/api/support/tickets', requireStaffOrAdmin, (req, res) => {
    res.json({ tickets: supportTickets });
});

app.post('/api/support/ticket/reply', requireStaffOrAdmin, (req, res) => {
    const { ticketId, status, reply } = req.body;
    const ticket = supportTickets.find(t => t.id === ticketId);

    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });

    if (status) ticket.status = status;
    if (reply) ticket.staffReply = reply;
    ticket.updatedAt = new Date().toLocaleTimeString();

    io.emit('ticket_updated', ticket);
    res.json({ success: true, message: "Ticket updated by Staff!", ticket });
});

// --- LAUNCHER COMMANDS ---
app.post('/api/launcher/:action', requireAuth, (req, res) => {
    const action = req.params.action;
    let msg = `Executed: ${action}`;

    if (action === 'launch-unity') {
        exec('start "" "C:\\Users\\Abbie.Potter\\recroom-revivall\\Build\\recroom-revivall.exe"');
        msg = `Launching RecRoom Revival for ${req.session.user.gamertag}!`;
    }
    res.json({ success: true, message: msg });
});

app.use(express.static(__dirname));

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` RecNexus v3.0 Master Node running on port ${PORT} `);
    console.log(` Lifetime Accounts & Password Tokens: ONLINE         `);
    console.log(` AI Support Desk & Staff Portal: ACTIVE              `);
    console.log(`====================================================`);
});
