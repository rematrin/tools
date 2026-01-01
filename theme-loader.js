// theme-loader.js

// 1. Логика применения темы
const themeModes = ['system', 'light', 'dark'];
let currentThemeMode = localStorage.getItem('themeMode') || 'system';

function applyTheme(mode) {
    if (mode === 'dark') {
        document.body.classList.add('dark');
    } else if (mode === 'light') {
        document.body.classList.remove('dark');
    } else {
        // System
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemDark) document.body.classList.add('dark');
        else document.body.classList.remove('dark');
    }
    localStorage.setItem('themeMode', mode);
    currentThemeMode = mode;
    
    // Если меню виджета открыто, обновляем текст
    if (window.updateAuthMenuThemeText) window.updateAuthMenuThemeText(getThemeLabel(mode));
}

function getThemeLabel(mode) {
    if (mode === 'system') return 'Системная';
    if (mode === 'light') return 'Светлая';
    if (mode === 'dark') return 'Темная';
    return mode;
}

// Глобальные функции для виджета
window.cycleTheme = () => {
    const currentIndex = themeModes.indexOf(currentThemeMode);
    const nextIndex = (currentIndex + 1) % themeModes.length;
    applyTheme(themeModes[nextIndex]);
};

window.getCurrentThemeLabel = () => getThemeLabel(currentThemeMode);

// Слушаем системные изменения
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (currentThemeMode === 'system') {
        if (e.matches) document.body.classList.add('dark');
        else document.body.classList.remove('dark');
    }
});

// Запускаем сразу
applyTheme(currentThemeMode);