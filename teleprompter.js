// teleprompter.js - Core Teleprompter Application Logic

document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const editContainer = document.getElementById('edit-container');
    const prompterContainer = document.getElementById('prompter-container');
    const scriptInput = document.getElementById('script-input');
    const launchBtn = document.getElementById('launch-btn');
    const exitBtn = document.getElementById('exit-btn');
    const prompterText = document.getElementById('prompter-text');
    const prompterScrollWrapper = document.getElementById('prompter-scroll-wrapper');
    const controlPanel = document.getElementById('control-panel');
    
    // Controls
    const playPauseBtn = document.getElementById('play-pause-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeVal = document.getElementById('font-size-val');
    const marginSlider = document.getElementById('margin-slider');
    const marginVal = document.getElementById('margin-val');
    const mirrorToggle = document.getElementById('mirror-toggle');
    const guideToggle = document.getElementById('guide-toggle');
    const readingGuide = document.getElementById('reading-guide');
    const wakeLockStatus = document.getElementById('wakelock-status');

    // Presets
    const presetBtns = document.querySelectorAll('.preset-btn');

    // === STATE VARIABLES ===
    let isPlaying = false;
    let speed = 5; // Slider value 1-20
    let fontSize = 48; // px
    let margin = 15; // % left/right margin
    let isMirrored = false;
    let showGuide = true;
    
    // Animation variables
    let animationFrameId = null;
    let lastTimestamp = 0;
    let scrollPosition = 0;
    let isUserScrolling = false;
    let userScrollTimeout = null;

    // Wake Lock
    let wakeLock = null;

    // Auto-hide controls variables
    let controlsHideTimeout = null;
    const CONTROLS_HIDE_DELAY = 3000; // 3 seconds

    // === DEFAULT TEXT PRESETS ===
    const scriptPresets = {
        test: `Добро пожаловать в Телесуфлер! 🚀

Это современное, быстрое и удобное веб-приложение, созданное для того, чтобы помочь вам записывать видео без запинок.

Вы можете вставить свой собственный текст сценария в редакторе, настроить скорость прокрутки, размер шрифта и поля под свои предпочтения.

Попробуйте отзеркалить текст, если используете физический суфлер перед камерой телефона.

Нажмите Play внизу, чтобы запустить прокрутку прямо сейчас! Удачных съемок!`,
        pitch: `Приветствую! Сегодня я представлю вам наш новый продукт. 💡

Мы разработали его, основываясь на отзывах сотен пользователей, которым не хватало простоты и скорости.

Наш сервис работает полностью автономно, не требует сложной установки и доступен на любом устройстве в один клик.

С нами вы сэкономите время, повысите качество своей работы и сможете сосредоточиться на главном — создании отличного контента.

Спасибо за внимание! Давайте перейдем к деталям.`,
        speech: `Дорогие друзья и коллеги! 🤝

Сегодня особенный день. Мы собрались здесь, чтобы подвести итоги нашей совместной работы за этот год.

Каждый из нас внес неоценимый вклад в развитие этого проекта. Мы преодолели множество трудностей, научились работать в новых условиях и стали сильнее как команда.

Впереди нас ждут еще более амбициозные задачи, и я уверен, что вместе мы добьемся ошеломляющих успехов.

Спасибо каждому из вас за преданность делу и ваш ежедневный труд!`
    };

    // === INITIALIZATION ===
    function init() {
        // Load saved values or set defaults
        const savedScript = localStorage.getItem('teleprompter_script');
        if (savedScript !== null) {
            scriptInput.value = savedScript;
        } else {
            scriptInput.value = scriptPresets.test;
        }

        speed = parseInt(localStorage.getItem('teleprompter_speed')) || 5;
        fontSize = parseInt(localStorage.getItem('teleprompter_font_size')) || 48;
        margin = parseInt(localStorage.getItem('teleprompter_margin')) || 15;
        isMirrored = localStorage.getItem('teleprompter_mirrored') === 'true';
        showGuide = localStorage.getItem('teleprompter_guide') !== 'false';

        // Update UI controls to match loaded states
        speedSlider.value = speed;
        speedVal.textContent = speed;

        fontSizeSlider.value = fontSize;
        fontSizeVal.textContent = fontSize + 'px';

        marginSlider.value = margin;
        marginVal.textContent = margin + '%';

        mirrorToggle.checked = isMirrored;
        guideToggle.checked = showGuide;
        
        updatePrompterStyles();

        // Register Service Worker for PWA if supported
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('[Teleprompter] SW registered successfully'))
                .catch(err => console.log('[Teleprompter] SW registration failed', err));
        }
    }

    // === EVENT LISTENERS ===

    // Preset buttons
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-preset');
            if (scriptPresets[type]) {
                if (confirm('Заменить текущий текст шаблоном?')) {
                    scriptInput.value = scriptPresets[type];
                    saveScriptToStorage();
                }
            }
        });
    });

    // Save text on input change
    scriptInput.addEventListener('input', saveScriptToStorage);

    // Launch & Exit Modes
    launchBtn.addEventListener('click', launchPrompter);
    exitBtn.addEventListener('click', exitPrompter);

    // Controls changes
    speedSlider.addEventListener('input', (e) => {
        speed = parseInt(e.target.value);
        speedVal.textContent = speed;
        localStorage.setItem('teleprompter_speed', speed);
    });

    fontSizeSlider.addEventListener('input', (e) => {
        fontSize = parseInt(e.target.value);
        fontSizeVal.textContent = fontSize + 'px';
        updatePrompterStyles();
        localStorage.setItem('teleprompter_font_size', fontSize);
    });

    marginSlider.addEventListener('input', (e) => {
        margin = parseInt(e.target.value);
        marginVal.textContent = margin + '%';
        updatePrompterStyles();
        localStorage.setItem('teleprompter_margin', margin);
    });

    mirrorToggle.addEventListener('change', (e) => {
        isMirrored = e.target.checked;
        updatePrompterStyles();
        localStorage.setItem('teleprompter_mirrored', isMirrored);
    });

    guideToggle.addEventListener('change', (e) => {
        showGuide = e.target.checked;
        readingGuide.style.display = showGuide ? 'flex' : 'none';
        localStorage.setItem('teleprompter_guide', showGuide);
    });

    // Play/Pause interaction
    playPauseBtn.addEventListener('click', togglePlay);

    // Tap/Click on screen to toggle controls or pause
    prompterScrollWrapper.addEventListener('click', (e) => {
        // Only if clicking directly on the scroll area or text, not controls
        if (e.target === prompterScrollWrapper || e.target === prompterText) {
            showControls();
            
            // If it is playing, a single tap also acts as a quick pause/play toggle
            // which is highly intuitive on mobile devices.
            togglePlay();
        }
    });

    // Mouse movement or Touch in prompter mode reveals control panel
    prompterContainer.addEventListener('mousemove', showControls);
    prompterContainer.addEventListener('touchstart', showControls, { passive: true });

    // Sync scroll when user scrolls manually
    prompterScrollWrapper.addEventListener('scroll', handleWrapperScroll);
    prompterScrollWrapper.addEventListener('touchstart', () => { isUserScrolling = true; }, { passive: true });
    prompterScrollWrapper.addEventListener('mousedown', () => { isUserScrolling = true; });

    // === UTILITY FUNCTIONS ===

    function saveScriptToStorage() {
        localStorage.setItem('teleprompter_script', scriptInput.value);
    }

    function updatePrompterStyles() {
        prompterText.style.fontSize = `${fontSize}px`;
        prompterText.style.paddingLeft = `${margin}%`;
        prompterText.style.paddingRight = `${margin}%`;

        if (isMirrored) {
            prompterText.classList.add('mirror-content');
        } else {
            prompterText.classList.remove('mirror-content');
        }

        readingGuide.style.display = showGuide ? 'flex' : 'none';
    }

    // === PROMPTER CORE FUNCTIONS ===

    function launchPrompter() {
        // Set content
        const text = scriptInput.value.trim();
        if (!text) {
            alert('Пожалуйста, введите или вставьте текст сценария!');
            return;
        }

        // Prepare prompter HTML content
        prompterText.textContent = text;
        updatePrompterStyles();

        // Switch container view
        editContainer.classList.add('hidden');
        prompterContainer.classList.remove('hidden');
        document.body.classList.add('prompter-active');

        // Reset scroll position to top
        prompterScrollWrapper.scrollTop = 0;
        scrollPosition = 0;
        isPlaying = false;
        
        updatePlayBtnState();
        showControls();

        // Hide navigation header if exists
        const header = document.getElementById('header-container');
        if (header) header.style.display = 'none';
    }

    function exitPrompter() {
        // Pause scrolling
        if (isPlaying) {
            togglePlay();
        }

        // Return view
        prompterContainer.classList.add('hidden');
        editContainer.classList.remove('hidden');
        document.body.classList.remove('prompter-active');

        // Restore global navigation header
        const header = document.getElementById('header-container');
        if (header) header.style.display = '';

        // Clear any timeouts
        if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
    }

    function togglePlay() {
        isPlaying = !isPlaying;
        updatePlayBtnState();

        if (isPlaying) {
            prompterScrollWrapper.classList.add('scrolling-active');
            lastTimestamp = performance.now();
            animationFrameId = requestAnimationFrame(scrollLoop);
            requestWakeLock();
            resetControlsHideTimer();
        } else {
            prompterScrollWrapper.classList.remove('scrolling-active');
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            releaseWakeLock();
            showControls(); // Keep controls visible when paused
        }
    }

    function updatePlayBtnState() {
        if (isPlaying) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            playPauseBtn.setAttribute('aria-label', 'Пауза');
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            playPauseBtn.setAttribute('aria-label', 'Старт');
        }
    }

    // --- High Performance Scroll Loop ---
    function scrollLoop(timestamp) {
        if (!isPlaying) return;

        // Calculate delta time in seconds
        const delta = (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;

        // Ensure we don't jump on huge frame lag
        const cappedDelta = Math.min(delta, 0.1);

        // Convert speed slider value (1 to 20) to pixels per second
        // Speed 1: ~15px/sec, Speed 20: ~350px/sec
        // Using a smooth exponential curve for better control at slow speeds
        const pixelsPerSecond = Math.pow(speed, 1.4) * 6.5;

        // Update target scroll position
        scrollPosition += pixelsPerSecond * cappedDelta;
        
        // Write to DOM element
        prompterScrollWrapper.scrollTop = scrollPosition;

        // Check if we hit the end of the text
        const maxScroll = prompterScrollWrapper.scrollHeight - prompterScrollWrapper.clientHeight;
        if (prompterScrollWrapper.scrollTop >= maxScroll - 2) {
            // End reached, auto pause
            isPlaying = false;
            updatePlayBtnState();
            prompterScrollWrapper.classList.remove('scrolling-active');
            releaseWakeLock();
            showControls();
            return;
        }

        animationFrameId = requestAnimationFrame(scrollLoop);
    }

    // --- Sync Scroll on Manual Interaction ---
    function handleWrapperScroll() {
        // If the user drags or scrolls manually, sync our internal float scrollPosition
        const currentScroll = prompterScrollWrapper.scrollTop;
        
        // If not playing, always sync position
        if (!isPlaying) {
            scrollPosition = currentScroll;
            return;
        }

        // If playing but user touch is active, sync scroll position with touch offset
        if (isUserScrolling) {
            scrollPosition = currentScroll;
            
            // Debounce resetting the user scrolling flag
            if (userScrollTimeout) clearTimeout(userScrollTimeout);
            userScrollTimeout = setTimeout(() => {
                isUserScrolling = false;
            }, 100);
        }
    }

    // === FLOATING CONTROLS PANEL FADE LOGIC ===
    function showControls() {
        controlPanel.classList.remove('control-panel-hidden');
        
        if (isPlaying) {
            resetControlsHideTimer();
        } else {
            if (controlsHideTimeout) {
                clearTimeout(controlsHideTimeout);
                controlsHideTimeout = null;
            }
        }
    }

    function hideControls() {
        if (isPlaying) {
            controlPanel.classList.add('control-panel-hidden');
        }
    }

    function resetControlsHideTimer() {
        if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
        controlsHideTimeout = setTimeout(hideControls, CONTROLS_HIDE_DELAY);
    }

    // === WAKE LOCK API INTEGRATION ===
    async function requestWakeLock() {
        if (!('wakeLock' in navigator)) {
            console.warn('[WakeLock] API not supported by browser.');
            updateWakeLockStatusUI(false, 'Not Supported');
            return;
        }

        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('[WakeLock] Screen Wake Lock acquired.');
            updateWakeLockStatusUI(true, 'Active');

            wakeLock.addEventListener('release', () => {
                console.log('[WakeLock] Screen Wake Lock released.');
                updateWakeLockStatusUI(false, 'Released');
            });
        } catch (err) {
            console.error(`[WakeLock] Failed to acquire lock: ${err.name}, ${err.message}`);
            updateWakeLockStatusUI(false, 'Failed');
        }
    }

    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    function updateWakeLockStatusUI(active, text) {
        if (!wakeLockStatus) return;
        
        if (active) {
            wakeLockStatus.innerHTML = `
                <span class="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    Экран активен
                </span>`;
        } else {
            if (text === 'Not Supported') {
                wakeLockStatus.innerHTML = `
                    <span class="inline-flex items-center gap-1 text-xs text-slate-500 font-normal">
                        Суфлер
                    </span>`;
            } else {
                wakeLockStatus.innerHTML = `
                    <span class="inline-flex items-center gap-1 text-xs text-amber-500 font-normal">
                        Суфлер
                    </span>`;
            }
        }
    }

    // Re-acquire Wake Lock when tab becomes active again and sufler is playing
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && isPlaying) {
            await requestWakeLock();
        }
    });

    // Run startup init
    init();
});
