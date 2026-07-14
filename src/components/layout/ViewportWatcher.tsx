"use client";
import { useEffect } from "react";

// Publishes the *visual* viewport (the area NOT covered by the on-screen
// keyboard) to CSS custom properties, so fixed overlays can size themselves to
// the space above the keyboard instead of the full screen. iOS keeps `fixed`
// elements at full layout height when the keyboard opens, which buries the
// focused field and the action buttons behind it — reading visualViewport is
// the only reliable fix.
//   --vvh : visible height (px)          → modal wrapper height
//   --vvo : visible top offset (px)      → modal wrapper top
//   --kb  : keyboard height (px)         → available for spacing/animation
export function ViewportWatcher() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) {
      // Old browsers: keep sensible full-height defaults.
      root.style.setProperty("--vvh", "100dvh");
      root.style.setProperty("--vvo", "0px");
      root.style.setProperty("--kb", "0px");
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      root.style.setProperty("--vvo", `${Math.round(vv.offsetTop)}px`);
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    const onChange = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
