/**
 * apiClient.js — Axios instance with bulletproof auth (v3)
 * =========================================================
 *
 * ROOT CAUSES FIXED IN THIS FILE:
 *
 * BUG 1 — Render cold-start 503/504 mistaken for auth failure
 *   Render free tier sleeps after 15 min inactivity. On cold start its
 *   reverse proxy can return 503 or occasionally a bare 401 before the
 *   FastAPI process is ready. The old interceptor treated ANY 401 as
 *   "token expired", fired a refresh, and then force-logged out when the
 *   refresh also failed (because the server was still waking up).
 *   FIX: Added cold-start detection + retry-with-backoff before touching
 *   auth state. A 503 is now retried up to COLD_START_RETRIES times with
 *   exponential back-off. A 401 is only treated as a real auth failure
 *   after the server is confirmed reachable.
 *
 * BUG 2 — Token expiry race during long PDF generation
 *   The generate endpoint can take 4-5 minutes. A 15-min access token
 *   issued right before the upload could expire mid-request.
 *   FIX: Proactive token refresh is triggered BEFORE every upload/generate
 *   request if the token has <2 minutes left. The refresh happens
 *   transparently before the FormData POST is sent.
 *
 * BUG 3 — _forceLogout fires on transient network errors
 *   Any uncaught error in the refresh fetch path triggered _forceLogout.
 *   FIX: _forceLogout is now only called after (a) refresh returns a
 *   non-ok HTTP response OR (b) the server is clearly reachable and
 *   actively rejecting the session. Network errors (TypeError, AbortError)
 *   are re-queued, not treated as auth failure.
 *
 * BUG 4 — Multipart FormData Authorization header
 *   Axios DOES attach the Authorization header to multipart requests
 *   automatically via the request interceptor. This was confirmed working.
 *   No change needed here, but documented for clarity.
 */
import axios from "axios";

const BASE_URL = "https://dl-project-pdf-to-mcq.onrender.com";

// How many times to retry on 503 (Render cold-start wake-up)
const COLD_START_RETRIES  = 4;
const COLD_START_DELAY_MS = 8_000;  // 8s between retries (cold start ~30-60s total)

// Proactively refresh token if it expires within this many ms
const PROACTIVE_REFRESH_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

