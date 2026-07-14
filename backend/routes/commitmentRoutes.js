const express = require('express');
const { protect } = require('../middleware/auth');
const {
  createCommitment,
  getCommitments,
  getCommitment,
  updateCommitment,
  deleteCommitment,
  getAvailability,
} = require('../controllers/commitmentController');

const router = express.Router();

// All routes are protected by existing JWT middleware
router.use(protect);

// Availability route — must come before /:id to avoid conflict
router.get('/availability/:date', getAvailability);

// CRUD routes
router.route('/').get(getCommitments).post(createCommitment);

router.route('/:id').get(getCommitment).put(updateCommitment).delete(deleteCommitment);

module.exports = router;
