// ===================== بيانات القرآن الكريم =====================
// خرائط بنيوية موثوقة: 114 سورة، 30 جزءاً، 60 حزباً (240 رُبعاً)، 604 وجهاً
// (مصحف المدينة)، ومجموع 6236 آية. مصدر البنية حزمة quran-meta، وأسماء
// السور من موسوعة القرآن الكريم عبر quran-json. النصّ الكامل في ayahText.json
// (يُحمّل عند الطلب). المعرّف العام لكل آية 1..6236 بترتيب المصحف.

export interface SurahMeta {
  num: number; // 1..114
  name: string; // اسم السورة
  ayat: number; // عدد الآيات
  first: number; // المعرّف العام لأوّل آية فيها
  meccan: boolean; // مكية؟
}

export const TOTAL_AYAT = 6236;
export const TOTAL_PAGES = 604;
export const TOTAL_JUZ = 30;
export const TOTAL_HIZB = 60;

export const SURAHS: SurahMeta[] = [
  { num: 1, name: "الفاتحة", ayat: 7, first: 1, meccan: true },
  { num: 2, name: "البقرة", ayat: 286, first: 8, meccan: false },
  { num: 3, name: "آل عمران", ayat: 200, first: 294, meccan: false },
  { num: 4, name: "النساء", ayat: 176, first: 494, meccan: false },
  { num: 5, name: "المائدة", ayat: 120, first: 670, meccan: false },
  { num: 6, name: "الأنعام", ayat: 165, first: 790, meccan: true },
  { num: 7, name: "الأعراف", ayat: 206, first: 955, meccan: true },
  { num: 8, name: "الأنفال", ayat: 75, first: 1161, meccan: false },
  { num: 9, name: "التوبة", ayat: 129, first: 1236, meccan: false },
  { num: 10, name: "يونس", ayat: 109, first: 1365, meccan: true },
  { num: 11, name: "هود", ayat: 123, first: 1474, meccan: true },
  { num: 12, name: "يوسف", ayat: 111, first: 1597, meccan: true },
  { num: 13, name: "الرعد", ayat: 43, first: 1708, meccan: false },
  { num: 14, name: "ابراهيم", ayat: 52, first: 1751, meccan: true },
  { num: 15, name: "الحجر", ayat: 99, first: 1803, meccan: true },
  { num: 16, name: "النحل", ayat: 128, first: 1902, meccan: true },
  { num: 17, name: "الإسراء", ayat: 111, first: 2030, meccan: true },
  { num: 18, name: "الكهف", ayat: 110, first: 2141, meccan: true },
  { num: 19, name: "مريم", ayat: 98, first: 2251, meccan: true },
  { num: 20, name: "طه", ayat: 135, first: 2349, meccan: true },
  { num: 21, name: "الأنبياء", ayat: 112, first: 2484, meccan: true },
  { num: 22, name: "الحج", ayat: 78, first: 2596, meccan: false },
  { num: 23, name: "المؤمنون", ayat: 118, first: 2674, meccan: true },
  { num: 24, name: "النور", ayat: 64, first: 2792, meccan: false },
  { num: 25, name: "الفرقان", ayat: 77, first: 2856, meccan: true },
  { num: 26, name: "الشعراء", ayat: 227, first: 2933, meccan: true },
  { num: 27, name: "النمل", ayat: 93, first: 3160, meccan: true },
  { num: 28, name: "القصص", ayat: 88, first: 3253, meccan: true },
  { num: 29, name: "العنكبوت", ayat: 69, first: 3341, meccan: true },
  { num: 30, name: "الروم", ayat: 60, first: 3410, meccan: true },
  { num: 31, name: "لقمان", ayat: 34, first: 3470, meccan: true },
  { num: 32, name: "السجدة", ayat: 30, first: 3504, meccan: true },
  { num: 33, name: "الأحزاب", ayat: 73, first: 3534, meccan: false },
  { num: 34, name: "سبإ", ayat: 54, first: 3607, meccan: true },
  { num: 35, name: "فاطر", ayat: 45, first: 3661, meccan: true },
  { num: 36, name: "يس", ayat: 83, first: 3706, meccan: true },
  { num: 37, name: "الصافات", ayat: 182, first: 3789, meccan: true },
  { num: 38, name: "ص", ayat: 88, first: 3971, meccan: true },
  { num: 39, name: "الزمر", ayat: 75, first: 4059, meccan: true },
  { num: 40, name: "غافر", ayat: 85, first: 4134, meccan: true },
  { num: 41, name: "فصلت", ayat: 54, first: 4219, meccan: true },
  { num: 42, name: "الشورى", ayat: 53, first: 4273, meccan: true },
  { num: 43, name: "الزخرف", ayat: 89, first: 4326, meccan: true },
  { num: 44, name: "الدخان", ayat: 59, first: 4415, meccan: true },
  { num: 45, name: "الجاثية", ayat: 37, first: 4474, meccan: true },
  { num: 46, name: "الأحقاف", ayat: 35, first: 4511, meccan: true },
  { num: 47, name: "محمد", ayat: 38, first: 4546, meccan: false },
  { num: 48, name: "الفتح", ayat: 29, first: 4584, meccan: false },
  { num: 49, name: "الحجرات", ayat: 18, first: 4613, meccan: false },
  { num: 50, name: "ق", ayat: 45, first: 4631, meccan: true },
  { num: 51, name: "الذاريات", ayat: 60, first: 4676, meccan: true },
  { num: 52, name: "الطور", ayat: 49, first: 4736, meccan: true },
  { num: 53, name: "النجم", ayat: 62, first: 4785, meccan: true },
  { num: 54, name: "القمر", ayat: 55, first: 4847, meccan: true },
  { num: 55, name: "الرحمن", ayat: 78, first: 4902, meccan: false },
  { num: 56, name: "الواقعة", ayat: 96, first: 4980, meccan: true },
  { num: 57, name: "الحديد", ayat: 29, first: 5076, meccan: false },
  { num: 58, name: "المجادلة", ayat: 22, first: 5105, meccan: false },
  { num: 59, name: "الحشر", ayat: 24, first: 5127, meccan: false },
  { num: 60, name: "الممتحنة", ayat: 13, first: 5151, meccan: false },
  { num: 61, name: "الصف", ayat: 14, first: 5164, meccan: false },
  { num: 62, name: "الجمعة", ayat: 11, first: 5178, meccan: false },
  { num: 63, name: "المنافقون", ayat: 11, first: 5189, meccan: false },
  { num: 64, name: "التغابن", ayat: 18, first: 5200, meccan: false },
  { num: 65, name: "الطلاق", ayat: 12, first: 5218, meccan: false },
  { num: 66, name: "التحريم", ayat: 12, first: 5230, meccan: false },
  { num: 67, name: "الملك", ayat: 30, first: 5242, meccan: true },
  { num: 68, name: "القلم", ayat: 52, first: 5272, meccan: true },
  { num: 69, name: "الحاقة", ayat: 52, first: 5324, meccan: true },
  { num: 70, name: "المعارج", ayat: 44, first: 5376, meccan: true },
  { num: 71, name: "نوح", ayat: 28, first: 5420, meccan: true },
  { num: 72, name: "الجن", ayat: 28, first: 5448, meccan: true },
  { num: 73, name: "المزمل", ayat: 20, first: 5476, meccan: true },
  { num: 74, name: "المدثر", ayat: 56, first: 5496, meccan: true },
  { num: 75, name: "القيامة", ayat: 40, first: 5552, meccan: true },
  { num: 76, name: "الانسان", ayat: 31, first: 5592, meccan: false },
  { num: 77, name: "المرسلات", ayat: 50, first: 5623, meccan: true },
  { num: 78, name: "النبإ", ayat: 40, first: 5673, meccan: true },
  { num: 79, name: "النازعات", ayat: 46, first: 5713, meccan: true },
  { num: 80, name: "عبس", ayat: 42, first: 5759, meccan: true },
  { num: 81, name: "التكوير", ayat: 29, first: 5801, meccan: true },
  { num: 82, name: "الإنفطار", ayat: 19, first: 5830, meccan: true },
  { num: 83, name: "المطففين", ayat: 36, first: 5849, meccan: true },
  { num: 84, name: "الإنشقاق", ayat: 25, first: 5885, meccan: true },
  { num: 85, name: "البروج", ayat: 22, first: 5910, meccan: true },
  { num: 86, name: "الطارق", ayat: 17, first: 5932, meccan: true },
  { num: 87, name: "الأعلى", ayat: 19, first: 5949, meccan: true },
  { num: 88, name: "الغاشية", ayat: 26, first: 5968, meccan: true },
  { num: 89, name: "الفجر", ayat: 30, first: 5994, meccan: true },
  { num: 90, name: "البلد", ayat: 20, first: 6024, meccan: true },
  { num: 91, name: "الشمس", ayat: 15, first: 6044, meccan: true },
  { num: 92, name: "الليل", ayat: 21, first: 6059, meccan: true },
  { num: 93, name: "الضحى", ayat: 11, first: 6080, meccan: true },
  { num: 94, name: "الشرح", ayat: 8, first: 6091, meccan: true },
  { num: 95, name: "التين", ayat: 8, first: 6099, meccan: true },
  { num: 96, name: "العلق", ayat: 19, first: 6107, meccan: true },
  { num: 97, name: "القدر", ayat: 5, first: 6126, meccan: true },
  { num: 98, name: "البينة", ayat: 8, first: 6131, meccan: false },
  { num: 99, name: "الزلزلة", ayat: 8, first: 6139, meccan: false },
  { num: 100, name: "العاديات", ayat: 11, first: 6147, meccan: true },
  { num: 101, name: "القارعة", ayat: 11, first: 6158, meccan: true },
  { num: 102, name: "التكاثر", ayat: 8, first: 6169, meccan: true },
  { num: 103, name: "العصر", ayat: 3, first: 6177, meccan: true },
  { num: 104, name: "الهمزة", ayat: 9, first: 6180, meccan: true },
  { num: 105, name: "الفيل", ayat: 5, first: 6189, meccan: true },
  { num: 106, name: "قريش", ayat: 4, first: 6194, meccan: true },
  { num: 107, name: "الماعون", ayat: 7, first: 6198, meccan: true },
  { num: 108, name: "الكوثر", ayat: 3, first: 6205, meccan: true },
  { num: 109, name: "الكافرون", ayat: 6, first: 6208, meccan: true },
  { num: 110, name: "النصر", ayat: 3, first: 6214, meccan: false },
  { num: 111, name: "المسد", ayat: 5, first: 6217, meccan: true },
  { num: 112, name: "الإخلاص", ayat: 4, first: 6222, meccan: true },
  { num: 113, name: "الفلق", ayat: 5, first: 6226, meccan: true },
  { num: 114, name: "الناس", ayat: 6, first: 6231, meccan: true },
];

