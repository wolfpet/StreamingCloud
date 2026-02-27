//this script belongs to add_podcast.html and runs inside an iframe which is loaded in a dialog

const dropZone = document.getElementById("dropZone");
const artworkInput = document.getElementById("artworkInput");
const audioDropZone = document.getElementById("audioDropZone");
const audioInput = document.getElementById("audioInput");
const podcastForm = document.getElementById("podcastForm");
const messageEl = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");
const buttonText = document.getElementById("buttonText");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

let selectedFile = null;
let selectedAudioFile = null;
let uploadProgress = 0;
let dialogProtectionListener = null;

//initial reset of drop zones
resetForm();

//audio player setup
const audioPlayer = new Plyr('#audioPlayer', {
    controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume'],
});

// Artwork dropzone events
dropZone.addEventListener("click", () => artworkInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith("image/")) {
      selectedFile = file;
      updateDropZonePreview();
    } else {
      showMessage("Please select an image file", "error");
    }
  }
});

artworkInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    selectedFile = e.target.files[0];
    updateDropZonePreview();
  }
});

// Audio dropzone events
audioDropZone.addEventListener("click", () => audioInput.click());

audioDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  audioDropZone.classList.add("dragover");
});

audioDropZone.addEventListener("dragleave", () => {
  audioDropZone.classList.remove("dragover");
});

audioDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  audioDropZone.classList.remove("dragover");

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith("audio/") || file.name.endsWith(".mp3")) {
      selectedAudioFile = file;
      updateAudioDropZonePreview();
    } else {
      showMessage("Please select an audio file", "error");
    }
  }
});

audioInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    selectedAudioFile = e.target.files[0];
    updateAudioDropZonePreview();
  }
});

function updateDropZonePreview() {
  const reader = new FileReader();
  reader.onload = (e) => {
    dropZone.style.backgroundImage = `url(${e.target.result})`;
    dropZone.style.backgroundSize = "cover";
    dropZone.style.backgroundPosition = "center";
    dropZone.innerHTML = "";
  };
  reader.readAsDataURL(selectedFile);
}

function updateAudioDropZonePreview() {
  audioDropZone.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || "#ff5500";
  // Get the correct background color based on dark mode
  const isDarkMode = document.body.classList.contains("dark-mode");
  audioDropZone.style.backgroundColor = isDarkMode ? "#333333" : "#ffffff";
  audioDropZone.style.color = isDarkMode ? "#cccccc" : "#333333";
  audioDropZone.innerHTML = `<div class="drop-zone-text">✓</div><div class="drop-zone-subtext">${selectedAudioFile.name.substring(
    0,
    35
  )}...</div>`;

  // Show audio player
  const audioPreview = document.getElementById("audioPreview");
  const audioPreviewFilename = document.getElementById("audioPreviewFilename");
  const audioPlayer = document.getElementById("audioPlayer");

  audioPreviewFilename.textContent = selectedAudioFile.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    audioPlayer.src = e.target.result;
    audioPreview.classList.add("show");
  };
  reader.readAsDataURL(selectedAudioFile);
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;

  if (type === "success") {
    setTimeout(() => {
      messageEl.className = "message";
    }, 3000);
  }
}

function updateProgress(percentage, label) {
  uploadProgress = percentage;
  progressFill.style.width = percentage + "%";
  progressLabel.textContent = label;
}

function showProgress() {
  progressContainer.classList.add("show");
  updateProgress(0, "Preparing upload...");
}

function hideProgress() {
  progressContainer.classList.remove("show");
  uploadProgress = 0;
  progressFill.style.width = "0%";
}

