// server.js - Backend Server for Training Portal
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database Setup
const db = new sqlite3.Database('./training_portal.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize Database Tables
function initializeDatabase() {
    db.serialize(() => {
        // Users table (students and teachers)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Batches table
        db.run(`CREATE TABLE IF NOT EXISTS batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            instructor_id INTEGER,
            duration TEXT NOT NULL,
            start_date DATE NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('active', 'upcoming', 'completed')),
            max_participants INTEGER DEFAULT 100,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (instructor_id) REFERENCES users(id)
        )`);

        // Batch enrollments
        db.run(`CREATE TABLE IF NOT EXISTS enrollments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            batch_id INTEGER NOT NULL,
            enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id),
            UNIQUE(user_id, batch_id)
        )`);

        // Daily work reports
        db.run(`CREATE TABLE IF NOT EXISTS daily_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            batch_id INTEGER NOT NULL,
            report_date DATE NOT NULL,
            tasks_completed TEXT NOT NULL,
            challenges TEXT,
            hours_worked REAL NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id),
            UNIQUE(user_id, batch_id, report_date)
        )`);

        // Create indexes for better performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(report_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_reports_user ON daily_reports(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_reports_batch ON daily_reports(batch_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_enrollments_batch ON enrollments(batch_id)`);

        console.log('Database tables initialized');

        // Insert default admin user if not exists
        const adminPassword = bcrypt.hashSync('admin123', 10);
        db.run(`INSERT OR IGNORE INTO users (username, email, password, full_name, role) 
                VALUES ('admin', 'admin@training.com', ?, 'System Admin', 'admin')`, 
                [adminPassword]);

        // Insert sample batches if empty
        db.get('SELECT COUNT(*) as count FROM batches', [], (err, row) => {
            if (!err && row.count === 0) {
                insertSampleData();
            }
        });
    });
}

// Insert sample data
function insertSampleData() {
    const sampleBatches = [
        ['Web Development Fundamentals', 1, '8 weeks', '2026-01-15', 'active', 30],
        ['Advanced React & Node.js', 1, '10 weeks', '2026-01-08', 'active', 25],
        ['Data Science with Python', 1, '12 weeks', '2026-01-22', 'active', 20],
        ['UI/UX Design Mastery', 1, '6 weeks', '2026-01-05', 'active', 30],
        ['Cloud Computing & DevOps', 1, '8 weeks', '2026-01-20', 'active', 20],
        ['Mobile App Development', 1, '10 weeks', '2026-01-10', 'active', 25],
        ['Machine Learning Basics', 1, '12 weeks', '2026-02-15', 'upcoming', 20],
        ['Cybersecurity Essentials', 1, '8 weeks', '2026-02-20', 'upcoming', 25]
    ];

    const stmt = db.prepare(`INSERT INTO batches (name, instructor_id, duration, start_date, status, max_participants) 
                             VALUES (?, ?, ?, ?, ?, ?)`);
    sampleBatches.forEach(batch => stmt.run(batch));
    stmt.finalize();
    console.log('Sample batches inserted');
}

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Role-based authorization
function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

// ============ API ROUTES ============

// User Registration
app.post('/api/register', async (req, res) => {
    const { username, email, password, full_name, role } = req.body;

    if (!username || !email || !password || !full_name || !role) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['student', 'teacher'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(`INSERT INTO users (username, email, password, full_name, role) 
                VALUES (?, ?, ?, ?, ?)`,
            [username, email, hashedPassword, full_name, role],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ error: 'Registration failed' });
                }
                res.status(201).json({ 
                    message: 'User registered successfully',
                    userId: this.lastID 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// User Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Server error' });
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });
    });
});

// Get all batches
app.get('/api/batches', authenticateToken, (req, res) => {
    const { status } = req.query;
    
    let query = `
        SELECT b.*, u.full_name as instructor_name,
               (SELECT COUNT(*) FROM enrollments WHERE batch_id = b.id) as participant_count
        FROM batches b
        LEFT JOIN users u ON b.instructor_id = u.id
    `;
    
    const params = [];
    if (status && status !== 'all') {
        query += ' WHERE b.status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY b.start_date DESC';

    db.all(query, params, (err, batches) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch batches' });
        }
        res.json(batches);
    });
});

// Get user's enrolled batches
app.get('/api/my-batches', authenticateToken, (req, res) => {
    const query = `
        SELECT b.*, u.full_name as instructor_name,
               (SELECT COUNT(*) FROM enrollments WHERE batch_id = b.id) as participant_count
        FROM batches b
        INNER JOIN enrollments e ON b.id = e.batch_id
        LEFT JOIN users u ON b.instructor_id = u.id
        WHERE e.user_id = ?
        ORDER BY b.start_date DESC
    `;

    db.all(query, [req.user.id], (err, batches) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch batches' });
        }
        res.json(batches);
    });
});

