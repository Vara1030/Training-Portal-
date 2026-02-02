// server-ai.js - Enhanced Backend Server with AI Features
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

// Initialize Database Tables (same as before, plus AI tables)
function initializeDatabase() {
    db.serialize(() => {
        // Previous tables
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

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

        db.run(`CREATE TABLE IF NOT EXISTS enrollments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            batch_id INTEGER NOT NULL,
            enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id),
            UNIQUE(user_id, batch_id)
        )`);

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

        // NEW: AI Analysis table
        db.run(`CREATE TABLE IF NOT EXISTS ai_insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            batch_id INTEGER,
            insight_type TEXT NOT NULL,
            insight_data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (batch_id) REFERENCES batches(id)
        )`);

        // Create indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(report_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_reports_user ON daily_reports(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_reports_batch ON daily_reports(batch_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_enrollments_batch ON enrollments(batch_id)`);

        console.log('Database tables initialized with AI features');

        // Insert default admin
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

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

// ============ AI HELPER FUNCTIONS ============

// AI: Analyze student progress
function analyzeStudentProgress(userId, callback) {
    const query = `
        SELECT 
            COUNT(*) as total_reports,
            AVG(hours_worked) as avg_hours,
            SUM(hours_worked) as total_hours,
            MIN(report_date) as first_report,
            MAX(report_date) as last_report
        FROM daily_reports
        WHERE user_id = ?
    `;

    db.get(query, [userId], (err, stats) => {
        if (err) return callback(err);

        // Get recent challenges
        db.all(`SELECT challenges FROM daily_reports 
                WHERE user_id = ? AND challenges IS NOT NULL AND challenges != ''
                ORDER BY report_date DESC LIMIT 10`, 
            [userId], (err, challenges) => {
                
                const analysis = {
                    totalReports: stats.total_reports,
                    averageHours: stats.avg_hours ? stats.avg_hours.toFixed(2) : 0,
                    totalHours: stats.total_hours || 0,
                    consistency: calculateConsistency(stats.total_reports, stats.first_report, stats.last_report),
                    commonChallenges: extractCommonChallenges(challenges),
                    performanceLevel: getPerformanceLevel(stats.avg_hours, stats.total_reports),
                    recommendations: generateRecommendations(stats.avg_hours, stats.total_reports, challenges)
                };

                callback(null, analysis);
            }
        );
    });
}

function calculateConsistency(totalReports, firstReport, lastReport) {
    if (!firstReport || !lastReport) return 0;
    
    const daysDiff = Math.floor((new Date(lastReport) - new Date(firstReport)) / (1000 * 60 * 60 * 24)) + 1;
    const consistency = (totalReports / daysDiff) * 100;
    
    return Math.min(consistency, 100).toFixed(0);
}

function extractCommonChallenges(challengeRecords) {
    if (!challengeRecords || challengeRecords.length === 0) return [];
    
    const keywords = {};
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'had', 'have', 'has', 'some', 'difficulty'];
    
    challengeRecords.forEach(record => {
        if (record.challenges) {
            const words = record.challenges.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 3 && !commonWords.includes(word));
            
            words.forEach(word => {
                keywords[word] = (keywords[word] || 0) + 1;
            });
        }
    });
    
    return Object.entries(keywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word, count]) => ({ challenge: word, frequency: count }));
}

function getPerformanceLevel(avgHours, totalReports) {
    if (!avgHours || !totalReports) return 'No Data';
    
    if (avgHours >= 7 && totalReports >= 20) return 'Excellent';
    if (avgHours >= 6 && totalReports >= 15) return 'Very Good';
    if (avgHours >= 5 && totalReports >= 10) return 'Good';
    if (avgHours >= 4 && totalReports >= 5) return 'Average';
    return 'Needs Improvement';
}

