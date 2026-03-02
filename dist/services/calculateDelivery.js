"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryService = void 0;
class DeliveryService {
    static calculateDeliveryFee(distanceKm, serviceRadius, deliveryMin, deliveryMax) {
        if (distanceKm > serviceRadius) {
            throw new Error("Out of delivery area");
        }
        const shipping = deliveryMin +
            (distanceKm / serviceRadius) *
                (deliveryMax - deliveryMin);
        return Math.round(Math.min(Math.max(shipping, deliveryMin), deliveryMax));
    }
}
exports.DeliveryService = DeliveryService;
