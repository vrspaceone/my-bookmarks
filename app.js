// Supabase 설정
const SUPABASE_URL = 'https://oweqajjxyoxzwkevbpvm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VKoS2xZKthcFClFDhi7T0w_2QDMHiGM';

// CDN의 window.supabase 객체와의 전역 변수명 충돌(SyntaxError)을 방지하기 위해 supabaseClient로 관리
let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = supabaseClient;
    return supabaseClient;
  }
  return null;
}

// 전역 상태
let bookmarksData = [];
let currentCategory = 'all';
let searchQuery = '';
let editingBookmarkId = null; // 수정 중인 북마크 ID (null이면 추가 모드)

// DOM 요소 캐싱
const bookmarksGrid = document.getElementById('bookmarks-grid');
const categoryChipsContainer = document.getElementById('category-chips');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear');
const statusBox = document.getElementById('status-box');

/**
 * Supabase의 bookmarks 테이블에서 데이터를 비동기(select)로 불러오는 함수
 */
async function fetchBookmarks() {
  showStatus('데이터를 로드하는 중입니다...', true);

  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase 라이브러리(CDN)가 로드되지 않았습니다. index.html의 CDN 스크립트 연결을 확인해주세요.');
    }

    const { data, error } = await client
      .from('bookmarks')
      .select('*');

    if (error) {
      throw error;
    }

    console.log('Supabase에서 불러온 북마크:', data);

    // 데이터 가공 (tags 및 category 안전 처리)
    bookmarksData = (data || []).map(item => ({
      ...item,
      category: item.category || '기타',
      tags: Array.isArray(item.tags)
        ? item.tags
        : typeof item.tags === 'string'
          ? (item.tags.startsWith('[') ? JSON.parse(item.tags) : item.tags.split(',').map(t => t.trim()).filter(Boolean))
          : []
    }));

    // id가 존재하는 경우 오름차순 정렬
    if (bookmarksData.length > 0 && typeof bookmarksData[0].id === 'number') {
      bookmarksData.sort((a, b) => a.id - b.id);
    }

    // 카테고리 칩 동적 생성 및 첫 렌더링
    buildCategoryChips();
    hideStatus();
    renderBookmarks();
  } catch (error) {
    console.error('북마크 로드 실패:', error);
    showStatus(`북마크를 불러오는 데 실패했습니다: ${error.message || '네트워크 상태를 확인해주세요.'}`, false);
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
 * - 카드 우측 상단에 작은 [수정], [삭제] 버튼 제공
 * - 카드 본체 클릭 시 새 탭으로 URL 이동
 */
function createBookmarkCard(item) {
  const card = document.createElement('div');
  card.className = 'bookmark-card';
  card.role = 'button';
  card.tabIndex = 0;
  card.setAttribute('aria-label', `${item.title} 바로가기 (새 탭)`);

  const tagsHtml = (item.tags || [])
    .map(tag => `<span class="tag-item">#${escapeHtml(tag)}</span>`)
    .join('');

  card.innerHTML = `
    <div class="card-header">
      <span class="category-tag cat-${escapeHtml(item.category)}">${escapeHtml(item.category)}</span>
      <div class="card-actions">
        <button type="button" class="card-btn btn-edit" title="북마크 수정" aria-label="수정">수정</button>
        <button type="button" class="card-btn btn-delete" title="북마크 삭제" aria-label="삭제">삭제</button>
        <svg class="external-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"></line>
          <polyline points="7 7 17 7 17 17"></polyline>
        </svg>
      </div>
    </div>
    <div class="card-body">
      <h2 class="card-title">${escapeHtml(item.title)}</h2>
      <p class="card-desc">${escapeHtml(item.description || '')}</p>
    </div>
    <div class="card-tags">
      ${tagsHtml}
    </div>
  `;

  // 카드 클릭 시 URL 열기 (수정/삭제 버튼 클릭 시 제외)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-btn')) return;
    window.open(item.url, '_blank', 'noopener,noreferrer');
  });

  // 키보드 접근성 (Enter/Space 키)
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('.card-btn')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  });

  // [수정] 버튼 클릭 이벤트
  const editBtn = card.querySelector('.btn-edit');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(item);
    });
  }

  // [삭제] 버튼 클릭 이벤트
  const deleteBtn = card.querySelector('.btn-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteBookmark(item);
    });
  }

  return card;
}

/**
 * 북마크 삭제 처리 함수
 */
async function handleDeleteBookmark(item) {
  const confirmed = confirm('정말 삭제하시겠습니까?');
  if (!confirmed) return;

  try {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
    }

    const { error } = await client
      .from('bookmarks')
      .delete()
      .eq('id', item.id);

    if (error) {
      throw error;
    }

    console.log(`북마크 삭제 완료 (id: ${item.id})`);
    // 삭제 후 화면 즉시 갱신
    await fetchBookmarks();
  } catch (error) {
    console.error('북마크 삭제 실패:', error);
    alert(`삭제에 실패했습니다: ${error.message || 'Supabase 연결 상태를 확인해주세요.'}`);
  }
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

// 모달 제어 함수들 (전역/외부 호출 가능)
let openCreateModal = null;
let openEditModal = null;

