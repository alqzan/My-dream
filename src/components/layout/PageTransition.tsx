"use client";
import { usePathname } from "next/navigation";

// Re-keys its subtree on every route change so the `.page-fade` animation
// re-runs, giving a gentle cross-fade between tabs instead of a hard jump.
// SSG-safe: no router internals, just the current pathname as a React key.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-fade">
      {children}
    </div>
  );
}
