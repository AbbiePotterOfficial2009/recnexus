const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'recnexus_master_key_2026', resave: false, saveUninitialized: false }));

// SMTP Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'recnexussupport@gmail.com', pass: 'dfgsbjsqqzrumhrp' }
});

async function sendEmail(toEmail, subject, htmlContent) {
    try {
        await transporter.sendMail({ from: '"RecNexus Support" <recnexussupport@gmail.com>', to: toEmail, subject, html: htmlContent });
        return true;
    } catch (error) { console.error(error); return false; }
}

const usersDB = [{ id: "usr_admin_100", username: "Coach", gamertag: "Coach_Level99", email: "recnexussupport@gmail.com", passwordHash: bcrypt.hashSync("CoachPass99!", 10), role: "ADMIN", isVerified: true }];

// Routes
app.post('/api/auth/register', async (req, res) => {
    const { gamertag, email, password } = req.body;
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newUser = { id: `usr_${Date.now()}`, gamertag, email, passwordHash: bcrypt.hashSync(password, 10), role: "PLAYER", isVerified: false, verificationCode };
    usersDB.push(newUser);
    await sendEmail(email, '🎮 Your RecNexus Verification PIN', `Your PIN: ${verificationCode}`);
    res.json({ success: true, message: "Check your email." });
});

app.post('/api/auth/verify', (req, res) => {
    const { email, code } = req.body;
    const user = usersDB.find(u => u.email === email && u.verificationCode === code);
    if (!user) return res.status(400).json({ success: false, message: "Invalid code" });
    user.isVerified = true; user.verificationCode = null;
    res.json({ success: true, message: "Verified!" });
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = usersDB.find(u => u.email === email);
    if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        user.resetToken = token;
        await sendEmail(email, 'Password Reset', `Reset link: http://localhost:${PORT}/reset-password.html?token=${token}`);
    }
    res.json({ success: true, message: "If an account exists, a link was sent." });
});

app.use(express.static(__dirname));
server.listen(PORT, () => console.log(`Master Server running on port ${PORT}`));
