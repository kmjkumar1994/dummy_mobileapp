const express = require('express');
const authRoutes = require('./authRoutes');
const audioRoutes = require('./audioRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/audio', audioRoutes);

module.exports = router;
