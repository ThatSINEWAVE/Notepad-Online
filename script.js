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
    let draggedTab = null;

    // Initialize tabs
    initTabs();

    // Event listeners for tab system
    newTabBtn.addEventListener('click', function() {
        createNewTab();
    });

    // Setup drag and drop for tabs container
    setupTabDragAndDrop();

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

    // Setup drag and drop functionality for tabs
    function setupTabDragAndDrop() {
        tabsContainer.addEventListener('dragover', function(e) {
            e.preventDefault();
            const target = getTabElementFromPoint(e.clientX, e.clientY);
            if (target && target !== draggedTab) {
                const targetRect = target.getBoundingClientRect();
                const targetCenter = targetRect.left + targetRect.width / 2;

                if (e.clientX < targetCenter) {
                    // Insert before
                    tabsContainer.insertBefore(draggedTab, target);
                } else {
                    // Insert after
                    tabsContainer.insertBefore(draggedTab, target.nextSibling);
                }

                // Update tabs array to match DOM order
                updateTabsOrder();
            }
        });
    }

    function getTabElementFromPoint(x, y) {
        const elements = document.elementsFromPoint(x, y);
        for (const element of elements) {
            if (element.classList.contains('tab')) {
                return element;
            }
        }
        return null;
    }

    function updateTabsOrder() {
        const newOrder = [];
        document.querySelectorAll('.tab').forEach(tabElement => {
            const tabId = tabElement.dataset.tabId;
            const tab = tabs.find(t => t.id === tabId);
            if (tab) {
                newOrder.push(tab);
            }
        });

        tabs = newOrder;
        saveTabs();
    }

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
        // If title is exactly DEFAULT_FILE_NAME, make it unique
        if (title === DEFAULT_FILE_NAME) {
            // Check if we need to add a number
            const untitledTabs = tabs.filter(tab =>
                tab.title === DEFAULT_FILE_NAME ||
                tab.title.match(new RegExp(`^${DEFAULT_FILE_NAME} \\(\\d+\\)$`))
            );

            if (untitledTabs.length > 0) {
                title = `${DEFAULT_FILE_NAME} (${untitledTabs.length})`;
            }
        }

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
        tabElement.draggable = true;
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

        // Add double click event for renaming
        const titleElement = tabElement.querySelector('.tab-title');
        titleElement.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            startTabRename(tab.id);
        });

        // Add click event for tab closing
        const closeBtn = tabElement.querySelector('.tab-close');
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeTab(tab.id);
        });

        // Add drag events
        tabElement.addEventListener('dragstart', function(e) {
            draggedTab = tabElement;
            e.dataTransfer.effectAllowed = 'move';
            // Add a class for styling
            setTimeout(() => tabElement.classList.add('dragging'), 0);
        });

        tabElement.addEventListener('dragend', function() {
            draggedTab = null;
            tabElement.classList.remove('dragging');
        });
        // Remove the new tab button before appending the new tab
        if (tabsContainer.contains(newTabBtn)) {
            tabsContainer.removeChild(newTabBtn);
        }
        // Append the new tab, then re-append the new tab button
        tabsContainer.appendChild(tabElement);
        tabsContainer.appendChild(newTabBtn);
        }

    function startTabRename(tabId) {
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (!tabElement) return;

        const titleElement = tabElement.querySelector('.tab-title');
        const currentTitle = titleElement.textContent;

        // Create an input element
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.className = 'tab-title-input';
        inputElement.value = currentTitle;

        // Replace the title with the input
        titleElement.style.display = 'none';
        tabElement.insertBefore(inputElement, titleElement);

        // Focus and select all text
        inputElement.focus();
        inputElement.select();

        // Handle input blur (commit rename)
        inputElement.addEventListener('blur', function() {
            finishTabRename(tabId, inputElement.value);
        });

        // Handle Enter key
        inputElement.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                inputElement.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                inputElement.value = currentTitle;
                inputElement.blur();
            }
        });

        // Prevent clicks from propagating while renaming
        inputElement.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    function finishTabRename(tabId, newTitle) {
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (!tabElement) return;

        const titleElement = tabElement.querySelector('.tab-title');
        const inputElement = tabElement.querySelector('.tab-title-input');

        if (!inputElement) return;

        // Apply new title if not empty
        newTitle = newTitle.trim();
        if (newTitle === '') {
            newTitle = DEFAULT_FILE_NAME;
        }

        // Update title and save
        updateTabTitle(tabId, newTitle);

        // Remove input and show title
        inputElement.remove();
        titleElement.style.display = '';
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
        const text = editor.value;
        const lines = text.split('\n');
        const editorWidth = editor.clientWidth;
        const computedStyle = window.getComputedStyle(editor);
        const lineHeight = parseFloat(computedStyle.lineHeight);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);
        const paddingRight = parseFloat(computedStyle.paddingRight);
        const availableWidth = editorWidth - paddingLeft - paddingRight;

        // Get font details
        const fontSize = parseFloat(computedStyle.fontSize);
        const fontFamily = computedStyle.fontFamily;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `${fontSize}px ${fontFamily}`;

        // Clear existing line numbers
        lineNumbers.innerHTML = '';

        // Create a document fragment for better performance
        const fragment = document.createDocumentFragment();

        // Keep track of actual line count (for line number)
        let actualLineCount = 0;

        lines.forEach((line, index) => {
            // Measure line width and determine wrapping
            const lineWidth = context.measureText(line).width;
            const wrappedLines = Math.ceil(lineWidth / availableWidth);

            // Create line number for the first physical line
            actualLineCount++;
            const lineNumberElement = document.createElement('div');
            lineNumberElement.textContent = actualLineCount;
            lineNumberElement.className = 'line-number';
            fragment.appendChild(lineNumberElement);

            // Add empty line numbers for wrapped lines
            for (let i = 1; i < wrappedLines; i++) {
                const emptyLineElement = document.createElement('div');
                emptyLineElement.textContent = ''; // No number for wrapped lines
                emptyLineElement.className = 'line-number';
                fragment.appendChild(emptyLineElement);
            }
        });

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
        const blob = new Blob([content], {
            type: 'text/plain'
        });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = tab.title.endsWith('.txt') ? tab.title : tab.title + '.txt';
        a.click();

        URL.revokeObjectURL(url);
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