function generateRecommendations(avgHours, totalReports, challenges) {
    const recommendations = [];
    
    if (avgHours < 5) {
        recommendations.push('Consider increasing daily study time to at least 5-6 hours for better learning outcomes.');
    }
    
    if (totalReports < 10) {
        recommendations.push('Build a consistent daily reporting habit to track your progress effectively.');
    }
    
    if (challenges && challenges.length > 0) {
        recommendations.push('Focus on overcoming recurring challenges - consider seeking help from instructors or peers.');
    }
    
    if (avgHours >= 8) {
        recommendations.push('Great dedication! Make sure to balance study with adequate rest.');
    }
    
    if (totalReports >= 20 && avgHours >= 6) {
        recommendations.push('Excellent progress! Consider mentoring other students.');
    }
    
    if (recommendations.length === 0) {
        recommendations.push('Keep up the good work and maintain consistency!');
    }
    
    return recommendations;
}

// AI: Generate smart batch recommendations
function generateBatchRecommendations(userId, callback) {
    // Get user's enrolled batches
    db.all(`SELECT b.name, b.id 
            FROM batches b
            INNER JOIN enrollments e ON b.id = e.batch_id
            WHERE e.user_id = ?`, 
        [userId], (err, enrolledBatches) => {
            if (err) return callback(err);
            
            // Get available batches
            db.all(`SELECT b.*, 
                    (SELECT COUNT(*) FROM enrollments WHERE batch_id = b.id) as current_enrollment
                    FROM batches b
                    WHERE b.status = 'active' OR b.status = 'upcoming'`, 
                [], (err, allBatches) => {
                    if (err) return callback(err);
                    
                    const enrolledIds = enrolledBatches.map(b => b.id);
                    const availableBatches = allBatches.filter(b => !enrolledIds.includes(b.id));
                    
                    // Simple recommendation: suggest batches with availability
                    const recommendations = availableBatches
                        .filter(b => b.current_enrollment < b.max_participants)
                        .map(b => ({
                            batchId: b.id,
                            batchName: b.name,
                            reason: 'Based on your learning interests and batch availability',
                            availability: b.max_participants - b.current_enrollment,
                            startDate: b.start_date
                        }))
                        .slice(0, 3);
                    
                    callback(null, recommendations);
                }
            );
        }
    );
}

// AI: Predict completion rate
function predictCompletionRate(userId, batchId, callback) {
    const query = `
        SELECT 
            COUNT(*) as reports_count,
            AVG(hours_worked) as avg_hours
        FROM daily_reports
        WHERE user_id = ? AND batch_id = ?
    `;
    
    db.get(query, [userId, batchId], (err, data) => {
        if (err) return callback(err);
        
        // Simple prediction model
        let completionProbability = 0;
        
        if (data.reports_count >= 15 && data.avg_hours >= 6) {
            completionProbability = 95;
        } else if (data.reports_count >= 10 && data.avg_hours >= 5) {
            completionProbability = 80;
        } else if (data.reports_count >= 5 && data.avg_hours >= 4) {
            completionProbability = 60;
        } else if (data.reports_count > 0) {
            completionProbability = 40;
        } else {
            completionProbability = 20;
        }
        
        callback(null, {
            completionProbability: completionProbability,
            reportsSubmitted: data.reports_count,
            averageHours: data.avg_hours ? data.avg_hours.toFixed(2) : 0,
            prediction: completionProbability >= 70 ? 'High likelihood of completion' : 
                       completionProbability >= 50 ? 'Moderate likelihood of completion' : 
                       'Needs more engagement'
        });
    });
}

// ============ AI API ROUTES ============

// Get AI-powered student analysis
app.get('/api/ai/student-analysis', authenticateToken, (req, res) => {
    analyzeStudentProgress(req.user.id, (err, analysis) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to analyze progress' });
        }
        res.json(analysis);
    });
});

// Get AI batch recommendations
app.get('/api/ai/batch-recommendations', authenticateToken, (req, res) => {
    generateBatchRecommendations(req.user.id, (err, recommendations) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to generate recommendations' });
        }
        res.json(recommendations);
    });
});

