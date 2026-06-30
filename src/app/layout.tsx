import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
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
    <html lang="ar" dir="rtl">
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
