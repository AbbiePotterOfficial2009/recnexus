const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

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
        pass: 'ohbdranasgyqwicr'
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
        console.error('[EMAIL ERROR]:', error);
        return false;
    }
}

const RESERVED_NAMES = ['recnexusofficial', 'abbieadminofficial', 'admin', 'administrator', 'staff', 'support', 'moderator', 'mod', 'system', 'recnexus', 'owner', 'host'];

const usersDB = [
    {
        id: 'usr_admin_100',
        username: 'AbbiePotterOfficial',
        gamertag: 'AbbiePotterOfficial',
        email: 'jackalbertpotteralt@gmail.com',
        passwordHash: bcrypt.hashSync('CoachPass99!', 10),
        role: 'ADMIN',
        isVerified: true,
        verificationCode: null,
        resetToken: null,
        resetExpires: null,
        createdAt: new Date().toISOString()
    },
    {
        id: 'usr_support_101',
        username: 'RecNexusSupport',
        gamertag: 'RecNexusSupport',
        email: 'recnexussupport@gmail.com',
        passwordHash: bcrypt.hashSync('Password123!', 10),
        role: 'PLAYER',
        isVerified: true,
        verificationCode: null,
        resetToken: null,
        resetExpires: null,
        createdAt: new Date().toISOString()
    }
];

// AUTH ENDPOINTS
app.post('/api/auth/register', async (req, res) => {
    const { gamertag, email, password } = req.body;
    if (!gamertag || !email || !password) return res.status(400).json({ success: false, message: 'All fields are required.' });

    const cleanGamertag = gamertag.trim();
    const cleanEmail = email.trim().toLowerCase();
    const lowerGamertag = cleanGamertag.toLowerCase();

    if (lowerGamertag !== 'abbiepotterofficial' && RESERVED_NAMES.some(r => lowerGamertag.includes(r))) {
        return res.status(400).json({ success: false, message: 'This username contains reserved system terms.' });
    }

    if (usersDB.some(u => u.email.toLowerCase() === cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    if (usersDB.some(u => u.gamertag.toLowerCase() === lowerGamertag)) {
        return res.status(400).json({ success: false, message: 'Gamertag is already taken.' });
    }

    const userRole = (lowerGamertag === 'abbiepotterofficial') ? 'ADMIN' : 'PLAYER';

    usersDB.push({
        id: 'usr_' + Date.now(),
        username: cleanGamertag,
        gamertag: cleanGamertag,
        email: cleanEmail,
        passwordHash: bcrypt.hashSync(password, 10),
        role: userRole,
        isVerified: true,
        verificationCode: null,
        createdAt: new Date().toISOString()
    });

    res.json({ success: true, redirectUrl: '/dashboard.html', message: 'Account created successfully!' });
});

// PASSWORD RESET ENDPOINTS
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const cleanEmail = email.trim().toLowerCase();
    const user = usersDB.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
        return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken;
    user.resetExpires = Date.now() + 3600000; // 1 hour

    const resetLink = 'https://recnexus.onrender.com/reset-password.html?token=' + resetToken;
    const htmlContent = '<h3>Password Reset Request</h3><p>Click the link below to reset your password:</p><a href="' + resetLink + '">' + resetLink + '</a>';

    await sendEmail(user.email, 'RecNexus Password Reset', htmlContent);

    res.json({ success: true, message: 'Password reset link sent to your email.' });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and new password are required.' });

    const user = usersDB.find(u => u.resetToken === token && u.resetExpires > Date.now());
    if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
    }

    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    user.resetToken = null;
    user.resetExpires = null;

    res.json({ success: true, message: 'Password has been successfully reset.' });
});

// OWNER MANUAL ACCOUNT CREATION ENDPOINT
app.post('/api/owner/create-account', (req, res) => {
    const { gamertag, email, password, role } = req.body;
    if (!gamertag || !email || !password) {
        return res.status(400).json({ success: false, message: 'Gamertag, email, and password are required.' });
    }

    const cleanGamertag = gamertag.trim();
    const cleanEmail = email.trim().toLowerCase();
    const assignedRole = role || 'PLAYER';

    if (usersDB.some(u => u.email.toLowerCase() === cleanEmail || u.gamertag.toLowerCase() === cleanGamertag.toLowerCase())) {
        return res.status(400).json({ success: false, message: 'User with this gamertag or email already exists.' });
    }

    const newUser = {
        id: 'usr_' + Date.now(),
        username: cleanGamertag,
        gamertag: cleanGamertag,
        email: cleanEmail,
        passwordHash: bcrypt.hashSync(password, 10),
        role: assignedRole,
        isVerified: true,
        verificationCode: null,
        createdAt: new Date().toISOString()
    };

    usersDB.push(newUser);
    res.json({ success: true, message: 'Account for ' + cleanGamertag + ' created successfully with role ' + assignedRole + '!' });
});

app.post('/api/auth/login', (req, res) => {
    const { gamertag, password } = req.body;
    const user = usersDB.find(u => u.gamertag.toLowerCase() === gamertag.toLowerCase() || u.email.toLowerCase() === gamertag.toLowerCase());

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ success: false, message: 'Invalid login credentials.' });
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
    console.log('RecNexus Server running on port ' + PORT);
});
