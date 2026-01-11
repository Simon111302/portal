const express = require('express');
const Student = require('../models/Student');
const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    res.json({ success: true, data: { attendance: [] } });  // Mock attendance
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
