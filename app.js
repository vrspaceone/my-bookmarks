// 전역 상태
let bookmarksData = [];
let currentCategory = 'all';
let searchQuery = '';

// DOM 요소 캐싱
const bookmarksGrid = document.getElementById('bookmarks-grid');
const categoryChipsContainer = document.getElementById('category-chips');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear');
const statusBox = document.getElementById('status-box');

/**
 * bookmarks.json 파일을 비동기(fetch)로 불러오는 함수
 */
async function fetchBookmarks() {
  showStatus('데이터를 로드하는 중입니다...', true);

  try {
    const response = await fetch('bookmarks.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    bookmarksData = await response.json();
    
    // 카테고리 칩 동적 생성 및 첫 렌더링
    buildCategoryChips();
    hideStatus();
    renderBookmarks();
  } catch (error) {
    console.error('북마크 로드 실패:', error);
    showStatus('북마크를 불러오는 데 실패했습니다. 로컬 웹 서버(Live Server 등)에서 실행 중인지 확인해주세요.', false);
  }
}

/**
 * 데이터에 존재하는 카테고리를 분석하여 동적으로 칩 버튼을 생성
 */
function buildCategoryChips() {
  categoryChipsContainer.innerHTML = '';

  // 카테고리별 개수 카운트
  const categoryCounts = { all: bookmarksData.length };
  bookmarksData.forEach(item => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });

  // 고유 카테고리 목록 추출
  const uniqueCategories = ['all', ...Object.keys(categoryCounts).filter(cat => cat !== 'all')];

  uniqueCategories.forEach(category => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-btn ${category === currentCategory ? 'active' : ''}`;
    chip.dataset.category = category;

    const label = category === 'all' ? '전체' : category;
    const count = categoryCounts[category] || 0;

    chip.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <span class="chip-count">${count}</span>
    `;

    chip.addEventListener('click', () => {
      if (currentCategory === category) return;
      currentCategory = category;

      // 활성 상태 UI 업데이트
      categoryChipsContainer.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === currentCategory);
      });

      renderBookmarks();
    });

    categoryChipsContainer.appendChild(chip);
  });
}

/**
 * 북마크 카드 단일 컴포넌트 생성
 * - 카드 전체를 <a> 태그로 래핑하여 클릭 시 새 탭으로 바로 열리도록 지원
 */
function createBookmarkCard(item) {
  const card = document.createElement('a');
  card.className = 'bookmark-card';
  card.href = item.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.setAttribute('aria-label', `${item.title} 바로가기 (새 탭)`);

  const tagsHtml = (item.tags || [])
    .map(tag => `<span class="tag-item">#${escapeHtml(tag)}</span>`)
    .join('');

  card.innerHTML = `
    <div class="card-header">
      <span class="category-tag cat-${escapeHtml(item.category)}">${escapeHtml(item.category)}</span>
      <svg class="external-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="7" y1="17" x2="17" y2="7"></line>
        <polyline points="7 7 17 7 17 17"></polyline>
      </svg>
    </div>
    <div class="card-body">
      <h2 class="card-title">${escapeHtml(item.title)}</h2>
      <p class="card-desc">${escapeHtml(item.description)}</p>
    </div>
    <div class="card-tags">
      ${tagsHtml}
    </div>
  `;

  return card;
}

/**
 * 필터 및 검색어 조건에 맞게 필터링 후 화면에 렌더링
 */
function renderBookmarks() {
  bookmarksGrid.innerHTML = '';

  const query = searchQuery.trim().toLowerCase();

  const filtered = bookmarksData.filter(item => {
    const matchCategory = currentCategory === 'all' || item.category === currentCategory;
    if (!query) return matchCategory;

    const matchTitle = (item.title || '').toLowerCase().includes(query);
    const matchDesc = (item.description || '').toLowerCase().includes(query);
    const matchTags = (item.tags || []).some(tag => tag.toLowerCase().includes(query));

    return matchCategory && (matchTitle || matchDesc || matchTags);
  });

  if (filtered.length === 0) {
    showStatus('조건과 일치하는 북마크를 찾을 수 없습니다.', false);
  } else {
    hideStatus();
    const fragment = document.createDocumentFragment();
    filtered.forEach(item => {
      fragment.appendChild(createBookmarkCard(item));
    });
    bookmarksGrid.appendChild(fragment);
  }
}

/**
 * 상태 메시지 (로딩/결과 없음/에러) 헬퍼
 */
function showStatus(message, showSpinner = false) {
  if (!statusBox) return;
  statusBox.classList.remove('hidden');

  const spinner = statusBox.querySelector('.spinner');
  const statusText = statusBox.querySelector('.status-text');

  if (spinner) spinner.style.display = showSpinner ? 'block' : 'none';
  if (statusText) statusText.textContent = message;
}

function hideStatus() {
  if (statusBox) {
    statusBox.classList.add('hidden');
  }
}

/**
 * XSS 방지를 위한 HTML 이스케이프 유틸
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 검색창 및 인터랙션 이벤트 바인딩
 */
function setupSearchEvents() {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    searchClearBtn.classList.toggle('hidden', searchQuery.length === 0);
    renderBookmarks();
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClearBtn.classList.add('hidden');
    searchInput.focus();
    renderBookmarks();
  });
}

// 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', () => {
  setupSearchEvents();
  fetchBookmarks();
});
