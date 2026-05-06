/**
 * apiClient.js — Axios instance with silent token refresh
 * =========================================================
 * Flow:
 *   1. Every request → attaches access token from localStorage
 *   2. Response is 401 + not already retried →
 *      a. POST /auth/refresh (sends HTTP-only cookie automatically)
 *      b. Save new access token
 *      c. Retry original request transparently
 *   3. Refresh fails → clear session + redirect /login
 *
 * Concurrent 401s: queued until the single refresh completes,
 * then all retried with the new token (no duplicate refresh calls).
 */
import axios from "axios";

const BASE_URL = "https://dl-project-pdf-to-mcq.onrender.com";

const apiClient = axios.create({
    baseURL:         BASE_URL,
    timeout:         360_000,    // 6 min for large PDF uploads
    withCredentials: true,       // always send cookies cross-origin
});

// ── Request: attach access token ──────────────────────────────────────────────
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("qf_access_token");
    if (token && token !== "guest_token") {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response: silent 401 → refresh → retry ────────────────────────────────────
let _isRefreshing = false;
let _refreshQueue = [];

function _processQueue(error, token) {
    _refreshQueue.forEach((p) => error ? p.reject(error) : p.resolve(token));
    _refreshQueue = [];
}

apiClient.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;

        // Only intercept 401s that haven't already been retried
        if (error.response?.status !== 401 || original._retried) {
            return _handleError(error);
        }

        // Guest mode — don't try to refresh
        if (localStorage.getItem("qf_is_guest") === "true") {
            return Promise.reject(error);
        }

        // Another refresh is in progress — queue this request
        if (_isRefreshing) {
            return new Promise((resolve, reject) => {
                _refreshQueue.push({ resolve, reject });
            }).then((newToken) => {
                original.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(original);
            });
        }

        original._retried = true;
        _isRefreshing     = true;

        try {
            // Use raw fetch to avoid triggering this interceptor again
            const res = await fetch(`${BASE_URL}/auth/refresh`, {
                method:      "POST",
                credentials: "include",   // sends HTTP-only cookie
                headers:     { "Content-Type": "application/json" },
            });

            if (!res.ok) throw new Error("Refresh failed");

            const data     = await res.json();
            const newToken = data.access_token;

            // Persist new tokens
            localStorage.setItem("qf_access_token",  newToken);
            localStorage.setItem("qf_username",      data.username || localStorage.getItem("qf_username"));
            localStorage.setItem("qf_token_expires", String(Date.now() + (data.expires_in || 900) * 1000));

            _processQueue(null, newToken);

            // Retry the original failed request
            original.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(original);

        } catch (refreshErr) {
            _processQueue(refreshErr, null);
            _forceLogout();
            return Promise.reject(refreshErr);

        } finally {
            _isRefreshing = false;
        }
    }
);

function _forceLogout() {
    ["qf_access_token", "qf_username", "qf_is_guest", "qf_token_expires"]
        .forEach((k) => localStorage.removeItem(k));
    sessionStorage.setItem("qf_session_expired", "1");
    window.location.href = "/login";
}

function _handleError(error) {
    if (error.response?.status === 413) {
        error.userMessage = "PDF too large (max 20MB).";
    } else if (error.response?.status === 504) {
        error.userMessage = "Request timed out. Try fewer questions.";
    } else if (error.code === "ECONNABORTED") {
        error.userMessage = "Request timed out. Large PDFs can take up to 5 minutes.";
    }
    return Promise.reject(error);
}

export default apiClient;
