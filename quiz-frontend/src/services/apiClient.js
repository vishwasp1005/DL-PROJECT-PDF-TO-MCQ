/**
 * apiClient.js — Axios instance with bulletproof auth (v4)
 * =========================================================
 *
 * ROOT CAUSE OF ALL LOGOUT ISSUES (found via screenshot analysis):
 *
 * PRIMARY BUG — SameSite="lax" cookie blocked cross-origin
 * ──────────────────────────────────────────────────────────
 * Frontend: dl-project-pdf-to-mcq.vercel.app
 * Backend:  dl-project-pdf-to-mcq.onrender.com
 *
 * These are DIFFERENT domains. With SameSite="lax", browsers BLOCK cookies
 * on cross-site POST requests (fetch/XHR). This means the /auth/refresh
 * POST from Vercel → Render NEVER sent the refresh cookie.
 * Backend saw no cookie → returned 401 → _forceLogout() fired → user logged out.
 *
 * Fix on backend (auth.py): samesite="none", secure=True, path="/"
 * Fix on frontend (here): ensure withCredentials:true on all calls ✓ (already set)
 *
 * SECONDARY BUG — AbortController signal leaked into retry requests
 * ────────────────────────────────────────────────────────────────
 * The analyze call passes { signal: controller.signal } to Axios.
 * When the 401 interceptor retried the request with apiClient(original),
 * the original config still contained the already-fired AbortController signal.
 * The retry was immediately canceled (ERR_CANCELED) which masked the real error.
 * Fix: Strip the signal from config before retrying.
 *
 * TERTIARY BUG — ERR_CANCELED not recognized by name check
 * ─────────────────────────────────────────────────────────
 * Axios wraps AbortController cancellation as { code: "ERR_CANCELED" },
 * NOT { name: "CanceledError" }. The old check missed it.
 * Fix: Check error.code === "ERR_CANCELED" || axios.isCancel(error)
 */
import axios from "axios";

const BASE_URL = "https://dl-project-pdf-to-mcq.onrender.com";

const COLD_START_RETRIES          = 4;
const COLD_START_DELAY_MS         = 8_000;
const PROACTIVE_REFRESH_MS        = 2 * 60 * 1000; // refresh if <2min left

