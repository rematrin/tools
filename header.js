// header.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const DEFAULT_HEADER_HTML = `<style>
    /* Стили шапки */
    .vk-header {
        background-color: var(--card-bg);
        border-bottom: 1px solid var(--border);
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 50px;
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
        padding: 0 20px;
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
        margin-left: 8px;
        transition: opacity 0.2s ease;
    }

    .vk-header-logo:hover {
        opacity: 0.85;
    }

    .logo-img {
        height: 30px;
        width: auto;
        display: block;
        object-fit: contain;
    }

    /* ПРАВАЯ ЧАСТЬ */
    .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 100%;
    }

    /* Кнопка темы */
    .theme-icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        color: var(--text);
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
        background: transparent;
        border: none;
        padding: 0;
    }

    .theme-icon-btn:hover {
        background-color: var(--hover-bg);
        color: var(--accent);
    }

    /* Профиль */
    .vk-profile {
        display: flex;
        align-items: center;
        cursor: pointer;
        gap: 10px;
        padding: 4px 8px;
        border-radius: 10px;
        transition: background 0.2s ease;
        height: 36px;
    }

    .vk-profile:hover {
        background-color: var(--hover-bg);
    }

    .user-name {
        font-weight: 600;
        font-size: 14px;
        color: var(--text);
        display: block;
        white-space: nowrap;
    }

    .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background-color: var(--border);
        object-fit: cover;
    }

    @media (max-width: 768px) {
        .user-name {
            display: none;
        }
    }
</style>

<header class="vk-header">
    <div class="vk-header-content">

        <div class="header-left">
            <a href="index.html" class="vk-header-logo" title="Главная">
                <img src="img/Retools_logo.png" alt="Retools" class="logo-img">
            </a>
        </div>

        <div class="header-right">
            <div class="vk-profile" id="profile-container">
                <span class="user-name" id="user-name"></span>
                <img src="" alt="" class="user-avatar" id="user-avatar" style="display:none">
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style="opacity: 0.5; stroke: var(--text);">
                    <path d="M1 1.5L6 6.5L11 1.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </div>
        </div>

    </div>
</header>`;

function updateHeaderData(user) {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');

    if (!nameEl || !avatarEl) return;

    if (user) {
        nameEl.innerText = user.displayName || "Пользователь";
        if (user.photoURL) {
            avatarEl.src = user.photoURL;
        } else {
            const letter = user.displayName ? user.displayName[0] : "U";
            avatarEl.src = `https://via.placeholder.com/32/CCCCCC/FFFFFF?text=${letter}`;
        }
        avatarEl.style.display = "block";
    } else {
        nameEl.innerText = "Войти";
        avatarEl.src = "https://i.ibb.co/Z6vRKK9x/0000000.jpg";
        avatarEl.style.display = "block";
    }
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

    if (window.currentUser !== undefined) {
        updateHeaderData(window.currentUser);
    }
}

function mountHeader(data) {
    const container = document.getElementById('header-container');
    if (!container) return;

    if (!container.innerHTML.trim() || container.getAttribute('data-header-html') !== data) {
        container.innerHTML = data;
        container.setAttribute('data-header-html', data);
    }
    setupHeaderEvents();
}

// 1. Мгновенная отрисовка из кэша localStorage или шаблона по умолчанию без ожидания сетевого запроса
const initialHTML = localStorage.getItem('cached_header_html') || DEFAULT_HEADER_HTML;
mountHeader(initialHTML);

// 2. Фоновое обновление кэша при наличии изменений в header.html
fetch('header.html')
    .then(response => response.text())
    .then(data => {
        localStorage.setItem('cached_header_html', data);
        mountHeader(data);
    })
    .catch(error => console.error("Ошибка загрузки header.html:", error));

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