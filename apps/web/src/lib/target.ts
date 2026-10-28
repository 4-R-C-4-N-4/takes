// Build-target gate. `vite build --mode static` sets import.meta.env.MODE to
// 'static'; everything else (dev, default `vite build`) stays dynamic.
// Keep this the single switch for static-vs-dynamic behaviour.
export const isStatic: boolean = import.meta.env.MODE === 'static';
