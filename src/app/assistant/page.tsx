"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { buildAssistantContext } from "@/lib/assistantContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sparkles, Send, Settings2, User } from "lucide-react";

const ENDPOINT_KEY = "madar-assistant-endpoint";

// The assistant's role. Kept short — the grounding data arrives separately as
// context so this can stay cached-friendly and cheap.
const SYSTEM_PROMPT = `أنت «مساعد مدار»، مساعد شخصي عربي داخل تطبيق لتتبّع المصاريف والمذكرات والصلوات والقراءة والعادات.
يصلك ملخّص لبيانات المستخدم. أجب بالعربية بإيجاز ووضوح معتمداً على الملخّص فقط.
إن لم تكن المعلومة في الملخّص فقل ذلك بصراحة بدل التخمين. لا تعطِ فتاوى شرعية؛ شجّع بلطف.`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function AssistantPage() {
  const snapshot = useAppStore((s) => s.snapshot);
  const [endpoint, setEndpoint] = useState("");
  const [endpointInput, setEndpointInput] = useState("");
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ENDPOINT_KEY) ?? "";
      setEndpoint(saved);
      setEndpointInput(saved);
    } catch {}
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function saveEndpoint() {
    const url = endpointInput.trim();
    try {
      localStorage.setItem(ENDPOINT_KEY, url);
    } catch {}
    setEndpoint(url);
    setEditingEndpoint(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !endpoint) return;
    setInput("");

    const history = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      text: m.content,
    }));
    const next: Msg[] = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(next);
    setBusy(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          context: buildAssistantContext(snapshot()),
          history,
          message: text,
        }),
      });
      if (!res.ok) {
        // Surface the worker's own error text (e.g. "GEMINI_API_KEY not set" or
        // "Gemini error 403: ...") so setup problems are diagnosable.
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`الوسيط ردّ ${res.status}${detail ? ` — ${detail}` : ""}`);
      }
      if (!res.body) throw new Error("لا يوجد ردّ من الوسيط");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
      if (!acc.trim()) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "لم أستلم رداً. تأكد من إعداد الوسيط والمفتاح." };
          return copy;
        });
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : "";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `تعذّر الاتصال بالمساعد.\n${reason || "تأكد من رابط الوسيط ومفتاح Gemini والاتصال بالإنترنت."}`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  // ---------- Setup gate: no endpoint yet ----------
  if (!endpoint || editingEndpoint) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2 animate-fade-up">
          <Sparkles size={22} className="text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">المساعد</h1>
        </div>
        <Card className="animate-fade-up stagger-1 space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">
            المساعد يجيب عن أسئلتك حول مصاريفك ومذكراتك وعاداتك. يعمل عبر «وسيط» مجاني تنشئه مرة
            واحدة (Cloudflare Worker) يحفظ مفتاح Gemini بأمان — لا يوضع المفتاح في التطبيق.
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            خطوات النشر في مجلد <code className="bg-gray-100 dark:bg-[#382c1d] px-1 rounded">worker/</code> بالمستودع.
            بعد نشره الصق رابط الـWorker هنا:
          </p>
          <input
            value={endpointInput}
            onChange={(e) => setEndpointInput(e.target.value)}
            placeholder="https://madar-assistant.your-name.workers.dev"
            dir="ltr"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <div className="flex gap-2">
            <Button onClick={saveEndpoint} className="flex-1 bg-brand-600 hover:bg-brand-700" disabled={!endpointInput.trim()}>
              حفظ
            </Button>
            {editingEndpoint && (
              <Button variant="secondary" onClick={() => { setEditingEndpoint(false); setEndpointInput(endpoint); }}>
                إلغاء
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ---------- Chat ----------
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between mb-3 animate-fade-up">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">المساعد</h1>
        </div>
        <button
          onClick={() => { setEndpointInput(endpoint); setEditingEndpoint(true); }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 press"
          aria-label="إعداد الوسيط"
        >
          <Settings2 size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10 space-y-2">
            <Sparkles size={28} className="mx-auto text-brand-300" />
            <p>اسألني عن مصاريفك، مذكراتك، عاداتك، صلواتك أو قراءتك.</p>
            <p className="text-xs">مثال: «كم صرفت هذا الشهر؟» · «كيف عاداتي هالأسبوع؟»</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                m.role === "user" ? "bg-gray-200 text-gray-600" : "bg-brand-100 text-brand-600"
              }`}
            >
              {m.role === "user" ? <User size={14} /> : <Sparkles size={14} />}
            </span>
            <div
              className={`max-w-[80%] text-sm leading-relaxed rounded-2xl px-3.5 py-2 whitespace-pre-line ${
                m.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 dark:bg-[#382c1d] text-gray-700"
              }`}
            >
              {m.content || (busy ? "…" : "")}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 pt-2 border-t border-gray-100 dark:border-[#3a2e1e]">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="اكتب سؤالك..."
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 max-h-32"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="shrink-0 w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center press disabled:opacity-40"
          aria-label="إرسال"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
