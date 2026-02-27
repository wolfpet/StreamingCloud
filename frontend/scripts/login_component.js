import {
  LitElement,
  html,
  css,
} from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";

export class LoginComponent extends LitElement {
  static properties = {
    loading: { type: Boolean },
    message: { type: String },
    messageType: { type: String },
    showNewPasswordForm: { type: Boolean },
    challengeSession: { type: String },
    challengeEmail: { type: String },
  };

  constructor() {
    super();
    this.loading = false;
    this.message = "";
    this.messageType = "";
    this.showNewPasswordForm = false;
    this.challengeSession = null;
    this.challengeEmail = null;
    this.AWS_REGION = window.APP_CONFIG.AWS_REGION;
    this.USER_POOL_ID = window.APP_CONFIG.USER_POOL_ID;
    this.CLIENT_ID = window.APP_CONFIG.CLIENT_ID;
  }

  async handleLogin(event) {
    event.preventDefault();

    const email = this.shadowRoot.getElementById("email").value;
    const password = this.shadowRoot.getElementById("password").value;

    this.loading = true;
    this.message = "";

    try {
      const response = await fetch(
        `https://cognito-idp.${this.AWS_REGION}.amazonaws.com/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
          },
          body: JSON.stringify({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: this.CLIENT_ID,
            AuthParameters: {
              USERNAME: email,
              PASSWORD: password,
            },
          }),
        },
      );

      const data = await response.json();
      console.log("Login response:", data);

      if (data.AuthenticationResult) {
        const { IdToken, AccessToken, RefreshToken } =
          data.AuthenticationResult;

        // Store tokens in localStorage
        localStorage.setItem("idToken", IdToken);
        localStorage.setItem("accessToken", AccessToken);
        if (RefreshToken) {
          localStorage.setItem("refreshToken", RefreshToken);
        }

        // Decode and store user info
        const tokenPayload = this.parseJwt(IdToken);
        if (tokenPayload) {
          localStorage.setItem(
            "userName",
            tokenPayload.name || tokenPayload.email || "User",
          );
          localStorage.setItem("userEmail", tokenPayload.email || email);
          localStorage.setItem("userPicture", tokenPayload.picture || "");
        }

        this.message = `Welcome back, ${email}!`;
        this.messageType = "success";

        // Notify parent window that login succeeded
        window.dispatchEvent(
          new CustomEvent("auth-state-changed", {
            detail: { authenticated: true, email },
          }),
        );

        // Update global userLoggedIn if it exists
        if (typeof window.userLoggedIn !== "undefined") {
          window.userLoggedIn = true;
        }

        // Close dialog after success
        setTimeout(() => {
          const dialog = this.closest("sl-dialog");
          if (dialog) dialog.hide();
          // Reload page to update UI
          window.location.reload();
        }, 1000);
      } else if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        this.challengeSession = data.Session;
        this.challengeEmail = email;
        this.showNewPasswordForm = true;
        this.message = "Please set a new password";
        this.messageType = "warning";
      } else {
        this.message =
          "Login failed: " + (data.message || data.__type || "Unknown error");
        this.messageType = "error";
      }
    } catch (error) {
      console.error("Login error:", error);
      this.message = "Login failed: " + error.message;
      this.messageType = "error";
    } finally {
      this.loading = false;
    }
  }

  async handleNewPassword(event) {
    event.preventDefault();

    const newPassword = this.shadowRoot.getElementById("newPassword").value;

    this.loading = true;
    this.message = "Setting new password...";
    this.messageType = "";

    try {
      const response = await fetch(
        `https://cognito-idp.${this.AWS_REGION}.amazonaws.com/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target":
              "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
          },
          body: JSON.stringify({
            ChallengeName: "NEW_PASSWORD_REQUIRED",
            ClientId: this.CLIENT_ID,
            Session: this.challengeSession,
            ChallengeResponses: {
              USERNAME: this.challengeEmail,
              NEW_PASSWORD: newPassword,
            },
          }),
        },
      );

      const data = await response.json();
      console.log("Password change response:", data);

