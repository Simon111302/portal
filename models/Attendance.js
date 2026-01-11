const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  status: { type: String, enum: ['present', 'absent', 'late'], required: true },
  subject: { type: String, default: 'Class' },
  date: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'attendaces'  // ✅ Your existing data!
});

const Attendance = mongoose.model('Attendance', attendanceSchema);
