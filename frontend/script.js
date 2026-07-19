const API = '/api';
const GBOOKS_KEY = 'AIzaSyAeCsiDbyMrsTfgPOfHYHYfbFygQWsPvfg';

let token = localStorage.getItem('bookish_token') || null;
let currentUser = null;
let books = [];
let selectedBook = null;
let userFavorites = [];
let userLists = [];
let activeTab = 'search';
let selectedListId = null;

// ---------- API HELPERS ----------
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function fetchBookById(volumeId) {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes/${volumeId}?key=${GBOOKS_KEY}`);
    if (!res.ok) return null;
    const item = await res.json();
    const info = item.volumeInfo || {};
    return {
      id: item.id, volumeId: item.id,
      title: info.title || 'Untitled',
      authors: info.authors ? info.authors.join(', ') : 'Unknown',
      cover: info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : null,
      description: info.description || '',
      pageCount: info.pageCount || 0, rating: info.averageRating || 0,
    };
  } catch { return null; }
}

// ---------- AUTH ----------
async function loadUser() {
  if (!token) return;
  try {
    currentUser = await api('/auth/me');
    updateAuthUI();
    await Promise.all([loadFavorites(), loadLists()]);
  } catch {
    token = null;
    localStorage.removeItem('bookish_token');
    updateAuthUI();
  }
}

async function register(name, email, password) {
  const data = await api('/auth/register', {
    method: 'POST', body: JSON.stringify({ name, email, password }),
  });
  token = data.token;
  localStorage.setItem('bookish_token', token);
  currentUser = data.user;
  updateAuthUI();
  userFavorites = []; userLists = [];
  closeModal();
}

async function login(email, password) {
  const data = await api('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  token = data.token;
  localStorage.setItem('bookish_token', token);
  currentUser = data.user;
  updateAuthUI();
  await Promise.all([loadFavorites(), loadLists()]);
  closeModal();
}

function logout() {
  token = null; currentUser = null; userFavorites = []; userLists = [];
  localStorage.removeItem('bookish_token');
  updateAuthUI();
  closePopup();
}

// ---------- FAVORITES ----------
async function loadFavorites() {
  if (!token) { userFavorites = []; return; }
  try { const data = await api('/books/favorites'); userFavorites = data.favorites; }
  catch { userFavorites = []; }
}

async function toggleFavorite(bookId) {
  if (!token) return openModal('login');
  try {
    const data = await api('/books/favorite/toggle', {
      method: 'POST', body: JSON.stringify({ bookId }),
    });
    userFavorites = data.favorites;
    if (activeTab === 'search') renderBookGrid();
    if (activeTab === 'favorites') renderFavoritesGrid();
    if (selectedBook && selectedBook.id === bookId) updatePopupFavBtn();
  } catch (err) { alert(err.message); }
}

// ---------- REVIEWS ----------
async function loadReviews(bookVolumeId) {
  try { return await api(`/reviews/${bookVolumeId}`); }
  catch { return []; }
}

async function addReview(bookVolumeId, rating, text) {
  if (!token) return openModal('login');
  try {
    await api('/reviews', {
      method: 'POST', body: JSON.stringify({ bookVolumeId, rating: Number(rating), text }),
    });
    if (selectedBook && selectedBook.id === bookVolumeId) showDetail(selectedBook);
  } catch (err) { alert(err.message); }
}

// ---------- READING LISTS ----------
async function loadLists() {
  if (!token) { userLists = []; return; }
  try { userLists = await api('/lists'); }
  catch { userLists = []; }
}

async function createList(name) {
  if (!token) return openModal('login');
  try {
    const list = await api('/lists', {
      method: 'POST', body: JSON.stringify({ name }),
    });
    userLists.unshift(list);
    renderListsSidebar();
    return list;
  } catch (err) { alert(err.message); }
}

async function toggleBookInList(listId, bookId) {
  if (!token) return openModal('login');
  try {
    const updated = await api(`/lists/${listId}`, {
      method: 'PUT', body: JSON.stringify({ bookId }),
    });
    const idx = userLists.findIndex(l => l._id === listId);
    if (idx >= 0) userLists[idx] = updated;
    if (activeTab === 'lists' && selectedListId === listId) renderListBooks(listId);
    renderListsSidebar();
  } catch (err) { alert(err.message); }
}

async function deleteList(listId) {
  if (!token) return openModal('login');
  try {
    await api(`/lists/${listId}`, { method: 'DELETE' });
    userLists = userLists.filter(l => l._id !== listId);
    if (selectedListId === listId) { selectedListId = null; renderListBooks(null); }
    renderListsSidebar();
  } catch (err) { alert(err.message); }
}

// ---------- SEARCH ----------
async function searchBooks(query) {
  if (!query.trim()) return;
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&key=${GBOOKS_KEY}`);
    const data = await res.json();
    books = (data.items || []).map(item => {
      const info = item.volumeInfo || {};
      return {
        id: item.id, volumeId: item.id,
        title: info.title || 'Untitled',
        authors: info.authors ? info.authors.join(', ') : 'Unknown',
        cover: info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : null,
        description: info.description || '',
        pageCount: info.pageCount || 0, rating: info.averageRating || 0,
      };
    });
    renderBookGrid();
    closePopup();
  } catch (err) {
    console.error(err);
    alert('Error fetching books. Please try again.');
  }
}

