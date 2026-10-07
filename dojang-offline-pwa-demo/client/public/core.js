// Registrasi Service Worker Dojang Core (Root Scope '/')
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[Core App] Service Worker Core terdaftar dengan scope:', reg.scope);
        const statusEl = document.getElementById('sw-status');
        if (statusEl) {
          statusEl.textContent = `SW Core Aktif (${reg.scope})`;
        }
      })
      .catch((err) => {
        console.error('[Core App] Gagal registrasi SW Core:', err);
      });
  });
}

// Handler Autentikasi Bersama (Shared across subpaths)
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const userGreeting = document.getElementById('user-greeting');
  const loggedInState = document.getElementById('logged-in-state');
  const loggedOutState = document.getElementById('logged-out-state');
  const btnLogout = document.getElementById('btn-logout');

  function updateAuthUI() {
    const userJson = localStorage.getItem('dojang_auth_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      if (userGreeting) userGreeting.textContent = `${user.name} (${user.role.toUpperCase()})`;
      if (loggedInState) loggedInState.style.display = 'block';
      if (loggedOutState) loggedOutState.style.display = 'none';
    } else {
      if (loggedInState) loggedInState.style.display = 'none';
      if (loggedOutState) loggedOutState.style.display = 'block';
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const role = document.getElementById('role-select').value;
      const email = document.getElementById('email-input').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('dojang_auth_user', JSON.stringify(data.user));
          localStorage.setItem('dojang_token', data.token);
          alert(`Login berhasil sebagai ${data.user.name}. Token tersimpan untuk semua subpath!`);
          updateAuthUI();
        }
      } catch (err) {
        // Fallback offline mock jika server tidak jalan
        const fallbackUser = { id: 'USR-LOCAL', name: 'Wasit Offline', role };
        localStorage.setItem('dojang_auth_user', JSON.stringify(fallbackUser));
        localStorage.setItem('dojang_token', 'offline-token-123');
        updateAuthUI();
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('dojang_auth_user');
      localStorage.removeItem('dojang_token');
      updateAuthUI();
    });
  }

  updateAuthUI();
});
