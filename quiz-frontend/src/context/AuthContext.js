import React, { createContext, useContext, useState, useCallback } from "react";
import { getToken, getUsername, isGuest, clearSession, startGuestSession, login as _login, register as _register } from "../services/authService";

const AuthContext = createContext(null);

/**
 * AuthProvider — wraps the entire app.
 * Provides: user, token, isGuest, login(), logout(), register(), startGuest()
 */
export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => getToken());
    const [username, setUsername] = useState(() => getUsername());
    const [guest, setGuest] = useState(() => isGuest());

    const login = useCallback(async (uname, password) => {
        const data = await _login(uname, password);
        setToken(data.access_token);
        setUsername(uname);
        setGuest(false);
        return data;
    }, []);

    const register = useCallback(async (uname, password) => {
        return await _register(uname, password);
    }, []);

    const startGuest = useCallback(() => {
        startGuestSession();
        setToken("guest_token");
        setUsername("Guest");
        setGuest(true);
    }, []);

    const logout = useCallback(() => {
        clearSession();
        setToken(null);
        setUsername("");
        setGuest(false);
    }, []);

    const value = {
        token,
        username,
        isGuest: guest,
        isLoggedIn: !!token,
        login,
        register,
        startGuest,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** useAuthContext — consume AuthContext (used by useAuth hook) */
export function useAuthContext() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used within <AuthProvider>");
    return ctx;
}

export default AuthContext;
