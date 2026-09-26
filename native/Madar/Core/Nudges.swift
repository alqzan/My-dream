import Foundation

/// التذكيرات اللطيفة — نقلٌ لـ`src/lib/nudges.ts` بصياغاته حرفاً وبذرته اليومية
/// نفسها. ثلاثة قيود: **لا لوم** · **لا ثبات** (تتبدّل يومياً وتثبت داخل اليوم) ·
/// **ومعه الموضع دائماً**. الأبعدُ أوّلاً صباحاً، وما لم يُبدأ قطّ أخيراً،
/// والمساءُ حصادٌ لا جرد. (المحبرة خارج هذه النسخة، فطقسا القراءة والعادات لا يظهران.)
enum Nudges {
    enum Moment { case morning, evening }
    enum Ritual: String { case quran, journal }
    enum Distance { case fresh, today, near, away, far }

    struct Line: Identifiable { let key: String; let text: String; let place: String?; let done: Bool; var id: String { key } }
    struct Nudge { let moment: Moment; let title: String; let lines: [Line]; let closing: String }

    static func moment(hour: Int) -> Moment { hour >= 18 ? .evening : .morning }

    /// FNV-1a على وحدات UTF-16 كما في الويب (`Math.imul`).
    static func seed(_ parts: String...) -> Int {
        var h = Int32(bitPattern: 2166136261)
        for part in parts {
            for u in part.utf16 {
                h ^= Int32(u)
                h = h &* 16777619
            }
        }
        return Int(Int64(h).magnitude)
    }

    static func pick<T>(_ pool: [T], _ seed: Int) -> T { pool[seed % pool.count] }

    static func count(_ n: Int, one: String, two: String, few: String, many: String) -> String {
        if n == 0 { return "\(Fmt.count(0)) \(few)" }
        if n == 1 { return one }
        if n == 2 { return two }
        if n <= 10 { return "\(Fmt.count(n)) \(few)" }
        return "\(Fmt.count(n)) \(many)"
    }

    static func span(_ days: Int) -> String {
        let n = max(0, days)
        if n <= 0 { return "اليوم" }
        if n == 1 { return "أمس" }
        if n < 14 { return "قبل \(count(n, one: "يوم واحد", two: "يومان", few: "أيام", many: "يوماً"))" }
        if n < 60 { return "قبل \(count(Int((Double(n) / 7).rounded()), one: "أسبوع", two: "أسبوعين", few: "أسابيع", many: "أسبوعاً"))" }
        return "قرابة \(count(Int((Double(n) / 30).rounded()), one: "شهر", two: "شهرين", few: "أشهر", many: "شهراً"))"
    }

    struct State { let key: Ritual; let doneToday: Bool; let gap: Int?; let place: String }

    static func distance(_ s: State) -> Distance {
        if s.doneToday { return .today }
        guard let g = s.gap else { return .fresh }
        if g <= 2 { return .near }
        return g < 14 ? .away : .far
    }

    static func quranDates(_ d: AppData) -> Set<String> {
        var s = Set(d.quranWird)
        let h = HifzState(raw: d.hifz)
        for o in h.sessions + h.reviews { if let x = o.str("date") { s.insert(x) } }
        for r in d.quranReflections { s.insert(r.date) }
        if let l = d.khatma.lastReadDate { s.insert(l) }
        return s
    }

    static func quranPlace(_ d: AppData) -> String {
        var parts: [String] = []
        let k = d.khatma
        if k.page > 0 { parts.append("الصفحة \(Fmt.count(k.page))") }
        let f = HifzState(raw: d.hifz).frontierId
        if f > 0 {
            let a = QuranMeta.surahAyah(f)
            parts.append("الحفظ عند \(QuranMeta.surahs[a.surah - 1].name) \(Fmt.count(a.ayah))")
        }
        return parts.joined(separator: " · ")
    }

