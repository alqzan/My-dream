import SwiftUI
import PhotosUI
import AVFoundation

/// محرّر المذكرة. يعمل على نسخةٍ محلية ويحفظ عند الإغلاق — مذكرةٌ فارغة لا تُحفظ.
struct JournalEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var entry: JournalEntry
    @State private var picks: [PhotosPickerItem] = []
    @State private var viewing: String?
    @State private var confirmDelete = false
    @State private var cancelled = false
    @FocusState private var focused: Bool
    private let isNew: Bool
    private let original: JournalEntry

    init(entry: JournalEntry) {
        _entry = State(initialValue: entry)
        original = entry
        isNew = entry.content.isEmpty && entry.title.isEmpty && entry.photos.isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DatePicker("التاريخ", selection: dateBinding, in: ...Date(), displayedComponents: .date)
                        .labelsHidden()
                        .environment(\.locale, Fmt.arabicLocale)

                    TextField("عنوان اليوم", text: $entry.title, axis: .vertical)
                        .font(.title2.weight(.semibold))

                    if let q = entry.question { Text(q).font(.subheadline).foregroundStyle(.secondary) }

                    TextField("ماذا في يومك؟", text: $entry.content, axis: .vertical)
                        .font(.body)
                        .lineSpacing(6)
                        .focused($focused)
                        .frame(minHeight: 220, alignment: .top)

                    if !entry.photos.isEmpty { photoStrip }
                    if !entry.audios.isEmpty { AudioList(refs: entry.audios) }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("شعور اليوم").font(.subheadline).foregroundStyle(.secondary)
                        HStack {
                            ForEach(Mood.all) { m in
                                Button {
                                    entry.mood = entry.mood == m.value ? nil : m.value
                                    Haptic.tap()
                                } label: {
                                    VStack(spacing: 2) {
                                        Text(m.emoji).font(.title2)
                                        Text(m.label).font(.caption2)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 56)
                                    .background(entry.mood == m.value ? Theme.journal.opacity(0.18) : Color.clear,
                                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() }.bold() }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء", role: .cancel) { cancelled = true; dismiss() } }
                ToolbarItemGroup(placement: .bottomBar) {
                    PhotosPicker(selection: $picks, maxSelectionCount: 10, matching: .images) {
                        Image(systemName: "photo.on.rectangle")
                    }
                    Button { entry.starred.toggle() } label: { Image(systemName: entry.starred ? "star.fill" : "star") }
                    Spacer()
                    if !isNew {
                        Button(role: .destructive) { confirmDelete = true } label: { Image(systemName: "trash") }
                    }
                }
            }
            .onChange(of: picks) { _, items in Task { await addPhotos(items) } }
            .confirmationDialog("حذف المذكرة؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف", role: .destructive) { cancelled = true; delete(); dismiss() }
            }
            .fullScreenCover(item: Binding(get: { viewing.map(PhotoRef.init) }, set: { viewing = $0?.id })) { r in
                PhotoViewer(ref: r.id)
            }
            .onAppear { if isNew { focused = true } }
        }
        // السحبُ للأسفل يحفظ كـ«تم» — لا تضيع كتابةٌ بإيماءة.
        .onDisappear { if !cancelled { save() } }
    }

    private struct PhotoRef: Identifiable { let id: String }

    private var dateBinding: Binding<Date> {
        Binding(get: { DateKey.date(entry.date) ?? Date() }, set: { entry.date = DateKey.string($0) })
    }

    private var photoStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(entry.photos, id: \.self) { ref in
                    MediaImage(ref: ref, maxPixel: 500)
                        .frame(width: 140, height: 140)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .onTapGesture { viewing = ref }
                        .contextMenu {
                            Button(role: .destructive) {
                                entry.setPhotos(entry.photos.filter { $0 != ref })
                            } label: { Label("إزالة الصورة", systemImage: "trash") }
                        }
                }
            }
        }
    }

    private func addPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        var refs: [String] = []
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let img = UIImage(data: data) else { continue }
            let maxSide: CGFloat = 2048
            let scale = min(1, maxSide / max(img.size.width, img.size.height))
            let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
            let resized = UIGraphicsImageRenderer(size: size).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
            if let jpg = resized.jpegData(compressionQuality: 0.82) { refs.append(MediaStore.save(jpg, ext: "jpg")) }
        }
        await MainActor.run {
            entry.setPhotos(entry.photos + refs.filter { !entry.photos.contains($0) })
            picks = []
        }
    }

    private func save() {
        guard !entry.isEmpty, entry != original else { return }
        var e = entry
        e.stamp()
        store.update { d in
            if let i = d.journalEntries.firstIndex(where: { $0.id == e.id }) {
                d.journalEntries[i] = e
            } else {
                d.journalEntries.append(e)
            }
        }
    }

    private func delete() {
        let id = entry.id
        store.update { d in
            d.journalEntries.removeAll { $0.id == id }
            d.tombstone(id)
        }
    }
}

struct PhotoViewer: View {
    let ref: String
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            if let image {
                Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill").font(.title).foregroundStyle(.white.opacity(0.85))
            }
            .padding()
        }
        .task { image = MediaStore.image(ref) }
    }
}

/// تشغيل الملاحظات الصوتية. صيغة webm (من متصفّحات غير سفاري) لا يشغّلها iOS.
struct AudioList: View {
    let refs: [String]
    @StateObject private var player = AudioPlayer()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(refs.enumerated()), id: \.offset) { i, ref in
                Button { player.toggle(ref) } label: {
                    Label("ملاحظة صوتية \(Fmt.count(i + 1))", systemImage: player.playing == ref ? "stop.circle.fill" : "play.circle.fill")
                }
            }
            if let err = player.error { Text(err).font(.caption).foregroundStyle(.secondary) }
        }
    }
}

@MainActor
final class AudioPlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var playing: String?
    @Published var error: String?
    private var player: AVAudioPlayer?

    func toggle(_ ref: String) {
        if playing == ref { player?.stop(); playing = nil; return }
        guard let data = MediaStore.data(ref), let p = try? AVAudioPlayer(data: data) else {
            error = "هذه الصيغة لا تُشغَّل على iPhone."
            return
        }
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        p.delegate = self
        p.play()
        player = p
        playing = ref
        error = nil
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.playing = nil }
    }
}
