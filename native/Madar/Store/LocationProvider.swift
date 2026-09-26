import Foundation
import CoreLocation

/// الموقع لحساب المواقيت. يُخزَّن آخرُ موقعٍ معروف، والافتراضيّ الرياض —
/// قريبٌ بما يكفي في الخليج كلّه. لا يُطلب الإذن إلا بضغطةٍ من المالك.
@MainActor
final class LocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var lat: Double
    @Published private(set) var lng: Double
    @Published private(set) var isFallback: Bool
    @Published private(set) var status: CLAuthorizationStatus

    private let manager = CLLocationManager()
    private let key = "madar-geo"

    override init() {
        let d = UserDefaults.standard
        if let saved = d.dictionary(forKey: "madar-geo"), let la = saved["lat"] as? Double, let ln = saved["lng"] as? Double {
            lat = la; lng = ln; isFallback = false
        } else {
            lat = PrayerTimes.fallback.lat; lng = PrayerTimes.fallback.lng; isFallback = true
        }
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        if status == .authorizedWhenInUse || status == .authorizedAlways { manager.requestLocation() }
    }

    func request() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        default: break
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        let s = m.authorizationStatus
        Task { @MainActor in
            self.status = s
            if s == .authorizedWhenInUse || s == .authorizedAlways { self.manager.requestLocation() }
        }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let c = locations.last?.coordinate else { return }
        Task { @MainActor in
            self.lat = c.latitude; self.lng = c.longitude; self.isFallback = false
            UserDefaults.standard.set(["lat": c.latitude, "lng": c.longitude], forKey: self.key)
        }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}

    func times(for date: Date) -> [Prayer: Date]? { PrayerTimes.compute(for: date, lat: lat, lng: lng) }
}