async function getPresignedUrl(file) {
  try {
    const response = await authenticatedFetch(`${APP_CONFIG.API_URL}/s3-sign`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        filename: file.name,
        filetype: file.type,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Response status:", response.status);
      console.error("Response text:", errorText);
      throw new Error(
        `Failed to get presigned URL: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();
    //console.log("Presigned URL response:", data);
    const url = data.presignedUrl || data.uploadUrl;
    if (!url) {
      throw new Error("No presigned URL in response");
    }
    return url;
  } catch (error) {
    console.error("Error getting presigned URL:", error);
    throw error;
  }
}

async function uploadImageToS3(file, presignedUrl) {
  try {
    const response = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error("Failed to upload image to S3");
    }

    return presignedUrl.split("?")[0]; // Return the base URL without query params
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw error;
  }
}

async function uploadAudioToS3(file, presignedUrl) {
  try {
    const response = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "audio/mpeg",
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error("Failed to upload audio to S3");
    }

    return presignedUrl.split("?")[0]; // Return the base URL without query params
  } catch (error) {
    console.error("Error uploading audio to S3:", error);
    throw error;
  }
}

async function submitPodcastForm(artworkUrl, audioUrl, userEmail, audioDuration) {
  const formData = {
    artist: document.getElementById("artist").value,
    title: document.getElementById("title").value,
    audioUrl: audioUrl,
    waveformUrl: null,
    artwork: artworkUrl,
    email: userEmail,
    duration: audioDuration,
  };

  try {
    const response = await authenticatedFetch(`${APP_CONFIG.API_URL}/podcasts`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      throw new Error("Failed to add podcast");
    }

    const result = await response.json();
    showMessage("Podcast added successfully!", "success");
    //update the main flag to indicate a new podcast was added. This will trigger a feed refresh when the dialog closes
    window.parent.podcastUploadedSuccessfully = true;
    resetForm();
    return result.data.id;
  } catch (error) {
    console.error("Error submitting podcast form:", error);
    throw error;
  }
}

podcastForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    //check if user authenticated
    if (!window.parent.isAuthenticated()) {
      showMessage("Please log in to add a podcast", "error");
      return;
    }

    //check if the audio is too short
    const audioPlayer = document.getElementById("audioPlayer");  
    //audio duration in seconds
    const audioDuration = audioPlayer.duration;
    if (audioDuration < 3400) {
      showMessage("A set should be at least 1 hour long.", "error");
      return;
    }    

    //get user's email and audio duration
    const userEmail = (await window.parent.getUserInfo())?.email;
    if (!userEmail) {
      showMessage("Error: Could not retrieve user email", "error");
      submitBtn.disabled = false;
      buttonText.textContent = "Add Podcast";
      hideProgress();
      return;
    }

    // Ok, everything seems god. let's prevent accidential closure of this dialog and proceed with the upload
    // Fist disable the light-dismiss behavior no-close-on-overlay no-close-on-escape.
      const generalDialog = window.parent.document.getElementById("generalDialog");
      generalDialog.setAttribute("no-auto-hide", "true");
      generalDialog.setAttribute("no-close-on-overlay", "true");
      generalDialog.setAttribute("no-close-on-escape", "true");
    //now disable close button
    const closeButton = generalDialog.querySelector(".sl-dialog__close-button");
    if (closeButton) {
      closeButton.disabled = true;
    } 
    //show alert not to close the dialog during upload
    window.parent.showAlert("Uploading your podcast. Please do not close this dialog until you see the 'Complete!' message.", "info", 5000);
    protectFromClosing();    
    submitBtn.disabled = true;
    buttonText.textContent = "Adding...";
    showProgress();

    let artworkUrl = null;
    let audioUrl = null;
    let totalSteps = (selectedFile ? 1 : 0) + (selectedAudioFile ? 1 : 0) + 1; // image + audio + form submission
    let completedSteps = 0;

    // Upload image if selected
    if (selectedFile) {
      updateProgress(0, "Uploading artwork...");
      const presignedUrl = await getPresignedUrl(selectedFile);
      artworkUrl = await uploadImageToS3(selectedFile, presignedUrl);
      completedSteps++;
      updateProgress(
        (completedSteps / totalSteps) * 100,
        `${completedSteps}/${totalSteps} complete`
      );
    }

    // Upload audio if selected
    if (selectedAudioFile) {
      updateProgress((completedSteps / totalSteps) * 100, "Uploading audio...");
      const presignedUrl = await getPresignedUrl(selectedAudioFile);
      audioUrl = await uploadAudioToS3(selectedAudioFile, presignedUrl);
      completedSteps++;
      updateProgress(
        (completedSteps / totalSteps) * 100,
        `${completedSteps}/${totalSteps} complete`
      );
    } else {
      showMessage("Error: Audio file is required", "error");
      submitBtn.disabled = false;
      buttonText.textContent = "Add Podcast";
      hideProgress();
      return;
    }

    // Submit form data
    updateProgress(
      (completedSteps / totalSteps) * 100,
      "Saving to database..."
    );
    const podcastId = await submitPodcastForm(artworkUrl, audioUrl, userEmail, audioDuration);
    completedSteps++;
    updateProgress(100, "Complete!");

    setTimeout(() => {
      hideProgress();
      submitBtn.disabled = false;
      buttonText.textContent = "Add Podcast";
    }, 1000);
  } catch (error) {
    showMessage("Error: " + error.message, "error");
    hideProgress();
    submitBtn.disabled = false;
    buttonText.textContent = "Add Podcast";
  }
  //Done. We should allow the user to close the dialog now.
  releaseDialogProtection();
});

function resetForm() {
    podcastForm.reset();

    selectedFile = null;
    dropZone.style.backgroundImage = "";
    dropZone.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"> <rect x="2" y="4" width="16" height="16" rx="2"></rect> <circle cx="18" cy="12" r="4"></circle><path d="M18 12h.01"></path><line x1="6" y1="8" x2="14" y2="8"></line><line x1="6" y1="12" x2="10" y2="12"></line></svg><div class="drop-zone-subtext">Drag Album Art image.<br />Square images work best.</div>';

    selectedAudioFile = null;
    audioDropZone.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg><div class="drop-zone-subtext">Drag and Drop your mp3 file here</div>';
    
    document.getElementById("audioPreview").classList.remove("show");    
}

function protectFromClosing() {
  const generalDialog = window.parent.document.getElementById("generalDialog");
  if (generalDialog) {
    dialogProtectionListener = (event) => {
      event.preventDefault();
      //console.log("Cannot close yet: task not complete");  
      window.parent.showAlert("Cannot close until the upload is complete.", "warning", 3000);
    };
    generalDialog.addEventListener('sl-request-close', dialogProtectionListener);
  }
}

function releaseDialogProtection() {
  const generalDialog = window.parent.document.getElementById("generalDialog");
  if (generalDialog && dialogProtectionListener) {
    generalDialog.removeEventListener('sl-request-close', dialogProtectionListener);
    dialogProtectionListener = null;
  }
}