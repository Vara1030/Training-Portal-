// view-database.js - View all data in the database
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./training_portal.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to database\n');
    viewAllData();
});

function viewAllData() {
    console.log('='.repeat(80));
    console.log('DATABASE CONTENTS - Training Portal');
    console.log('='.repeat(80));
    console.log('\n');

    // View Users
    db.all('SELECT id, username, email, full_name, role, created_at FROM users', [], (err, rows) => {
        if (err) {
            console.error('Error fetching users:', err);
        } else {
            console.log('📊 USERS (' + rows.length + ' total)');
            console.log('-'.repeat(80));
            rows.forEach(user => {
                console.log(`ID: ${user.id} | Username: ${user.username} | Name: ${user.full_name}`);
                console.log(`   Role: ${user.role} | Email: ${user.email}`);
                console.log(`   Created: ${user.created_at}`);
                console.log('');
            });
            console.log('\n');

            // View Batches
            viewBatches();
        }
    });
}

function viewBatches() {
    const query = `
        SELECT b.*, u.full_name as instructor_name,
               (SELECT COUNT(*) FROM enrollments WHERE batch_id = b.id) as participant_count
        FROM batches b
        LEFT JOIN users u ON b.instructor_id = u.id
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching batches:', err);
        } else {
            console.log('📚 BATCHES (' + rows.length + ' total)');
            console.log('-'.repeat(80));
            rows.forEach(batch => {
                console.log(`ID: ${batch.id} | ${batch.name}`);
                console.log(`   Instructor: ${batch.instructor_name || 'TBA'}`);
                console.log(`   Duration: ${batch.duration} | Status: ${batch.status}`);
                console.log(`   Start Date: ${batch.start_date}`);
                console.log(`   Participants: ${batch.participant_count} / ${batch.max_participants}`);
                console.log('');
            });
            console.log('\n');

            // View Enrollments
            viewEnrollments();
        }
    });
}

function viewEnrollments() {
    const query = `
        SELECT e.*, u.full_name as student_name, b.name as batch_name
        FROM enrollments e
        INNER JOIN users u ON e.user_id = u.id
        INNER JOIN batches b ON e.batch_id = b.id
        ORDER BY e.enrolled_at DESC
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching enrollments:', err);
        } else {
            console.log('📝 ENROLLMENTS (' + rows.length + ' total)');
            console.log('-'.repeat(80));
            if (rows.length === 0) {
                console.log('   No enrollments yet.');
            } else {
                rows.forEach(enrollment => {
                    console.log(`Student: ${enrollment.student_name} → Batch: ${enrollment.batch_name}`);
                    console.log(`   Enrolled: ${enrollment.enrolled_at}`);
                    console.log('');
                });
            }
            console.log('\n');

            // View Reports
            viewReports();
        }
    });
}

function viewReports() {
    const query = `
        SELECT r.*, u.full_name as student_name, b.name as batch_name
        FROM daily_reports r
        INNER JOIN users u ON r.user_id = u.id
        INNER JOIN batches b ON r.batch_id = b.id
        ORDER BY r.report_date DESC, r.created_at DESC
        LIMIT 20
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching reports:', err);
        } else {
            console.log('📊 DAILY REPORTS (showing latest 20)');
            console.log('-'.repeat(80));
            if (rows.length === 0) {
                console.log('   No reports submitted yet.');
            } else {
                rows.forEach(report => {
                    console.log(`Date: ${report.report_date} | Student: ${report.student_name}`);
                    console.log(`Batch: ${report.batch_name} | Hours: ${report.hours_worked}`);
                    console.log(`Tasks: ${report.tasks_completed.substring(0, 100)}...`);
                    if (report.challenges) {
                        console.log(`Challenges: ${report.challenges.substring(0, 100)}...`);
                    }
                    console.log('');
                });
            }
            console.log('\n');

            // Summary Statistics
            viewStatistics();
        }
    });
}

function viewStatistics() {
    console.log('='.repeat(80));
    console.log('📈 STATISTICS SUMMARY');
    console.log('='.repeat(80));

    const queries = {
        totalUsers: 'SELECT COUNT(*) as count FROM users',
        totalStudents: "SELECT COUNT(*) as count FROM users WHERE role = 'student'",
        totalTeachers: "SELECT COUNT(*) as count FROM users WHERE role = 'teacher'",
        totalBatches: 'SELECT COUNT(*) as count FROM batches',
        activeBatches: "SELECT COUNT(*) as count FROM batches WHERE status = 'active'",
        totalEnrollments: 'SELECT COUNT(*) as count FROM enrollments',
        totalReports: 'SELECT COUNT(*) as count FROM daily_reports',
        avgHoursWorked: 'SELECT AVG(hours_worked) as avg FROM daily_reports'
    };

    let results = {};
    let completed = 0;

    Object.keys(queries).forEach(key => {
        db.get(queries[key], [], (err, result) => {
            if (!err) {
                results[key] = result.count || result.avg || 0;
            }
            completed++;
            
            if (completed === Object.keys(queries).length) {
                console.log(`Total Users: ${results.totalUsers}`);
                console.log(`  - Students: ${results.totalStudents}`);
                console.log(`  - Teachers: ${results.totalTeachers}`);
                console.log(`\nTotal Batches: ${results.totalBatches}`);
                console.log(`  - Active: ${results.activeBatches}`);
                console.log(`\nTotal Enrollments: ${results.totalEnrollments}`);
                console.log(`Total Reports Submitted: ${results.totalReports}`);
                if (results.totalReports > 0) {
                    console.log(`Average Hours Worked: ${results.avgHoursWorked.toFixed(2)} hours`);
                }
                console.log('\n');
                console.log('='.repeat(80));
                
                db.close();
            }
        });
    });
}
