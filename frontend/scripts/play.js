// play.js: everything about playing audio and syncing the play/pause icons and waveform progress

const audio = document.getElementById("main-audio");
const playerTitle = document.getElementById("player-title");
const playerArtist = document.getElementById("player-artist");
const playerArt = document.getElementById("player-art");
let currentPlayingTrack = null;
let player = null;

// Initialize Plyr when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  player = new Plyr("#main-audio", {
    controls: [
      "play-large",
      "play",
      "progress",
      "current-time",
      "duration",
      "mute",
      "volume",
    ],
    tooltips: { controls: true, seek: true },
  });

  attachWaveformClickListeners();
  observer.observe(document.body, observerConfig);

  // Spacebar to play/pause
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {      
      //if searchInput is not focused
      const activeElement = document.activeElement;
      if (activeElement !== searchInput) {
        e.preventDefault();
        playTheFirstTrackInFeed();        
      }

    }
  });
  /*
  //plyr play button when nothing is loaded yet
  document.getElementById("play-button").addEventListener("click", function () {
    if (!audio.src) {
      playTheFirstTrackInFeed();
    } else {
      audio.paused ? audio.play() : audio.pause();
    }
  });
  */
 
});

playTheFirstTrackInFeed = function () {
  //check if audio has a source
  if (!audio.src || audio.src == window.location.origin + "/") {
    //look through the set of tracks in the current feed and find the first one with 
    //artwork-overlay display: none, then play it. This ensures we skip tracks we've already finished.
    //select the first track in the feed and play it
    //console.log("Looking for the first track in the feed to play...");

    const allTracks = document.querySelectorAll("soundcloud-track");
    const firstUnfinishedTrack = Array.from(allTracks).find((track) => {
      const artworkOverlay = track.shadowRoot?.querySelector(".artwork-overlay");
      const displayValue = artworkOverlay?.style.display;
      // Match tracks where display is "none" or not explicitly set (empty string)
      return artworkOverlay && (displayValue === "none" || displayValue === "");
    });

    if (firstUnfinishedTrack) {
   
      document.dispatchEvent(
        new CustomEvent("request-play", {
          detail: {
            audioUrl: firstUnfinishedTrack.getAttribute("audioUrl"),
            title: firstUnfinishedTrack.getAttribute("title"),
            artist: firstUnfinishedTrack.getAttribute("artist"),
            artwork: firstUnfinishedTrack.getAttribute("artwork"),
          },
        }),
      );
      setTimeout(() => {
        isProcessingPlayRequest = false;
      }, 200);
    }
  } else {
    audio.paused ? audio.play() : audio.pause();
    syncIcons();
  }
};

function syncIcons() {
  const allTracks = document.querySelectorAll("soundcloud-track");
  allTracks.forEach((t) => {
    // This updates the 'active' property, which triggers Lit to re-render the SVG
    t.active = t.audioUrl === audio.src && !audio.paused;    
  });
}

function attachWaveformClickListeners() {
  const allTracks = document.querySelectorAll("soundcloud-track");
  allTracks.forEach((track) => {
    const waveformContainer = track.shadowRoot?.querySelector(
      ".waveform-container",
    );
    if (waveformContainer && !waveformContainer.hasListener) {
      // Add click listener to the container
      waveformContainer.addEventListener("click", (e) => {
        const rect = waveformContainer.getBoundingClientRect();
        const clickPercentage = (e.clientX - rect.left) / rect.width;

        // If this track is not currently playing, request play first
        if (currentPlayingTrack !== track) {
          document.dispatchEvent(
            new CustomEvent("request-play", {
              detail: {
                audioUrl: track.getAttribute("audioUrl"),
                title: track.getAttribute("title"),
                artist: track.getAttribute("artist"),
                artwork: track.getAttribute("artwork"),
              },
            }),
          );

          // Wait for audio to load before seeking
          if (audio.readyState >= 1) {
            // Audio is ready
            audio.currentTime = clickPercentage * audio.duration;
          } else {
            // Wait for loadedmetadata event
            audio.addEventListener(
              "loadedmetadata",
              () => {
                audio.currentTime = clickPercentage * audio.duration;
              },
              { once: true },
            );
          }
        } else {
          // Track is already playing, seek directly
          audio.currentTime = clickPercentage * audio.duration;
        }
      });

      // Mark that listener has been attached
      waveformContainer.hasListener = true;
    }
  });
}