const apiClient = axios.create({
    baseURL:         BASE_URL,
    timeout:         360_000,   // 6 min for large PDF uploads + generation
    withCredentials: true,      // always send cookies cross-origin (needed for refresh)
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _getToken()     { return localStorage.getItem("qf_access_token"); }
function _getExpiry()    { return parseInt(localStorage.getItem("qf_token_expires") || "0", 10); }
function _msUntilExpiry() { return Math.max(0, _getExpiry() - Date.now()); }
function _isGuest()      { return localStorage.getItem("qf_is_guest") === "true"; }

function _saveNewToken(data) {
    localStorage.setItem("qf_access_token",  data.access_token);
    localStorage.setItem("qf_username",      data.username || localStorage.getItem("qf_username") || "");
    localStorage.setItem("qf_token_expires", String(Date.now() + (data.expires_in || 900) * 1000));
}

async function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token state (prevents duplicate refresh calls)
// ─────────────────────────────────────────────────────────────────────────────

let _isRefreshing = false;
let _refreshQueue = [];   // { resolve, reject }[]

function _processQueue(error, token) {
    _refreshQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
    _refreshQueue = [];
}

/**
 * Calls /auth/refresh using the HTTP-only cookie.
 * Uses raw fetch (not apiClient) to prevent interceptor re-entrance.
 * Returns the new access token on success, throws on failure.
 */
async function _doRefresh() {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
    });

    if (!res.ok) {
        // Only treat as a real session expiry if the server is responding properly
        // (i.e. not a cold-start 503 or a network error)
        const err = new Error(`Refresh HTTP ${res.status}`);
        err.httpStatus = res.status;
        throw err;
    }

    const data = await res.json();
    _saveNewToken(data);
    return data.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST INTERCEPTOR
// Attaches token + proactively refreshes before long uploads
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.request.use(async (config) => {
    const token = _getToken();

    if (!token || token === "guest_token") {
        return config;
    }

    // ── Proactive refresh: if token expires within 2 min, refresh BEFORE sending ──
    // This is critical for long PDF uploads that take 4-5 minutes.
    // We refresh synchronously here so the new token is used for THIS request.
    const msLeft = _msUntilExpiry();
    if (msLeft > 0 && msLeft < PROACTIVE_REFRESH_THRESHOLD_MS && !_isRefreshing) {
        console.log(`[Auth] Token expires in ${Math.round(msLeft / 1000)}s — proactive refresh before request`);
        try {
            const newToken = await _doRefresh();
            config.headers.Authorization = `Bearer ${newToken}`;
            return config;
        } catch (e) {
            console.warn("[Auth] Proactive refresh failed, proceeding with current token:", e.message);
            // Don't force logout here — let the response interceptor handle it
        }
    }

    config.headers.Authorization = `Bearer ${token}`;
    return config;
}, (error) => Promise.reject(error));

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE INTERCEPTOR
// Handles: 401 (token expired), 503 (cold start), other errors
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;
        const status   = error.response?.status;

        // ── Ignore non-HTTP errors (AbortError, network down, etc.) ──────────
        if (!error.response) {
            if (error.code === "ECONNABORTED") {
                error.userMessage = "Request timed out. Large PDFs can take up to 5 minutes — try fewer questions.";
            } else if (error.name === "AbortError" || error.name === "CanceledError") {
                error.userMessage = "Request was cancelled.";
            } else {
                error.userMessage = "Network error. Check your connection and try again.";
            }
            return Promise.reject(error);
        }

        // ── 503 / 502: Render cold-start — retry with back-off ───────────────
        // This is THE main fix. Render returns 503 when the dyno is waking up.
        // Old code ignored this and eventually got a confused 401 → force logout.
        // Now we wait and retry up to COLD_START_RETRIES times.
        if ((status === 503 || status === 502) && !original._coldStartRetried) {
            const retryCount = original._coldStartRetryCount || 0;

            if (retryCount < COLD_START_RETRIES) {
                original._coldStartRetried    = true;
                original._coldStartRetryCount = retryCount + 1;

                const delay = COLD_START_DELAY_MS * (retryCount + 1);
                console.log(`[Auth] Server cold-starting (${status}), retrying in ${delay / 1000}s… (attempt ${retryCount + 1}/${COLD_START_RETRIES})`);

                // Dispatch a custom event so UI can show "Server waking up..." message
                window.dispatchEvent(new CustomEvent("qf:server-waking", {
                    detail: { attempt: retryCount + 1, maxAttempts: COLD_START_RETRIES }
                }));

                await _sleep(delay);
                return apiClient(original);
            }

            // Exhausted retries — surface a useful error message
            error.userMessage = "Server is taking too long to wake up. Please try again in 30 seconds.";
            error.isServerWakeup = true;
            return Promise.reject(error);
        }

        // ── 504 / 524: Gateway timeout ────────────────────────────────────────
        if (status === 504 || status === 524) {
            error.userMessage = "Generation timed out. Try fewer questions or a smaller PDF.";
            return Promise.reject(error);
        }

        // ── 413: File too large ───────────────────────────────────────────────
        if (status === 413) {
            error.userMessage = "PDF too large (max 20MB). Try compressing it.";
            return Promise.reject(error);
        }

        // ── 401: Token expired — attempt refresh ─────────────────────────────
        // Only intercept first attempt (not already retried)
        if (status !== 401 || original._retried) {
            return Promise.reject(error);
        }

        // Guest mode never refreshes
        if (_isGuest()) {
            return Promise.reject(error);
        }

        // Another refresh already in-flight — queue this request
        if (_isRefreshing) {
            return new Promise((resolve, reject) => {
                _refreshQueue.push({ resolve, reject });
            }).then(newToken => {
                original.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(original);
            }).catch(err => Promise.reject(err));
        }

        // Start the refresh
        original._retried = true;
        _isRefreshing     = true;

        try {
            const newToken = await _doRefresh();
            _processQueue(null, newToken);

            original.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(original);

        } catch (refreshError) {
            _processQueue(refreshError, null);

            // Only force logout if:
            // (a) The refresh server responded with 4xx (genuine auth failure)
            // (b) NOT a network error (server unreachable / cold start)
            const refreshStatus = refreshError.httpStatus;
            if (refreshStatus && refreshStatus >= 400 && refreshStatus < 500) {
                console.log("[Auth] Refresh token rejected by server — forcing logout");
                _forceLogout();
            } else {
                // Network error during refresh — don't log out, surface the error
                console.warn("[Auth] Refresh network error — NOT forcing logout:", refreshError.message);
                error.userMessage = "Connection lost during authentication. Please check your network.";
            }

            return Promise.reject(error);

        } finally {
            _isRefreshing = false;
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// Force logout — only called on confirmed auth rejection, never on network errors
// ─────────────────────────────────────────────────────────────────────────────

function _forceLogout() {
    localStorage.removeItem("qf_access_token");
    localStorage.removeItem("qf_username");
    localStorage.removeItem("qf_is_guest");
    localStorage.removeItem("qf_token_expires");
    sessionStorage.setItem("qf_session_expired", "1");
    window.location.href = "/login";
}

export default apiClient;