// ---------- TABS ----------
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tabSearch').style.display = tab === 'search' ? 'block' : 'none';
  document.getElementById('tabFavorites').style.display = tab === 'favorites' ? 'block' : 'none';
  document.getElementById('tabLists').style.display = tab === 'lists' ? 'block' : 'none';
  document.getElementById('searchBarContainer').style.display = tab === 'search' ? 'flex' : 'none';
  if (tab === 'favorites') renderFavoritesGrid();
  if (tab === 'lists') { renderListsSidebar(); if (selectedListId) renderListBooks(selectedListId); }
}

// ---------- RENDER: Book Grid ----------
function renderBookGrid() {
  const grid = document.getElementById('bookGrid');
  if (!books.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No books found. Try a different search.</div>`;
    return;
  }
  grid.innerHTML = books.map(book => {
    const isFav = userFavorites.includes(book.id);
    return `
      <div class="book-card" data-bookid="${book.id}">
        <img class="book-cover" src="${book.cover || 'https://via.placeholder.com/120x170?text=No+Cover'}" alt="${book.title}">
        <div class="book-title">${book.title}</div>
        <div class="book-author">${book.authors || 'Unknown'}</div>
        <div class="card-actions">
          <button class="fav-btn ${isFav ? 'fav-active' : ''}" data-bookid="${book.id}"><i class="fas fa-heart"></i> ${isFav ? 'Fav' : 'Favorite'}</button>
          <button class="detail-btn" data-bookid="${book.id}"><i class="fas fa-info-circle"></i> Details</button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const book = books.find(b => b.id === btn.dataset.bookid);
      if (book) showDetail(book, btn);
    });
  });
  grid.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(btn.dataset.bookid); });
  });
}

