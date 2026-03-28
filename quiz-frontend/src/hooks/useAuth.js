/**
 * useAuth — reads from AuthContext.
 * Any component or page can do:
 *   const { username, isLoggedIn, logout } = useAuth();
 */
import { useAuthContext } from "../context/AuthContext";

export default function useAuth() {
    return useAuthContext();
}
