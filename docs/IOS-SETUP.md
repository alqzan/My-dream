# إعداد «مدار» على iPhone

## التجربة المجانية

يمكن تجربة التطبيق بحساب Apple مجاني. التوقيع صالح **٧ أيام**، ثم يلزم تجديده.
انتهاء التوقيع يوقف فتح التطبيق لكنه لا يحذف بياناته بحد ذاته؛ أبقِ التطبيق
مثبتاً وجدّد التوقيع فوق النسخة القائمة بالمعرّف نفسه. **حذف التطبيق يحذف
بياناته المحلية**؛ صدّر نسخة احتياطية أولاً. بقاء البيانات عند انتهاء التوقيع
استنتاج من سلوك التوقيع والحذف الموثق، وليس ضماناً لكل ظروف فقدان البيانات.

### مع Mac: Xcode وPersonal Team

1. ثبّت Xcode وافتح آخر نسخة من المستودع. شغّل أوامر npm ci ثم
   npm run build:native ثم npx cap open ios.
   **ولمزامنة الصور والصوت** مرّر رابط بوابة الوسائط كما في متغيّر
   **NEXT_PUBLIC_R2_WORKER_URL** في GitHub (Settings ← Secrets and variables ←
   Actions ← Variables) قبل البناء، مثلاً:
   `NEXT_PUBLIC_R2_WORKER_URL=<الرابط> npm run build:native`. بدونه يعمل
   التطبيق وتتزامن البيانات، لكن الوسائط لا تُرفع ولا تُنزَّل. بناءا Actions
   (IPA وTestFlight) وحِزَم التحديث الحيّ تقرؤه تلقائياً.
2. في هدف **App** داخل Xcode، افتح **Signing & Capabilities** واختر حسابك
   المجاني بوصفه **Personal Team**. لا تضف قدرات Apple لا يتيحها حسابك.
3. صِل iPhone واختره هدفاً واضغط **Run**. اتبع رسائل Xcode لتسجيل الجهاز
   والتوقيع الشخصي.
4. إن طلب الجهاز **Developer Mode**، فعّله من **الإعدادات ← الخصوصية والأمان ←
   نمط المطور**، وأعد تشغيل الجهاز وأكّد الاختيار، ثم أعد التشغيل من Xcode.
5. إن طلب iOS الثقة بالمطوّر، اتبع المطالبة في **الإعدادات ← عام ← VPN وإدارة
   الجهاز**، ثم افتح مدار.

