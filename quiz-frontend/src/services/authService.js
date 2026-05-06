/**
 * authService.js — Token storage + all /auth/* API calls
 * ========================================================
 * Token strategy:
 *   - Access token  → localStorage (short-lived 15 min, fast reads)
 *   - Refresh token → HTTP-only cookie (browser manages it, JS cannot read)
 *   - Username      → localStorage (display only, not a secret)
 *
 * On page load: validateOrRefreshSession() checks token validity.
 * If expired → silently calls /auth/refresh using the cookie.
 * If refresh fails → clears session, forces login.
 */
import apiClient from "./apiClient";

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_TOKEN    = "qf_access_token";
const KEY_USERNAME = "qf_username";
const KEY_GUEST    = "qf_is_guest";
const KEY_EXPIRES  = "qf_token_expires";   // epoch ms when access token expires

// ── Token Helpers ─────────────────────────────────────────────────────────────
export const getToken    = () => localStorage.getItem(KEY_TOKEN);
export const getUsername = () => localStorage.getItem(KEY_USERNAME) || "";
export const isGuest     = () => localStorage.getItem(KEY_GUEST) === "true";
export const isLoggedIn  = () => !!getToken();

/** Milliseconds until access token expires. Returns 0 if expired/unknown. */
export function msUntilExpiry() {
    const exp = parseInt(localStorage.getItem(KEY_EXPIRES) || "0", 10);
    return Math.max(0, exp - Date.now());
}

/** Persist tokens after login or refresh. expires_in is seconds. */
export function saveSession({ access_token, username, expires_in = 900 }) {
    localStorage.setItem(KEY_TOKEN,   access_token);
    localStorage.setItem(KEY_USERNAME, username);
    localStorage.removeItem(KEY_GUEST);
    localStorage.setItem(KEY_EXPIRES, String(Date.now() + expires_in * 1000));
}

export function clearSession() {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USERNAME);
    localStorage.removeItem(KEY_GUEST);
    localStorage.removeItem(KEY_EXPIRES);
}

export function startGuestSession() {
    localStorage.setItem(KEY_TOKEN,    "guest_token");
    localStorage.setItem(KEY_USERNAME, "Guest");
    localStorage.setItem(KEY_GUEST,    "true");
    localStorage.removeItem(KEY_EXPIRES);
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/** Login — stores access token, browser stores refresh cookie automatically. */
export async function login(username, password) {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const res = await apiClient.post("/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        withCredentials: true,   // REQUIRED: browser must accept the Set-Cookie header
    });

    saveSession({
        access_token: res.data.access_token,
        username:     res.data.username || username,
        expires_in:   res.data.expires_in || 900,
    });

    return res.data;
}

/**
 * Silent refresh — uses raw fetch (not apiClient) to avoid interceptor loop.
 * Browser sends the HTTP-only cookie automatically via credentials: "include".
 */
export async function refreshAccessToken() {
    const res = await fetch(
        `${apiClient.defaults.baseURL}/auth/refresh`,
        {
            method:      "POST",
            credentials: "include",   // browser sends the HTTP-only cookie
            headers:     { "Content-Type": "application/json" },
        }
    );

    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);

    const data = await res.json();
    saveSession({
        access_token: data.access_token,
        username:     data.username || getUsername(),
        expires_in:   data.expires_in || 900,
    });

    return data.access_token;
}

/** Logout — revokes server-side refresh token, clears local state. */
export async function logout() {
    try {
        await apiClient.post("/auth/logout", {}, { withCredentials: true });
    } catch (_) {
        // Even if network fails, always clear local state
    } finally {
        clearSession();
    }
}

/** Register — create a new account. */
export async function register(username, password) {
    const res = await apiClient.post("/auth/register", { username, password });
    return res.data;
}

/**
 * Called on every page load by AuthContext.
 * 1. Guest session → return immediately
 * 2. Token valid (>60s left) → return username without any network call
 * 3. Token expired/close → silent refresh via cookie
 * 4. Refresh fails → clear session, return null (force login)
 */
export async function validateOrRefreshSession() {
    if (isGuest()) return { username: "Guest", isGuest: true };

    const token = getToken();
    if (!token) return null;

    // Token has >60s left — still valid, no refresh needed
    if (msUntilExpiry() > 60_000) {
        return { username: getUsername(), isGuest: false };
    }

    // Token expired or nearly expired — try silent refresh
    try {
        await refreshAccessToken();
        return { username: getUsername(), isGuest: false };
    } catch (_) {
        clearSession();
        return null;
    }
}
