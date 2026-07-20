# إعداد Cloudflare R2 لوسائط «مدار»

هذا المسار يبقي Firestore للبيانات فقط، ويضع الصور والمقاطع الصوتية في bucket
خاص في R2. التطبيق لا يرى مفاتيح R2 مطلقًا؛ يرسل مفتاح مزامنة «مدار» إلى Worker
ويستلم رابطًا موقّعًا قصير العمر لملف واحد فقط.

## 1. إنشاء الحساب وتفعيل R2

1. افتح [Cloudflare Dashboard](https://dash.cloudflare.com/sign-up) وأنشئ حسابًا
   ببريدك، ثم أكّد البريد.
2. من القائمة افتح **R2 Object Storage** ثم فعّل/اشترِ R2 للحساب. قد تطلب
   Cloudflare وسيلة دفع عند التفعيل، لكن طبقة Standard تشمل شهريًا 10GB تخزين
   ومليون عملية Class A و10 ملايين Class B، والتنزيل إلى الإنترنت بلا رسوم نقل.
3. اختر **Create bucket**:
   - الاسم: `madar-media`
   - الموقع/jurisdiction: الافتراضي Automatic/Default
   - Storage class: **Standard** (المجاني لا ينطبق على Infrequent Access)
4. اترك **Public Development URL** و**Custom Domain** معطّلين؛ الـbucket خاص.

إذا غيّرت اسم الـbucket، غيّره أيضًا في `cloudflare-worker/wrangler.toml` في
السطرين `R2_BUCKET_NAME` و`bucket_name`.

## 2. سياسة CORS للـbucket

افتح bucket `madar-media` ثم **Settings → CORS Policy → Add CORS policy → JSON**
والصق:

```json
[
  {
    "AllowedOrigins": [
      "https://alqzan.github.io",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

الأصل `Origin` لا يتضمن `/My-dream`؛ لذلك الصحيح هو
`https://alqzan.github.io` فقط. لا تستخدم `*` لأن الوسائط خاصة.

## 3. إنشاء مفتاح R2 محدود بالـbucket

1. ارجع إلى صفحة **R2 Object Storage → Overview**.
2. تحت **Account Details** اختر **Manage** بجانب **API Tokens**.
3. اختر **Create Account API token**.
4. الصلاحية: **Object Read & Write**.
5. النطاق: **Apply to specific buckets only → madar-media**.
6. أنشئ المفتاح واحفظ فورًا القيم التالية في مدير كلمات مرور:
   - Access Key ID
   - Secret Access Key (لن تظهر مرة ثانية)
7. انسخ أيضًا **Account ID** من لوحة Cloudflare.

لا تضع أيًا من هذه القيم في GitHub أو في ملف داخل المستودع.

## 4. حساب بصمة مفتاح مزامنة «مدار»

على الكمبيوتر الأساسي افتح تطبيق «مدار»، ثم أدوات المطور في المتصفح
(**F12 → Console**) والصق هذا السطر:

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode(localStorage.getItem("madar-sync-space") || "")).then(x => console.log([...new Uint8Array(x)].map(b => b.toString(16).padStart(2, "0")).join("")))
```

انسخ الناتج ذي 64 خانة. هذه **بصمة** المفتاح وليست المفتاح نفسه. إذا ظهر ناتج
لمفتاح فارغ، تأكد أولًا أن بطاقة «مفتاح المزامنة» في إعدادات مدار مفعّلة.

## 5. نشر الـWorker

من طرفية داخل المستودع:

```bash
cd cloudflare-worker
npm ci
npx wrangler login
```

سيفتح Wrangler صفحة Cloudflare للموافقة. بعدها أدخل الأسرار الأربعة واحدًا
واحدًا؛ كل أمر سيطلب القيمة بشكل مخفي:

```bash
npx wrangler secret put SYNC_KEY_SHA256
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npm run deploy
```

الصق في `SYNC_KEY_SHA256` البصمة من الخطوة السابقة، وليس مفتاح المزامنة الخام.
سيطبع النشر رابطًا قريبًا من:

```text
https://madar-r2-gateway.<your-subdomain>.workers.dev
```

اختبره بفتح `<رابط-worker>/health`. النتيجة المتوقعة:

```json
{"ok":true,"service":"madar-r2-gateway"}
```

لا يمكن اختبار المسارات الخاصة من المتصفح بلا مفتاح، وستعيد `401` وهذا صحيح.

## 6. ربط GitHub Pages بالـWorker

في مستودع GitHub افتح:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

- الاسم: `NEXT_PUBLIC_R2_WORKER_URL`
- القيمة: رابط الـWorker بلا `/` في النهاية

الرابط عام وليس سرًا؛ الحماية بمفتاح المزامنة. إذا انتهى نشر GitHub Pages قبل
إضافة المتغير، افتح **Actions → Deploy to GitHub Pages → Run workflow** على
`main` لإعادة البناء بالقيمة الجديدة.

## 7. ترحيل الصور الحالية والتحقق

نفّذ هذا على الكمبيوتر الأساسي الذي يحمل النسخة المحلية والصور:

1. صدّر نسخة احتياطية جديدة من «مدار» واحتفظ بها.
2. افتح **الإعدادات → صحة البيانات → فحص الصور والمزامنة**. يجب أن تكون R2
   قابلة للوصول؛ إن ظهرت رسالة تعذّر الوصول فلا تبدأ الترحيل.
3. اضغط **إعادة رفع كل الوسائط**. هذه هي أداة الترحيل: ترفع البيانات المحلية
   إلى R2، ثم تجرد الـbucket وتقارن المراجع تلقائيًا.
4. النجاح الكامل يعني لكل من الصور والأصوات:
   - `بانتظار الرفع = 0`
   - `مكسورة = 0`
   - عدد `في السحابة` يساوي عدد `مُشار إليها`
5. افتح مدار على الجهاز الثاني، زامن، ثم افتح عدة صور قديمة وحديثة.

لا تحذف أي نسخة محلية أو احتياطية بعد الترحيل؛ الكود لا يحذف الملفات اليتيمة
من R2 تلقائيًا أصلًا، حمايةً من حذف صورة ما زال جهاز آخر يشير إليها.

## 8. تجربة Day One قبل الاستيراد الكامل

1. استورد عينة 30–50 مذكرة على الكمبيوتر.
2. انتظر اكتمال المزامنة، ثم شغّل فحص الصور وتأكد أن المعلّق والمكسور صفر.
3. افحص النصوص والصور على جهازين.
4. بعدها فقط شغّل استيراد 2000+ مذكرة.

الفيديو يبقى مرجعًا فقط ولا يرفعه هذا المسار. مستورد Day One الحالي يتخطى
الفيديو، وحد Worker يسمح للصور حتى 8MB وللتسجيل الصوتي حتى 32MB. صور التطبيق
تُضغط عادة إلى نحو 200KB قبل الرفع.

## ملاحظة أمان عن حد الحجم

الـWorker يرفض إصدار رابط لملف معلن فوق الحد، ويربط نوع MIME بالتوقيع، وبعد
الرفع يقرأ الحجم والنوع الفعليين من R2 ويحذف الملف إذا خالفا الطلب. رابط PUT
نفسه Bearer قصير العمر (دقيقتان)؛ لذلك يجب حماية مفتاح المزامنة والروابط وعدم
مشاركتها. فرض حجم صارم حتى عند عميل خبيث يتعمد تجاوز خطوة التحقق يتطلب تمرير
جسم الملف عبر Worker بدل الرفع المباشر الموقّع؛ نموذج «مدار» الحالي ذو مالك
واحد يجعل التدفق المباشر + التحقق اللاحق هو التوازن المناسب.
