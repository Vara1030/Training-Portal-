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