[حدود Personal Team لدى Apple](https://developer.apple.com/help/account/basics/about-your-developer-account)
و[تعليمات Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/).

### بدون Mac: IPA من GitHub Actions

1. من **Actions** شغّل **iOS free trial IPA** يدوياً. بعد نجاحه نزّل artifact
   باسم **Madar-[رقم APP_BUILD].ipa** من صفحة التشغيل، ثم فك ضغط تنزيل
   GitHub للحصول على ملف IPA داخله. يبقى artifact متاحاً ١٤ يوماً في هذا
   السير، ولا يُنشر كإصدار عام ولا يحتاج أسرار توقيع Apple.
2. اتبع موقع [AltStore الرسمي](https://altstore.io/) أو
   [SideStore الرسمي](https://sidestore.io/) وتعليمات التثبيت الرسمية
   ([AltStore Classic](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows)،
   [SideStore](https://docs.sidestore.io/docs/installation/install)).
   ملف Actions غير موقّع؛ الأداة توقّعه بحساب Apple الشخصي عند تثبيته.
   قد يلزم كمبيوتر Windows أو Linux للإعداد الأولي وإن لم يتوفر Mac.
3. اتبع طلب iOS للثقة بالمطوّر وDeveloper Mode إن ظهر. لا تضع Apple Account
   أو كلمة مروره في GitHub أو المستودع.

للحساب المجاني حدود على الأجهزة والتطبيقات وApp IDs؛ راجع
[صفحة Apple](https://developer.apple.com/help/account/basics/about-your-developer-account).
جدّد التوقيع كل ٧ أيام وفق تعليمات الأداة مع إبقاء التطبيق مثبتاً.
**OTA يعمل في هذا المسار** لتغييرات الواجهة والمنطق، لكنه لا يمدد التوقيع.
أي إذن أو إضافة أصلية جديدة يحتاج IPA جديداً وتوقيعاً وتثبيتاً جديداً.

فُحص مشروع Xcode عند إضافة هذا المسار: لا ملف entitlements ولا تصريح
SystemCapabilities أو قدرات Push/iCloud/App Groups. لذلك لا يحتاج المسار
الحالي إلى تعطيل صلاحيات. أعد فحص
[أهلية القدرات لدى Apple](https://developer.apple.com/help/account/reference/supported-capabilities-ios)
قبل إضافة أي قدرة أصلية.

## الانتقال ببياناتك من الويب

1. من مدار على الويب صدّر **نسخة احتياطية كاملة** واحتفظ بها خارج التطبيق.
   مساحة تخزين الموقع مختلفة عن مساحة تطبيق iOS؛ لا تنتقل تلقائياً.
2. بعد فتح تطبيق iOS استورد النسخة من **الإعدادات ← النسخ الاحتياطي** وتحقق
   من المذكرات والمال والوسائط. لا تحذف نسخة الويب قبل التحقق.
3. أدخل **مفتاح المزامنة** يدوياً في إعدادات التطبيق الجديد إن كنت تستخدم
   المزامنة. لا تضعه في الكود أو متغيرات NEXT_PUBLIC أو GitHub Secrets.
   أعد إعداد رمز القفل وFace ID على الجهاز الجديد؛ الرمز يبقى بديلاً للبصمة.

يبقى IndexedDB في الغلاف قابلاً للكنس إذا رفض WebKit التخزين الدائم أو ضاقت
مساحة الجهاز. النسخ الاحتياطية المنتظمة والمزامنة الاختيارية تحميان البيانات؛
صلاحية التوقيع وOTA ليستا بديلاً عنهما.

## TestFlight بحساب Apple Developer مدفوع

هذا المسار مستقل عن IPA التجربة المجانية. يحتاج عضوية Apple Developer وسجل
التطبيق في App Store Connect.

1. سجّل [App ID صريحاً](https://developer.apple.com/help/account/identifiers/register-an-app-id)
   بالمعرّف **com.alqzan.madar**، وأنشئ سجل التطبيق المطابق في App Store Connect.
2. أنشئ شهادة توزيع **Apple Distribution** وصدّرها مع مفتاحها الخاص إلى ملف
   **.p12** محمي بكلمة مرور. أنشئ
   [App Store Connect provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile)
   للمعرّف نفسه وبالشهادة نفسها، ونزّل ملف **.mobileprovision**.
3. من **App Store Connect ← Users and Access ← Integrations** اطلب تفعيل API
   إذا لزم، وأنشئ **Team API key** بصلاحية رفع البناء، وسجّل Key ID وIssuer ID
   ونزّل ملف **.p8** مرة واحدة. [تعليمات Apple](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api).
4. في المستودع، افتح **Settings ← Secrets and variables ← Actions** وأضف:

   | Secret | القيمة |
   |---|---|
   | ASC_KEY_ID | معرّف مفتاح API |
   | ASC_ISSUER_ID | معرّف الجهة المصدرة من صفحة API |
   | ASC_KEY_P8 | النص الكامل لملف .p8 بما فيه BEGIN/END |
   | CERT_P12 | محتوى .p12 مرمّز Base64 في سطر واحد |
   | CERT_PASSWORD | كلمة مرور ملف .p12 |
   | PROVISIONING_PROFILE | محتوى .mobileprovision مرمّز Base64 في سطر واحد |

   على Mac يمكن ترميز الملف بالأمر **base64 < file.p12 | tr -d '\n'**،
   وبالمثل لملف .mobileprovision. لا تحفظ الأسرار في ملف متتبّع بـGit أو
   ترسلها في محادثة. يسرد workflow **أسماء** الأسرار الناقصة قبل البناء.
5. شغّل **Upload iOS build to TestFlight** من Actions. يشتق السير رقم Xcode
   من APP_BUILD ويوقّع ويرفع التطبيق. انتظر معالجة Apple، ثم أضف نفسك مختبراً
   داخلياً وثبّته من TestFlight. الاختبار الخارجي قد يتطلب مراجعة Apple.
6. [بناء TestFlight صالح حتى ٩٠ يوماً](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
   ارفع بناءً جديداً قبل انتهائها؛ OTA لا يمددها.

## التحديث الحي والتراجع

ينشر سير Pages حزمة ZIP وmanifest.json تحت مسار My-dream/ota بجانب الموقع.
عند وجود APP_BUILD أحدث يعرض التطبيق زر تنزيل التحديث، ثم يثبته عند إعادة
فتحه. بعد ترطيب البيانات واستقرار الإقلاع يؤكد BootGuard نجاحها لـCapgo.
إذا فشل الإقلاع ولم يصل التأكيد خلال مهلة ٩٠ ثانية يحاول المحدّث الرجوع إلى
الحزمة السابقة. لا تستطيع OTA إضافة إذن أو plugin أصلي أو تغيير الأيقونة؛
ارفع IPA جديداً عند هذه التغييرات. راجع [خطة النقل](APP-STORE-PLAN.md).
