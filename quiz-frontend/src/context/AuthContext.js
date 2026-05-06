/**
 * AuthContext.js — Global auth state provider
 * =============================================
 * - On mount: validateOrRefreshSession() → silent token check/renew
 * - `initializing`: true until auth check completes → prevents flash-logout
 * - Proactive refresh timer: fires 60s before access token expiry
 * - logout(): calls backend to revoke refresh token cookie
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
    const [initializing, setInitializing] = useState(true); // prevents redirect flash on refresh

    const proactiveTimer = useRef(null);

    // ── Proactive refresh: fires 60s before access token expires ─────────────
    const scheduleProactiveRefresh = useCallback(() => {
        if (proactiveTimer.current) clearTimeout(proactiveTimer.current);

        const msLeft = msUntilExpiry();
        if (msLeft <= 0) return;

        const delay = Math.max(0, msLeft - 60_000); // 60s before expiry

        proactiveTimer.current = setTimeout(async () => {
            try {
                await refreshAccessToken();
                scheduleProactiveRefresh(); // reschedule for the new token
            } catch (_) {
                // Interceptor handles the next 401 if proactive refresh fails
            }
        }, delay);
    }, []);

    // ── On every page load: validate or silently refresh ─────────────────────
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

    // Cleanup timer on unmount
    useEffect(() => () => {
        if (proactiveTimer.current) clearTimeout(proactiveTimer.current);
    }, []);

    // ── Auth actions ──────────────────────────────────────────────────────────

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
        login,
        register,
        startGuest,
        logout,
        // Backward compat: pages that read token from context
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
