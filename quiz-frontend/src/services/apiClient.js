/**
 * apiClient — the single Axios instance for the whole app.
 *
 * v2 changes (large-PDF support):
 *   - Extended timeout: 360s (6 min) for /generate calls on large PDFs
 *   - onUploadProgress hook exposed so GeneratePage can show upload progress
 *   - 413 (file too large) error translated to a human-readable message
 *   - 504 (gateway timeout) handled with a user-friendly retry suggestion
 */
import axios from "axios";

const apiClient = axios.create({
    baseURL: "https://dl-project-pdf-to-mcq.onrender.com",
    timeout: 360_000,   // 6 minutes — covers upload + chunked LLM generation
});

// ── Auth token injection ──────────────────────────────────────────────────────
apiClient.interceptors.request.use((req) => {
    const token = localStorage.getItem("token");
    if (token) {
        req.headers.Authorization = `Bearer ${token}`;
    }
    return req;
});

// ── Response error normalisation ─────────────────────────────────────────────
apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response) {
            const status = err.response.status;

            if (status === 413) {
                err.userMessage =
                    "The PDF is too large (max 20 MB). " +
                    "Try compressing it or splitting into smaller files.";
            } else if (status === 504 || status === 524) {
                err.userMessage =
                    "The server timed out processing your PDF. " +
                    "Try reducing the number of questions or uploading a smaller file.";
            } else if (status === 401) {
                err.userMessage = "Your session expired. Please log in again.";
            }
        } else if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
            err.userMessage =
                "Request timed out. Large PDFs can take up to 5 minutes — " +
                "please try again with fewer questions if this persists.";
        }

        return Promise.reject(err);
    }
);

export default apiClient;
