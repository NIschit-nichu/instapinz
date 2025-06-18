import instaloader
import json
import os
from datetime import datetime

def scrape_instagram_posts(username, max_posts=100):
    """
    Scrape posts from a public Instagram account and save to JSON
    
    Args:
        username (str): Instagram username to scrape
        max_posts (int): Maximum number of posts to scrape (default: 100)
    """
    
    # Initialize Instaloader
    L = instaloader.Instaloader()
    
    try:
        # Load profile
        print(f"Fetching profile for @{username}...")
        profile = instaloader.Profile.from_username(L.context, username)
        
        # Store posts data
        posts_data = []
        
        print(f"Fetching up to {max_posts} posts from @{username}...")
        
        # Fetch posts
        for i, post in enumerate(profile.get_posts()):
            if len(posts_data) >= max_posts:
                break
                
            print(f"Processing post {i+1}/{max_posts}...")
            
            post_info = {
                'shortcode': post.shortcode,
                'caption': post.caption,
                'is_video': post.is_video,
                'media_url': post.video_url if post.is_video else post.url,
                'date': post.date_utc.isoformat(),
                'likes': post.likes,
                'comments': post.comments,
                'post_url': f"https://www.instagram.com/p/{post.shortcode}/",
                'thumbnail_url': post.url,
                'owner_username': post.owner_username,
                'location': post.location.name if post.location else None,
                'hashtags': [tag for tag in post.caption.split() if tag.startswith('#')] if post.caption else [],
                'mentions': [tag for tag in post.caption.split() if tag.startswith('@')] if post.caption else []
            }
            
            posts_data.append(post_info)
        
        print(f"Successfully collected {len(posts_data)} posts.")
        
        # Create output filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'{username}_posts_{timestamp}.json'
        
        # Save to JSON file
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'username': username,
                'scraped_at': datetime.now().isoformat(),
                'total_posts': len(posts_data),
                'posts': posts_data
            }, f, indent=2, ensure_ascii=False)
        
        print(f"Data saved to {filename}")
        return filename
        
    except instaloader.exceptions.ProfileNotExistsException:
        print(f"Error: Profile @{username} does not exist or is private.")
        return None
    except instaloader.exceptions.ConnectionException as e:
        print(f"Connection error: {e}")
        print("This might be due to rate limiting. Try again later or use a VPN.")
        return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

def main():
    """Main function to run the scraper"""
    
    print("=== Instagram Post Scraper ===")
    print("This tool scrapes posts from public Instagram accounts")
    print()
    
    # Get username from user input
    username = input("Enter Instagram username to scrape: ").strip()
    
    if not username:
        print("Username cannot be empty!")
        return
    
    # Remove @ if user included it
    username = username.lstrip('@')
    
    # Get number of posts to scrape
    try:
        max_posts = input("Enter number of posts to scrape (default: 100): ").strip()
        max_posts = int(max_posts) if max_posts else 100
    except ValueError:
        print("Invalid number, using default of 100 posts")
        max_posts = 100
    
    print(f"\nStarting scrape for @{username}...")
    print("=" * 50)
    
    # Run the scraper
    result = scrape_instagram_posts(username, max_posts)
    
    if result:
        print(f"\n✅ Success! Data saved to: {result}")
        print(f"📊 Total posts scraped: {max_posts}")
        print("\nYou can now use this JSON file in your web application!")
    else:
        print("\n❌ Scraping failed. Please check the error messages above.")

if __name__ == "__main__":
    main() 