# InstaPinz Vibe

[Live App: https://instapinz.vercel.app/](https://instapinz.vercel.app/)

## Your Ultimate One-Stop Fashion & Aesthetic Feed

Level up your style game and discover a world of inspiration, trends, and pure aesthetic bliss—all in one scroll. Your feed, your vibe, your rules. ✨

---

## Features
- **Instagram Scraper:** Scrape posts from any public Instagram account and view them in a curated feed.
- **Media Management:** Store, update, and serve images and videos from organized directories.
- **User Authentication:** Secure login and signup system.
- **Dashboard:** Modern, aesthetic dashboard for managing your account and viewing content.
- **Responsive Frontend:** Clean, Gen Z-inspired UI with static HTML, CSS, and JavaScript.

---

## Technologies Used
- **Backend:** Node.js, Express, MongoDB
- **Frontend:** HTML, CSS, JavaScript
- **Python:** For Instagram scraping (`scrape_instagram.py`)
- **Deployment:**
  - Frontend: [Vercel](https://vercel.com/)
  - Backend: [Render](https://render.com/)

---

## Installation & Setup

1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd project
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Set up environment variables:**
   - Create a `.env` file in the root directory.
   - Add your MongoDB URI:
     ```env
     MONGODB_URI=your_mongodb_connection_string
     ```
4. **Run the backend server:**
   ```sh
   node server.js
   ```
5. **(Optional) Run the Instagram scraper:**
   ```sh
   python scrape_instagram.py
   ```
6. **Access the frontend:**
   - Open `public/index.html` in your browser, or visit the hosted app at [https://instapinz.vercel.app/](https://instapinz.vercel.app/)

---

## Usage
- **Sign Up / Login:** Create an account or log in to access your dashboard.
- **Scrape Instagram:** Enter a public Instagram username to fetch and view their posts.
- **Browse Media:** Enjoy a curated feed of images and videos, updated regularly.

---

## Project Structure
```
project/
├── public/              # Frontend static files (HTML, CSS, JS, media)
│   ├── tobejson/        # Scraped images
│   ├── webdesigns/      # Curated images/videos
│   └── ...
├── routes/              # Express route handlers
├── models/              # Mongoose models
├── utils/               # Utility functions (e.g., email service)
├── server.js            # Main Express server
├── scrape_instagram.py  # Python scraper script
├── ...
```

---

## License
© 2025 InstaPinz Vibe. All rights reserved.

---

## Hosting
- **Frontend:** [https://instapinz.vercel.app/](https://instapinz.vercel.app/)
- **Backend:** Hosted on Render

---

**Created by Nischit Kanthala-groups!!!!** 