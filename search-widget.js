/**
 * SearchWidget - Интерактивная поисковая строка в стиле Infinity Tab
 * с автодополнением от Google (бесплатно, через JSONP)
 */

(function () {
    const SEARCH_ENGINES = {
        google: {
            id: 'google',
            name: 'Google',
            placeholder: 'Поиск в Google',
            searchUrl: 'https://www.google.com/search?q=',
            icon: `<svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>`
        },
        yandex: {
            id: 'yandex',
            name: 'Яндекс',
            placeholder: 'Поиск в Яндексе',
            searchUrl: 'https://ya.ru/search/?text=',
            icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10z" fill="#FC3F1D"/>
                <path d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z" fill="#fff"/>
            </svg>`
        },
        bing: {
            id: 'bing',
            name: 'Bing',
            placeholder: 'Поиск в Bing',
            searchUrl: 'https://www.bing.com/search?q=',
            icon: `<svg viewBox="-173 0 1024 1024" width="20" height="20" fill="none">
                <path fill="url(#bing_a)" d="M0 778.3c14.6 123.8 223.8 143 236.8 79.9-.3-.4-.5-678.1-.5-678.1-3.6-46-26.2-72-61.6-96.5-33-22.7-74.4-50.4-96.9-66.4C14.2-28 .1 31.4 0 33.2c0 0 .3 746.4 0 745.1z"/>
                <path fill="url(#bing_b)" d="M236.8 832.8c-96.2 72.5-217 42.7-234.4-44-.8-4.2-2.4-10.4-2.4-10.4s.9 8.5 2 16.6c1.2 8.5 3.7 20.8 6.3 31.3 30 117.8 132.1 186 230.4 196.6C373.3 1034.8 497.4 931 599 855.8c6.3-6.2 15.4-16.2 18.1-20.1 66.2-95-13.6-197-72.5-193a59154 59154 0 0 0-307.7 190.1Z"/>
                <path fill="url(#bing_c)" fill-rule="evenodd" d="M312.8 381c7.4 47 34.6 108.7 59.6 172.6 20.2 41.3 62 53.4 103 65.5 42.4 12.6 65.6 21 85.6 30.9 138.5 68.7 38.5 207.7 59.6 181.4 89-110.7 79.7-325.4-90-418.1-57.6-28.7-115.4-66.6-156.5-83.6-41-17-68.7 4.3-61.3 51.3z" clip-rule="evenodd"/>
                <defs>
                    <radialGradient id="bing_c" cx="0" cy="0" r="1" gradientTransform="matrix(-347 -399.3 287.3 -249.8 655 722)" gradientUnits="userSpaceOnUse"><stop stop-color="#00CACC"/><stop offset="1" stop-color="#048FCE"/></radialGradient>
                    <radialGradient id="bing_b" cx="0" cy="0" r="1" gradientTransform="matrix(526 -225.4 375.6 876.6 88.8 915.1)" gradientUnits="userSpaceOnUse"><stop stop-color="#00BBEC"/><stop offset="1" stop-color="#2756A9"/></radialGradient>
                    <linearGradient id="bing_a" x1="118.4" x2="118.4" y1="0" y2="884.4" gradientUnits="userSpaceOnUse"><stop stop-color="#00BBEC"/><stop offset="1" stop-color="#2756A9"/></linearGradient>
                </defs>
            </svg>`
        },
        duckduckgo: {
            id: 'duckduckgo',
            name: 'DuckDuckGo',
            placeholder: 'Поиск в DuckDuckGo',
            searchUrl: 'https://duckduckgo.com/?q=',
            icon: `<svg viewBox="67 19 120 120" width="20" height="20">
                <circle cx="127" cy="79" r="60" fill="#DE5833"/>
                <path fill="#FFFFFF" d="M177.8 57.5C175 50.9 171 45 166 40c-5.1-5.1-11-9-17.5-11.8c-6.8-2.9-14-4.3-21.5-4.3c-7.4 0-14.7 1.5-21.5 4.3C98.9 30.9 93 34.9 88 40c-5.1 5.1-9 11-11.8 17.5c-2.9 6.8-4.3 14-4.3 21.5s1.5 14.7 4.3 21.5c2.8 6.6 6.8 12.5 11.8 17.5c5.1 5.1 11 9 17.5 11.8c6.8 2.9 14 4.3 21.5 4.3c7.4 0 14.7-1.5 21.5-4.3C155 127 160.9 123 166 118c5.1-5.1 9-11 11.8-17.5c2.9-6.8 4.3-14 4.3-21.5S180.7 64.3 177.8 57.5z M139 128.5c-3.2-5.4-11.6-20.5-11.6-31.7c0-25.8 17.3-3.7 17.3-24.3c0-4.9-2.4-22.1-17.4-25.7c-3.7-4.9-12.4-9.6-26.2-7.7c0 0 2.3 0.7 4.9 2c0 0-5 0.7-5.2 4.1c0 0 9.9-0.5 15.5 1.3C103.4 48.2 96.8 55 98 67.3c1.7 17.5 9.1 48.7 11.7 59.6C90.1 119.9 76 101.1 76 79c0-28.1 22.8-51 51-51s51 22.8 51 51C177.9 103 161.3 123.1 139 128.5z"/>
                <path fill="#FED30A" fill-rule="evenodd" clip-rule="evenodd" d="M124.2 87.3c0-6.6 9-8.7 12.4-8.7c9.2 0 22.2-5.9 25.4-5.8c3.3 0.1 5.4 1.4 5.4 2.9c0 2.2-18.4 10.5-25.5 9.8c-6.8-0.6-8.4 0.1-8.4 2.9c0 2.4 4.9 4.6 10.3 4.6c8.1 0 16-3.6 18.4-1.9c2.1 1.5-5.5 6.9-14.2 6.9C139.3 98 124.2 93.9 124.2 87.3z"/>
                <g fill="#2D4F8D">
                    <path d="M140.2 59.3c-2.4-3.1-6.7-3.2-8.2 0.4C134.3 57.9 137.1 57.5 140.2 59.3z"/>
                    <path d="M113.5 59.4c-3.3-2-8.8-2.2-8.5 4.1C106.6 59.6 108.8 58.9 113.5 59.4z"/>
                    <circle cx="138.2" cy="68.5" r="2.8"/>
                    <circle cx="112.6" cy="70.5" r="2.8"/>
                </g>
                <path fill="#67BD47" d="M147.1 107.6c-1.7-0.4-8.3 4.3-10.8 6.1c-0.1-0.5-0.2-0.9-0.3-1.1c-0.3-1-6.7-0.4-8.2 1.2c-4-1.9-12-5.6-12.1-3.3c-0.3 3 0 15.5 1.6 16.4c1.2 0.7 8-3 11.4-4.9c0 0 0 0 0.1 0c2.1 0.5 6 0 7.4-0.9c0.2-0.1 0.3-0.3 0.4-0.5c3.1 1.2 9.8 3.6 11.2 3.1C149.6 123.2 149.2 108.1 147.1 107.6z"/>
                <path fill="#43A347" d="M128.8 122c-2.1-0.4-1.4-2.5-1.4-7.4c0 0 0 0 0 0c-0.5 0.3-0.9 0.7-0.9 1.1c0 4.9-0.8 7.1 1.4 7.4c2.1 0.5 6 0 7.6-0.9c0.3-0.2 0.4-0.5 0.5-1C134.5 122.1 130.8 122.5 128.8 122z"/>
            </svg>`
        },
        youtube: {
            id: 'youtube',
            name: 'YouTube',
            placeholder: 'Поиск на YouTube',
            searchUrl: 'https://www.youtube.com/results?search_query=',
            icon: `<svg viewBox="0 0 28.57 20" width="20" height="20">
                <path d="M27.97 3.12C27.64 1.89 26.68 0.93 25.45 0.6 23.22 0 14.29 0 14.29 0S5.35 0 3.12 0.6C1.89 0.93 0.93 1.89 0.6 3.12 0 5.35 0 10 0 10s0 4.65 0.6 6.88c0.33 1.23 1.29 2.19 2.52 2.52 2.23 0.6 11.17 0.6 11.17 0.6s8.93 0 11.16-0.6c1.23-0.33 2.19-1.29 2.52-2.52 0.6-2.23 0.6-6.88 0.6-6.88s0-4.65-0.6-6.88z" fill="#FF0000"/>
                <path d="M11.43 14.29L18.85 10 11.43 5.71v8.58z" fill="#FFFFFF"/>
            </svg>`
        }
    };

    class SearchWidget {
        constructor() {
            this.container = document.getElementById('desktopSearchWidget');
            this.input = document.getElementById('desktopSearchInput');
            this.clearBtn = document.getElementById('desktopSearchClear');
            this.badge = document.getElementById('searchEngineBadge');
            this.engineIcon = document.getElementById('searchEngineIcon');
            this.engineMenu = document.getElementById('searchEngineMenu');
            this.suggestionsBox = document.getElementById('desktopSearchSuggestions');

            if (!this.container || !this.input) return;

            this.currentEngineId = localStorage.getItem('searchEngine') || 'google';
            if (!SEARCH_ENGINES[this.currentEngineId]) this.currentEngineId = 'google';

            this.debounceTimer = null;
            this.latestReqId = 0;
            this.currentScript = null;
            this.currentCallbackName = null;

            this.selectedIndex = -1;
            this.originalTypedQuery = '';
            this.currentSuggestions = [];

            this.init();
        }

        init() {
            this.applyEngine(this.currentEngineId);
            this.renderEngineMenu();
            this.bindEvents();
        }

        applyEngine(engineId) {
            const engine = SEARCH_ENGINES[engineId] || SEARCH_ENGINES.google;
            this.currentEngineId = engine.id;
            localStorage.setItem('searchEngine', engine.id);

            if (this.engineIcon) {
                this.engineIcon.innerHTML = engine.icon;
            }
            if (this.input) {
                this.input.placeholder = engine.placeholder;
            }
            if (this.badge) {
                this.badge.title = `Поисковая система: ${engine.name}`;
            }

            // Обновляем активный элемент в выпадающем списке
            if (this.engineMenu) {
                const items = this.engineMenu.querySelectorAll('.search-engine-item');
                items.forEach(el => {
                    if (el.dataset.engine === engine.id) {
                        el.classList.add('active');
                    } else {
                        el.classList.remove('active');
                    }
                });
            }
        }

        renderEngineMenu() {
            if (!this.engineMenu) return;
            this.engineMenu.innerHTML = '';
            Object.values(SEARCH_ENGINES).forEach(eng => {
                const item = document.createElement('div');
                item.className = `search-engine-item ${eng.id === this.currentEngineId ? 'active' : ''}`;
                item.dataset.engine = eng.id;
                item.innerHTML = `
                    <div class="search-engine-item-icon">${eng.icon}</div>
                    <span class="search-engine-item-name">${eng.name}</span>
                `;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.applyEngine(eng.id);
                    this.closeEngineMenu();
                    this.input.focus();
                });
                this.engineMenu.appendChild(item);
            });
        }

        toggleEngineMenu() {
            if (!this.engineMenu) return;
            const isVisible = this.engineMenu.classList.contains('visible');
            if (isVisible) {
                this.closeEngineMenu();
            } else {
                this.closeSuggestions();
                this.engineMenu.classList.add('visible');
                if (this.badge) this.badge.classList.add('open');
            }
        }

        closeEngineMenu() {
            if (this.engineMenu) {
                this.engineMenu.classList.remove('visible');
            }
            if (this.badge) {
                this.badge.classList.remove('open');
            }
        }

        bindEvents() {
            // Клик по бейджу поисковика
            if (this.badge) {
                this.badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleEngineMenu();
                });
            }

            // Ввод текста
            this.input.addEventListener('input', () => {
                const val = this.input.value;
                this.toggleClearBtn(val.length > 0);
                this.selectedIndex = -1;
                this.originalTypedQuery = val;

                if (!val.trim()) {
                    this.closeSuggestions();
                    return;
                }

                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.fetchSuggestions(val.trim());
                }, 160);
            });

            // Фокус на инпуте: если есть текст, пробуем показать подсказки
            this.input.addEventListener('focus', () => {
                const val = this.input.value.trim();
                if (val && this.currentSuggestions.length > 0) {
                    this.showSuggestions(this.currentSuggestions);
                }
            });

            // Кнопка очистки
            if (this.clearBtn) {
                this.clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.input.value = '';
                    this.originalTypedQuery = '';
                    this.selectedIndex = -1;
                    this.toggleClearBtn(false);
                    this.closeSuggestions();
                    this.input.focus();
                });
            }

            // Клавиши: стрелки вверх/вниз, Enter, Escape
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    if (this.currentSuggestions.length > 0) {
                        e.preventDefault();
                        this.moveSelection(1);
                    }
                } else if (e.key === 'ArrowUp') {
                    if (this.currentSuggestions.length > 0) {
                        e.preventDefault();
                        this.moveSelection(-1);
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = this.input.value.trim();
                    if (query) {
                        this.executeSearch(query);
                    }
                } else if (e.key === 'Escape') {
                    this.closeSuggestions();
                    this.closeEngineMenu();
                }
            });

            // Клик вне поискового виджета — закрываем подсказки и меню
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#desktopSearchWidget')) {
                    this.closeSuggestions();
                    this.closeEngineMenu();
                }
            });
        }

        toggleClearBtn(show) {
            if (!this.clearBtn) return;
            if (show) {
                this.clearBtn.classList.add('visible');
            } else {
                this.clearBtn.classList.remove('visible');
            }
        }

        moveSelection(delta) {
            const count = this.currentSuggestions.length;
            if (count === 0) return;

            if (this.selectedIndex === -1 && delta === 1) {
                this.selectedIndex = 0;
            } else if (this.selectedIndex === 0 && delta === -1) {
                this.selectedIndex = -1;
                this.input.value = this.originalTypedQuery;
                this.updateSelectedDOM();
                return;
            } else {
                this.selectedIndex = (this.selectedIndex + delta + count) % count;
            }

            const selectedText = this.currentSuggestions[this.selectedIndex];
            if (selectedText) {
                this.input.value = selectedText;
                this.toggleClearBtn(true);
            }
            this.updateSelectedDOM();
        }

        updateSelectedDOM() {
            if (!this.suggestionsBox) return;
            const items = this.suggestionsBox.querySelectorAll('.search-suggestion-item');
            items.forEach((item, idx) => {
                if (idx === this.selectedIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        fetchSuggestions(query) {
            // Очищаем предыдущий JSONP script, если был
            if (this.currentScript && this.currentScript.parentNode) {
                this.currentScript.parentNode.removeChild(this.currentScript);
                this.currentScript = null;
            }
            if (this.currentCallbackName && window[this.currentCallbackName]) {
                delete window[this.currentCallbackName];
                this.currentCallbackName = null;
            }

            const reqId = ++this.latestReqId;
            const cbName = `__google_suggest_${Date.now()}_${reqId}`;
            this.currentCallbackName = cbName;

            window[cbName] = (data) => {
                if (reqId === this.latestReqId) {
                    try {
                        const suggestions = (data && Array.isArray(data[1])) ? data[1] : [];
                        this.handleSuggestionsResult(suggestions);
                    } catch (e) {
                        this.closeSuggestions();
                    }
                }
                if (window[cbName]) delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
                if (this.currentScript === script) this.currentScript = null;
            };

            const script = document.createElement('script');
            this.currentScript = script;
            script.src = `https://suggestqueries.google.com/complete/search?client=chrome&hl=ru&gl=ru&ie=utf-8&oe=utf-8&q=${encodeURIComponent(query)}&jsonp=${cbName}`;
            script.async = true;
            script.onerror = () => {
                if (reqId === this.latestReqId) {
                    this.closeSuggestions();
                }
                if (window[cbName]) delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
                if (this.currentScript === script) this.currentScript = null;
            };

            document.body.appendChild(script);
        }

        handleSuggestionsResult(suggestions) {
            // Показываем максимум 10 подсказок
            const list = (suggestions || []).slice(0, 10);
            this.currentSuggestions = list;

            if (list.length === 0 || !this.input.value.trim()) {
                this.closeSuggestions();
                return;
            }

            this.showSuggestions(list);
        }

        showSuggestions(list) {
            if (!this.suggestionsBox) return;
            this.suggestionsBox.innerHTML = '';

            list.forEach((text, index) => {
                const item = document.createElement('div');
                item.className = `search-suggestion-item ${index === this.selectedIndex ? 'selected' : ''}`;
                item.dataset.index = index;
                item.textContent = text;

                item.addEventListener('mouseenter', () => {
                    this.selectedIndex = index;
                    this.updateSelectedDOM();
                });

                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.input.value = text;
                    this.executeSearch(text);
                });

                this.suggestionsBox.appendChild(item);
            });

            this.container.classList.add('has-suggestions');
            this.closeEngineMenu();
        }

        closeSuggestions() {
            if (this.suggestionsBox) {
                this.suggestionsBox.innerHTML = '';
            }
            if (this.container) {
                this.container.classList.remove('has-suggestions');
            }
            this.selectedIndex = -1;
        }

        executeSearch(rawQuery) {
            if (!rawQuery || !rawQuery.trim()) return;
            const q = rawQuery.trim();

            this.closeSuggestions();
            this.closeEngineMenu();

            // Если пользователь ввёл полноценный URL (начинается с http/https) — переходим по нему
            const isFullUrl = /^https?:\/\//i.test(q);
            let targetUrl;

            if (isFullUrl) {
                targetUrl = q;
            } else {
                const engine = SEARCH_ENGINES[this.currentEngineId] || SEARCH_ENGINES.google;
                targetUrl = engine.searchUrl + encodeURIComponent(q);
            }

            // Настройка: открывать поиск в новой вкладке (по умолчанию true)
            const inNewTab = localStorage.getItem('searchOpenInNewTab') !== 'false';

            if (inNewTab) {
                window.open(targetUrl, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = targetUrl;
            }
        }
    }

    // Инициализация
    function init() {
        window.searchWidget = new SearchWidget();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
