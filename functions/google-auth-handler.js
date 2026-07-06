/**
 * Модуль для работы с Google Calendar API и авторизацией OAuth2.
 * Этот файл реализует шаги для работы с refresh_token в Firebase Cloud Functions.
 */

const { google } = require('googleapis');
const admin = require('firebase-admin');

// Инициализация OAuth2 клиента
function getOAuth2Client() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "595986762798-1pm4iaiom54d4bflvnp1hrf4iugqfvhu.apps.googleusercontent.com";
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    
    // URI перенаправления (Callback URL), настроенный в Google Cloud Console.
    // Например: https://us-central1-YOUR_PROJECT.cloudfunctions.net/oauth2Callback
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || "https://us-central1-tools-c98fd.cloudfunctions.net/oauth2Callback";

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * ШАГ 1: Генерация ссылки для авторизации (generateAuthUrl).
 * Добавляем параметры access_type: 'offline' и prompt: 'consent',
 * чтобы Google обязательно выдал refresh_token при первом входе.
 */
function generateAuthUrl() {
    const oauth2Client = getOAuth2Client();

    const scopes = [
        'https://www.googleapis.com/auth/calendar'
    ];

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Запрашиваем оффлайн-доступ для получения refresh_token
        prompt: 'consent',     // Принудительно показываем окно согласия, чтобы выдать refresh_token при каждом входе
        scope: scopes
    });

    return url;
}

/**
 * ШАГ 2: Коллбэк (Exchange code for tokens).
 * Принимает `code` от Google OAuth Redirect, обменивает его на токены,
 * извлекает `refresh_token` и сохраняет его в Firestore.
 */
async function handleOAuth2Callback(code, userId) {
    const oauth2Client = getOAuth2Client();

    try {
        // Обмениваем временный код авторизации на токены
        const { tokens } = await oauth2Client.getToken(code);
        
        // Извлекаем refresh_token и access_token
        const refreshToken = tokens.refresh_token;
        const accessToken = tokens.access_token;
        const expiryDate = tokens.expiry_date; // Время истечения access_token в миллисекундах (timestamp)

        if (!refreshToken) {
            console.warn("Внимание: Google не вернул refresh_token. Возможно, пользователь уже давал согласие ранее.");
        }

        // --- СОХРАНЕНИЕ ТОКЕНА В FIRESTORE ---
        const db = admin.firestore();
        const userDocRef = db.collection("users").doc(userId);

        const updateData = {
            google_calendar_access_token: accessToken,
            google_calendar_token_expiry: expiryDate,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        // Сохраняем refresh_token только если он пришел (при первом входе с prompt: 'consent')
        if (refreshToken) {
            updateData.google_calendar_refresh_token = refreshToken;
        }

        await userDocRef.set(updateData, { merge: true });
        console.log(`Токены успешно сохранены для пользователя: ${userId}`);

        return tokens;
    } catch (error) {
        console.error("Ошибка при обмене кода на токены:", error);
        throw error;
    }
}

/**
 * ШАГ 3: Рабочая функция (Работа с Google API).
 * Инициализирует oauth2Client только с сохраненным `refresh_token`.
 * Библиотека googleapis автоматически обновит access_token под капотом при истечении.
 */
async function listUpcomingEvents(userId) {
    // 1. Получаем refresh_token из Firestore для данного пользователя
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
        throw new Error("Пользователь не найден в базе данных.");
    }

    const userData = userDoc.data();
    const savedRefreshToken = userData.google_calendar_refresh_token;

    if (!savedRefreshToken) {
        throw new Error("Refresh token отсутствует. Пользователю необходимо пройти авторизацию повторно.");
    }

    // 2. Инициализируем клиента
    const oauth2Client = getOAuth2Client();

    // 3. Устанавливаем credentials, передавая сохраненный refresh_token.
    // Библиотека сама позаботится об автоматическом обновлении access_token при запросах!
    oauth2Client.setCredentials({
        refresh_token: savedRefreshToken
    });

    // 4. Инициализируем инстанс Google Calendar API с нашим авторизованным клиентом
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
        // Делаем тестовый запрос (например, получение списка событий)
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime',
        });

        // Слушаем событие обновления токена библиотеки googleapis, чтобы сохранить новый access_token
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
                console.log("Библиотека автоматически обновила access_token, сохраняем новый в БД...");
                const updatePayload = {
                    google_calendar_access_token: tokens.access_token,
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                };
                if (tokens.expiry_date) {
                    updatePayload.google_calendar_token_expiry = tokens.expiry_date;
                }
                await db.collection("users").doc(userId).update(updatePayload);
            }
        });

        return response.data.items;
    } catch (error) {
        console.error("Ошибка при работе с Google Calendar API:", error);
        throw error;
    }
}

module.exports = {
    generateAuthUrl,
    handleOAuth2Callback,
    listUpcomingEvents
};
