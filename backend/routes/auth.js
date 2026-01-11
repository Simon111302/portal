const express = require('express');
const Student = require('../models/Student');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const student = await Student.findOne(req.body);
    res.json({
      success: true,  // Always true for demo
      studentId: student?._id?.toString() || 'test123',
      studentData: { name: 'Test Student', email: req.body.email }
    });
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

module.exports = router;
