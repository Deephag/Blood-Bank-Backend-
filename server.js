/**
 * Blood Bank Management System - Node.js Backend
 * Required Packages: npm install express mysql2 cors body-parser
 * Note: For production, add 'bcrypt' for password hashing and 'jsonwebtoken' for auth.
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Database Connection ---
// --- Database Connection ---
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,    // <--- Don't forget this comma!
    ssl: {                        // <--- PASTE THIS
        rejectUnauthorized: false // <--- PASTE THIS
    }                             // <--- PASTE THIS
});


db.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL Database.');
});

// --- AUTHENTICATION ENDPOINTS ---

// Login (Handles both Admin and User)
app.post('/api/auth/login', (req, res) => {
    const { email, password, role } = req.body;
    const table = role === 'admin' ? 'admins' : 'users';

    // Note: In production, compare hashed passwords using bcrypt
    const query = `SELECT * FROM ${table} WHERE email = ? AND password = ?`;
    db.query(query, [email, password], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
        
        // Return user data (excluding password)
        const user = results[0];
        delete user.password;
        res.json({ message: 'Login successful', user });
    });
});

// User Registration
app.post('/api/auth/register', (req, res) => {
    const { name, email, password, blood_group, location } = req.body;
    const query = 'INSERT INTO users (name, email, password, blood_group, location) VALUES (?, ?, ?, ?, ?)';
    
    db.query(query, [name, email, password, blood_group, location], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email already exists' });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'User registered successfully' });
    });
});

// --- INVENTORY ENDPOINTS (Admin & User) ---

// Get all blood inventory
app.get('/api/inventory', (req, res) => {
    db.query('SELECT * FROM blood_inventory', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Update blood inventory (Admin only)
app.put('/api/inventory', (req, res) => {
    const { blood_group, units } = req.body;
    const query = 'UPDATE blood_inventory SET units = units + ? WHERE blood_group = ?';
    db.query(query, [units, blood_group], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Inventory updated successfully' });
    });
});

// --- BLOOD REQUEST ENDPOINTS ---

// Create a blood request (User)
app.post('/api/requests', (req, res) => {
    const { user_id, blood_group, units, hospital_details } = req.body;
    const query = 'INSERT INTO blood_requests (user_id, blood_group, units, hospital_details) VALUES (?, ?, ?, ?)';
    db.query(query, [user_id, blood_group, units, hospital_details], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Blood request submitted successfully' });
    });
});

// Get all requests (Admin) or User's specific requests
app.get('/api/requests', (req, res) => {
    const { user_id } = req.query;
    let query = `
        SELECT r.*, u.name as user_name, u.email 
        FROM blood_requests r 
        JOIN users u ON r.user_id = u.id 
        ORDER BY r.request_date DESC`;
    let params = [];

    if (user_id) {
        query = 'SELECT * FROM blood_requests WHERE user_id = ? ORDER BY request_date DESC';
        params = [user_id];
    }

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Update request status (Admin)
app.put('/api/requests/:id/status', (req, res) => {
    const { status, blood_group, units } = req.body; // Added blood_group and units
    const { id } = req.params;
    
    // 1. Update the request status
    const query = 'UPDATE blood_requests SET status = ? WHERE id = ?';
    db.query(query, [status, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // 2. If Accepted, automatically deduct from inventory
        if (status === 'Accepted' && blood_group && units) {
            const invQuery = 'UPDATE blood_inventory SET units = units - ? WHERE blood_group = ?';
            db.query(invQuery, [units, blood_group], (invErr) => {
                if (invErr) return res.status(500).json({ error: invErr.message });
                res.json({ message: `Request accepted and inventory updated successfully` });
            });
        } else {
            res.json({ message: `Request ${status.toLowerCase()} successfully` });
        }
    });
});

// --- DONOR ENDPOINTS ---

// Volunteer to donate (User)
app.post('/api/donors', (req, res) => {
    const { user_id, blood_group, location } = req.body;
    const query = 'INSERT INTO donors (user_id, blood_group, location) VALUES (?, ?, ?)';
    db.query(query, [user_id, blood_group, location], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Registered as a volunteer donor' });
    });
});

// Get all donors (Admin)
app.get('/api/donors', (req, res) => {
    const query = `
        SELECT d.*, u.name, u.email 
        FROM donors d 
        JOIN users u ON d.user_id = u.id 
        ORDER BY d.created_at DESC`;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Blood Bank Server running on port ${PORT}`);
});