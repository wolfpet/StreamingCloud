//hamburger menu logic
const btn = document.getElementById("hamburger-btn");
const menu = document.getElementById("mobile-menu");

//hide uploadLink IF NOT AUTHENTICATED
if (!isAuthenticated()) {
  document.getElementById("uploadLink").style.display = "none";
  //document.getElementById("bookmarks").style.display = "none";
}

btn.addEventListener("click", () => {
  menu.classList.toggle("open");
  btn.classList.toggle("open");
});

//logo click loads recent uploads
document.getElementById("logo").addEventListener("click", (e) => {
  e.preventDefault();
loadRecentUploads() 
});

//logo icon (mobile) click loads recent uploads
document.getElementById("logo-icon-div").addEventListener("click", (e) => {
  e.preventDefault();
  loadRecentUploads() 
});

function loadRecentUploads() {
  document.getElementById("generalDialog").hide(); //close general dialog just in case it's open
  clearGeneralDialog();
  loadPodcasts();
  // Show pagination controls and clear search input
  document.getElementById("pagination-controls").style.display = "flex";
  document.getElementById("searchInput").value = "";
  document.getElementById("feed-heading").textContent = "Recent Uploads";
  // Close mobile menu if open
  closeMobileMenu();  
  closeAllTooltips();
  closeConfirmationDialog();
}


function closeMobileMenu() {
  menu.classList.remove("open");
  btn.classList.remove("open");
}

function closeAllTooltips() {
  document.querySelectorAll("sl-tooltip").forEach((tooltip) => {
      setTimeout(() => {
      tooltip.open = false;
      tooltip.hide();      
    }, 1000);
  });
}

// Upload link opens general dialog with upload.html loaded in iframe
document.getElementById("uploadLink").addEventListener("click", (e) => {
  e.preventDefault();
  closeAllTooltips();
  closeConfirmationDialog();
  // set iframe src to upload.html
  document.getElementById("generalIframe").src = "add_podcast.html";
  // set dialog title
  document
    .getElementById("generalDialog")
    .setAttribute("label", "Add New Podcast");
  // show dialog
  document.getElementById("generalDialog").show();
  // Close mobile menu if open
  closeMobileMenu();
});


// General dialog close logic
document.getElementById("generalDialog").addEventListener("sl-hide", () => {
  closeAllTooltips();  
  //console.log("Dialog closed");
  //check if a podcast was uploaded and refresh feed. It'sdone only if the dialog was for the upload
  if (window.podcastUploadedSuccessfully) {
    document.getElementById("feed-heading").textContent = "Recent Uploads";
    loadPodcasts();
    window.podcastUploadedSuccessfully = false; // Reset the flag
  }  
  clearGeneralDialog();
  closeConfirmationDialog();
});

//rss menu logic
document.getElementById("rssLink").addEventListener("click", (e) => {
  e.preventDefault();
  closeAllTooltips();
  clearGeneralDialog();
  closeConfirmationDialog();
  // set iframe src to rss-info.html
  document.getElementById("generalIframe").src = "docs/rss-info.html";
  // set dialog title
  document
    .getElementById("generalDialog")
    .setAttribute("label", `${(window.APP_CONFIG || {}).SITE_NAME || 'Streaming Cloud'} RSS Feed`);
  // show dialog
  document.getElementById("generalDialog").show();
  // Close mobile menu if open
  closeMobileMenu();
}); 

//about menu logic
document.getElementById("aboutLink").addEventListener("click", (e) => {
  e.preventDefault();
  closeAllTooltips();
  clearGeneralDialog();
  closeConfirmationDialog();
  // set iframe src to about.html
  document.getElementById("generalIframe").src = "docs/about.html";
  // set dialog title
  document
    .getElementById("generalDialog")
    .setAttribute("label", `About ${(window.APP_CONFIG || {}).SITE_NAME || 'Streaming Cloud'}`);
  // show dialog
  document.getElementById("generalDialog").show();
  // Close mobile menu if open
  closeMobileMenu();
});


//search menu logic
document.getElementById("searchInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    closeMobileMenu();
    document.getElementById("generalDialog").hide(); 
    closeAllTooltips();
    closeConfirmationDialog();
    const keyword = e.target.value;
    //check if keyword is less than 3 characters
    if (keyword.length < 3) {
      showAlert("Please enter at least 3 characters to search.", "warning");
      return;
    }
    searchPodcasts(keyword);
    document.getElementById("pagination-controls").style.display = "none";
  }
});

