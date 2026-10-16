'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  const STATE = {
    sections: [],
    dishes: [],
    reviews: [],
    ads: [],
    filters: { q: '', section_id: '', availability: '' },
    activeTab: 'overview',
  };

  class AuthError extends Error {}

  /* --------------------------- Utilities --------------------------- */

  function toast(message, kind) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('toast--error', kind === 'error');
    el.classList.add('is-visible');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  async function api(path, { method = 'GET', body, form } = {}) {
    const options = { method, headers: {} };
    if (form) {
      options.body = form;
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const res = await fetch(path, options);
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      /* keep text */
    }

    if (res.status === 401) {
      showLogin();
      throw new AuthError('unauthenticated');
    }
    return { status: res.status, data };
  }

  function formatPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    const rounded = Math.round(amount * 100) / 100;
    return Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  /** Downscale and re-encode a photo in the browser so uploads stay small and load fast. */
  async function prepareImage(file, maxDim) {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      if (typeof bitmap.close === 'function') bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob || blob.size >= file.size) return file;
      const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.webp';
      return new File([blob], name, { type: 'image/webp' });
    } catch (_) {
      return file;
    }
  }

  const DIET_MARK =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>';

  function dietTag(diet) {
    if (diet !== 'veg' && diet !== 'non_veg') return null;
    const nonVeg = diet === 'non_veg';
    const span = document.createElement('span');
    span.className = `tag ${nonVeg ? 'tag--nonveg' : 'tag--veg'}`;
    span.innerHTML = DIET_MARK;
    const label = document.createElement('span');
    label.textContent = nonVeg ? 'Non-veg' : 'Veg';
    span.appendChild(label);
    return span;
  }

  const BADGE_LABELS = {
    popular: 'Popular',
    best_choice: 'Best Choice',
    chefs_choice: "Chef's Choice",
  };

  function badgeTag(badge) {
    const label = BADGE_LABELS[badge];
    if (!label) return null;
    const span = document.createElement('span');
    span.className = `tag tag--badge tag--badge-${badge}`;
    span.textContent = label;
    return span;
  }

  function confirmDialog(title, message, confirmLabel) {
    return new Promise((resolve) => {
      $('confirm-title').textContent = title;
      $('confirm-message').textContent = message;
      const ok = $('confirm-ok');
      const cancel = $('confirm-cancel');
      ok.textContent = confirmLabel || 'Confirm';

      const cleanup = (result) => {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        $('confirm-dialog').close();
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      $('confirm-dialog').showModal();
    });
  }

  function promptDialog({ title, label, value = '', confirmLabel = 'Save', placeholder = '' }) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'dialog';
      dialog.innerHTML =
        '<div class="dialog__inner">' +
        '<div class="dialog__head"><h2 class="dialog__title"></h2></div>' +
        '<p class="form-error"></p>' +
        '<form novalidate><div class="field"><label class="prompt-label"></label>' +
        '<input class="prompt-input" type="text" /></div>' +
        '<div class="dialog__actions">' +
        '<button class="btn btn--ghost" type="button" data-role="cancel">Cancel</button>' +
        '<button class="btn btn--primary" type="submit" data-role="ok"></button>' +
        "</div></form></div>";

      dialog.querySelector('.dialog__title').textContent = title;
      dialog.querySelector('.prompt-label').textContent = label;
      const input = dialog.querySelector('.prompt-input');
      input.value = value;
      input.placeholder = placeholder;
      dialog.querySelector('[data-role="ok"]').textContent = confirmLabel;
      const error = dialog.querySelector('.form-error');
      error.classList.add('is-hidden');

      const close = (result) => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };

      dialog.querySelector('[data-role="cancel"]').addEventListener('click', () => close(null));
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        close(null);
      });
      dialog.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) {
          error.textContent = 'Please enter a value.';
          error.classList.remove('is-hidden');
          return;
        }
        close(v);
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      input.focus();
      input.select();
    });
  }

  function promptSelect({ title, label, options, confirmLabel = 'Confirm' }) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'dialog';
      dialog.innerHTML =
        '<div class="dialog__inner">' +
        '<div class="dialog__head"><h2 class="dialog__title"></h2></div>' +
        '<form novalidate><div class="field"><label></label><select></select></div>' +
        '<div class="dialog__actions">' +
        '<button class="btn btn--ghost" type="button" data-role="cancel">Cancel</button>' +
        '<button class="btn btn--primary" type="submit" data-role="ok"></button>' +
        "</div></form></div>";

      dialog.querySelector('.dialog__title').textContent = title;
      dialog.querySelector('label').textContent = label;
      const select = dialog.querySelector('select');
      for (const option of options) {
        const o = document.createElement('option');
        o.value = option.value;
        o.textContent = option.label;
        select.appendChild(o);
      }
      dialog.querySelector('[data-role="ok"]').textContent = confirmLabel;

      const close = (result) => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };
      dialog.querySelector('[data-role="cancel"]').addEventListener('click', () => close(null));
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        close(null);
      });
      dialog.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        close(select.value);
      });

      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  /* --------------------------- Auth views --------------------------- */

  function showLogin() {
    $('app-view').classList.add('is-hidden');
    $('login-view').classList.remove('is-hidden');
    $('login-password').value = '';
    $('login-password').type = 'password';
    const toggle = $('login-password-toggle');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show password');
    toggle.title = 'Show password';
    toggle.querySelector('.password-toggle__show').classList.remove('is-hidden');
    toggle.querySelector('.password-toggle__hide').classList.add('is-hidden');
  }

  function showApp() {
    $('login-view').classList.add('is-hidden');
    $('app-view').classList.remove('is-hidden');
  }

  async function init() {
    try {
      const { data } = await api('/api/auth/session');
      if (data && data.authenticated) {
        showApp();
        loadOverview();
      } else {
        showLogin();
      }
    } catch (err) {
      if (!(err instanceof AuthError)) showLogin();
    }
  }

  /* --------------------------- Overview --------------------------- */

  async function loadOverview() {
    try {
      const { data } = await api('/api/admin/stats');
      const stats = [
        ['Sections', data.sections],
        ['Dishes', data.dishes],
        ['Available', data.available],
        ['Popular', data.popular],
        ['Best Choice', data.best_choice],
        ["Chef's Choice", data.chefs_choice],
      ];
      const container = $('stats');
      container.textContent = '';
      for (const [label, value] of stats) {
        const node = $('stat-template').content.firstElementChild.cloneNode(true);
        node.querySelector('.stat__label').textContent = label;
        node.querySelector('.stat__value').textContent = value;
        container.appendChild(node);
      }

      const list = $('recent-list');
      list.textContent = '';
      if (!data.recent.length) {
        list.appendChild(emptyNote('No dishes yet. Add your first dish from the Menu tab.'));
      }
      for (const dish of data.recent) {
        const node = $('dish-row-template').content.firstElementChild.cloneNode(true);
        fillDishRow(node, dish, { compact: true });
        list.appendChild(node);
      }
    } catch (err) {
      if (!(err instanceof AuthError)) toast('Could not load the dashboard.', 'error');
    }
  }

  function emptyNote(text) {
    const li = document.createElement('li');
    li.className = 'empty-note';
    li.textContent = text;
    return li;
  }

  /* --------------------------- Sections --------------------------- */

  async function loadSections() {
    try {
      const { data } = await api('/api/admin/sections');
      if (!Array.isArray(data)) {
        toast((data && data.error) || 'Could not load sections.', 'error');
        return;
      }
      STATE.sections = data;
      renderSections();
      renderSectionFilter();
    } catch (err) {
      if (!(err instanceof AuthError)) toast('Could not load sections.', 'error');
    }
  }

  function renderSections() {
    const list = $('sections-list');
    list.textContent = '';
    if (!STATE.sections.length) {
      list.appendChild(emptyNote('No sections yet. Add one to start building your menu.'));
      return;
    }
    for (const section of STATE.sections) {
      const node = $('section-template').content.firstElementChild.cloneNode(true);
      node.dataset.id = section.id;
      node.querySelector('.section-item__name').textContent = section.name;
      node.querySelector('.row__meta').textContent =
        section.dish_count === 1 ? '1 dish' : `${section.dish_count} dishes`;
      if (STATE.filters.section_id === section.id) node.classList.add('is-active');

      node.querySelector('[data-move="up"]').addEventListener('click', () => moveSection(section.id, 'up'));
      node.querySelector('[data-move="down"]').addEventListener('click', () => moveSection(section.id, 'down'));
      node.querySelector('[data-action="rename"]').addEventListener('click', () => renameSection(section));
      node.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSection(section));

      node.addEventListener('click', (e) => {
        if (!e.target.closest('[data-action]') && !e.target.closest('[data-move]')) {
          STATE.filters.section_id = STATE.filters.section_id === section.id ? '' : section.id;
          renderSections();
          renderDishes();
        }
      });

      list.appendChild(node);
    }
  }

  function renderSectionFilter() {
    const dialogSelect = $('dish-section');
    dialogSelect.textContent = '';
    for (const section of STATE.sections) {
      const option = document.createElement('option');
      option.value = section.id;
      option.textContent = section.name;
      dialogSelect.appendChild(option);
    }
  }

  async function addSection() {
    const name = await promptDialog({ title: 'Add section', label: 'Section name', confirmLabel: 'Add' });
    if (!name) return;
    const { status, data } = await api('/api/admin/sections', { method: 'POST', body: { name } });
    if (status === 201) {
      toast('Section added.');
      await loadSections();
    } else {
      toast(data.error || 'Could not add the section.', 'error');
    }
  }

  async function renameSection(section) {
    const name = await promptDialog({
      title: 'Rename section',
      label: 'Section name',
      value: section.name,
      confirmLabel: 'Save',
    });
    if (!name || name === section.name) return;
    const { status, data } = await api(`/api/admin/sections/${section.id}`, { method: 'PUT', body: { name } });
    if (status === 200) {
      toast('Section renamed.');
      await loadSections();
      await loadDishes();
    } else {
      toast(data.error || 'Could not rename the section.', 'error');
    }
  }

  async function moveSection(id, direction) {
    const { status, data } = await api(`/api/admin/sections/${id}/move`, {
      method: 'POST',
      body: { direction },
    });
    if (status === 200) {
      await loadSections();
    } else {
      toast(data.error || 'Could not reorder the section.', 'error');
    }
  }

  async function deleteSection(section) {
    if (section.dish_count > 0) {
      const targets = STATE.sections.filter((s) => s.id !== section.id);
      if (!targets.length) {
        toast('Create another section first, so the dishes have somewhere to go.', 'error');
        return;
      }
      const target = await promptSelect({
        title: 'Move dishes first',
        label: `“${section.name}” has ${section.dish_count} dish(es). Choose a section to move them to:`,
        options: targets.map((s) => ({ value: s.id, label: s.name })),
        confirmLabel: 'Move & delete',
      });
      if (!target) return;
      const { status, data } = await api('/api/admin/sections/reassign', {
        method: 'POST',
        body: { from_section_id: section.id, to_section_id: target },
      });
      if (status === 200) {
        toast('Dishes moved and section deleted.');
        await loadSections();
        await loadDishes();
      } else {
        toast(data.error || 'Could not move the dishes.', 'error');
      }
      return;
    }

    const ok = await confirmDialog('Delete section', `Delete “${section.name}”?`, 'Delete');
    if (!ok) return;
    const { status, data } = await api(`/api/admin/sections/${section.id}`, { method: 'DELETE' });
    if (status === 200) {
      toast('Section deleted.');
      await loadSections();
    } else {
      toast(data.error || 'Could not delete the section.', 'error');
    }
  }

  /* --------------------------- Dishes --------------------------- */

  async function loadDishes() {
    try {
      const { data } = await api('/api/admin/dishes');
      if (!Array.isArray(data)) {
        renderDishesError((data && data.error) || 'Could not load dishes. Please refresh the page.');
        return;
      }
      STATE.dishes = data;
      renderDishes();
    } catch (err) {
      if (!(err instanceof AuthError)) renderDishesError('Could not load dishes. Please refresh the page.');
    }
  }

  function renderDishesError(message) {
    const container = $('dishes-groups');
    container.textContent = '';
    const card = document.createElement('div');
    card.className = 'card';
    const note = emptyNote(message);
    note.classList.add('empty-note--error');
    card.appendChild(note);
    container.appendChild(card);
  }

  function fillDishRow(node, dish, { compact = false } = {}) {
    node.dataset.id = dish.id;
    node.querySelector('.dish-item__name').textContent = dish.name;

    const meta = node.querySelector('.dish-item__meta');
    const parts = [];
    if (dish.section_name) parts.push(dish.section_name);
    parts.push(formatPrice(dish.price));
    meta.textContent = '';
    let hasTag = false;
    const tag = dietTag(dish.diet);
    if (tag) {
      meta.appendChild(tag);
      hasTag = true;
    }
    const badge = badgeTag(dish.badge);
    if (badge) {
      meta.appendChild(badge);
      hasTag = true;
    }
    meta.appendChild(document.createTextNode(`${hasTag ? ' ' : ''}${parts.join(' · ')}`));

    const img = node.querySelector('img.dish-thumb');
    const placeholder = node.querySelector('.dish-thumb--empty');
    if (dish.image_url) {
      img.src = dish.image_url;
      img.alt = dish.name;
      img.hidden = false;
      if (placeholder) placeholder.hidden = true;
    } else if (placeholder) {
      placeholder.hidden = false;
      img.hidden = true;
    } else if (img) {
      img.remove();
    }

    if (!compact) {
      const actions = node.querySelector('.row__actions');

      const avail = document.createElement('label');
      avail.className = 'switch';
      avail.title = 'Available';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = dish.is_available;
      checkbox.setAttribute('aria-label', 'Available');
      checkbox.addEventListener('change', () => toggleDish(dish, 'is_available', checkbox.checked));
      avail.appendChild(checkbox);
      actions.insertBefore(avail, actions.firstChild);

      node.querySelector('[data-action="edit"]').addEventListener('click', () => openDishDialog(dish));
      node.querySelector('[data-action="delete"]').addEventListener('click', () => deleteDish(dish));
    } else {
      node.querySelector('.row__actions').remove();
    }
  }

  function renderDishes() {
    const container = $('dishes-groups');
    container.textContent = '';

    if (!STATE.sections.length) {
      const card = document.createElement('div');
      card.className = 'card';
      card.appendChild(emptyNote('Add a section first, then you can add dishes to it.'));
      container.appendChild(card);
      return;
    }

    const bySection = new Map();
    for (const dish of STATE.dishes) {
      if (!bySection.has(dish.section_id)) bySection.set(dish.section_id, []);
      bySection.get(dish.section_id).push(dish);
    }

    const activeId = STATE.filters.section_id;
    const activeSection = activeId ? STATE.sections.find((s) => s.id === activeId) : null;

    const bar = document.createElement('div');
    bar.className = 'dish-groups__bar';
    const label = document.createElement('span');
    label.className = 'dish-groups__label';
    label.textContent = activeSection ? activeSection.name : 'Dishes';
    bar.appendChild(label);
    if (activeSection) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn--ghost btn--sm';
      clear.textContent = 'Show all';
      clear.addEventListener('click', () => {
        STATE.filters.section_id = '';
        renderSections();
        renderDishes();
      });
      bar.appendChild(clear);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--primary btn--sm';
    add.textContent = 'Add dish';
    add.addEventListener('click', () => openDishDialog(null));
    bar.appendChild(add);
    container.appendChild(bar);

    const sections = activeSection ? [activeSection] : STATE.sections;

    for (const section of sections) {
      const sectionDishes = bySection.get(section.id) || [];
      const group = $('dish-group-template').content.firstElementChild.cloneNode(true);
      group.dataset.sectionId = section.id;
      group.querySelector('.dish-group__title').textContent = section.name;
      group.querySelector('.dish-group__count').textContent =
        sectionDishes.length === 1 ? '1 dish' : `${sectionDishes.length} dishes`;
      group.querySelector('.dish-group__add').addEventListener('click', () => {
        STATE.filters.section_id = section.id;
        renderSections();
        openDishDialog(null);
      });

      const list = group.querySelector('.dish-group__list');
      if (!sectionDishes.length) {
        list.appendChild(emptyNote('No dishes yet. Use “Add dish”.'));
      } else {
        for (const dish of sectionDishes) {
          const node = $('dish-row-template').content.firstElementChild.cloneNode(true);
          fillDishRow(node, dish);
          list.appendChild(node);
        }
      }
      container.appendChild(group);
    }
  }

  async function toggleDish(dish, field, value) {
    const body = {};
    body[field] = value;
    const { status, data } = await api(`/api/admin/dishes/${dish.id}`, { method: 'PATCH', body });
    if (status === 200) {
      Object.assign(dish, data.dish);
      renderDishes();
      if (STATE.activeTab === 'overview') loadOverview();
    } else {
      toast(data.error || 'Could not update the dish.', 'error');
      renderDishes();
    }
  }

  async function deleteDish(dish) {
    const ok = await confirmDialog('Delete dish', `Delete “${dish.name}”? This cannot be undone.`, 'Delete');
    if (!ok) return;
    const { status, data } = await api(`/api/admin/dishes/${dish.id}`, { method: 'DELETE' });
    if (status === 200) {
      toast('Dish deleted.');
      await loadDishes();
      await loadSections();
    } else {
      toast(data.error || 'Could not delete the dish.', 'error');
    }
  }

  let editingDish = null;

  function clearDishErrors() {
    for (const id of ['dish-name-error', 'dish-description-error', 'dish-price-error', 'dish-section-error', 'dish-diet-error', 'dish-badge-error', 'dish-image-error']) {
      $(id).textContent = '';
    }
    const banner = $('dish-error');
    banner.classList.add('is-hidden');
    banner.textContent = '';
  }

  function openDishDialog(dish) {
    editingDish = dish || null;
    clearDishErrors();
    $('dish-form').reset();
    $('dish-id').value = dish ? dish.id : '';
    $('dish-name').value = dish ? dish.name : '';
    $('dish-description').value = dish && dish.description ? dish.description : '';
    $('dish-price').value = dish ? formatPrice(dish.price) : '';
    $('dish-diet').value = dish ? dish.diet : 'veg';
    $('dish-badge').value = dish ? dish.badge : 'none';
    $('dish-available').checked = dish ? dish.is_available : true;
    $('dish-dialog-title').textContent = dish ? 'Edit dish' : 'New dish';

    renderSectionFilter();
    if (dish && dish.section_id) $('dish-section').value = dish.section_id;
    else if (STATE.filters.section_id) $('dish-section').value = STATE.filters.section_id;

    updateImagePreview(dish ? dish.image_url : null);
    $('dish-dialog').showModal();
    $('dish-name').focus();
  }

  function updateImagePreview(url) {
    const thumb = $('dish-image-thumb');
    const info = $('dish-image-info');
    if (url) {
      thumb.src = url;
      thumb.hidden = false;
      info.textContent = 'Current photo shown. Choose a file to replace it.';
    } else {
      thumb.removeAttribute('src');
      thumb.hidden = true;
      info.textContent = 'No photo yet. JPEG, PNG, WebP or AVIF up to 3 MB.';
    }
  }

  async function submitDish(event) {
    event.preventDefault();
    clearDishErrors();

    const file = $('dish-image').files[0];
    const useMultipart = Boolean(file);

    const fields = {
      name: $('dish-name').value,
      description: $('dish-description').value,
      price: $('dish-price').value,
      section_id: $('dish-section').value,
      diet: $('dish-diet').value,
      badge: $('dish-badge').value,
      is_available: $('dish-available').checked,
    };

    const button = $('dish-submit');
    button.disabled = true;
    button.textContent = 'Saving…';

    try {
      let status;
      let data;
      if (useMultipart) {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
        if (file) form.append('image', await prepareImage(file, 1280));
        ({ status, data } = await api(editingDish ? `/api/admin/dishes/${editingDish.id}` : '/api/admin/dishes', {
          method: editingDish ? 'PUT' : 'POST',
          form,
        }));
      } else {
        ({ status, data } = await api(editingDish ? `/api/admin/dishes/${editingDish.id}` : '/api/admin/dishes', {
          method: editingDish ? 'PUT' : 'POST',
          body: fields,
        }));
      }

      if (status === 201 || status === 200) {
        $('dish-dialog').close();
        toast(editingDish ? 'Dish updated.' : 'Dish added.');
        await loadDishes();
        await loadSections();
        if (STATE.activeTab === 'overview') loadOverview();
        return;
      }

      if (status === 400) {
        const errors = data.errors || {};
        if (errors.name) $('dish-name-error').textContent = errors.name;
        if (errors.description) $('dish-description-error').textContent = errors.description;
        if (errors.price) $('dish-price-error').textContent = errors.price;
        if (errors.section_id) $('dish-section-error').textContent = errors.section_id;
        if (errors.diet) $('dish-diet-error').textContent = errors.diet;
        if (errors.badge) $('dish-badge-error').textContent = errors.badge;
        const banner = $('dish-error');
        banner.textContent = data.error || 'Please check the highlighted fields.';
        banner.classList.remove('is-hidden');
        return;
      }

      toast(data.error || 'Could not save the dish.', 'error');
    } catch (err) {
      if (!(err instanceof AuthError)) toast('Network error. Please try again.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = editingDish ? 'Save dish' : 'Save dish';
    }
  }

  /* --------------------------- Reviews --------------------------- */

  async function loadReviews() {
    const { data } = await api('/api/admin/reviews');
    STATE.reviews = data;
    renderReviews();
  }

  function renderReviews() {
    const list = $('reviews-list');
    list.textContent = '';
    if (!STATE.reviews.length) {
      list.appendChild(emptyNote('No reviews yet.'));
      return;
    }
    for (const review of STATE.reviews) {
      const node = $('review-template').content.firstElementChild.cloneNode(true);
      node.dataset.id = review.id;
      node.querySelector('.review-item__author').textContent = review.author_name;
      const stars = node.querySelector('.review-item__stars');
      let starText = '';
      for (let i = 1; i <= 5; i += 1) starText += i <= review.rating ? '★' : '☆';
      stars.textContent = starText;
      node.querySelector('.review-item__quote').textContent = review.content;
      node.querySelector('[data-action="delete"]').addEventListener('click', () => deleteReview(review));
      list.appendChild(node);
    }
  }

  async function deleteReview(review) {
    const ok = await confirmDialog(
      'Delete review',
      `Delete the review by “${review.author_name}”? It will disappear from the live menu.`,
      'Delete'
    );
    if (!ok) return;
    const { status, data } = await api(`/api/admin/reviews/${review.id}`, { method: 'DELETE' });
    if (status === 200) {
      toast('Review deleted.');
      await loadReviews();
    } else {
      toast(data.error || 'Could not delete the review.', 'error');
    }
  }

  /* --------------------------- Ads --------------------------- */

  async function loadAds() {
    const { data } = await api('/api/admin/ads');
    STATE.ads = data;
    renderAds();
  }

  function renderAds() {
    const grid = $('ads-grid');
    grid.textContent = '';
    if (!STATE.ads.length) {
      grid.appendChild(emptyNote('No offers yet. Upload a banner to show it on the menu.'));
      return;
    }
    for (const ad of STATE.ads) {
      const node = $('ad-template').content.firstElementChild.cloneNode(true);
      node.dataset.id = ad.id;
      const img = node.querySelector('img');
      img.src = ad.image_url;
      img.alt = ad.heading || 'Offer';
      node.querySelector('.ad-card__heading').textContent = ad.heading || '';
      const desc = node.querySelector('.ad-card__desc');
      if (ad.description) {
        desc.textContent = ad.description;
      } else {
        desc.remove();
      }
      const toggle = node.querySelector('.ad-card__toggle');
      toggle.checked = ad.is_active;
      toggle.addEventListener('change', () => toggleAd(ad, toggle.checked));
      node.querySelector('[data-action="edit"]').addEventListener('click', () => openAdDialog(ad));
      node.querySelector('[data-action="delete"]').addEventListener('click', () => deleteAd(ad));
      grid.appendChild(node);
    }
  }

  async function toggleAd(ad, value) {
    const { status, data } = await api(`/api/admin/ads/${ad.id}`, { method: 'PATCH', body: { is_active: value } });
    if (status === 200) {
      ad.is_active = data.ad.is_active;
    } else {
      toast(data.error || 'Could not update the offer.', 'error');
      renderAds();
    }
  }

  async function deleteAd(ad) {
    const ok = await confirmDialog('Delete offer', 'Delete this offer image?', 'Delete');
    if (!ok) return;
    const { status, data } = await api(`/api/admin/ads/${ad.id}`, { method: 'DELETE' });
    if (status === 200) {
      toast('Offer deleted.');
      await loadAds();
    } else {
      toast(data.error || 'Could not delete the offer.', 'error');
    }
  }

  /* -------- Banner crop tool (16:9, drag to move, slider to zoom) -------- */

  const CROP_OUT = { width: 1280, height: 720 };

  const crop = {
    bitmap: null,
    zoom: 1,
    ox: 0,
    oy: 0,
    pointerId: null,
    startX: 0,
    startY: 0,
    startOx: 0,
    startOy: 0,
  };

  function cropFrame() {
    return $('ad-crop-frame');
  }

  function cropMetrics() {
    const rect = cropFrame().getBoundingClientRect();
    const cover = Math.max(rect.width / crop.bitmap.width, rect.height / crop.bitmap.height);
    const scale = cover * crop.zoom;
    return {
      frameW: rect.width,
      frameH: rect.height,
      scale,
      imgW: crop.bitmap.width * scale,
      imgH: crop.bitmap.height * scale,
    };
  }

  function layoutCrop() {
    if (!crop.bitmap) return;
    const m = cropMetrics();
    crop.ox = Math.min(0, Math.max(m.frameW - m.imgW, crop.ox));
    crop.oy = Math.min(0, Math.max(m.frameH - m.imgH, crop.oy));
    const img = $('ad-crop-image');
    img.style.width = `${m.imgW}px`;
    img.style.height = `${m.imgH}px`;
    img.style.left = `${crop.ox}px`;
    img.style.top = `${crop.oy}px`;
  }

  function fitCrop() {
    if (!crop.bitmap) return;
    const m = cropMetrics();
    crop.zoom = 1;
    $('ad-zoom').value = '100';
    crop.ox = (m.frameW - m.imgW) / 2;
    crop.oy = (m.frameH - m.imgH) / 2;
    layoutCrop();
  }

  function setCropZoom(value) {
    if (!crop.bitmap) return;
    const before = cropMetrics();
    const cx = (before.frameW / 2 - crop.ox) / before.scale;
    const cy = (before.frameH / 2 - crop.oy) / before.scale;
    crop.zoom = value;
    const after = cropMetrics();
    crop.ox = after.frameW / 2 - cx * after.scale;
    crop.oy = after.frameH / 2 - cy * after.scale;
    layoutCrop();
  }

  async function loadCropFile(file) {
    try {
      const bitmap = await createImageBitmap(file);
      if (crop.bitmap && typeof crop.bitmap.close === 'function') crop.bitmap.close();
      crop.bitmap = bitmap;
      const img = $('ad-crop-image');
      if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(file);
      $('ad-preview').classList.add('is-hidden');
      $('ad-crop').classList.remove('is-hidden');
      fitCrop();
      return true;
    } catch (_) {
      resetCrop();
      return false;
    }
  }

  function resetCrop() {
    if (crop.bitmap && typeof crop.bitmap.close === 'function') crop.bitmap.close();
    crop.bitmap = null;
    crop.pointerId = null;
    crop.zoom = 1;
    crop.ox = 0;
    crop.oy = 0;
    const img = $('ad-crop-image');
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.removeAttribute('src');
    $('ad-zoom').value = '100';
    $('ad-crop').classList.add('is-hidden');
  }

  function renderCropBlob() {
    return new Promise((resolve) => {
      if (!crop.bitmap) return resolve(null);
      const m = cropMetrics();
      const sx = Math.max(0, -crop.ox / m.scale);
      const sy = Math.max(0, -crop.oy / m.scale);
      const sw = Math.min(crop.bitmap.width - sx, m.frameW / m.scale);
      const sh = Math.min(crop.bitmap.height - sy, m.frameH / m.scale);
      const canvas = document.createElement('canvas');
      canvas.width = CROP_OUT.width;
      canvas.height = CROP_OUT.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(crop.bitmap, sx, sy, sw, sh, 0, 0, CROP_OUT.width, CROP_OUT.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          resolve(new File([blob], 'banner.webp', { type: 'image/webp' }));
        },
        'image/webp',
        0.85
      );
    });
  }

  function wireCropDrag() {
    const frame = cropFrame();
    frame.addEventListener('pointerdown', (event) => {
      if (!crop.bitmap) return;
      crop.pointerId = event.pointerId;
      crop.startX = event.clientX;
      crop.startY = event.clientY;
      crop.startOx = crop.ox;
      crop.startOy = crop.oy;
      frame.classList.add('is-dragging');
      frame.setPointerCapture(event.pointerId);
    });
    frame.addEventListener('pointermove', (event) => {
      if (crop.pointerId !== event.pointerId) return;
      crop.ox = crop.startOx + (event.clientX - crop.startX);
      crop.oy = crop.startOy + (event.clientY - crop.startY);
      layoutCrop();
    });
    const endDrag = (event) => {
      if (crop.pointerId !== event.pointerId) return;
      crop.pointerId = null;
      frame.classList.remove('is-dragging');
    };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
  }

  /* --------------------------- Ads dialog --------------------------- */

  let editingAd = null;

  function closeAdDialog() {
    $('ad-dialog').close();
    resetCrop();
  }

  function clearAdErrors() {
    for (const id of ['ad-image-error', 'ad-heading-error', 'ad-description-error']) {
      $(id).textContent = '';
    }
    const banner = $('ad-error');
    banner.classList.add('is-hidden');
    banner.textContent = '';
  }

  function openAdDialog(ad) {
    editingAd = ad || null;
    $('ad-form').reset();
    clearAdErrors();
    resetCrop();
    $('ad-id').value = ad ? ad.id : '';
    $('ad-dialog-title').textContent = ad ? 'Edit offer' : 'Upload offer';
    $('ad-submit').textContent = ad ? 'Save offer' : 'Upload';
    $('ad-heading').value = ad ? ad.heading : 'From our counter';
    $('ad-description').value = ad && ad.description ? ad.description : '';
    const preview = $('ad-preview');
    if (ad) {
      $('ad-preview-img').src = ad.image_url;
      preview.classList.remove('is-hidden');
    } else {
      preview.classList.add('is-hidden');
    }
    $('ad-dialog').showModal();
  }

  async function submitAd(event) {
    event.preventDefault();
    clearAdErrors();

    const file = $('ad-image').files[0];
    const heading = $('ad-heading').value.trim();
    const description = $('ad-description').value;

    if (!editingAd && !file) {
      $('ad-image-error').textContent = 'Please choose an image.';
      return;
    }
    if (!heading) {
      $('ad-heading-error').textContent = 'Heading is required (1–60 characters).';
      return;
    }

    const button = $('ad-submit');
    button.disabled = true;
    button.textContent = editingAd ? 'Saving…' : 'Uploading…';

    try {
      const form = new FormData();
      form.append('heading', heading);
      form.append('description', description);
      if (file) {
        const banner = await renderCropBlob();
        if (!banner) {
          toast('Could not prepare the banner image. Please try another file.', 'error');
          return;
        }
        form.append('image', banner);
      }

      const { status, data } = editingAd
        ? await api(`/api/admin/ads/${editingAd.id}`, { method: 'PUT', form })
        : await api('/api/admin/ads', { method: 'POST', form });

      if (status === 201 || status === 200) {
        $('ad-dialog').close();
        toast(editingAd ? 'Offer updated.' : 'Offer uploaded.');
        await loadAds();
        return;
      }

      if (status === 400) {
        const errors = data.errors || {};
        if (errors.image) $('ad-image-error').textContent = errors.image;
        if (errors.heading) $('ad-heading-error').textContent = errors.heading;
        if (errors.description) $('ad-description-error').textContent = errors.description;
        const banner = $('ad-error');
        banner.textContent = data.error || 'Please check the highlighted fields.';
        banner.classList.remove('is-hidden');
        return;
      }

      toast(data.error || 'Could not save the offer.', 'error');
    } catch (err) {
      if (!(err instanceof AuthError)) toast('Network error. Please try again.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = editingAd ? 'Save offer' : 'Upload';
    }
  }

  /* --------------------------- Tabs & wiring --------------------------- */

  function switchTab(tab) {
    STATE.activeTab = tab;
    for (const button of document.querySelectorAll('.tab')) {
      button.setAttribute('aria-selected', String(button.dataset.tab === tab));
    }
    for (const panel of document.querySelectorAll('.panel')) {
      panel.classList.toggle('is-active', panel.id === `panel-${tab}`);
    }
    if (tab === 'overview') loadOverview();
    if (tab === 'menu') {
      loadSections().then(loadDishes);
    }
    if (tab === 'reviews') loadReviews();
    if (tab === 'ads') loadAds();
  }

  function wire() {
    $('login-password-toggle').addEventListener('click', () => {
      const input = $('login-password');
      const button = $('login-password-toggle');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      button.title = button.getAttribute('aria-label');
      button.querySelector('.password-toggle__show').classList.toggle('is-hidden', show);
      button.querySelector('.password-toggle__hide').classList.toggle('is-hidden', !show);
      input.focus();
    });

    $('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = $('login-password').value;
      const error = $('login-error');
      error.classList.add('is-hidden');
      const button = $('login-submit');
      button.disabled = true;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (res.status === 200) {
          $('login-password').value = '';
          showApp();
          switchTab('overview');
        } else {
          error.textContent = 'Incorrect password. Please try again.';
          error.classList.remove('is-hidden');
        }
      } catch (_) {
        error.textContent = 'Network error. Please try again.';
        error.classList.remove('is-hidden');
      } finally {
        button.disabled = false;
      }
    });

    $('logout').addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch (_) {
        /* ignore */
      }
      showLogin();
    });

    for (const button of document.querySelectorAll('.tab')) {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    }

    $('refresh-overview').addEventListener('click', loadOverview);
    $('refresh-reviews').addEventListener('click', loadReviews);
    $('new-section').addEventListener('click', addSection);
    $('new-dish').addEventListener('click', () => openDishDialog(null));
    $('new-ad').addEventListener('click', () => openAdDialog(null));

    $('dish-dialog-close').addEventListener('click', () => $('dish-dialog').close());
    $('dish-cancel').addEventListener('click', () => $('dish-dialog').close());
    $('dish-form').addEventListener('submit', submitDish);
    $('dish-image').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        updateImagePreview(URL.createObjectURL(file));
      } else {
        updateImagePreview(editingDish ? editingDish.image_url : null);
      }
    });

    $('ad-dialog-close').addEventListener('click', closeAdDialog);
    $('ad-cancel').addEventListener('click', closeAdDialog);
    $('ad-form').addEventListener('submit', submitAd);
    $('ad-image').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) {
        resetCrop();
        if (editingAd) $('ad-preview').classList.remove('is-hidden');
        return;
      }
      $('ad-image-error').textContent = '';
      const ok = await loadCropFile(file);
      if (!ok) {
        $('ad-image-error').textContent = 'Could not read that image. Please choose another file.';
      }
    });
    $('ad-zoom').addEventListener('input', (e) => setCropZoom(Number(e.target.value) / 100));
    $('ad-crop-reset').addEventListener('click', fitCrop);
    wireCropDrag();
    window.addEventListener('resize', () => {
      if (crop.bitmap) setCropZoom(crop.zoom);
    });
  }

  wire();
  init();
})();
