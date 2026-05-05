/**
 * AuthContext — global auth state (v2)
 * =====================================
 * Key changes from v1:
 *   - On mount: calls validateOrRefreshSession() instead of blindly reading localStorage
 *     This means page refresh silently tries to renew the token before rendering.
 *   - `initializing` state: app shows nothing (or a spinner) until auth is confirmed.
 *     Prevents the flash of "logged out" before the refresh completes.
 *   - logout() calls the backend to revoke the refresh token cookie.
 *   - Proactive refresh: sets a timer to refresh the token 60s before expiry.
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
    saveSession,
    clearSession,
    startGuestSession as _startGuestSession,
    login as _login,
    register as _register,
    logout as _logout,
    refreshAccessToken,
    msUntilExpiry,
    isGuest as _isGuest,
} from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [username,     setUsername]     = useState("");
    const [guest,        setGuest]        = useState(false);
    const [isLoggedIn,   setIsLoggedIn]   = useState(false);
    const [initializing, setInitializing] = useState(true);  // true until first auth check done

    const proactiveTimer = useRef(null);

    // ── Proactive token refresh (60s before expiry) ───────────────────────────
    const scheduleProactiveRefresh = useCallback(() => {
        if (proactiveTimer.current) clearTimeout(proactiveTimer.current);

        const msLeft = msUntilExpiry();
        if (msLeft <= 0) return;

        // Fire 60 seconds before the access token expires
        const delay = Math.max(0, msLeft - 60_000);

        proactiveTimer.current = setTimeout(async () => {
            try {
                await refreshAccessToken();
                scheduleProactiveRefresh();   // reschedule for the new token
            } catch (_) {
                // If proactive refresh fails, the interceptor will handle it on next request
            }
        }, delay);
    }, []);

    // ── Initialise auth state on page load ────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const result = await validateOrRefreshSession();

                if (cancelled) return;

                if (result) {
                    setUsername(result.username);
                    setGuest(result.isGuest || false);
                    setIsLoggedIn(true);
                    if (!result.isGuest) scheduleProactiveRefresh();
                } else {
                    setIsLoggedIn(false);
                }
            } catch (_) {
                if (!cancelled) setIsLoggedIn(false);
            } finally {
                if (!cancelled) setInitializing(false);
            }
        }

        init();
        return () => { cancelled = true; };
    }, [scheduleProactiveRefresh]);

    // ── Cleanup timer on unmount ──────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (proactiveTimer.current) clearTimeout(proactiveTimer.current);
        };
    }, []);

    // ── Login ─────────────────────────────────────────────────────────────────
    const login = useCallback(async (uname, password) => {
        const data = await _login(uname, password);
        setUsername(data.username || uname);
        setGuest(false);
        setIsLoggedIn(true);
        scheduleProactiveRefresh();
        return data;
    }, [scheduleProactiveRefresh]);

    // ── Register ──────────────────────────────────────────────────────────────
    const register = useCallback(async (uname, password) => {
        return await _register(uname, password);
    }, []);

    // ── Guest ─────────────────────────────────────────────────────────────────
    const startGuest = useCallback(() => {
        _startGuestSession();
        setUsername("Guest");
        setGuest(true);
        setIsLoggedIn(true);
    }, []);

    // ── Logout ────────────────────────────────────────────────────────────────
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
        login,
        register,
        startGuest,
        logout,
        // Legacy compat: some pages read token directly from context
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
