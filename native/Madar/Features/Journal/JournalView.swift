import SwiftUI

struct JournalView: View {
    @EnvironmentObject var store: Store
    @State private var search = ""
    @State private var starredOnly = false
    @State private var editing: JournalEntry?
    @State private var quick = ""
    @FocusState private var quickFocused: Bool

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
            MdrList {
                if search.isEmpty && !starredOnly { todayHeader }
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
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { FutureLettersView() } label: { Image(systemName: "envelope") }
                        .accessibilityLabel("رسائل للمستقبل")
                }
            }
            .sheet(item: $editing) { e in JournalEditor(entry: e) }
        }
    }

    @ViewBuilder private var todayHeader: some View {
        let today = DateKey.today()
        let question = QuestionLibrary.daily(today)
        let todays = store.data.journalEntries.first { $0.date == today }
        Section {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Text("\(Fmt.count(store.data.journalEntries.count)) مذكرة")
                    Diamond(size: 5)
                    Text("\(Fmt.count(writingStreak(today))) يوم متواصل")
                    Spacer()
                    Star(size: 22)
                }
                .font(Mdr.font(13)).foregroundStyle(Mdr.ink52)

                Button { editing = todays ?? JournalEntry.new(date: today) } label: {
                    Text(todays == nil ? "اكتب مذكرة اليوم" : "أضِف إلى مذكرة اليوم")
                }
                .buttonStyle(.mdr(.ink, grow: true))

                HStack(spacing: 8) {
                    TextField("سطرٌ سريع… خاطرة، امتنان، أو ملاحظة", text: $quick, axis: .vertical)
                        .font(Mdr.font(15))
                        .focused($quickFocused)
                        .submitLabel(.done)
                        .onSubmit { store.appendQuickLine(quick, on: today); quick = "" }
                    Button("أضف") { store.appendQuickLine(quick, on: today); quick = ""; quickFocused = false }
                        .buttonStyle(.mdr(quick.isEmpty ? .ghost : .ink))
                        .disabled(quick.isEmpty)
                }
                .padding(.leading, 14).padding(.trailing, 6).padding(.vertical, 6)
                .background(Mdr.paper2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Mdr.line))

                Panel(tone: .gold) {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "moon.fill").font(.system(size: 20)).foregroundStyle(Mdr.gold)
                            .frame(width: 40, height: 40)
                            .background(Mdr.goldw, in: Circle())
                        VStack(alignment: .leading, spacing: 8) {
                            Text("سؤال اليوم").font(Mdr.font(11, black: true)).foregroundStyle(Mdr.ink52)
                            Text(question).font(Mdr.font(18, black: true))
                            Button("اكتب عنه") {
                                var e = todays ?? JournalEntry.new(date: today)
                                if e.question == nil { e.raw.put("question", question) }
                                editing = e
                            }
                            .buttonStyle(.mdr(.gold))
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
        let memories = onThisDay(today)
        if !memories.isEmpty {
            Section("في مثل هذا اليوم") {
                ForEach(memories) { e in
                    Button { editing = e } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(yearsAgo(e.date)).font(.mdrCaption.weight(.semibold)).foregroundStyle(Theme.journal)
                            JournalRow(entry: e)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// أيامٌ متتاليةٌ فيها مذكرة، تنتهي اليوم أو أمس (اليومُ الذي لم يُكتب بعدُ لا يقطعها).
    private func writingStreak(_ today: String) -> Int {
        let days = Set(store.data.journalEntries.map(\.date))
        var d = days.contains(today) ? today : DateKey.adding(days: -1, to: today)
        var n = 0
        while days.contains(d) { n += 1; d = DateKey.adding(days: -1, to: d) }
        return n
    }

    private func onThisDay(_ today: String) -> [JournalEntry] {
        let md = String(today.dropFirst(5))
        return store.data.journalEntries.filter { $0.date.hasSuffix(md) && $0.date < today }.sorted { $0.date > $1.date }
    }

    private func yearsAgo(_ date: String) -> String {
        let y = (Int(DateKey.today().prefix(4)) ?? 0) - (Int(date.prefix(4)) ?? 0)
        return y == 1 ? "قبل سنة" : y == 2 ? "قبل سنتين" : "قبل \(Fmt.count(y)) سنوات"
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
                    .font(Mdr.font(24, black: true))
                Text(weekday).font(.mdrCaption2).foregroundStyle(.secondary)
            }
            .frame(width: 40)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if !entry.title.isEmpty { Text(entry.title).font(.mdrHeadline).lineLimit(1) }
                    if entry.starred { Image(systemName: "star.fill").font(.mdrCaption).foregroundStyle(Theme.brand) }
                    if let m = Mood.of(entry.mood) { Text(m.emoji).font(.mdrCaption) }
                }
                if !snippet.isEmpty {
                    Text(snippet).font(.mdrSubheadline).foregroundStyle(entry.title.isEmpty ? .primary : .secondary).lineLimit(3)
                }
                HStack(spacing: 8) {
                    if let t = entry.time { Text(Digits.indic(t)) }
                    if let p = entry.place { Label(p, systemImage: "mappin").lineLimit(1) }
                    if !entry.audios.isEmpty { Image(systemName: "waveform") }
                }
                .font(.mdrCaption).foregroundStyle(.secondary)
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
