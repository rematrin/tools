// gcalendar-service.js

const GCalendarService = {
    // Получает токен из localStorage (быстрая проверка)
    getStoredAccessToken() {
        return localStorage.getItem('google_calendar_access_token');
    },

    // Получает expiry токена из localStorage
    getStoredTokenExpiry() {
        const expiry = localStorage.getItem('google_calendar_token_expiry');
        return expiry ? parseInt(expiry) : 0;
    },

    // Проверяет, валиден ли токен и обновляет его при необходимости
    async ensureValidToken() {
        let token = this.getStoredAccessToken();
        let expiry = this.getStoredTokenExpiry();

        // Если токена нет или он истекает менее чем через 5 минут (300 000 мс)
        if (!token || Date.now() + 300 * 1000 > expiry) {
            console.log('Access token для Google Calendar протух или отсутствует, пытаемся обновить...');
            return await this.refreshAccessToken();
        }
        return token;
    },

    async refreshAccessToken() {
        throw new Error('Сессия Google Календаря истекла. Пожалуйста, откройте Настройки -> Календари и подключите его заново.');
    },

    async apiCall(endpoint, options = {}) {
        const token = await this.ensureValidToken();

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(`https://www.googleapis.com/calendar/v3/${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            console.log('Получен ответ 401. Попытка принудительного обновления токена и повторного вызова...');
            const newToken = await this.refreshAccessToken();
            return this.apiCall(endpoint, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${newToken}`
                }
            });
        }

        if (!response.ok) {
            let errorMsg = 'Ошибка Google Calendar API';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error.message || errorMsg;
            } catch (e) {
                errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }

        const text = await response.text();
        try {
            return text ? JSON.parse(text) : null;
        } catch (e) {
            return text;
        }
    },

    // Получить список календарей пользователя
    async fetchCalendars() {
        const result = await this.apiCall('users/me/calendarList');
        return result.items || [];
    },

    // Создать новый календарь
    async createCalendar(title) {
        const calendarMetadata = {
            summary: title,
            description: 'Календарь для синхронизации задач из Todo'
        };

        const newCalendar = await this.apiCall('calendars', {
            method: 'POST',
            body: JSON.stringify(calendarMetadata)
        });

        return newCalendar;
    },

    // Удалить событие из Google Календаря
    async deleteTaskFromGoogle(eventId, calendarId) {
        if (!eventId || !calendarId) return;
        try {
            await this.apiCall(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
                method: 'DELETE'
            });
        } catch (e) {
            console.error('Не удалось удалить событие из Google Calendar:', e);
        }
    },

    // Добавить или обновить задачу в Google Календаре
    async syncTaskToGoogle(task, calendarId) {
        if (!calendarId) return null;

        // Если у задачи нет dueDate, мы удаляем её событие из календаря (если оно было)
        if (!task.dueDate) {
            if (task.gcal_event_id) {
                await this.deleteTaskFromGoogle(task.gcal_event_id, calendarId);
            }
            return null;
        }

        const eventData = this.buildEventData(task);

        let method = 'POST';
        let endpoint = `calendars/${encodeURIComponent(calendarId)}/events`;

        if (task.gcal_event_id) {
            method = 'PUT';
            endpoint = `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(task.gcal_event_id)}`;
        }

        try {
            const result = await this.apiCall(endpoint, {
                method: method,
                body: JSON.stringify(eventData)
            });
            return result.id;
        } catch (e) {
            // Если событие было удалено вручную в Google Календаре, API вернет 404/410 при попытке обновить.
            // В таком случае создадим его заново (POST).
            if (task.gcal_event_id && (e.message.includes('Not Found') || e.message.includes('404') || e.message.includes('410'))) {
                console.log('Событие не найдено в Google Календаре. Создаем заново...');
                const newEndpoint = `calendars/${encodeURIComponent(calendarId)}/events`;
                const result = await this.apiCall(newEndpoint, {
                    method: 'POST',
                    body: JSON.stringify(eventData)
                });
                return result.id;
            }
            throw e;
        }
    },

    // Конструктор данных события для Google Calendar API
    buildEventData(task) {
        const title = task.title || 'Без названия';
        const description = task.description || '';

        const event = {
            summary: title,
            description: description,
            reminders: {
                useDefault: true
            }
        };

        // Локальный часовой пояс пользователя
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        if (task.dueTime) {
            // Задача с указанным временем
            const startDateTime = `${task.dueDate}T${task.dueTime}:00`;
            
            // Конец события через 30 минут
            const [hours, minutes] = task.dueTime.split(':').map(Number);
            let endHours = hours;
            let endMinutes = minutes + 30;
            if (endMinutes >= 60) {
                endMinutes -= 60;
                endHours += 1;
            }
            const endHoursStr = String(endHours).padStart(2, '0');
            const endMinutesStr = String(endMinutes).padStart(2, '0');
            
            // Проверка переполнения дня (если 23:45, то конец события на следующий день)
            let endDate = task.dueDate;
            if (endHours >= 24) {
                const dateObj = new Date(task.dueDate);
                dateObj.setDate(dateObj.getDate() + 1);
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                endDate = `${year}-${month}-${day}`;
                endHoursStr = '00';
            }

            const endDateTime = `${endDate}T${endHoursStr}:${endMinutesStr}:00`;

            event.start = {
                dateTime: startDateTime,
                timeZone: timeZone
            };
            event.end = {
                dateTime: endDateTime,
                timeZone: timeZone
            };
        } else {
            // Весь день (All-day)
            // Конечная дата должна быть на 1 день больше начальной (в Google Calendar API это exclusive поле)
            const dateObj = new Date(task.dueDate);
            dateObj.setDate(dateObj.getDate() + 1);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const endDate = `${year}-${month}-${day}`;

            event.start = {
                date: task.dueDate
            };
            event.end = {
                date: endDate
            };
        }

        // Поддержка правил повторения (Recurrence RRULE)
        if (task.dueRepeat) {
            let rrule = '';
            switch (task.dueRepeat) {
                case 'daily':
                    rrule = 'RRULE:FREQ=DAILY';
                    break;
                case 'weekly':
                    rrule = 'RRULE:FREQ=WEEKLY';
                    break;
                case 'weekday':
                    rrule = 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
                    break;
                case 'monthly':
                    rrule = 'RRULE:FREQ=MONTHLY';
                    break;
                case 'yearly':
                    rrule = 'RRULE:FREQ=YEARLY';
                    break;
            }
            if (rrule) {
                event.recurrence = [rrule];
            }
        }

        return event;
    }
};

window.GCalendarService = GCalendarService;
