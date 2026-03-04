const form = document.getElementById('loginForm');
const username = document.getElementById('username');
const password = document.getElementById('password');
const loginError = document.getElementById('loginError');

async function fetchJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Backend not reachable. Run `npm start` and open http://localhost:3000/admin-login.html');
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // no-op
    }
    throw new Error(message);
  }
  return res.json();
}

async function checkSession() {
  const data = await fetchJson('/api/admin/session');
  if (data.authenticated) {
    window.location.href = '/admin.html';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  try {
    await fetchJson('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value.trim(),
        password: password.value.trim()
      })
    });
    window.location.href = '/admin.html';
  } catch (error) {
    loginError.textContent = error.message;
  }
});

async function init() {
  try {
    await checkSession();
  } catch (error) {
    loginError.textContent = error.message;
  }
}

init();
