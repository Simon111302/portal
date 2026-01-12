const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:8081',
    'http://10.0.2.2:8081',
    'https://portal-production-26b9.up.railway.app'  // Add this
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10
})
.then(() => console.log('✅ MongoDB Atlas connected'))
.catch(err => console.error('❌ MongoDB error:', err));

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late'],
    required: true
  },
  subject: {
    type: String,
    default: 'Class'
  },
  date: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'attendances'
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

// ✅ Student Schema (with attendance array for JOIN)
const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: [true, 'Student ID required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: [true, 'Name required'],
    trim: true,
    minlength: [2, 'Name too short']
  },
  email: {
    type: String,
    required: [true, 'Email required'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email']
  },
  password: {
    type: String,
    required: true,
    minlength: [6, 'Password min 6 chars']
  },
  grade: {
    type: String,
    enum: ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'],
    default: 'Grade 10'
  },
  courses: [{
    type: String,
    trim: true
  }],
  attendance: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance'
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

studentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Student = mongoose.model('Student', studentSchema, 'Student');
app.post('/api/link-all-records', async (req, res) => {
  try {
    const { studentEmail } = req.body;
    const student = await Student.findOne({ email: studentEmail.toLowerCase().trim() });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Get ALL unassigned records from attendances
    const unassignedRecords = await Attendance.find({
      studentId: { $ne: student._id }
    }).limit(50);

    let linked = 0;
    for (const record of unassignedRecords) {
      record.studentId = student._id;
      await record.save();

      await Student.findByIdAndUpdate(student._id, {
        $addToSet: { attendance: record._id }
      });
      linked++;
    }

    console.log(`✅ Linked ${linked} records to ${studentEmail}`);
    res.json({ success: true, linked, total: unassignedRecords.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




app.post('/api/login', async (req, res) => {
  try {
    console.log('LOGIN ATTEMPT:', req.body.email);

    const { email, password } = req.body;
    const emailLower = email.toLowerCase().trim();

    if (!emailLower || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // ✅ FIND EXISTING STUDENT
    let student = await Student.findOne({ email: emailLower }).select('+password');

    // ✅ PASSWORD CHECK REQUIRED [web:62]
    if (student) {
      // VALIDATE PASSWORD
      const isMatch = await bcrypt.compare(password, student.password);
      if (!isMatch) {
        console.log('❌ Wrong password for:', emailLower);
        return res.status(401).json({ success: false, error: 'Wrong password' });
      }
      console.log('✅ Password OK for:', emailLower);
    } else {
      // ✅ NEW STUDENT (but hash password!)
      console.log('Creating new student:', emailLower);
      student = new Student({
        studentId: `STU${Date.now().toString().slice(-6)}`,
        name: emailLower.split('@')[0].replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase() + emailLower.split('@')[0].replace(/[^a-zA-Z]/g, '').slice(1),
        email: emailLower,
        password: await bcrypt.hash(password, 12),  // ✅ HASH IT!
        grade: 'Grade 10'
      });
      await student.save();
    }

    // ✅ POPULATE ATTENDANCE
    const studentWithAtt = await Student.findById(student._id).populate('attendance');

    res.json({
      success: true,
      data: {
        id: student._id.toString(),
        studentId: student.studentId,
        username: student.name,
        name: student.name,
        email: student.email
      }
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});


// ✅ Get attendance by student ObjectId (React Native uses this)
app.get('/api/attendance/objectId/:objectId', async (req, res) => {
  try {
    const { objectId } = req.params;
    console.log('🔍 Fetching for ID:', objectId, 'Valid?', mongoose.Types.ObjectId.isValid(objectId));

    // ✅ EARLY EXIT - NO CRASH
    if (!objectId || !mongoose.Types.ObjectId.isValid(objectId)) {
      console.log('⚠️ Invalid ID, returning empty');
      return res.json({
        success: true,
        attendance: []
      });
    }

    const records = await Attendance.find({
      studentId: new mongoose.Types.ObjectId(objectId)
    }).sort({ timestamp: -1 }).limit(20);

    console.log(`✅ Found ${records.length} records`);
    res.json({
      success: true,
      attendance: records.map(r => ({
        id: r._id.toString(),
        date: r.date,
        status: r.status,
        subject: r.subject || 'Class',
        timestamp: r.timestamp
      }))
    });
  } catch (error) {
    console.error('🚨 Attendance error:', error.message);
    res.json({ success: true, attendance: [] });  // Always succeed
  }
});


// 📋 Get all students with JOIN
app.get('/api/students', async (req, res) => {
  try {
    const { grade, search, populate } = req.query;
    let filter = {};

    if (grade) filter.grade = grade;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } }
      ];
    }

    const students = await Student.find(filter)
      .populate(populate === 'attendance' ? 'attendance' : '')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Single student with attendance JOIN
app.get('/api/students/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('attendance');

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    res.json({
      success: true,
      data: {
        ...student.toObject(),
        attendance: student.attendance || []
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Add to your existing server.js AFTER auth routes

// UPDATED: Real login with attendance (replace demo login)
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login:', req.body.email);

    // Demo for now - REPLACE with real User model when ready
    const { email } = req.body;

    // Simulate finding student by email (in production: User.findOne + Student.findOne({email}))
    const student = await Student.findOne({ email }).lean();
    let attendance = null;

    if (student) {
      // Get latest attendance
      attendance = await Attendance.findOne({ studentId: student._id })
        .sort({ date: -1 })
        .lean();
    }

    const token = 'demo-jwt-token-' + Date.now();  // Real JWT later

    res.json({
      success: true,
      data: {
        id: 'demo-user-id',
        name: 'Student User',
        email,
        token,
        studentId: student?._id,  // Custom ID
        studentObjectId: student?._id.toString(),  // For RN AsyncStorage
        attendancesId: attendance?._id?.toString() || null,
        latestAttendance: attendance?.status || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// NEW: Flexible attendance route for web/mobile
// ADD THIS EXACT ROUTE to your existing server.js (after other routes)
app.get('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // NEW: Validate ObjectId OR treat as custom ID
    const mongoose = require('mongoose');
    const ObjectId = mongoose.Types.ObjectId;

    let records = [];

    if (ObjectId.isValid(id)) {
      // Valid ObjectId → studentId query
      records = await Attendance.find({ studentId: id })
        .sort({ date: -1 })
        .limit(50)
        .lean();
    } else {
      console.log('📱 Custom ID detected:', id);
      // Custom ID → maybe username/email? Add your logic
      // For now return empty or find by username:
      const student = await Student.findOne({ username: id }).lean();
      if (student) {
        records = await Attendance.find({ studentId: student._id })
          .sort({ date: -1 })
          .limit(50)
          .lean();
      }
    }

    res.json({
      success: true,
      attendance: records.map(r => ({
        id: r._id.toString(),
        status: r.status,
        date: r.date.toISOString().split('T')[0],
        subject: 'Class'
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/debug-students', async (req, res) => {
  const students = await Student.find({}, '_id studentId email name');
  res.json({ students: students.map(s => ({
    mongoId: s._id.toString(),    // ✅ 24 chars "66bb..."
    studentId: s.studentId,       // "STU001"
    email: s.email
  })) });
});

app.get('/api/student-attendance-join/:studentShortId', async (req, res) => {
  try {
    const shortId = req.params.studentShortId; // e.g., "9"
    const student = await Student.findOne({ studentId: shortId }); // Custom string ID
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const attendances = await Attendance.find({ studentId: student._id })
      .populate('studentId', 'studentId') // Gets custom studentId

    res.json({
      success: true,
      student: {
        mongoId: student._id.toString(),
        studentShortId: student.studentId
      },
      attendances: attendances.map(a => ({
        attendanceId: a._id.toString(),
        studentObjectId: student._id.toString(),
        studentShortId: student.studentId,
        status: a.status,
        date: a.date,
        subject: a.subject || 'Class'
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// 🔍 DEBUG: View all students + attendance counts
app.get('/api/debug-students', async (req, res) => {
  try {
    const students = await Student.find()
      .populate('attendance', 'status date subject')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      students: students.map(s => ({
        id: s._id.toString(),
        studentId: s.studentId,
        email: s.email,
        name: s.name,
        attendanceCount: s.attendance?.length || 0,
        recentAttendance: s.attendance.slice(0, 3)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🧪 Create test attendance for specific student
app.post('/api/create-test-attendance', async (req, res) => {
  try {
    const { email, status = 'present' } = req.body;
    const student = await Student.findOne({ email: email.toLowerCase().trim() });

    if (!student) return res.status(404).json({ error: 'Student not found' });

    const today = new Date().toLocaleDateString('en-US');
    const record = new Attendance({
      studentId: student._id,
      status,
      subject: 'Test Class',
      date: today
    });

    await record.save();
    await Student.findByIdAndUpdate(student._id, { $push: { attendance: record._id } });

    res.json({ 
      success: true, 
      message: `✅ ${status.toUpperCase()} record added`,
      record: { id: record._id, date: today, status }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ➕ Create student
app.post('/api/students', async (req, res) => {
  try {
    const student = new Student({
      ...req.body,
      email: req.body.email.toLowerCase().trim(),
      password: await bcrypt.hash(req.body.password, 12)
    });
    const saved = await student.save();
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Student ID or Email already exists'
      });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// ✏️ Update student
app.put('/api/students/:id', async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, data: student });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 🗑️ Delete student
app.delete('/api/students/:id', async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    attendance: true
  });
});

// Test endpoint
app.get('/api/test', (req, res) => res.json({ backend: 'working', time: new Date() }));

// ✅ 404 handler LAST
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Mobile: http://10.0.2.2:${PORT} (Android emulator)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});
