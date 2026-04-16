// Hysteria Panel - Frontend JS

const THEME_STORAGE_KEY = 'celerity-theme';

function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
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

console.log('⚡ Hysteria Panel loaded');
