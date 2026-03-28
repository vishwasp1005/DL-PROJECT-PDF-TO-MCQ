import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "qf_theme";

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * ThemeProvider — wraps the app to provide light/dark theme toggle.
 * Reads the persisted theme on mount, applies it to <html> element.
 */
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(
        () => localStorage.getItem(STORAGE_KEY) || "light"
    );

    // Sync <html data-theme> on mount and whenever theme changes
    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme((t) => {
            const next = t === "light" ? "dark" : "light";
            applyTheme(next);
            return next;
        });
    }, []);

    const setLightTheme = useCallback(() => {
        setTheme("light");
    }, []);

    const setDarkTheme = useCallback(() => {
        setTheme("dark");
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setLightTheme, setDarkTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useThemeContext() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useThemeContext must be used within <ThemeProvider>");
    return ctx;
}

export default ThemeContext;