// ---------- RENDER: Favorites Grid ----------
async function renderFavoritesGrid() {
  const grid = document.getElementById('favoritesGrid');
  if (!token) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <i class="fas fa-heart" style="font-size:2rem;color:#fda4af;"></i>
      <p style="margin-top:0.5rem;">Sign in to see your favorites</p></div>`;
    return;
  }
  if (!userFavorites.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <i class="fas fa-heart" style="font-size:2rem;color:#cbd5e1;"></i>
      <p style="margin-top:0.5rem;">No favorites yet. Click the heart on any book!</p></div>`;
    return;
  }
  grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Loading favorites...</div>`;
  const favBooks = [];
  for (const id of userFavorites) {
    const book = await fetchBookById(id);
    if (book) favBooks.push(book);
  }
  if (!favBooks.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No favorites found.</div>`;
    return;
  }
  grid.innerHTML = favBooks.map(book => `
    <div class="book-card" data-bookid="${book.id}">
      <img class="book-cover" src="${book.cover || 'https://via.placeholder.com/120x170?text=No+Cover'}" alt="${book.title}">
      <div class="book-title">${book.title}</div>
      <div class="book-author">${book.authors || 'Unknown'}</div>
      <div class="card-actions">
        <button class="fav-btn fav-active" data-bookid="${book.id}"><i class="fas fa-heart"></i> Fav</button>
        <button class="detail-btn" data-bookid="${book.id}"><i class="fas fa-info-circle"></i> Details</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const book = favBooks.find(b => b.id === btn.dataset.bookid);
      if (book) showDetail(book, btn);
    });
  });
  grid.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(btn.dataset.bookid); });
  });
}

// ---------- RENDER: Lists Sidebar ----------
function renderListsSidebar() {
  const sidebar = document.getElementById('listsSidebar');
  if (!token) {
    sidebar.innerHTML = `<div class="empty-state">Sign in to manage lists</div>`;
    return;
  }
  if (!userLists.length) {
    sidebar.innerHTML = `<div class="empty-state" style="padding:1rem;">No lists yet. Create one below.</div>`;
    return;
  }
  sidebar.innerHTML = userLists.map(list => `
    <div class="sidebar-list-item ${selectedListId === list._id ? 'active' : ''}" data-listid="${list._id}">
      <span><i class="fas fa-list"></i> ${list.name} <span class="list-count">${list.bookIds.length}</span></span>
      <button class="delete-list-btn" data-listid="${list._id}" title="Delete list"><i class="fas fa-trash"></i></button>
    </div>`).join('');

  sidebar.querySelectorAll('.sidebar-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-list-btn')) return;
      selectedListId = item.dataset.listid;
      renderListsSidebar();
      renderListBooks(selectedListId);
    });
  });
  sidebar.querySelectorAll('.delete-list-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete this list?')) deleteList(btn.dataset.listid);
    });
  });
}

// ---------- RENDER: List Books ----------
async function renderListBooks(listId) {
  const grid = document.getElementById('listBooksGrid');
  const empty = document.getElementById('listEmptyState');
  if (!listId) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  const list = userLists.find(l => l._id === listId);
  if (!list || !list.bookIds.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <i class="fas fa-book" style="font-size:2rem;color:#cbd5e1;"></i>
      <p style="margin-top:0.5rem;">This list is empty. Add books from search!</p></div>`;
    return;
  }
  grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Loading books...</div>`;
  const listBooks = [];
  for (const id of list.bookIds) {
    const book = await fetchBookById(id);
    if (book) listBooks.push(book);
  }
  if (!listBooks.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No books found.</div>`;
    return;
  }
  grid.innerHTML = listBooks.map(book => `
    <div class="book-card" data-bookid="${book.id}">
      <img class="book-cover" src="${book.cover || 'https://via.placeholder.com/120x170?text=No+Cover'}" alt="${book.title}">
      <div class="book-title">${book.title}</div>
      <div class="book-author">${book.authors || 'Unknown'}</div>
      <div class="card-actions">
        <button class="remove-from-list-btn" data-bookid="${book.id}"><i class="fas fa-times"></i> Remove</button>
        <button class="detail-btn" data-bookid="${book.id}"><i class="fas fa-info-circle"></i> Details</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const book = listBooks.find(b => b.id === btn.dataset.bookid);
      if (book) showDetail(book, btn);
    });
  });
  grid.querySelectorAll('.remove-from-list-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleBookInList(listId, btn.dataset.bookid); });
  });
}

// ---------- DETAIL POPUP ----------
function showDetail(book, triggerEl) {
  closePopup();
  selectedBook = book;

  const popup = document.getElementById('detailPopup');
  popup.style.display = 'flex';

  if (triggerEl) {
    const card = triggerEl.closest('.book-card') || triggerEl;
    const rect = card.getBoundingClientRect();
    const popW = 420;
    let left = rect.right + 16;
    let top = rect.top;
    if (left + popW > window.innerWidth - 20) left = rect.left - popW - 16;
    if (left < 20) left = Math.max(20, (window.innerWidth - popW) / 2);
    if (top + 500 > window.innerHeight) top = Math.max(20, window.innerHeight - 520);
    if (top < 20) top = 20;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.transform = 'none';
  } else {
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  document.querySelectorAll('.book-card').forEach(c => c.classList.remove('active-card'));
  if (triggerEl) {
    const card = triggerEl.closest('.book-card');
    if (card) card.classList.add('active-card');
  }

  document.getElementById('detailCover').src = book.cover || 'https://via.placeholder.com/160x220?text=No+Cover';
  document.getElementById('detailTitle').textContent = book.title;
  document.getElementById('detailAuthor').textContent = book.authors || 'Unknown author';
  document.getElementById('detailDesc').textContent = book.description || 'No description available.';

  updatePopupFavBtn();
  loadReviews(book.id).then(reviews => renderReviews(reviews));
}

function updatePopupFavBtn() {
  if (!selectedBook) return;
  const isFav = userFavorites.includes(selectedBook.id);
  const favBtn = document.getElementById('detailFavBtn');
  favBtn.innerHTML = `<i class="fas fa-heart"></i> ${isFav ? 'Unfavorite' : 'Favorite'}`;
  favBtn.style.background = isFav ? '#fef2f2' : '#1e293b';
  favBtn.style.color = isFav ? '#b91c1c' : 'white';
  favBtn.style.borderColor = isFav ? '#fca5a5' : '#1e293b';
  document.getElementById('detailFavoriteStatus').textContent = isFav ? 'In your favorites' : '';
}

function renderReviews(reviews) {
  const container = document.getElementById('reviewList');
  document.getElementById('reviewCountBadge').textContent = reviews.length;
  let avgRating = 0;
  if (reviews.length) avgRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  document.getElementById('detailRating').textContent = avgRating.toFixed(1);
  document.getElementById('detailReviewsCount').textContent = reviews.length;
  if (!reviews.length) {
    container.innerHTML = `<div class="empty-state" style="padding:1rem;font-size:0.9rem;">No reviews yet. Be the first!</div>`;
    return;
  }
  container.innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="review-text">
        <strong>${r.userName}</strong>
        <div class="review-stars">${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5 - Math.round(r.rating))}</div>
        <div style="font-size:0.9rem;">${r.text || ''}</div>
        <div class="review-meta">${new Date(r.createdAt).toLocaleDateString()}</div>
      </div>
    </div>`).join('');
}