// Get AI completion prediction
app.get('/api/ai/completion-prediction/:batchId', authenticateToken, (req, res) => {
    const batchId = req.params.batchId;
    
    predictCompletionRate(req.user.id, batchId, (err, prediction) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to predict completion' });
        }
        res.json(prediction);
    });
});

// Get AI insights for all students (teachers only)
app.get('/api/ai/class-insights/:batchId', authenticateToken, authorizeRole('teacher', 'admin'), (req, res) => {
    const batchId = req.params.batchId;
    
    const query = `
        SELECT 
            u.id, u.full_name,
            COUNT(r.id) as total_reports,
            AVG(r.hours_worked) as avg_hours,
            MAX(r.report_date) as last_report
        FROM users u
        INNER JOIN enrollments e ON u.id = e.user_id
        LEFT JOIN daily_reports r ON u.id = r.user_id AND r.batch_id = e.batch_id
        WHERE e.batch_id = ?
        GROUP BY u.id
    `;
    
    db.all(query, [batchId], (err, students) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to get class insights' });
        }
        
        const insights = students.map(student => ({
            studentId: student.id,
            studentName: student.full_name,
            totalReports: student.total_reports,
            averageHours: student.avg_hours ? student.avg_hours.toFixed(2) : 0,
            lastReportDate: student.last_report,
            engagementLevel: student.total_reports >= 15 ? 'High' : 
                           student.total_reports >= 10 ? 'Medium' : 'Low',
            needsAttention: student.total_reports < 5
        }));
        
        res.json({
            batchId: batchId,
            totalStudents: insights.length,
            highEngagement: insights.filter(s => s.engagementLevel === 'High').length,
            needsAttention: insights.filter(s => s.needsAttention).length,
            students: insights
        });
    });
});

