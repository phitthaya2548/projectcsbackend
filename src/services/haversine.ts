export class DistanceService {
  private static earth_dadius = 6371;

  private static degreesToRadians(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  static haversineKm(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): number {
    const latDiff = this.degreesToRadians(toLat - fromLat);
    const lngDiff = this.degreesToRadians(toLng - fromLng);

    const fromLatRad = this.degreesToRadians(fromLat);
    const toLatRad = this.degreesToRadians(toLat);

    const sinLat = Math.sin(latDiff / 2);
    const sinLng = Math.sin(lngDiff / 2);

    const haversineValue =
      sinLat * sinLat +
      Math.cos(fromLatRad) * Math.cos(toLatRad) * (sinLng * sinLng);

    const centralAngle =
      2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

    return this.earth_dadius * centralAngle;
  }
}