function closePopup() {
  document.getElementById('detailPopup').style.display = 'none';
  document.querySelectorAll('.book-card').forEach(c => c.classList.remove('active-card'));
  selectedBook = null;
}

// ---------- LIST MODAL ----------
function openListModal(bookId) {
  if (!token) return openModal('login');
  document.getElementById('listModal').style.display = 'flex';
  document.getElementById('listModalBookTitle').textContent = selectedBook ? selectedBook.title : '';
  renderListCheckboxes(bookId);
}

function closeListModal() {
  document.getElementById('listModal').style.display = 'none';
}

function renderListCheckboxes(bookId) {
  const container = document.getElementById('listCheckboxes');
  if (!userLists.length) {
    container.innerHTML = `<div class="list-modal-empty"><i class="fas fa-list-ul" style="font-size:1.5rem;color:#cbd5e1;display:block;margin-bottom:0.3rem;"></i>No lists yet. Create one below.</div>`;
    return;
  }
  container.innerHTML = userLists.map(list => {
    const inList = list.bookIds.includes(bookId);
    return `
      <div class="list-checkbox-item">
        <input type="checkbox" id="listCheck_${list._id}" data-listid="${list._id}" ${inList ? 'checked' : ''} />
        <label for="listCheck_${list._id}">
          ${list.name}
          <span class="list-check-count">${list.bookIds.length} books</span>
        </label>
      </div>`;
  }).join('');
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      toggleBookInList(cb.dataset.listid, bookId).then(() => {
        renderListCheckboxes(bookId);
      });
    });
  });
}

