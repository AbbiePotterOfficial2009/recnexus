const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

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

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'recnexussupport@gmail.com',
        pass: 'dfgsbjsqqzrumhrp'
    }
});

async function sendEmail(targetEmail, subject, htmlContent) {
    try {
        await transporter.sendMail({
            from: '"RecNexus Support" <recnexussupport@gmail.com>',
            to: targetEmail,
            subject: subject,
            html: htmlContent
        });
        return true;
    } catch (error) {
        console.error(`[EMAIL ERROR]:`, error);
        return false;
    }
}

const RESERVED_NAMES = ['coach', 'admin', 'administrator', 'staff', 'support', 'moderator', 'mod', 'system', 'recnexus', 'official', 'owner', 'host', 'help'];

const usersDB = [
    {
        id: "usr_admin_100",
        username: "Coach",
        gamertag: "Coach_Level99",
        email: "recnexussupport@gmail.com",
        passwordHash: bcrypt.hashSync("CoachPass99!", 10),
        role: "ADMIN",
        isVerified: true,
        verificationCode: null,
        resetToken: null,
        resetExpires: null,
        createdAt: new Date().toISOString()
    }
];

# --- AUTH ENDPOINTS ---
app.post('/api/auth/register', async (req, res) => {
    const { gamertag, email, password } = req.body;
    if (!gamertag || !email || !password) return res.status(400).json({ success: false, message: "All fields are required." });

    const cleanGamertag = gamertag.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (RESERVED_NAMES.some(r => cleanGamertag.toLowerCase().includes(r))) {
        return res.status(400).json({ success: false, message: "This username contains reserved terms." });
    }

    if (usersDB.some(u => u.email.toLowerCase() === cleanEmail)) {
        return res.status(400).json({ success: false, message: "Email already exists." });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    usersDB.push({
        id: `usr_${Date.now()}`,
        username: cleanGamertag,
        gamertag: cleanGamertag,
        email: cleanEmail,
        passwordHash: bcrypt.hashSync(password, 10),
        role: "PLAYER",
        isVerified: false,
        verificationCode,
        createdAt: new Date().toISOString()
    });

    await sendEmail(cleanEmail, '🎮 RecNexus Verification PIN', `<h2>Your PIN: <b>${verificationCode}</b></h2>`);
    res.json({ success: true, requiresVerification: true, email: cleanEmail, message: "Verification PIN sent to email." });
});

app.post('/api/auth/verify', (req, res) => {
    const { email, code } = req.body;
    const user = usersDB.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.verificationCode !== code.trim()) return res.status(400).json({ success: false, message: "Invalid PIN." });

    user.isVerified = true;
    user.verificationCode = null;
    res.json({ success: true, message: "Verified successfully!" });
});

app.post('/api/auth/login', (req, res) => {
    const { gamertag, password } = req.body;
    const user = usersDB.find(u => u.gamertag.toLowerCase() === gamertag.toLowerCase() || u.email.toLowerCase() === gamertag.toLowerCase());

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ success: false, message: "Invalid login credentials." });
    }

    if (!user.isVerified && user.role === 'PLAYER') {
        return res.status(403).json({ success: false, needsVerification: true, email: user.email, message: "Account not verified." });
    }

    req.session.user = { id: user.id, username: user.username, gamertag: user.gamertag, email: user.email, role: user.role };
    res.json({ success: true, redirectUrl: '/dashboard.html', user: req.session.user });
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const user = usersDB.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetToken = resetToken;
        user.resetExpires = Date.now() + 3600000;
        const resetLink = `http://localhost:${PORT}/reset-password.html?token=${resetToken}`;
        await sendEmail(user.email, '🔐 RecNexus Password Reset Request', `<p>Click here to reset your password: <a href="${resetLink}">Reset Password</a></p>`);
    }
    res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
});

app.get('/api/auth/session', (req, res) => {
    if (!req.session.user) return res.status(401).json({ loggedIn: false });
    res.json({ loggedIn: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

app.use(express.static(__dirname));

server.listen(PORT, () => {
    console.log(`RecNexus Master Server running on port ${PORT}`);
});
