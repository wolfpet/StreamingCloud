const switchElement = document.querySelectorAll("sl-switch")[0];
const autoPlaySwitch = document.querySelectorAll("sl-switch")[1];
const syncAcrossDevicesSwitch = document.querySelectorAll("sl-switch")[2];

//dark mode switch
switchElement.addEventListener("sl-change", (event) => {
  parent.showAlert(
    "Dark mode is " +
      (event.target.checked ? "enabled" : "disabled") +
      ".",
  );

  // Apply to both iframe and parent
  document.body.classList.toggle("dark-mode");
  window.parent.document.body.classList.toggle("dark-mode");

  // Save preference to LocalStorage so it persists on refresh
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// Auto play switch
autoPlaySwitch.addEventListener("sl-change", (event) => {
  parent.showAlert(
    "<strong>Auto play is " +
      (event.target.checked ? "enabled" : "disabled") +
      "</strong>.<br /> Applies to all unfinished tracks on the current page.",
  );
  // Save the preference
  localStorage.setItem("autoPlay", event.target.checked ? "true" : "false");
});

// Sync across devices switch
syncAcrossDevicesSwitch.addEventListener("sl-change", (event) => {
  parent.showAlert(
    "Sync across devices is " +
      (event.target.checked ? "enabled" : "disabled") +
      ".",
  );
  // Save the preference
  localStorage.setItem(
    "syncAcrossDevices",
    event.target.checked ? "true" : "false",
  );
});

// On page load -- init
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    window.parent.document.body.classList.add("dark-mode");
    switchElement.checked = true;
  } else if (savedTheme === "light") {
    document.body.classList.remove("dark-mode");
    window.parent.document.body.classList.remove("dark-mode");
    switchElement.checked = false;
  } else {
    // Default to dark mode, save it
    document.body.classList.add("dark-mode");
    window.parent.document.body.classList.add("dark-mode");
    switchElement.checked = true;
    localStorage.setItem("theme", "dark");
  }
  // Auto play switch init
  const savedAutoPlay = localStorage.getItem("autoPlay");
  autoPlaySwitch.checked = savedAutoPlay === "true" ? true : false;
  // Sync across devices switch init
  // disable if the user is not logged in (no email in local storage)
  const isAuthenticated = window.parent.isAuthenticated();
  const savedSyncAcrossDevices = localStorage.getItem("syncAcrossDevices");
  syncAcrossDevicesSwitch.checked =
    savedSyncAcrossDevices === "true" ? true : false;
  if (!isAuthenticated) {
    syncAcrossDevicesSwitch.disabled = true;
    syncAcrossDevicesSwitch.checked = false;
    syncAcrossDevicesSwitch.textContent =
      "Sync across devices (Login required)";
  }
  // Initialize admin tools visibility
  renderAdminTools();
});



