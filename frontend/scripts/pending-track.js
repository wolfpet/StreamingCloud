import { SoundcloudTrack } from './soundcloud-track.js';

export class PendingTrack extends SoundcloudTrack {
  constructor() {
    super();
    this.audioElement = null;
    this.waveformContainer = null;
    this.waveformProgress = null;
    this.updateBound = null;
  }

  connectedCallback() {
    super.connectedCallback();
    // We'll set up listeners after the component renders
  }

  firstUpdated() {
    // Get references to DOM elements after component renders
    const shadow = this.shadowRoot;
    this.waveformContainer = shadow.querySelector('.waveform-container');
    this.waveformProgress = shadow.querySelector('.waveform-progress');
    
    // Get reference to parent window's audio element (Plyr wraps this, so direct manipulation works)
    this.audioElement = window.parent.document.getElementById('main-audio');
    
    if (this.waveformContainer) {
      this.setupWaveformClickListener();
    }
    
    if (this.audioElement) {
      this.setupAudioListeners();
    }
  }

  setupWaveformClickListener() {
    this.waveformContainer.addEventListener('click', (e) => {
      const rect = this.waveformContainer.getBoundingClientRect();
      const clickPercentage = (e.clientX - rect.left) / rect.width;
      
      if (!this.audioElement) return;
      
      // If this track is not currently playing, request play first
      if (this.audioElement.src !== this.audioUrl) {
        // Dispatch request-play event so play.js handles the setup
        document.dispatchEvent(
          new CustomEvent("request-play", {
            detail: {
              audioUrl: this.audioUrl,
              title: this.title,
              artist: this.artist,
              artwork: this.artwork,
            },
          }),
        );
        
        // Wait for audio to be ready, then seek
        if (this.audioElement.readyState >= 1) {
          this.audioElement.currentTime = clickPercentage * this.audioElement.duration;
        } else {
          this.audioElement.addEventListener(
            "loadedmetadata",
            () => {
              this.audioElement.currentTime = clickPercentage * this.audioElement.duration;
            },
            { once: true },
          );
        }
      } else {
        // Track is already playing, seek directly
        this.audioElement.currentTime = clickPercentage * this.audioElement.duration;
      }
    });
  }

  setupAudioListeners() {
    // Remove old listener if it exists
    if (this.updateBound) {
      this.audioElement.removeEventListener('timeupdate', this.updateBound);
    }
    
    // Bind the update method so we can remove it later
    this.updateBound = () => {
      this.updateWaveformProgress();
    };
    
    this.audioElement.addEventListener('timeupdate', this.updateBound);
    this.audioElement.addEventListener('play', () => this.updatePlayIcon());
    this.audioElement.addEventListener('pause', () => this.updatePlayIcon());
  }

  updateWaveformProgress() {
    // Only update if this track is currently playing
    if (!this.audioElement || this.audioElement.src !== this.audioUrl || !this.audioElement.duration) {
      return;
    }
    
    if (this.waveformProgress) {
      const playbackPercentage = (this.audioElement.currentTime / this.audioElement.duration) * 100;
      this.waveformProgress.style.width = playbackPercentage + "%";
      
      // Scale background image so orange waveform matches full width
      if (playbackPercentage > 0) {
        const backgroundSizePercentage = (100 / playbackPercentage) * 100;
        this.waveformProgress.style.backgroundSize = backgroundSizePercentage + "% 100%";
      }
    }

    // Update timestamp in the track footer
    const trackFooterTimestamp = this.shadowRoot?.querySelector('.timestamp');
    if (trackFooterTimestamp) {
      const currentTime = Math.floor(this.audioElement.currentTime);
      const duration = Math.floor(this.audioElement.duration);
      const formattedCurrentTime = this._formatTime(currentTime);
      const formattedDuration = this._formatTime(duration);
      trackFooterTimestamp.innerHTML = formattedCurrentTime + ' / ' + formattedDuration;
    }
  }

  _formatTime(secs) {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    if (hours > 0) {
      return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  updatePlayIcon() {
    // Update the active property to reflect play/pause state
    if (this.audioElement.src === this.audioUrl) {
      this.active = !this.audioElement.paused;
    } else {
      this.active = false;
    }
  }

  // Override _requestPlay to set audio src directly (Plyr wraps the element, so it stays in sync)
  _requestPlay() {
    if (!this.audioUrl || !this.audioElement) return;
    
    // Update player info in parent window
    const parentDoc = window.parent.document;
    const playerTitle = parentDoc.getElementById('player-title');
    const playerArtist = parentDoc.getElementById('player-artist');
    const playerArt = parentDoc.getElementById('player-art');
    if (playerTitle) playerTitle.innerText = this.title;
    if (playerArtist) playerArtist.innerText = this.artist;
    if (playerArt) {
      playerArt.src = this.artwork;
      playerArt.style.display = 'block';
    }
    
    // Toggle play/pause if this track is already loaded
    if (this.audioElement.src === this.audioUrl) {
      this.audioElement.paused ? this.audioElement.play() : this.audioElement.pause();
    } else {
      this.audioElement.src = this.audioUrl;
      this.audioElement.play();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up event listeners
    if (this.updateBound && this.audioElement) {
      this.audioElement.removeEventListener('timeupdate', this.updateBound);
    }
  }
}
