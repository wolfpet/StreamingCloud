// APP_CONFIG is set by env.js (generated at deploy time by CDK)
// Fallback for local development if env.js is not available
if (!window.APP_CONFIG) {
  window.APP_CONFIG = {
    API_URL: "",
    AWS_REGION: "",
    USER_POOL_ID: "",
    CLIENT_ID: "",
    COGNITO_DOMAIN: "",
    PLAYBACK_HISTORY_TTL_DAYS: 100,
    EXPIRED_MARKER_TTL_DAYS: 7,
    SITE_NAME: "Streaming Cloud",
    SITE_TAGLINE: "Community-driven music streaming",
    SITE_PLAYER_SUBTITLE: "Hit Play and enjoy the music!",
    ACCENT_COLOR: "#ff5500",
    ACCENT_COLOR_LIGHT: "#ff8800",
    CONTACT_EMAIL: "",
    CONSOLE_BANNER_EMOJI: "🎵",
    GOOGLE_SITE_VERIFICATION: ""
  };
}
window.SYNC_ACROSS_DEVICES = true; // Default value, can be updated based on user settings



window.addEventListener("DOMContentLoaded", () => {

  //dark mode anyone?
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    window.parent.document.body.classList.add("dark-mode");

  } else if (savedTheme === "light") {
    document.body.classList.remove("dark-mode");
    window.parent.document.body.classList.remove("dark-mode");

  } else {
    // Default to dark mode, save it
    document.body.classList.add("dark-mode");
    window.parent.document.body.classList.add("dark-mode");
    localStorage.setItem("theme", "dark");
  }
  //sync playback across devices
  const syncAcrossDevicesSetting = localStorage.getItem('syncAcrossDevices');
  if(!syncAcrossDevicesSetting) {
    //not defined or true.  True by default, and save it
    localStorage.setItem('syncAcrossDevices', 'true');
    window.SYNC_ACROSS_DEVICES = true;
  }
  else if (syncAcrossDevicesSetting === 'true') {
    window.SYNC_ACROSS_DEVICES = true;
  } 

  else if (syncAcrossDevicesSetting === 'false') {
    window.SYNC_ACROSS_DEVICES = false;
  }
  //console.log("Sync across devices setting:", window.SYNC_ACROSS_DEVICES);
});
