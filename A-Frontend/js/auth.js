/** Authentication UI */
import { DEMO_CREDENTIALS } from './config.js';
import { login } from './api.js';
import { toast } from './utils.js';

export function bindAuthUI(onLoginSuccess) {
  const loginModal = document.getElementById('login-modal');

  document.getElementById('login-close')?.addEventListener('click', closeLoginModal);
  loginModal?.addEventListener('click', (e) => { if (e.target === loginModal) closeLoginModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLoginModal(); });

  document.querySelectorAll('.role-cta').forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      if (role === 'passenger') onLoginSuccess('passenger');
      else openLoginModal(role);
    });
  });

  document.querySelectorAll('.demo-fill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      fillLoginForm(btn.dataset.demoRole);
      openLoginModal(btn.dataset.demoRole);
      toast('Demo credentials filled — click Sign In', 2500);
    });
  });

  document.getElementById('login-demo-fill')?.addEventListener('click', () => {
    fillLoginForm(loginModal?.dataset?.role);
  });

  document.getElementById('login-submit')?.addEventListener('click', async () => {
    const role = loginModal?.dataset?.role || 'passenger';
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value.trim();
    const msg = document.getElementById('login-msg');
    if (!email || !password) { if (msg) msg.textContent = 'Email & password required'; return; }
    try {
      const j = await login(email, password);
      if (j.token) localStorage.setItem('tt_token', j.token);
      if (j.user) localStorage.setItem('tt_user', JSON.stringify(j.user));
      if (msg) msg.textContent = 'Logged in';
      closeLoginModal();
      toast(`Welcome ${j.user?.email || email}`, 1400);
      onLoginSuccess(role);
    } catch (e) {
      if (msg) msg.textContent = e.message;
    }
  });
}

export function openLoginModal(role = 'passenger') {
  const loginModal = document.getElementById('login-modal');
  if (!loginModal) return;
  loginModal.classList.remove('hidden');
  loginModal.dataset.role = role;
  document.getElementById('login-title').innerText = `${role.charAt(0).toUpperCase() + role.slice(1)} Login`;
  const creds = DEMO_CREDENTIALS[role];
  const hint = document.getElementById('login-demo-hint');
  if (hint && creds) {
    hint.classList.remove('hidden');
    document.getElementById('login-demo-email').textContent = creds.email;
    document.getElementById('login-demo-pass').textContent = creds.password;
  } else hint?.classList.add('hidden');
}

function closeLoginModal() {
  document.getElementById('login-modal')?.classList.add('hidden');
}

function fillLoginForm(role) {
  const creds = DEMO_CREDENTIALS[role];
  if (!creds) return;
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');
  if (emailEl) emailEl.value = creds.email;
  if (passEl) passEl.value = creds.password;
}
