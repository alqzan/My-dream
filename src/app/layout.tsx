import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

// Load Thamaniah via next/font so the URL respects basePath/assetPrefix
// (a hand-written /fonts/ url in CSS would 404 under the /My-dream/ subpath).
const thamaniah = localFont({
  src: [
    { path: "../../public/fonts/thmanyahserifdisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/thmanyahserifdisplay-Black.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/thmanyahserifdisplay-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-thamaniah",
  display: "swap",
});
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { AuthProvider } from "@/components/auth/AuthProvider";

export const metadata: Metadata = {
  title: "حلمي — تتبّع يومي",
  description: "مذكرات، أموال، قراءة — كل شيء في مكان واحد",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={thamaniah.variable}>
      <body>
        <ClientOnly>
          <AuthProvider>
            <div className="min-h-screen flex">
              <Sidebar />
              <main className="flex-1 lg:mr-56 pb-20 lg:pb-0">
                <MobileHeader />
                {children}
              </main>
            </div>
            <MobileNav />
          </AuthProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
