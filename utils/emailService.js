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

    const verificationUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/verify/${token}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify Your Email',
        html: `
            <h1>Welcome to Our SaaS Platform!</h1>
            <p>Please click the link below to verify your email address:</p>
            <a href="${verificationUrl}">${verificationUrl}</a>
            <p>This link will expire in 24 hours.</p>
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