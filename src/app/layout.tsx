import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

// Prefix for static assets so icons/manifest resolve under the GitHub Pages
// subpath (/My-dream) while staying root-relative for Firebase/local.
const bp = process.env.BASE_PATH || "";

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
import { SWRegister } from "@/components/layout/SWRegister";
import { UndoToast } from "@/components/ui/UndoToast";
import { ThemeApplier } from "@/components/layout/ThemeToggle";
import { SyncProvider } from "@/components/sync/SyncProvider";
import { PendingInboxWatcher } from "@/components/finance/PendingInboxWatcher";
import { RecurringRunner } from "@/components/finance/RecurringRunner";

export const metadata: Metadata = {
  title: "مدار — مساحتك الشخصية",
  description: "مذكرات، أموال، قراءة، وعادات — كل شيء في مكان واحد",
  manifest: `${bp}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${bp}/favicon-32.png`, sizes: "32x32", type: "image/png" },
      { url: `${bp}/icon.svg`, type: "image/svg+xml" },
    ],
    apple: [{ url: `${bp}/apple-touch-icon.png`, sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "مدار",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // قفل التكبير/التصغير: التبعيد بالأصابع كان يكسر التخطيط (يفعّل نسخة
  // الكمبيوتر على الجوال) — بدونه يتصرف التطبيق كتطبيق حقيقي سلس.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // يفعّل env(safe-area-inset-*) على الأجهزة ذات النوتش فلا يختفي الشريط
  // السفلي تحت مؤشر الهوم (المستهلك: .pb-safe في الشريط السفلي).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3ecdd" },
    { media: "(prefers-color-scheme: dark)", color: "#161009" },
  ],
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
          <SWRegister bp={bp} />
          <ThemeApplier />
          <SyncProvider>
            <div className="min-h-screen flex">
              <Sidebar />
              <main className="flex-1 min-w-0 lg:mr-56 pb-20 lg:pb-0">
                <MobileHeader />
                {children}
              </main>
            </div>
            <MobileNav />
            <UndoToast />
            <PendingInboxWatcher />
            <RecurringRunner />
          </SyncProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
