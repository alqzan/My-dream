import SwiftUI
import AVFoundation

/// تسجيل ملاحظة صوتية (m4a) — تُحفظ في مخزن الوسائط وتُلحق بالمذكرة.
@MainActor
final class VoiceRecorder: NSObject, ObservableObject {
    @Published private(set) var recording = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published var denied = false
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var url: URL { FileManager.default.temporaryDirectory.appendingPathComponent("madar-voice.m4a") }

    func start() {
        AVAudioApplication.requestRecordPermission { ok in
            Task { @MainActor in
                guard ok else { self.denied = true; return }
                self.begin()
            }
        }
    }

    private func begin() {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try? s.setActive(true)
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1,
                                       AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
        guard let r = try? AVAudioRecorder(url: url, settings: settings), r.record() else { return }
        recorder = r
        recording = true
        elapsed = 0
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.elapsed = self?.recorder?.currentTime ?? 0 }
        }
        Haptic.tap()
    }

    /// يوقف ويُرجع مرجع الملف في مخزن الوسائط.
    func stop() -> String? {
        recorder?.stop()
        timer?.invalidate()
        recording = false
        try? AVAudioSession.sharedInstance().setActive(false)
        defer { recorder = nil; try? FileManager.default.removeItem(at: url) }
        guard let data = try? Data(contentsOf: url), data.count > 1000 else { return nil }
        Haptic.success()
        return MediaStore.save(data, mime: "audio/mp4")
    }
}
