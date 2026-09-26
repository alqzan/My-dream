import SwiftUI

struct JournalView: View {
    @EnvironmentObject var store: Store
    @State private var search = ""
    @State private var starredOnly = false
    @State private var editing: JournalEntry?

    private struct MonthGroup: Identifiable { let id: String; let title: String; let entries: [JournalEntry] }

    private var groups: [MonthGroup] {
        let q = search.trimmingCharacters(in: .whitespaces)
        let list = store.data.journalEntries
            .filter { !starredOnly || $0.starred }
            .filter { q.isEmpty || $0.content.localizedCaseInsensitiveContains(q) || $0.title.localizedCaseInsensitiveContains(q) }
            .sorted { ($0.date, $0.time ?? "") > ($1.date, $1.time ?? "") }
        var out: [MonthGroup] = []
        var current: (String, [JournalEntry])?
        for e in list {
            let m = String(e.date.prefix(7))
            if current?.0 == m { current?.1.append(e) }
            else {
                if let c = current { out.append(group(c)) }
                current = (m, [e])
            }
        }
        if let c = current { out.append(group(c)) }
        return out
    }

    private func group(_ c: (String, [JournalEntry])) -> MonthGroup {
        MonthGroup(id: c.0, title: DateKey.date(c.0 + "-01").map(Fmt.monthYear) ?? c.0, entries: c.1)
    }

    var body: some View {
        NavigationStack {
            List {
                if store.data.journalEntries.isEmpty {
                    ContentUnavailableView("لا مذكرات بعد", systemImage: "book.closed",
                                           description: Text("اكتب أوّل مذكرة، أو استورد نسختك من الإعدادات."))
                }
                ForEach(groups) { g in
                    Section(g.title) {
                        ForEach(g.entries) { e in
                            Button { editing = e } label: { JournalRow(entry: e) }
                                .buttonStyle(.plain)
                                .swipeActions {
                                    Button(role: .destructive) { delete(e) } label: { Label("حذف", systemImage: "trash") }
                                    Button { toggleStar(e) } label: { Label("تمييز", systemImage: "star") }.tint(Theme.brand)
                                }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $search, prompt: "ابحث في مذكراتك")
            .navigationTitle("المذكرات")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { editing = JournalEntry.new(date: DateKey.today()) } label: { Image(systemName: "square.and.pencil") }
                        .accessibilityLabel("مذكرة جديدة")
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button { starredOnly.toggle() } label: { Image(systemName: starredOnly ? "star.fill" : "star") }
                        .accessibilityLabel("المميّزة فقط")
                }
            }
            .sheet(item: $editing) { e in JournalEditor(entry: e) }
        }
    }

    private func delete(_ e: JournalEntry) {
        store.update { d in
            d.journalEntries.removeAll { $0.id == e.id }
            d.tombstone(e.id)
        }
    }

    private func toggleStar(_ e: JournalEntry) {
        store.update { d in
            if let i = d.journalEntries.firstIndex(where: { $0.id == e.id }) {
                d.journalEntries[i].starred.toggle()
                d.journalEntries[i].stamp()
            }
        }
    }
}

struct JournalRow: View {
    let entry: JournalEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Text(Fmt.count(DateKey.calendar.component(.day, from: DateKey.date(entry.date) ?? Date())))
                    .font(.title2.weight(.semibold))
                Text(weekday).font(.caption2).foregroundStyle(.secondary)
            }
            .frame(width: 40)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if !entry.title.isEmpty { Text(entry.title).font(.headline).lineLimit(1) }
                    if entry.starred { Image(systemName: "star.fill").font(.caption).foregroundStyle(Theme.brand) }
                    if let m = Mood.of(entry.mood) { Text(m.emoji).font(.caption) }
                }
                if !snippet.isEmpty {
                    Text(snippet).font(.subheadline).foregroundStyle(entry.title.isEmpty ? .primary : .secondary).lineLimit(3)
                }
                HStack(spacing: 8) {
                    if let t = entry.time { Text(Digits.indic(t)) }
                    if let p = entry.place { Label(p, systemImage: "mappin").lineLimit(1) }
                    if !entry.audios.isEmpty { Image(systemName: "waveform") }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if let first = entry.photos.first {
                MediaImage(ref: first, maxPixel: 200)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private static let weekdayF: DateFormatter = {
        let f = DateFormatter()
        f.locale = Fmt.arabicLocale
        f.dateFormat = "EEE"
        return f
    }()

    private var weekday: String {
        guard let d = DateKey.date(entry.date) else { return "" }
        return Self.weekdayF.string(from: d)
    }

    private var snippet: String {
        let t = entry.content.replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "#", with: "").replacingOccurrences(of: "*", with: "")
            .trimmingCharacters(in: .whitespaces)
        return String(t.prefix(220))
    }
}