    static func states(_ d: AppData, today: String) -> [State] {
        func latest(_ dates: some Sequence<String>) -> String? {
            dates.filter { DateKey.isValid($0) && $0 <= today }.max()
        }
        let frozen = Set(d.rest.strings("frozenHabits"))
        let qd = quranDates(d)
        let jd = d.journalEntries.map(\.date)
        var out: [State] = []
        if !frozen.contains("core:wird") {
            let last = latest(qd)
            out.append(State(key: .quran, doneToday: qd.contains(today), gap: last.map { max(0, DateKey.days(from: $0, to: today)) }, place: quranPlace(d)))
        }
        if !frozen.contains("core:journal") {
            let last = latest(jd)
            let n = d.journalEntries.count
            out.append(State(key: .journal, doneToday: jd.contains(today), gap: last.map { max(0, DateKey.days(from: $0, to: today)) },
                             place: n > 0 ? "\(count(n, one: "مذكرة واحدة", two: "مذكرتان", few: "مذكرات", many: "مذكرة")) حتى الآن" : ""))
        }
        return out
    }

    static let titles: [Moment: [String]] = [
        .morning: ["يومٌ جديد بين يديك", "قبل أن يبدأ الزحام", "ما ينتظرك اليوم", "بدايةُ اليوم", "بابان أو ثلاثة، لا أكثر", "خُذها على مهلك"],
        .evening: ["وش صار اليوم", "حصادُ اليوم", "آخرُ النهار", "يومُك كما جرى", "طيُّ الصفحة", "قبل أن تُسلِم اليوم"],
    ]
    static let closings: [Moment: [String]] = [
        .morning: ["ما ينقصك وقت — ينقصك أوّل خطوة صغيرة.", "واحدةٌ منها تكفي ليكون اليوم على خير.", "لا تحاول تعويض ما مضى؛ اليومُ وحده يكفي.",
                   "خذ الأسهل أولاً، والباقي يتبع.", "الاستمرارُ أهون من البداية — وأنت بدأتَ من قبل.", "بلا استعجال. الباب لا يُغلق."],
        .evening: ["نم وأنت مطمئن — الغد فيه متّسع.", "ما تمّ يُشكَر، وما بقي لا يُحاسَب.", "يومٌ مضى وأنت فيه أحسن من أمس أو مثله، وكلاهما خير.",
                   "لا تُثقل نفسك بما لم يقع.", "أغلِق اليوم على ما فيه؛ هذا يكفي.", "الحسابُ هنا ليس حساباً — خبرٌ لتقرأه ثمّ تنام."],
    ]

    static let morning: [Ritual: [Distance: [String]]] = [
        .quran: [
            .fresh: ["القرآن ينتظر أوّل صفحة — ولا يشترط عليك ختمة.", "ما بدأتَ وِردك بعد. آيةٌ واحدة تفتح الباب.", "صفحةٌ واحدة اليوم، وتكون قد بدأت."],
            .near: ["وِردك اليوم ما زال بانتظارك.", "بقي وِردُك — وأنت قريبٌ منه.", "لم تفتح المصحف اليوم بعد."],
            .away: ["آخرُ وِردٍ لك {مدة}. تُكمل من موضعك لا من الأوّل.", "{مدة} بلا وِرد — والصفحةُ التي وقفتَ عندها كما تركتها.", "مرّت {مدة} على وِردك. موضعُك محفوظ."],
            .far: ["{مدة} على وِردك — وموضعُك ما زال كما هو ينتظرك.", "انقطع وِردُك {مدة}. لا شيءَ ضاع: تبدأ من حيث وقفت.", "{مدة} والمصحفُ على الصفحة نفسها. صفحةٌ اليوم تكفي لتعود."],
        ],
        .journal: [
            .fresh: ["دفترُ مذكراتك فارغ — وأوّلُ سطرٍ أسهل ممّا تظنّ.", "ما كتبتَ مذكرةً بعد. سطران يكفيان.", "أوّل مذكرة تنتظر: كيف كان يومك؟"],
            .near: ["ما كتبتَ اليوم بعد.", "مذكرةُ اليوم ما زالت بيضاء.", "سطران قبل أن ينتهي اليوم."],
            .away: ["آخرُ مذكرةٍ كتبتها {مدة}.", "{مدة} بلا كتابة — والأيامُ بينهما تُنسى إن لم تُكتب.", "مرّت {مدة} على آخر سطرٍ كتبته."],
            .far: ["{مدة} من غير مذكرة. اكتب اليوم وحده؛ لا تُعوّض ما مضى.", "دفترُك ساكنٌ {مدة}. سطرٌ واحد يفتحه.", "{مدة} — والذاكرةُ أقصرُ ممّا نظنّ. اكتب شيئاً صغيراً."],
        ],
    ]
    static let evening: [Ritual: [Distance: [String]]] = [
        .quran: [
            .today: ["وِردُك اليوم تمّ.", "قرأتَ وِردك اليوم — وهذا يُكتب.", "المصحفُ فُتح اليوم."],
            .near: ["اليومُ مرّ بلا وِرد.", "ما فُتح المصحفُ اليوم.", "الوِردُ لم يقع اليوم."],
            .away: ["الوِردُ ساكنٌ منذ {مدة}.", "آخرُ وِردٍ لك {مدة}."],
            .far: ["{مدة} على وِردك — وموضعُك محفوظ متى عُدت.", "ما زال المصحفُ عند موضعك منذ {مدة}."],
            .fresh: ["القرآنُ ينتظر أوّل صفحة، متى ما جاءك الوقت."],
        ],
        .journal: [
            .today: ["كتبتَ مذكرةَ اليوم.", "اليومُ مكتوب.", "سجّلتَ يومك."],
            .near: ["اليومُ لم يُكتب بعد — وما زال في الليل متّسع."],
            .away: ["آخرُ مذكرةٍ لك {مدة}."],
            .far: ["الدفترُ ساكنٌ {مدة}."],
            .fresh: ["الدفترُ ما زال بلا أوّل سطر."],
        ],
    ]

