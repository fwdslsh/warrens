/**
 * Warren Browser - Vanilla JS Client for Rabit
 * A lightweight browser client for navigating Warren and Burrow files
 */

// Configuration
const CONFIG = {
  defaultAddress: 'warren.fwdslsh.dev',
  specVersion: 'fwdslsh.dev/rabit/schemas/0.4.0',
  cacheTimeout: 60 * 60 * 1000, // 1 hour
  maxDiscoveryDepth: 2,
  manifestFilenames: {
    warren: ['.warren.json', 'warren.json', '.well-known/warren.json'],
    burrow: ['.burrow.json', 'burrow.json', '.well-known/burrow.json']
  },
  // CORS proxy for development - set to empty string to disable
  // Public proxies: 'https://corsproxy.io/?' or 'https://api.allorigins.win/raw?url='
  corsProxy: 'https://corsproxy.io/?'
};

// Entry kind icons
const KIND_ICONS = {
  file: '📄',
  dir: '📁',
  burrow: '🐰',
  map: '🗺️',
  link: '🔗',
  warren: '🏠'
};

// State management
const state = {
  currentWarren: null,
  currentBurrow: null,
  currentEntry: null,
  navigationStack: [],
  cache: new Map(),
  theme: localStorage.getItem('theme') || 'light'
};

// DOM Elements
const elements = {};

// Initialize the application
function init() {
  cacheElements();
  setupEventListeners();
  applyTheme(state.theme);

  // Check URL parameters for initial address
  const urlParams = new URLSearchParams(window.location.search);
  const address = urlParams.get('url') || urlParams.get('address');
  if (address) {
    elements.addressInput.value = address;
    navigate(address);
  }
}

// Cache DOM elements for performance
function cacheElements() {
  elements.addressInput = document.getElementById('address-input');
  elements.goBtn = document.getElementById('go-btn');
  elements.refreshBtn = document.getElementById('refresh-btn');
  elements.startBtn = document.getElementById('start-btn');
  elements.retryBtn = document.getElementById('retry-btn');
  elements.themeToggle = document.getElementById('theme-toggle');
  elements.collapseSidebar = document.getElementById('collapse-sidebar');
  elements.expandSidebar = document.getElementById('expand-sidebar');
  elements.backBtn = document.getElementById('back-btn');
  elements.sidebar = document.getElementById('sidebar');
  elements.breadcrumb = document.getElementById('breadcrumb');
  elements.warrenInfo = document.getElementById('warren-info');
  elements.warrenTitle = document.getElementById('warren-title');
  elements.warrenDescription = document.getElementById('warren-description');
  elements.warrenBurrowCount = document.getElementById('warren-burrow-count');
  elements.entries = document.getElementById('entries');
  elements.sidebarLoading = document.getElementById('sidebar-loading');
  elements.sidebarEmpty = document.getElementById('sidebar-empty');
  elements.contentHeader = document.getElementById('content-header');
  elements.contentKind = document.getElementById('content-kind');
  elements.contentTitle = document.getElementById('content-title');
  elements.contentUri = document.getElementById('content-uri');
  elements.contentSize = document.getElementById('content-size');
  elements.contentType = document.getElementById('content-type');
  elements.contentBody = document.getElementById('content-body');
  elements.welcome = document.getElementById('welcome');
  elements.contentLoading = document.getElementById('content-loading');
  elements.contentError = document.getElementById('content-error');
  elements.errorMessage = document.getElementById('error-message');
  elements.contentDisplay = document.getElementById('content-display');
  elements.contentPre = document.getElementById('content-pre');
  elements.burrowDisplay = document.getElementById('burrow-display');
  elements.burrowInfo = document.getElementById('burrow-info');
  elements.burrowEntries = document.getElementById('burrow-entries');
  elements.statusText = document.getElementById('status-text');
  elements.cacheStatus = document.getElementById('cache-status');
}

// Setup event listeners
function setupEventListeners() {
  elements.goBtn.addEventListener('click', () => navigate(elements.addressInput.value));
  elements.refreshBtn.addEventListener('click', () => refresh());
  elements.startBtn.addEventListener('click', () => navigate(elements.addressInput.value));
  elements.retryBtn.addEventListener('click', () => navigate(elements.addressInput.value));
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.collapseSidebar.addEventListener('click', () => toggleSidebar(true));
  elements.expandSidebar.addEventListener('click', () => toggleSidebar(false));
  elements.backBtn.addEventListener('click', goBack);

  elements.addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') navigate(elements.addressInput.value);
  });
}