const apiClient = axios.create({
    baseURL:         BASE_URL,
    timeout:         360_000,
    withCredentials: true,   // sends cookies cross-origin (REQUIRED for refresh cookie)
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function _getToken()      { return localStorage.getItem("qf_access_token"); }
function _getExpiry()     { return parseInt(localStorage.getItem("qf_token_expires") || "0", 10); }
function _msUntilExpiry() { return Math.max(0, _getExpiry() - Date.now()); }
function _isGuest()       { return localStorage.getItem("qf_is_guest") === "true"; }
function _sleep(ms)       { return new Promise(r => setTimeout(r, ms)); }

function _saveNewToken(data) {
    localStorage.setItem("qf_access_token",  data.access_token);
    localStorage.setItem("qf_username",      data.username || localStorage.getItem("qf_username") || "");
    localStorage.setItem("qf_token_expires", String(Date.now() + (data.expires_in || 900) * 1000));
}

// ── Refresh token concurrency guard ──────────────────────────────────────────
let _isRefreshing = false;
let _refreshQueue = [];

function _processQueue(error, token) {
    _refreshQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
    _refreshQueue = [];
}

/**
 * Call /auth/refresh using the HTTP-only cookie.
 * Uses raw fetch (not apiClient) to prevent interceptor recursion.
 *
 * IMPORTANT: The cookie must have SameSite=none for this cross-origin
 * fetch to include the cookie. This is fixed on the backend in auth.py.
 */
async function _doRefresh() {
    const controller = new AbortController();
    const tid        = setTimeout(() => controller.abort(), 20_000); // 20s timeout

    let res;
    try {
        res = await fetch(`${BASE_URL}/auth/refresh`, {
            method:      "POST",
            credentials: "include",  // sends HTTP-only cookie (requires SameSite=none cross-origin)
            headers:     { "Content-Type": "application/json" },
            signal:      controller.signal,
        });
    } finally {
        clearTimeout(tid);
    }

    if (!res.ok) {
        const err = new Error(`Refresh HTTP ${res.status}`);
        err.httpStatus = res.status;
        throw err;
    }

    const data = await res.json();
    _saveNewToken(data);
    return data.access_token;
}

// ── REQUEST INTERCEPTOR: attach token + proactive pre-refresh ─────────────────
apiClient.interceptors.request.use(async (config) => {
    const token = _getToken();
    if (!token || token === "guest_token") return config;

    // Proactive: if token expires in <2min, refresh BEFORE sending the request
    // This is critical for the ~5min PDF generate call — token must be fresh at start
    const msLeft = _msUntilExpiry();
    if (msLeft > 0 && msLeft < PROACTIVE_REFRESH_MS && !_isRefreshing) {
        console.log(`[Auth] Token expires in ${Math.round(msLeft / 1000)}s — refreshing before request`);
        try {
            const newToken = await _doRefresh();
            config.headers.Authorization = `Bearer ${newToken}`;
            return config;
        } catch (e) {
            console.warn("[Auth] Pre-request refresh failed:", e.message);
            // Continue with existing token; response interceptor handles resulting 401
        }
    }

    config.headers.Authorization = `Bearer ${token}`;
    return config;
}, err => Promise.reject(err));

// ── RESPONSE INTERCEPTOR ──────────────────────────────────────────────────────
apiClient.interceptors.response.use(
    (res) => {
        // Server responded OK — clear any "server waking" UI state
        window.dispatchEvent(new CustomEvent("qf:server-ready"));
        return res;
    },
    async (error) => {
        const original = error.config;
        const status   = error.response?.status;

        // ── No HTTP response: network / timeout / cancel errors ───────────────
        if (!error.response) {
            // Axios AbortController cancellation → code is "ERR_CANCELED"
            if (error.code === "ERR_CANCELED" || axios.isCancel(error)) {
                error.userMessage = "Request was cancelled.";
                return Promise.reject(error);
            }
            if (error.code === "ECONNABORTED") {
                error.userMessage = "Request timed out. Large PDFs can take up to 5 minutes — try fewer questions.";
                return Promise.reject(error);
            }
            error.userMessage = "Network error. Check your connection and try again.";
            return Promise.reject(error);
        }

        // ── 503 / 502: Server cold-starting (Render free tier) ───────────────
        if (status === 503 || status === 502) {
            const retryCount = original._coldStartRetryCount || 0;

            if (retryCount < COLD_START_RETRIES) {
                original._coldStartRetryCount = retryCount + 1;
                const delay = COLD_START_DELAY_MS * (retryCount + 1);

                console.log(`[Auth] Server cold-start (${status}), retry ${retryCount + 1}/${COLD_START_RETRIES} in ${delay / 1000}s…`);
                window.dispatchEvent(new CustomEvent("qf:server-waking", {
                    detail: { attempt: retryCount + 1, maxAttempts: COLD_START_RETRIES }
                }));

                await _sleep(delay);

                // IMPORTANT: Strip AbortController signal from retry config.
                // If the original request had a signal that already fired,
                // the retry would instantly cancel. Always retry without the original signal.
                const retryConfig = { ...original, signal: undefined };
                return apiClient(retryConfig);
            }

            error.userMessage = "Server took too long to wake up. Please try again in 30 seconds.";
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
            error.userMessage = "PDF too large (max 25MB). Try compressing it.";
            return Promise.reject(error);
        }

        // ── 429: Rate limited ─────────────────────────────────────────────────
        if (status === 429) {
            error.userMessage = "Too many requests. Please wait 30 seconds and try again.";
            return Promise.reject(error);
        }

        // ── 401: Token expired — attempt refresh + retry ─────────────────────
        if (status !== 401 || original._retried) {
            return Promise.reject(error);
        }

        if (_isGuest()) return Promise.reject(error);

        // Queue concurrent 401s — only one refresh runs at a time
        if (_isRefreshing) {
            return new Promise((resolve, reject) => {
                _refreshQueue.push({ resolve, reject });
            }).then(newToken => {
                // IMPORTANT: Strip signal before retry (same fix as cold-start)
                const retryConfig = { ...original, signal: undefined };
                retryConfig.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(retryConfig);
            });
        }

        original._retried = true;
        _isRefreshing     = true;

        try {
            console.log("[Auth] 401 received — attempting token refresh…");
            const newToken = await _doRefresh();
            console.log("[Auth] Token refreshed successfully");
            _processQueue(null, newToken);

            // Strip signal before retry
            const retryConfig = { ...original, signal: undefined };
            retryConfig.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(retryConfig);

        } catch (refreshError) {
            _processQueue(refreshError, null);

            const refreshStatus = refreshError.httpStatus;
            if (refreshStatus && refreshStatus >= 400 && refreshStatus < 500) {
                // Server actively rejected the session (genuine auth failure)
                console.error("[Auth] Refresh rejected with HTTP", refreshStatus, "— forcing logout");
                _forceLogout();
            } else {
                // Network error (AbortError, timeout, server unreachable)
                // Do NOT log the user out — it's a connectivity issue, not an auth issue
                console.warn("[Auth] Refresh network error — keeping session:", refreshError.message);
                error.userMessage = "Connection lost. Please check your network and try again.";
            }

            return Promise.reject(error);

        } finally {
            _isRefreshing = false;
        }
    }
);

// ── Force logout — ONLY called on confirmed server-side auth rejection ────────
function _forceLogout() {
    localStorage.removeItem("qf_access_token");
    localStorage.removeItem("qf_username");
    localStorage.removeItem("qf_is_guest");
    localStorage.removeItem("qf_token_expires");
    sessionStorage.setItem("qf_session_expired", "1");
    window.location.href = "/login";
}

export default apiClient;
