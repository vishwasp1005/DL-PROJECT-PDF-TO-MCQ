/**
 * useLocalStorage — useState variant that persists to localStorage.
 *
 * Usage:
 *   const [value, setValue] = useLocalStorage("myKey", defaultValue);
 */
import { useState, useCallback } from "react";

export default function useLocalStorage(key, initialValue) {
    const [storedValue, setStoredValue] = useState(() => {
        try {
            const item = localStorage.getItem(key);
            return item !== null ? JSON.parse(item) : initialValue;
        } catch {
            return initialValue;
        }
    });

    const setValue = useCallback(
        (value) => {
            try {
                const valueToStore = value instanceof Function ? value(storedValue) : value;
                setStoredValue(valueToStore);
                localStorage.setItem(key, JSON.stringify(valueToStore));
            } catch (err) {
                console.error(`useLocalStorage[${key}] write error:`, err);
            }
        },
        [key, storedValue]
    );

    const removeValue = useCallback(() => {
        localStorage.removeItem(key);
        setStoredValue(initialValue);
    }, [key, initialValue]);

    return [storedValue, setValue, removeValue];
}
