// ===================== وردةُ رقم الآية =====================
// طُرّةُ نهاية الآية كما في المصحف المطبوع: قرصٌ كريميّ بحلقةٍ ذهبية، وطُرّتان
// (تاجان) أعلاه وأسفله، وداخله جناحان **بلون الورق** محدَّدان بخيطٍ ذهبيّ رفيع
// يلتقيان في لولبين متقابلين — والرقمُ في وسطه.
//
// وهي **علامةُ وقفٍ قبل أن تكون زخرفة**: العينُ تلتقطها فتعرف أين انتهت الآية
// بلا أن تقرأ الرقم. ولذلك لم تكفِ صورتُها في الخطّ: «حفص» يكتبها قوسين
// مزخرفين حول الرقم — جناحان بلا قرصٍ يضمّهما — ووردتُه `۝` بيضاويةٌ فارغة
// والرقمُ خارجها. فرُسمت هنا على صورتها في الورق.
//
// الألوان كلُّها رموزٌ من النموذج (`--medal-fill`/`--medal-core` و`currentColor`)
// فتتبع الورقَ الذي تقع عليه: كريميّةً في «ورق»، وذهبيةً على سوادٍ في «ليل».
// والرسمُ يُمطّ مع الحيّز المحجوز (`preserveAspectRatio="none"`) فيتّسع لرقمٍ من
// ثلاث خانات كما يتّسع في المطبوع.

/** نصفُ الزخرفة (تُنعكس أسفلَ القرص): جناحان ولولبان. */
const WING_RIGHT = "M50 24.5 C 59.5 19.5, 72 23.5, 80 34 C 71.5 28.5, 59 29, 50 32.5 Z";
const WING_LEFT = "M50 24.5 C 40.5 19.5, 28 23.5, 20 34 C 28.5 28.5, 41 29, 50 32.5 Z";
const CURL_LEFT = "M50 26 C 46.6 22.4, 40.6 23.3, 39.3 27.8 C 38.3 31.2, 41.8 33.6, 44.4 31.9 C 46.4 30.5, 45.7 27.7, 43.5 27.7";
const CURL_RIGHT = "M50 26 C 53.4 22.4, 59.4 23.3, 60.7 27.8 C 61.7 31.2, 58.2 33.6, 55.6 31.9 C 53.6 30.5, 54.3 27.7, 56.5 27.7";
/** طُرّةُ التاج: ثلاثةُ فصوصٍ وحبّةٌ في وسطها. */
const CREST = "M41 17.5 C 39.5 13.5, 43.5 10.5, 46.8 12.6 C 46.8 8.8, 53.2 8.8, 53.2 12.6 C 56.5 10.5, 60.5 13.5, 59 17.5 Z";

function Half() {
  return (
    <>
      <path d={WING_RIGHT} fill="var(--medal-core)" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d={WING_LEFT} fill="var(--medal-core)" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d={CURL_LEFT} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d={CURL_RIGHT} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </>
  );
}

function Crest() {
  return (
    <>
      <path d={CREST} fill="var(--medal-fill)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="50" cy="15.6" r="2.3" fill="currentColor" opacity="0.45" />
    </>
  );
}

export function AyahMedallion() {
  return (
    <svg className="mushaf-num-medal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden focusable="false">
      <circle cx="50" cy="50" r="36" fill="var(--medal-fill)" stroke="currentColor" strokeWidth="1.9" />
      <Crest />
      <g transform="rotate(180 50 50)"><Crest /></g>
      <Half />
      <g transform="rotate(180 50 50)"><Half /></g>
    </svg>
  );
}
