// gyoutube-service.js
// Сервис для работы с YouTube Data API v3 и управления плейлистами с автоматическим обновлением токена через Cloud Functions

const GYoutubeService = {
    // Получает токен из localStorage
    getStoredAccessToken() {
        return localStorage.getItem('google_youtube_access_token') ||
               localStorage.getItem('google_calendar_access_token') ||
               localStorage.getItem('google_access_token');
    },

    // Получает expiry токена из localStorage
    getStoredTokenExpiry() {
        const expiry = localStorage.getItem('google_youtube_token_expiry') ||
                       localStorage.getItem('google_calendar_token_expiry') ||
                       localStorage.getItem('google_token_expiry');
        return expiry ? parseInt(expiry) : 0;
    },

    // Проверяет, валиден ли токен и обновляет его при необходимости
    async ensureValidToken(allowInteractive = false) {
        let token = this.getStoredAccessToken();
        let expiry = this.getStoredTokenExpiry();

        // Если токена нет или он истекает менее чем через 5 минут (300 000 мс)
        if (!token || Date.now() + 300 * 1000 > expiry) {
            console.log('Access token для YouTube/Google протух или отсутствует, обновляем автоматически через Cloud Functions...');
            try {
                return await this.refreshAccessToken();
            } catch (err) {
                console.log('Автоматическое обновление токена через Cloud Function не удалось:', err);
                if (allowInteractive) {
                    await this.connectYouTube();
                }
                throw new Error('YOUTUBE_TOKEN_EXPIRED');
            }
        }
        return token;
    },

    // Запрос нового access token через Cloud Function
    async refreshAccessToken() {
        const user = window.firebaseAuth ? window.firebaseAuth.currentUser : (window.currentUser || null);
        if (!user) {
            throw new Error('Пользователь не авторизован в системе.');
        }

        try {
            console.log('Запрос нового access token для YouTube/Google через Cloud Function...');
            const idToken = await user.getIdToken(true);

            const response = await fetch('https://us-central1-tools-c98fd.cloudfunctions.net/refreshCalendarToken', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ data: {} })
            });

            if (!response.ok) {
                let errMsg = `HTTP Error ${response.status}`;
                try {
                    const errData = await response.json();
                    errMsg = errData.error?.message || errMsg;
                } catch (e) {}
                throw new Error(errMsg);
            }

            const resData = await response.json();
            const result = resData.result;

            if (result && result.access_token) {
                const token = result.access_token;
                const expiry = result.token_expiry || (Date.now() + 3600 * 1000);

                localStorage.setItem('google_youtube_access_token', token);
                localStorage.setItem('google_youtube_token_expiry', expiry);
                localStorage.setItem('google_calendar_access_token', token);
                localStorage.setItem('google_calendar_token_expiry', expiry);
                localStorage.setItem('google_access_token', token);
                localStorage.setItem('google_token_expiry', expiry);

                window.dispatchEvent(new CustomEvent('googleYouTubeTokenChanged', { detail: { token } }));
                window.dispatchEvent(new CustomEvent('googleCalendarTokenChanged', { detail: { token } }));
                return token;
            } else {
                throw new Error('Некорректный ответ от сервера авторизации.');
            }
        } catch (err) {
            console.error('Ошибка при обновлении токена YouTube через Cloud Function:', err);
            throw err;
        }
    },

    // Подключение Google аккаунта с правами YouTube (OAuth redirect flow)
    async connectYouTube(customRedirectUrl = null) {
        try {
            console.log("Запускаем авторизацию Google (YouTube & Calendar)...");
            const user = window.firebaseAuth ? window.firebaseAuth.currentUser : (window.currentUser || null);
            if (!user) {
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal(document.querySelector('.vk-profile') || document.body, 'login');
                } else {
                    alert("Пожалуйста, сначала войдите в аккаунт на сайте.");
                }
                return;
            }

            const clientId = "595986762798-1pm4iaiom54d4bflvnp1hrf4iugqfvhu.apps.googleusercontent.com";
            const redirectUri = "https://us-central1-tools-c98fd.cloudfunctions.net/googleCalendarCallback";
            const scopes = [
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/youtube",
                "https://www.googleapis.com/auth/youtube.force-ssl"
            ].join(" ");

            const returnUrl = customRedirectUrl || window.location.href;
            try {
                sessionStorage.setItem('oauth_return_url', returnUrl);
            } catch (e) {}

            const statePayload = user.uid; // Простой UID без слешей для полной совместимости с Cloud Functions

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(statePayload)}`;

            window.location.href = authUrl;
        } catch (e) {
            console.error("Ошибка при подключении YouTube:", e);
            if (typeof showToast === 'function') {
                showToast("Ошибка: " + e.message, 'error');
            } else {
                alert("Ошибка авторизации Google: " + e.message);
            }
        }
    },

    // Выполнение запроса к YouTube Data API v3 с авто-обновлением токена
    async apiCall(endpoint, options = {}, allowInteractive = false) {
        const token = await this.ensureValidToken(allowInteractive);

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}`, {
            ...options,
            headers
        });

        // Если 401 Unauthorized — пробуем форсированно обновить токен и повторить запрос
        if (response.status === 401) {
            console.log('YouTube API: получен 401. Попытка принудительного обновления токена...');
            try {
                const newToken = await this.refreshAccessToken();
                return this.apiCall(endpoint, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'Authorization': `Bearer ${newToken}`
                    }
                }, allowInteractive);
            } catch (err) {
                console.log('Принудительное обновление токена YouTube не удалось:', err);
                throw new Error('YOUTUBE_TOKEN_EXPIRED');
            }
        }

        if (!response.ok) {
            let errorMsg = 'Ошибка YouTube API';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error?.message || errorMsg;
            } catch (e) {
                errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }

        // Для запросов DELETE YouTube API возвращает 204 No Content
        if (response.status === 204) {
            return { success: true };
        }

        const text = await response.text();
        try {
            return text ? JSON.parse(text) : { success: true };
        } catch (e) {
            return text;
        }
    },

    // 1. Получить список плейлистов текущего пользователя
    async fetchMyPlaylists() {
        const result = await this.apiCall('playlists?part=snippet,contentDetails,status&mine=true&maxResults=50');
        return result.items || [];
    },

    // 2. Получить элементы плейлиста (с их playlistItemId для возможности удаления/изменения)
    async fetchPlaylistItems(playlistId, maxPages = 4) {
        let items = [];
        let nextPageToken = '';
        let pages = 0;
        const apiKey = "AIzaSyCeQA2-I2pGKQwStB1TN8NQOQcKdgqc7_0";

        while (pages < maxPages) {
            const pageParam = nextPageToken ? `&pageToken=${nextPageToken}` : '';
            let data = null;
            let token = this.getStoredAccessToken();

            if (token) {
                try {
                    data = await this.apiCall(`playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50${pageParam}`);
                } catch (e) {
                    console.log("OAuth fetch items error, fallback to API key:", e);
                }
            }

            if (!data || !data.items) {
                const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${apiKey}${pageParam}`;
                const res = await fetch(url);
                data = await res.json();
            }

            if (data && data.items && data.items.length > 0) {
                items = items.concat(data.items);
                nextPageToken = data.nextPageToken;
                if (!nextPageToken) break;
                pages++;
            } else {
                break;
            }
        }
        return items;
    },

    // 3. Удалить трек/видео из плейлиста YouTube по его playlistItemId
    async deletePlaylistItem(playlistItemId) {
        if (!playlistItemId) {
            throw new Error("Не указан ID элемента плейлиста (playlistItemId).");
        }
        console.log(`Удаление элемента ${playlistItemId} из YouTube плейлиста...`);
        return await this.apiCall(`playlistItems?id=${encodeURIComponent(playlistItemId)}`, {
            method: 'DELETE'
        });
    },

    // 4. Добавить трек/видео в плейлист YouTube
    async addPlaylistItem(playlistId, videoId, position = null) {
        if (!playlistId || !videoId) {
            throw new Error("Необходимо указать playlistId и videoId.");
        }
        const bodyPayload = {
            snippet: {
                playlistId: playlistId,
                resourceId: {
                    kind: "youtube#video",
                    videoId: videoId
                }
            }
        };
        if (typeof position === 'number') {
            bodyPayload.snippet.position = position;
        }
        return await this.apiCall('playlistItems?part=snippet', {
            method: 'POST',
            body: JSON.stringify(bodyPayload)
        });
    },

    // 5. Создать новый плейлист на YouTube
    async createPlaylist(title, description = '', privacyStatus = 'private') {
        const bodyPayload = {
            snippet: {
                title: title,
                description: description
            },
            status: {
                privacyStatus: privacyStatus // 'public', 'private', or 'unlisted'
            }
        };
        return await this.apiCall('playlists?part=snippet,status', {
            method: 'POST',
            body: JSON.stringify(bodyPayload)
        });
    },

    // 6. Удалить плейлист с YouTube
    async deletePlaylist(playlistId) {
        if (!playlistId) {
            throw new Error("Не указан ID плейлиста.");
        }
        return await this.apiCall(`playlists?id=${encodeURIComponent(playlistId)}`, {
            method: 'DELETE'
        });
    }
};

window.GYoutubeService = GYoutubeService;
