const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendVerificationEmail = async (email, token) => {
    console.log('Creating email transport with:', {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS ? '***' : 'not set'
    });

    // Use deployed frontend URL for verification
    const frontendUrl = process.env.FRONTEND_URL || 'https://instapinz-vibe.vercel.app';
    const verificationUrl = `${frontendUrl}/verify.html?token=${token}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify Your Email - InstaPinz Vibe',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #4f46e5; text-align: center;">Welcome to InstaPinz Vibe! ✨</h1>
                <p style="font-size: 16px; color: #374151;">Hey there! Thanks for joining our squad. Please click the button below to verify your email address:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationUrl}" style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        Verify My Email 🚀
                    </a>
                </div>
                <p style="font-size: 14px; color: #6b7280;">This link will expire in 24 hours.</p>
                <p style="font-size: 14px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">${verificationUrl}</p>
            </div>
        `
    };

    try {
        console.log('Attempting to send email to:', email);
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return true;
    } catch (error) {
        console.error('Email sending error:', {
            message: error.message,
            code: error.code,
            command: error.command
        });
        return false;
    }
};

module.exports = {
    sendVerificationEmail
}; 