//reset play history function
async function resetPlayHistory() {
  // Clear all local storage items that start with "track_" and end with "_time"
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("track_") && key.endsWith("_time")) {
      //console.log('Removing localStorage item:', key);
      localStorage.removeItem(key);
      // Also remove associated savedAt 
      const savedAtKey = key.replace("_time", "_saved");
      localStorage.removeItem(savedAtKey);
      // expired marker should remain to prevent re-populating cleared history from backend sync, 
      // it will be cleaned in 7 days by syncPlaybackHistory() located in load_podcasts.js      
    }
  });
  //Local cleanup complere.  Let's check the localStorage and see if email is there to determine if we should proceed with backend cleanup or not.
  if (!window.parent.isAuthenticated()) {
    //not logged in. Just return since there's no backend history to reset
    parent.showMessageBox("Successfully cleared","<strong>Local history cleared.</strong><br />You are not logged in, so backend history may remain if you have been listening while logged in on this or other devices. ");
    return;
  }
  // Call backend API to reset playback history
  try {
    // Get user info to get email (from parent window)
    const user = await window.parent.getUserInfo();
    if (!user || !user.email) {
      //not logged in. Just return since there's no backend history to reset
      //parent.showAlert("<strong>Local history cleared.</strong><br />You are not logged in, so backend history may remain if you have been listening while logged in on this or other devices. ", "warning",);
      parent.showMessageBox("Local history cleared.","You are not logged in, so backend history may remain if you have been listening while logged in on this or other devices. ", "warning",);
      return;
    }
    const response = await window.parent.authenticatedFetch(
      `${window.parent.APP_CONFIG.API_URL}/history-reset`,
      {
        method: "POST",
        headers: window.parent.getAuthHeaders(),
        body: JSON.stringify({
          email: user.email,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to reset history: ${response.status}`);
    }

    const result = await response.json();
    console.log(
      `Backend reset result: ${result.recordsDeleted} records deleted`,
    );
  } catch (error) {
    console.error("Error resetting backend history:", error);
    parent.showAlert(
      "<strong>Local history cleared, but backend sync failed.</strong><br />Your history will be reset when you sync next.",
      "warning",
    );
    return;
  }
 window.parent.showMessageBox("Play history has been reset","You might need to do the same on other devices for this to take a permanent effect. Otherwise, your history may be automatically recovered next time you use them to tune in.");
}

async function renderAdminTools() {
  try {
    const attributes = await fetchUserAttributes();
    if (!attributes) {
      //console.log("No user attributes found, cannot render admin tools");
      removeAdminToolsContainer();
      return;
    }
    
    const admin = attributes.admin || false;
    const approver = attributes.approver || false;
    const uploadPreapproval = attributes.uploadPreapproval || false;

    // If user is neither admin nor approver, remove the admin tools container
    if (!admin && !approver) {
      removeAdminToolsContainer();
    } else if (admin) {
      // all tools for admin
      const adminToolsContainer = document.getElementById("admin-tools-container");
      //make this div visible and populate with admin tools
      if (adminToolsContainer) {
        adminToolsContainer.style.display = "block";
        //approval queue
        //let adminHtml = '<li><strong></strong><button class="button" onclick="redirectTo(\'/admin_music_approval.html\')">Music Approval Queue</button></li>';
        let adminHtml = '<li><strong>Content approval: </strong><a href="admin_music_approval.html">Upload Queue</a></li>';
        //user management
        //adminHtml += '<li><strong></strong><button class="button" onclick="redirectTo(\'/admin_user_management.html\')">User Management</button></li>';
        adminHtml += '<li><strong>Admin: </strong><a href="admin_users.html">User Management</a></li>';
        //administrative messages
        adminHtml += '<li><strong>Admin: </strong><a href="admin_messages.html">Messages and takedown requests</a></li>';
        //add these tools to the "philosophy-list" ul inside the admin tools container
        const philosophyList = adminToolsContainer.querySelector(".philosophy-list");
        if (philosophyList) {
          philosophyList.innerHTML = adminHtml;
        }
      }
    } else if (approver && !admin) {
      //some tools for approver
      const adminToolsContainer = document.getElementById("admin-tools-container");
      //make this div visible and populate with admin tools
      if (adminToolsContainer) {
        adminToolsContainer.style.display = "block";
        //approval queue
        let adminHtml = '<li><strong></strong><button class="button" onclick="redirectTo(\'/admin_music_approval.html\')">Music Approval Queue</button></li>';
        //add these tools to the "philosophy-list" ul inside the admin tools container
        const philosophyList = adminToolsContainer.querySelector(".philosophy-list");
        if (philosophyList) {
          philosophyList.innerHTML = adminHtml;
        }
      }
    }
  } catch (error) {
     console.error("Error rendering admin tools:", error);
    removeAdminToolsContainer();
  }
}

function removeAdminToolsContainer() {
  const adminToolsContainer = document.getElementById("admin-tools-container");
  if (adminToolsContainer) {
    adminToolsContainer.remove();

  }
}