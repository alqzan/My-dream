import SwiftUI

/// وسوم المذكرة: شاراتٌ تُزال بلمسة، وحقلٌ يضيف، واقتراحاتٌ من وسومك الأكثر استعمالاً.
struct TagEditor: View {
    @Binding var tags: [String]
    let suggestions: [String]
    @State private var draft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(tags, id: \.self) { t in
                    Button { tags.removeAll { $0 == t } } label: {
                        Label(t, systemImage: "xmark").labelStyle(TrailingIcon())
                    }
                    .buttonStyle(.bordered).tint(Theme.journal).controlSize(.small)
                }
                TextField("وسم", text: $draft)
                    .frame(width: 90)
                    .onSubmit(add)
                    .submitLabel(.done)
            }
            let rest = suggestions.filter { !tags.contains($0) && (draft.isEmpty || $0.contains(draft)) }.prefix(8)
            if !rest.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(Array(rest), id: \.self) { s in
                            Button("#\(s)") { tags.append(s); draft = "" }.font(.mdrCaption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func add() {
        let t = draft.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        if !t.isEmpty && !tags.contains(t) { tags.append(t) }
        draft = ""
    }
}

struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) { configuration.title; configuration.icon.font(.mdrCaption2) }
    }
}
