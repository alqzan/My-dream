import Foundation
import CryptoKit

/// محلّل رسائل البنك — نقلٌ لـ`parseBankSmsEvent` في `src/lib/bankParser.ts` بأنماطه.
/// يُخرج حدثاً (نوعه · اتجاهه · مبلغه · التاجر · التاريخ) ولا يقرّر وحده: كلُّ
/// مصروفٍ يمرّ بمراجعة المالك قبل أن يدخل السجلّ.
enum BankParser {
    struct Event: Equatable {
        var rawText: String
        var amount: Double
        var fee: Double
        var kind: String
        var direction: String
        var category: String
        var note: String
        var date: String
        var time: String?
        var bank: String?
        var account: String?
        var balanceAfter: Double?
        var counterparty: String?
        var confidence: String
        var sourceKey: String
        var reviewReason: String?
        var isExpense: Bool { BankParser.expenseKinds.contains(kind) }
    }

    static let expenseKinds: Set<String> = ["purchase", "atm", "bill", "installment", "fee"]
    static let noiseKinds: Set<String> = ["otp", "declined", "statement", "marketing", "info", "hold", "card_settle", "bnpl_settle", "self_transfer"]

    // MARK: أدوات الأنماط

    private static var cache: [String: NSRegularExpression] = [:]
    private static let cacheLock = NSLock()

    static func re(_ p: String, _ i: Bool = true, m: Bool = false) -> NSRegularExpression {
        let key = "\(i)\(m)\(p)"
        cacheLock.lock(); defer { cacheLock.unlock() }
        if let r = cache[key] { return r }
        var o: NSRegularExpression.Options = []
        if i { o.insert(.caseInsensitive) }
        if m { o.insert(.anchorsMatchLines) }
        let r = (try? NSRegularExpression(pattern: p, options: o)) ?? (try! NSRegularExpression(pattern: "(?!)"))
        cache[key] = r
        return r
    }

