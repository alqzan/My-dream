"use client";

// Last-resort boundary (errors in the root layout itself).
// Must render its own <html>/<body>. Data in IndexedDB is untouched.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "Tajawal, sans-serif", background: "#f3ecdd", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 14,
            padding: 24, textAlign: "center",
          }}
        >
          <div style={{ fontSize: 44 }}>🌙</div>
          <h1 style={{ fontSize: 19, color: "#2c2418", margin: 0 }}>صار خطأ مؤقت في التحميل</h1>
          <p style={{ fontSize: 13, color: "#8a7a5f", maxWidth: 300, lineHeight: 1.8, margin: 0 }}>
            اطمئن — <b>بياناتك كلها سليمة ومحفوظة على جهازك</b>.
            حدّث الصفحة للحصول على النسخة الجديدة.
          </p>
          <button
            onClick={async () => {
              try {
                if ("caches" in window) {
                  for (const k of await caches.keys()) await caches.delete(k);
                }
              } catch { /* ignore */ }
              window.location.reload();
            }}
            style={{
              background: "#a96c20", color: "#fff", border: 0, borderRadius: 12,
              padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            🔄 تحديث التطبيق
          </button>
          <button
            onClick={reset}
            style={{
              background: "transparent", color: "#8a7a5f", border: 0,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            المحاولة مرة أخرى
          </button>
          {error?.message ? (
            <p dir="ltr" style={{ fontSize: 10, color: "#c3b49a", maxWidth: 300, wordBreak: "break-all" }}>
              {error.message.slice(0, 160)}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
