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

const RESERVED_NAMES = ['recnexusofficial', 'abbieadminofficial', 'admin', 'administrator', 'staff', 'support', 'moderator', 'mod', 'system', 'recnexus', 'owner', 'host'];

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
    const lowerGamertag = cleanGamertag.toLowerCase();

    // Allow exemption for AbbiePotterOfficial specifically, but block other restricted system combinations
    if (lowerGamertag !== 'abbiepotterofficial' && RESERVED_NAMES.some(r => lowerGamertag.includes(r))) {
        return res.status(400).json({ success: false, message: "This username contains reserved system terms." });
    }

    if (usersDB.some(u => u.email.toLowerCase() === cleanEmail)) {
        return res.status(400).json({ success: false, message: "Email already exists." });
    }

    // Check if gamertag is already taken by someone else
    if (usersDB.some(u => u.gamertag.toLowerCase() === lowerGamertag)) {
        return res.status(400).json({ success: false, message: "Gamertag is already taken." });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Auto-grant ADMIN role if registering as AbbiePotterOfficial
    const userRole = (lowerGamertag === 'abbiepotterofficial') ? 'ADMIN' : 'PLAYER';

    usersDB.push({
        id: `usr_${Date.now()}`,
        username: cleanGamertag,
        gamertag: cleanGamertag,
        email: cleanEmail,
        passwordHash: bcrypt.hashSync(password, 10),
        role: userRole,
        isVerified: true, // Auto-verify owner exemption if desired, or require PIN
        verificationCode: null,
        createdAt: new Date().toISOString()
    });

    res.json({ success: true, redirectUrl: '/dashboard.html', message: "Account created successfully!" });
});

app.post('/api/auth/login', (req, res) => {
    const { gamertag, password } = req.body;
    const user = usersDB.find(u => u.gamertag.toLowerCase() === gamertag.toLowerCase() || u.email.toLowerCase() === gamertag.toLowerCase());

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ success: false, message: "Invalid login credentials." });
    }

    req.session.user = { id: user.id, username: user.username, gamertag: user.gamertag, email: user.email, role: user.role };
    res.json({ success: true, redirectUrl: '/dashboard.html', user: req.session.user });
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
    console.log(`RecNexus Server running on port ${PORT}`);
});
