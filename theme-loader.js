// theme-loader.js

(function() {
    // Безопасная обертка, чтобы не засорять глобальную область лишними переменными
    console.log('[ThemeLoader] Init started');

    const themeModes = ['system', 'light', 'dark'];
    
    // Читаем сохраненную настройку или ставим 'system' по умолчанию
    let currentThemeMode = localStorage.getItem('themeMode') || 'system';

    // Функция применения темы к body
    function applyTheme(mode) {
        console.log('[ThemeLoader] Applying mode:', mode);
        
        // 1. Сброс: удаляем класс dark, чтобы вернуться к дефолтному (светлому) состоянию
        document.body.classList.remove('dark');

        // 2. Применение:
        if (mode === 'dark') {
            document.body.classList.add('dark');
        } 
        else if (mode === 'light') {
            // Ничего не делаем, класс dark уже удален
        } 
        else {
            // Режим 'system' (или любой другой неизвестный) -> проверяем системные настройки
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.body.classList.add('dark');
            }
        }
        
        // 3. Сохраняем выбор
        localStorage.setItem('themeMode', mode);
        currentThemeMode = mode;
    }

    // === ГЛОБАЛЬНЫЕ ФУНКЦИИ (API) ===
    
    // 1. window.setTheme: Вызывается из виджета при клике
    window.setTheme = function(widgetMode) {
        // Виджет отправляет 'auto', мы используем 'system'
        const internalMode = (widgetMode === 'auto') ? 'system' : widgetMode;
        applyTheme(internalMode);
    };

    // 2. window.getThemeMode: Виджет спрашивает, какую кнопку подсветить
    window.getThemeMode = function() {
        // Если у нас 'system', возвращаем виджету 'auto'
        return currentThemeMode === 'system' ? 'auto' : currentThemeMode;
    };

    // Слушатель системных изменений (срабатывает только если выбран режим system)
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            if (currentThemeMode === 'system') {
                console.log('[ThemeLoader] System preference changed');
                document.body.classList.remove('dark');
                if (e.matches) document.body.classList.add('dark');
            }
        });
    }

    // Запускаем применение темы сразу при загрузке
    applyTheme(currentThemeMode);

    // Дополнительная страховка: если DOM еще не готов, пробуем применить после загрузки
    window.addEventListener('DOMContentLoaded', () => applyTheme(currentThemeMode));

})();