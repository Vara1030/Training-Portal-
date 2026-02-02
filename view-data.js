// COPY THIS ENTIRE FILE
// Save as: view-data.js
// Run with: node view-data.js

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./training_portal.db', (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        console.log('\n💡 Make sure training_portal.db exists in this folder!');
        process.exit(1);
    }
    console.log('✅ Connected to database\n');
    viewAllData();
});

function viewAllData() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('               TRAINING PORTAL - DATABASE VIEWER');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // View Users
    db.all('SELECT id, username, email, full_name, role FROM users', [], (err, users) => {
        if (err) {
            console.error('Error:', err);
        } else {
            console.log('👥 USERS (' + users.length + ' total)');
            console.log('───────────────────────────────────────────────────────────────');
            users.forEach(user => {
                console.log(`\n  ID: ${user.id}`);
                console.log(`  Username: ${user.username}`);
                console.log(`  Name: ${user.full_name}`);
                console.log(`  Role: ${user.role.toUpperCase()}`);
                console.log(`  Email: ${user.email}`);
            });
            console.log('\n');
        }
        viewBatches();
    });
}

function viewBatches() {
    const query = `
        SELECT b.*, 
               (SELECT full_name FROM users WHERE id = b.instructor_id) as instructor_name,
               (SELECT COUNT(*) FROM enrollments WHERE batch_id = b.id) as enrolled
        FROM batches b
    `;

    db.all(query, [], (err, batches) => {
        if (err) {
            console.error('Error:', err);
        } else {
            console.log('📚 BATCHES (' + batches.length + ' total)');
            console.log('───────────────────────────────────────────────────────────────');
            batches.forEach(batch => {
                console.log(`\n  ID: ${batch.id}`);
                console.log(`  Name: ${batch.name}`);
                console.log(`  Instructor: ${batch.instructor_name || 'TBA'}`);
                console.log(`  Duration: ${batch.duration}`);
                console.log(`  Status: ${batch.status.toUpperCase()}`);
                console.log(`  Start Date: ${batch.start_date}`);
                console.log(`  Enrolled: ${batch.enrolled} / ${batch.max_participants}`);
            });
            console.log('\n');
        }
        viewEnrollments();
    });
}

function viewEnrollments() {
    const query = `
        SELECT 
            (SELECT full_name FROM users WHERE id = e.user_id) as student,
            (SELECT name FROM batches WHERE id = e.batch_id) as batch,
            e.enrolled_at
        FROM enrollments e
    `;

    db.all(query, [], (err, enrollments) => {
        if (err) {
            console.error('Error:', err);
        } else {
            console.log('📝 ENROLLMENTS (' + enrollments.length + ' total)');
            console.log('───────────────────────────────────────────────────────────────');
            if (enrollments.length === 0) {
                console.log('  No enrollments yet.');
            } else {
                enrollments.forEach(e => {
                    console.log(`  ${e.student} → ${e.batch}`);
                    console.log(`    Enrolled: ${e.enrolled_at}\n`);
                });
            }
            console.log('');
        }
        viewReports();
    });
}

function viewReports() {
    const query = `
        SELECT 
            r.*,
            (SELECT full_name FROM users WHERE id = r.user_id) as student,
            (SELECT name FROM batches WHERE id = r.batch_id) as batch
        FROM daily_reports r
        ORDER BY r.report_date DESC
        LIMIT 10
    `;

    db.all(query, [], (err, reports) => {
        if (err) {
            console.error('Error:', err);
        } else {
            console.log('📊 RECENT REPORTS (last 10)');
            console.log('───────────────────────────────────────────────────────────────');
            if (reports.length === 0) {
                console.log('  No reports submitted yet.');
            } else {
                reports.forEach(r => {
                    console.log(`\n  Date: ${r.report_date}`);
                    console.log(`  Student: ${r.student}`);
                    console.log(`  Batch: ${r.batch}`);
                    console.log(`  Hours: ${r.hours_worked}`);
                    console.log(`  Tasks: ${r.tasks_completed.substring(0, 80)}...`);
                    if (r.challenges) {
                        console.log(`  Challenges: ${r.challenges.substring(0, 80)}...`);
                    }
                });
            }
            console.log('\n');
        }
        showStats();
    });
}

function showStats() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                       📈 STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const queries = [
        { name: 'Total Users', sql: 'SELECT COUNT(*) as c FROM users' },
        { name: 'Students', sql: "SELECT COUNT(*) as c FROM users WHERE role='student'" },
        { name: 'Teachers', sql: "SELECT COUNT(*) as c FROM users WHERE role='teacher'" },
        { name: 'Total Batches', sql: 'SELECT COUNT(*) as c FROM batches' },
        { name: 'Active Batches', sql: "SELECT COUNT(*) as c FROM batches WHERE status='active'" },
        { name: 'Enrollments', sql: 'SELECT COUNT(*) as c FROM enrollments' },
        { name: 'Reports Submitted', sql: 'SELECT COUNT(*) as c FROM daily_reports' },
        { name: 'Total Hours Logged', sql: 'SELECT SUM(hours_worked) as c FROM daily_reports' }
    ];

    let completed = 0;

    queries.forEach(q => {
        db.get(q.sql, [], (err, row) => {
            if (!err && row) {
                const value = row.c || 0;
                console.log(`  ${q.name}: ${value}`);
            }
            completed++;
            if (completed === queries.length) {
                console.log('\n═══════════════════════════════════════════════════════════════\n');
                db.close();
            }
        });
    });
}
