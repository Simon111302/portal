const express = require('express');
const Student = require('../models/Student');
const mongoose = require('mongoose');
const router = express.Router();

const AttendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  status: { type: String, enum: ['present', 'absent', 'late'], required: true },
  timestamp: { type: Date, default: Date.now },
  date: String
}, { timestamps: true });

const Attendance = mongoose.model('Attendance', AttendanceSchema, 'attendaces');

router.post('/:studentId/mark', async (req, res) => {
  try {
    const { status } = req.body;
    const studentId = req.params.studentId;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student ID' });
    }
    if (!['present', 'absent', 'late'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const today = new Date().toLocaleDateString('en-US');

    const existing = await Attendance.findOne({
      studentId,
      date: today
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Already marked ${existing.status.toUpperCase()} today`
      });
    }

    const newAttendance = new Attendance({
      studentId,
      status,
      date: today,
      timestamp: new Date()
    });
    const saved = await newAttendance.save();

    await Student.findByIdAndUpdate(studentId, {
      $push: { attendance: saved._id }
    });

    console.log(`✅ ${status.toUpperCase()} SAVED to 'attendaces' for ${studentId}`);
    res.json({
      success: true,
      data: {
        id: saved._id,
        status: saved.status,
        date: saved.date
      }
    });
  } catch (error) {
    console.error('🚨 Mark attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ NEW: GET for StudentPortal (matches POST structure)
router.get('/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student ID format' });
    }

    console.log(`📋 Fetching from 'attendaces' for: ${studentId}`);

    const attendanceRecords = await Attendance.find({
      studentId: new mongoose.Types.ObjectId(studentId)
    })
    .populate('studentId', 'username email')
    .sort({ timestamp: -1 })
    .limit(20);

    console.log(`✅ Found ${attendanceRecords.length} records`);

    res.json({
      success: true,
      attendance: attendanceRecords.map(record => ({
        date: record.date,
        status: record.status,
        timestamp: record.timestamp,
        subject: record.subject || 'Class',
        id: record._id
      }))
    });
  } catch (error) {
    console.error('🚨 GET attendance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
  }
});

module.exports = router;
