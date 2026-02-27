// Pagination state
let paginationState = {
  currentKey: null,
  previousKeys: [],
  currentMessages: [],
};

// On page load -- init
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
  } else if (savedTheme === "light") {
    document.body.classList.remove("dark-mode");
  }
});

// Call getAdminMessages on page load to populate the message list
window.addEventListener("DOMContentLoaded", () => {
  getAdminMessages();
});

async function getAdminMessages(direction = "first", lastKey = null) {
  try {
    const url = new URL(
      `${window.parent.APP_CONFIG.API_URL}/admin-messages`,
      window.location.origin
    );

    // Add pagination parameter if going to next page
    if (direction === "next" && lastKey) {
      url.searchParams.append("lastKey", encodeURIComponent(JSON.stringify(lastKey)));
    }

    const response = await window.parent.authenticatedFetch(url.toString(), {
      method: "GET",
      headers: window.parent.getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 403) {
        displayError("Error: You do not have admin access");
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    paginationState.currentMessages = data.messages;

    // Update pagination state based on direction
    if (direction === "next" && lastKey) {
      paginationState.previousKeys.push(paginationState.currentKey);
      paginationState.currentKey = lastKey;
    } else if (direction === "previous" && paginationState.previousKeys.length > 0) {
      paginationState.currentKey = paginationState.previousKeys.pop();
    } else {
      // First load
      paginationState.currentKey = null;
      paginationState.previousKeys = [];
    }

    displayMessages(data.messages, data.lastEvaluatedKey);
  } catch (error) {
    console.error("Error fetching admin messages:", error);
    displayError(`Error: ${error.message}`);
  }
}

// Sanitize HTML to prevent XSS attacks
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function displayMessages(messages, lastEvaluatedKey) {
  const messageContainer = document.getElementById("user-list");
  messageContainer.innerHTML = "";

  if (!messages || messages.length === 0) {
    messageContainer.innerHTML = "<p>No messages found.</p>";
    return;
  }

  // Create messages container
  const messagesWrapper = document.createElement("div");
  messagesWrapper.className = "messages-wrapper";

  messages.forEach((msg, index) => {
    // Create message block
    const messageBlock = document.createElement("div");
    messageBlock.className = "message-block";

    // From
    const fromEl = document.createElement("p");
    fromEl.innerHTML = `<strong>From:</strong> ${escapeHtml(msg.from || "Unknown")}`;
    messageBlock.appendChild(fromEl);

    // When
    const whenEl = document.createElement("p");
    const whenDate = msg.when ? new Date(msg.when).toLocaleString() : "Unknown";
    whenEl.innerHTML = `<strong>When:</strong> ${escapeHtml(whenDate)}`;
    messageBlock.appendChild(whenEl);

    // Message
    const messageEl = document.createElement("p");
    const escapedMessage = escapeHtml(msg.message || "No message");
    const formattedMessage = escapedMessage.replace(/----/g, "<br>");
    messageEl.innerHTML = `<strong>Message:</strong> ${formattedMessage}`;
    messageBlock.appendChild(messageEl);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "delete-btn";
    deleteBtn.onclick = () => deleteMessage(msg);
    messageBlock.appendChild(deleteBtn);

    messagesWrapper.appendChild(messageBlock);

    // Add separator hr between messages (but not after the last one)
    //if (index < messages.length - 1) {
      messagesWrapper.appendChild(document.createElement("hr"));
    //}
  });

  messageContainer.appendChild(messagesWrapper);

  // Add pagination controls
  const paginationContainer = document.createElement("div");
  paginationContainer.className = "pagination-controls";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Previous";
  prevBtn.className = "pagination-btn";
  prevBtn.disabled = paginationState.previousKeys.length === 0;
  prevBtn.onclick = () => {
    if (paginationState.previousKeys.length > 0) {
      const previousKey = paginationState.previousKeys[paginationState.previousKeys.length - 1];
      getAdminMessages("previous", previousKey);
    }
  };

  const pageInfo = document.createElement("span");
  pageInfo.className = "page-info";
  pageInfo.textContent = `Showing ${messages.length} messages`;

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.className = "pagination-btn";
  nextBtn.disabled = !lastEvaluatedKey;
  nextBtn.onclick = () => {
    if (lastEvaluatedKey) {
      getAdminMessages("next", lastEvaluatedKey);
    }
  };

  paginationContainer.appendChild(prevBtn);
  paginationContainer.appendChild(pageInfo);
  paginationContainer.appendChild(nextBtn);

  messageContainer.appendChild(paginationContainer);
}

async function deleteMessage(message) {
  const confirmDialog = document.querySelector(".dialog-confirm");
  const okBtn = confirmDialog.querySelector(".ok-btn");
  const cancelBtn = confirmDialog.querySelector(".cancel-btn");

  // Show confirmation dialog
  confirmDialog.show();

  // Handle confirmation
  return new Promise((resolve) => {
    const handleOk = async () => {
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
      confirmDialog.hide();

      try {
        // Call delete endpoint with message ID
        const url = `${window.parent.APP_CONFIG.API_URL}/admin-messages/${message.id}`;
        const response = await window.parent.authenticatedFetch(url, {
          method: "DELETE",
          headers: window.parent.getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        window.parent.showAlert('Message deleted successfully', 'success');
        // Refresh the message list
        getAdminMessages();
        resolve(true);
      } catch (error) {
        console.error('Error deleting message:', error);
        window.parent.showAlert(`Error: ${error.message}`, 'danger');
        resolve(false);
      }
    };

    const handleCancel = () => {
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
      confirmDialog.hide();
      resolve(false);
    };

    okBtn.addEventListener("click", handleOk);
    cancelBtn.addEventListener("click", handleCancel);
  });
}

function displayError(message) {
  const messageContainer = document.getElementById("user-list");
  messageContainer.innerHTML = `<p class="error-message">${message}</p>`;
}