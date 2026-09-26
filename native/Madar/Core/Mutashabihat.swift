import Foundation

/// المتشابهات — لكلّ آيةٍ قائمةُ نظائرها (`mutashabihat.json` من الويب)، وفرقُ
/// الكلمات بينهما بأطول تتابعٍ مشترك (`wordDiff`).
enum Mutashabihat {
    private static let map: [String: [Int]] = {
        guard let url = Bundle.main.url(forResource: "mutashabihat", withExtension: "json"),
              let d = try? Data(contentsOf: url),
              let m = try? JSONDecoder().decode([String: [Int]].self, from: d) else { return [:] }
        return m
    }()

    static func similar(_ id: Int) -> [Int] { map[String(id)] ?? [] }

    static func inRange(_ from: Int, _ to: Int) -> [Int] {
        guard from <= to else { return [] }
        return (from...to).filter { !(map[String($0)] ?? []).isEmpty }
    }

    private static func norm(_ w: String) -> String {
        var t = w.replacingOccurrences(of: "[\\x{0610}-\\x{061A}\\x{064B}-\\x{065F}\\x{0670}\\x{06D6}-\\x{06ED}ـ]", with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "[أإآٱ]", with: "ا", options: .regularExpression)
        return t.replacingOccurrences(of: "ى", with: "ي").replacingOccurrences(of: "ؤ", with: "و")
            .replacingOccurrences(of: "ئ", with: "ي").replacingOccurrences(of: "ة", with: "ه")
    }

    struct Word: Identifiable { let id: Int; let text: String; let same: Bool }

    static func diff(_ a: String, _ b: String) -> (a: [Word], b: [Word]) {
        let aw = a.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        let bw = b.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        let an = aw.map(norm), bn = bw.map(norm)
        let n = an.count, m = bn.count
        var dp = Array(repeating: Array(repeating: 0, count: m + 1), count: n + 1)
        if n > 0 && m > 0 {
            for i in 1...n { for j in 1...m { dp[i][j] = an[i - 1] == bn[j - 1] ? dp[i - 1][j - 1] + 1 : max(dp[i - 1][j], dp[i][j - 1]) } }
        }
        var aSame = Array(repeating: false, count: n), bSame = Array(repeating: false, count: m)
        var i = n, j = m
        while i > 0 && j > 0 {
            if an[i - 1] == bn[j - 1] { aSame[i - 1] = true; bSame[j - 1] = true; i -= 1; j -= 1 }
            else if dp[i - 1][j] >= dp[i][j - 1] { i -= 1 } else { j -= 1 }
        }
        return (aw.enumerated().map { Word(id: $0.offset, text: $0.element, same: aSame[$0.offset]) },
                bw.enumerated().map { Word(id: $0.offset, text: $0.element, same: bSame[$0.offset]) })
    }
}
