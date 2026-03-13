const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = 3000;
const secretKey = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Enhanced CORS to handle local development issues
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// Ensure the public directory exists and serve it
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.error(`Warning: Public directory not found at ${publicPath}`);
}
app.use(express.static(publicPath));

// Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'blood_bridge'
});

db.connect((err) => {
    if (err) {
        console.error('CRITICAL: Database connection failed!');
        console.error('Error details: ' + err.message);
        console.error('--- STEPS TO FIX ---');
        console.error('1. Make sure MySQL is installed and running.');
        console.error('2. Check if database "blood_bridge" exists.');
        console.error('3. Verify credentials in server.js (currently root/1234).');
        console.error('4. Run the schema.sql file in your MySQL workbench.');
        console.error('-------------------');
        return;
    }
    console.log('Successfully connected to MySQL database');
});

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).send({ message: 'No token provided' });

    jwt.verify(token.split(' ')[1], secretKey, (err, decoded) => {
        if (err) return res.status(500).send({ message: 'Failed to authenticate token' });
        req.userId = decoded.id;
        next();
    });
};

// Register Route
app.post('/register', async (req, res) => {
    const { full_name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)';
        db.query(query, [full_name, email, hashedPassword], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).send({ message: 'Email already exists' });
                }
                return res.status(500).send(err);
            }
            res.status(201).send({ message: 'User registered successfully' });
        });
    } catch (error) {
        res.status(500).send(error);
    }
});

// Login Route
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM users WHERE email = ?';
    db.query(query, [email], async (err, results) => {
        if (err) return res.status(500).send(err);
        if (results.length === 0) return res.status(404).send({ message: 'User not found' });

        const user = results[0];
        const passwordIsValid = await bcrypt.compare(password, user.password);

        if (!passwordIsValid) return res.status(401).send({ auth: false, token: null, message: 'Invalid password' });

        const token = jwt.sign({ id: user.id }, secretKey, { expiresIn: 86400 }); // 24 hours
        res.status(200).send({ auth: true, token: token, userId: user.id });
    });
});

// Get Profile Route
app.get('/profile', verifyToken, (req, res) => {
    const query = 'SELECT id, full_name, email, phone, dob, gender, blood_type, street, city, state, pincode, country, emergency_name, emergency_relation, emergency_phone FROM users WHERE id = ?';
    db.query(query, [req.userId], (err, results) => {
        if (err) return res.status(500).send(err);
        if (results.length === 0) return res.status(404).send({ message: 'User not found' });
        res.status(200).send(results[0]);
    });
});

// Update Profile Route
app.post('/update-profile', verifyToken, (req, res) => {
    const { full_name, phone, dob, gender, blood_type, street, city, state, pincode, country, emergency_name, emergency_relation, emergency_phone } = req.body;
    const query = `UPDATE users SET 
        full_name = ?, phone = ?, dob = ?, gender = ?, blood_type = ?, 
        street = ?, city = ?, state = ?, pincode = ?, country = ?, 
        emergency_name = ?, emergency_relation = ?, emergency_phone = ? 
        WHERE id = ?`;
    
    db.query(query, [full_name, phone, dob, gender, blood_type, street, city, state, pincode, country, emergency_name, emergency_relation, emergency_phone, req.userId], (err, result) => {
        if (err) return res.status(500).send(err);
        res.status(200).send({ message: 'Profile updated successfully' });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
