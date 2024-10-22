// models/Scan.js
const mongoose = require('mongoose');

const UserScanSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Store IP address
    count: { type: Number, default: 1 },
    device: { type: String } // Store device information
});


const ScanSchema = new mongoose.Schema({
    qrCodeId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    count: { type: Number, default: 0 },
    users: [UserScanSchema], // Array to track user scans
});

module.exports = mongoose.model('Scan', ScanSchema);
