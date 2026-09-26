import Foundation

extension Store {
    func toggleWird(_ date: String) {
        update { d in
            var w = d.quranWird
            if let i = w.firstIndex(of: date) { w.remove(at: i) } else { w.append(date) }
            d.quranWird = w
            var f = d.rest.obj("fieldUpdatedAt") ?? [:]
            f.put("quranWird", DateKey.nowMs())
            d.rest.put("fieldUpdatedAt", f)
        }
        Haptic.success()
    }

    /// «قرأتُ حتى الصفحة…» — مصدر التقدّم الأدقّ.
    func setKhatmaPage(_ page: Int) {
        update { d in
            var k = d.khatma
            k.record(page: min(max(page, 0), QuranMeta.totalPages), on: DateKey.today())
            d.khatma = k
        }
    }

    func setKhatmaGoal(_ goal: Int) {
        update { d in var k = d.khatma; k.dailyPageGoal = goal; d.khatma = k }
    }

    /// ختمٌ للختمة: العدّاد +١ والحلقة تعود للصفر.
    func completeKhatma() {
        update { d in
            var k = d.khatma
            k.completed += 1
            k.raw.put("page", 0)
            k.raw.put("juz", 0)
            k.raw["pageLog"] = nil
            k.raw.put("startDate", DateKey.today())
            d.khatma = k
        }
        Haptic.success()
    }

    func saveReflection(_ r: QuranReflection) {
        var r = r
        r.stamp()
        update { d in
            if let i = d.quranReflections.firstIndex(where: { $0.id == r.id }) { d.quranReflections[i] = r }
            else { d.quranReflections.insert(r, at: 0) }
        }
    }

    func deleteReflection(_ id: String) {
        update { d in
            d.quranReflections.removeAll { $0.id == id }
            d.tombstone(id)
        }
    }
}
