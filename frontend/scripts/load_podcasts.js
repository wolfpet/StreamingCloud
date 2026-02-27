async function loadPodcasts(options = {}) {
  //cleanup old playback history before we fetch anything.
  cleanOldPlaybackHistory();
  try {
    const data = await fetchPodcasts(options);
    //console.log("Loaded podcasts:", data);

    const feedContainer = document.getElementById("feed");

    // Initialize pagination key history stack if not already done
    if (!feedContainer.paginationHistory) {
      feedContainer.paginationHistory = [null]; // Start with null (first page)
    }

    // Store pagination state from response
    feedContainer.nextKey = data.lastEvaluatedKey || null;
    feedContainer.previousKey = null; // No previous on first load

    // Render podcasts
    renderPodcastiles(data);

    // sync playback history with backend in the background without blocking the UI
    // delay this launch of sync by 3 seconds to ensure it doesn't interfere 
    // with the initial loading and rendering of the podcasts, providing a smoother user experience.
    setTimeout(() => {
      syncPlaybackHistory().catch((err) =>
        console.log("Sync failed, but UI is still responsive:", err),
      );
    }, 3000);

    updatePaginationButtons();
  } catch (error) {
    console.error("Error loading podcasts:", error);
    updatePaginationButtons();
  }
}

async function loadNextPage() {
  cleanOldPlaybackHistory();
  const feedContainer = document.getElementById("feed");
  const nextBtn = document.getElementById("next-btn");

  if (!feedContainer.nextKey) {
    //console.log("No next page available");
    return;
  }

  nextBtn.disabled = true;
  nextBtn.textContent = "Loading...";

  try {
    const data = await fetchPodcasts({
      direction: "next",
      lastKey: feedContainer.nextKey,
    });

    // Push current nextKey onto history stack before moving forward
    feedContainer.paginationHistory.push(feedContainer.nextKey);

    // Update state: next becomes current, response key becomes next
    feedContainer.nextKey = data.lastEvaluatedKey || null;
    feedContainer.previousKey =
      feedContainer.paginationHistory[
        feedContainer.paginationHistory.length - 2
      ] || null;

    // Render podcasts
    renderPodcastiles(data);

    // sync playback history with backend in the background without blocking the UI
    syncPlaybackHistory().catch((err) =>
      console.log("Sync failed, but UI is still responsive:", err),
    );

    updatePaginationButtons();
  } catch (error) {
    console.error("Error loading next page:", error);
    updatePaginationButtons();
  }
}

async function loadPreviousPage() {
  cleanOldPlaybackHistory();
  const feedContainer = document.getElementById("feed");
  const prevBtn = document.getElementById("prev-btn");

  if (
    !feedContainer.previousKey &&
    feedContainer.paginationHistory.length <= 1
  ) {
    //console.log("No previous page available");
    return;
  }

  prevBtn.disabled = true;
  prevBtn.textContent = "Loading...";

  try {
    // Pop the current page key from history and go to previous
    feedContainer.paginationHistory.pop();
    const previousStartKey =
      feedContainer.paginationHistory[
        feedContainer.paginationHistory.length - 1
      ] || null;

    //console.log("Going back to key:", previousStartKey);
    //console.log("History stack:", feedContainer.paginationHistory);

    const data = await fetchPodcasts({
      direction: previousStartKey ? "next" : "first",
      lastKey: previousStartKey,
    });

    // Update state
    feedContainer.nextKey = data.lastEvaluatedKey || null;
    feedContainer.previousKey =
      feedContainer.paginationHistory.length > 1
        ? feedContainer.paginationHistory[
            feedContainer.paginationHistory.length - 1
          ]
        : null;

    // Render podcasts
    renderPodcastiles(data);

    // sync playback history with backend in the background without blocking the UI
    syncPlaybackHistory().catch((err) =>
      console.log("Sync failed, but UI is still responsive:", err),
    );

    updatePaginationButtons();
  } catch (error) {
    console.error("Error loading previous page:", error);
    updatePaginationButtons;
  }
}

function updatePaginationButtons() {
  const feedContainer = document.getElementById("feed");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  // Update Previous button - can go back if history has more than current page
  if (
    feedContainer.paginationHistory &&
    feedContainer.paginationHistory.length > 1
  ) {
    prevBtn.disabled = false;
    prevBtn.textContent = "Previous";
  } else {
    prevBtn.disabled = true;
    prevBtn.textContent = "Previous";
  }

  // Update Next button
  if (feedContainer.nextKey) {
    nextBtn.disabled = false;
    nextBtn.textContent = "Next";
  } else {
    nextBtn.disabled = true;
    nextBtn.textContent = "Next";
  }
}

