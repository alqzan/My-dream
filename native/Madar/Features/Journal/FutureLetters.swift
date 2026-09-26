import SwiftUI

/// رسالةٌ لنفسك المستقبلية — مقفلةٌ حتى يوم التسليم ثمّ تُفتح (`FutureLetter`).
struct FutureLetter: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    var title: String { raw.str("title") ?? "" }
    var content: String { raw.str("content") ?? "" }
    var writtenDate: String { raw.str("writtenDate") ?? "" }
    var deliveryDate: String { raw.str("deliveryDate") ?? "" }
    var opened: Bool { raw.bool("opened") ?? false }
}

extension AppData {
    var futureLetters: [FutureLetter] {
        get { rest.objects("futureLetters").map(FutureLetter.init(raw:)) }
        set { rest.put("futureLetters", objects: newValue.map(\.raw)) }
    }
}

struct FutureLettersView: View {
    @EnvironmentObject var store: Store
    @State private var writing = false
    @State private var reading: FutureLetter?
    private var today: String { DateKey.today() }

    var body: some View {
        List {
            let letters = store.data.futureLetters.sorted { $0.deliveryDate < $1.deliveryDate }
            if letters.isEmpty {
                ContentUnavailableView("لا رسائل بعد", systemImage: "envelope",
                                       description: Text("اكتب لنفسك بعد سنة: ما تتمنّاه، وما تخشاه، وما تريد أن تتذكّره."))
            }
            ForEach(letters) { l in
                let ready = l.deliveryDate <= today
                Button {
                    if ready { reading = l; open(l) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: ready ? (l.opened ? "envelope.open" : "envelope.badge") : "lock.fill")
                            .foregroundStyle(ready ? Theme.journal : .secondary)
                            .font(.title3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(l.title.isEmpty ? "رسالة \(Fmt.shortDate(key: l.writtenDate))" : l.title)
                            Text(ready ? "وصلت \(Fmt.shortDate(key: l.deliveryDate))" : "تُفتح \(Countdown.describe(DateKey.days(from: today, to: l.deliveryDate)))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
                .swipeActions {
                    Button(role: .destructive) {
                        store.update { d in d.futureLetters = d.futureLetters.filter { $0.id != l.id }; d.tombstone(l.id) }
                    } label: { Label("حذف", systemImage: "trash") }
                }
            }
        }
        .navigationTitle("رسائل للمستقبل")
        .toolbar { Button { writing = true } label: { Image(systemName: "square.and.pencil") } }
        .sheet(isPresented: $writing) { LetterComposer() }
        .sheet(item: $reading) { l in
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("كتبتَها في \(Fmt.shortDate(key: l.writtenDate))").font(.caption).foregroundStyle(.secondary)
                        if !l.title.isEmpty { Text(l.title).font(.title2.bold()) }
                        Text(l.content).lineSpacing(6)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .navigationTitle("من الماضي")
                .navigationBarTitleDisplayMode(.inline)
            }
        }
    }

    private func open(_ l: FutureLetter) {
        guard !l.opened else { return }
        store.update { d in
            var list = d.futureLetters
            if let i = list.firstIndex(where: { $0.id == l.id }) {
                list[i].raw.put("opened", true)
                list[i].raw.put("openedDate", today)
                list[i].stamp()
            }
            d.futureLetters = list
        }
        Haptic.success()
    }
}

struct LetterComposer: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var content = ""
    @State private var delivery = DateKey.calendar.date(byAdding: .year, value: 1, to: Date()) ?? Date()

    var body: some View {
        NavigationStack {
            Form {
                TextField("عنوان (اختياري)", text: $title)
                DatePicker("تُفتح في", selection: $delivery, in: Date().addingTimeInterval(86400)..., displayedComponents: .date)
                TextField("اكتب لنفسك…", text: $content, axis: .vertical).lineLimit(8...30)
            }
            .navigationTitle("رسالة للمستقبل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("أغلِق الظرف") {
                        var l = FutureLetter(raw: [:])
                        l.raw.put("id", FutureLetter.newID())
                        l.raw.put("writtenDate", DateKey.today())
                        l.raw.put("deliveryDate", DateKey.string(delivery))
                        if !title.isEmpty { l.raw.put("title", title) }
                        l.raw.put("content", content)
                        l.stamp()
                        store.update { d in d.futureLetters = d.futureLetters + [l] }
                        dismiss()
                    }
                    .disabled(content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
    }
}
