const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { google } = require("googleapis");

admin.initializeApp();

function getOAuth2Client() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "595986762798-1pm4iaiom54d4bflvnp1hrf4iugqfvhu.apps.googleusercontent.com";
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || "https://us-central1-tools-c98fd.cloudfunctions.net/googleCalendarCallback";
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}


exports.refreshCalendarToken = onCall({ cors: true }, async (request) => {
    // 1. Проверяем, авторизован ли пользователь в Firebase
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Запрос должен быть отправлен от авторизованного пользователя."
        );
    }

    const uid = request.auth.uid;
    const db = admin.firestore();

    try {
        // 2. Получаем refresh token из документа пользователя в Firestore
        const userDocRef = db.collection("users").doc(uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            throw new HttpsError(
                "not-found",
                "Документ пользователя не найден в базе данных."
            );
        }

        const userData = userDoc.data();
        const refreshToken = userData.google_calendar_refresh_token;

        if (!refreshToken) {
            throw new HttpsError(
                "failed-precondition",
                "Не найден Refresh Token для Google Календаря. Пожалуйста, подключите календарь заново."
            );
        }

        // 3. Достаем Client ID и Client Secret
        const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "595986762798-1pm4iaiom54d4bflvnp1hrf4iugqfvhu.apps.googleusercontent.com";
        const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

        if (!clientSecret) {
            throw new HttpsError(
                "internal",
                "На сервере не настроен GOOGLE_CALENDAR_CLIENT_SECRET. Пожалуйста, добавьте его в переменные окружения Firebase."
            );
        }

        console.log(`Обновление токена Google Calendar для пользователя ${uid}...`);

        // 4. Делаем запрос к Google OAuth API для получения нового Access Token
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: "refresh_token"
            }).toString()
        });

        const tokenData = await response.json();

        if (!response.ok) {
            console.error("Ошибка обмена токена Google API:", tokenData);
            
            // Если токен инвалидирован пользователем (revoked/expired), очищаем данные в БД
            if (tokenData.error === "invalid_grant") {
                await userDocRef.update({
                    google_calendar_access_token: admin.firestore.FieldValue.delete(),
                    google_calendar_refresh_token: admin.firestore.FieldValue.delete(),
                    google_calendar_token_expiry: admin.firestore.FieldValue.delete()
                });
            }

            throw new HttpsError(
                "permission-denied",
                `Google API Error: ${tokenData.error_description || tokenData.error || "Неизвестная ошибка"}`
            );
        }

        const accessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;
        const expiryTime = Date.now() + expiresIn * 1000;

        // 5. Записываем новый токен в Firestore пользователя
        await userDocRef.update({
            google_calendar_access_token: accessToken,
            google_calendar_token_expiry: expiryTime,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Токен Google Calendar успешно обновлен для пользователя ${uid}`);

        return {
            access_token: accessToken,
            token_expiry: expiryTime
        };

    } catch (error) {
        console.error("Ошибка в функции refreshCalendarToken:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message || "Внутренняя ошибка сервера при обновлении токена.");
    }
});

// Генерируем URL для авторизации Google API с офлайн-доступом
exports.getCalendarAuthUrl = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Запрос должен быть отправлен от авторизованного пользователя.");
    }
    const uid = request.auth.uid;
    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/calendar"],
        state: uid
    });
    return { url };
});

// Коллбэк-эндпоинт, который Google вызывает после успешного входа
exports.googleCalendarCallback = onRequest({ cors: true }, async (req, res) => {
    const code = req.query.code;
    const uid = req.query.state;

    if (!code || !uid) {
        return res.status(400).send("Не передан код авторизации или ID пользователя.");
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        const db = admin.firestore();
        const updateData = {
            google_calendar_access_token: tokens.access_token,
            google_calendar_token_expiry: tokens.expiry_date || (Date.now() + (tokens.expires_in || 3600) * 1000),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        if (tokens.refresh_token) {
            updateData.google_calendar_refresh_token = tokens.refresh_token;
        }

        await db.collection("users").doc(uid).set(updateData, { merge: true });

        // Перенаправляем пользователя обратно на фронтенд GitHub Pages
        const redirectUrl = process.env.FRONTEND_URL || "https://rematrin.github.io/tools/todo.html";
        res.redirect(redirectUrl);
    } catch (error) {
        console.error("Ошибка в googleCalendarCallback:", error);
        res.status(500).send("Ошибка авторизации Google Calendar: " + error.message);
    }
});

