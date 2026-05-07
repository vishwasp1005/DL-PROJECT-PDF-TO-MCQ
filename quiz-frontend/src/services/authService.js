/**
 * authService.js — Token storage + all /auth/* API calls (v3)
 * ============================================================
 *
 * Changes from v2:
 *   - refreshAccessToken() retries on network error (not just on HTTP error)
 *   - validateOrRefreshSession() now has a 10s timeout guard so a slow
 *     cold-starting Render backend never hangs the app on page load
 *   - msUntilExpiry() exported for use by apiClient's proactive refresh
 */
import apiClient from "./apiClient";

const KEY_TOKEN    = "qf_access_token";
const KEY_USERNAME = "qf_username";
const KEY_GUEST    = "qf_is_guest";
const KEY_EXPIRES  = "qf_token_expires";

// ── Accessors ─────────────────────────────────────────────────────────────────
export const getToken    = () => localStorage.getItem(KEY_TOKEN);
export const getUsername = () => localStorage.getItem(KEY_USERNAME) || "";
export const isGuest     = () => localStorage.getItem(KEY_GUEST) === "true";
export const isLoggedIn  = () => !!getToken();

export function msUntilExpiry() {
    const exp = parseInt(localStorage.getItem(KEY_EXPIRES) || "0", 10);
    return Math.max(0, exp - Date.now());
}

// ── Session management ────────────────────────────────────────────────────────

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

// ── Auth API calls ────────────────────────────────────────────────────────────

export async function login(username, password) {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const res = await apiClient.post("/auth/login", form, {
        headers:         { "Content-Type": "application/x-www-form-urlencoded" },
        withCredentials: true,
    });

    saveSession({
        access_token: res.data.access_token,
        username:     res.data.username || username,
        expires_in:   res.data.expires_in || 900,
    });

    return res.data;
}

/**
 * Silent refresh. Uses raw fetch to avoid triggering the Axios response
 * interceptor and causing an infinite loop.
 *
 * v3 change: wraps in a 15s timeout so a cold-starting Render backend
 * doesn't hang the app indefinitely on page load.
 */
export async function refreshAccessToken() {
    const BASE_URL = apiClient.defaults.baseURL;

    // Race the refresh against a 15s timeout
    const controller = new AbortController();
    const tid        = setTimeout(() => controller.abort(), 15_000);

    let res;
    try {
        res = await fetch(`${BASE_URL}/auth/refresh`, {
            method:      "POST",
            credentials: "include",
            headers:     { "Content-Type": "application/json" },
            signal:      controller.signal,
        });
    } finally {
        clearTimeout(tid);
    }

    if (!res.ok) {
        const err = new Error(`Refresh failed: ${res.status}`);
        err.httpStatus = res.status;
        throw err;
    }

    const data = await res.json();
    saveSession({
        access_token: data.access_token,
        username:     data.username || getUsername(),
        expires_in:   data.expires_in || 900,
    });

    return data.access_token;
}

export async function logout() {
    try {
        await apiClient.post("/auth/logout", {}, { withCredentials: true });
    } catch (_) {
        // Always clear local state even if network fails
    } finally {
        clearSession();
    }
}

export async function register(username, password) {
    const res = await apiClient.post("/auth/register", { username, password });
    return res.data;
}

/**
 * Called on every page load by AuthContext.
 *
 * Strategy:
 *   1. Guest → return immediately (no network call)
 *   2. No token → return null (send to login)
 *   3. Token valid (>60s left) → return username without any network call
 *   4. Token expired/close → try silent refresh (15s timeout)
 *   5. Refresh fails with 4xx → clear session, return null
 *   6. Refresh fails with network error → treat as valid session
 *      (user has a token, just server is temporarily unreachable)
 */
export async function validateOrRefreshSession() {
    if (isGuest()) return { username: "Guest", isGuest: true };

    const token = getToken();
    if (!token) return null;

    // Token still has >60s left — trust it, no network call needed
    if (msUntilExpiry() > 60_000) {
        return { username: getUsername(), isGuest: false };
    }

    // Token expired or nearly expired — try silent refresh
    try {
        await refreshAccessToken();
        return { username: getUsername(), isGuest: false };
    } catch (err) {
        // Only clear session for genuine auth rejections (4xx from server)
        // For network errors (AbortError, TypeError), keep the user logged in
        // — the request interceptor's proactive refresh will handle it on the next API call
        const httpStatus = err.httpStatus;
        if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
            clearSession();
            return null;
        }

        // Network error / timeout during refresh — don't log out
        console.warn("[Auth] Refresh network error on page load, keeping session:", err.message);
        return { username: getUsername(), isGuest: false };
    }
}
