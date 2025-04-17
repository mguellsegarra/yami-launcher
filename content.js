// --- Global Variables ---
let fuse;
let bookmarks = [];
let searchResults = [];
let selectedIndex = 0;
let omnibarContainer;
let searchInput;
let resultsList;
let isOmnibarVisible = false;

// --- Helper Functions ---
function getFaviconUrl(url) {
  const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
  faviconUrl.searchParams.set("pageUrl", url);
  faviconUrl.searchParams.set("size", "32");
  return faviconUrl.toString();
}

// --- Message Listener (Top Level) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "pong" });
    return true;
  }
  if (request.action === "toggle") {
    toggleOmnibar();
    sendResponse({ status: isOmnibarVisible ? "shown" : "hidden" });
    return true;
  }
});

// --- Core Logic Functions ---
function handleVisibilityChange() {
  if (document.hidden && isOmnibarVisible) {
    hideOmnibar();
  }
}

function showOmnibar() {
  let justCreated = false;
  if (!omnibarContainer) {
    createOmnibarUI();
    justCreated = true;
  }

  omnibarContainer.style.display = "flex";
  searchInput.value = "";
  renderResults([]);
  searchInput.focus();
  document.addEventListener("keydown", handleGlobalKeys);
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  isOmnibarVisible = true;

  if (justCreated || !fuse) {
    fetchBookmarks();
  }
}

function hideOmnibar() {
  if (omnibarContainer) {
    omnibarContainer.style.display = "none";
    document.removeEventListener("keydown", handleGlobalKeys);
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    isOmnibarVisible = false;
  }
}

function toggleOmnibar() {
  if (isOmnibarVisible) {
    hideOmnibar();
  } else {
    showOmnibar();
  }
}

// --- UI Creation ---
function createOmnibarUI() {
  if (document.getElementById("bookmark-fuzzy-finder-container")) return;

  omnibarContainer = document.createElement("div");
  omnibarContainer.id = "bookmark-fuzzy-finder-container";
  omnibarContainer.style.display = "none";

  searchInput = document.createElement("input");
  searchInput.id = "bookmark-fuzzy-finder-input";
  searchInput.type = "text";
  searchInput.placeholder = "Search bookmarks...";

  resultsList = document.createElement("ul");
  resultsList.id = "bookmark-fuzzy-finder-results";

  omnibarContainer.appendChild(searchInput);
  omnibarContainer.appendChild(resultsList);
  document.body.appendChild(omnibarContainer);

  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", handleKeyboardNavigation);
}

// --- Event Handlers ---
function handleSearchInput(event) {
  const query = event.target.value.trim();
  selectedIndex = 0;

  if (!fuse) {
    searchResults = [];
    renderResults([]);
    return;
  }

  if (query) {
    searchResults = fuse.search(query);
    renderResults(searchResults);
  } else {
    searchResults = [];
    renderResults([]);
  }
}

function handleKeyboardNavigation(event) {
  if (!searchResults.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = (selectedIndex + 1) % searchResults.length;
    updateSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex =
      (selectedIndex - 1 + searchResults.length) % searchResults.length;
    updateSelection();
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
      const selectedBookmark = searchResults[selectedIndex].item;
      openBookmark(selectedBookmark.url);
      hideOmnibar();
    }
  }
}

function handleGlobalKeys(event) {
  if (event.key === "Escape" && isOmnibarVisible) {
    event.preventDefault();
    event.stopPropagation();
    hideOmnibar();
  }
}

function handleClickOutside(event) {
  if (
    isOmnibarVisible &&
    omnibarContainer &&
    !omnibarContainer.contains(event.target)
  ) {
    hideOmnibar();
  }
}

// --- UI Rendering ---
function renderResults(resultsToRender) {
  if (!resultsList) return;
  resultsList.innerHTML = "";

  resultsToRender.forEach((result, index) => {
    const li = document.createElement("li");
    li.dataset.originalIndex = index;

    if (index === selectedIndex) {
      li.classList.add("selected");
    }

    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.src = getFaviconUrl(result.item.url);
    favicon.width = 16;
    favicon.height = 16;
    favicon.alt = "";

    const titleSpan = document.createElement("span");
    titleSpan.className = "title";
    titleSpan.textContent = result.item.title || "";

    const urlSpan = document.createElement("span");
    urlSpan.className = "url";
    urlSpan.textContent = result.item.url;

    li.appendChild(favicon);
    li.appendChild(titleSpan);
    li.appendChild(urlSpan);

    li.addEventListener("click", () => {
      openBookmark(result.item.url);
      hideOmnibar();
    });
    li.addEventListener("mouseenter", () => {
      selectedIndex = index;
      updateSelection();
    });

    resultsList.appendChild(li);
  });

  updateSelection();
}

function updateSelection() {
  if (!resultsList) return;

  Array.from(resultsList.children).forEach((item) => {
    const itemIndex = parseInt(item.dataset.originalIndex, 10);
    const isSelected = itemIndex === selectedIndex;

    item.classList.toggle("selected", isSelected);
    if (isSelected) {
      item.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });
}

// --- Data Fetching & Initialization ---
function initializeFuse(bookmarkData) {
  const options = {
    keys: ["title", "url"],
    threshold: 0.4,
    includeScore: true,
  };
  if (typeof Fuse === "undefined") {
    hideOmnibar();
    return;
  }
  fuse = new Fuse(bookmarkData, options);
}

function fetchBookmarks() {
  chrome.runtime.sendMessage({ action: "getBookmarks" }, (response) => {
    if (chrome.runtime.lastError) {
      hideOmnibar();
      return;
    }
    if (response && response.bookmarks) {
      bookmarks = response.bookmarks;
      initializeFuse(bookmarks);
    } else {
      hideOmnibar();
    }
  });
}

// --- Actions ---
function openBookmark(url) {
  chrome.runtime.sendMessage({ action: "openBookmark", url: url });
}
