const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { google } = require("googleapis");

admin.initializeApp();

const GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl"
];

function getOAuth2Client() {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "595986762798-1pm4iaiom54d4bflvnp1hrf4iugqfvhu.apps.googleusercontent.com";
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || "https://us-central1-tools-c98fd.cloudfunctions.net/googleCalendarCallback";
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Универсальная функция обновления Google токена (Calendar + YouTube)
async function performTokenRefresh(uid) {
    const db = admin.firestore();
    const userDocRef = db.collection("users").doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
        throw new HttpsError("not-found", "Документ пользователя не найден в базе данных.");
    }

    const userData = userDoc.data();
    const refreshToken = userData.google_refresh_token || userData.google_calendar_refresh_token || userData.google_youtube_refresh_token;

    if (!refreshToken) {
        throw new HttpsError(
            "failed-precondition",
            "Не найден Refresh Token для Google аккаунта. Пожалуйста, подключите аккаунт заново."
        );
    }

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "595986762798-1pm4iaiom54d4bflvnp1hrf4iugqfvhu.apps.googleusercontent.com";
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientSecret) {
        throw new HttpsError(
            "internal",
            "На сервере не настроен GOOGLE_CALENDAR_CLIENT_SECRET. Пожалуйста, добавьте его в переменные окружения Firebase."
        );
    }

    console.log(`Обновление Google токена (YouTube + Calendar) для пользователя ${uid}...`);

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
        if (tokenData.error === "invalid_grant") {
            await userDocRef.update({
                google_access_token: admin.firestore.FieldValue.delete(),
                google_refresh_token: admin.firestore.FieldValue.delete(),
                google_token_expiry: admin.firestore.FieldValue.delete(),
                google_calendar_access_token: admin.firestore.FieldValue.delete(),
                google_calendar_refresh_token: admin.firestore.FieldValue.delete(),
                google_calendar_token_expiry: admin.firestore.FieldValue.delete(),
                google_youtube_access_token: admin.firestore.FieldValue.delete(),
                google_youtube_refresh_token: admin.firestore.FieldValue.delete(),
                google_youtube_token_expiry: admin.firestore.FieldValue.delete()
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

    await userDocRef.update({
        google_access_token: accessToken,
        google_token_expiry: expiryTime,
        google_calendar_access_token: accessToken,
        google_calendar_token_expiry: expiryTime,
        google_youtube_access_token: accessToken,
        google_youtube_token_expiry: expiryTime,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Google токен успешно обновлен для пользователя ${uid}`);

    return {
        access_token: accessToken,
        token_expiry: expiryTime
    };
}

exports.refreshCalendarToken = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Запрос должен быть отправлен от авторизованного пользователя.");
    }
    return performTokenRefresh(request.auth.uid);
});

exports.refreshYouTubeToken = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Запрос должен быть отправлен от авторизованного пользователя.");
    }
    return performTokenRefresh(request.auth.uid);
});

exports.refreshGoogleToken = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Запрос должен быть отправлен от авторизованного пользователя.");
    }
    return performTokenRefresh(request.auth.uid);
});

// Генерируем URL для авторизации Google API с офлайн-доступом
exports.getCalendarAuthUrl = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Запрос должен быть отправлен от авторизованного пользователя.");
    }
    const uid = request.auth.uid;
    const returnUrl = request.data?.returnUrl || null;
    const statePayload = returnUrl ? JSON.stringify({ uid, returnUrl }) : uid;
    
    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: GOOGLE_SCOPES,
        state: statePayload
    });
    return { url };
});

exports.getYouTubeAuthUrl = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Запрос должен быть отправлен от авторизованного пользователя.");
    }
    const uid = request.auth.uid;
    const returnUrl = request.data?.returnUrl || null;
    const statePayload = returnUrl ? JSON.stringify({ uid, returnUrl }) : uid;

    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: GOOGLE_SCOPES,
        state: statePayload
    });
    return { url };
});

// Коллбэк-эндпоинт, который Google вызывает после успешного входа
exports.googleCalendarCallback = onRequest({ cors: true }, async (req, res) => {
    const code = req.query.code;
    const rawState = req.query.state;

    if (!code || !rawState) {
        return res.status(400).send("Не передан код авторизации или ID пользователя.");
    }

    let uid = rawState;
    let redirectUrl = process.env.FRONTEND_URL || "https://rematrin.github.io/tools/todo.html";

    try {
        const parsed = JSON.parse(rawState);
        if (parsed.uid) uid = parsed.uid;
        if (parsed.returnUrl) redirectUrl = parsed.returnUrl;
    } catch (e) {
        // rawState был простым uid
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        const db = admin.firestore();
        const expiryTime = tokens.expiry_date || (Date.now() + (tokens.expires_in || 3600) * 1000);
        const updateData = {
            google_access_token: tokens.access_token,
            google_token_expiry: expiryTime,
            google_calendar_access_token: tokens.access_token,
            google_calendar_token_expiry: expiryTime,
            google_youtube_access_token: tokens.access_token,
            google_youtube_token_expiry: expiryTime,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        if (tokens.refresh_token) {
            updateData.google_refresh_token = tokens.refresh_token;
            updateData.google_calendar_refresh_token = tokens.refresh_token;
            updateData.google_youtube_refresh_token = tokens.refresh_token;
        }

        await db.collection("users").doc(uid).set(updateData, { merge: true });

        // Перенаправляем пользователя обратно на фронтенд
        res.redirect(redirectUrl);
    } catch (error) {
        console.error("Ошибка в googleCalendarCallback:", error);
        res.status(500).send("Ошибка авторизации Google: " + error.message);
    }
});