// أوّل معرّف آية في كل جزء (بالترتيب).
export const JUZ_STARTS: number[] = [
  1, 149, 260, 386, 517, 641, 751, 900, 1042, 1201,
  1328, 1479, 1649, 1803, 2030, 2215, 2484, 2674, 2876, 3215,
  3386, 3564, 3733, 4090, 4265, 4511, 4706, 5105, 5242, 5673,
];

// أوّل معرّف آية في كل وجه (بالترتيب).
export const PAGE_STARTS: number[] = [
  1, 8, 13, 24, 32, 37, 45, 56, 65, 69, 77, 84, 91, 96, 101, 109,
  113, 120, 127, 134, 142, 149, 153, 161, 171, 177, 184, 189, 194, 198, 204, 210,
  218, 223, 227, 232, 238, 241, 245, 253, 256, 260, 264, 267, 272, 277, 282, 289,
  290, 294, 303, 309, 316, 323, 331, 339, 346, 355, 364, 371, 377, 385, 394, 402,
  409, 415, 426, 434, 442, 447, 451, 459, 467, 474, 480, 488, 494, 500, 505, 508,
  513, 517, 520, 527, 531, 538, 545, 553, 559, 568, 573, 580, 585, 588, 595, 599,
  607, 615, 621, 628, 634, 641, 648, 656, 664, 669, 672, 675, 679, 683, 687, 693,
  701, 706, 711, 715, 720, 727, 734, 740, 746, 752, 759, 765, 773, 778, 783, 790,
  798, 808, 817, 825, 834, 842, 849, 858, 863, 871, 880, 884, 891, 900, 908, 914,
  921, 927, 932, 936, 941, 947, 955, 966, 977, 985, 992, 998, 1006, 1012, 1022, 1028,
  1036, 1042, 1050, 1059, 1075, 1085, 1092, 1098, 1104, 1110, 1114, 1118, 1125, 1133, 1142, 1150,
  1161, 1169, 1177, 1186, 1194, 1201, 1206, 1213, 1222, 1230, 1236, 1242, 1249, 1256, 1262, 1267,
  1272, 1276, 1283, 1290, 1297, 1304, 1308, 1315, 1322, 1329, 1335, 1342, 1347, 1353, 1358, 1365,
  1371, 1379, 1385, 1390, 1398, 1407, 1418, 1426, 1435, 1443, 1453, 1462, 1471, 1479, 1486, 1493,
  1502, 1511, 1519, 1527, 1536, 1545, 1555, 1562, 1571, 1582, 1591, 1601, 1611, 1619, 1627, 1634,
  1640, 1649, 1660, 1666, 1675, 1683, 1692, 1700, 1708, 1713, 1721, 1726, 1736, 1742, 1750, 1756,
  1761, 1769, 1775, 1784, 1793, 1803, 1818, 1834, 1854, 1873, 1893, 1908, 1916, 1928, 1936, 1944,
  1956, 1966, 1974, 1981, 1989, 1995, 2004, 2012, 2020, 2030, 2037, 2047, 2057, 2068, 2079, 2088,
  2096, 2105, 2116, 2126, 2134, 2145, 2156, 2161, 2168, 2175, 2186, 2194, 2202, 2215, 2224, 2238,
  2251, 2262, 2276, 2289, 2302, 2315, 2327, 2346, 2361, 2386, 2400, 2413, 2425, 2436, 2447, 2462,
  2474, 2484, 2494, 2508, 2519, 2528, 2541, 2556, 2565, 2574, 2585, 2596, 2601, 2611, 2619, 2626,
  2634, 2642, 2651, 2660, 2668, 2674, 2691, 2701, 2716, 2733, 2748, 2763, 2778, 2792, 2802, 2812,
  2819, 2823, 2828, 2835, 2845, 2850, 2853, 2858, 2867, 2876, 2888, 2899, 2911, 2923, 2933, 2952,
  2972, 2993, 3016, 3044, 3069, 3092, 3116, 3139, 3160, 3173, 3182, 3195, 3204, 3215, 3223, 3236,
  3248, 3258, 3266, 3274, 3281, 3288, 3296, 3303, 3312, 3323, 3330, 3337, 3347, 3355, 3364, 3371,
  3379, 3386, 3393, 3404, 3415, 3425, 3434, 3442, 3451, 3460, 3470, 3481, 3489, 3498, 3504, 3515,
  3524, 3534, 3540, 3549, 3556, 3564, 3569, 3577, 3584, 3588, 3596, 3607, 3614, 3621, 3629, 3638,
  3646, 3655, 3664, 3672, 3679, 3691, 3699, 3705, 3718, 3733, 3746, 3760, 3776, 3789, 3813, 3840,
  3865, 3891, 3915, 3942, 3971, 3987, 3997, 4013, 4032, 4054, 4064, 4069, 4080, 4090, 4099, 4106,
  4115, 4126, 4133, 4141, 4150, 4159, 4167, 4174, 4183, 4192, 4200, 4211, 4219, 4230, 4239, 4248,
  4257, 4265, 4273, 4283, 4288, 4295, 4304, 4317, 4324, 4336, 4348, 4359, 4373, 4386, 4399, 4415,
  4433, 4454, 4474, 4487, 4496, 4506, 4516, 4525, 4531, 4539, 4546, 4557, 4565, 4575, 4584, 4593,
  4599, 4607, 4612, 4617, 4624, 4631, 4646, 4666, 4682, 4706, 4727, 4750, 4767, 4785, 4811, 4829,
  4853, 4874, 4896, 4918, 4942, 4969, 4996, 5030, 5056, 5079, 5087, 5094, 5100, 5105, 5111, 5116,
  5126, 5130, 5136, 5143, 5151, 5156, 5162, 5169, 5178, 5186, 5193, 5200, 5209, 5218, 5223, 5230,
  5237, 5242, 5254, 5268, 5287, 5314, 5332, 5358, 5386, 5415, 5430, 5448, 5461, 5476, 5495, 5513,
  5543, 5571, 5597, 5617, 5642, 5673, 5703, 5728, 5759, 5801, 5830, 5855, 5883, 5910, 5932, 5964,
  5994, 6017, 6044, 6073, 6099, 6126, 6138, 6156, 6177, 6194, 6208, 6222,
];

