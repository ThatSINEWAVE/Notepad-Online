document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const editor = document.getElementById('editor');
    const lineNumbers = document.getElementById('lineNumbers');
    const wordCountEl = document.getElementById('wordCount');
    const charCountEl = document.getElementById('charCount');
    const lineCountEl = document.getElementById('lineCount');
    const newBtn = document.getElementById('newBtn');
    const openBtn = document.getElementById('openBtn');
    const saveBtn = document.getElementById('saveBtn');
    const fileInput = document.getElementById('file-input');
    const notification = document.getElementById('notification');
    const tabsContainer = document.getElementById('tabsContainer');
    const newTabBtn = document.getElementById('newTabBtn');

    // Variables
    let saveTimeout;
    const AUTOSAVE_DELAY = 1000; // 1 second
    const STORAGE_KEY_PREFIX = 'minimalist_notepad_';
    const TABS_KEY = 'minimalist_notepad_tabs';
    const DEFAULT_FILE_NAME = 'Untitled';
    let tabs = [];
    let activeTabId = null;

    // Initialize tabs
    initTabs();

    // Event listeners for tab system
    newTabBtn.addEventListener('click', createNewTab);

    // Editor event listeners
    editor.addEventListener('input', function() {
        updateLineNumbers();
        updateStats();
        scheduleAutosave();
    });

    editor.addEventListener('scroll', function() {
        lineNumbers.scrollTop = editor.scrollTop;
    });

    editor.addEventListener('mouseup', function() {
        if (window.getSelection().toString().length > 0) {
            updateStatsForSelection();
        } else {
            updateStats();
        }
    });

    editor.addEventListener('keyup', function(e) {
        if (e.key === 'Escape') {
            window.getSelection().removeAllRanges();
            updateStats();
        }

        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveToFile();
        }

        // Create new tab with Ctrl+T
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            createNewTab();
        }

        // Close current tab with Ctrl+W
        if (e.ctrlKey && e.key === 'w') {
            e.preventDefault();
            if (tabs.length > 1) {
                closeTab(activeTabId);
            }
        }
    });

    newBtn.addEventListener('click', function() {
        if (confirm('Create a new document? Unsaved changes will be lost.')) {
            clearCurrentTab();
        }
    });

    openBtn.addEventListener('click', function() {
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                // Create a new tab for the opened file if there's already content
                const activeTab = getActiveTab();
                if (activeTab.content.trim() !== '') {
                    createNewTab(file.name);
                } else {
                    updateTabTitle(activeTabId, file.name);
                }

                editor.value = e.target.result;
                saveTabContent();
                updateLineNumbers();
                updateStats();
                showNotification('File loaded successfully!');
            };
            reader.readAsText(file);
        }
    });

    saveBtn.addEventListener('click', saveToFile);

    // Tab system functions
    function initTabs() {
        // Try to load tabs from localStorage
        const savedTabs = localStorage.getItem(TABS_KEY);

        if (savedTabs) {
            tabs = JSON.parse(savedTabs);
            // If there are saved tabs, restore them
            if (tabs.length > 0) {
                // Render all tabs
                tabs.forEach(tab => {
                    renderTab(tab);
                });

                // Set the active tab
                setActiveTab(tabs[0].id);
                return;
            }
        }

        // If no saved tabs or error, create a default tab
        tabs = [];
        createNewTab();
    }

    function createNewTab(title = DEFAULT_FILE_NAME) {
        const tabId = 'tab_' + Date.now();
        const newTab = {
            id: tabId,
            title: title,
            content: ''
        };

        tabs.push(newTab);
        renderTab(newTab);
        setActiveTab(tabId);
        saveTabs();

        // Clear editor
        editor.value = '';
        updateLineNumbers();
        updateStats();

        // Focus editor
        editor.focus();
    }

    function renderTab(tab) {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tab.id;
        tabElement.innerHTML = `
            <span class="tab-title">${tab.title}</span>
            <span class="tab-close" title="Close tab">×</span>
        `;

        // Add click event for tab selection
        tabElement.addEventListener('click', function(e) {
            // Don't switch tabs if clicking on the close button
            if (!e.target.classList.contains('tab-close')) {
                setActiveTab(tab.id);
            }
        });

        // Add click event for tab closing
        const closeBtn = tabElement.querySelector('.tab-close');
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeTab(tab.id);
        });

        tabsContainer.appendChild(tabElement);
    }

    function setActiveTab(tabId) {
        // Save current tab content if there is an active tab
        if (activeTabId) {
            saveTabContent();
        }

        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Add active class to selected tab
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.classList.add('active');

            // Ensure the tab is visible (scroll if needed)
            const tabRect = tabElement.getBoundingClientRect();
            const containerRect = tabsContainer.getBoundingClientRect();

            if (tabRect.right > containerRect.right) {
                tabsContainer.scrollLeft += (tabRect.right - containerRect.right);
            } else if (tabRect.left < containerRect.left) {
                tabsContainer.scrollLeft -= (containerRect.left - tabRect.left);
            }
        }

        // Set active tab ID
        activeTabId = tabId;

        // Load tab content
        loadTabContent();
    }

    function closeTab(tabId) {
        const tabIndex = tabs.findIndex(tab => tab.id === tabId);

        if (tabIndex === -1) return;

        // If this is the last tab, create a new one first
        if (tabs.length === 1) {
            createNewTab();
        }

        // Remove the tab from DOM
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.remove();
        }

        // Remove the tab from the array
        tabs.splice(tabIndex, 1);

        // If closing the active tab, set a new active tab
        if (tabId === activeTabId) {
            // Choose the previous tab, or the first one if there is no previous
            const newActiveIndex = Math.max(0, tabIndex - 1);
            setActiveTab(tabs[newActiveIndex].id);
        }

        // Save tabs
        saveTabs();

        // Remove tab content from localStorage
        localStorage.removeItem(STORAGE_KEY_PREFIX + tabId);
    }

    function getActiveTab() {
        return tabs.find(tab => tab.id === activeTabId);
    }

    function updateTabTitle(tabId, title) {
        // Update tab in array
        const tab = tabs.find(tab => tab.id === tabId);
        if (tab) {
            tab.title = title;
        }

        // Update tab in DOM
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabElement) {
            const titleElement = tabElement.querySelector('.tab-title');
            if (titleElement) {
                titleElement.textContent = title;
            }
        }

        // Save tabs
        saveTabs();
    }

    function saveTabs() {
        localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    }

    function saveTabContent() {
        if (!activeTabId) return;

        const tab = getActiveTab();
        if (tab) {
            tab.content = editor.value;
            localStorage.setItem(STORAGE_KEY_PREFIX + activeTabId, editor.value);
            saveTabs();
        }
    }

    function loadTabContent() {
        if (!activeTabId) return;

        const tab = getActiveTab();
        if (tab) {
            // First try to load from localStorage (more reliable with large content)
            const savedContent = localStorage.getItem(STORAGE_KEY_PREFIX + activeTabId);
            if (savedContent !== null) {
                editor.value = savedContent;
            } else {
                // Fall back to content in the tab object
                editor.value = tab.content || '';
            }

            // Update document stats and line numbers
            updateLineNumbers();
            updateStats();
        }
    }

    function clearCurrentTab() {
        editor.value = '';
        saveTabContent();
        updateLineNumbers();
        updateStats();
        editor.focus();
    }

    // Line numbers and stats functions
    function updateLineNumbers() {
        const lines = editor.value.split('\n');
        const lineCount = lines.length;

        // Clear existing line numbers
        lineNumbers.innerHTML = '';

        // Create a document fragment for better performance
        const fragment = document.createDocumentFragment();

        for (let i = 1; i <= lineCount; i++) {
            const lineNumberElement = document.createElement('div');
            lineNumberElement.textContent = i;
            lineNumberElement.className = 'line-number';
            fragment.appendChild(lineNumberElement);
        }

        lineNumbers.appendChild(fragment);
    }

    function updateStats() {
        const text = editor.value;
        const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        const charCount = text.length;
        const lineCount = text.split('\n').length;

        wordCountEl.textContent = wordCount + (wordCount === 1 ? ' word' : ' words');
        charCountEl.textContent = charCount + (charCount === 1 ? ' character' : ' characters');
        lineCountEl.textContent = lineCount + (lineCount === 1 ? ' line' : ' lines');
    }

    function updateStatsForSelection() {
        const selection = window.getSelection().toString();
        if (selection.length > 0) {
            const wordCount = selection.trim() === '' ? 0 : selection.trim().split(/\s+/).length;
            const charCount = selection.length;
            const lineCount = selection.split('\n').length;

            wordCountEl.textContent = wordCount + (wordCount === 1 ? ' word selected' : ' words selected');
            charCountEl.textContent = charCount + (charCount === 1 ? ' character selected' : ' characters selected');
            lineCountEl.textContent = lineCount + (lineCount === 1 ? ' line selected' : ' lines selected');
        }
    }

    function scheduleAutosave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(function() {
            saveTabContent();
        }, AUTOSAVE_DELAY);
    }

    function saveToFile() {
        const tab = getActiveTab();
        const content = editor.value;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = tab.title.endsWith('.txt') ? tab.title : tab.title + '.txt';
        a.click();

        URL.revoObjectURL(url);
        showNotification('File saved successfully!');
    }

    function showNotification(message) {
        notification.textContent = message;
        notification.classList.add('show');

        setTimeout(function() {
            notification.classList.remove('show');
        }, 2000);
    }

    // Handle window resize
    window.addEventListener('resize', updateLineNumbers);
});