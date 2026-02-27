import {
  LitElement,
  html,
  css,
} from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";

export class SoundcloudTrack extends LitElement {
  static properties = {
    artist: { type: String },
    title: { type: String },
    artwork: { type: String },
    audioUrl: { type: String },
    waveform: { type: String },
    trackId: { type: String },
    active: { type: Boolean, reflect: true },
    isBookmark: { type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    // Preload the orange waveform image so it's cached before progress updates
    this._preloadOrangeWaveform();
    // Check dark mode on component load
    this.updateDarkMode();
    // Apply accent colors from APP_CONFIG
    this._applyAccentColors();
    
    // Observe body class changes for dark mode
    const observer = new MutationObserver(() => {
      this.updateDarkMode();
    });
    
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  _applyAccentColors() {
    const accentColor = window.APP_CONFIG?.ACCENT_COLOR || '#ff5500';
    const accentColorLight = window.APP_CONFIG?.ACCENT_COLOR_LIGHT || '#ff8800';
    this.style.setProperty('--accent-color', accentColor);
    this.style.setProperty('--accent-color-light', accentColorLight);
  }

  updateDarkMode() {
    const isDarkMode = document.body.classList.contains("dark-mode");
    if (isDarkMode) {
      this.classList.add("dark-mode");
    } else {
      this.classList.remove("dark-mode");
    }
  }

  // We store the SVG code as Lit templates
  static ICONS = {
    PLAY: html`<svg
      viewBox="0 0 16 16"
      fill="currentColor"
      width="24"
      height="24"
    >
      <path
        d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"
      />
    </svg>`,
    PAUSE: html`<svg
      viewBox="0 0 16 16"
      fill="currentColor"
      width="24"
      height="24"
    >
      <path
        d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"
      />
    </svg>`,
    //COPY: html`<svg viewBox="0 0 16 16" fill="currentColor" width="18" height="18"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3z"/></svg>`,
    COPY: html`<svg
      viewBox="0 0 16 16"
      stroke-width="1.5"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M1 3.75A2.75 2.75 0 013.75 1h5.5a2.75 2.75 0 012.45 1.5H3.75c-.69 0-1.25.56-1.25 1.25v7.95A2.75 2.75 0 011 9.25v-5.5z"
        fill="currentColor"
      ></path>
      <path
        d="M6.75 4A2.75 2.75 0 004 6.75v5.5A2.75 2.75 0 006.75 15h5.5A2.75 2.75 0 0015 12.25v-5.5A2.75 2.75 0 0012.25 4h-5.5zM5.5 6.75c0-.69.56-1.25 1.25-1.25h5.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-5.5c-.69 0-1.25-.56-1.25-1.25v-5.5z"
        fill="currentColor"
      ></path>
    </svg>`,
    BOOKMARK: html`<svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    </svg>`,
    BOOKMARK_FILLED: html`<svg
      xmlns="http://www.w3.org/2000/svg"
      fill="red"
      viewBox="0 0 24 24"
      stroke-width="0"
    >
      <path
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
      />
    </svg>`,
  };

  static styles = css`
    :host {
      display: block;
      margin-bottom: 15px;
      font-family: "Interstate", sans-serif;

      --text-color: #333333;
      --accent-color: #ff5500;
      --accent-color-light: #ff8800;
      --card-bg-color: #ffffff;
      
      --darkmode-bg-color: #333333;
      --darkmode-card-bg-color: #555555;
      --darkmode-text-color: #cccccc;
    }

    .track-container {
      display: grid;
      gap: 12px;
      padding: 15px;
      background: var(--card-bg-color);
      border: 1px solid #e5e5e5;
      transition: border-color 0.2s;
      grid-template-columns: 210px 1fr;
      grid-template-rows: auto auto;
      grid-template-areas:
        "artwork info"
        "artwork footer";
    }
    :host(.dark-mode) .track-container {
      background: var(--darkmode-card-bg-color);
    }

    :host([active]) .track-container {
      border-color: var(--accent-color);
    }

    :host([active]) .waveform-overlay-mobile {
      display: flex; /* Show the slider overlay when active */
      pointer-events: auto; /* Enable pointer events when active */
    }

    .artwork-wrapper {
      grid-area: artwork;
      position: relative;
      width: 210px;
      height: 210px;
      align-self: start;
    }

    .artwork {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .artwork-overlay {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 34px;
      height: 34px;
      pointer-events: none;
      z-index: 1;
      display: none;
    }

    .play-btn {
      background: var(--accent-color);
      color: white;
      border: none;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      display: flex;
      z-index: 10;
      flex-shrink: 0;
    }

    .play-btn:hover {
      background: linear-gradient(var(--accent-color), var(--accent-color-light));
    }

    .play-btn svg {
      width: 30px;
      height: 30px;
    }

    .info {
      grid-area: info;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
    }

    .text-meta {
      display: flex;
      flex-direction: column;
    }

    .artist {
      font-size: 14px;
      color: #999;
      margin: 0;
    }

    .artist:hover {
      color: var(--accent-color);
      cursor: zoom-in;
    }

    .title {
      font-size: 16px;
      margin: 2px 0;
      background: #333;
      color: #fff;
      padding: 2px 6px;
      width: fit-content;
      font-weight: 300;
      word-break: break-word;
      max-width: 100%;
    }

    .waveform-container {
      position: relative;
      width: 100%;
      height: 91px;
      margin: 9px 0;
      cursor: pointer;
      overflow: hidden;
      background-color: var(--card-bg-color);
    }
    .waveform-container::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), transparent 50%);
      pointer-events: none;
      z-index: 1;
    }
    .waveform-container:hover::before {
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.6), transparent 50%);
    }


    :host(.dark-mode) .waveform-container::before {
      background: linear-gradient(to bottom, transparent 30%, rgba(0, 0, 0, 0.25));
    }

    :host(.dark-mode) .waveform-container:hover::before {
      background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.25));
    }

    :host(.dark-mode) .waveform-container {
      background-color: var(--darkmode-card-bg-color);
      color: var(--darkmode-text-color);
    }

    .waveform-overlay-mobile {
      display: none;
    }

    .waveform-overlay-mobile sl-range {
      width: 100%;
      height: 100%;
    }
    .waveform-img {
      width: 100%;
      height: 100%;
      display: block;
      filter: brightness(0) saturate(100%) invert(10%) sepia(0%) saturate(0%) hue-rotate(3deg) brightness(101%) contrast(106%);       opacity: 0.5;
      position: relative;
      z-index: 0;
    }

      :host(.dark-mode) .waveform-img {
      filter: brightness(0) saturate(100%) invert(80%) sepia(10%) saturate(500%) hue-rotate(180deg) brightness(90%) contrast(90%);
    }

    .waveform-progress {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 0%;
      background-color: var(--card-bg-color);
      background-size: auto 100%;
      background-position: left center;
      background-repeat: no-repeat;
      border-right: 0px solid var(--accent-color);
      pointer-events: none;
    }
    
    :host(.dark-mode) .waveform-progress {
      background-color: var(--darkmode-card-bg-color);
    }

    .track-footer {
      grid-area: footer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--text-color);
      background-color: #dedede;
      padding: 8px;
    }

    :host(.dark-mode) .track-footer {
      background-color: var(--darkmode-bg-color);
      color: var(--darkmode-text-color);
    }

    .footer-buttons {
      display: flex;
      gap: 8px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
    }

    .icon-btn:hover {
      color: var(--accent-color);
    }

    .icon-btn svg {
      width: 18px;
      height: 18px;
    }

    .icon-btn.bookmark-btn-filled svg {
      color: #e74c3c;
    }

    /* ===== DESKTOP (min-width: 1024px) ===== */
    @media (min-width: 1024px) {
      .track-container {
        grid-template-columns: 254px 1fr;
        gap: 15px;
        padding: 15px;
        border-radius: 8px;
      }

      .artwork-wrapper {
        width: 254px;
        height: 254px;
      }

      .play-btn {
        width: 60px;
        height: 60px;
      }

      .play-btn svg {
        width: 36px;
        height: 36px;
      }

      .artist {
        font-size: 14px;
      }

      .title {
        font-size: 16px;
      }

      .waveform-container {
        height: 120px;
      }

      .icon-btn svg {
        width: 22px;
        height: 22px;
      }
    }

    /* ===== MOBILE (max-width: 600px) ===== */
    @media (max-width: 600px) {

      /*We display the slider on mobile. Sliding is better than clicking on the waveform to seek, especially on small screens. */
      .waveform-overlay-mobile {
        position: absolute;
        top: 25px;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 3;
        
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }

      .track-container {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
        grid-template-areas:
          "artwork"
          "info"
          "footer";
        gap: 10px;
        padding: 12px;
      }

      .waveform-container {
        height: 70px;
        margin: 8px 0;
        pointer-events: none; /* Disable pointer events on the waveform container to allow slider interaction */
      }
      
      .waveform-progress {
        opacity: 0.25;
      }
      
      sl-range {
        --track-color-active: var(--accent-color);
        --sl-color-primary-600: var(--accent-color);
        --sl-color-primary-500: var(--accent-color);
        --thumb-size: 30px;
      }

      .artwork-wrapper {
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        grid-column: 1;
      }

      .info {
        grid-column: 1;
      }

      .header {
        gap: 10px;
        margin-bottom: 8px;
      }

      .artist {
        font-size: 14px;
      }

      .title {
        font-size: 16px;
      }

      .track-footer {
        grid-column: 1;
        font-size: 11px;
        margin: 0;
        padding: 6px;
      }

      .icon-btn svg {
        width: 16px;
        height: 16px;
      }
    }
  `;

  _getOrangeWaveformUrl() {
    if (!this.waveform || this.waveform === 'dummy_waveform.png') {
      return 'dummy_waveform.png';
    }
    // Replace _black with _orange in the waveform URL
    return this.waveform.replace('_black.png', '_orange.png');
  }

  /**
   * Preload the orange waveform image so it's cached before any
   * progress-bar width/backgroundSize updates try to display it.
   * Without this, a race between the PNG download and the CSS
   * property changes can cause the image to appear stretched.
   */
  _preloadOrangeWaveform() {
    const url = this._getOrangeWaveformUrl();
    if (url && url !== 'dummy_waveform.png' && !this._orangePreloaded) {
      const img = new Image();
      img.src = url;
      this._orangePreloaded = true;
    }
  }

  _requestPlay() {
    this.dispatchEvent(
      new CustomEvent("request-play", {
        detail: {
          artist: this.artist,
          title: this.title,
          artwork: this.artwork,
          audioUrl: this.audioUrl,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Function to copy track ID to clipboard
  _copyToClipboard() {
    if (!this.trackId) {
      showAlert("Track link not available and who knows why :-/", "danger");
      return;
    }
    // Construct the full URL with track parameter
    const trackUrl = `${window.location.origin}/track/${this.trackId}`;
    // Use the Clipboard API to copy the URL
    navigator.clipboard
      .writeText(trackUrl)
      .then(() => {
        //console.log("Track ID copied to clipboard:", this.trackId);
        showAlert(
          "<strong>Track link copied to clipboard!</strong><br />You can share it now by pasting anywhere.",
          "success",
        );
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
        showAlert("Failed to copy track link", "danger");
      });
  }
  _findArtist() {
    const searchQuery = `_artt15sts:${this.artist}`;
    showAlert(`Searching for artist: ${this.artist}`, "info");
    searchPodcasts(searchQuery);
  }

  async _bookmarkPodcast2() {
    // Implement bookmark logic here
    const user = await getUserInfo();
    if (!user || !user.email) {
      showAlert("You need to be logged in to bookmark podcasts.", "warning");
      return;
    }

    // Try to extract duration from the timestamp element
    let duration = 0;
    try {
      const timestampElement = this.shadowRoot?.querySelector(".timestamp");
      if (timestampElement && timestampElement.textContent) {
        const timestampText = timestampElement.textContent;
        // Format is "current / duration"
        const parts = timestampText.split(" / ");
        if (parts.length === 2) {
          const durationStr = parts[1].trim();
          // Use convertMmSsToSeconds to parse the duration
          duration = convertMmSsToSeconds(durationStr);
        }
      }
    } catch (error) {
      console.warn("Failed to extract duration from timestamp:", error);
      duration = 0;
    }

    try {
      // Form request body with all required attributes
      const requestBody = {
        artist: this.artist,
        title: this.title,
        artwork: this.artwork || null,
        audioUrl: this.audioUrl,
        waveformUrl: this.waveform || null,
        email: user.email,
        id: this.trackId || null,
        duration: duration,
      };      

      // Call the add-bookmark API endpoint
      const response = await authenticatedFetch(`${APP_CONFIG.API_URL}/add-bookmark`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        showAlert(`Failed to bookmark podcast: ${errorData.error}`, "error");
        return;
      }

      const result = await response.json();      
      showAlert("Podcast bookmarked successfully!", "success");
    } catch (error) {
      console.error("Error bookmarking podcast:", error);
      showAlert("Error bookmarking podcast: " + error.message, "error");
    }
  }

  async _deleteBookmark() {
    const user = await getUserInfo();
    if (!user || !user.email) {
      showAlert("You need to be logged in to delete bookmarks.", "warning");
      return;
    }

    try {
      // Call deleteBookmark function from load_podcasts.js
      await deleteBookmark(user.email, this.trackId);
      showAlert("Bookmark deleted successfully!", "success");
      // Reload bookmarks after deletion
      loadMyBookmarks();
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      showAlert("Error deleting bookmark: " + error.message, "error");
    }
  }

  _handleBookmarkClick() {
    if (this.isBookmark) {
      this._deleteBookmark();
    } else {
      this._bookmarkPodcast2();
    }
  }

  //render the track component
  render() {
    return html`
      <div class="track-container">
        <div class="artwork-wrapper">
          <img class="artwork" src="${this.artwork}" />
          <svg class="artwork-overlay" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect x="2" y="2" width="20" height="20" rx="4" ry="4" fill="none" stroke="#2ecc71" stroke-width="2"/>
            <path d="M7 12l3.5 3.5L17 8" fill="none" stroke="#2ecc71" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="info">
          <div class="header">
            <button class="play-btn" @click="${this._requestPlay}">
              ${this.active
                ? SoundcloudTrack.ICONS.PAUSE
                : SoundcloudTrack.ICONS.PLAY}
            </button>
            <div class="text-meta">
              <span class="artist" @click="${this._findArtist}"
                >${this.artist}</span
              >
              <h3 class="title">${this.title}</h3>
            </div>
          </div>
          <div class="waveform-container">
            <img
              src="${this.waveform}"
              alt="Audio Waveform"
              class="waveform-img"
            />
            <div class="waveform-progress" style="background-image: url('${this._getOrangeWaveformUrl()}');"></div>
            <div class="waveform-overlay-mobile">
              <sl-range class="waveform-slider" tooltip="none"></sl-range>
            </div>
          </div>
          <div class="track-footer">
            <div class="footer-buttons">
              <sl-tooltip content="Copy to Clipboard" placement="left">
                <button class="icon-btn" @click="${this._copyToClipboard}">
                  ${SoundcloudTrack.ICONS.COPY}
                </button>
              </sl-tooltip>
              <sl-tooltip content="${this.isBookmark ? 'Remove Bookmark' : 'Bookmark'}" placement="left">
                <button class="icon-btn ${this.isBookmark ? 'bookmark-btn-filled' : ''}" @click="${this._handleBookmarkClick}">
                  ${this.isBookmark ? SoundcloudTrack.ICONS.BOOKMARK_FILLED : SoundcloudTrack.ICONS.BOOKMARK}
                </button>
              </sl-tooltip>
            </div>
            <span class="timestamp">.</span>
          </div>
        </div>
      </div>
    `;
  }
}
customElements.define("soundcloud-track", SoundcloudTrack);
