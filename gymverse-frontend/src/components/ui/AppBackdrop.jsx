/**
 * Fixed animated backdrop: drifting grid + two slow colour blobs.
 * Render once, above the router, behind everything else.
 */
export default function AppBackdrop({ animatedGrid = true }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_12%_0%,#0d1830_0%,#070a14_46%,#05070d_100%)]" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(255 255 255 / .045) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / .045) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          animation: animatedGrid ? 'gridDrift 16s linear infinite' : 'none',
          maskImage: 'radial-gradient(120% 100% at 30% 0%, #000 0%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(120% 100% at 30% 0%, #000 0%, transparent 78%)',
        }}
      />
      <div
        className="absolute -top-[18vh] -left-[8vw] h-[58vw] w-[58vw] rounded-full opacity-50 blur-[80px]"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--gv-accent) 55%, transparent) 0%, transparent 62%)',
          animation: 'glowA 22s ease-in-out infinite',
        }}
      />
      <div
        className="absolute -bottom-[24vh] -right-[12vw] h-[52vw] w-[52vw] rounded-full opacity-40 blur-[90px]"
        style={{
          background: 'radial-gradient(circle, rgb(16 185 129 / .5) 0%, transparent 62%)',
          animation: 'glowB 26s ease-in-out infinite',
        }}
      />
    </div>
  );
}
