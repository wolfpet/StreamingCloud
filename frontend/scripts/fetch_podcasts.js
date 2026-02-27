// frontend/fetch_podcasts.js
// Fetch podcasts from the get_music Lambda via API Gateway

async function fetchPodcasts(options = {}) {
    const {
        limit = 10,
        direction = 'first',
        lastKey = null,
        previousKey = null
    } = options;

    try {
        // Build query parameters
        const params = new URLSearchParams({
            limit: limit,
            direction: direction
        });

        // Add pagination keys if provided
        if (lastKey && direction === 'next') {
            params.append('lastKey', encodeURIComponent(JSON.stringify(lastKey)));
        }
        if (previousKey && direction === 'previous') {
            params.append('previousKey', encodeURIComponent(JSON.stringify(previousKey)));
        }

        // Construct the API URL
        const apiUrl = `${APP_CONFIG.API_URL}/music?${params.toString()}`;
        
        //console.log('Fetching podcasts from:', apiUrl);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch podcasts: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        //console.log('Fetched podcasts:', data);
        
        return data;
    } catch (error) {
        console.error('Error fetching podcasts:', error);
        throw error;
    }
}

