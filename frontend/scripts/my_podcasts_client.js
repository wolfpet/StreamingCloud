// frontend/my_podcasts_client.js
// Fetch user's podcasts from the my-podcasts Lambda via API Gateway

async function fetchMyPodcasts(email) {
    try {
        // Validate email parameter
        if (!email) {
            throw new Error('Email parameter is required');
        }

        // Build query parameters
        const params = new URLSearchParams({
            email: email
        });

        // Construct the API URL
        const apiUrl = `${APP_CONFIG.API_URL}/my-podcasts?${params.toString()}`;
        
        console.log('Fetching my podcasts from:', apiUrl);

        const response = await authenticatedFetch(apiUrl, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch my podcasts: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Debug logging
        console.log('=== My Podcasts Response ===');
        console.log('Status Code:', response.status);
        console.log('Full Response Data:', data);
        console.log('Number of Podcasts:', data.count);
        console.log('Podcasts Items:', data.items);
        console.log('===========================');
        
        return data;
    } catch (error) {
        console.error('Error fetching my podcasts:', error);
        throw error;
    }
}
