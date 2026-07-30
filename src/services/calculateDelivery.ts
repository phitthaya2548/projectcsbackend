export class DeliveryService {
  static calculateDeliveryFee(
    distance: number,
    maxDistance: number,
    minPrice: number,
    maxPrice: number
  ): number {
    if (distance > maxDistance) {
      throw new Error("Out of delivery area");
    }

    const shipping =
      minPrice +
      (distance / maxDistance) *
        (maxPrice - minPrice);

     const clamped = Math.min(Math.max(shipping, minPrice), maxPrice);

    return Math.round(clamped);
  
  }
}
