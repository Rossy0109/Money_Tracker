import { getAnalytics, logEvent as logAnalyticsEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { app } from "./firebase-config.js";

// --- Firebase Analytics ---
let analytics;
try {
    analytics = getAnalytics(app);
    console.log("[Firebase] Analytics initialized.");
} catch (error) {
    console.warn("[Firebase] Analytics failed to initialize (likely blocked or environment issue):", error);
}

/**
 * Track custom financial events
 */
export const trackFinancialEvent = (name, params = {}) => {
    if (analytics) {
        logAnalyticsEvent(analytics, name, params);
    }
};

// --- Firebase Cloud Messaging (Push Notifications) ---
let messaging;
try {
    // Only initialize messaging in supported environments
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        messaging = getMessaging(app);
        console.log("[Firebase] Messaging initialized.");
    }
} catch (error) {
    console.warn("[Firebase] Messaging failed to initialize:", error);
}

/**
 * Request permission and get FCM token
 */
export const requestNotificationPermission = async (vapidKey) => {
    if (!messaging) return null;
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { vapidKey });
            console.log("[Firebase] FCM Token generated:", token);
            return token;
        }
        return null;
    } catch (error) {
        console.error("[Firebase] Notification permission error:", error);
        return null;
    }
};

/**
 * Handle foreground messages
 */
if (messaging) {
    onMessage(messaging, (payload) => {
        console.log("[Firebase] Foreground message received:", payload);
        // Custom UI logic for showing notifications can be added here
    });
}
