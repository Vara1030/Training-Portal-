# Training Management Portal

A comprehensive web-based training management system that supports 5000+ students and 50+ teachers with real-time data storage, daily work reports, and batch management.

## Features

### For Students
- **User Registration & Authentication** - Secure login system with JWT tokens
- **Batch Enrollment** - Browse and enroll in available training batches
- **Daily Work Reports** - Submit detailed daily progress reports
- **Personal Dashboard** - View enrolled batches and statistics
- **Progress Tracking** - Monitor learning journey across multiple batches

### For Teachers
- **Batch Management** - Create and manage training batches
- **Student Monitoring** - View all student reports and progress
- **Participant Management** - Track enrollments and capacity
- **Analytics Dashboard** - Overview of all batches and reports

### Technical Features
- **Scalable Database** - SQLite with indexed queries for 5000+ users
- **Real-time Updates** - Live data synchronization across users
- **Secure Authentication** - Bcrypt password hashing and JWT tokens
- **Role-based Access** - Different permissions for students, teachers, and admins
- **RESTful API** - Clean API architecture for easy integration
- **Responsive Design** - Works on desktop, tablet, and mobile devices

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **SQLite3** - Database (easily scalable to PostgreSQL/MySQL)
- **bcrypt** - Password hashing
- **jsonwebtoken** - Authentication tokens
- **CORS** - Cross-origin resource sharing

### Frontend
- **HTML5** - Structure
- **CSS3** - Modern styling with animations
- **Vanilla JavaScript** - No framework dependencies
- **Fetch API** - HTTP requests

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Setup Steps

1. **Extract/Clone the project**
   ```bash
   cd training-management-portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the application**
   - Open your browser and go to: `http://localhost:3000`
   - Default admin credentials:
     - Username: `admin`
     - Password: `admin123`

### Development Mode
For auto-restart on file changes:
```bash
npm run dev
```

## Database Structure

### Tables

1. **users**
   - User accounts (students, teachers, admins)
   - Fields: id, username, email, password, full_name, role, created_at

2. **batches**
   - Training batch information
   - Fields: id, name, instructor_id, duration, start_date, status, max_participants

3. **enrollments**
   - Student batch enrollments
   - Fields: id, user_id, batch_id, enrolled_at

4. **daily_reports**
   - Student daily work reports
   - Fields: id, user_id, batch_id, report_date, tasks_completed, challenges, hours_worked, notes

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - User login

### Batches
- `GET /api/batches` - Get all batches
- `GET /api/my-batches` - Get user's enrolled batches
- `POST /api/batches/:batchId/enroll` - Enroll in a batch
- `POST /api/batches` - Create new batch (teachers/admins only)
- `GET /api/batches/:batchId/participants` - Get batch participants

### Reports
- `POST /api/reports` - Submit daily report
- `GET /api/reports` - Get reports (with filters)

### Statistics
- `GET /api/stats` - Get dashboard statistics

## Usage Guide

### For Students

1. **Register an Account**
   - Click "Register" tab
   - Fill in your details
   - Select "Student" as role
   - Click "Register"

2. **Login**
   - Use your username and password
   - Click "Login"

3. **Enroll in Batches**
   - Go to "All Batches" tab
   - Browse available batches
   - Click "Enroll Now" on desired batch
   - View your enrolled batches in "My Batches"

4. **Submit Daily Reports**
   - Go to "My Daily Report" tab
   - Select the date and batch
   - Fill in your tasks, challenges, and hours worked
   - Add any additional notes
   - Click "Submit Report"

5. **View Reports**
   - Go to "Reports" tab to see your submitted reports
   - Use filters to find specific reports

### For Teachers

1. **Register as Teacher**
   - Register with "Teacher" role

2. **Create Batches**
   - Teachers can create new training batches
   - Set batch details, duration, and capacity

3. **View Student Reports**
   - Access all student reports in your batches
   - Filter by date and batch
   - Monitor student progress

4. **Manage Participants**
   - View enrolled students in each batch
   - Track batch capacity and enrollments

## Scaling Considerations

### Current Capacity
- SQLite database with indexed queries
- Supports 5000+ students and 50+ teachers
- Optimized for fast queries

### Scaling to Larger Systems

If you need to support 10,000+ users:

1. **Upgrade to PostgreSQL or MySQL**
   ```javascript
   // Change database connection in server.js
   // Replace sqlite3 with pg (PostgreSQL) or mysql2
   ```

2. **Add Redis for Caching**
   ```bash
   npm install redis
   ```

3. **Implement Load Balancing**
   - Use PM2 for process management
   - Set up reverse proxy with Nginx

4. **Add Cloud Storage**
   - For file uploads (if needed)
   - AWS S3, Google Cloud Storage, etc.

## Security Features

- **Password Hashing** - Bcrypt with salt rounds
- **JWT Authentication** - Secure token-based auth
- **SQL Injection Protection** - Parameterized queries
- **XSS Protection** - Input sanitization
- **CORS Configuration** - Controlled access
- **Role-based Authorization** - Permission checks

## Customization

### Change Port
Edit in `server.js`:
```javascript
const PORT = process.env.PORT || 3000;
```

### Change JWT Secret
Set environment variable:
```bash
export JWT_SECRET="your-secure-secret-key"
```

### Modify Batch Capacity
Default is 100 students per batch. Change in database or when creating batches.

### Add More Roles
Edit the role check in database schema and add middleware.

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9
```

### Database Issues
```bash
# Delete database and restart (will reset all data)
rm training_portal.db
npm start
```

### Connection Errors
- Ensure server is running on port 3000
- Check browser console for errors
- Verify API_URL in index.html matches your server

## Production Deployment

### Environment Variables
Create a `.env` file:
```
PORT=3000
JWT_SECRET=your-production-secret-key
NODE_ENV=production
```

### Deploy to Cloud
- **Heroku**: Add Procfile
- **AWS**: Use EC2 or Elastic Beanstalk
- **DigitalOcean**: Use App Platform or Droplet
- **Vercel/Netlify**: Frontend only, API needs separate hosting

### Database Backup
```bash
# Backup SQLite database
cp training_portal.db training_portal_backup_$(date +%Y%m%d).db
```

## Future Enhancements

- [ ] File upload for assignments
- [ ] Real-time notifications
- [ ] Chat/messaging between students and teachers
- [ ] Video conferencing integration
- [ ] Certificate generation
- [ ] Analytics and reporting dashboard
- [ ] Mobile app (React Native)
- [ ] Email notifications
- [ ] Calendar integration
- [ ] Attendance tracking

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Check browser console for errors
4. Verify server logs

## License

MIT License - Free to use and modify

## Contributors

Built for scalable training management supporting thousands of users with real-time data synchronization.
