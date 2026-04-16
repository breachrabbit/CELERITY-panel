// Hidden Rabbit Panel - Frontend JS

const THEME_STORAGE_KEY = 'hidden-rabbit-theme';
const LEGACY_THEME_STORAGE_KEY = 'celerity-theme';
const SIDEBAR_STORAGE_KEY = 'hidden-rabbit-sidebar-collapsed';
const LEGACY_SIDEBAR_STORAGE_KEY = 'celerity-sidebar-collapsed';

function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    return ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
}

function getPreferredSidebarState() {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) || localStorage.getItem(LEGACY_SIDEBAR_STORAGE_KEY);
}

function resolveTheme(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode, persist = false) {
    const root = document.documentElement;
    const resolved = resolveTheme(mode);
    root.dataset.theme = resolved;
    root.dataset.themeChoice = mode;
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.themeChoice === mode);
    });
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', resolved === 'dark' ? '#050A3C' : '#ffffff');
    }
    if (persist) {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
}

function initTheme() {
    const mode = getPreferredTheme();
    applyTheme(mode);
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
        btn.addEventListener('click', () => applyTheme(btn.dataset.themeChoice, true));
    });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => {
        if (getPreferredTheme() === 'system') {
            applyTheme('system');
        }
    };
    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', syncSystemTheme);
    } else if (typeof media.addListener === 'function') {
        media.addListener(syncSystemTheme);
    }
}

function stabilizeLayout() {
    const root = document.documentElement;
    root.classList.add('layout-stabilizing');
    syncShellDimensions();
    void document.body.offsetWidth;
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            syncShellDimensions();
            root.classList.remove('layout-stabilizing');
        });
    });
}

function syncShellDimensions() {
    const root = document.documentElement;
    const app = document.querySelector('.app');
    const content = document.querySelector('.content');

    if (!app || !content || window.innerWidth <= 768) {
        root.style.removeProperty('--shell-sidebar-height');
        return;
    }

    const targetHeight = Math.max(
        window.innerHeight,
        Math.ceil(app.scrollHeight || 0),
        Math.ceil(content.scrollHeight || 0),
        Math.ceil(content.getBoundingClientRect().height || 0)
    );

    root.style.setProperty('--shell-sidebar-height', `${targetHeight}px`);
}

function initLayoutStability() {
    window.addEventListener('load', stabilizeLayout);
    window.addEventListener('pageshow', stabilizeLayout);
    window.addEventListener('resize', syncShellDimensions);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') stabilizeLayout();
    });
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => stabilizeLayout()).catch(() => {});
    }
    if (typeof ResizeObserver !== 'undefined') {
        const content = document.querySelector('.content');
        if (content) {
            const observer = new ResizeObserver(() => syncShellDimensions());
            observer.observe(content);
        }
    }
}

function setSidebarCollapsed(collapsed, persist = false) {
    const root = document.documentElement;
    root.classList.toggle('sidebar-collapsed', collapsed);
    const toggle = document.getElementById('sidebarToggle');
    if (toggle) {
        const collapseLabel = toggle.dataset.labelCollapse || 'Collapse';
        const expandLabel = toggle.dataset.labelExpand || 'Expand';
        toggle.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
        toggle.setAttribute('title', collapsed ? expandLabel : collapseLabel);
        const icon = toggle.querySelector('i');
        const label = toggle.querySelector('.sidebar-toggle-label');
        if (icon) {
            icon.className = collapsed ? 'ti ti-chevrons-right' : 'ti ti-chevrons-left';
        }
        if (label) {
            label.textContent = collapsed ? expandLabel : collapseLabel;
        }
    }
    if (persist) {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    }
    stabilizeLayout();
}

function initSidebar() {
    const toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;
    const shouldCollapse = getPreferredSidebarState() === '1' && window.innerWidth > 768;
    setSidebarCollapsed(shouldCollapse, false);
    toggle.addEventListener('click', () => {
        if (window.innerWidth <= 768) return;
        setSidebarCollapsed(!document.documentElement.classList.contains('sidebar-collapsed'), true);
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
            document.documentElement.classList.remove('sidebar-collapsed');
        } else {
            const collapsed = getPreferredSidebarState() === '1';
            document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
        }
        syncShellDimensions();
    });
}

// Format bytes to human readable
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Toast notification
window.showToast = function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
};

// Confirm before dangerous actions
document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', (e) => {
        if (!confirm(el.dataset.confirm)) {
            e.preventDefault();
        }
    });
});

initTheme();
initSidebar();
initLayoutStability();

console.log('Hidden Rabbit Panel loaded');