async function loadMyPodcasts(email) {
  if (!email || email.trim() === "" || email.includes("@") == false) {
    console.error("Email is required to load my podcasts");
    return;
  }
  try {
    document.getElementById("generalDialog").hide(); //close general dialog just in case it's open
    const data = await fetchMyPodcasts(email);
    console.log("Loaded my podcasts:", data);
    // Further processing can be done here
    renderPodcastiles(data);
    //hide pagination controls for my podcasts view
    document.getElementById("pagination-controls").style.display = "none";
    //update feed heading
    const feedHeading = document.getElementById("feed-heading");
    feedHeading.textContent = "My Uploads";
  } catch (error) {
    console.error("Error loading my podcasts:", error);
  }
}

async function loadMyBookmarks() {
  const user = await getUserInfo();
  if (!user || !user.email) {
    showAlert("You need to be logged in to view bookmarks.", "warning");
    return;
  }

  try {
    document.getElementById("generalDialog").hide(); // close general dialog just in case it's open
    const data = await fetchMyBookmarks(user.email);
    //console.log("Loaded my bookmarks:", data);
    
    // Render bookmarks using the same function as podcasts
    renderPodcastiles(data);
    
    // Hide pagination controls for bookmarks view
    document.getElementById("pagination-controls").style.display = "none";
    
    // Update feed heading
    const feedHeading = document.getElementById("feed-heading");
    feedHeading.textContent = "My Bookmarks";

    // where have I left off?
    syncPlaybackHistory().catch((err) =>
      console.log("Sync failed, but UI is still responsive:", err),
    );
  } catch (error) {
    console.error("Error loading my bookmarks:", error);
    showAlert("Failed to load bookmarks: " + error.message, "error");
  }
}

async function fetchMyBookmarks(email) {
  try {
    const response = await authenticatedFetch(
      `${APP_CONFIG.API_URL}/get-bookmarks?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch bookmarks: ${response.status}`);
    }

    const result = await response.json();
    // Mark data as bookmarks so renderPodcastiles knows to render them as such
    result.isBookmark = true;
    //console.log("Fetched bookmarks:", result);
    return result;
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    throw error;
  }
}

