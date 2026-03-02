"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistanceService = void 0;
class DistanceService {
    static toRad(deg) {
        return (deg * Math.PI) / 180;
    }
    static haversineDistance(lat1, lng1, lat2, lng2) {
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(this.toRad(lat1)) *
                Math.cos(this.toRad(lat2)) *
                Math.sin(dLng / 2) ** 2;
        const distance = this.R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distance;
    }
}
exports.DistanceService = DistanceService;
DistanceService.R = 6371;
