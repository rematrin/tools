// music-header.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const DEFAULT_MUSIC_HEADER_HTML = `<style>
    /* Стили отдельной шапки для Music */
    .vk-header {
        background-color: var(--card-bg);
        border-bottom: 1px solid var(--border);
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 56px;
        z-index: 1000;
        box-sizing: border-box;
        transition: background 0.3s ease, border-color 0.3s ease;
    }

    .vk-header-content {
        max-width: 1080px;
        margin: 0 auto;
        height: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 8px 0 0;
    }

    /* ЛЕВАЯ ЧАСТЬ - ЛОГОТИП */
    .header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 100%;
    }

    .vk-header-logo {
        display: flex;
        align-items: center;
        text-decoration: none;
        height: 100%;
        margin-left: 0;
        transition: opacity 0.2s ease;
    }

    .vk-header-logo:hover {
        opacity: 0.85;
    }

    .logo-img {
        height: 33px;
        width: auto;
        display: block;
        object-fit: contain;
    }

    .logo-img.logo-dark {
        display: none;
    }

    body.dark .logo-img.logo-light,
    html.dark .logo-img.logo-light {
        display: none;
    }

    body.dark .logo-img.logo-dark,
    html.dark .logo-img.logo-dark {
        display: block;
    }

    /* ПРАВАЯ ЧАСТЬ */
    .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 100%;
    }

    /* Профиль (без текстового имени, только аватарка) */
    .vk-profile {
        display: flex;
        align-items: center;
        cursor: pointer;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 10px;
        transition: background 0.2s ease;
        height: 36px;
    }

    .vk-profile:hover {
        background-color: var(--hover-bg);
    }

    .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background-color: var(--border);
        object-fit: cover;
    }
</style>

<header class="vk-header">
    <div class="vk-header-content">

        <div class="header-left">
            <a href="music.html#home" class="vk-header-logo" title="Главная музыки">
                <img src="img/music_logo.png" alt="Music" class="logo-img logo-light">
                <img src="img/music_logo_dark.png" alt="Music" class="logo-img logo-dark">
            </a>
        </div>

        <div class="header-right">
            <div class="vk-profile" id="profile-container">
                <img src="https://i.ibb.co/Z6vRKK9x/0000000.jpg" alt="Profile" class="user-avatar" id="user-avatar">
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style="opacity: 0.5; stroke: var(--text);">
                    <path d="M1 1.5L6 6.5L11 1.5" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </div>
        </div>

    </div>
</header>`;

function updateHeaderData(user) {
    const avatarEl = document.getElementById('user-avatar');

    if (!avatarEl) return;

    if (user) {
        if (user.photoURL) {
            avatarEl.src = user.photoURL;
        } else {
            const letter = user.displayName ? user.displayName[0].toUpperCase() : "U";
            avatarEl.src = `https://via.placeholder.com/32/CCCCCC/FFFFFF?text=${letter}`;
        }
    } else {
        avatarEl.src = "https://i.ibb.co/Z6vRKK9x/0000000.jpg";
    }
    avatarEl.style.display = "block";
}

function setupHeaderEvents() {
    const profileBtn = document.getElementById('profile-container');
    if (profileBtn && !profileBtn.dataset.listenerAttached) {
        profileBtn.dataset.listenerAttached = 'true';
        profileBtn.addEventListener('click', function () {
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal(this);
            } else {
                console.warn("Auth widget еще не загрузился");
            }
        });
    }

    const logoBtn = document.querySelector('.vk-header-logo');
    if (logoBtn && !logoBtn.dataset.listenerAttached) {
        logoBtn.dataset.listenerAttached = 'true';
        logoBtn.addEventListener('click', function (e) {
            if (window.location.pathname.endsWith('music.html') || window.location.pathname.endsWith('/music.html') || window.location.pathname.endsWith('music')) {
                e.preventDefault();
                window.location.hash = '#home';
            }
        });
    }

    if (window.currentUser !== undefined) {
        updateHeaderData(window.currentUser);
    }
}

function mountHeader(data) {
    const container = document.getElementById('header-container');
    if (container && !document.getElementById('vk-top-player')) {
        if (!container.innerHTML.trim() || container.getAttribute('data-header-html') !== data) {
            container.innerHTML = data;
            container.setAttribute('data-header-html', data);
        }
    }
    setupHeaderEvents();
}

// 1. Инициализация событий шапки
setupHeaderEvents();

// 2. Фоновое обновление профиля и событий
try {
    setupHeaderEvents();
} catch (e) {}

// 3. Подписка на изменение авторизации
window.addEventListener('authChanged', (e) => {
    updateHeaderData(e.detail ? e.detail.user : null);
});

try {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        updateHeaderData(user);
    });
} catch (e) {
    // Инициализация Firebase отслеживается через auth-widget.js
}
