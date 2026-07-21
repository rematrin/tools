// nav-widget.js

const servicesLinks = [
    // Обычные иконки (линейные, stroke)
    {
        href: "index.html",
        title: "Главная",
        icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
    },
    {
        href: "creatorhub.html",
        title: "CreatorHub",
        icon: '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>'
    },
    {
        href: "calc.html", title: "Умные калькуляторы",
        icon: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>'
    },
    {
        href: "fx_converter.html", title: "Конвертер валют",
        icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
    },
    {
        href: "clock.html", title: "Мировые часы",
        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
    },
    {
        href: "thumbnail.html", title: "YouTube превью",
        icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
    },

    {
        href: "case_converter.html", title: "Конвертер регистров",
        icon: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>'
    },
    {
        href: "income_dis.html", title: "Распределитель дохода",
        icon: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>'
    },
    {
        href: "mp3_cover.html", title: "Обложка из MP3",
        icon: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>'
    },
    {
        href: "home.html", title: "Home (beta)",
        filled: true,
        icon: '<path d="M10.875 3.375H3.75c-.206 0-.375.169-.375.375v7.125c0 .206.169.375.375.375h7.125c.206 0 .375-.169.375-.375V3.75c0-.206-.169-.375-.375-.375zm-1.219 6.281H4.969V4.969h4.688v4.688zm10.594-6.281h-7.125c-.206 0-.375.169-.375.375v7.125c0 .206.169.375.375.375h7.125c.206 0 .375-.169.375-.375V3.75c0-.206-.169-.375-.375-.375zm-1.219 6.281h-4.688V4.969h4.688v4.688zM10.875 12.75H3.75c-.206 0-.375.169-.375.375v7.125c0 .206.169.375.375.375h7.125c.206 0 .375-.169.375-.375v-7.125c0-.206-.169-.375-.375-.375zm-1.219 6.281H4.969v-4.688h4.688v4.688zm10.594-6.281h-7.125c-.206 0-.375.169-.375.375v7.125c0 .206.169.375.375.375h7.125c.206 0 .375-.169.375-.375v-7.125c0-.206-.169-.375-.375-.375zm-1.219 6.281h-4.688v-4.688h4.688v4.688z"/>'
    },

    {
        href: "todo.html", title: "Туду лист",
        icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'
    },
    {
        href: "folderico.html", title: "Folder Icon Maker",
        icon: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>'
    },

    {
        href: "eleven_reader.html", title: "Eleven Reader",
        icon: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>'
    },
    {
        href: "bookmarks.html", title: "Мои закладки",
        icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>'
    },
    {
        href: "playlists.html", title: "YouTube Плейлисты",
        icon: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>'
    },


];

const linksHTML = servicesLinks.map(link => {
    // Если иконка залитая (filled), ставим fill=currentColor, иначе stroke=currentColor
    const svgAttrs = link.filled
        ? 'fill="currentColor" stroke="none"'
        : 'fill="none" stroke="currentColor"';

    return `
    <a href="${link.href}" class="vk-menu-grid-item">
        <svg class="vk-menu-grid-icon" viewBox="0 0 24 24" ${svgAttrs} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${link.icon}
        </svg>
        <span class="vk-menu-grid-text">${link.title}</span>
    </a>
    `;
}).join('');

const navModalHTML = `
<div class="auth-overlay" id="navOverlay">
    <div class="auth-modal nav-grid-modal" id="navModal">
        <div class="vk-menu-grid">
            ${linksHTML}
        </div>
    </div>
</div>
`;

function initNavWidget() {
    document.body.insertAdjacentHTML('beforeend', navModalHTML);

    const overlay = document.getElementById('navOverlay');
    const modal = document.getElementById('navModal');
    let activeTrigger = null;

    const recalcPosition = () => {
        if (activeTrigger && overlay.classList.contains('open')) {
            const rect = activeTrigger.getBoundingClientRect();
            modal.style.top = (rect.bottom + 8) + 'px';

            const centerX = window.innerWidth / 2;
            if (rect.left < centerX) {
                modal.style.left = rect.left + 'px';
                modal.style.right = 'auto';
                modal.style.transformOrigin = 'top left';
            } else {
                const rightPos = window.innerWidth - rect.right;
                modal.style.right = rightPos + 'px';
                modal.style.left = 'auto';
                modal.style.transformOrigin = 'top right';
            }
        }
    };

    const closeModal = () => {
        overlay.classList.remove('open');
        window.removeEventListener('resize', recalcPosition);
        activeTrigger = null;
    };

    window.openNavModal = (triggerElement) => {
        // Закрываем окно авторизации если открыто
        const authOverlay = document.getElementById('authOverlay');
        if (authOverlay && authOverlay.classList.contains('open')) {
            const closeBtn = document.getElementById('authClose');
            if (closeBtn) closeBtn.click();
        }

        if (overlay.classList.contains('open')) {
            closeModal();
            return;
        }

        activeTrigger = triggerElement;
        overlay.classList.add('open');
        recalcPosition();
        window.addEventListener('resize', recalcPosition);
    };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

initNavWidget();