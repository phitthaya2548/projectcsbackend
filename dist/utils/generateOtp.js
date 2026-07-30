"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = generateOtp;
function generateOtp(length = 6) {
    let otp = "";
    for (let i = 0; i < length; i++) {
        otp += Math.floor(Math.random() * 10).toString();
    }
    return otp;
}
