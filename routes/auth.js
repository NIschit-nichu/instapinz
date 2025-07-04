const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/emailService');
const transporter = require('../utils/emailService');
const bcrypt = require('bcrypt');

// Signup route
router.post('/signup', async (req, res) => {
    try {
        console.log('Received signup request body:', req.body);
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                message: 'Missing required fields',
                details: {
                    name: !name ? 'Name is required' : null,
                    email: !email ? 'Email is required' : null,
                    password: !password ? 'Password is required' : null
                }
            });
        }

        // Check if user already exists
        console.log('Checking for existing user with email:', email);
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('User already exists:', email);
            return res.status(400).json({ message: 'User already exists' });
        }

        // Generate verification token
        const verificationToken = jwt.sign(
            { email },
            process.env.JWT_SECRET || 'default_secret_key',
            { expiresIn: '24h' }
        );

        // Create new user
        console.log('Creating new user...');
        const user = new User({
            name,
            email,
            password,
            verificationToken
        });

        console.log('Saving user to database...');
        await user.save();
        console.log('User saved successfully');

        // Send verification email
        console.log('Sending verification email...');
        const emailSent = await sendVerificationEmail(email, verificationToken);
        console.log('Email sent:', emailSent);

        res.status(201).json({ 
            message: 'User created successfully. Please check your email for verification.',
            emailSent
        });
    } catch (error) {
        console.error('Detailed signup error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        // Handle specific MongoDB errors
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: 'Validation Error',
                details: Object.values(error.errors).map(err => err.message)
            });
        }
        
        if (error.name === 'MongoError' && error.code === 11000) {
            return res.status(400).json({
                message: 'Email already exists'
            });
        }

        res.status(500).json({ 
            message: 'Error creating user',
            error: error.message 
        });
    }
});

// Email verification route
router.get('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log('Verifying token:', token);

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key');
        console.log('Token decoded:', decoded);
        
        // Find user and update verification status
        const user = await User.findOne({ email: decoded.email });
        if (!user) {
            console.log('User not found for email:', decoded.email);
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();
        console.log('User verified successfully');

        // Return success response
        return res.redirect('/thank-you.html');
    } catch (error) {
        console.error('Verification error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        // Return error response
        res.status(400).json({
            success: false,
            message: 'Invalid or expired verification link. Please try signing up again.',
            redirectUrl: '/'
        });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt for:', email);

        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found:', email);
            return res.status(401).json({ 
                message: "No account found with this email! Maybe it's time to join the squad? Sign up first! 🚀" 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Invalid password for:', email);
            return res.status(401).json({ 
                message: "Wrong password! Try again, you got this! 🔑" 
            });
        }

        console.log('Login successful for:', email);
        return res.json({ success: true, redirect: '/dashboard.html', username: user.name });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: "Oops! Something went wrong. Try again later! 🫠" 
        });
    }
});

// Forgot password route
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'No account found with this email' });
        }

        // Generate reset token
        const resetToken = jwt.sign(
            { email },
            process.env.JWT_SECRET || 'default_secret_key',
            { expiresIn: '1h' }
        );

        user.resetToken = resetToken;
        await user.save();

        // Send reset email
        const resetLink = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
        
        // Here you would send the email with the reset link
        // For now, we'll just return the link
        res.json({ 
            message: 'Password reset link sent to your email',
            resetLink // Remove this in production
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Error processing request' });
    }
});

// Reset password route
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key');
        
        // Find user
        const user = await User.findOne({ 
            _id: decoded.userId,
            resetToken: token
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired reset link bestie 💅" });
        }

        // Update password
        user.password = password;
        user.resetToken = undefined;
        await user.save();

        res.json({ message: "Password updated! You're back in the game bestie 🎮" });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ message: "Something went wrong, no cap fr fr 😔" });
    }
});

// Logout route
router.post('/logout', async (req, res) => {
    try {
        // In a more advanced implementation, you might want to:
        // 1. Add the token to a blacklist
        // 2. Update user's last logout time
        // 3. Clear any server-side sessions
        
        res.json({ 
            message: 'Logged out successfully',
            success: true 
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            message: 'Error during logout',
            success: false 
        });
    }
});

module.exports = router; 