// أوّل معرّف آية في كل رُبع حزب (بالترتيب).
export const RUB_STARTS: number[] = [
  1, 33, 51, 67, 82, 99, 113, 131, 149, 165, 184, 196, 210, 226, 240, 250,
  260, 270, 279, 290, 308, 326, 345, 368, 386, 406, 426, 446, 464, 479, 494, 505,
  517, 529, 551, 567, 581, 593, 607, 628, 641, 656, 670, 681, 696, 710, 720, 736,
  751, 766, 778, 802, 825, 848, 863, 884, 900, 916, 930, 940, 955, 985, 1001, 1019,
  1042, 1071, 1096, 1110, 1125, 1143, 1161, 1182, 1201, 1221, 1236, 1254, 1269, 1281, 1295, 1310,
  1328, 1346, 1357, 1375, 1390, 1417, 1435, 1454, 1479, 1497, 1514, 1534, 1557, 1581, 1603, 1626,
  1649, 1673, 1697, 1712, 1726, 1742, 1760, 1778, 1803, 1852, 1902, 1931, 1952, 1976, 1991, 2012,
  2030, 2052, 2079, 2099, 2128, 2157, 2172, 2191, 2215, 2239, 2272, 2309, 2349, 2403, 2431, 2459,
  2484, 2512, 2534, 2566, 2596, 2614, 2633, 2655, 2674, 2709, 2748, 2792, 2812, 2826, 2844, 2856,
  2876, 2908, 2933, 2984, 3043, 3113, 3160, 3186, 3215, 3241, 3264, 3281, 3303, 3328, 3341, 3366,
  3386, 3410, 3440, 3463, 3491, 3514, 3534, 3551, 3564, 3584, 3593, 3616, 3630, 3652, 3675, 3701,
  3733, 3765, 3810, 3871, 3933, 3991, 4022, 4066, 4090, 4111, 4134, 4154, 4174, 4199, 4227, 4243,
  4265, 4285, 4299, 4323, 4349, 4382, 4431, 4485, 4511, 4531, 4555, 4578, 4601, 4613, 4626, 4657,
  4706, 4759, 4810, 4855, 4902, 4980, 5054, 5091, 5105, 5118, 5137, 5157, 5178, 5192, 5218, 5230,
  5242, 5272, 5324, 5394, 5448, 5495, 5552, 5610, 5673, 5759, 5830, 5885, 5949, 6024, 6091, 6155,
];

