/**
 * AuthContext.js — Global auth state provider (v3)
 * =================================================
 *
 * Changes from v2:
 *   - Listens for the custom "qf:server-waking" event dispatched by apiClient
 *     and exposes a `serverWaking` state so pages can show a friendly
 *     "Server is waking up..." banner instead of a spinner that looks broken.
 *   - proactiveRefresh: the timer now uses msUntilExpiry() at fire-time
 *     (not at schedule-time) to avoid scheduling a refresh for an already-
 *     refreshed token when multiple refreshes happen in quick succession.
 *   - scheduleProactiveRefresh now reschedules after every successful refresh
 *     so the chain is never broken across a long session.
 */
import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useRef,
} from "react";
import {
    validateOrRefreshSession,
    startGuestSession as _startGuestSession,
    login as _login,
    register as _register,
    logout as _logout,
    refreshAccessToken,
    msUntilExpiry,
} from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [username,     setUsername]     = useState("");
    const [guest,        setGuest]        = useState(false);
    const [isLoggedIn,   setIsLoggedIn]   = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [serverWaking, setServerWaking] = useState(false);  // NEW: Render cold-start flag

    const proactiveTimer = useRef(null);

    // ── Listen for server cold-start events from apiClient ───────────────────
    useEffect(() => {
        function onServerWaking(e) {
            const { attempt, maxAttempts } = e.detail;
            setServerWaking(true);
            console.log(`[Auth] Server waking up (${attempt}/${maxAttempts})…`);
        }
        function onServerReady() {
            setServerWaking(false);
        }

        window.addEventListener("qf:server-waking", onServerWaking);
        window.addEventListener("qf:server-ready",  onServerReady);
        return () => {
            window.removeEventListener("qf:server-waking", onServerWaking);
            window.removeEventListener("qf:server-ready",  onServerReady);
        };
    }, []);

    // ── Proactive refresh: fires 90s before access token expires ─────────────
    const scheduleProactiveRefresh = useCallback(() => {
        if (proactiveTimer.current) clearTimeout(proactiveTimer.current);

        const msLeft = msUntilExpiry();
        if (msLeft <= 0) return;

        // Schedule for 90s before expiry (gives time for 2 retries if first fails)
        const delay = Math.max(0, msLeft - 90_000);

        console.log(`[Auth] Proactive refresh scheduled in ${Math.round(delay / 1000)}s`);

        proactiveTimer.current = setTimeout(async () => {
            // Re-check expiry at fire time (token may have been refreshed already)
            if (msUntilExpiry() > 90_000) {
                console.log("[Auth] Proactive refresh skipped — token already refreshed");
                scheduleProactiveRefresh();
                return;
            }

            try {
                console.log("[Auth] Proactive refresh firing…");
                await refreshAccessToken();
                console.log("[Auth] Proactive refresh succeeded");
                scheduleProactiveRefresh(); // Reschedule for the new token
            } catch (e) {
                console.warn("[Auth] Proactive refresh failed:", e.message);
                // Request interceptor will handle it on next API call
            }
        }, delay);
    }, []);

    // ── Auth hydration on page load ──────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function init() {
            console.log("[Auth] Hydrating session…");
            try {
                const result = await validateOrRefreshSession();
                if (cancelled) return;

                if (result) {
                    console.log("[Auth] Session valid —", result.username);
                    setUsername(result.username);
                    setGuest(result.isGuest || false);
                    setIsLoggedIn(true);
                    if (!result.isGuest) scheduleProactiveRefresh();
                } else {
                    console.log("[Auth] No valid session found");
                    setIsLoggedIn(false);
                }
            } catch (e) {
                console.error("[Auth] Hydration error:", e.message);
                if (!cancelled) setIsLoggedIn(false);
            } finally {
                if (!cancelled) setInitializing(false);
            }
        }

        init();
        return () => { cancelled = true; };
    }, [scheduleProactiveRefresh]);

    // Cleanup
    useEffect(() => () => {
        if (proactiveTimer.current) clearTimeout(proactiveTimer.current);
    }, []);

    // ── Actions ───────────────────────────────────────────────────────────────

    const login = useCallback(async (uname, password) => {
        const data = await _login(uname, password);
        setUsername(data.username || uname);
        setGuest(false);
        setIsLoggedIn(true);
        scheduleProactiveRefresh();
        return data;
    }, [scheduleProactiveRefresh]);

    const register = useCallback(async (uname, password) => {
        return await _register(uname, password);
    }, []);

    const startGuest = useCallback(() => {
        _startGuestSession();
        setUsername("Guest");
        setGuest(true);
        setIsLoggedIn(true);
    }, []);

    const logout = useCallback(async () => {
        if (proactiveTimer.current) clearTimeout(proactiveTimer.current);
        await _logout();
        setUsername("");
        setGuest(false);
        setIsLoggedIn(false);
    }, []);

    const value = {
        username,
        isGuest:     guest,
        isLoggedIn,
        initializing,
        serverWaking,   // NEW — pages can show "Server waking up…" banner
        login,
        register,
        startGuest,
        logout,
        token: isLoggedIn
            ? (guest ? "guest_token" : localStorage.getItem("qf_access_token"))
            : null,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuthContext() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used within <AuthProvider>");
    return ctx;
}

export default AuthContext;
