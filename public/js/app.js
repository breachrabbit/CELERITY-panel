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
    syncShellDimensions();
    requestAnimationFrame(() => {
        syncShellDimensions();
    });
}

function initSidebar() {
    const toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;
    const shouldCollapse = getPreferredSidebarState() === '1' && window.innerWidth > 768;
    setSidebarCollapsed(shouldCollapse, false);
    toggle.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            if (typeof window.toggleMobileMenu === 'function') {
                window.toggleMobileMenu(false);
            }
            return;
        }
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

function getUiConfirmLocale() {
    const lang = String(document.documentElement.getAttribute('lang') || '').toLowerCase();
    const isRu = lang.startsWith('ru');
    return {
        title: isRu ? 'Подтверждение действия' : 'Confirm action',
        confirm: isRu ? 'Подтвердить' : 'Confirm',
        cancel: isRu ? 'Отмена' : 'Cancel',
        ok: isRu ? 'ОК' : 'OK',
    };
}

function ensureUiConfirmModal() {
    if (document.getElementById('hrUiConfirmModal')) return;
    const i18n = getUiConfirmLocale();
    const modal = document.createElement('div');
    modal.id = 'hrUiConfirmModal';
    modal.className = 'hr-confirm-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="hr-confirm-backdrop" data-confirm-close></div>
        <div class="hr-confirm-card" role="dialog" aria-modal="true" aria-labelledby="hrConfirmTitle">
            <div class="hr-confirm-head">
                <h3 id="hrConfirmTitle">${i18n.title}</h3>
                <button type="button" class="hr-confirm-close" data-confirm-close aria-label="${i18n.cancel}">
                    <i class="ti ti-x"></i>
                </button>
            </div>
            <div class="hr-confirm-body" id="hrConfirmMessage"></div>
            <div class="hr-confirm-actions">
                <button type="button" class="btn" id="hrConfirmCancel">${i18n.cancel}</button>
                <button type="button" class="btn btn-primary" id="hrConfirmAccept">${i18n.confirm}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.hrConfirm = function hrConfirm(message, options = {}) {
    ensureUiConfirmModal();
    const modal = document.getElementById('hrUiConfirmModal');
    const titleEl = document.getElementById('hrConfirmTitle');
    const msgEl = document.getElementById('hrConfirmMessage');
    const cancelBtn = document.getElementById('hrConfirmCancel');
    const acceptBtn = document.getElementById('hrConfirmAccept');
    const closeEls = modal.querySelectorAll('[data-confirm-close]');
    const i18n = getUiConfirmLocale();
    const title = String(options.title || i18n.title);
    const confirmText = String(options.confirmText || i18n.confirm);
    const cancelText = String(options.cancelText || i18n.cancel);
    const hideCancel = options.hideCancel === true;

    titleEl.textContent = title;
    msgEl.textContent = String(message || '');
    acceptBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    cancelBtn.style.display = hideCancel ? 'none' : '';
    closeEls.forEach((el) => {
        el.style.display = hideCancel ? 'none' : '';
    });
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-ui-confirm-open');

    return new Promise((resolve) => {
        let finished = false;

        const cleanup = (result) => {
            if (finished) return;
            finished = true;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('has-ui-confirm-open');
            acceptBtn.removeEventListener('click', onAccept);
            cancelBtn.removeEventListener('click', onCancel);
            closeEls.forEach((el) => el.removeEventListener('click', onCancel));
            document.removeEventListener('keydown', onKeydown);
            resolve(result);
        };

        const onAccept = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onKeydown = (event) => {
            if (event.key === 'Escape' && !hideCancel) onCancel();
            if (event.key === 'Enter') onAccept();
        };

        acceptBtn.addEventListener('click', onAccept);
        cancelBtn.addEventListener('click', onCancel);
        closeEls.forEach((el) => el.addEventListener('click', onCancel));
        document.addEventListener('keydown', onKeydown);

        setTimeout(() => {
            acceptBtn.focus();
        }, 0);
    });
};

window.hrAlert = function hrAlert(message, options = {}) {
    const i18n = getUiConfirmLocale();
    return window.hrConfirm(message, {
        ...options,
        confirmText: options.confirmText || i18n.ok,
        hideCancel: true,
    });
};

// Confirm before dangerous actions (in-app modal, not native browser confirm)
document.querySelectorAll('[data-confirm]').forEach((el) => {
    el.addEventListener('click', async (e) => {
        if (el.dataset.hrConfirmBypass === '1') {
            delete el.dataset.hrConfirmBypass;
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const ok = await window.hrConfirm(el.dataset.confirm || '');
        if (!ok) return;

        const tag = String(el.tagName || '').toLowerCase();
        const type = String(el.getAttribute('type') || '').toLowerCase();

        if (tag === 'a' && el.href) {
            window.location.href = el.href;
            return;
        }

        if ((tag === 'button' || tag === 'input') && type === 'submit' && el.form) {
            if (typeof el.form.requestSubmit === 'function') {
                el.form.requestSubmit(el);
            } else {
                el.form.submit();
            }
            return;
        }

        el.dataset.hrConfirmBypass = '1';
        el.click();
    });
});

initTheme();
initSidebar();
initLayoutStability();

console.log('Hidden Rabbit Panel loaded');