async function deleteBookmark(email, bookmarkId) {
  try {
    const response = await authenticatedFetch(`${APP_CONFIG.API_URL}/delete-bookmark`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, id: bookmarkId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete bookmark: ${response.status}`);
    }

    const result = await response.json();
    //console.log("Bookmark deleted:", result);
    return result;
  } catch (error) {
    console.error("Error deleting bookmark:", error);
    throw error;
  }
}

function renderPodcastiles(data) {
  const feedContainer = document.getElementById("feed");
  clearFeed();
  //
  // Handle empty results
  if (!data || !data.items || data.items.length === 0) {
    //console.log('No results found');
    const heading = data?.keyword
      ? `No Music Found: "${data.keyword}"`
      : "No podcasts to render";
    document.getElementById("feed-heading").textContent = heading;
    if (data?.keyword) {
      showAlert(
        "<strong>Your search returned no results.</strong><br /> Sorry about that!",
        "warning",
      );
    }
    return;
  }

  // Set heading for search results
  if (data.keyword) {

    //check if the data.keyword contains "_artt15sts:" and if it does, replace it with "Artist(s): "
    let keywordDisplay = data.keyword;
    if (keywordDisplay.includes("_artt15sts:")) {
      keywordDisplay = keywordDisplay.replace(/_artt15sts:/g, "Artist(s): ");
      //replace each word's first letter after "Artist(s): " with uppercase and the rest with lowercase. For example, if the keyword is "Artist(s): john doe, jane smith", it should be displayed as "Artist(s): John Doe, Jane Smith"
      keywordDisplay = keywordDisplay.replace(/(Artist\(s\): )(.*)/, (match, p1, p2) => {
        const artists = p2.split(",").map(artist => {
          artist = artist.trim();
          return artist.charAt(0).toUpperCase() + artist.slice(1).toLowerCase();
        });
        return p1 + artists.join(", ");
      });
    }
    document.getElementById("feed-heading").textContent =
      `Search Results for "${keywordDisplay}" (${data.count} ${data.count === 1 ? "result" : "results"})`;
     //add copy to clipboard svg sl-button for search keyword
    const copyBtn = document.createElement("sl-button");
    copyBtn.setAttribute("size", "large");
    copyBtn.setAttribute("variant", "text");
    const copyIcon = document.createElement("sl-icon");
    copyIcon.setAttribute("name", "copy");
    copyBtn.appendChild(copyIcon);
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText( `${window.location.origin}/?search=${data.keyword}`).then(() => {
        showAlert("<strong>Search link copied to clipboard!</strong><br />You can share it now by pasting anywhere.", "success");
      });
    });
    const copyTooltip = document.createElement("sl-tooltip");
    copyTooltip.setAttribute("content", "Copy to clipboard");
    copyTooltip.setAttribute("placement", "bottom");
    copyTooltip.appendChild(copyBtn);
    document.getElementById("feed-heading").appendChild(copyTooltip);
  }

  const paginationControls = document.getElementById("pagination-controls");

  // Render podcasts as soundcloud-track components
  data.items.forEach((podcast) => {
    const soundcloudTrack = document.createElement("soundcloud-track");

    // Set attributes from podcast data
    soundcloudTrack.setAttribute("artist", podcast.artist || "");
    soundcloudTrack.setAttribute("title", podcast.title || "");    
    soundcloudTrack.setAttribute("trackId", podcast.id || "");
    soundcloudTrack.setAttribute("duration", podcast.duration || 0);
    soundcloudTrack.setAttribute(
      "waveform",
      podcast.waveformUrl || "dummy_waveform.png",
    );
    // Set isBookmark attribute if this is a bookmark view
    if (data.isBookmark) {
      soundcloudTrack.setAttribute("isBookmark", "true");
    }

    // For debugging purposes we use localhost and not the proper site URL. 
    // So, in such case  we must force the full s3 url to mp3, 
    // because the relative path that would normally redirect to CloudFront won't work locally
    // For that purpos we'll check if the app is running on localhost and if it is, we'll construct the full S3 URL for the audio file. Otherwise, we'll use the relative URL which will work correctly in production with CloudFront.

    const audioUrl = window.location.origin + "/" + podcast.audioUrlRelative;
    //check if the navigator is accessing localhost
    if (window.location.hostname === "localhost") {
      //console.log("Localhost detected. Using full S3 URL for audio.");
      soundcloudTrack.setAttribute("audioUrl", podcast.audioUrl || "");
    } else {
      soundcloudTrack.setAttribute("audioUrl", audioUrl || "");
    }

    //same idea is for the album artwork. If we're on localhost, we need to use the full S3 URL for the artwork, otherwise we can use the relative URL which will work with CloudFront in production.
    const artworkFilename = podcast.artwork.split("/").pop();
    const artworkUrl = window.location.origin + "/uploads/" + artworkFilename;
    if (window.location.hostname === "localhost") {
      //console.log("Localhost detected. Using full S3 URL for artwork.");
      soundcloudTrack.setAttribute("artwork", podcast.artwork || "");
    } else {
      soundcloudTrack.setAttribute("artwork", artworkUrl || "");
    } 

    // Insert before pagination controls
    if (paginationControls) {
      feedContainer.insertBefore(soundcloudTrack, paginationControls);
    } else {
      feedContainer.appendChild(soundcloudTrack);
    }
  });

  // Hide pagination for search results
  if (paginationControls && data.keyword) {
    paginationControls.style.display = "none";
  }

  // Scroll to top

  feedContainer.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });


  //console.log(`Rendered ${data.items.length} podcasts`);

  // Attach click listeners to waveform containers after rendering
  // Use a small delay to ensure Web Components shadow DOM is fully rendered
  setTimeout(() => {
    attachWaveformClickListeners();
    attachWaveformSliderListeners();

    // Restore timestamps from localStorage
    const tracks = feedContainer.querySelectorAll("soundcloud-track");
    tracks.forEach((track) => {
      const key = `track_${track.trackId}_time`;      
      const savedTime = localStorage.getItem(key);
      const timestamp = track.shadowRoot?.querySelector(".timestamp");
      if (savedTime) {        
        if (timestamp) {
          const currentTime = Math.floor(savedTime);
          const formattedCurrentTime = formatTime(currentTime);
          timestamp.innerHTML =
            formattedCurrentTime +
            " / " +
            formatTime(parseFloat(track.getAttribute("duration")) || 0);

          const waveformProgress = track.shadowRoot?.querySelector(".waveform-progress");
          const duration = parseFloat(track.getAttribute("duration")) || 0;
          const playbackPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
          if (waveformProgress) {
            waveformProgress.style.width = playbackPercentage + "%";
          } else {
            console.warn(`waveformProgress not found for track ${track.trackId}`);
          }
          // Set background-size to match full container width (same as timeupdate in play.js)
          if (playbackPercentage > 0) {
            const backgroundSizePercentage = (100 / playbackPercentage) * 100;
            if (waveformProgress) {
              waveformProgress.style.backgroundSize =
                backgroundSizePercentage + "% 100%";
            }
          }
          //set the range's current value to match the saved timestamp
          const waveformSlider = track.shadowRoot?.querySelector(".waveform-slider");
          if (waveformSlider) {
            waveformSlider.value=playbackPercentage;
          } 

          //remove 'display: none' from .artwork-overlay if the playbackpercentage > 97
          if (playbackPercentage > 97) {
            const artworkOverlay =
              track.shadowRoot?.querySelector(".artwork-overlay");
            if (artworkOverlay) {
              artworkOverlay.style.display = "block";
            }
          }
        }
      } else {
        //console.log("No saved timestamp for track", track.trackId);
        if (timestamp) {
          timestamp.innerHTML =
            "0:00 / " +
            formatTime(parseFloat(track.getAttribute("duration")) || 0);
        }
      }
    });
  }, 100);
  // If audio is playing, re-establish currentPlayingTrack reference after re-rendering
  if (audio.src) {
    const allTracks = feedContainer.querySelectorAll("soundcloud-track");
    currentPlayingTrack =
      Array.from(allTracks).find((t) => t.audioUrl === audio.src) || null;
    // Sync icons to highlight the currently playing track and show play/pause state
    syncIcons();
  }
}


async function syncPlaybackHistory() { 
  // First check if sync across devices is enabled. If not, skip the sync process.
  if(!window.SYNC_ACROSS_DEVICES) {
    //console.log("Sync across devices is disabled, skipping syncPlaybackHistory.");
    return;
  }
  // check if the user is logged in. if not then return early
  const user = await getUserInfo();
  if (!user || !user.email) {
    //console.log("User not logged in, skipping playback history sync");
    return;
  }
  //console.log("Syncing playback history for user:", user.email);
  //get a list of tracks ids in the feed and check if any of them have a saved timestamp in localStorage. If they do, then add them to the list with the time value. if not add them with 0 as the time value.
  const feedContainer = document.getElementById("feed");
  const tracks = feedContainer.querySelectorAll("soundcloud-track");
  const playbackHistory = [];
  tracks.forEach((track) => {
    const key = `track_${track.trackId}_time`;
    const expiredKey = `track_${track.trackId}_expired`;
    const savedTime = localStorage.getItem(key);
    const expiredAt = localStorage.getItem(expiredKey);
    
    if (expiredAt && savedTime) {
      // Track was previously expired but user played it again — clear the expired marker
      localStorage.removeItem(expiredKey);
    } else if (expiredAt) {
      // Check if the expired marker itself has aged out (7 days).
      // This allows cross-device sync to recover if the track was replayed on another device.
      const expiredAge = Date.now() - parseInt(expiredAt);
      const EXPIRED_MARKER_TTL = (window.APP_CONFIG?.EXPIRED_MARKER_TTL_DAYS || 7) * 24 * 60 * 60 * 1000;
      if (expiredAge > EXPIRED_MARKER_TTL) {
        // Expired marker has aged out — remove it and allow sync again
        localStorage.removeItem(expiredKey);
      } else {
        // Track was explicitly cleaned up and not played again — skip
        return;
      }
    }
    
    playbackHistory.push({
      trackId: track.trackId,
      time: savedTime ? parseFloat(savedTime) : 0,
    });
  });

  //create a payload json that includes the user's email and the list of track ids with their corresponding time values.
  const payload = {
    email: user.email,
    playbackHistory: playbackHistory,
  };
  //console.log("Playback history payload:", payload);

  //call history sync API endpoint with the payload
  try {
    const response = await authenticatedFetch(`${APP_CONFIG.API_URL}/history-sync`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync history: ${response.status}`);
    }

    const remoteHistory = await response.json();

    // console.log("Remote history response:", remoteHistory);
    // the backend will return a list of track ids with their corresponding time 
    // values that are higher than the local time values. 
    // Update localStorage with these values.    

    remoteHistory.backendTracks.forEach((track) => {
      const key = `track_${track.trackId}_time`;
      const savedAtkey =`track_${track.trackId}_saved`;
      localStorage.setItem(key, track.time);
      localStorage.setItem(savedAtkey, Date.now()); //this is to clenup the old ones later

      //console.log(`Updated local time for track ${track.trackId} to ${track.time}`);
      //adjust the timestamps from all tracks in the feed except the one that is currently playing. The currently playing track will be updated in real-time as the user listens to it, so we don't want to overwrite that timestamp with a potentially higher value from the backend.
      if (
        !currentPlayingTrack ||
        currentPlayingTrack.trackId !== track.trackId
      ) {
        const timestamp = feedContainer
          .querySelector(`soundcloud-track[trackId="${track.trackId}"]`)
          ?.shadowRoot?.querySelector(".timestamp");
        if (timestamp) {
          timestamp.innerHTML =
            formatTime(track.time) +
            " / " +
            formatTime(
              parseFloat(
                feedContainer
                  .querySelector(`soundcloud-track[trackId="${track.trackId}"]`)
                  ?.getAttribute("duration"),
              ) || 0,
            );
        }
        // Also update the waveform progress for these tracks
        const waveformProgress = feedContainer
          .querySelector(`soundcloud-track[trackId="${track.trackId}"]`)
          ?.shadowRoot?.querySelector(".waveform-progress");
        const duration =
          parseFloat(
            feedContainer
              .querySelector(`soundcloud-track[trackId="${track.trackId}"]`)
              ?.getAttribute("duration"),
          ) || 0;
        const playbackPercentage =
          duration > 0 ? (track.time / duration) * 100 : 0;
        if (waveformProgress) {
          waveformProgress.style.width = `${playbackPercentage}%`;
          // Set background-size to match full container width (same as timeupdate in play.js)
          if (playbackPercentage > 0) {
            const backgroundSizePercentage = (100 / playbackPercentage) * 100;
            waveformProgress.style.backgroundSize = backgroundSizePercentage + "% 100%";
          }
        }
        //also update the waveform slider if it exists
        const waveformSlider = feedContainer
          .querySelector(`soundcloud-track[trackId="${track.trackId}"]`)
          ?.shadowRoot?.querySelector(".waveform-slider");  
       if (waveformSlider) {
        //set the range's current value to match the updated timestamp
        waveformSlider.value = playbackPercentage;
       }   
      }
    });

    return remoteHistory;
  } catch (error) {
    console.error("Error syncing playback history:", error);
    return null;
  }
}