// ============ ORIGINAL API ROUTES (from previous server.js) ============

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

    db.get('SELECT * FROM batches WHERE id = ?', [batchId], (err, batch) => {
        if (err || !batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        db.get('SELECT COUNT(*) as count FROM enrollments WHERE batch_id = ?', 
            [batchId], (err, result) => {
                if (result.count >= batch.max_participants) {
                    return res.status(400).json({ error: 'Batch is full' });
                }

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

    db.get('SELECT * FROM enrollments WHERE user_id = ? AND batch_id = ?',
        [user_id, batch_id], (err, enrollment) => {
            if (err || !enrollment) {
                return res.status(403).json({ error: 'Not enrolled in this batch' });
            }

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

// Get batch participants
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
// ADD THESE ROUTES TO YOUR server.js (or server-ai.js)
// Add at the end, before app.listen()

// ============ ADMIN DATA EXPORT FEATURES ============

// Export all users as CSV
app.get('/api/admin/export/users', authenticateToken, authorizeRole('admin', 'teacher'), (req, res) => {
    db.all('SELECT id, username, email, full_name, role, created_at FROM users', [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to export users' });
        }

        // Convert to CSV
        const csv = [
            'ID,Username,Email,Full Name,Role,Created At',
            ...users.map(u => `${u.id},${u.username},${u.email},"${u.full_name}",${u.role},${u.created_at}`)
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
        res.send(csv);
    });
});

// Export all reports as CSV
app.get('/api/admin/export/reports', authenticateToken, authorizeRole('admin', 'teacher'), (req, res) => {
    const query = `
        SELECT 
            r.id,
            r.report_date,
            u.full_name as student_name,
            u.email as student_email,
            b.name as batch_name,
            r.tasks_completed,
            r.challenges,
            r.hours_worked,
            r.notes,
            r.created_at
        FROM daily_reports r
        INNER JOIN users u ON r.user_id = u.id
        INNER JOIN batches b ON r.batch_id = b.id
        ORDER BY r.report_date DESC
    `;

    db.all(query, [], (err, reports) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to export reports' });
        }

        // Convert to CSV (escape commas and quotes)
        const escapeCsv = (str) => {
            if (!str) return '';
            return `"${String(str).replace(/"/g, '""')}"`;
        };

        const csv = [
            'ID,Date,Student,Email,Batch,Tasks,Challenges,Hours,Notes,Submitted',
            ...reports.map(r => 
                `${r.id},${r.report_date},${escapeCsv(r.student_name)},${r.student_email},${escapeCsv(r.batch_name)},${escapeCsv(r.tasks_completed)},${escapeCsv(r.challenges)},${r.hours_worked},${escapeCsv(r.notes)},${r.created_at}`
            )
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=reports.csv');
        res.send(csv);
    });
});

// Export all data as JSON
app.get('/api/admin/export/all', authenticateToken, authorizeRole('admin'), (req, res) => {
    const queries = {
        users: 'SELECT id, username, email, full_name, role, created_at FROM users',
        batches: 'SELECT * FROM batches',
        enrollments: `
            SELECT e.*, u.full_name as student_name, b.name as batch_name
            FROM enrollments e
            INNER JOIN users u ON e.user_id = u.id
            INNER JOIN batches b ON e.batch_id = b.id
        `,
        reports: `
            SELECT r.*, u.full_name as student_name, b.name as batch_name
            FROM daily_reports r
            INNER JOIN users u ON r.user_id = u.id
            INNER JOIN batches b ON r.batch_id = b.id
        `
    };

    const results = {};
    let completed = 0;

    Object.keys(queries).forEach(key => {
        db.all(queries[key], [], (err, data) => {
            if (!err) {
                results[key] = data;
            }
            completed++;
            
            if (completed === Object.keys(queries).length) {
                results.exportedAt = new Date().toISOString();
                results.totalUsers = results.users.length;
                results.totalBatches = results.batches.length;
                results.totalEnrollments = results.enrollments.length;
                results.totalReports = results.reports.length;

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', 'attachment; filename=training-portal-data.json');
                res.json(results);
            }
        });
    });
});

// Get database statistics for admin
app.get('/api/admin/stats', authenticateToken, authorizeRole('admin', 'teacher'), (req, res) => {
    const stats = {};
    const queries = {
        totalUsers: 'SELECT COUNT(*) as count FROM users',
        studentCount: "SELECT COUNT(*) as count FROM users WHERE role = 'student'",
        teacherCount: "SELECT COUNT(*) as count FROM users WHERE role = 'teacher'",
        totalBatches: 'SELECT COUNT(*) as count FROM batches',
        activeBatches: "SELECT COUNT(*) as count FROM batches WHERE status = 'active'",
        totalEnrollments: 'SELECT COUNT(*) as count FROM enrollments',
        totalReports: 'SELECT COUNT(*) as count FROM daily_reports',
        totalHours: 'SELECT SUM(hours_worked) as total FROM daily_reports',
        avgHours: 'SELECT AVG(hours_worked) as avg FROM daily_reports',
        recentReports: 'SELECT COUNT(*) as count FROM daily_reports WHERE report_date >= date("now", "-7 days")'
    };

    let completed = 0;
    Object.keys(queries).forEach(key => {
        db.get(queries[key], [], (err, result) => {
            if (!err && result) {
                stats[key] = result.count || result.total || result.avg || 0;
            }
            completed++;
            
            if (completed === Object.keys(queries).length) {
                res.json(stats);
            }
        });
    });
});
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 AI-Enhanced Training Portal Server`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`Default admin: username=admin, password=admin123`);
    console.log(`\n✨ AI Features Enabled:`);
    console.log(`   - Student Progress Analysis`);
    console.log(`   - Smart Batch Recommendations`);
    console.log(`   - Completion Rate Predictions`);
    console.log(`   - Class Engagement Insights`);
    console.log(`${'='.repeat(60)}\n`);
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
