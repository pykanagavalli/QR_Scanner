const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http'); // Import http
const { Server } = require('socket.io'); // Import Server from socket.io
const dbConnection=require('./config/dbConfig.js')

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 7500;

// Middleware
app.use(cors());
app.use(express.json());
dbConnection()
// MongoDB Connection
/* mongoose.connect(process.env.TARGET_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('🚀 MongoDB connected'))
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1); // Exit process with failure
    });
 */

// Import Scan Model
const Scan = require('./models/Scan.js');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Frontend URL
        methods: ['GET', 'POST'],
    },
});

// Listen for client connections
io.on('connection', (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // Optional: Handle disconnections
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// Routes

// 1. Route to handle QR code creation based on a dynamic URL
app.post('/create', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ message: 'URL is required' });
    }

    try {
        // Check if the URL already exists in the database
        const existingScan = await Scan.findOne({ url });

        if (existingScan) {
            // If it exists, return the existing QR code ID and scan count
            console.log(`🔍 Found existing QR Code for URL: ${url} with ID: ${existingScan.qrCodeId}`);
            return res.status(200).json({ qrCodeId: existingScan.qrCodeId, scanCount: existingScan.count });
        }

        // Create a unique qrCodeId
        const qrCodeId = new mongoose.Types.ObjectId(); // MongoDB ObjectId can be used as a unique ID

        // Save the URL and qrCodeId to the database with an initial scan count of 0
        const newScan = new Scan({ qrCodeId, url, count: 0 });
        await newScan.save();
        console.log(`✅ QR Code created for URL: ${url} with ID: ${qrCodeId}`);

        // Respond with the QR code ID so the frontend can use it to generate the QR code
        res.status(201).json({ qrCodeId });
    } catch (error) {
        console.error('❌ Error creating QR code:', error);
        res.status(500).json({ message: 'Error creating QR code' });
    }
});

// 2. Route to handle QR code scans with qrCodeId   
// app.get('/scan/:qrCodeId', async (req, res) => {
//     const { qrCodeId } = req.params;
//     try {
//         const scanRecord = await Scan.findOneAndUpdate(
//             { qrCodeId },
//             { $inc: { count: 1 } }, // Increment scan count by 1
//             { new: true }
//         );

//         if (!scanRecord) {
//             // If the qrCodeId doesn't exist, return 404
//             return res.status(404).json({ message: 'QR Code not found' });
//         }

//         console.log(`📈 QR Code (${qrCodeId}) scanned ${scanRecord.count} times.`);
//         console.log('Redirecting to URL:', scanRecord.url);

//         // Emit an event to update the scan count in real-time to all connected clients
//         io.emit('scanUpdate', { qrCodeId: qrCodeId, scanCount: scanRecord.count });

//         // Redirect the user to the original URL
//         res.redirect(scanRecord.url);
//     } catch (error) {
//         console.error('❌ Error updating scan count:', error);
//         res.status(500).send('Internal Server Error');
//     }
// });
// 2. Route to handle QR code scans with qrCodeId
app.get('/scan/:qrCodeId', async (req, res) => {
    const { qrCodeId } = req.params;
    const userIp = req.ip; // Get the user's IP address
    const userAgent = req.headers['user-agent']; // Get the user agent string

    // You might want to parse the userAgent string to extract the device name
    let deviceName = 'Unknown Device';
    if (/mobile/i.test(userAgent)) {
        deviceName = 'Mobile Device';
    } else if (/iPad|Android|Touch/.test(userAgent)) {
        deviceName = 'Tablet';
    } else {
        deviceName = 'Desktop';
    }

    try {
        // Find the scan record for the qrCodeId
        const scanRecord = await Scan.findOne({ qrCodeId });

        if (!scanRecord) {
            return res.status(404).json({ message: 'QR Code not found' });
        }

        // Check if the user (IP) already exists in the users array
        const userIndex = scanRecord.users.findIndex(user => user.userId === userIp);

        if (userIndex > -1) {
            // User exists, increment their count
            scanRecord.users[userIndex].count += 1;
        } else {
            // User doesn't exist, push a new user object
            scanRecord.users.push({ userId: userIp, count: 1, device: deviceName });
        }

        // Save the updated scan record
        await scanRecord.save();

        // Increment scan count
        scanRecord.count += 1;
        await scanRecord.save();

        console.log(`📈 QR Code (${qrCodeId}) scanned ${scanRecord.count} times from IP: ${userIp} using device: ${deviceName}.`);
        console.log('Redirecting to URL:', scanRecord.url);

        // Emit an event to update the scan count in real-time to all connected clients
        io.emit('scanUpdate', { qrCodeId: qrCodeId, scanCount: scanRecord.count });

        // Redirect the user to the original URL
        res.redirect(scanRecord.url);
    } catch (error) {
        console.error('❌ Error updating scan count:', error);
        res.status(500).send('Internal Server Error');
    }
});




// 3. Route to get scan count for a specific qrCodeId
app.get('/count/:qrCodeId', async (req, res) => {
    const { qrCodeId } = req.params;
    try {
        const scanRecord = await Scan.findOne({ qrCodeId });
        if (scanRecord) {
            res.json({ scanCount: scanRecord.count });
        } else {
            res.status(404).json({ message: 'Scan count not found' });
        }
    } catch (error) {
        console.error('❌ Error fetching scan count:', error);
        res.status(500).send('Internal Server Error');
    }
});

// 4. Route to get all scan counts (for CountList component)
app.get('/all-counts', async (req, res) => {
    try {
        const scanRecords = await Scan.find({}, 'qrCodeId url count'); // Fetch qrCodeId, url, and count fields
        res.json(scanRecords);
    } catch (error) {
        console.error('❌ Error fetching all scan counts:', error);
        res.status(500).send('Internal Server Error');
    }
});

// 5. Route to get user scans by qrCodeId
app.get('/users/:qrCodeId', async (req, res) => {
    const { qrCodeId } = req.params;

    try {
        const scanRecord = await Scan.findOne({ qrCodeId });

        if (!scanRecord) {
            return res.status(404).json({ message: 'QR Code not found' });
        }

        // Return user scan details from the scan record
        res.json(scanRecord.users);
    } catch (error) {
        console.error('❌ Error fetching user scans:', error);
        res.status(500).send('Internal Server Error');
    }
});
var shortUrl = require("node-url-shortener");

shortUrl.short("https://teams.microsoft.com/l/meetup-join/19%3ameeting_NDI2M2ZlNDAtYjA1Ny00MGFlLWIyZTAtNzAyYzI5NjM2MmRh%40thread.v2/0?context=%7b%22Tid%22%3a%22881fa5bd-68eb-4799-9999-784393c852f8%22%2c%22Oid%22%3a%22154780ae-d980-4c9f-80b6-258c64bf6d9a%22%7d", function (err, url) {
    console.log(url);
});
// Start Server with Socket.IO
server.listen(PORT, () => {
    console.log(` Server running on http://localhost:${PORT}`);
});
