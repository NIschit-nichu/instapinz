document.addEventListener('DOMContentLoaded', async () => {
    const imageDisplayDiv = document.getElementById('image-display');
    const errorMessageDiv = document.getElementById('error-message');

    try {
        // Fetch media files from both directories
        const mediaResponse = await fetch('https://instapinz-backend.onrender.com/api/media-files');
        if (!mediaResponse.ok) {
            throw new Error(`HTTP error! status: ${mediaResponse.status}`);
        }
        const mediaData = await mediaResponse.json();

        // Fetch existing JSON fashion images
        let fashionImageUrls = [];
        try {
            const jsonResponse = await fetch('fashion_images.json');
            if (jsonResponse.ok) {
                fashionImageUrls = await jsonResponse.json();
            }
        } catch (jsonError) {
            console.warn('Could not load fashion_images.json:', jsonError);
        }

        // Get media files from both directories
        const webdesignsMedia = mediaData.data.webdesigns || [];
        const tobejsonMedia = mediaData.data.tobejson || [];
        
        // Convert media objects to URLs
        const webdesignsUrls = webdesignsMedia.map(item => item.path);
        const tobejsonUrls = tobejsonMedia.map(item => item.path);

        // Combine all media URLs (JSON, webdesigns, tobejson) and shuffle them
        let allMediaUrls = [...fashionImageUrls, ...webdesignsUrls, ...tobejsonUrls];
        allMediaUrls = allMediaUrls.sort(() => 0.5 - Math.random());

        if (!Array.isArray(allMediaUrls) || allMediaUrls.length === 0) {
            errorMessageDiv.textContent = 'No media URLs found to display.';
            return;
        }

        // Modify Unsplash URLs to request smaller dimensions and optimized quality
        const optimizedAllMediaUrls = allMediaUrls.map(url => {
            try {
                // Only optimize Unsplash URLs
                if (url.includes('unsplash.com')) {
                    const urlObj = new URL(url);
                    // Set width to a reasonable size for grid display (e.g., 800px)
                    urlObj.searchParams.set('w', '800'); 
                    // Adjust quality (e.g., 75, lower is more compression)
                    urlObj.searchParams.set('q', '75');
                    // Remove height parameter to let Unsplash determine proportional height
                    urlObj.searchParams.delete('h');
                    return urlObj.toString();
                } else {
                    return url; // Return original URL for local media
                }
            } catch (e) {
                console.warn('Invalid URL encountered, skipping optimization:', url, e);
                return url; // Return original URL if parsing fails
            }
        });

        // Create a mapping to get media type and source info
        const mediaInfoMap = new Map();
        [...webdesignsMedia, ...tobejsonMedia].forEach(item => {
            mediaInfoMap.set(item.path, item);
        });

        // Pagination state
        let currentMediaIndex = 0;
        const PAGE_SIZE = 150;
        const LOAD_MORE_SIZE = 100;
        let allMediaUrlsCache = [];
        let mediaInfoMapCache = new Map();
        let moreButton = null;

        function renderMediaPage(reset = false) {
            if (reset) {
                imageDisplayDiv.innerHTML = '';
                currentMediaIndex = 0;
            }
            // Remove existing more button if present
            if (moreButton && moreButton.parentNode) {
                moreButton.parentNode.removeChild(moreButton);
            }
            const nextIndex = Math.min(currentMediaIndex + (currentMediaIndex === 0 ? PAGE_SIZE : LOAD_MORE_SIZE), allMediaUrlsCache.length);
            for (let i = currentMediaIndex; i < nextIndex; i++) {
                const url = allMediaUrlsCache[i];
                let mediaElement;
                const fileExtension = url.split('.').pop().toLowerCase();
                const mediaInfo = mediaInfoMapCache.get(url);

                if (["mp4", "webm", "ogg", "mov"].includes(fileExtension)) {
                    mediaElement = document.createElement('video');
                    mediaElement.src = url;
                    mediaElement.autoplay = true;
                    mediaElement.loop = true;
                    mediaElement.muted = true;
                    mediaElement.playsInline = true;
                    mediaElement.className = 'w-full h-auto block object-cover rounded-lg shadow-md cursor-pointer';
                    mediaElement.style.aspectRatio = '4/5';
                    mediaElement.addEventListener('click', () => openImageModal(url, mediaInfo));
                } else {
                    mediaElement = document.createElement('img');
                    mediaElement.src = url;
                    mediaElement.alt = 'Fashion Image';
                    mediaElement.className = 'w-full h-auto block object-cover rounded-lg shadow-md cursor-pointer';
                    mediaElement.style.aspectRatio = '4/5';
                    mediaElement.addEventListener('click', () => openImageModal(url, mediaInfo));
                    mediaElement.onerror = () => {
                        console.error(`Failed to load image: ${url}`);
                        mediaElement.style.display = 'none';
                    };
                }

                if (mediaInfo) {
                    const sourceIndicator = document.createElement('div');
                    sourceIndicator.className = 'absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs';
                    sourceIndicator.textContent = mediaInfo.source;

                    const container = document.createElement('div');
                    container.className = 'relative';
                    container.style.width = '100%';
                    container.style.height = 'auto';
                    container.appendChild(mediaElement);
                    container.appendChild(sourceIndicator);

                    imageDisplayDiv.appendChild(container);
                } else {
                    imageDisplayDiv.appendChild(mediaElement);
                }
            }
            currentMediaIndex = nextIndex;
            // Show more button if there are more items
            if (currentMediaIndex < allMediaUrlsCache.length) {
                if (!moreButton) {
                    moreButton = document.createElement('button');
                    moreButton.textContent = 'More';
                    moreButton.className = 'block mx-auto my-8 px-8 py-3 rounded-lg bg-blue-600 text-white font-bold text-lg shadow-md hover:bg-blue-700 transition';
                    moreButton.addEventListener('click', () => {
                        renderMediaPage(false);
                    });
                }
                imageDisplayDiv.parentNode.appendChild(moreButton);
            }
        }

        allMediaUrlsCache = optimizedAllMediaUrls;
        mediaInfoMapCache = mediaInfoMap;
        renderMediaPage(true);

    } catch (error) {
        console.error('Error loading media:', error);
        errorMessageDiv.textContent = 'Failed to load media. Please try again later.';
    }

    // Function to open media in a modal
    function openImageModal(mediaUrl, mediaInfo = null) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.classList.add('fixed', 'inset-0', 'bg-black', 'bg-opacity-75', 'flex', 'items-center', 'justify-center', 'z-50');
        overlay.id = 'image-modal-overlay';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.classList.add('relative', 'bg-white', 'p-4', 'rounded-lg', 'max-w-4xl', 'max-h-full', 'overflow-auto');

        // Create media element (image or video) for modal
        let fullMediaElement;
        const fileExtension = mediaUrl.split('.').pop().toLowerCase();

        if (['mp4', 'webm', 'ogg', 'mov'].includes(fileExtension)) {
            fullMediaElement = document.createElement('video');
            fullMediaElement.src = mediaUrl;
            fullMediaElement.controls = true; // Add controls for modal video
            fullMediaElement.autoplay = true; // Autoplay in modal
            fullMediaElement.loop = true;
            fullMediaElement.muted = false; // Unmute in modal, user can control
            fullMediaElement.playsInline = true;
            fullMediaElement.classList.add('max-w-full', 'max-h-[80vh]', 'object-contain');
        } else {
            fullMediaElement = document.createElement('img');
            fullMediaElement.src = mediaUrl;
            fullMediaElement.alt = 'Full Fashion Image';
            fullMediaElement.classList.add('max-w-full', 'max-h-[80vh]', 'object-contain');
        }

        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;'; // Times symbol
        closeBtn.classList.add('absolute', 'top-2', 'right-2', 'text-gray-700', 'hover:text-gray-900', 'text-4xl', 'font-bold', 'p-2');
        closeBtn.addEventListener('click', closeImageModal);

        modalContent.appendChild(fullMediaElement);
        modalContent.appendChild(closeBtn);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);

        // Close modal when clicking outside the image
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeImageModal();
            }
        });
    }

    // Function to close the image modal
    function closeImageModal() {
        const overlay = document.getElementById('image-modal-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
}); 