function attachWaveformSliderListeners() {
  const allTracks = document.querySelectorAll("soundcloud-track");
  allTracks.forEach((track) => {
    const waveformSlider = track.shadowRoot?.querySelector(
      ".waveform-slider",
    );
    if (waveformSlider && !waveformSlider.hasListener) {
      // Add input listener for seeking
      waveformSlider.addEventListener("input", (e) => {
        const sliderPercentage = parseFloat(e.target.value) / 100;
        
        // If this track is not currently playing, request play first
        if (currentPlayingTrack !== track) {
          document.dispatchEvent(
            new CustomEvent("request-play", {
              detail: {
                audioUrl: track.getAttribute("audioUrl"),
                title: track.getAttribute("title"),
                artist: track.getAttribute("artist"),
                artwork: track.getAttribute("artwork"),
              },
            }),
          );

          // Wait for audio to load before seeking
          if (audio.readyState >= 1) {
            const newTime = sliderPercentage * audio.duration;
            if (isFinite(newTime)) {
              audio.currentTime = newTime;
            }
          } else {
            audio.addEventListener(
              "loadedmetadata",
              () => {
                const newTime = sliderPercentage * audio.duration;
                if (isFinite(newTime)) {
                  audio.currentTime = newTime;
                }
              },
              { once: true },
            );
          }
        } else {
          // Track is already playing, seek directly
          const newTime = sliderPercentage * audio.duration;
          if (isFinite(newTime)) {
            audio.currentTime = newTime;
          }
        }
      });

      // Mark that listener has been attached
      waveformSlider.hasListener = true;
    }
  });
}

document.addEventListener("request-play", (e) => {
  const track = e.detail;

  if (audio.src === track.audioUrl) {
    audio.paused ? audio.play() : audio.pause();
  } else {
    audio.src = track.audioUrl;

    // Find and store the currently playing track element
    const allTracks = document.querySelectorAll("soundcloud-track");
    currentPlayingTrack = Array.from(allTracks).find(
      (t) => t.audioUrl === track.audioUrl,
    );

    if (playerTitle) playerTitle.innerText = track.title;
    if (playerArtist) playerArtist.innerText = track.artist;
    if (playerArt) {
      playerArt.src = track.artwork;
      playerArt.style.display = "block";
    }
    // let's see if we played this set before and have a saved position in the timestamp footer
    // was i here before?
    var lastTimestamp =
      currentPlayingTrack.shadowRoot?.querySelector(".timestamp").innerHTML;
    if (lastTimestamp && lastTimestamp != ".") {
      //indeed I was therem let's set mainAudio.currentTime
      var parsedTimestamp = getSubstringBeforeChar(lastTimestamp, "/");
      var parsedTimestampInSec = convertMmSsToSeconds(parsedTimestamp);
      audio.currentTime = parsedTimestampInSec;
    }
    //check if the album art is png or jpeg
    const albumArtType = track.artwork.endsWith(".png") ? "image/png" : "image/jpeg";

    //Media Session magic for showing the correct title and artwork on the lock screen and notification center, bluetooth and such.
    
    if ('mediaSession' in navigator) {  
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: [
          { src: track.artwork, sizes: '512x512', type: albumArtType }
        ]
      });
    }
    audio.play();
  }
  syncIcons();
  attachWaveformClickListeners();  
});

//audio.addEventListener("play", syncIcons);
audio.addEventListener('play', () => {
  // If play is clicked but no source is loaded, load the first track
  if (!audio.src) {
    audio.pause(); // Cancel the play attempt
    playTheFirstTrackInFeed();
  } else {
    syncIcons();
  }
});
audio.addEventListener("pause", () => {
  syncIcons();  
});

