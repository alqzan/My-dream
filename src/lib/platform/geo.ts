import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoPosition {
  coords: Coordinates;
}

/** Read the current position through Capacitor on native and the browser API
 * on the web, preserving the existing browser permission and callback path. */
export function getCurrentPosition(options: PositionOptions): Promise<GeoPosition> {
  if (Capacitor.isNativePlatform()) {
    return Geolocation.getCurrentPosition(options).then(({ coords }) => ({ coords }));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ coords: position.coords }),
      reject,
      options
    );
  });
}