// المعرّف العام لآية (سورة، آية).
export function surahAyahToId(surah: number, ayah: number): number {
  const s = SURAHS[surah - 1];
  return s ? s.first + (ayah - 1) : 1;
}

// أكبر فهرس بحيث starts[idx] <= id (بحث ثنائي). starts تصاعدية.
function lastLE(starts: number[], id: number): number {
  let lo = 0, hi = starts.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= id) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

export function idToSurahAyah(id: number): { surah: number; ayah: number } {
  const idx = lastLE(SURAHS.map((s) => s.first), id);
  const s = SURAHS[idx];
  return { surah: s.num, ayah: id - s.first + 1 };
}

// SURAHS.first مصفوفة تُبنى مرّة (للأداء).
const SURAH_FIRSTS = SURAHS.map((s) => s.first);
export function idToSurah(id: number): number { return SURAHS[lastLE(SURAH_FIRSTS, id)].num; }
export function idToJuz(id: number): number { return lastLE(JUZ_STARTS, id) + 1; }
export function idToPage(id: number): number { return lastLE(PAGE_STARTS, id) + 1; }
export function idToRub(id: number): number { return lastLE(RUB_STARTS, id) + 1; }
export function idToHizb(id: number): number { return Math.ceil(idToRub(id) / 4); }

