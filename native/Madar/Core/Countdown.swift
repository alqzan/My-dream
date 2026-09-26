import Foundation

/// حدثٌ مهمّ بعدّه التنازلي (`CountdownEvent`) — تاريخٌ واحد يُعدّ إليه.
struct CountdownEvent: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    static func new(title: String, date: String, emoji: String?) -> CountdownEvent {
        var e = CountdownEvent(raw: [:])
        e.raw.put("id", newID()); e.raw.put("title", title); e.raw.put("date", date); e.raw.put("emoji", emoji)
        return e
    }
    var title: String { get { raw.str("title") ?? "" } set { raw.put("title", newValue) } }
    var date: String { get { raw.str("date") ?? "" } set { raw.put("date", newValue) } }
    var emoji: String? { get { raw.str("emoji") } set { raw.put("emoji", newValue) } }
    var countUpAfter: Bool {
        get { raw.bool("countUpAfter") ?? false }
        set { if newValue { raw.put("countUpAfter", true) } else { raw["countUpAfter"] = nil } }
    }
}

/// نقلٌ لـ`countdown.ts`.
enum Countdown {
    static func daysUntil(_ date: String, from: String) -> Int? {
        DateKey.isValid(date) ? DateKey.days(from: from, to: date) : nil
    }

    static func isVisible(_ e: CountdownEvent, from: String) -> Bool {
        guard let d = daysUntil(e.date, from: from) else { return false }
        return d >= 0 || e.countUpAfter || d >= -1
    }

    static func visible(_ events: [CountdownEvent], from: String) -> [CountdownEvent] {
        events.filter { isVisible($0, from: from) }.sorted { a, b in
            let da = daysUntil(a.date, from: from) ?? .max, db = daysUntil(b.date, from: from) ?? .max
            let ra = da >= 0 ? 0 : 1, rb = db >= 0 ? 0 : 1
            if ra != rb { return ra < rb }
            if da != db { return ra == 0 ? da < db : da > db }
            return a.title < b.title
        }
    }

    static func describe(_ days: Int) -> String {
        if days == 0 { return "اليوم" }
        if days == 1 { return "غداً" }
        if days == -1 { return "أمس" }
        let n = abs(days)
        let unit = n == 2 ? "يومين" : (3...10).contains(n) ? "\(Fmt.count(n)) أيام" : "\(Fmt.count(n)) يوماً"
        return days > 0 ? "بعد \(unit)" : "قبل \(unit)"
    }

    private static func months(_ m: Int) -> String {
        m == 1 ? "شهر" : m == 2 ? "شهران" : m <= 10 ? "\(Fmt.count(m)) أشهر" : "\(Fmt.count(m)) شهراً"
    }

    static func coarse(_ days: Int) -> String? {
        let n = abs(days)
        guard n >= 30 else { return nil }
        let m = Int((Double(n) / 30.44).rounded())
        if m < 12 { return "\(months(m)) تقريباً" }
        let y = m / 12, rem = m % 12
        let ys = y == 1 ? "سنة" : y == 2 ? "سنتان" : "\(Fmt.count(y)) سنوات"
        return rem == 0 ? "\(ys) تقريباً" : "\(ys) و\(months(rem)) تقريباً"
    }
}

extension AppData {
    var countdownEvents: [CountdownEvent] {
        get { rest.objects("countdownEvents").map(CountdownEvent.init(raw:)) }
        set { rest.put("countdownEvents", objects: newValue.map(\.raw)) }
    }
}

extension Store {
    func saveEvent(_ e: CountdownEvent) {
        var e = e
        e.stamp()
        update { d in
            var list = d.countdownEvents
            if let i = list.firstIndex(where: { $0.id == e.id }) { list[i] = e } else { list.append(e) }
            d.countdownEvents = list
        }
    }
    func deleteEvent(_ id: String) {
        update { d in
            d.countdownEvents = d.countdownEvents.filter { $0.id != id }
            d.tombstone(id)
        }
    }

    /// السطرُ السريع: فقرةٌ تُلحق بمذكرة اليوم، ومعرّفها يُسجَّل في `quickLines`
    /// فلا يُسقطه دمجٌ مع جهازٍ آخر (`journalQuickLine.ts`).
    func appendQuickLine(_ text: String, on date: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "HH:mm"
        let line = "\(Digits.indic(f.string(from: Date()))) — \(t)"
        let lid = UUID().uuidString.lowercased()
        update { d in
            var e: JournalEntry
            var idx: Int?
            if let i = d.journalEntries.firstIndex(where: { $0.date == date }) { e = d.journalEntries[i]; idx = i } else { e = JournalEntry.new(date: date) }
            e.content = e.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? line : e.content.replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression) + "\n\n" + line
            var known = e.raw.objects("quickLines")
            known.append(["id": .string(lid), "text": .string(line)])
            e.raw.put("quickLines", objects: known)
            e.stamp()
            if let i = idx { d.journalEntries[i] = e } else { d.journalEntries.append(e) }
        }
        Haptic.success()
    }
}
