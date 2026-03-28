/**
 * authService — all /auth/* API calls + localStorage token helpers.
 * Pages can import from here instead of calling API directly.
 */
import apiClient from "./apiClient";

// ── Token Helpers ─────────────────────────────────────────────────────────────
export const getToken = () => localStorage.getItem("token");
export const getUsername = () => localStorage.getItem("username") || "";
export const isGuest = () => localStorage.getItem("isGuest") === "true";
export const isLoggedIn = () => !!getToken();

export function clearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("isGuest");
}

export function startGuestSession() {
    localStorage.setItem("token", "guest_token");
    localStorage.setItem("isGuest", "true");
    localStorage.setItem("username", "Guest");
}

// ── API Calls ─────────────────────────────────────────────────────────────────
export async function login(username, password) {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);
    const res = await apiClient.post("/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    localStorage.setItem("token", res.data.access_token);
    localStorage.setItem("username", username);
    localStorage.removeItem("isGuest");
    return res.data;
}

export async function register(username, password) {
    const res = await apiClient.post("/auth/register", { username, password });
    return res.data;
}
