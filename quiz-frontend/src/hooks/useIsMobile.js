/**
 * useIsMobile(breakpoint)
 * Returns true when window.innerWidth <= breakpoint.
 * Updates instantly on resize. Zero dependencies.
 * Default breakpoint: 768px
 */
import { useState, useEffect } from "react";

export default function useIsMobile(bp = 768) {
    const [mobile, setMobile] = useState(() => window.innerWidth <= bp);
    useEffect(() => {
        const fn = () => setMobile(window.innerWidth <= bp);
        window.addEventListener("resize", fn);
        return () => window.removeEventListener("resize", fn);
    }, [bp]);
    return mobile;
}
