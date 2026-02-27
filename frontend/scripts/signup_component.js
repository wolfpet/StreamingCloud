import { html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { LoginComponent } from './login_component.js';

class SignupComponent extends LoginComponent {
  async handleSignup(event) {
    event.preventDefault();
    
    const email = this.shadowRoot.getElementById('email').value;
    const password = this.shadowRoot.getElementById('password').value;
    const name = this.shadowRoot.getElementById('name').value;

    this.loading = true;
    this.message = '';

    try {
      const response = await fetch(`https://cognito-idp.${this.AWS_REGION}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp'
        },
        body: JSON.stringify({
          ClientId: this.CLIENT_ID,
          Username: email,
          Password: password,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'name', Value: name }
          ]
        })
      });

      const data = await response.json();
      console.log('Signup response:', data);

      if (data.UserConfirmed !== undefined) {
        this.message = `Account created successfully! Logging you in...`;
        this.messageType = 'success';

        // Wait 2 seconds then attempt to log user in
        setTimeout(async () => {
          try {
            const loginResponse = await fetch(`https://cognito-idp.${this.AWS_REGION}.amazonaws.com/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
              },
              body: JSON.stringify({
                AuthFlow: 'USER_PASSWORD_AUTH',
                ClientId: this.CLIENT_ID,
                AuthParameters: {
                  USERNAME: email,
                  PASSWORD: password
                }
              })
            });

            const loginData = await loginResponse.json();
            console.log('Auto-login response:', loginData);

            if (loginData.AuthenticationResult) {
              const { IdToken, AccessToken, RefreshToken } = loginData.AuthenticationResult;
              
              // Store tokens in localStorage
              localStorage.setItem('idToken', IdToken);
              localStorage.setItem('accessToken', AccessToken);
              if (RefreshToken) {
                localStorage.setItem('refreshToken', RefreshToken);
              }

              // Decode and store user info
              const tokenPayload = this.parseJwt(IdToken);
              if (tokenPayload) {
                localStorage.setItem('userName', tokenPayload.name || tokenPayload.email || name);
                localStorage.setItem('userEmail', tokenPayload.email || email);
                localStorage.setItem('userPicture', tokenPayload.picture || '');
              }

              // Notify parent window that login succeeded
              window.dispatchEvent(new CustomEvent('auth-state-changed', { 
                detail: { authenticated: true, email } 
              }));

              if (typeof window.userLoggedIn !== 'undefined') {
                window.userLoggedIn = true;
              }

              // Close dialog and reload
              const dialog = this.closest('sl-dialog');
              if (dialog) dialog.hide();
              window.location.reload();
            } else {
              this.message = 'Account created but auto-login failed. Please login manually.';
              this.messageType = 'warning';
            }
          } catch (error) {
            console.error('Auto-login error:', error);
            this.message = 'Account created but auto-login failed. Please login manually.';
            this.messageType = 'warning';
          }
        }, 2000);

      } else {
        this.message = `Signup failed: ${data.message || data.__type || 'Unknown error'}`;
        this.messageType = 'error';
      }
    } catch (error) {
      console.error('Signup error:', error);
      this.message = `Signup failed: ${error.message}`;
      this.messageType = 'error';
    } finally {
      this.loading = false;
    }
  }

  render() {
    const messageStyle = this.getMessageStyle();

    return html`
      ${this.message ? html`
        <div style="padding: 12px; border-radius: 5px; margin-bottom: 20px; ${messageStyle}">
          ${this.message}
        </div>
      ` : ''}

      <form @submit=${this.handleSignup}>
        <div style="margin-bottom: 20px;">
          <label for="name">Name</label>
          <input type="text" id="name" placeholder="Your full name" required style="width: 60%;"/>
        </div>

        <div style="margin-bottom: 20px;">
          <label for="email">Email</label>
          <input type="email" id="email" placeholder="your@email.com" required style="width: 60%;"/>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label for="password">Password</label>
          <input type="password" id="password" placeholder="Min 8 chars, complex enough to be secure" required style="width: 60%;"/>
        </div>
        
        ${this.loading ? html`<div style="text-align: center; margin-bottom: 15px;">Creating account...</div>` : ''}
        
        <button type="submit">Sign Up</button>
      </form>
    `;
  }
}

customElements.define('signup-component', SignupComponent);
