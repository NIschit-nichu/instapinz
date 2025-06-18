# InstaPinz Vibe - Fashion & Aesthetic Feed

A Gen Z-inspired fashion and aesthetic feed platform that combines the best of Instagram and Pinterest vibes.

## Features

- 🎨 **Fashion Gallery**: Browse curated fashion content
- 📚 **Media Library**: Access webdesigns and aesthetic content
- 🔐 **User Authentication**: Secure login/signup system
- 📱 **Responsive Design**: Works on all devices
- ✨ **Gen Z Aesthetic**: Modern, trendy interface

## Tech Stack

- **Frontend**: HTML, CSS (Tailwind), JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **Authentication**: JWT tokens
- **Deployment**: Vercel

## Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd instapinz-vibe
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file:
   ```
   MONGODB_URI=mongodb://127.0.0.1:27017/saas-landing
   JWT_SECRET=your-secret-key
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:5000`

## Vercel Deployment

### Prerequisites
- GitHub account
- Vercel account
- MongoDB Atlas account (for production database)

### Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Sign up/Login with GitHub
   - Click "New Project"
   - Import your GitHub repository

3. **Configure Environment Variables**
   In Vercel dashboard, add these environment variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `JWT_SECRET`: A secure random string for JWT tokens

4. **Deploy**
   - Click "Deploy"
   - Vercel will automatically build and deploy your app

### MongoDB Atlas Setup

1. **Create MongoDB Atlas Account**
   - Go to [mongodb.com/atlas](https://mongodb.com/atlas)
   - Create a free account

2. **Create a Cluster**
   - Choose the free tier
   - Select your preferred region

3. **Get Connection String**
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password

4. **Add to Vercel**
   - Use this connection string as your `MONGODB_URI` environment variable

## Project Structure

```
├── public/                 # Static files (HTML, CSS, JS)
│   ├── index.html         # Landing page
│   ├── login.html         # Login page
│   ├── dashboard.html     # Main dashboard
│   ├── webdesigns/        # Fashion images
│   └── tobejson/          # Aesthetic content
├── routes/                # API routes
│   └── auth.js           # Authentication routes
├── models/               # Database models
│   └── User.js          # User model
├── server.js            # Main server file
├── vercel.json          # Vercel configuration
└── package.json         # Dependencies
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `NODE_ENV` | Environment (development/production) | No |

## Contributing

Created by Nischit_Kanthala-groups!!!!

## License

© 2025 InstaPinz Vibe. All rights reserved. 