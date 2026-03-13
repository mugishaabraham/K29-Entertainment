const form = document.getElementById('loginForm');
const username = document.getElementById('username');
const password = document.getElementById('password');
const loginError = document.getElementById('loginError');

async function fetchJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Backend not reachable. Verify Cloudflare Pages Functions are deployed.');
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    const raw = await res.text();
    try {
      const data = JSON.parse(raw);
      message = data.error || message;
    } catch {
      message = raw || message;
    }
    if (res.status === 404 && String(url).startsWith('/api/')) {
      message = 'API route not found (404). Deploy with Cloudflare Pages Functions enabled.';
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