    static func has(_ s: String, _ p: String, m: Bool = false) -> Bool {
        re(p, m: m).firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    static func match(_ s: String, _ p: String, m: Bool = false) -> [String?]? {
        guard let r = re(p, m: m).firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        return (0..<r.numberOfRanges).map { i in Range(r.range(at: i), in: s).map { String(s[$0]) } }
    }

    static func matches(_ s: String, _ p: String) -> [(groups: [String?], location: Int)] {
        re(p).matches(in: s, range: NSRange(s.startIndex..., in: s)).map { r in
            ((0..<r.numberOfRanges).map { i in Range(r.range(at: i), in: s).map { String(s[$0]) } }, r.range.location)
        }
    }

    static func normalizeDigits(_ s: String) -> String {
        let map: [Character: Character] = ["٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": ","]
        return String(s.map { map[$0] ?? $0 })
    }

    static func normalizeSms(_ s: String) -> String {
        var t = s.precomposedStringWithCompatibilityMapping
        t = t.replacingOccurrences(of: "[أإآٱ]", with: "ا", options: .regularExpression)
        t = t.replacingOccurrences(of: "ة", with: "ه").replacingOccurrences(of: "ى", with: "ي")
        t = t.replacingOccurrences(of: "[ـ\\x{064B}-\\x{065F}]", with: "", options: .regularExpression)
        return normalizeDigits(t).lowercased()
    }

    static func normalizeMerchant(_ s: String) -> String {
        var t = s.lowercased()
        t = t.replacingOccurrences(of: "[0-9٠-٩]+", with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: "[^\\p{L}\\p{N} ]+", with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        return String(t.prefix(60))
    }

    private static func number(_ v: String) -> Double? {
        let t = normalizeDigits(v).replacingOccurrences(of: ",", with: "").replacingOccurrences(of: "[^\\d.\\-]", with: "", options: .regularExpression)
        return Double(t)
    }

    // MARK: الأنماط (من الويب حرفاً)

    static let CUR = "SR|SAR|ر\\.?\\s?س|ريال"
    static let FOREIGN = "\\b(?:USD|EUR|GBP|AED|KWD|BHD|QAR|OMR|EGP|TRY|JPY|CNY|INR)\\b|[$€£]|دولار|يورو|درهم"
    static let OTP = "رمز\\s*(?:التحقق|مؤقت|التفعيل|التوثيق|شراء\\s*(?:اونلاين|أونلاين)|الشراء)|رمز\\s*[:：]|الرمز\\s*السري|كلمة\\s+(?:المرور|السر)|كلمة\\s+مرور\\s+ل(?:مرة|مره)\\s+واحدة|(?:ننصح\\s+بعدم\\s+مشاركة|لا\\s+تشارك(?:وا)?)\\s+الرمز|one\\s*time\\s+password|do\\s+not\\s+share\\s+this\\s+otp|\\bOTP\\b|verification\\s+code"
    static let DECLINED = "مرفوض|تم\\s+رفض|رفضت|فشل|لم\\s+تتم|غير\\s+ناجح|رصيد\\s+غير\\s+كاف|غير\\s+كافي|declined|failed|insufficient"
    static let HOLD = "just\\s+a\\s+hold|hold\\s+on\\s+your\\s+card|حجز\\s+مؤقت|حجز\\s+على\\s+بطاقتك|معلقة|قيد\\s+الانتظار|pending\\b|pre[\\s-]?authoriz"
    static let CANCELLED = "تم\\s+إلغاء|إلغاء\\s+(?:عملية|الشراء)|ملغا(?:ة|ه)|cancelled|canceled|reversed"
    static let STATEMENT = "(?:المبلغ\\s+(?:ال[إا]جمالي\\s+)?المستحق|[إا]جمالي\\s+المستحق|مبلغ\\s+مستحق|الحد\\s+الأدنى\\s+(?:للسداد|المستحق)|minimum\\s+(?:amount\\s+)?due|تاريخ\\s+الاستحقاق|due\\s+date|كشف\\s+(?:ال)?حساب|إصدار\\s+كشف|اصدار\\s+كشف|تذكير\\s+سداد\\s+البطاقة)"
    static let PURCHASE = "نقاط\\s+البيع|عملية\\s+شراء|شراء\\s+(?:عبر|انترنت|أونلاين|اونلاين|دولي|ب(?:ـ|\\s|$))|point\\s+of\\s+sale|\\bpos\\b|purchase(?:\\s+transaction)?"
    static let ATM = "سحب\\s+(?:نقدي|من\\s+الصراف|صراف(?:\\s+آلي)?|نقد)|cash\\s+withdrawal|\\batm\\b"
    static let BILL = "سداد\\s+فاتورة|مفوتر\\s*[:：]|فاتورة\\s+(?:كهرباء|ماء|اتصالات)|utility\\s+bill"
    static let BILL_NOTICE = "صدور\\s+فاتورة|فاتورة\\s+جديدة|لم\\s+يتم\\s+سدادها|فاتورة\\s+شاملة|invoice\\s+(?:generated|due)|new\\s+bill"
    static let CARD_SETTLE = "سداد|تسديد|تم\\s+سداد|card\\s+payment|credit\\s+card\\s+payment"
    static let CARD_EVIDENCE = "(?:البطاقة|بطاقة)\\s*(?:ال)?(?:ائتمانية|ائتماني|فيزا|visa|ماستر|mastercard)|credit\\s+card|\\bvisa\\b|\\bmastercard\\b"
    static let BNPL = "تمارا|تابي|اشتر\\s*الان\\s*ادفع\\s*لاحقا|tamara|tabby|buy\\s*now\\s*pay\\s*later"
    static let INVEST = "سداد\\s+مبكر|منصة\\s+الدين|معرف\\s+(?:الفرصة|الاستثمار)|investment\\s+opportunity|early\\s+repayment"
    static let INCOMING = "حوالة\\s+(?:واردة|داخلية\\s+واردة|محلية\\s+واردة)|استرداد\\s+نقدي\\s+إلى\\s+المحفظة|استرداد\\s+نقدي\\s+للمحفظة|إيداع|ايداع|تم\\s+إضافة|تم\\s+اضافة|أضيف|اضيف|إضافة\\s+أموال|اضافة\\s+اموال|استلام\\s+(?:قطة|مبلغ|حوالة)|تحويل\\s+وارد|money\\s+added|cash\\s+deposit|credited\\s+to"
    static let OUT_TRANSFER = "حوالة\\s+(?:داخلية|محلية)?\\s*صادرة|حوالة\\s+صادرة|تحويل\\s+(?:داخلي|محلي)?\\s*صادر|local\\s+transfer\\s+out|outgoing\\s+transfer"
    static let ADD_FUNDS = "money\\s*added|add(?:ed)?\\s*funds|إضافة\\s+(?:أموال|اموال)|اضافة\\s+(?:أموال|اموال)|اضافة\\s+باستخدام|top\\s*up"
    static let SELF_TRANSFER = "حوالة\\s+بين\\s+(?:حساباتك|حساباتي)|تحويل\\s+بين\\s+(?:حساباتك|حساباتي)|تحويل\\s+(?:الى|إلى)\\s+(?:حسابك|حساب\\s+(?:جاري|دراهم)|دراهم|المحفظة\\s+الادخارية|حساباتك|حساباتي)|transfer\\s+between\\s+your\\s+accounts|debit\\s+transfer\\s+internal"
    static let INSTALLMENT = "قسط\\s+تمويل|خصم\\s*:\\s*قسط|المبلغ\\s+المتبقي"
    static let MARKETING = "عزيزي\\s+العميل|عميلنا\\s+العزيز|صباح\\s+الخير|هلا\\s+|لحمايتك،?\\s+حاولنا|تمت\\s+اضافة\\s+المستفيد|تم\\s+تنشيط\\s+المستفيد|تم\\s+تسجيل\\s+الدخول|تم\\s+تسجيلك\\s+بنجاح|اشعار\\s*[:：]?\\s*تم\\s+تسجيل\\s+جهاز\\s+جديد|apple\\s+wallet|مبروك|نقاط\\s+قطاف|نقاط\\s+عضوية|رصيد\\s+قطاف|rewards|برنامج\\s+اكثر|تحديث\\s+رسوم\\s+التعرفة|تم\\s+منحكم\\s+الخصم|خصم\\s+خاص|بدون\\s+عمولة|discount|commission|سم\\s+نفسك\\s+تاجر|ملتقى\\s+ريادة|اليوم\\s+الأخير"
    static let PROTECTION = "لحمايتك،?\\s+حاولنا\\s+التواصل|للتحقق\\s+من\\s+عملية|يرجى\\s+مراجعة\\s+التفاصيل\\s+في\\s+التطبيق"
    static let OUTGOING = "دفع(?:ة)?\\s+(?:مبلغ|قطة|دفعة)|حوالة\\s+(?:صادرة|خارجة)|تحويل\\s+صادر|تحويل\\s+الى\\s*[:：]?"

    static let banks: [(String, String)] = [
        ("rajhi", "الراجحي|مصرف\\s+الراجحي|بنك\\s+الراجحي|al\\s*rajhi"),
        ("bsf", "الفرنسي|البنك\\s+السعودي\\s+الفرنسي|السعودي\\s+الفرنسي|bsf|fransi"),
        ("snb", "الاهلي|الأهلي|السعودي\\s+الاهلي|البنك\\s+الأهلي|snb"),
        ("inma", "الإنماء|الانماء|inma"),
        ("sab", "\\bsab\\b|\\bsaab\\b|ساب|البنك\\s+السعودي\\s+البريطاني"),
        ("barq", "برق|barq"),
        ("stcbank", "stc\\s*bank|stc\\s*با?نك|بنك\\s+stc|اس\\s*تي\\s*سي\\s+بنك"),
        ("riyad", "بنك\\s+الرياض|riyad\\s*bank"),
    ]
    static let senders: [(String, String)] = banks + [
        ("tamara", "تمارا|tamara"), ("tabby", "تابي|tabby"), ("drahim", "دراهم|drahim"),
        ("tiqmo", "tiqmo|تيقمو"), ("d360", "d360|دي\\s*360"), ("tweeq", "tweeq|تويك"),
    ]

    static let categoryRules: [(keywords: [String], category: String)] = [
        (["سوبرماركت", "هايبر", "بقاله", "بقالة", "تموينات", "بنده", "الدانوب", "لولو", "كارفور", "عثمان", "عبدالله العثيم", "أسواق", "التميمي", "المزرعة", "نستو"], "cat-essentials"),
        (["إيجار", "ايجار", "rent"], "cat-essentials"),
        (["وقود", "بنزين", "أرامكو", "محطة", "ساسكو", "fuel", "petrol"], "cat-essentials"),
        (["فاتورة", "كهرباء", "ماء", "مياه", "الكهرباء", "طاقة", "السعودية للطاقة", "utility"], "cat-essentials"),
        (["مستشفى", "عيادة", "صيدلية", "النهدي", "الدواء", "دواء", "طبي", "hospital", "clinic", "pharmacy"], "cat-essentials"),
        (["جامعة", "مدرسة", "دورة", "كورس", "تعليم", "udemy", "coursera"], "cat-essentials"),
        (["ستاربكس", "starbucks", "بارنز", "barns", "دانكن", "dunkin", "كافيه", "مقهى", "قهوة", "cafe", "coffee"], "cat-luxuries"),
        (["مطعم", "برغر", "برجر", "كنتاكي", "ماكدونالدز", "هرفي", "herfy", "البيك", "albaik", "pizza", "بيتزا", "كبسه", "مندي", "سشي", "شاورما", "restaurant", "resturant", "burger", "grill", "kitchen", "food"], "cat-luxuries"),
        (["فندق", "طيران", "سفر", "رحلة", "hotel", "flight", "saudia", "flynas", "flyadeal", "booking", "بوكينج"], "cat-luxuries"),
        (["نتفليكس", "شاهد", "يوتيوب", "سبوتيفاي", "netflix", "spotify", "stc", "موبايلي", "زين", "الاتصالات", "ألعاب", "playstation", "بلايستيشن"], "cat-luxuries"),
        (["أوبر", "كريم", "تاكسي", "uber", "careem"], "cat-luxuries"),
        (["تبرع", "صدقة", "زكاة", "خيري", "جمعية", "donation", "charity", "ehsan", "احسان"], "cat-charity"),
        (["ادخار", "توفير", "saving", "استثمار", "صندوق", "أسهم", "تداول", "invest"], "cat-investment"),
    ]

    static func keywordCategory(_ text: String) -> String {
        let t = normalizeSms(text)
        for r in categoryRules where r.keywords.contains(where: { t.contains(normalizeSms($0)) }) { return r.category }
        return "cat-essentials"
    }

    /// القسم المتعلَّم من تصنيفك اليدويّ للتاجر نفسه، ثمّ الكلمات المفتاحية.
    static func suggestCategory(_ text: String, categories: [FinanceCategory], rules: RawObject) -> String {
        let key = normalizeMerchant(text)
        let exists = { (id: String) in categories.contains { $0.id == id } }
        if !key.isEmpty {
            if let c = rules.str(key), exists(c) { return c }
            for (rk, v) in rules {
                guard case .string(let cid) = v else { continue }
                let r = normalizeMerchant(rk)
                if !r.isEmpty, exists(cid), key.hasPrefix(r) || r.hasPrefix(key) { return cid }
            }
        }
        return keywordCategory(text)
    }

    // MARK: الاستخراج

    static func inferKind(_ text: String, bank: String?) -> String {
        let n = normalizeSms(text)
        func h(_ p: String, m: Bool = false) -> Bool { has(text, p, m: m) || has(n, p, m: m) }
        let fin = h("شراء|عملية\\s+شراء|نقاط\\s+البيع|مبلغ\\s*[:：]|SAR|SR|ريال|لدى|purchase|point\\s+of\\s+sale|\\bPOS\\b")
        if h(OTP) { return "otp" }
        if h(DECLINED) { return "declined" }
        if h(HOLD) { return "hold" }
        if bank == "tamara" || bank == "tabby" { return "info" }
        if h("عزيزي\\s+العميل|عميلنا\\s+العزيز") && h(PROTECTION) { return "marketing" }
        if (h(PROTECTION) && !h("شراء|مبلغ\\s*[:：]|SAR|SR|ريال|لدى")) || h("تم\\s+تحويل\\s+عمليتك|تأكيد\\s+دفعة\\s+مقسمة|دفعة\\s+مقسمة|تحديث\\s+رسوم\\s+التعرفة|سيتم\\s+تحديث\\s+رسوم") { return "info" }
        if h(BNPL) && h("تم\\s+تحويل|تحويل\\s+عمليتك|قادمة|tomorrow|مستحقة|installment") { return "info" }
        if h("استرداد\\s+نقدي\\s+(?:إلى|الى|ل)\\s+(?:ال)?بطاقة|cashback\\s+(?:to|on)\\s+(?:the\\s+)?card") { return "cashback" }
        if h(SELF_TRANSFER) { return "self_transfer" }
        if h(BILL_NOTICE) { return "info" }
        if h("عملية\\s+(?:عكسية|استرجاع)|عكس\\s+عملية|استرجاع\\s+عملية|استرداد\\s+عملية|reversal|refund") || h(CANCELLED) {
            return h("عكس|reversal") || h(CANCELLED) ? "reversal" : "refund"
        }
        if h(ADD_FUNDS) { return "deposit" }
        if h(OUT_TRANSFER) { return "transfer_out" }
        if h(ATM) { return "atm" }
        if h("قطاف|نقاط\\s+(?:مضافة|اضيفت)|رصيد\\s+النقاط") && !h("(?:عملية\\s+شراء|مبلغ\\s*[:：]|amount\\s*[:：])") { return "marketing" }
        if h("تم\\s+منحكم\\s+الخصم|خصم\\s+خاص|بدون\\s+عمولة|discount|commission") && !h("(?:عملية\\s+شراء|مبلغ\\s*[:：]|amount\\s*[:：])") { return "marketing" }
        if h(INVEST) && !(h(CARD_SETTLE) && h(CARD_EVIDENCE)) { return "info" }
        if h(INSTALLMENT) && !(h(CARD_SETTLE) && h(CARD_EVIDENCE)) { return "installment" }
        if h(BILL) { return "bill" }
        if h(STATEMENT) && !h(PURCHASE) { return "statement" }
        if h("استرداد\\s+نقدي\\s+إلى\\s+(?:ال)?المحفظة|محفظة\\s+(?:الاسترجاع|الاسترداد)\\s+النقدي|استرجاع\\s+نقدي") { return "cashback" }
        if h(CARD_SETTLE) && h(CARD_EVIDENCE) && !h(PURCHASE) { return "card_settle" }
        if h(MARKETING) && !fin && !h(INCOMING) { return "marketing" }
        if h("استلام\\s+(?:قطة|مبلغ|حوالة)|استرداد\\s+(?:مبلغ|عملية)|(?:حوالة|تحويل)\\s+من\\s*[:：]?\\s*\\p{L}[^\\n\\r]*(?:مبلغ|SAR|ريال)") { return "refund" }
        if h("راتب|رواتب|\\bsalary\\b|\\bpayroll\\b") { return "salary" }
        if h("حوالة\\s+(?:واردة|داخلية\\s+واردة|محلية\\s+واردة)|تحويل\\s+وارد") { return "transfer_in" }
        if h(INCOMING) { return h("إيداع|ايداع") ? "deposit" : "transfer_in" }
        if h("خصم\\s*(?:من|على)\\s*(?:حساب|بطاقة)") || (h("^\\s*خصم(?![\\p{L}\\p{N}])", m: true) && h("(?:مبلغ|SAR|SR|ريال|لدى|من\\s+\\p{L})")) { return "purchase" }
        if h("تبرع|صدقة|زكاة|خيري|جمعية|donation|charity") { return "purchase" }
        if h(OUTGOING) { return "purchase" }
        if h(PURCHASE) || (h("^\\s*شراء(?![\\p{L}\\p{N}])", m: true) && h("(?:مبلغ|SAR|SR|ريال|لدى|من\\s+\\p{L})")) { return "purchase" }
        if h("(?:رسوم\\s*(?:وضريبة|العملية)?\\s*[:：]|رسوم\\s*SR)") { return "fee" }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "info" : "unknown"
    }

    static func direction(_ kind: String) -> String {
        if ["purchase", "atm", "bill", "installment", "fee", "card_settle", "bnpl_settle", "transfer_out"].contains(kind) { return "out" }
        if ["refund", "cashback", "reversal", "transfer_in", "deposit", "salary"].contains(kind) { return "in" }
        return "neutral"
    }

    static func firstCurrencyAmount(_ text: String) -> Double? {
        let lines = text.components(separatedBy: "\n")
        for line in lines {
            for m in matches(line, "(?:\(CUR))\\s*([\\d,]+(?:\\.\\d+)?)|([\\d,]+(?:\\.\\d+)?)\\s*(?:\(CUR))") {
                let ns = line as NSString
                let cutRange = (line as NSString).range(of: "(?:الرصيد|رصيد|الإجمالي\\s+المستحق|المبلغ\\s+المستحق|المتبقي|minimum\\s+due|balance|limit)", options: [.regularExpression, .caseInsensitive])
                if cutRange.location != NSNotFound && m.location >= cutRange.location { continue }
                let before = ns.substring(to: m.location)
                if has(before, "(?:بطاقة|حساب|عبر|من|الى|إلى|لـ|card\\s*(?:number|ending)?|account)\\s*[:：]?[^\\n\\r]*$") { continue }
                if let v = number((m.groups[1] ?? m.groups[2]) ?? ""), v > 0 { return v }
            }
        }
        return nil
    }

    static func firstFieldAmount(_ text: String, _ labels: [String]) -> Double? {
        for label in labels {
            for m in matches(text, "\(label)[^\\n\\r]*") {
                var line = m.groups[0] ?? ""
                if !label.contains("المتبقي") && !label.contains("remaining") {
                    let r = (line as NSString).range(of: "(?:الإجمالي|اجمالي|المستحق|الحد\\s+الأدنى|الرصيد|المتبقي|due|balance|limit)", options: [.regularExpression, .caseInsensitive])
                    if r.location == 0 { continue }
                    if r.location != NSNotFound { line = (line as NSString).substring(to: r.location) }
                }
                if has(line, FOREIGN) && !has(line, CUR) { continue }
                if let p = match(line, "\\(([\\d,]+(?:\\.\\d+)?)\\s*(?:ريال|SAR|SR|ر\\.?\\s?س)\\)"), let v = number(p[1] ?? "") { return v }
                if let v = firstCurrencyAmount(line) { return v }
                for raw in matches(line, "[\\d٠-٩][\\d٠-٩,٬]*(?:[٫.]\\d+)?") {
                    if let v = number(raw.groups[0] ?? ""), v > 0 { return v }
                }
            }
        }
        return nil
    }

    static func extractAmount(_ text: String, kind: String) -> (value: Double, source: String) {
        let t = normalizeDigits(text)
        if kind == "card_settle", has(t, "(?:^|[\\n\\r;،])\\s*(?:الرصيد|رصيد)\\s*[:：]"),
           !has(t, "(?:تم|جرى|اكتمل)\\s+(?:سداد|تسديد|خصم|دفع)|عملية\\s+سداد|(?:payment|paid)\\s+(?:of|amount)") { return (0, "none") }
        let fields: [String: [String]] = [
            "purchase": ["مبلغ\\s*[:：]?", "amount\\s*[:：]?", "(?:^|[\\s\\x{061C}])بـ?\\s*(?:SR|SAR|ريال)?\\s*(?=[\\d٠-٩])", "\\bFor\\s*[:：]?\\s*"],
            "installment": ["القسط\\s*[:：]?", "خصم\\s*[:：]?"],
            "card_settle": ["سداد(?:\\s+بـ?)?\\s*", "تسديد(?:\\s+بـ?)?\\s*", "payment[^\\d]{0,20}"],
            "refund": ["مبلغ\\s*[:：]?", "استلام\\s+قطة[^\\d]{0,20}"],
            "deposit": ["مبلغ\\s*[:：]?", "إيداع|ايداع[^\\d]{0,20}"],
            "transfer_in": ["مبلغ\\s*[:：]?", "حوالة[^\\d]{0,20}"],
            "salary": ["مبلغ\\s*[:：]?", "حوالة[^\\d]{0,20}"],
            "atm": ["مبلغ\\s*[:：]?", "سحب[^\\d]{0,20}"],
            "bill": ["مبلغ\\s*[:：]?", "سداد[^\\d]{0,20}"],
            "fee": ["رسوم(?:\\s+وضريبة)?\\s*[:：]?"],
            "cashback": ["إضافة|اضافة|مبلغ\\s*[:：]?"],
        ]
        if let v = firstFieldAmount(t, fields[kind] ?? ["مبلغ\\s*[:：]?"]) { return (v, "field") }
        if kind == "card_settle" { return (0, "none") }
        if let v = firstCurrencyAmount(t) { return (v, "currency") }
        if let m = match(t, "(?:شراء|خصم|سحب|دفع|حوالة|تحويل|إضافة|اضافة|deposit|purchase)\\D{0,30}([\\d,]+(?:\\.\\d+)?)") {
            return (number(m[1] ?? "") ?? 0, "operation")
        }
        return (0, "none")
    }

    static func extractMerchant(_ text: String) -> String {
        var merchant = "", from = ""
        for m in matches(normalizeDigits(text), "(مفوتر|لدى|لـ|من|الى|إلى|at|@)\\s*[:：]?\\s*([^\\n\\r,،.؛;]+)") {
            var v = m.groups[2] ?? ""
            v = v.replacingOccurrences(of: "\\b(?:\(CUR))\\b.*$", with: "", options: [.regularExpression, .caseInsensitive]).trimmingCharacters(in: .whitespaces)
            guard has(v, "\\p{L}") else { continue }
            if (m.groups[1] ?? "") == "من" { if from.isEmpty { from = v } } else if merchant.isEmpty { merchant = v }
        }
        return merchant.isEmpty ? from : merchant
    }

    static func extractDate(_ text: String, reference: String) -> String? {
        let t = normalizeDigits(text)
        func usable(_ key: String) -> String? { DateKey.isValid(key) && (Int(key.prefix(4)) ?? 0) >= 1900 ? key : nil }
        let excluded = "(?:تاريخ\\s+الاستحقاق|الاستحقاق|due\\s+date|ابتداء(?:ً|ا)?\\s+من|effective\\s+from)"
        var sawFour = false
        for m in matches(t, "(\\d{4})-(\\d{2})-(\\d{2})") {
            sawFour = true
            let prefix = (t as NSString).substring(with: NSRange(location: max(0, m.location - 32), length: min(32, m.location)))
            if has(prefix, excluded) { continue }
            if let k = usable("\(m.groups[1]!)-\(m.groups[2]!)-\(m.groups[3]!)") { return k }
        }
        for m in matches(t, "(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{4})") {
            sawFour = true
            let prefix = (t as NSString).substring(with: NSRange(location: max(0, m.location - 32), length: min(32, m.location)))
            if has(prefix, excluded) { continue }
            let d = m.groups[1]!, mo = m.groups[2]!, y = m.groups[3]!
            if let k = usable("\(y)-\(mo.count == 1 ? "0" + mo : mo)-\(d.count == 1 ? "0" + d : d)") { return k }
        }
        if sawFour { return nil }
        guard let m = match(t, "(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{2})(?!\\d)"), let a = m[1], let mo = m[2], let b = m[3] else { return nil }
        let pad = { (s: String) in s.count == 1 ? "0" + s : s }
        var cands: [String] = []
        if let ai = Int(a), (1...31).contains(ai) { let k = "20\(b)-\(pad(mo))-\(pad(a))"; if DateKey.isValid(k) { cands.append(k) } }
        if let bi = Int(b), (1...31).contains(bi) { let k = "20\(pad(a))-\(pad(mo))-\(pad(b))"; if DateKey.isValid(k) { cands.append(k) } }
        let ref = DateKey.isValid(reference) ? reference : DateKey.today()
        return cands.min { abs(DateKey.days(from: ref, to: $0)) < abs(DateKey.days(from: ref, to: $1)) }
    }

    static func sourceKey(_ text: String) -> String {
        let n = normalizeDigits(text).trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return sha256Hex(n)
    }

    static func sha256Hex(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func parse(_ smsText: String, reference: String, sender: String? = nil, receivedAt: String? = nil) -> Event? {
        let raw = smsText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        let text = normalizeDigits(raw)
        var bank: String?
        var bankConfidence = "generic"
        if let s = sender, !s.isEmpty, let hit = senders.first(where: { has(s, $0.1) }) { bank = hit.0; bankConfidence = "template" }
        else if let hit = banks.first(where: { has(text, $0.1) }) { bank = hit.0; bankConfidence = "inferred" }
        let kind = inferKind(text, bank: bank)
        let date = extractDate(text, reference: reference) ?? (DateKey.isValid(reference) ? reference : DateKey.today())
        let time = match(text, "(\\d{1,2}):(\\d{2})").map { "\(($0[1] ?? "").count == 1 ? "0" : "")\($0[1] ?? ""):\($0[2] ?? "")" }
        let merchant = extractMerchant(text)
        let ex = extractAmount(text, kind: kind)
        let hasAmount = !["otp", "declined", "statement", "marketing", "info", "hold", "bnpl_settle"].contains(kind)
        let unverified = ex.source == "operation"
        let amount = hasAmount && !unverified ? ex.value : 0
        let fee = ["purchase", "atm", "bill", "installment", "fee", "transfer_out", "self_transfer", "card_settle"].contains(kind)
            ? (firstFieldAmount(text, ["(?:ال)?رسوم\\s*وضريبة\\s*[:：]?", "(?:ال)?رسوم\\s*[:：]?", "رسوم\\s*العملية\\s*[:：]?"]) ?? 0) : 0
        let account = match(text, "(?:بطاقة|حساب|عبر|visa|mastercard|ماستر)\\s*[:：]?\\s*(?:\\*+)?(\\d{4})(?:\\b|\\s|;|\\*)")?[1] ?? match(text, "\\*{2,}(\\d{4})")?[1]
        let balance = match(text, "(?:الرصيد\\s*(?:المتوفر|المتاح|الحالي)?|رصيد)\\s*[:：]?\\s*(?:SAR|SR|ريال|ر\\.?\\s?س)?\\s*([\\d,]+(?:\\.\\d+)?)").flatMap { number($0[1] ?? "") }
        let foreign = hasAmount && has(text, FOREIGN) && !has(text, CUR)
        var reasons: [String] = []
        if kind == "unknown" { reasons.append("قالب غير معروف — يحتاج مراجعة") }
        if unverified { reasons.append("لم يظهر مبلغ موثوق بعد حقل المبلغ — يلزم التحقق يدوياً") }
        if foreign { reasons.append("عملة أجنبية — تحقّق من المبلغ بالريال") }
        let received = receivedAt?.range(of: "\\d{4}-\\d{2}-\\d{2}", options: .regularExpression) != nil
        let confidence = unverified || foreign ? "generic" : (extractDate(text, reference: reference) != nil || received) ? (bankConfidence == "generic" ? "generic" : "inferred") : "generic"
        let counterparty = match(text, "(?:من|الى|إلى)\\s*[:：]?\\s*(?:\\d{1,6}\\s*;\\s*)?([^\\n\\r,،;]+)")?[1].flatMap { has($0, "\\p{L}") ? $0.trimmingCharacters(in: .whitespaces) : nil }
        return Event(rawText: raw, amount: amount, fee: fee, kind: kind, direction: direction(kind),
                     category: keywordCategory("\(text) \(merchant)"),
                     note: merchant.isEmpty ? String(raw.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).prefix(100)) : merchant,
                     date: date, time: time, bank: bank, account: account, balanceAfter: balance, counterparty: counterparty ?? (merchant.isEmpty ? nil : merchant),
                     confidence: confidence, sourceKey: sourceKey(raw), reviewReason: reasons.isEmpty ? nil : reasons.joined(separator: " · "))
    }
}

