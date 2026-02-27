// On page load -- init
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    window.parent.document.body.classList.add("dark-mode");
  } else if (savedTheme === "light") {
    document.body.classList.remove("dark-mode");
    window.parent.document.body.classList.remove("dark-mode");
  } 
});

// Call getPendingMusic on page load to populate the approval queue
window.addEventListener("DOMContentLoaded", () => {
  getPendingMusic();
});

async function getPendingMusic(lastKey) {
  try {
    // Get current user info to get email
    const user = await window.parent.getUserInfo();
    if (!user || !user.email) {
      console.log("User not logged in");
      displayError("User not logged in. Please log in to access admin tools.");
      return;
    }

    // Build query string with email and optional pagination
    let queryString = `?email=${encodeURIComponent(user.email)}`;
    if (lastKey) {
      queryString += `&lastKey=${encodeURIComponent(JSON.stringify(lastKey))}`;
    }

    // Call get_pending_music Lambda
    const response = await window.parent.authenticatedFetch(
      `${window.parent.APP_CONFIG.API_URL}/pending-music${queryString}`,
      {
        method: "GET",
        headers: window.parent.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      displayError(`Failed to fetch pending music: ${error.error || response.statusText}`);
      return;
    }

    const data = await response.json();
    displayPendingMusic(data.items);

  } catch (error) {
    console.error("Error fetching pending music:", error);
    displayError(`Error: ${error.message}`);
  }
}

function displayPendingMusic(items) {
  const container = document.getElementById("pending-music-list");
  if (!container) {
    console.error("Pending music list container not found");
    return;
  }

  if (!items || items.length === 0) {
    container.innerHTML = "<p>No pending music to approve.</p>";
    return;
  }

  // Clear container
  container.innerHTML = "";

  items.forEach((item) => {
    // Create pending-track component
    const trackElement = document.createElement("pending-track");
    trackElement.artist = item.artist || "Unknown Artist";
    trackElement.title = item.title || "Unknown Title";
    trackElement.artwork = item.artwork || "";
    trackElement.audioUrl = item.audioUrl || "";
    trackElement.waveform = item.waveformUrl || "";
    trackElement.trackId = item.id || "";

    // Create action buttons wrapper
    const actionButtons = document.createElement("div");
    actionButtons.className = "approval-actions";
    actionButtons.style.marginTop = "10px";
    actionButtons.style.display = "flex";
    actionButtons.style.gap = "10px";

    const approveBtn = document.createElement("button");
    approveBtn.className = "button approve-btn";
    approveBtn.textContent = "Approve";
    approveBtn.onclick = () => approvePodcast(item.id);

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "button reject-btn";
    rejectBtn.textContent = "Reject";
    rejectBtn.onclick = () => rejectPodcast(item.id);

    actionButtons.appendChild(approveBtn);
    actionButtons.appendChild(rejectBtn);

    // Create wrapper for track + actions
    const itemWrapper = document.createElement("div");
    itemWrapper.className = "pending-music-item";
    itemWrapper.style.marginBottom = "20px";

    itemWrapper.appendChild(trackElement);
    itemWrapper.appendChild(actionButtons);

    container.appendChild(itemWrapper);
  });
}

function displayError(message) {
  const container = document.getElementById("pending-music-list");
  if (container) {
    container.innerHTML = `<p class="error">${message}</p>`;
  }
}

async function approvePodcast(trackId) {
  await approveUpload(trackId, "approved");
}

async function rejectPodcast(trackId) {
  await approveUpload(trackId, "rejected");
}

async function approveUpload(trackId, verdict) {
  try {
    // Get current user info to ensure authorization
    const user = await window.parent.getUserInfo();
    if (!user || !user.email) {
      console.log("User not logged in");
      displayError("User not logged in. Please log in to access admin tools.");
      return;
    }

    // Call approve_upload Lambda with id and verdict
    const queryString = `?id=${encodeURIComponent(trackId)}&verdict=${encodeURIComponent(verdict)}`;
    const response = await window.parent.authenticatedFetch(
      `${window.parent.APP_CONFIG.API_URL}/approve-upload${queryString}`,
      {
        method: "GET",
        headers: window.parent.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      displayError(`Failed to update podcast: ${error.error || response.statusText}`);
      return;
    }

    const data = await response.json();
    console.log(`Podcast ${trackId} updated to status: ${data.status}`);

    // Refresh the pending music list after approval/rejection
    getPendingMusic();

  } catch (error) {
    console.error("Error updating podcast:", error);
    displayError(`Error: ${error.message}`);
  }
}