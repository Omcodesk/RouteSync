/** Reviews panel */
import { fetchReviews, postReview } from './api.js';
import { escapeHtml } from './utils.js';

export function bindReviews() {
  window.__openReviews = openReviewsForBus;
}

async function openReviewsForBus(busId) {
  let panel = document.getElementById('panel-reviews');
  const sidebar = document.getElementById('bus-list');
  if (!sidebar) return;

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'panel-reviews';
    panel.className = 'reviews-panel card hidden';
    panel.innerHTML = `
      <div class="reviews-head"><strong>Reviews</strong><button type="button" id="panel-close-reviews" class="btn btn-ghost btn-sm">Close</button></div>
      <div id="panel-reviews-list"></div>
      <div id="panel-reviews-form" class="reviews-form">
        <textarea id="panel-review-text" rows="3" placeholder="Write a review…"></textarea>
        <div class="reviews-form-row">
          <select id="panel-review-rating"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select>
          <button type="button" id="panel-submit-review" class="btn btn-primary btn-sm">Submit</button>
        </div>
        <p id="panel-review-msg" class="muted small"></p>
      </div>`;
    sidebar.parentNode?.insertBefore(panel, sidebar);
    panel.querySelector('#panel-close-reviews').onclick = () => panel.classList.add('hidden');
    panel.querySelector('#panel-submit-review').onclick = () => submitReview(panel);
  }

  panel.dataset.busId = String(busId);
  panel.classList.remove('hidden');
  await loadReviews(panel, busId);
}

async function loadReviews(panel, busId) {
  const listEl = panel.querySelector('#panel-reviews-list');
  listEl.innerHTML = '<div class="skeleton-line"></div>';
  try {
    const arr = await fetchReviews(busId);
    if (!arr.length) { listEl.innerHTML = '<p class="muted small">No reviews yet</p>'; return; }
    listEl.innerHTML = arr.map((r) => `
      <div class="review-item">
        <div class="review-head"><strong>${escapeHtml(r.author || 'Anonymous')}</strong><small class="muted">${new Date(r.createdAt).toLocaleString()}</small></div>
        <div class="review-stars">${'★'.repeat(r.rating || 0)}</div>
        <p class="muted small">${escapeHtml(r.comment || '')}</p>
      </div>`).join('');
  } catch (_) {
    listEl.innerHTML = '<p class="muted small">Failed to load reviews</p>';
  }
}

async function submitReview(panel) {
  const busId = panel.dataset.busId;
  const txt = panel.querySelector('#panel-review-text').value.trim();
  const rating = panel.querySelector('#panel-review-rating').value;
  const msgEl = panel.querySelector('#panel-review-msg');
  if (!txt) { msgEl.textContent = 'Enter a review'; return; }
  try {
    const author = JSON.parse(localStorage.getItem('tt_user') || '{}')?.email;
    await postReview(busId, { comment: txt, rating: Number(rating), author });
    panel.querySelector('#panel-review-text').value = '';
    msgEl.textContent = 'Posted';
    await loadReviews(panel, busId);
  } catch (_) {
    msgEl.textContent = 'Failed to post';
  }
}
