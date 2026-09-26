import SwiftUI
import UIKit

/// صورةٌ من مخزن الوسائط تُفكّ خارج الخيط الرئيسيّ وتُحفظ مصغّرةً في ذاكرةٍ محدودة.
final class ImageCache {
    static let shared = ImageCache()
    private let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.totalCostLimit = 48 * 1024 * 1024
        return c
    }()
    func get(_ k: String) -> UIImage? { cache.object(forKey: k as NSString) }
    func set(_ k: String, _ img: UIImage) {
        cache.setObject(img, forKey: k as NSString, cost: Int(img.size.width * img.size.height * img.scale * img.scale * 4))
    }
}

struct MediaImage: View {
    let ref: String
    var maxPixel: CGFloat = 600
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(Color(.tertiarySystemFill))
            }
        }
        .task(id: ref) {
            let key = "\(ref.prefix(120))#\(ref.count)@\(Int(maxPixel))"
            if let c = ImageCache.shared.get(key) { image = c; return }
            let r = ref, px = maxPixel
            let img = await Task.detached(priority: .userInitiated) { () -> UIImage? in
                guard let data = MediaStore.data(r), let full = UIImage(data: data) else { return nil }
                let scale = min(1, px / max(full.size.width, full.size.height))
                if scale >= 1 { return full }
                let size = CGSize(width: full.size.width * scale, height: full.size.height * scale)
                return UIGraphicsImageRenderer(size: size).image { _ in full.draw(in: CGRect(origin: .zero, size: size)) }
            }.value
            if let img { ImageCache.shared.set(key, img); image = img }
        }
    }
}
