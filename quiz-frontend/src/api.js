/**
 * src/api.js — Compatibility shim (v4 — BUG FIX)
 * =================================================
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                        ROOT CAUSE OF THE BUG                           ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                          ║
 * ║  This file was the PRIMARY cause of the session-drop / redirect bug.    ║
 * ║                                                                          ║
 * ║  The old version of this file had TWO fatal flaws:                       ║
 * ║                                                                          ║
 * ║  FLAW 1 — WRONG localStorage KEY                                         ║
 * ║    The request interceptor read: localStorage.getItem("token")           ║
 * ║    But authService.js stores the token under: "qf_access_token"          ║
 * ║    Result: the Authorization header was NEVER attached to ANY request    ║
 * ║    made via this client (upload, analyze, history, dashboard, etc.)      ║
 * ║    Every request went to the backend as if it was unauthenticated.       ║
 * ║                                                                          ║
 * ║  FLAW 2 — DUMB HARD REDIRECT ON ANY 401                                 ║
 * ║    The response interceptor did:                                          ║
 * ║      if (status === 401) { window.location.href = "/login"; }            ║
 * ║    This fired INSTANTLY without:                                          ║
 * ║      a) attempting a silent token refresh (the /auth/refresh flow)       ║
 * ║      b) checking whether the 401 was caused by a cold-start 503          ║
 * ║         that Render's proxy temporarily misreported as 401               ║
 * ║      c) checking whether the guest flag was stored under the NEW key     ║
 * ║         "qf_is_guest" (not the old "isGuest" this file was checking)     ║
 * ║    Result: any unauth'd request → immediate hard redirect → logged out.  ║
 * ║                                                                          ║
 * ║  COMBINED EFFECT:                                                        ║
 * ║    1. User logs in  → token saved as "qf_access_token"                  ║
 * ║    2. User opens Generate page                                           ║
 * ║    3. Page calls API.post("/quiz/analyze", formData) via this file       ║
 * ║    4. This file reads localStorage.getItem("token") → null               ║
 * ║    5. Authorization header is omitted                                    ║
 * ║    6. Backend returns 401 Unauthorized                                   ║
 * ║    7. This interceptor fires window.location.href = "/login"             ║
 * ║    8. User is kicked back to the login page instantly                    ║
 * ║                                                                          ║
 * ║  This bug affects ALL 7 pages that imported from "../api":               ║
 * ║    GeneratePage, DashboardPage, HistoryPage, LeaderboardPage,            ║
 * ║    QuizPage, TestPage, RegisterPage                                      ║
 * ║                                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * THE FIX:
 *   Replace the broken legacy client entirely. All pages importing from
 *   "../api" now get the correctly-configured apiClient from services/,
 *   which:
 *     ✅ Reads the token from the correct key ("qf_access_token")
 *     ✅ Checks the guest flag from the correct key ("qf_is_guest")
 *     ✅ Attempts a silent token refresh on 401 BEFORE redirecting
 *     ✅ Only hard-redirects on confirmed server-side auth rejection (4xx)
 *     ✅ Retries on Render cold-start 503/502 instead of treating them
 *        as auth failures
 *     ✅ Correctly attaches Authorization to multipart/form-data requests
 *        (the Axios request interceptor runs regardless of Content-Type)
 *
 * No changes needed to any of the 7 importing pages — this shim is a
 * drop-in replacement.
 */
export { default } from "./services/apiClient";