    private static func phrase(_ pools: [Distance: [String]]?, _ d: Distance, _ seed: Int, _ gap: Int?) -> String? {
        guard let pool = pools?[d], !pool.isEmpty else { return nil }
        return pick(pool, seed).replacingOccurrences(of: "{مدة}", with: span(gap ?? 0))
    }

    static func build(_ d: AppData, today: String, hour: Int, prayed: Int?) -> Nudge? {
        let m = moment(hour: hour)
        let base = "\(today):\(m == .morning ? "morning" : "evening")"
        let title = pick(titles[m]!, seed(base, "title"))
        let closing = pick(closings[m]!, seed(base, "closing"))
        let rituals = states(d, today: today)

        if m == .morning {
            let open = rituals.filter { !$0.doneToday }.sorted { ($0.gap ?? -1) > ($1.gap ?? -1) }.prefix(3)
            var lines: [Line] = []
            for r in open {
                if let t = phrase(morning[r.key], distance(r), seed(base, r.key.rawValue), r.gap) {
                    lines.append(Line(key: r.key.rawValue, text: t, place: r.place.isEmpty ? nil : r.place, done: false))
                }
            }
            if lines.isEmpty {
                lines = [Line(key: "quran", text: "كلُّ أبوابك مُغلقةٌ على خير — لا شيءَ ينتظرك.", place: nil, done: true)]
            }
            return Nudge(moment: m, title: title, lines: lines, closing: closing)
        }

        var lines: [Line] = []
        for r in rituals where r.doneToday {
            if let t = phrase(evening[r.key], .today, seed(base, r.key.rawValue), r.gap) {
                lines.append(Line(key: r.key.rawValue, text: t, place: nil, done: true))
            }
        }
        if let p = prayed {
            let n = max(0, min(5, p))
            let text = n >= 5 ? "الصلواتُ الخمسُ مسجَّلة." : n == 0 ? "لم تُسجَّل صلواتُ اليوم بعد."
                : "سجّلتَ \(count(n, one: "صلاةً واحدة", two: "صلاتين", few: "صلوات", many: "صلاة")) اليوم."
            lines.append(Line(key: "prayers", text: text, place: nil, done: n >= 5))
        }
        if let pending = rituals.filter({ !$0.doneToday }).sorted(by: { ($0.gap ?? 9999) < ($1.gap ?? 9999) }).first,
           let t = phrase(evening[pending.key], distance(pending), seed(base, pending.key.rawValue), pending.gap) {
            lines.append(Line(key: pending.key.rawValue, text: t, place: pending.place.isEmpty ? nil : pending.place, done: false))
        }
        return lines.isEmpty ? nil : Nudge(moment: m, title: title, lines: lines, closing: closing)
    }

    /// كلماتُ العتب الممنوعة — الحارس نفسه في اختبار الويب.
    static let blameWords = ["قصّرت", "فاتك", "تأخّرت", "أهملت", "للأسف", "عيب"]
}