/**
 * 북마크 추가/수정 모달(팝업 폼) 및 Supabase Insert/Update 이벤트 바인딩
 */
function setupModalEvents() {
  const openModalBtn = document.getElementById('open-modal-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  const modal = document.getElementById('bookmark-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBadge = modal.querySelector('.modal-badge');
  const form = document.getElementById('bookmark-form');
  const errorBox = document.getElementById('modal-error-box');
  const saveBtn = document.getElementById('save-modal-btn');
  const saveBtnText = saveBtn.querySelector('.btn-save-text');
  const saveBtnSpinner = saveBtn.querySelector('.btn-save-spinner');

  const titleInput = document.getElementById('bm-title');
  const urlInput = document.getElementById('bm-url');
  const descInput = document.getElementById('bm-desc');
  const categoryInput = document.getElementById('bm-category');
  const tagsInput = document.getElementById('bm-tags');
  const categorySuggestions = document.getElementById('category-suggestions');

  // 등록된 데이터 기준으로 카테고리 자동완성 갱신
  function updateCategorySuggestions() {
    if (!categorySuggestions) return;
    const existingCategories = new Set(['개발', '디자인', '생산성', 'AI']);
    bookmarksData.forEach(item => {
      if (item.category && item.category !== 'all') {
        existingCategories.add(item.category);
      }
    });

    categorySuggestions.innerHTML = '';
    existingCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      categorySuggestions.appendChild(option);
    });
  }

  // 모달 닫기
  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    form.reset();
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
    editingBookmarkId = null;
    setLoading(false);
  }

  // 로딩 상태 토글
  function setLoading(isLoading) {
    saveBtn.disabled = isLoading;
    if (isLoading) {
      saveBtnText.textContent = '저장 중...';
      saveBtnSpinner.classList.remove('hidden');
    } else {
      saveBtnText.textContent = editingBookmarkId ? '수정 저장' : '저장';
      saveBtnSpinner.classList.add('hidden');
    }
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  // 신규 추가 모달 열기
  openCreateModal = function() {
    editingBookmarkId = null;
    form.reset();
    modalTitle.textContent = '북마크 추가';
    if (modalBadge) modalBadge.textContent = 'Supabase DB';
    saveBtnText.textContent = '저장';
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
    updateCategorySuggestions();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => titleInput.focus(), 80);
  };

  // 기존 북마크 수정 모달 열기
  openEditModal = function(item) {
    editingBookmarkId = item.id;
    modalTitle.textContent = '북마크 수정';
    if (modalBadge) modalBadge.textContent = `ID #${item.id}`;
    saveBtnText.textContent = '수정 저장';
    errorBox.textContent = '';
    errorBox.classList.add('hidden');

    // 기존 데이터로 폼 채우기
    titleInput.value = item.title || '';
    urlInput.value = item.url || '';
    descInput.value = item.description || '';
    categoryInput.value = item.category || '';
    tagsInput.value = Array.isArray(item.tags) ? item.tags.join(', ') : '';

    updateCategorySuggestions();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => titleInput.focus(), 80);
  };

  // 모달 열기 및 닫기 이벤트 리스너
  if (openModalBtn) openModalBtn.addEventListener('click', openCreateModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);

  // 모달 바깥(배경) 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // ESC 키 입력 시 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // 폼 제출 처리 (Supabase insert 또는 update)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');

    const title = titleInput.value.trim();
    let url = urlInput.value.trim();
    const description = descInput.value.trim();
    const category = categoryInput.value.trim() || '기타';
    const tagsRaw = tagsInput.value.trim();

    if (!title) {
      showError('제목을 입력해주세요.');
      titleInput.focus();
      return;
    }

    if (!url) {
      showError('웹사이트 URL을 입력해주세요.');
      urlInput.focus();
      return;
    }

    // URL 프로토콜 보정 (https:// 또는 http:// 접두사 보장)
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    // 태그 쉼표 구분 배열 변환
    const tags = tagsRaw
      ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    setLoading(true);

    try {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
      }

      const bookmarkPayload = {
        title,
        url,
        description,
        category,
        tags
      };

      if (editingBookmarkId) {
        // [수정] Update 처리
        const { data, error } = await client
          .from('bookmarks')
          .update(bookmarkPayload)
          .eq('id', editingBookmarkId)
          .select();

        if (error) {
          throw error;
        }

        console.log('북마크 수정 성공:', data);
      } else {
        // [추가] Insert 처리
        const { data, error } = await client
          .from('bookmarks')
          .insert([bookmarkPayload])
          .select();

        if (error) {
          throw error;
        }

        console.log('북마크 추가 성공:', data);
      }

      // 모달 닫기 및 데이터 목록 즉시 재로드
      closeModal();
      await fetchBookmarks();
    } catch (error) {
      console.error(editingBookmarkId ? '북마크 수정 실패:' : '북마크 추가 실패:', error);
      showError(`저장에 실패했습니다: ${error.message || 'Supabase 연결 및 권한 설정을 확인해주세요.'}`);
      setLoading(false);
    }
  });
}

// 애플리케이션 초기화
function initApp() {
  setupSearchEvents();
  setupModalEvents();
  fetchBookmarks();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
