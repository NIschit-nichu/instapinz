# Instagram Post Scraper

This tool allows you to scrape the first 100 posts (images and videos) from any public Instagram account and save them in JSON format.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Scraper

```bash
python scrape_instagram.py
```

### 3. Follow the Prompts

- Enter the Instagram username (e.g., `nasa`, `nike`, `gucci`)
- Enter the number of posts to scrape (default: 100)

## 📋 Features

- ✅ Scrapes up to 100 posts from public Instagram accounts
- ✅ Extracts comprehensive metadata:
  - Post caption and hashtags
  - Media URLs (images/videos)
  - Like and comment counts
  - Post date and location
  - Mentions and hashtags
- ✅ Saves data in structured JSON format
- ✅ Includes error handling for private accounts and rate limiting
- ✅ Progress tracking during scraping

## 📊 Output Format

The scraper creates a JSON file with the following structure:

```json
{
  "username": "target_username",
  "scraped_at": "2024-12-01T18:30:00Z",
  "total_posts": 100,
  "posts": [
    {
      "shortcode": "CX1abcdEFG",
      "caption": "An amazing view of the Earth 🌍",
      "is_video": false,
      "media_url": "https://instagram.com/media_link.jpg",
      "date": "2024-12-01T18:30:00Z",
      "likes": 12345,
      "comments": 234,
      "post_url": "https://www.instagram.com/p/CX1abcdEFG/",
      "thumbnail_url": "https://instagram.com/thumbnail.jpg",
      "owner_username": "target_username",
      "location": "New York, NY",
      "hashtags": ["#space", "#earth"],
      "mentions": ["@nasa"]
    }
  ]
}
```

## ⚠️ Important Notes

### Rate Limiting
- Instagram may temporarily block your IP if you run this too frequently
- If you get rate limited, wait a few hours before trying again
- Consider using a VPN if you need to scrape frequently

### Account Privacy
- This tool only works with **public** Instagram accounts
- Private accounts will return an error

### Legal Considerations
- Only scrape public accounts
- Respect Instagram's Terms of Service
- Use the data responsibly and ethically
- Don't overload Instagram's servers

## 🔧 Troubleshooting

### Common Issues

1. **Profile Not Found Error**
   - Make sure the username is correct
   - Ensure the account is public

2. **Connection Errors**
   - Check your internet connection
   - Try again later (rate limiting)
   - Use a VPN if needed

3. **Permission Errors**
   - Make sure you have write permissions in the current directory

### Getting Help

If you encounter issues:
1. Check that all dependencies are installed correctly
2. Verify the Instagram username is correct and public
3. Try running the script again after a few minutes

## 🎯 Example Usage

```bash
# Install dependencies
pip install -r requirements.txt

# Run the scraper
python scrape_instagram.py

# Enter username when prompted
# Example: nasa

# Enter number of posts (or press Enter for default 100)
# Example: 50
```

## 📁 File Structure

```
project/
├── scrape_instagram.py          # Main scraper script
├── requirements.txt             # Python dependencies
├── INSTAGRAM_SCRAPER_README.md  # This file
└── [username]_posts_[timestamp].json  # Generated output files
```

## 🔄 Integration with Your Web App

The generated JSON files can be easily integrated into your web application:

1. **Copy the JSON file** to your `public/` directory
2. **Update your JavaScript** to load the new data
3. **Display the posts** using the same image display logic

Example integration:
```javascript
// Load the scraped Instagram data
fetch('instagram_posts.json')
  .then(response => response.json())
  .then(data => {
    // Process and display the posts
    displayInstagramPosts(data.posts);
  });
```

## 🚀 Next Steps

Once you have the JSON data, you can:
- Integrate it into your existing dashboard
- Create a gallery view of Instagram posts
- Add filtering by hashtags or date
- Implement search functionality
- Add pagination for large datasets

Happy scraping! 🎉 