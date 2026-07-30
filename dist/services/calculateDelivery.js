"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryService = void 0;
class DeliveryService {
    static calculateDeliveryFee(distance, maxDistance, minPrice, maxPrice) {
        if (distance > maxDistance) {
            throw new Error("Out of delivery area");
        }
        const shipping = minPrice +
            (distance / maxDistance) *
                (maxPrice - minPrice);
        const clamped = Math.min(Math.max(shipping, minPrice), maxPrice);
        return Math.round(clamped);
    }
}
exports.DeliveryService = DeliveryService;
