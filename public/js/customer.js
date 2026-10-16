'use strict';

(function () {
  const STATE = { menu: [], reviews: [], ads: [], query: '', filter: 'all', menuSig: '', reviewSig: '', adSig: '' };

  const els = {
    menu: document.getElementById('menu'),
    menuEmpty: document.getElementById('menu-empty'),
    menuLoading: document.getElementById('menu-loading'),
    chips: document.getElementById('section-chips'),
    search: document.getElementById('menu-search'),
    offers: document.getElementById('offers'),
    offersTrack: document.getElementById('offers-track'),
    reviewsTrack: document.getElementById('reviews-track'),
    reviewsEmpty: document.getElementById('reviews-empty'),
    dialog: document.getElementById('review-dialog'),
    form: document.getElementById('review-form'),
    error: document.getElementById('review-error'),
    stars: document.getElementById('rating-stars'),
    toast: document.getElementById('toast'),
  };

  const STAR =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.6l2.5 5.14 5.66.82-4.08 3.98.96 5.64L12 16.53l-5.04 2.65.96-5.64L3.84 9.56l5.66-.82L12 3.6Z"/></svg>';

  const CURRENCY = (document.body.dataset.currency || '').trim();

  function formatPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    const rounded = Math.round(amount * 100) / 100;
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return CURRENCY ? `${CURRENCY}${text}` : text;
  }

  function show(node, visible) {
    if (node) node.classList.toggle('is-hidden', !visible);
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => els.toast.classList.remove('is-visible'), 3200);
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  /* ----------------------------- Menu ----------------------------- */

  const DIET_MARK =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>';

  function dietBadge(diet) {
    if (diet !== 'veg' && diet !== 'non_veg') return null;
    const nonVeg = diet === 'non_veg';
    const b = document.createElement('span');
    b.className = `badge badge--diet ${nonVeg ? 'badge--nonveg' : 'badge--veg'}`;
    b.innerHTML = DIET_MARK;
    const label = document.createElement('span');
    label.textContent = nonVeg ? 'Non-veg' : 'Veg';
    b.appendChild(label);
    return b;
  }

  function buildDish(dish) {
    const node = document.getElementById('dish-template').content.firstElementChild.cloneNode(true);
    if (!dish.is_available) node.classList.add('dish--unavailable');

    const media = node.querySelector('.dish__media');
    if (dish.image_url) {
      const img = node.querySelector('.dish__media img');
      img.src = dish.image_url;
      img.alt = dish.name;
      img.hidden = false;
    } else {
      media.remove();
      node.classList.add('dish--no-media');
    }

    node.querySelector('.dish__name').textContent = dish.name;
    node.querySelector('.dish__price').textContent = formatPrice(dish.price);

    const desc = node.querySelector('.dish__desc');
    if (dish.description) {
      desc.textContent = dish.description;
    } else {
      desc.remove();
    }

    const badges = node.querySelector('.badges');
    const diet = dietBadge(dish.diet);
    if (diet) {
      // With a photo, the veg/non-veg badge sits on the photo's top-left corner;
      // without one, it stays above the dish name as before.
      const media = node.querySelector('.dish__media');
      (dish.image_url && media ? media : badges).appendChild(diet);
    }
    if (!dish.is_available) {
      const b = document.createElement('span');
      b.className = 'badge badge--soldout';
      b.textContent = 'Sold out';
      badges.appendChild(b);
    }
    if (dish.is_popular) {
      const b = document.createElement('span');
      b.className = 'badge badge--popular';
      b.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.6l2.5 5.14 5.66.82-4.08 3.98.96 5.64L12 16.53l-5.04 2.65.96-5.64L3.84 9.56l5.66-.82L12 3.6Z"/></svg> Popular';
      node.appendChild(b);
    }

    return node;
  }

  function matches(dish, query) {
    if (!query) return true;
    const haystack = `${dish.name} ${dish.description || ''}`.toLowerCase();
    return haystack.includes(query);
  }

  function renderMenu() {
    const query = STATE.query.trim().toLowerCase();
    els.menu.textContent = '';

    const sections = STATE.menu
      .filter((section) => STATE.filter === 'all' || section.id === STATE.filter)
      .map((section) => ({ ...section, dishes: section.dishes.filter((d) => matches(d, query)) }))
      .filter((section) => section.dishes.length > 0);

    for (const section of sections) {
      const node = document.getElementById('section-template').content.firstElementChild.cloneNode(true);
      node.className = 'section';
      const slug = `section-${section.id}`;
      node.id = slug;
      node.querySelector('.section__title').textContent = section.name;
      node.querySelector('.section__count').textContent =
        section.dishes.length === 1 ? '1 item' : `${section.dishes.length} items`;
      const list = node.querySelector('.dishes');
      for (const dish of section.dishes) list.appendChild(buildDish(dish));
      els.menu.appendChild(node);
    }

    show(els.menuLoading, false);

    if (!sections.length) {
      const trulyEmpty = !STATE.menu.length;
      const heading = els.menuEmpty.querySelector('h2');
      const para = els.menuEmpty.querySelector('p');
      if (trulyEmpty) {
        heading.textContent = 'Our menu is being prepared';
        para.textContent = 'We are putting the finishing touches on our display. Please check back in a moment.';
      } else {
        heading.textContent = 'Nothing matches that search';
        para.textContent = 'Try a different word, or clear the search to see everything.';
      }
      show(els.menuEmpty, true);
    } else {
      show(els.menuEmpty, false);
    }
  }

  function scrollToMenu() {
    const top = els.menu.getBoundingClientRect().top + window.scrollY - 130;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function setFilter(value) {
    STATE.filter = value;
    for (const chip of els.chips.children) {
      chip.setAttribute('aria-pressed', chip.dataset.filter === value ? 'true' : 'false');
    }
    renderMenu();
    scrollToMenu();
  }

  function renderChips() {
    els.chips.textContent = '';
    const entries = [{ id: 'all', name: 'All' }, ...STATE.menu];
    for (const section of entries) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = section.name;
      chip.dataset.filter = section.id;
      chip.setAttribute('aria-pressed', STATE.filter === section.id ? 'true' : 'false');
      chip.addEventListener('click', () => setFilter(section.id));
      els.chips.appendChild(chip);
    }
    show(els.chips, STATE.menu.length > 0);
  }

  /* --------------------------- Marquee --------------------------- */

  function fillMarquee(track, items, build, loop = true) {
    track.textContent = '';
    if (!items.length) return;
    for (const item of items) track.appendChild(build(item));
    if (!loop) return;
    // Duplicate for a seamless loop; hide duplicates from assistive tech.
    const clone = track.cloneNode(true);
    for (const child of clone.children) child.setAttribute('aria-hidden', 'true');
    while (clone.firstChild) track.appendChild(clone.firstChild);
  }

  function buildOffer(ad) {
    const node = document.getElementById('offer-template').content.firstElementChild.cloneNode(true);
    const img = node.querySelector('img');
    img.src = ad.image_url;
    img.alt = 'Offer';
    return node;
  }

  function buildReview(review) {
    const node = document.getElementById('review-template').content.firstElementChild.cloneNode(true);
    const stars = node.querySelector('.review-card__stars');
    for (let i = 1; i <= 5; i += 1) {
      const s = document.createElement('span');
      s.innerHTML = STAR;
      if (i > review.rating) s.querySelector('svg').classList.add('off');
      stars.appendChild(s);
    }
    node.querySelector('.review-card__quote').textContent = `“${review.content}”`;
    node.querySelector('.review-card__author').textContent = review.author_name;
    return node;
  }

  const slider = { index: 0, count: 0, timer: 0 };

  function goToSlide(index, animate = true) {
    const track = els.offersTrack;
    if (!track || !slider.count) return;
    slider.index = ((index % slider.count) + slider.count) % slider.count;
    if (animate) {
      track.style.transform = `translateX(-${slider.index * 100}%)`;
    } else {
      track.style.transition = 'none';
      track.style.transform = `translateX(-${slider.index * 100}%)`;
      void track.offsetWidth;
      track.style.transition = '';
    }
    const dots = document.getElementById('offers-dots');
    if (!dots) return;
    for (const dot of dots.children) {
      const on = Number(dot.dataset.index) === slider.index;
      dot.classList.toggle('is-active', on);
      dot.setAttribute('aria-selected', String(on));
    }
  }

  function stopSlider() {
    window.clearInterval(slider.timer);
  }

  function startSlider() {
    stopSlider();
    if (slider.count < 2 || document.visibilityState !== 'visible') return;
    slider.timer = window.setInterval(() => goToSlide(slider.index + 1), 4500);
  }

  function buildDots(count) {
    const dots = document.getElementById('offers-dots');
    if (!dots) return;
    dots.textContent = '';
    if (count < 2) return;
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slider__dot';
      dot.dataset.index = String(i);
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Offer ${i + 1}`);
      dot.addEventListener('click', () => {
        goToSlide(i);
        startSlider();
      });
      dots.appendChild(dot);
    }
  }

  function renderAds() {
    show(els.offers, STATE.ads.length > 0);
    const track = els.offersTrack;
    if (!track) return;
    track.textContent = '';
    slider.count = STATE.ads.length;
    for (const ad of STATE.ads) track.appendChild(buildOffer(ad));
    buildDots(slider.count);
    goToSlide(0, false);
    startSlider();
  }

  function wireSliderSwipe() {
    const viewport = document.querySelector('.slider__viewport');
    if (!viewport) return;
    let startX = 0;
    let dragging = false;

    viewport.addEventListener('pointerdown', (event) => {
      if (slider.count < 2) return;
      dragging = true;
      startX = event.clientX;
      stopSlider();
    });
    viewport.addEventListener('pointerup', (event) => {
      if (!dragging) return;
      dragging = false;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 40) goToSlide(slider.index + 1);
      startSlider();
    });
    viewport.addEventListener('pointercancel', () => {
      dragging = false;
      startSlider();
    });
    viewport.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') stopSlider();
    });
    viewport.addEventListener('pointerleave', startSlider);
  }

  function renderReviews() {
    show(els.reviewsEmpty, STATE.reviews.length === 0);
    document.getElementById('reviews-marquee').classList.toggle('is-hidden', STATE.reviews.length === 0);
    fillMarquee(els.reviewsTrack, STATE.reviews, buildReview);
  }

  /* --------------------------- Loading --------------------------- */

  async function loadMenu() {
    try {
      const data = await getJSON('/api/menu');
      const sig = JSON.stringify(data.sections);
      if (sig === STATE.menuSig) return;
      STATE.menuSig = sig;
      STATE.menu = data.sections;
      if (STATE.filter !== 'all' && !STATE.menu.some((s) => s.id === STATE.filter)) {
        STATE.filter = 'all';
      }
      renderMenu();
      renderChips();
    } catch (_) {
      show(els.menuLoading, false);
      show(els.menuEmpty, true);
    }
  }

  async function loadReviews() {
    try {
      const data = await getJSON('/api/reviews');
      const sig = JSON.stringify(data);
      if (sig === STATE.reviewSig) return;
      STATE.reviewSig = sig;
      STATE.reviews = data;
      renderReviews();
    } catch (_) {
      /* leave previous content */
    }
  }

  async function loadAds() {
    try {
      const data = await getJSON('/api/ads');
      const sig = JSON.stringify(data);
      if (sig === STATE.adSig) return;
      STATE.adSig = sig;
      STATE.ads = data;
      renderAds();
    } catch (_) {
      /* leave previous content */
    }
  }

  function refreshAll() {
    loadMenu();
    loadReviews();
    loadAds();
  }

  function startPolling() {
    window.clearInterval(startPolling._t);
    if (document.visibilityState !== 'visible') return;
    startPolling._t = window.setInterval(refreshAll, 3000);
  }

  /* ----------------------- Review dialog ----------------------- */

  let rating = 0;

  function buildStars() {
    els.stars.textContent = '';
    for (let i = 1; i <= 5; i += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stars__item';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
      btn.dataset.value = String(i);
      btn.innerHTML = STAR;
      btn.addEventListener('click', () => setRating(i));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          setRating(Math.min(5, rating + 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          setRating(Math.max(1, rating - 1));
        }
      });
      els.stars.appendChild(btn);
    }
  }

  function setRating(value) {
    rating = value;
    for (const btn of els.stars.children) {
      const on = Number(btn.dataset.value) <= value;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', String(Number(btn.dataset.value) === value));
    }
    document.getElementById('rating-error').textContent = '';
  }

  function openDialog() {
    els.form.reset();
    setRating(0);
    els.error.classList.add('is-hidden');
    els.error.textContent = '';
    for (const id of ['rating-error', 'name-error', 'content-error']) {
      document.getElementById(id).textContent = '';
    }
    els.dialog.showModal();
    document.getElementById('review-name').focus();
  }

  function closeDialog() {
    els.dialog.close();
  }

  function showErrors(errors) {
    const map = { rating: 'rating-error', author_name: 'name-error', content: 'content-error' };
    for (const [field, message] of Object.entries(errors || {})) {
      const id = map[field];
      if (id) document.getElementById(id).textContent = message;
    }
  }

  async function submitReview(event) {
    event.preventDefault();
    els.error.classList.add('is-hidden');
    for (const id of ['rating-error', 'name-error', 'content-error']) {
      document.getElementById(id).textContent = '';
    }

    const payload = {
      author_name: document.getElementById('review-name').value,
      content: document.getElementById('review-text').value,
      rating,
      website: document.getElementById('review-website').value,
    };

    const button = document.getElementById('review-submit');
    button.disabled = true;
    button.textContent = 'Sending…';

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        closeDialog();
        toast('Thank you — your review has been shared.');
        await loadReviews();
        return;
      }

      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        showErrors(data.errors);
        els.error.textContent = data.error || 'Please check the highlighted fields.';
        els.error.classList.remove('is-hidden');
        return;
      }

      if (res.status === 429) {
        els.error.textContent = 'You have shared a few reviews already. Please try again later.';
        els.error.classList.remove('is-hidden');
        return;
      }

      els.error.textContent = 'Something went wrong. Please try again.';
      els.error.classList.remove('is-hidden');
    } catch (_) {
      els.error.textContent = 'Network error. Please check your connection and try again.';
      els.error.classList.remove('is-hidden');
    } finally {
      button.disabled = false;
      button.textContent = 'Send review';
    }
  }

  /* --------------------------- Wire up --------------------------- */

  let searchTimer;
  els.search.addEventListener('input', (e) => {
    const value = e.target.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      STATE.query = value;
      renderMenu();
    }, 120);
  });

  for (const id of ['open-review', 'open-review2']) {
    const trigger = document.getElementById(id);
    if (trigger) trigger.addEventListener('click', openDialog);
  }
  document.getElementById('close-review').addEventListener('click', closeDialog);
  els.dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });
  els.dialog.addEventListener('click', (e) => {
    if (e.target === els.dialog) closeDialog();
  });
  els.form.addEventListener('submit', submitReview);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAll();
      startSlider();
    } else {
      stopSlider();
    }
    startPolling();
  });
  window.addEventListener('focus', refreshAll);

  buildStars();
  wireSliderSwipe();
  refreshAll();
  startPolling();
})();
