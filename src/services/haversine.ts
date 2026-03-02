export class DistanceService {
  private static readonly R = 6371;

  private static toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  static haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    const distance =
      this.R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return distance;
  }
}