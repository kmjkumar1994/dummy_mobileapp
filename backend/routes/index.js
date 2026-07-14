const express = require('express');
const authRoutes = require('./authRoutes');
const audioRoutes = require('./audioRoutes');
const commitmentRoutes = require('./commitmentRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/audio', audioRoutes);
router.use('/commitments', commitmentRoutes);

module.exports = router;
