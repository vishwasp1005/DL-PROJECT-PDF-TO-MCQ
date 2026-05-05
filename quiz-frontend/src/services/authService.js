/**
 * authService — all /auth/* API calls + token storage helpers (v2)
 * =================================================================
 * Token strategy:
 *   - Access token: stored in localStorage (survives refresh, fast reads)
 *   - Refresh token: HTTP-only cookie managed by browser (JS-inaccessible)
 *   - Username: localStorage (display only, not a secret)
 *
 * Why localStorage for access token?
 *   The access token is SHORT-LIVED (15 min). Even if read by XSS, it expires
 *   quickly. The long-lived refresh token is fully protected in an HTTP-only
 *   cookie — that is the critical secret. This is the standard SPA approach.
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

/**
 * How many milliseconds until the access token expires?
 * Returns 0 if already expired or unknown.
 */
export function msUntilExpiry() {
    const exp = parseInt(localStorage.getItem(KEY_EXPIRES) || "0", 10);
    return Math.max(0, exp - Date.now());
}

/**
 * Save tokens returned by /auth/login or /auth/refresh.
 * `expires_in` is seconds from now (e.g. 900 for 15 min).
 */
export function saveSession({ access_token, username, expires_in = 900 }) {
    localStorage.setItem(KEY_TOKEN, access_token);
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

/**
 * Login — POSTs credentials, stores access token, browser stores refresh cookie.
 */
export async function login(username, password) {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const res = await apiClient.post("/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        withCredentials: true,   // REQUIRED: tells browser to accept the Set-Cookie header
    });

    saveSession({
        access_token: res.data.access_token,
        username:     res.data.username || username,
        expires_in:   res.data.expires_in || 900,
    });

    return res.data;
}

/**
 * Silent token refresh — called by Axios interceptor on 401.
 * The browser automatically sends the HTTP-only refresh cookie.
 * Returns the new access token string, or throws if refresh fails.
 */
export async function refreshAccessToken() {
    // Use a raw fetch (not apiClient) to avoid the 401 interceptor re-triggering itself
    const res = await fetch(
        `${apiClient.defaults.baseURL}/auth/refresh`,
        {
            method:      "POST",
            credentials: "include",   // sends the HTTP-only cookie
            headers:     { "Content-Type": "application/json" },
        }
    );

    if (!res.ok) {
        throw new Error(`Refresh failed: ${res.status}`);
    }

    const data = await res.json();

    saveSession({
        access_token: data.access_token,
        username:     data.username || getUsername(),
        expires_in:   data.expires_in || 900,
    });

    return data.access_token;
}

/**
 * Logout — calls backend to revoke refresh token, clears local state.
 */
export async function logout() {
    try {
        await apiClient.post("/auth/logout", {}, { withCredentials: true });
    } catch (_) {
        // Even if the network call fails, clear local state
    } finally {
        clearSession();
    }
}

/**
 * Register — creates a new account.
 */
export async function register(username, password) {
    const res = await apiClient.post("/auth/register", { username, password });
    return res.data;
}

/**
 * Validate current session on page load.
 * 1. If access token exists and not expired → OK (return username)
 * 2. If access token expired/missing → attempt silent refresh via cookie
 * 3. If refresh fails → clear session, return null
 */
export async function validateOrRefreshSession() {
    if (isGuest()) return { username: "Guest", isGuest: true };

    const token = getToken();
    if (!token) return null;

    // If token not expired yet (with 60s buffer), trust it
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
