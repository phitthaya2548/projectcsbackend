export class DeliveryService {
  static calculateDeliveryFee(
    distanceKm: number,
    serviceRadius: number,
    deliveryMin: number,
    deliveryMax: number
  ): number {
    if (distanceKm > serviceRadius) {
      throw new Error("Out of delivery area");
    }

    const shipping =
      deliveryMin +
      (distanceKm / serviceRadius) *
        (deliveryMax - deliveryMin);

    return Math.round(
      Math.min(Math.max(shipping, deliveryMin), deliveryMax)
    );
  }
}