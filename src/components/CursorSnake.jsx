import { useEffect, useRef } from 'react';

const COUNT = 14;
const HEAD_RADIUS = 72;
const TAIL_RADIUS = 16;

export default function CursorSnake() {
  const elRef = useRef(null);
  const pos = useRef(Array.from({ length: COUNT }, () => ({ x: -300, y: -300 })));
  const mouse = useRef({ x: -300, y: -300 });
  const active = useRef(false);
  const raf = useRef(null);

  useEffect(() => {
    const hero = document.querySelector('.site-header.hero');
    function onEnter() { active.current = true; }
    function onLeave() { active.current = false; }
    hero?.addEventListener('mouseenter', onEnter);
    hero?.addEventListener('mouseleave', onLeave);

    function onMove(e) {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    }

    function tick() {
      const p = pos.current;
      const m = mouse.current;

      p[0].x += (m.x - p[0].x) * 0.42;
      p[0].y += (m.y - p[0].y) * 0.42;

      for (let i = 1; i < COUNT; i++) {
        p[i].x += (p[i - 1].x - p[i].x) * 0.24;
        p[i].y += (p[i - 1].y - p[i].y) * 0.24;
      }

      if (elRef.current) {
        elRef.current.style.opacity = active.current ? '1' : '0';
        // Keep dot grid aligned with the hero's ::after as page scrolls
        const sy = window.scrollY % 40;
        elRef.current.style.backgroundPosition = `0 ${-sy}px, 20px ${20 - sy}px`;

        const mask = p.map((pt, i) => {
          const t = i / (COUNT - 1);
          const radius = HEAD_RADIUS - (HEAD_RADIUS - TAIL_RADIUS) * t;
          const alpha = (1 - t * 0.72).toFixed(2);
          return `radial-gradient(circle at ${pt.x}px ${pt.y}px, rgba(255,255,255,${alpha}) 0%, transparent ${radius}px)`;
        }).join(', ');

        elRef.current.style.maskImage = mask;
        elRef.current.style.webkitMaskImage = mask;
      }

      raf.current = requestAnimationFrame(tick);
    }

    window.addEventListener('mousemove', onMove);
    raf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      hero?.removeEventListener('mouseenter', onEnter);
      hero?.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return <div ref={elRef} aria-hidden="true" className="snake-dot" />;
}
