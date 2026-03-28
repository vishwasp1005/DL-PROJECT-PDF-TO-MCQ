import axios from "axios";

const API = axios.create({
  baseURL: "https://dl-project-pdf-to-mcq.onrender.com",
});

// ── Request: attach JWT ──────────────────────────────────────────────────────
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

// ── Response: global 401 handler ────────────────────────────────────────────
// When the backend returns 401 (expired / invalid token) we clear the session
// and redirect the user to /login so they never see the raw "Invalid token" text.
API.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const isGuest = localStorage.getItem("isGuest") === "true";

    if (status === 401 && !isGuest) {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      localStorage.removeItem("isGuest");
      // Store a flag so LoginPage can show a friendly message
      sessionStorage.setItem("qf_session_expired", "1");
      // Hard-redirect (avoids React Router state issues from outside a component)
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default API;
