/**
 * useConfetti — zero-dependency canvas confetti.
 * Call fire() to trigger a 3.5s burst.
 */
import { useCallback, useRef } from "react";

const COLORS = ["#6366F1", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#60A5FA", "#F472B6"];

export default function useConfetti() {
    const canvasRef = useRef(null);
    const particles = useRef([]);
    const rafRef = useRef(null);

    const fire = useCallback(() => {
        // Create canvas if not already there
        let canvas = canvasRef.current;
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.style.cssText = `
                position:fixed; top:0; left:0; width:100%; height:100%;
                pointer-events:none; z-index:99999;
            `;
            document.body.appendChild(canvas);
            canvasRef.current = canvas;
        }
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext("2d");

        // Spawn particles from top-center
        const cx = canvas.width / 2;
        particles.current = Array.from({ length: 160 }, () => ({
            x: cx + (Math.random() - 0.5) * 200,
            y: canvas.height * 0.2,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() * -14) - 4,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            size: Math.random() * 8 + 4,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 8,
            shape: Math.random() > 0.5 ? "rect" : "circle",
            opacity: 1,
        }));

        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.current = particles.current.filter(p => p.opacity > 0.02);

            particles.current.forEach(p => {
                p.vy += 0.35; // gravity
                p.vx *= 0.99;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;
                p.opacity = Math.max(0, 1 - (elapsed / 3500));

                ctx.save();
                ctx.globalAlpha = p.opacity;
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;

                if (p.shape === "rect") {
                    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            });

            if (particles.current.length > 0 && elapsed < 3500) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                canvas.remove();
                canvasRef.current = null;
            }
        };

        rafRef.current = requestAnimationFrame(animate);
    }, []);

    return fire;
}