// Theme management
function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(state.theme);
  localStorage.setItem('theme', state.theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Sidebar toggle
function toggleSidebar(collapse) {
  if (collapse) {
    elements.sidebar.classList.add('collapsed');
    elements.expandSidebar.style.display = 'block';
  } else {
    elements.sidebar.classList.remove('collapsed');
    elements.expandSidebar.style.display = 'none';
  }
}

// Go back in navigation
function goBack() {
  if (state.navigationStack.length > 1) {
    state.navigationStack.pop();
    const previousItem = state.navigationStack[state.navigationStack.length - 1];

    if (previousItem.type === 'warren' && previousItem.warren) {
      state.currentWarren = previousItem.warren;
      displayWarren(previousItem.warren);
    } else if (previousItem.type === 'burrow' && previousItem.burrow) {
      state.currentBurrow = previousItem.burrow;
      displayBurrow(previousItem.burrow);
    } else if (previousItem.type === 'root') {
      navigate(elements.addressInput.value);
    }
  }
  updateBackButton();
}

// Update back button visibility
function updateBackButton() {
  elements.backBtn.style.display = state.navigationStack.length > 1 ? 'block' : 'none';
}

// Navigation
async function navigate(address) {
  if (!address) {
    address = CONFIG.defaultAddress;
  }

  // Normalize address
  address = normalizeAddress(address);
  elements.addressInput.value = address;

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('url', address);
  window.history.pushState({}, '', url);

  // Reset state
  state.navigationStack = [{ address, type: 'root' }];

  // Show loading
  showSidebarLoading();
  hideAllContent();
  elements.contentLoading.style.display = 'flex';
  setStatus('Discovering...');

  try {
    // Try to discover warren or burrow at this address
    const result = await discover(address);

    if (result.warren) {
      result.warren._baseUri = result.baseUri;
      // Update navigation stack with warren
      state.navigationStack = [{
        address,
        type: 'warren',
        title: result.warren.title || 'Warren',
        warren: result.warren
      }];
      displayWarren(result.warren);
    } else if (result.burrow) {
      result.burrow._baseUri = result.baseUri;
      // Update navigation stack with burrow
      state.navigationStack = [{
        address,
        type: 'burrow',
        title: result.burrow.title || 'Burrow',
        burrow: result.burrow
      }];
      displayBurrow(result.burrow);
    } else {
      showError('No warren or burrow found at this address');
    }
  } catch (error) {
    console.error('Navigation error:', error);
    showError(error.message || 'Failed to fetch content');
  }
}

// Normalize address to full URL
function normalizeAddress(address) {
  address = address.trim();

  // Add protocol if missing
  if (!address.match(/^https?:\/\//)) {
    address = 'https://' + address;
  }

  // Ensure trailing slash for directories
  // Only skip trailing slash for actual file extensions (not TLDs like .dev, .io, .com)
  // Check if the path portion (after the host) ends with a file extension
  try {
    const url = new URL(address);
    const hasFileExtension = url.pathname.match(/\.[a-z0-9]+$/i) && url.pathname !== '/';
    if (!address.endsWith('/') && !hasFileExtension) {
      address += '/';
    }
  } catch (e) {
    // Fallback: just add trailing slash if missing
    if (!address.endsWith('/')) {
      address += '/';
    }
  }

  return address;
}

// Discovery - find warren or burrow at address
async function discover(uri) {
  const baseUri = uri.endsWith('/') ? uri : uri.substring(0, uri.lastIndexOf('/') + 1);

  // Try to find warren first
  for (const filename of CONFIG.manifestFilenames.warren) {
    try {
      const warrenUri = resolveUri(baseUri, filename);
      const warren = await fetchJson(warrenUri);

      if (warren && warren.kind === 'warren') {
        return { warren, baseUri: warren.baseUri || baseUri };
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  // Try to find burrow
  for (const filename of CONFIG.manifestFilenames.burrow) {
    try {
      const burrowUri = resolveUri(baseUri, filename);
      const burrow = await fetchJson(burrowUri);

      if (burrow && burrow.kind === 'burrow') {
        return { burrow, baseUri: burrow.baseUri || baseUri };
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  // Walk up directory hierarchy
  if (CONFIG.maxDiscoveryDepth > 0) {
    const parentUri = getParentUri(baseUri);
    if (parentUri && parentUri !== baseUri) {
      return await discoverWithDepth(parentUri, 1);
    }
  }

  return {};
}

// Discovery with depth tracking
async function discoverWithDepth(uri, depth) {
  if (depth > CONFIG.maxDiscoveryDepth) {
    return {};
  }

  const baseUri = uri.endsWith('/') ? uri : uri.substring(0, uri.lastIndexOf('/') + 1);

  // Try warren
  for (const filename of CONFIG.manifestFilenames.warren) {
    try {
      const warrenUri = resolveUri(baseUri, filename);
      const warren = await fetchJson(warrenUri);

      if (warren && warren.kind === 'warren') {
        return { warren, baseUri: warren.baseUri || baseUri, depth };
      }
    } catch (e) {
      // Continue
    }
  }

  // Try burrow
  for (const filename of CONFIG.manifestFilenames.burrow) {
    try {
      const burrowUri = resolveUri(baseUri, filename);
      const burrow = await fetchJson(burrowUri);

      if (burrow && burrow.kind === 'burrow') {
        return { burrow, baseUri: burrow.baseUri || baseUri, depth };
      }
    } catch (e) {
      // Continue
    }
  }

  // Walk up
  const parentUri = getParentUri(baseUri);
  if (parentUri && parentUri !== baseUri) {
    return await discoverWithDepth(parentUri, depth + 1);
  }

  return {};
}

// Fetch Warren
async function fetchWarren(uri) {
  const baseUri = uri.endsWith('/') ? uri : uri.substring(0, uri.lastIndexOf('/') + 1);

  for (const filename of CONFIG.manifestFilenames.warren) {
    try {
      const warrenUri = resolveUri(baseUri, filename);
      const warren = await fetchJson(warrenUri);

      if (warren && warren.kind === 'warren') {
        warren._baseUri = warren.baseUri || baseUri;
        warren._sourceUri = warrenUri;
        return warren;
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  throw new Error('Warren not found');
}

// Fetch Burrow
async function fetchBurrow(uri) {
  const baseUri = uri.endsWith('/') ? uri : uri.substring(0, uri.lastIndexOf('/') + 1);

  for (const filename of CONFIG.manifestFilenames.burrow) {
    try {
      const burrowUri = resolveUri(baseUri, filename);
      const burrow = await fetchJson(burrowUri);

      if (burrow && burrow.kind === 'burrow') {
        burrow._baseUri = burrow.baseUri || baseUri;
        burrow._sourceUri = burrowUri;
        return burrow;
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  throw new Error('Burrow not found');
}

// Fetch a burrow file directly (for map entries)
async function fetchBurrowFile(uri) {
  const burrow = await fetchJson(uri);

  if (burrow && burrow.kind === 'burrow') {
    const baseUri = uri.substring(0, uri.lastIndexOf('/') + 1);
    burrow._baseUri = burrow.baseUri || baseUri;
    burrow._sourceUri = uri;
    return burrow;
  }

  throw new Error('Invalid burrow file');
}

// Fetch entry content
async function fetchEntryContent(burrow, entry) {
  const entryUri = resolveUri(burrow._baseUri, entry.uri);
  setStatus(`Fetching ${entry.title || entry.id}...`);

  try {
    // Use CORS proxy if configured
    const fetchUri = CONFIG.corsProxy ? CONFIG.corsProxy + encodeURIComponent(entryUri) : entryUri;
    const response = await fetch(fetchUri);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    setStatus('Ready');
    return content;
  } catch (error) {
    setStatus('Error');
    throw error;
  }
}

// JSON fetch with caching
async function fetchJson(uri) {
  // Check cache
  const cached = state.cache.get(uri);
  if (cached && Date.now() - cached.timestamp < CONFIG.cacheTimeout) {
    updateCacheStatus();
    return cached.data;
  }

  // Use CORS proxy if configured
  const fetchUri = CONFIG.corsProxy ? CONFIG.corsProxy + encodeURIComponent(uri) : uri;
  const response = await fetch(fetchUri);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  // Cache the result
  state.cache.set(uri, { data, timestamp: Date.now() });
  updateCacheStatus();

  return data;
}

// URI utilities
function resolveUri(base, relative) {
  return new URL(relative, base).href;
}

// Transform GitHub URLs to raw URLs for file access
function transformGitHubUrl(uri) {
  // Match github.com URLs and convert to raw.githubusercontent.com
  // https://github.com/owner/repo -> https://raw.githubusercontent.com/owner/repo/main/
  // https://github.com/owner/repo/blob/branch/path -> https://raw.githubusercontent.com/owner/repo/branch/path
  const githubMatch = uri.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(\/blob\/([^\/]+)\/(.+))?$/);
  if (githubMatch) {
    const [, owner, repo, , branch, path] = githubMatch;
    if (branch && path) {
      // Full blob URL
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    } else {
      // Just repo URL - assume main branch
      return `https://raw.githubusercontent.com/${owner}/${repo}/main/`;
    }
  }
  return uri;
}

function getParentUri(uri) {
  try {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length === 0) {
      return null;
    }

    pathParts.pop();
    url.pathname = pathParts.length > 0 ? '/' + pathParts.join('/') + '/' : '/';

    return url.href;
  } catch (e) {
    return null;
  }
}

// Display Warren
function displayWarren(warren) {
  hideSidebarLoading();
  hideAllContent();

  state.currentWarren = warren;

  // Show warren info
  elements.warrenInfo.style.display = 'block';
  elements.warrenTitle.textContent = warren.title || 'Warren';
  elements.warrenDescription.textContent = warren.description || '';
  elements.warrenBurrowCount.textContent = `${warren.burrows?.length || 0} burrows`;

  // Update breadcrumb
  updateBreadcrumb();
  updateBackButton();

  // Display burrows as entries
  const entries = (warren.burrows || []).map(burrow => ({
    ...burrow,
    kind: 'burrow',
    title: burrow.title || burrow.id,
    summary: burrow.description
  }));

  // Also include federated warrens
  if (warren.warrens?.length) {
    warren.warrens.forEach(w => {
      entries.push({
        ...w,
        kind: 'warren',
        title: w.title || w.id,
        summary: w.description
      });
    });
  }

  displayEntries(entries);

  // Show warren details in content area
  elements.burrowDisplay.style.display = 'block';
  elements.burrowInfo.innerHTML = `
    <h2>${escapeHtml(warren.title || 'Warren')}</h2>
    <p>${escapeHtml(warren.description || 'No description')}</p>
    <div class="burrow-meta">
      <span>Version: ${escapeHtml(extractVersion(warren.specVersion))}</span>
      <span>Updated: ${formatDate(warren.updated)}</span>
      <span>Burrows: ${warren.burrows?.length || 0}</span>
      ${warren.warrens?.length ? `<span>Federated: ${warren.warrens.length}</span>` : ''}
    </div>
  `;

  // Show entry cards
  displayEntryCards(entries);

  setStatus('Ready');
}

// Display Burrow
function displayBurrow(burrow, parentContext = null) {
  hideSidebarLoading();
  hideAllContent();

  // Update navigation stack
  if (parentContext) {
    state.navigationStack.push({
      title: burrow.title || 'Burrow',
      type: 'burrow',
      burrow
    });
  }

  state.currentBurrow = burrow;

  // Update breadcrumb and back button
  updateBreadcrumb();
  updateBackButton();

  // Get entries sorted by priority
  const entries = [...(burrow.entries || [])].sort((a, b) =>
    (b.priority || 0) - (a.priority || 0)
  );

  displayEntries(entries);

  // Show burrow details in content area
  elements.burrowDisplay.style.display = 'block';
  elements.burrowInfo.innerHTML = `
    <h2>${escapeHtml(burrow.title || 'Burrow')}</h2>
    <p>${escapeHtml(burrow.description || 'No description')}</p>
    <div class="burrow-meta">
      <span>Version: ${escapeHtml(extractVersion(burrow.specVersion))}</span>
      <span>Updated: ${formatDate(burrow.updated)}</span>
      <span>Entries: ${entries.length}</span>
    </div>
    ${burrow.agents?.context ? `<p style="margin-top: var(--space-md); font-style: italic; color: var(--text-secondary);">${escapeHtml(burrow.agents.context)}</p>` : ''}
  `;

  // Show entry cards
  displayEntryCards(entries);

  setStatus('Ready');
}

// Display entries in sidebar
function displayEntries(entries) {
  elements.entries.innerHTML = '';

  if (!entries || entries.length === 0) {
    elements.sidebarEmpty.style.display = 'flex';
    return;
  }

  elements.sidebarEmpty.style.display = 'none';

  // Determine context from current navigation stack
  const currentNav = state.navigationStack[state.navigationStack.length - 1];
  const context = currentNav?.type === 'warren' ? 'warren' : 'burrow';

  entries.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'entry-item';
    li.dataset.index = index;
    li.dataset.kind = entry.kind;

    const icon = KIND_ICONS[entry.kind] || '📄';
    const size = entry.sizeBytes ? formatSize(entry.sizeBytes) : '';
    const mediaType = entry.mediaType ? entry.mediaType.split('/')[1] : '';

    li.innerHTML = `
      <span class="entry-icon">${icon}</span>
      <div class="entry-info">
        <div class="entry-title">${escapeHtml(entry.title || entry.id)}</div>
        ${entry.summary ? `<div class="entry-summary">${escapeHtml(entry.summary)}</div>` : ''}
        <div class="entry-meta">
          ${mediaType ? `<span>${mediaType}</span>` : ''}
          ${size ? `<span>${size}</span>` : ''}
          ${entry.tags?.length ? entry.tags.slice(0, 2).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('') : ''}
        </div>
      </div>
    `;

    li.addEventListener('click', () => handleEntryClick(entry, context));
    elements.entries.appendChild(li);
  });
}

// Display entry cards in content area
function displayEntryCards(entries) {
  elements.burrowEntries.innerHTML = '';

  // Determine context from current navigation stack
  const currentNav = state.navigationStack[state.navigationStack.length - 1];
  const context = currentNav?.type === 'warren' ? 'warren' : 'burrow';

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'burrow-entry-card';

    const icon = KIND_ICONS[entry.kind] || '📄';

    card.innerHTML = `
      <span class="entry-icon">${icon}</span>
      <div class="entry-info">
        <div class="entry-title">${escapeHtml(entry.title || entry.id)}</div>
        <div class="entry-summary">${escapeHtml(entry.summary || entry.description || 'No description')}</div>
        <div class="entry-meta">
          ${entry.mediaType ? `<span>${entry.mediaType.split('/')[1]}</span>` : ''}
          ${entry.sizeBytes ? `<span>${formatSize(entry.sizeBytes)}</span>` : ''}
        </div>
      </div>
    `;

    card.addEventListener('click', () => handleEntryClick(entry, context));
    elements.burrowEntries.appendChild(card);
  });
}

// Handle entry click
async function handleEntryClick(entry, context) {
  // Update active state in sidebar
  document.querySelectorAll('.entry-item').forEach(el => el.classList.remove('active'));
  const activeItem = document.querySelector(`.entry-item[data-index="${entry.id}"]`);
  if (activeItem) activeItem.classList.add('active');

  state.currentEntry = entry;

  try {
    switch (entry.kind) {
      case 'burrow':
        await navigateToBurrow(entry, context);
        break;

      case 'warren':
        await navigateToWarren(entry);
        break;

      case 'map':
        await navigateToMap(entry);
        break;

      case 'dir':
        await navigateToDir(entry);
        break;

      case 'link':
        // Open external link
        window.open(entry.uri, '_blank');
        break;

      case 'file':
      default:
        await displayFileContent(entry);
        break;
    }
  } catch (error) {
    console.error('Entry click error:', error);
    showError(error.message || 'Failed to load content');
  }
}

// Navigate to burrow
async function navigateToBurrow(entry, context) {
  hideAllContent();
  elements.contentLoading.style.display = 'flex';
  setStatus(`Loading ${entry.title || entry.id}...`);

  let baseUri;
  if (context === 'warren' && state.currentWarren) {
    baseUri = state.currentWarren._baseUri || state.currentWarren.baseUri;
  } else if (state.currentBurrow) {
    baseUri = state.currentBurrow._baseUri || state.currentBurrow.baseUri;
  } else {
    baseUri = '';
  }

  // Check if entry.uri is absolute or relative
  let burrowUri;
  if (entry.uri.match(/^https?:\/\//)) {
    // Absolute URL - transform GitHub URLs if needed
    burrowUri = transformGitHubUrl(entry.uri);
  } else {
    burrowUri = resolveUri(baseUri, entry.uri);
  }

  try {
    const burrow = await fetchBurrow(burrowUri);
    displayBurrow(burrow, { parent: context === 'warren' ? state.currentWarren : state.currentBurrow });
  } catch (error) {
    throw new Error(`Failed to load burrow: ${error.message}`);
  }
}

// Navigate to warren
async function navigateToWarren(entry) {
  hideAllContent();
  elements.contentLoading.style.display = 'flex';
  setStatus(`Loading ${entry.title || entry.id}...`);

  const warrenUri = entry.uri;

  try {
    const warren = await fetchWarren(warrenUri);
    state.currentWarren = warren;
    state.navigationStack = [{ title: warren.title, type: 'warren' }];
    displayWarren(warren);
  } catch (error) {
    throw new Error(`Failed to load warren: ${error.message}`);
  }
}

// Navigate to map (direct burrow file reference)
async function navigateToMap(entry) {
  hideAllContent();
  elements.contentLoading.style.display = 'flex';
  setStatus(`Loading ${entry.title || entry.id}...`);

  const baseUri = state.currentBurrow?._baseUri || '';
  const mapUri = resolveUri(baseUri, entry.uri);

  try {
    const burrow = await fetchBurrowFile(mapUri);
    displayBurrow(burrow, { parent: state.currentBurrow });
  } catch (error) {
    throw new Error(`Failed to load map: ${error.message}`);
  }
}

// Navigate to directory
async function navigateToDir(entry) {
  hideAllContent();
  elements.contentLoading.style.display = 'flex';
  setStatus(`Loading ${entry.title || entry.id}...`);

  const baseUri = state.currentBurrow?._baseUri || '';
  const dirUri = resolveUri(baseUri, entry.uri);

  try {
    // Try to find a burrow in the directory
    const burrow = await fetchBurrow(dirUri);
    displayBurrow(burrow, { parent: state.currentBurrow });
  } catch (error) {
    // If no burrow found, show error
    throw new Error(`No burrow found in directory: ${entry.uri}`);
  }
}

// Display file content
async function displayFileContent(entry) {
  hideAllContent();
  elements.contentLoading.style.display = 'flex';

  try {
    const content = await fetchEntryContent(state.currentBurrow, entry);

    hideAllContent();

    // Show content header
    elements.contentHeader.style.display = 'block';
    elements.contentKind.textContent = entry.kind;
    elements.contentTitle.textContent = entry.title || entry.id;
    elements.contentUri.textContent = entry.uri;
    elements.contentSize.textContent = entry.sizeBytes ? formatSize(entry.sizeBytes) : '';
    elements.contentType.textContent = entry.mediaType || '';

    // Show content
    elements.contentDisplay.style.display = 'block';
    elements.contentPre.textContent = content;

  } catch (error) {
    throw new Error(`Failed to fetch content: ${error.message}`);
  }
}

// Update breadcrumb
function updateBreadcrumb() {
  elements.breadcrumb.innerHTML = '';

  state.navigationStack.forEach((item, index) => {
    if (index > 0) {
      const separator = document.createElement('span');
      separator.className = 'breadcrumb-separator';
      separator.textContent = ' / ';
      elements.breadcrumb.appendChild(separator);
    }

    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    span.textContent = item.title || item.address || 'Home';

    if (index < state.navigationStack.length - 1) {
      span.addEventListener('click', () => navigateToBreadcrumb(index));
    }

    elements.breadcrumb.appendChild(span);
  });
}

// Navigate to breadcrumb item
function navigateToBreadcrumb(index) {
  if (index === 0) {
    // Go back to root
    navigate(elements.addressInput.value);
  } else {
    // Truncate navigation stack and redisplay
    state.navigationStack = state.navigationStack.slice(0, index + 1);
    const item = state.navigationStack[index];

    if (item.type === 'warren' && item.warren) {
      displayWarren(item.warren);
    } else if (item.type === 'burrow' && item.burrow) {
      displayBurrow(item.burrow);
    }
  }
}

// Refresh current view
function refresh() {
  // Clear cache for current address
  const address = elements.addressInput.value;
  state.cache.clear();
  updateCacheStatus();
  navigate(address);
}

// UI Helpers
function showSidebarLoading() {
  elements.sidebarLoading.style.display = 'flex';
  elements.sidebarEmpty.style.display = 'none';
  elements.entries.innerHTML = '';
  elements.warrenInfo.style.display = 'none';
}

function hideSidebarLoading() {
  elements.sidebarLoading.style.display = 'none';
}

function hideAllContent() {
  elements.welcome.style.display = 'none';
  elements.contentLoading.style.display = 'none';
  elements.contentError.style.display = 'none';
  elements.contentDisplay.style.display = 'none';
  elements.burrowDisplay.style.display = 'none';
  elements.contentHeader.style.display = 'none';
}

function showError(message) {
  hideSidebarLoading();
  hideAllContent();
  elements.contentError.style.display = 'flex';
  elements.errorMessage.textContent = message;
  setStatus('Error');
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function updateCacheStatus() {
  elements.cacheStatus.textContent = `Cache: ${state.cache.size} items`;
}

// Formatting utilities
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch (e) {
    return dateStr;
  }
}

function extractVersion(specVersion) {
  if (!specVersion) return 'Unknown';
  const match = specVersion.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : specVersion;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
