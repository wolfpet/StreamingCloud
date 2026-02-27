const prettyAlert = document.querySelector(".alert-main sl-alert");
var podcastUploadedSuccessfully = false; // Global flag to track upload status and refresh feed when the upload dialog closes

function showAlert2(message, variant = "primary") {
  // Update variant
  prettyAlert.setAttribute("variant", variant);
  // Get the last child (the text node) and update it
  const children = Array.from(prettyAlert.childNodes);
  const textNode = children[children.length - 1];

  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    textNode.textContent = message;
  }
  // Show the alert
  prettyAlert.show();
}
function showConfirmationDialog(message, onConfirm) {
  const dialog = document.getElementById("confirmationDialog");
  const messageParagraph = dialog.querySelector("p");
  const okButton = dialog.querySelector(".ok-btn");
  const cancelButton = dialog.querySelector(".cancel-btn");

  // Update the message
  messageParagraph.innerHTML = message;

  // Show the dialog
  dialog.show();

  // Handle OK action
  okButton.onclick = () => {
    if (onConfirm) onConfirm();
    dialog.hide();
  };

  // Handle Cancel action
  cancelButton.onclick = () => {
    dialog.hide();
  };
}

function closeConfirmationDialog() {
  const dialog = document.getElementById("confirmationDialog");
  dialog.hide();
}

function showMessageBox(title, message) {
  const dialog = document.querySelector(".message-box");
  const okButton = dialog.querySelector(".ok-btn");

  // Update the title and message
  dialog.setAttribute("label", title);
  dialog.querySelector("p").innerHTML = message;

  // Show the dialog
  dialog.show();

  // Handle OK action
  okButton.onclick = () => {
    dialog.hide();
  };
}

function showAlert(message, variant = "primary") {
  prettyAlert.setAttribute("variant", variant);
  
  // Clear all content except the icon
  const icon = prettyAlert.querySelector('sl-icon');
  prettyAlert.innerHTML = '';
  
  // Re-add the icon
  if (icon) {
    prettyAlert.appendChild(icon);
  }
  
  // Add the message as HTML
  prettyAlert.innerHTML += message;
  
  prettyAlert.show();
}

/**
 * Get authorization headers with Bearer token for authenticated API calls
 * @returns {Object} Headers object with Authorization header if token exists
 */
function getAuthHeaders() {
  const token = localStorage.getItem('idToken');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Wrapper for authenticated API calls with automatic token refresh on 401
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response>} The fetch response
 */
async function authenticatedFetch(url, options = {}) {
  try {
    // Make initial request
    let response = await fetch(url, options);
    
    // If 401 (Unauthorized), try to refresh token and retry once
    if (response.status === 401) {
      console.warn('Token expired, attempting to refresh...');
      const refreshed = await refreshAccessToken();
      
      if (refreshed) {
        console.log('Token refreshed successfully, retrying request...');
        // Update headers with new token
        options.headers = getAuthHeaders();
        // Retry the request
        response = await fetch(url, options);
      } else {
        console.error('Token refresh failed, user will be redirected to login');
        // refreshAccessToken() calls logout() on failure
      }
    }
    
    return response;
  } catch (error) {
    console.error('Error in authenticatedFetch:', error);
    throw error;
  }
}

async function fetchUserAttributes(email) {

  try {
    // Get current user info
    const user = await window.parent.getUserInfo();
    if (!user || !user.email) {      
      //console.log("fetchUserAttributes(): User not logged in, cannot fetch attributes");
      return null;
    }

    // Query user attributes endpoint
    const response = await window.parent.authenticatedFetch(
      `${window.parent.APP_CONFIG.API_URL}/user-attributes?email=${encodeURIComponent(user.email)}`,
      {
        method: "GET",
        headers: window.parent.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      console.error(`fetchUserAttributes(): Failed to fetch user attributes: ${response.status}`);
      return null;
    }
    const attributes = await response.json();
    return attributes;
  } catch (error) {
     console.error("fetchUserAttributes():  Error fetching user attributes:", error);
     return null;
  }
}

  function redirectTo(url) {
    // This will redirect the current page
    window.location.href = url;
  }