// Enroll in a batch
app.post('/api/batches/:batchId/enroll', authenticateToken, (req, res) => {
    const { batchId } = req.params;
    const userId = req.user.id;

    // Check if batch exists and has space
    db.get('SELECT * FROM batches WHERE id = ?', [batchId], (err, batch) => {
        if (err || !batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        // Check current enrollment count
        db.get('SELECT COUNT(*) as count FROM enrollments WHERE batch_id = ?', 
            [batchId], (err, result) => {
                if (result.count >= batch.max_participants) {
                    return res.status(400).json({ error: 'Batch is full' });
                }

                // Enroll user
                db.run('INSERT INTO enrollments (user_id, batch_id) VALUES (?, ?)',
                    [userId, batchId],
                    function(err) {
                        if (err) {
                            if (err.message.includes('UNIQUE')) {
                                return res.status(400).json({ error: 'Already enrolled' });
                            }
                            return res.status(500).json({ error: 'Enrollment failed' });
                        }
                        res.json({ message: 'Enrolled successfully' });
                    }
                );
            }
        );
    });
});

// Submit daily report
app.post('/api/reports', authenticateToken, (req, res) => {
    const { batch_id, report_date, tasks_completed, challenges, hours_worked, notes } = req.body;
    const user_id = req.user.id;

    if (!batch_id || !report_date || !tasks_completed || !hours_worked) {
        return res.status(400).json({ error: 'Required fields missing' });
    }

    // Check if user is enrolled in the batch
    db.get('SELECT * FROM enrollments WHERE user_id = ? AND batch_id = ?',
        [user_id, batch_id], (err, enrollment) => {
            if (err || !enrollment) {
                return res.status(403).json({ error: 'Not enrolled in this batch' });
            }

            // Insert or update report
            const query = `
                INSERT INTO daily_reports (user_id, batch_id, report_date, tasks_completed, challenges, hours_worked, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, batch_id, report_date) 
                DO UPDATE SET 
                    tasks_completed = excluded.tasks_completed,
                    challenges = excluded.challenges,
                    hours_worked = excluded.hours_worked,
                    notes = excluded.notes,
                    updated_at = CURRENT_TIMESTAMP
            `;

            db.run(query, 
                [user_id, batch_id, report_date, tasks_completed, challenges, hours_worked, notes],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to submit report' });
                    }
                    res.json({ 
                        message: 'Report submitted successfully',
                        reportId: this.lastID 
                    });
                }
            );
        }
    );
});

// Get reports (with filtering)
app.get('/api/reports', authenticateToken, (req, res) => {
    const { batch_id, user_id, start_date, end_date, limit = 100 } = req.query;
    
    let query = `
        SELECT r.*, u.full_name as user_name, u.username, b.name as batch_name
        FROM daily_reports r
        INNER JOIN users u ON r.user_id = u.id
        INNER JOIN batches b ON r.batch_id = b.id
        WHERE 1=1
    `;
    
    const params = [];

    // If student, only show their reports
    if (req.user.role === 'student') {
        query += ' AND r.user_id = ?';
        params.push(req.user.id);
    }

    if (batch_id) {
        query += ' AND r.batch_id = ?';
        params.push(batch_id);
    }

    if (user_id && req.user.role !== 'student') {
        query += ' AND r.user_id = ?';
        params.push(user_id);
    }

    if (start_date) {
        query += ' AND r.report_date >= ?';
        params.push(start_date);
    }

    if (end_date) {
        query += ' AND r.report_date <= ?';
        params.push(end_date);
    }

    query += ' ORDER BY r.report_date DESC, r.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    db.all(query, params, (err, reports) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch reports' });
        }
        res.json(reports);
    });
});

// Get dashboard statistics
app.get('/api/stats', authenticateToken, (req, res) => {
    const queries = {
        totalBatches: 'SELECT COUNT(*) as count FROM batches',
        activeBatches: "SELECT COUNT(*) as count FROM batches WHERE status = 'active'",
        totalEnrollments: 'SELECT COUNT(*) as count FROM enrollments',
        totalReports: 'SELECT COUNT(*) as count FROM daily_reports'
    };

    const stats = {};
    let completed = 0;

    Object.keys(queries).forEach(key => {
        db.get(queries[key], [], (err, result) => {
            if (!err && result) {
                stats[key] = result.count;
            }
            completed++;
            
            if (completed === Object.keys(queries).length) {
                res.json(stats);
            }
        });
    });
});

// Create new batch (teachers and admins only)
app.post('/api/batches', authenticateToken, authorizeRole('teacher', 'admin'), (req, res) => {
    const { name, duration, start_date, status, max_participants } = req.body;
    const instructor_id = req.user.id;

    if (!name || !duration || !start_date || !status) {
        return res.status(400).json({ error: 'Required fields missing' });
    }

    db.run(`INSERT INTO batches (name, instructor_id, duration, start_date, status, max_participants)
            VALUES (?, ?, ?, ?, ?, ?)`,
        [name, instructor_id, duration, start_date, status, max_participants || 100],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create batch' });
            }
            res.status(201).json({ 
                message: 'Batch created successfully',
                batchId: this.lastID 
            });
        }
    );
});

// Get batch participants (teachers and admins)
app.get('/api/batches/:batchId/participants', authenticateToken, (req, res) => {
    const { batchId } = req.params;

    const query = `
        SELECT u.id, u.username, u.full_name, u.email, e.enrolled_at
        FROM users u
        INNER JOIN enrollments e ON u.id = e.user_id
        WHERE e.batch_id = ?
        ORDER BY u.full_name
    `;

    db.all(query, [batchId], (err, participants) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch participants' });
        }
        res.json(participants);
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Default admin credentials: username=admin, password=admin123');
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});
