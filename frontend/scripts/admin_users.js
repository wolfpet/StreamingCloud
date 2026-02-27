// Pagination state
let paginationState = {
  currentKey: null,
  previousKeys: [], // Stack of previous keys for "back" navigation
  currentUsers: [],
};

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

// Call getUsers on page load to populate the user list
window.addEventListener("DOMContentLoaded", () => {
  getUsers();
});

async function getUsers(direction = "first", lastKey = null) {
  try {
    const url = new URL(
      `${window.parent.APP_CONFIG.API_URL}/user-list`,
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
    paginationState.currentUsers = data.users;

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

    displayUsers(data.users, data.lastEvaluatedKey);
  } catch (error) {
    console.error("Error fetching users:", error);
    displayError(`Error: ${error.message}`);
  }
}

function displayUsers(users, lastEvaluatedKey) {
  const userListContainer = document.getElementById("user-list");
  userListContainer.innerHTML = "";

  if (!users || users.length === 0) {
    userListContainer.innerHTML = "<p>No users found.</p>";
    return;
  }

  // Get all unique attribute keys from users to create dynamic columns
  const attributeKeys = new Set();
  users.forEach((user) => {
    Object.keys(user).forEach((key) => attributeKeys.add(key));
  });
  
  // Define desired column order
  const desiredOrder = ["email", "name", "createdAt", "admin", "approver", "uploadPreapproval"];
  const sortedKeys = desiredOrder.filter(key => attributeKeys.has(key));

  // Create table
  const table = document.createElement("table");
  table.className = "users-table";

  // Create header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Add attribute columns
  sortedKeys.forEach((key) => {
    const th = document.createElement("th");
    
    if (key === "email") {
      // Create tooltip with envelope icon
      const tooltip = document.createElement("sl-tooltip");
      tooltip.setAttribute("content", "eMail");
      tooltip.setAttribute("placement", "bottom");
      
      const icon = document.createElement("sl-icon");
      icon.name = "envelope";
      
      tooltip.appendChild(icon);
      th.appendChild(tooltip);
    } else if (key === "createdAt") {
      // Create tooltip with calendar icon
      const tooltip = document.createElement("sl-tooltip");
      tooltip.setAttribute("content", "Created at");
      tooltip.setAttribute("placement", "bottom");
      
      const icon = document.createElement("sl-icon");
      icon.name = "calendar3";
      
      tooltip.appendChild(icon);
      th.appendChild(tooltip);
    } else if (key === "admin") {
      // Create tooltip with sunglasses icon
      const tooltip = document.createElement("sl-tooltip");
      tooltip.setAttribute("content", "Admin");
      tooltip.setAttribute("placement", "bottom");
      
      const icon = document.createElement("sl-icon");
      icon.name = "emoji-sunglasses";
      
      tooltip.appendChild(icon);
      th.appendChild(tooltip);
    } else if (key === "approver") {
      // Create tooltip with person-check icon
      const tooltip = document.createElement("sl-tooltip");
      tooltip.setAttribute("content", "Approver");
      tooltip.setAttribute("placement", "bottom");
      
      const icon = document.createElement("sl-icon");
      icon.name = "person-check";
      
      tooltip.appendChild(icon);
      th.appendChild(tooltip);
    } else if (key === "uploadPreapproval") {
      // Create tooltip with cloud-check icon
      const tooltip = document.createElement("sl-tooltip");
      tooltip.setAttribute("content", "Upload Preapproval");
      tooltip.setAttribute("placement", "bottom");
      
      const icon = document.createElement("sl-icon");
      icon.name = "cloud-check";
      
      tooltip.appendChild(icon);
      th.appendChild(tooltip);
    } else {
      th.textContent = key;
    }
    
    headerRow.appendChild(th);
  });

  // Add banned column
  const bannedHeader = document.createElement("th");
  const bannedTooltip = document.createElement("sl-tooltip");
  bannedTooltip.setAttribute("content", "Banned");
  bannedTooltip.setAttribute("placement", "bottom");
  
  const bannedIcon = document.createElement("sl-icon");
  bannedIcon.name = "ban";
  
  bannedTooltip.appendChild(bannedIcon);
  bannedHeader.appendChild(bannedTooltip);
  headerRow.appendChild(bannedHeader);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body with user rows
  const tbody = document.createElement("tbody");
  users.forEach((user) => {
    const row = document.createElement("tr");

    // Add attribute cells
    sortedKeys.forEach((key) => {
      const td = document.createElement("td");
      const value = user[key];

      // Special handling for checkbox fields
      if (key === "admin" || key === "approver" || key === "uploadPreapproval") {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "attribute-checkbox";
        checkbox.dataset.attributeName = key;
        
        // Set checked state based on value
        if (key === "admin") {
          checkbox.checked = value === true;
        } else if (key === "approver") {
          checkbox.checked = value === true;
        } else if (key === "uploadPreapproval") {
          checkbox.checked = value === true;
        }
        
        // Add event listener for checkbox changes
        checkbox.addEventListener("change", handleAttributeCheckboxChange);
        
        td.appendChild(checkbox);
      } else if (key === "createdAt" && value) {
        // Format createdAt as yyyy-mm-dd
        const date = new Date(value);
        const formattedDate = date.toISOString().split('T')[0];
        td.textContent = formattedDate;
      } else if (typeof value === "boolean") {
        // Other boolean values display as Yes/No
        td.textContent = value ? "Yes" : "No";
      } else if (value === null || value === undefined) {
        td.textContent = "-";
      } else {
        td.textContent = String(value);
      }

      row.appendChild(td);
    });

    // Add banned checkbox
    const bannedTd = document.createElement("td");
    bannedTd.className = "banned-cell";

    const bannedCheckbox = document.createElement("input");
    bannedCheckbox.type = "checkbox";
    bannedCheckbox.className = "attribute-checkbox";
    bannedCheckbox.dataset.attributeName = "banned";
    bannedCheckbox.checked = user.banned === true;
    
    // Add event listener for banned checkbox changes
    bannedCheckbox.addEventListener("change", handleAttributeCheckboxChange);

    bannedTd.appendChild(bannedCheckbox);
    row.appendChild(bannedTd);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  userListContainer.appendChild(table);

  // Add pagination controls
  const paginationContainer = document.createElement("div");
  paginationContainer.className = "pagination-controls";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Previous";
  prevBtn.className = "pagination-btn";
  prevBtn.disabled = paginationState.previousKeys.length === 0;
  prevBtn.onclick = () => {
    if (paginationState.previousKeys.length > 0) {
      // To go back, we need to request with the key before the current one
      const previousKey = paginationState.previousKeys[paginationState.previousKeys.length - 1];
      getUsers("previous", previousKey);
    }
  };

  const pageInfo = document.createElement("span");
  pageInfo.className = "page-info";
  pageInfo.textContent = `Showing ${users.length} users`;

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.className = "pagination-btn";
  nextBtn.disabled = !lastEvaluatedKey;
  nextBtn.onclick = () => {
    if (lastEvaluatedKey) {
      getUsers("next", lastEvaluatedKey);
    }
  };

  paginationContainer.appendChild(prevBtn);
  paginationContainer.appendChild(pageInfo);
  paginationContainer.appendChild(nextBtn);

  userListContainer.appendChild(paginationContainer);
}

function displayError(message) {
  const userListContainer = document.getElementById("user-list");
  userListContainer.innerHTML = `<p class="error-message">${message}</p>`;
}

// Handler for attribute checkbox changes
async function handleAttributeCheckboxChange(event) {
  const checkbox = event.target;
  const row = checkbox.closest('tr');
  
  if (!row) {
    return;
  }
  
  // Get email from the first cell (email column is always first in sortedKeys)
  const email = row.cells[0].textContent.trim();
  
  // Get attribute name from the checkbox's data attribute
  const attributeName = checkbox.dataset.attributeName;
  const value = checkbox.checked;
  
  if (!attributeName) {
    showUserAlert("Error: Could not determine attribute name", "error");
    return;
  }
  
  // Visual feedback - disable checkbox during request
  checkbox.disabled = true;
  
  try {
    const response = await window.parent.authenticatedFetch(
      `${window.parent.APP_CONFIG.API_URL}/set-user-attribute`,
      {
        method: "POST",
        headers: {
          ...window.parent.getAuthHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email,
          attributeName: attributeName,
          value: value
        })
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        showUserAlert("Error: You do not have permission to modify users", "error");
        checkbox.checked = !value; // Revert the checkbox
        checkbox.disabled = false;
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    showUserAlert(`Successfully updated ${attributeName} for ${email}`, "success");
  } catch (error) {
    console.error("Error updating attribute:", error);
    showUserAlert(`Error updating attribute: ${error.message}`, "error");
    checkbox.checked = !value; // Revert the checkbox on error
  } finally {
    checkbox.disabled = false;
  }
}

// Helper function to show alerts
function showUserAlert(message, type = "success") {
  // Map type to variant for showAlert
  const variant = type === "error" ? "danger" : "success";
  
  // Use the parent window's showAlert function
  window.parent.showAlert(message, variant);
}

