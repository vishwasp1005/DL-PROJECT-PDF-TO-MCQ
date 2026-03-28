/**
 * apiClient — the single Axios instance for the whole app.
 * This is the canonical import going forward; api.js stays as a
 * backward-compat re-export so existing pages don't break.
 */
import axios from "axios";

const apiClient = axios.create({
    baseURL: "https://dl-project-pdf-to-mcq.onrender.com",
});

apiClient.interceptors.request.use((req) => {
    const token = localStorage.getItem("token");
    if (token) {
        req.headers.Authorization = `Bearer ${token}`;
    }
    return req;
});

export default apiClient;