//avatar menu logic
const userAvatar = document.getElementById("userAvatar");
const accountMenuDropdown = document.getElementById("accountMenuDropdown");

userAvatar.addEventListener("click", function (e) {
  closeMobileMenu(); 
  closeAllTooltips();
  document.getElementById("generalDialog").hide(); //close general dialog just in case it's open
  closeConfirmationDialog();
  e.preventDefault();
  e.stopPropagation();
  const isOpen = accountMenuDropdown.style.display !== "none";
  accountMenuDropdown.style.display = isOpen ? "none" : "block";
});

// Close menu when clicking elsewhere
document.addEventListener("click", function (e) {
  if (!e.target.closest(".account-menu")) {
    accountMenuDropdown.style.display = "none";
  }
});

accountMenuDropdown.addEventListener("sl-select", function (e) {
  const selectedItem = e.detail.item.textContent;
  //console.log("Menu item clicked:", selectedItem);
  closeAllTooltips();
  document.getElementById("generalDialog").hide(); 
  closeConfirmationDialog();
  // Handle different menu options
  switch (selectedItem.trim()) {
    case "Login":
      //console.log("Open login dialog");
      // no iframe here, local auth form.
      document.getElementById("generalIframe").style.display = "none";
      // set dialog title
      document
        .getElementById("generalDialog")
        .setAttribute("label", "Login or Sign Up");
      //render auth dialog
      renderAuthSialog();
      // show dialog
      document.getElementById("generalDialog").show();
      break;

    case "Logout":
      logout();
      break;
    case "My Bookmarks":
      loadMyBookmarks().catch(error => {
        console.error("Error loading bookmarks:", error);
      });
      break;
    case "My Uploads":
      getUserInfo().then(user => {
        if (user && user.email) {
          loadMyPodcasts(user.email);
        } else {
          // Fallback: read email directly from localStorage
          const fallbackEmail = localStorage.getItem('userEmail');
          if (fallbackEmail) {
            loadMyPodcasts(fallbackEmail);
          } else {
            console.error("User email not found");
          }
        }
      }).catch(error => {
        console.error("Error getting user info:", error);
      });
      break;
    case "Settings":
      //clear dialog
      clearGeneralDialog();
      // set iframe src to settings.html
      document.getElementById("generalIframe").src = "settings.html";
      // set dialog title
      document
        .getElementById("generalDialog")
        .setAttribute("label", "Settings");
      // show dialog
      document.getElementById("generalDialog").show();
      break;
    default:
      console.log("This should not happen", selectedItem);
  }

  // Close menu after selection
  accountMenuDropdown.style.display = "none";
});

function renderAuthSialog() {
  clearGeneralDialog();  
  document.getElementById("generalIframe").style.display = "none";
  closeConfirmationDialog();
  
  const template = document.getElementById("auth-dialog-template");
  const clone = template.content.cloneNode(true);
  document.getElementById("generalDialog").appendChild(clone);
  
  // Attach event listeners
  document.querySelector(".login-google").addEventListener("click", loginWithGoogle);
  document.querySelector(".sign-up").addEventListener("click", renderSignUpDialog);
}

function clearGeneralDialog() {
  const dialog = document.getElementById("generalDialog");
  // Remove all children except the close button and iframe
  Array.from(dialog.children).forEach((child) => {
    if (
      !child.classList.contains("sl-dialog-close-button") &&
      child.id !== "generalIframe"
    ) {
      dialog.removeChild(child);
    }
    //make sure iframe is visible
    document.getElementById("generalIframe").style.display = "block";
    //destroy everything in it by setting the source to about:blank for hygiene purposes.
    document.getElementById("generalIframe").src = "about:blank";
  });
}

function renderSignUpDialog() {
  clearGeneralDialog();
  //this is not an iframe based auth, we turn of the iframe and render the form here
  document.getElementById("generalIframe").style.display = "none";
  //set the dialog title
  document
    .getElementById("generalDialog")
    .setAttribute("label", "Sign Up for a new account");
  closeConfirmationDialog();
  // Create the regular Cognito signup form
  const signUpComponent = document.createElement("signup-component");
  document.getElementById("generalDialog").appendChild(signUpComponent);
}