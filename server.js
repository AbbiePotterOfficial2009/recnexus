const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');
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

// --- NODEMAILER EMAIL TRANSPORTER CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'recnexussupport@gmail.com',
        pass: 'dfgsbjsqqzrumhrp'
    }
});

// Helper Function to Send Live Emails
async function sendEmail(targetEmail, subject, htmlContent) {
    const mailOptions = {
        from: '"RecNexus Support" <recnexussupport@gmail.com>',
        to: targetEmail,
        subject: subject,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SENT] Delivered to ${targetEmail}`);
        return true;
    } catch (error) {
        console.error(`[EMAIL ERROR] Failed to send email to ${targetEmail}:`, error);
        return false;
    }
}

const RESERVED_NAMES = [
    'coach', 'admin', 'administrator', 'staff', 'support', 
    'moderator', 'mod', 'system', 'recnexus', 'official', 'owner', 'host', 'help'
];

// --- DATABASES ---
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

// --- AUTHENTICATION ENDPOINTS ---

// Register & Dispatch Live Email PIN
app.post('/api/auth/register', async (req, res) => {
    const { gamertag, email, password } = req.body;

    if (!gamertag || !email || !password) {
        return res.status(400).json({ success: false, message: "Gamertag, Email, and Password are all required." });
    }

    const cleanGamertag = gamertag.trim();
    const cleanEmail = email.trim().toLowerCase();
    const normalizedGamertag = cleanGamertag.toLowerCase();

    if (RESERVED_NAMES.some(r => normalizedGamertag.includes(r))) {
        return res.status(400).json({ success: false, message: `The username '${cleanGamertag}' contains reserved terms.` });
    }

    if (usersDB.some(u => u.gamertag.toLowerCase() === normalizedGamertag)) {
        return res.status(400).json({ success: false, message: "This gamertag is already taken." });
    }

    if (usersDB.some(u => u.email.toLowerCase() === cleanEmail)) {
        return res.status(400).json({ success: false, message: "An account with this email already exists." });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const newUser = {
        id: `usr_${Date.now()}`,
        username: cleanGamertag,
        gamertag: cleanGamertag,
        email: cleanEmail,
        passwordHash: bcrypt.hashSync(password, 10),
        role: "PLAYER",
        isVerified: false,
        verificationCode,
        resetToken: null,
        resetExpires: null,
        createdAt: new Date().toISOString()
    };

    usersDB.push(newUser);

    const emailHtml = `
        <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 10px;">
            <h2 style="color: #f26322;">Welcome to RecNexus, ${cleanGamertag}!</h2>
            <p>Thank you for creating an account. Please use the verification code below:</p>
            <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #333; border: 2px dashed #f26322;">
                ${verificationCode}
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #777;">If you did not request this code, please ignore this email.</p>
        </div>
    `;

    await sendEmail(cleanEmail, '🎮 Your RecNexus Verification PIN', emailHtml);

    res.json({
        success: true,
        requiresVerification: true,
        email: cleanEmail,
        message: `Account created! A 6-digit PIN has been emailed to ${cleanEmail}.`
    });
});

// Verify Code Endpoint
app.post('/api/auth/verify', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: "Email and PIN code are required." });

    const user = usersDB.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: "Account not found." });

    if (user.isVerified) return res.json({ success: true, message: "Account is already verified!" });

    if (user.verificationCode !== code.trim()) {
        return res.status(400).json({ success: false, message: "Invalid verification PIN code." });
    }

    user.isVerified = true;
    user.verificationCode = null;

    res.json({ success: true, message: "Email verified successfully! You can now log in." });
});

// Login Endpoint
app.post('/api/auth/login', (req, res) => {
    const { gamertag, password } = req.body;
    const user = usersDB.find(u => u.gamertag.toLowerCase() === gamertag.toLowerCase() || u.email.toLowerCase() === gamertag.toLowerCase());

    if (!user) return res.status(401).json({ success: false, message: "Account not found." });

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid password." });

    if (!user.isVerified && user.role === 'PLAYER') {
        return res.status(403).json({
            success: false,
            needsVerification: true,
            email: user.email,
            message: "Your account is not verified yet. Please enter the PIN sent to your email."
        });
    }

    req.session.user = { id: user.id, username: user.username, gamertag: user.gamertag, email: user.email, role: user.role };
    res.json({ success: true, message: `Welcome back, ${user.gamertag}!`, user: req.session.user });
});

// Forgot Password Endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const user = usersDB.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetToken = resetToken;
        user.resetExpires = Date.now() + 3600000; // 1 hour

        const resetLink = `http://localhost:${PORT}/reset-password.html?token=${resetToken}`;
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #0d0d12; color: #fff; padding: 30px; border-radius: 12px;">
                <h2 style="color: #f26322;">RecNexus Password Reset</h2>
                <p>You requested to reset your password. Click the secure button below:</p>
                <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #f26322, #ff3366); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 15px;">Reset Password</a>
                <p style="margin-top: 25px; font-size: 12px; color: #a0a0b0;">If you didn't request this, you can safely ignore this email.</p>
            </div>
        `;

        await sendEmail(user.email, '🔐 RecNexus Password Reset Request', emailHtml);
    }

    res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
});

app.use(express.static(__dirname));

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` RecNexus v3.3 Master Server Running on Port ${PORT} `);
    console.log(`====================================================`);
});
