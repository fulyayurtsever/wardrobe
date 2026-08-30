const grid = document.getElementById('grid');
const emptyState = document.getElementById('empty-state');
const banner = document.getElementById('banner');
const fileInput = document.getElementById('file-input');
const addItemBtn = document.getElementById('add-item-btn');
const uploadStatus = document.getElementById('upload-status');
const uploadStatusText = document.getElementById('upload-status-text');

const overlay = document.getElementById('detail-overlay');
const detailClose = document.getElementById('detail-close');
const detailImg = document.getElementById('detail-img');
const detailForm = document.getElementById('detail-form');
const detailWarning = document.getElementById('detail-warning');
const saveStatus = document.getElementById('save-status');

const EDITABLE_FIELDS = [
  'name', 'category', 'subcategory', 'color', 'pattern', 'material',
  'fit', 'style', 'season', 'occasion', 'formality', 'brand',
];

let currentItemId = null;

function showBanner(message) {
  banner.textContent = message;
  banner.hidden = false;
  setTimeout(() => { banner.hidden = true; }, 6000);
}

function displayName(item) {
  return item.name || item.category || 'Unclassified item';
}

function renderGrid(items) {
  grid.innerHTML = '';
  emptyState.hidden = items.length > 0;
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${item.image_path}" alt="${displayName(item)}" />
      <div class="card-info">
        <p class="card-name">${displayName(item)}</p>
        <p class="card-category">${item.category || 'Uncategorized'}</p>
      </div>
    `;
    card.addEventListener('click', () => openDetail(item.id));
    grid.appendChild(card);
  }
}

async function loadItems() {
  try {
    const res = await fetch('/api/wardrobe');
    if (!res.ok) throw new Error('Failed to load wardrobe items.');
    const data = await res.json();
    renderGrid(data.items);
  } catch (err) {
    console.error(err);
    showBanner('Could not load your wardrobe. Please refresh the page.');
  }
}

function openDetail(id) {
  fetch(`/api/wardrobe/${id}`)
    .then((res) => {
      if (!res.ok) throw new Error('Item not found.');
      return res.json();
    })
    .then(({ item }) => showDetail(item))
    .catch((err) => {
      console.error(err);
      showBanner('Could not load item details.');
    });
}

function showDetail(item) {
  currentItemId = item.id;
  detailImg.src = item.image_path;
  detailImg.alt = displayName(item);
  for (const field of EDITABLE_FIELDS) {
    detailForm.elements[field].value = item[field] || '';
  }
  if (item.ai_status === 'failed') {
    detailWarning.hidden = false;
    detailWarning.textContent = item.ai_error || 'AI classification failed. Please fill in details manually.';
  } else {
    detailWarning.hidden = true;
  }
  saveStatus.textContent = '';
  overlay.hidden = false;
}

function closeDetail() {
  overlay.hidden = true;
  currentItemId = null;
}

detailClose.addEventListener('click', closeDetail);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeDetail();
});

detailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentItemId) return;

  const payload = {};
  for (const field of EDITABLE_FIELDS) {
    payload[field] = detailForm.elements[field].value;
  }

  saveStatus.textContent = 'Saving…';
  try {
    const res = await fetch(`/api/wardrobe/${currentItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save changes.');
    saveStatus.textContent = 'Saved.';
    await loadItems();
  } catch (err) {
    console.error(err);
    saveStatus.textContent = '';
    showBanner(err.message || 'Could not save changes.');
  }
});

addItemBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;

  uploadStatus.hidden = false;
  uploadStatusText.textContent = 'Uploading and analyzing item…';
  addItemBtn.disabled = true;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/wardrobe', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');

    await loadItems();
    if (data.duplicate) {
      showBanner('This item already exists in your wardrobe.');
    }
    showDetail(data.item);
  } catch (err) {
    console.error(err);
    showBanner(err.message || 'Upload failed. Please try again.');
  } finally {
    uploadStatus.hidden = true;
    addItemBtn.disabled = false;
  }
});

loadItems();