let lastUpdateTime = 0;
const THROTTLE_INTERVAL = 1000; // in milliseconds
audio.addEventListener("timeupdate", () => {
  const now = Date.now();
    // Only update if 1 second has passed since last update
  if (now - lastUpdateTime < THROTTLE_INTERVAL) {
    return;
  }
  lastUpdateTime = now;
  if (currentPlayingTrack && audio.duration) {
    const waveformProgress =
      currentPlayingTrack.shadowRoot?.querySelector(".waveform-progress");
    if (waveformProgress) {
      const playbackPercentage = (audio.currentTime / audio.duration) * 100;
      waveformProgress.style.width = playbackPercentage + "%";
      // Dynamically size the background so the orange waveform matches the full container width
      // Formula: if progress is at 50%, background should be at 200% to show left half of full image
      if (playbackPercentage > 0) {
        const backgroundSizePercentage = (100 / playbackPercentage) * 100;
        waveformProgress.style.backgroundSize = backgroundSizePercentage + "% 100%";
        //update range element in the track footer
        const waveformSlider = currentPlayingTrack.shadowRoot?.querySelector(".waveform-slider");
        if (waveformSlider) {
          waveformSlider.value = playbackPercentage;
        }
      }
      //remove 'display: none' from .artwork-overlay if the playbackpercentage > 97 and artwork-overlay is not already visible
      const artworkOverlay = currentPlayingTrack.shadowRoot?.querySelector(".artwork-overlay");
      if (playbackPercentage > 97) {
        if (artworkOverlay) {
          artworkOverlay.style.display = "block";
        }
      }
      else {
        if (artworkOverlay) {
          artworkOverlay.style.display = "none";
        }
      }
      //update the timestamp in the footer
      const trackFooterTimestamp = currentPlayingTrack.shadowRoot?.querySelector(".timestamp");
      const currentTime = Math.floor(audio.currentTime);
      const duration = Math.floor(audio.duration);
      const formattedCurrentTime = formatTime(currentTime);
      const formattedDuration = formatTime(duration);
      if (trackFooterTimestamp) {
        trackFooterTimestamp.innerHTML =
          formattedCurrentTime + " / " + formattedDuration;
      }

      //SAVE PROGRES TO RESUME LATER

      // Initialize progressCounter if it doesn't exist
      if (!currentPlayingTrack.progressCounter) {
        currentPlayingTrack.progressCounter = 0;
      }
      if (!currentPlayingTrack.onlineSyncCounter) {
        currentPlayingTrack.onlineSyncCounter = 0;
      }

      // Increment progressCounter
      currentPlayingTrack.progressCounter++;
      currentPlayingTrack.onlineSyncCounter++;
      // Save to localStorage every 10th update
      if (currentPlayingTrack.progressCounter % 10 === 0) {
        const key = `track_${currentPlayingTrack.trackId}_time`;
        const savedAtkey =`track_${currentPlayingTrack.trackId}_saved`;
        const expiredKey = `track_${currentPlayingTrack.trackId}_expired`;
        //console.log(`Saving progress to localStorage: ${key} = ${currentTime}s (saved at ${new Date().toISOString()})`);
        localStorage.setItem(key, currentTime);
        localStorage.setItem(savedAtkey, Date.now());
        // Clear expired marker if track is being played again
        localStorage.removeItem(expiredKey);
        //console.log("TrackID:", currentPlayingTrack.trackId, "Time:", formattedCurrentTime);
        currentPlayingTrack.progressCounter = 0; // Reset counter
      }
      // Sync with backend every 30th update (approximately every 30 seconds)
      if (currentPlayingTrack.onlineSyncCounter % 60 === 0) {
        syncTrack().catch((err) =>
          console.log("Track sync failed, but playback continues:", err),
        );
        currentPlayingTrack.onlineSyncCounter = 0; // Reset counter
      }
      
    }
  }
});

// Use MutationObserver to watch for dynamically added cards
const observerConfig = { childList: true, subtree: true };
const observer = new MutationObserver(() => {
  attachWaveformClickListeners();
});

//pause on mobile
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('pause', () => {
    //alert("Pause command received from media session API");    
    syncTrack().catch((err) =>
      console.log("Sync failed, but UI is still responsive:", err),
    );
    audio.pause();
  });
}

//autoplay feature
audio.addEventListener('ended', function() {
  // Track has finished playing
  console.log('Track has ended');
  //check if the user has enabled autoplay in localStorage
  if (localStorage.getItem("autoPlay") === "true") {
    console.log("Autoplay is enabled, playing the next track...");
    //reset the ausio source so that the next play request will load the new track
    audio.src = "";
    //wait for a second before playing the next track to ensure the audio element is ready
    setTimeout(() => {
      playTheFirstTrackInFeed();
    }, 1000);
    
  }
});


//My little helpers

async function syncTrack() {
  // This function is called on timeupdate event of the audio element. 
  // It sends the current track id and current time to the backend to be saved in the database. 
  // This allows us to keep the playback history in sync between different devices and sessions.
  if(!window.SYNC_ACROSS_DEVICES) {
    //console.log("Sync across devices is disabled, skipping syncTrack");
    return;
  }
  
  const email = localStorage.getItem("userEmail");
  if (!email) {
    //console.log("User not logged in, skipping track sync");
    return;
  }

  if (!currentPlayingTrack || !currentPlayingTrack.trackId) {
    //console.log("No track is currently playing, skipping sync");
    return;
  }

  try {
    const payload = {
      email: email,
      trackId: currentPlayingTrack.trackId,
      time: Math.floor(audio.currentTime),
    };

    const response = await authenticatedFetch(`${APP_CONFIG.API_URL}/track-sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Track sync failed: ${response.status}`);
      return;
    }

    const result = await response.json();
    //console.log(`Track synced: ${currentPlayingTrack.trackId} at ${Math.floor(audio.currentTime)}s (${result.action})`);
  } catch (error) {
    console.error("Error syncing track:", error);
    // Don't block playback even if sync fails
  }
}

function formatTime(secs) {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = Math.floor(secs % 60);
  
  // Format: h:mm:ss if hours > 0, otherwise m:ss
  if (hours > 0) {
    return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function convertMmSsToSeconds(timeString) {
  // Split the string by the colon delimiter
  const parts = timeString.split(":");

  // Handle both h:mm:ss and m:ss formats
  if (parts.length === 3) {
    // h:mm:ss format
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    return hours * 3600 + minutes * 60 + seconds;
  } else {
    // m:ss format
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return minutes * 60 + seconds;
  }
}

function getSubstringBeforeChar(str, char) {
  const index = str.indexOf(char);
  // Check if the character exists in the string
  if (index !== -1) {
    // Return the part of the string from the beginning (index 0)
    // up to, but not including, the character's index.
    return str.substring(0, index);
  }
  // Return the original string or an empty string if the character is not found
  return str; // or return "";
}
