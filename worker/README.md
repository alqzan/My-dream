# مساعد مدار — الوسيط (Gemini proxy)

هذا الوسيط الصغير يحفظ **مفتاح Gemini** بأمان بعيداً عن المتصفح، ويمرّر أسئلتك
إلى نموذج Google المجاني ويعيد الرد إلى التطبيق. يعمل على الطبقة المجانية من
**Cloudflare Workers** مع الطبقة المجانية من **Gemini** — بلا تكلفة لاستخدام شخصي.

## ما ستحتاجه (مجاني)

1. حساب [Cloudflare](https://dash.cloudflare.com/sign-up) (مجاني).
2. مفتاح Gemini مجاني من [Google AI Studio](https://aistudio.google.com/app/apikey) → «Create API key».

## النشر (خيار أ: من المتصفح — الأسهل)

1. من لوحة Cloudflare: **Workers & Pages → Create → Create Worker**، سمِّه مثلاً
   `madar-assistant`، ثم **Deploy**.
2. **Edit code** → احذف الموجود والصق محتوى `gemini-proxy.js` بالكامل → **Deploy**.
3. **Settings → Variables and Secrets**:
   - أضِف **Secret** باسم `GEMINI_API_KEY` وقيمته مفتاحك.
   - (اختياري) **Variable** باسم `GEMINI_MODEL` بقيمة `gemini-2.0-flash`.
   - (موصى به) **Variable** باسم `ALLOWED_ORIGINS` بقيمة نطاق موقعك، مثل
     `https://alqzan.github.io` (أو عدة نطاقات مفصولة بفواصل). عند ضبطه يرفض
     الوسيط أي طلب من مواقع أخرى، فلا يستطيع من يعرف رابط الـWorker استنزاف حصتك.
4. انسخ رابط الـWorker (مثل `https://madar-assistant.اسمك.workers.dev`).
5. في التطبيق: صفحة **المساعد** → الصق الرابط → **حفظ**.

## النشر (خيار ب: من الطرفية عبر Wrangler)

```bash
npm i -g wrangler
wrangler login
# انسخ gemini-proxy.js إلى مشروع worker وأنشئ wrangler.toml بسيطاً:
#   name = "madar-assistant"
#   main = "gemini-proxy.js"
#   compatibility_date = "2024-11-01"
wrangler secret put GEMINI_API_KEY   # الصق المفتاح
wrangler deploy
```

## بروتوكول الطلب

التطبيق يرسل `POST` بجسم JSON:

```json
{ "system": "...", "context": "ملخّص بياناتك", "history": [{ "role": "user|model", "text": "..." }], "message": "سؤالك" }
```

والوسيط يعيد نص الرد **مبثوثاً** (`text/plain`، UTF-8).

## ملاحظات

- المفتاح يبقى في الـWorker فقط؛ لا يصل المتصفح إطلاقاً.
- افتراضياً `Access-Control-Allow-Origin: *`؛ لتحصينه اضبط `ALLOWED_ORIGINS`
  (انظر أعلاه) فيقصر القبول على نطاق موقعك ويرفض الباقي بـ403.
- الطبقة المجانية من Gemini فيها حد يومي للطلبات — يكفي مستخدماً واحداً بسهولة.
- بياناتك تُرسل إلى Google عند السؤال فقط (لتأسيس الإجابة)؛ بقية التطبيق يظل على جهازك.