      if (data.AuthenticationResult) {
        const { IdToken, AccessToken, RefreshToken } =
          data.AuthenticationResult;

        // Store tokens
        localStorage.setItem("idToken", IdToken);
        localStorage.setItem("accessToken", AccessToken);
        if (RefreshToken) {
          localStorage.setItem("refreshToken", RefreshToken);
        }

        // Decode and store user info
        const tokenPayload = this.parseJwt(IdToken);
        if (tokenPayload) {
          localStorage.setItem(
            "userName",
            tokenPayload.name || tokenPayload.email || "User",
          );
          localStorage.setItem(
            "userEmail",
            tokenPayload.email || this.challengeEmail,
          );
          localStorage.setItem("userPicture", tokenPayload.picture || "");
        }

        this.message = "Password changed successfully!";
        this.messageType = "success";
        this.showNewPasswordForm = false;

        // Notify parent window
        window.dispatchEvent(
          new CustomEvent("auth-state-changed", {
            detail: { authenticated: true, email: this.challengeEmail },
          }),
        );

        if (typeof window.userLoggedIn !== "undefined") {
          window.userLoggedIn = true;
        }

        // Close dialog after success
        setTimeout(() => {
          const dialog = this.closest("sl-dialog");
          if (dialog) dialog.hide();
          window.location.reload();
        }, 1000);
      } else {
        this.message = `Password change failed: ${data.message || data.__type || "Unknown error"}`;
        this.messageType = "error";
      }
    } catch (error) {
      console.error("Password change error:", error);
      this.message = `Password change failed: ${error.message}`;
      this.messageType = "error";
    } finally {
      this.loading = false;
    }
  }

  parseJwt(token) {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(""),
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error("Error parsing token:", e);
      return null;
    }
  }
  static styles = css`
    :host {
      --bg-color: #ffffff;
      --text-color: #333333;
      --accent-color: #ff5500;
      --input-bg: #ffffff;
      --input-border: #ddd;
      --message-success-bg: #d4edda;
      --message-success-text: #155724;
      --message-error-bg: #f8d7da;
      --message-error-text: #721c24;
      --message-warning-bg: #fff3cd;
      --message-warning-text: #856404;
      --message-info-bg: #d1ecf1;
      --message-info-text: #0c5460;
    }

    :host-context(body.dark-mode) {
      --text-color: #ffffff;
      --input-bg: #444444;
      --input-border: #555555;
      --message-success-bg: #1e4620;
      --message-success-text: #a6e9a3;
      --message-error-bg: #5a1f1f;
      --message-error-text: #ff6b6b;
      --message-warning-bg: #5a4a1f;
      --message-warning-text: #ffd699;
      --message-info-bg: #1f4a5a;
      --message-info-text: #6bccff;
    }

    form {
      font-family: "Interstate", sans-serif;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: var(--text-color);
      font-weight: 500;
      font-size: 14px;
    }

    input {
      background: var(--input-bg);
      color: var(--text-color);
      border: 1px solid var(--input-border);
      padding: 12px;
      border-radius: 5px;
      font-size: 14px;
      box-sizing: border-box;
    }

    input:focus {
      outline: none;
      border-color: var(--accent-color);
      box-shadow: 0 0 0 2px rgba(255, 85, 0, 0.1);
    }

    button {
      width: 50%;
      padding: 12px;
      border: none;
      border-radius: 5px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      background: var(--accent-color);
      color: white;
      transition: opacity 0.2s;
    }

    button:hover {
      opacity: 0.9;
    }

    p {
      color: var(--text-color);
      margin-bottom: 20px;
      font-size: 14px;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    // Watch for dark mode changes on body element
    const observer = new MutationObserver(() => {
      this.requestUpdate();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  render() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    const messageStyle = this.getMessageStyle();

    return html`
      ${this.message
        ? html`
            <div style="padding: 12px; border-radius: 5px; margin-bottom: 20px; ${messageStyle}">
              ${this.message}
            </div>
          `
        : ""}
      ${this.showNewPasswordForm
        ? html`
            <form @submit=${this.handleNewPassword}>
              <p>You need to set a new password.</p>
              <div style="margin-bottom: 20px;">
                <label for="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  placeholder="Min 12 chars, uppercase, lowercase, digit, symbol"
                  required
                />
              </div>
              ${this.loading ? html`<div style="text-align: center; margin-bottom: 15px;">Setting new password...</div>` : ""}
              <button type="submit">Set New Password</button>
            </form>
          `
        : html`
            <form @submit=${this.handleLogin}>
              <div style="display: block; gap: 50px; margin-bottom: 20px;">
                <div style="flex: 0 0 250px;">
                  <label for="email">Email</label>
                  <input type="email" id="email" placeholder="your@email.com" required />
                </div>
                <div style="flex: 0 0 250px;">
                  <label for="password">Password</label>
                  <input type="password" id="password" placeholder="Enter your password" required />
                </div>
              </div>
              ${this.loading ? html`<div style="text-align: center; margin-bottom: 15px;">Authenticating...</div>` : ""}
              <button type="submit">Login</button>
            </form>
          `}
    `;
  }

  getMessageStyle() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    let bgVar, textVar;

    if (this.messageType === 'success') {
      bgVar = isDarkMode ? 'var(--darkmode-message-success-bg)' : 'var(--message-success-bg)';
      textVar = isDarkMode ? 'var(--darkmode-message-success-text)' : 'var(--message-success-text)';
    } else if (this.messageType === 'error') {
      bgVar = isDarkMode ? 'var(--darkmode-message-error-bg)' : 'var(--message-error-bg)';
      textVar = isDarkMode ? 'var(--darkmode-message-error-text)' : 'var(--message-error-text)';
    } else if (this.messageType === 'warning') {
      bgVar = isDarkMode ? 'var(--darkmode-message-warning-bg)' : 'var(--message-warning-bg)';
      textVar = isDarkMode ? 'var(--darkmode-message-warning-text)' : 'var(--message-warning-text)';
    } else {
      bgVar = isDarkMode ? 'var(--darkmode-message-info-bg)' : 'var(--message-info-bg)';
      textVar = isDarkMode ? 'var(--darkmode-message-info-text)' : 'var(--message-info-text)';
    }

    return `background: ${bgVar}; color: ${textVar};`;
  }
}

customElements.define("login-component", LoginComponent);
