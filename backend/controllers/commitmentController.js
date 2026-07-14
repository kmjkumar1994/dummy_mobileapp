const Commitment = require('../models/Commitment');
const { sendSuccess, createError } = require('../utils/response');

// ─── Helpers ────────────────────────────────────────────────────────────────

// Convert HH:MM to total minutes for duration calculation
const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Compute day health score from a list of commitments
const computeDayHealth = (commitments) => {
  if (commitments.length === 0) {
    return {
      score: 100,
      label: 'Clear',
      message: 'Your day is open. Full energy available.',
      totalCommitments: 0,
      drainingCount: 0,
      recoveryNeededCount: 0,
      availabilityPercent: 100,
    };
  }

  let drainScore = 0;
  let recoveryCount = 0;
  let drainingCount = 0;
  let totalMinutes = 0;

  const energyWeights = { restoring: -1, neutral: 0, draining: 2, exhausting: 4 };
  const emotionWeights = { joyful: -1, neutral: 0, stressful: 2, heavy: 3 };

  commitments.forEach((c) => {
    const duration = toMinutes(c.endTime) - toMinutes(c.startTime);
    totalMinutes += duration + (c.bufferBefore || 0) + (c.bufferAfter || 0);

    drainScore += (energyWeights[c.energyCost] || 0) + (emotionWeights[c.emotionalWeight] || 0);

    if (c.recoveryNeeded) recoveryCount++;
    if (c.energyCost === 'draining' || c.energyCost === 'exhausting') drainingCount++;
  });

  // 480 minutes = 8 hour workday as baseline
  const loadPercent = Math.min(Math.round((totalMinutes / 480) * 100), 100);
  const drainPenalty = Math.min(drainScore * 5, 50);
  const recoveryPenalty = recoveryCount * 5;

  const score = Math.max(0, 100 - loadPercent * 0.4 - drainPenalty - recoveryPenalty);
  const availabilityPercent = Math.round(score);

  let label, message;

  if (score >= 75) {
    label = 'Healthy';
    message = 'Good day. You have energy and space.';
  } else if (score >= 50) {
    label = 'Moderate';
    message = 'Manageable day. Be mindful of new commitments.';
  } else if (score >= 25) {
    label = 'Heavy';
    message = 'This day is loaded. Protect your remaining energy.';
  } else {
    label = 'Overloaded';
    message = 'You are at capacity. Do not accept new commitments today.';
  }

  return {
    score: Math.round(score),
    label,
    message,
    totalCommitments: commitments.length,
    drainingCount,
    recoveryNeededCount: recoveryCount,
    availabilityPercent,
    loadPercent,
  };
};

// ─── Controllers ────────────────────────────────────────────────────────────

// @desc    Create a commitment
// @route   POST /api/commitments
// @access  Private
const createCommitment = async (req, res, next) => {
  try {
    const commitment = await Commitment.create({
      ...req.body,
      user: req.user._id,
    });

    return sendSuccess(res, { commitment }, 'Commitment created successfully', 201);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all commitments (optionally filter by date or date range)
// @route   GET /api/commitments?date=YYYY-MM-DD
// @route   GET /api/commitments?from=YYYY-MM-DD&to=YYYY-MM-DD
// @access  Private
const getCommitments = async (req, res, next) => {
  try {
    const { date, from, to, status, category } = req.query;

    const filter = { user: req.user._id };

    if (date) {
      filter.date = date;
    } else if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }

    if (status) filter.status = status;
    if (category) filter.category = category;

    const commitments = await Commitment.find(filter).sort({ date: 1, startTime: 1 });

    return sendSuccess(res, { commitments, total: commitments.length });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single commitment
// @route   GET /api/commitments/:id
// @access  Private
const getCommitment = async (req, res, next) => {
  try {
    const commitment = await Commitment.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!commitment) {
      return next(createError('Commitment not found.', 404));
    }

    return sendSuccess(res, { commitment });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a commitment
// @route   PUT /api/commitments/:id
// @access  Private
const updateCommitment = async (req, res, next) => {
  try {
    const commitment = await Commitment.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!commitment) {
      return next(createError('Commitment not found.', 404));
    }

    return sendSuccess(res, { commitment }, 'Commitment updated successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a commitment
// @route   DELETE /api/commitments/:id
// @access  Private
const deleteCommitment = async (req, res, next) => {
  try {
    const commitment = await Commitment.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!commitment) {
      return next(createError('Commitment not found.', 404));
    }

    return sendSuccess(res, null, 'Commitment deleted successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get availability + day health score for a date
// @route   GET /api/commitments/availability/:date
// @access  Private
const getAvailability = async (req, res, next) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return next(createError('Date must be in YYYY-MM-DD format.', 400));
    }

    const commitments = await Commitment.find({
      user: req.user._id,
      date,
      status: { $nin: ['free'] },
    }).sort({ startTime: 1 });

    const dayHealth = computeDayHealth(commitments);

    return sendSuccess(res, {
      date,
      dayHealth,
      commitments,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCommitment,
  getCommitments,
  getCommitment,
  updateCommitment,
  deleteCommitment,
  getAvailability,
};