// مدى المعرّفات [start, end] لوحدةٍ ما.
function rangeFromStarts(starts: number[], n: number): { start: number; end: number } {
  const start = starts[n - 1];
  const end = n < starts.length ? starts[n] - 1 : TOTAL_AYAT;
  return { start, end };
}
export const juzRange = (j: number) => rangeFromStarts(JUZ_STARTS, j);
export const pageRange = (p: number) => rangeFromStarts(PAGE_STARTS, p);
export const rubRange = (q: number) => rangeFromStarts(RUB_STARTS, q);
// الحزب = 4 أرباع؛ من أوّل رُبعٍ فيه إلى آخر آيةٍ قبل الحزب التالي.
export function hizbRange(h: number): { start: number; end: number } {
  const firstRub = (h - 1) * 4 + 1;
  const start = RUB_STARTS[firstRub - 1];
  const nextFirstRub = h * 4 + 1;
  const end = nextFirstRub <= 240 ? RUB_STARTS[nextFirstRub - 1] - 1 : TOTAL_AYAT;
  return { start, end };
}

// وصفٌ عربي مختصر لمدى معرّفات (مثل «البقرة 1 – 5» أو «الفاتحة»).
export function describeRange(start: number, end: number): string {
  const a = idToSurahAyah(start), b = idToSurahAyah(end);
  const nameA = SURAHS[a.surah - 1].name;
  if (a.surah === b.surah) {
    const s = SURAHS[a.surah - 1];
    if (a.ayah === 1 && b.ayah === s.ayat) return s.name;
    return a.ayah === b.ayah ? `${nameA} ${a.ayah}` : `${nameA} ${a.ayah}–${b.ayah}`;
  }
  const nameB = SURAHS[b.surah - 1].name;
  return `${nameA} ${a.ayah} – ${nameB} ${b.ayah}`;
}