function clearFeed() {
  window.history.replaceState({}, document.title, window.location.pathname);
  const feedContainer = document.getElementById("feed");
  const tracks = feedContainer.querySelectorAll(
    "soundcloud-track, .bookmark-card",
  );
  tracks.forEach((track) => track.remove());
}

//URL Rewriting trick to display a single track that has been passed as a query parameter
const urlParams = new URLSearchParams(window.location.search);
const trackParam = urlParams.get("track");
const searchParam = urlParams.get("search");
//console.log("URL Search Params:", window.location.search);
//console.log("Track Parameter:", trackParam);

if (trackParam) {
  //console.log(`Found track parameter: ${trackParam}, calling searchPodcasts...`);
  searchPodcasts(trackParam, "id");
  document.getElementById("pagination-controls").style.display = "none";
  //update feed heading
  const feedHeading = document.getElementById("feed-heading");
  feedHeading.textContent = ``;
} else if (searchParam) {
  //console.log(`Found search parameter: ${searchParam}, calling searchPodcasts...`);
  searchPodcasts(searchParam, "keyword");
  document.getElementById("pagination-controls").style.display = "none";
  //update feed heading
  const feedHeading = document.getElementById("feed-heading");
  feedHeading.textContent = `Search results for "${searchParam}"`;
} else {
  //console.log("No track parameter found, loading all podcasts");
  loadPodcasts();
}

function cleanOldPlaybackHistory(){
  const maxAgeInDays = window.APP_CONFIG?.PLAYBACK_HISTORY_TTL_DAYS || 100; 
  const now = Date.now();
  const maxAge = maxAgeInDays * 24 * 60 * 60 * 1000;
  for (let i = 0; i < localStorage.length; i++) {    
    const key = localStorage.key(i);
    if (key.startsWith("track_") && key.endsWith("_saved")) {
      const savedAt = parseInt(localStorage.getItem(key));
      if (now - savedAt > maxAge) {
        const trackId = key.replace("_saved", "").split("_")[1];
        localStorage.removeItem(`track_${trackId}_time`);
        localStorage.removeItem(key);
        // Mark this track as cleaned up so syncPlaybackHistory knows not to re-fetch it.
        // Store a timestamp so the marker itself can expire after 7 days,
        // allowing cross-device sync to recover if the track is replayed on another device.
        localStorage.setItem(`track_${trackId}_expired`, Date.now().toString());
        console.log(`Removed old playback history for track ${trackId}`);
      }
    }
  }
}



// Add event listeners
document
  .getElementById("prev-btn")
  ?.addEventListener("click", loadPreviousPage);
document.getElementById("next-btn")?.addEventListener("click", loadNextPage);
