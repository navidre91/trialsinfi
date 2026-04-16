class AdminLoginPage {
  constructor() {
    this.redirectUrl = 'admin-panel-php.html';
  }

  async init() {
    await this.redirectIfAuthenticated();
    this.bindEvents();
    document.getElementById('username')?.focus();
  }

  async redirectIfAuthenticated() {
    try {
      const response = await fetch('api/auth.php?action=session', {
        method: 'GET',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.authenticated && data.user?.role === 'admin') {
        window.location.href = this.redirectUrl;
      }
    } catch (error) {
      console.error('Failed checking admin session:', error);
    }
  }

  bindEvents() {
    document.getElementById('loginForm')?.addEventListener('submit', event => {
      event.preventDefault();
      this.handleLogin();
    });

    ['username', 'password'].forEach(fieldId => {
      document.getElementById(fieldId)?.addEventListener('input', () => {
        this.hideMessages();
      });
    });
  }

  setLoading(isLoading) {
    document.getElementById('loginBtn').disabled = isLoading;
    document.getElementById('loginSpinner').style.display = isLoading ? 'block' : 'none';
    document.getElementById('loginBtnText').style.display = isLoading ? 'none' : 'inline';
  }

  showError(message) {
    document.getElementById('loginErrorMessage').textContent = message;
    document.getElementById('loginError').style.display = 'block';
    document.getElementById('loginSuccess').style.display = 'none';
  }

  showSuccess() {
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginSuccess').style.display = 'block';
  }

  hideMessages() {
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginSuccess').style.display = 'none';
  }

  async handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
      this.showError('Please enter both username and password');
      return;
    }

    this.hideMessages();
    this.setLoading(true);

    try {
      const response = await fetch('api/auth.php?action=admin_login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          password
        })
      });

      const data = await response.json().catch(() => ({
        success: false,
        message: 'Invalid server response.'
      }));

      if (!response.ok || data.success === false) {
        this.showError(data.message || 'Invalid credentials');
        return;
      }

      this.showSuccess();
      setTimeout(() => {
        window.location.href = this.redirectUrl;
      }, 700);
    } catch (error) {
      console.error('Admin login failed:', error);
      this.showError('Unable to sign in right now');
    } finally {
      this.setLoading(false);
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const page = new AdminLoginPage();
  await page.init();
});
