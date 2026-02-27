// frontend/scripts/search_client.js
// Search podcasts by artist keyword via the search Lambda

/**
 * Search for podcasts by artist keyword
 * @param {string} keyword - The artist name or keyword to search for
 */
async function searchArtist(keyword) {
  try {
    // Validate input
    if (!keyword || typeof keyword !== "string" || keyword.trim() === "") {
      console.error("Error: Search keyword must be a non-empty string");
      return;
    }

    // Construct the API URL with the keyword as a query parameter
    const apiUrl = `${APP_CONFIG.API_URL}/search?keyword=${encodeURIComponent(keyword.trim())}`;

    // Make the API request
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Check if the response is successful
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    // Parse the JSON response
    const data = await response.json();

    // Render search results
    renderPodcastiles(data);

    return data;
  } catch (error) {
    console.error("Search Error:", error.message);
  }
}

/**
 * Search for podcasts by keyword in id, artist, and title fields
 * @param {string} keyword - The search keyword
 * @param {string} searchType - Optional: specify which field to search ('id', 'artist', 'title', or undefined for all)
 */
async function searchPodcasts(keyword, searchType) {
  try {
    // Validate input
    if (!keyword || typeof keyword !== "string" || keyword.trim() === "") {
      console.error("Error: Search keyword must be a non-empty string");
      return;
    }
    // For 'id' search, use the keyword as-is. For 'artist'/'title', convert to lowercase
    const searchKeyword =
      searchType === "id" ? keyword.trim() : keyword.trim().toLowerCase();

    //console.log(`Searching for: "${searchKeyword}" in ${searchType || 'all fields'}`);

    // Construct the API URL
    const apiUrl = `${APP_CONFIG.API_URL}/search?keyword=${encodeURIComponent(searchKeyword)}`;

    // Make the API request
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    //console.log('Search Results:', data);

    // Render search results
    renderPodcastiles(data);

    //sync playback history once the search is rendered in 3 seconds
    setTimeout(() => {
      syncPlaybackHistory().catch((err) =>
        console.log("Sync failed, but UI is still responsive:", err),
      );
    }, 3000);

    return data;
  } catch (error) {
    console.error("Search Error:", error.message);
    alert("Error: Could not complete search");
  }
}
