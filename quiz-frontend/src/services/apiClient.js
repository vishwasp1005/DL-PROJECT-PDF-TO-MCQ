/**
 * apiClient — Axios instance with automatic token refresh (v2)
 * =============================================================
 * How it works:
 *   1. Every request attaches the access token from localStorage
 *   2. If a response is 401 AND we haven't already retried:
 *      a. Call refreshAccessToken() → hits /auth/refresh with the HTTP-only cookie
 *      b. Store the new access token
 *      c. Retry the original request with the new token
 *   3. If refresh itself fails → clear session + redirect to /login
 *
 * This means a 15-min access token expiry is INVISIBLE to the user.
 * The user only sees /login when their 7-day refresh token has expired.
 */
import axios from "axios";

const BASE_URL = "https://dl-project-pdf-to-mcq.onrender.com";

const apiClient = axios.create({
    baseURL:         BASE_URL,
    timeout:         360_000,
    withCredentials: true,   // always send cookies (needed for /auth/refresh)
});

// ── Request interceptor: attach access token ──────────────────────────────────
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("qf_access_token");
    if (token && token !== "guest_token") {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response interceptor: silent refresh on 401 ───────────────────────────────
let _isRefreshing    = false;       // guard against concurrent refresh calls
let _refreshQueue    = [];          // queue requests that arrived during refresh

function _processQueue(error, token) {
    _refreshQueue.forEach((prom) => {
        if (error) prom.reject(error);
        else       prom.resolve(token);
    });
    _refreshQueue = [];
}

apiClient.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;

        // Only intercept 401s that haven't already been retried
        if (error.response?.status !== 401 || original._retried) {
            return _handleNonRefreshError(error);
        }

        const isGuestMode = localStorage.getItem("qf_is_guest") === "true";
        if (isGuestMode) {
            return Promise.reject(error);
        }

        // If a refresh is already in progress, queue this request
        if (_isRefreshing) {
            return new Promise((resolve, reject) => {
                _refreshQueue.push({ resolve, reject });
            }).then((newToken) => {
                original.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(original);
            });
        }

        original._retried = true;
        _isRefreshing = true;

        try {
            // Call refresh endpoint directly (not via apiClient to avoid loop)
            const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
                method:      "POST",
                credentials: "include",
                headers:     { "Content-Type": "application/json" },
            });

            if (!refreshRes.ok) throw new Error("Refresh failed");

            const data = await refreshRes.json();
            const newToken = data.access_token;

            // Persist new token
            localStorage.setItem("qf_access_token", newToken);
            localStorage.setItem("qf_username",     data.username || localStorage.getItem("qf_username"));
            localStorage.setItem("qf_token_expires", String(Date.now() + (data.expires_in || 900) * 1000));

            // Resume queued requests
            _processQueue(null, newToken);

            // Retry the original request
            original.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(original);

        } catch (refreshError) {
            _processQueue(refreshError, null);

            // Refresh token expired → force re-login
            _forceLogout();
            return Promise.reject(refreshError);

        } finally {
            _isRefreshing = false;
        }
    }
);

function _forceLogout() {
    localStorage.removeItem("qf_access_token");
    localStorage.removeItem("qf_username");
    localStorage.removeItem("qf_is_guest");
    localStorage.removeItem("qf_token_expires");
    sessionStorage.setItem("qf_session_expired", "1");
    window.location.href = "/login";
}

function _handleNonRefreshError(error) {
    if (error.response) {
        const status = error.response.status;
        if (status === 413) {
            error.userMessage = "PDF too large (max 20MB). Try compressing it.";
        } else if (status === 504 || status === 524) {
            error.userMessage = "Request timed out. Try fewer questions.";
        }
    } else if (error.code === "ECONNABORTED") {
        error.userMessage = "Request timed out. Large PDFs can take up to 5 minutes.";
    }
    return Promise.reject(error);
}

export default apiClient;