// ---------- AUTH MODAL ----------
function openModal(mode) {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('authModalTitle').textContent = mode === 'login' ? 'Sign in' : 'Create account';
  document.getElementById('authName').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Sign in' : 'Register';
  document.getElementById('authToggleLink').innerHTML = mode === 'login'
    ? `Don't have an account? <a href="#" id="switchToRegister">Register</a>`
    : `Already have an account? <a href="#" id="switchToLogin">Sign in</a>`;
  document.getElementById('authError').textContent = '';
  document.getElementById('switchToRegister')?.addEventListener('click', (e) => { e.preventDefault(); openModal('register'); });
  document.getElementById('switchToLogin')?.addEventListener('click', (e) => { e.preventDefault(); openModal('login'); });
}

function closeModal() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('authError').textContent = '';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('authName').value.trim();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  const isRegister = document.getElementById('authModalTitle').textContent === 'Create account';
  try {
    if (isRegister) await register(name, email, password);
    else await login(email, password);
  } catch (err) { errorEl.textContent = err.message; }
}

// ---------- AUTH UI ----------
function updateAuthUI() {
  const userBadge = document.getElementById('userBadge');
  const authBtn = document.getElementById('authBtn');
  if (currentUser) {
    userBadge.innerHTML = `<i class="fas fa-user-circle"></i> ${currentUser.name}`;
    authBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> Sign out`;
    authBtn.onclick = logout;
  } else {
    userBadge.innerHTML = `<i class="fas fa-user-circle"></i> Guest`;
    authBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> Sign in`;
    authBtn.onclick = () => openModal('login');
  }
}

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  loadUser();

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Search
  document.getElementById('searchBtn').addEventListener('click', () => {
    searchBooks(document.getElementById('searchInput').value);
  });
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('searchBtn').click();
  });

  // Detail popup
  document.getElementById('popupClose').addEventListener('click', closePopup);
  document.addEventListener('click', (e) => {
    const popup = document.getElementById('detailPopup');
    if (popup.style.display === 'none') return;
    if (popup.contains(e.target)) return;
    if (e.target.closest('.book-card') || e.target.closest('.detail-btn')) return;
    closePopup();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePopup(); closeListModal(); closeModal(); } });

  // Review submit
  document.getElementById('submitReviewBtn').addEventListener('click', () => {
    if (!selectedBook) return alert('Select a book first');
    const rating = document.getElementById('reviewRatingInput').value;
    const text = document.getElementById('reviewTextInput').value;
    addReview(selectedBook.id, rating, text);
    document.getElementById('reviewRatingInput').value = '';
    document.getElementById('reviewTextInput').value = '';
  });

  // Detail popup buttons
  document.getElementById('detailFavBtn').addEventListener('click', () => {
    if (selectedBook) toggleFavorite(selectedBook.id);
  });
  document.getElementById('detailListBtn').addEventListener('click', () => {
    if (selectedBook) openListModal(selectedBook.id);
  });

  // List modal
  document.getElementById('listModalCloseBtn').addEventListener('click', closeListModal);
  document.getElementById('listModalCreateBtn').addEventListener('click', () => {
    if (!selectedBook) return;
    const input = document.getElementById('listModalNewName');
    const name = input.value.trim();
    if (!name) return;
    createList(name).then(() => { input.value = ''; renderListCheckboxes(selectedBook.id); });
  });
  document.getElementById('listModalNewName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && selectedBook) {
      const input = document.getElementById('listModalNewName');
      const name = input.value.trim();
      if (!name) return;
      createList(name).then(() => { input.value = ''; renderListCheckboxes(selectedBook.id); });
    }
  });
  document.getElementById('listModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeListModal();
  });

  // Create list (sidebar)
  document.getElementById('createListBtn').addEventListener('click', () => {
    const input = document.getElementById('newListName');
    createList(input.value);
    input.value = '';
  });

  // Auth modal
  document.getElementById('authSubmitBtn').addEventListener('click', handleAuthSubmit);
  document.getElementById('authCancelBtn').addEventListener('click', closeModal);
  document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

});
