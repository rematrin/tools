// left-sidebar.js - Единое левое боковое меню (ВКонтакте стиль)

const sidebarHTML = `
<aside class="vk-sidebar">
  <nav class="vk-sidebar-nav">
    <a href="index.html" class="vk-sidebar-item">
      <svg class="vk-sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span class="vk-sidebar-text">Главная</span>
    </a>
    <a href="calc.html" class="vk-sidebar-item">
      <svg class="vk-sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>
      </svg>
      <span class="vk-sidebar-text">Умные калькуляторы</span>
    </a>
    <a href="fx_converter.html" class="vk-sidebar-item">
      <svg class="vk-sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      <span class="vk-sidebar-text">Конвертер валют</span>
    </a>
    <a href="clock.html" class="vk-sidebar-item">
      <svg class="vk-sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <span class="vk-sidebar-text">Мировые часы</span>
    </a>
    <a href="case_converter.html" class="vk-sidebar-item">
      <svg class="vk-sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
      </svg>
      <span class="vk-sidebar-text">Конвертер регистров</span>
    </a>
    <a href="income_dis.html" class="vk-sidebar-item">
      <svg class="vk-sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>
      </svg>
      <span class="vk-sidebar-text">Распределитель дохода</span>
    </a>
    <a href="mp3_cover.html" class="vk-sidebar-item">
      <svg class="vk-sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>
      </svg>
      <span class="vk-sidebar-text">Обложка из MP3</span>
    </a>
  </nav>

  <div class="vk-sidebar-footer">
    <div class="vk-footer-line">&copy; 2026 Все сервисы</div>
    <div class="vk-footer-subline">Сделано с &hearts; для вашего удобства</div>
    <a href="https://t.me/tribute/app?startapp=dAvG" target="_blank" class="vk-footer-link">Угостить автора кофе ☕</a>
  </div>
</aside>
`;

function renderSidebar() {
    const container = document.getElementById('sidebar-container');
    if (!container) return;

    container.innerHTML = sidebarHTML;

    // Подсветка текущей активной страницы
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const links = container.querySelectorAll('.vk-sidebar-item');

    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (currentPath === '' && href === 'index.html')) {
            link.classList.add('active');
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSidebar);
} else {
    renderSidebar();
}
