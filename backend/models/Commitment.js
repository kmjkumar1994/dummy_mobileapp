const mongoose = require('mongoose');

const commitmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },

    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },

    date: {
      type: String,
      required: [true, 'Date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    },

    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'],
    },

    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^\d{2}:\d{2}$/, 'End time must be in HH:MM format'],
    },

    status: {
      type: String,
      enum: {
        values: ['free', 'tentative', 'reserved', 'confirmed', 'busy'],
        message: 'Status must be one of: free, tentative, reserved, confirmed, busy',
      },
      default: 'confirmed',
    },

    // How certain is this happening (0-100)
    confidence: {
      type: Number,
      min: [0, 'Confidence must be at least 0'],
      max: [100, 'Confidence cannot exceed 100'],
      default: 100,
    },

    category: {
      type: String,
      enum: {
        values: ['work', 'personal', 'health', 'family', 'focus', 'travel', 'social', 'other'],
        message: 'Invalid category',
      },
      default: 'other',
    },

    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'critical'],
        message: 'Priority must be one of: low, medium, high, critical',
      },
      default: 'medium',
    },

    // How much energy does this take from you
    energyCost: {
      type: String,
      enum: {
        values: ['restoring', 'neutral', 'draining', 'exhausting'],
        message: 'energyCost must be one of: restoring, neutral, draining, exhausting',
      },
      default: 'neutral',
    },

    // How does this make you feel
    emotionalWeight: {
      type: String,
      enum: {
        values: ['joyful', 'neutral', 'stressful', 'heavy'],
        message: 'emotionalWeight must be one of: joyful, neutral, stressful, heavy',
      },
      default: 'neutral',
    },

    // Can this be moved or rescheduled
    flexibility: {
      type: String,
      enum: {
        values: ['fixed', 'flexible', 'very-flexible'],
        message: 'flexibility must be one of: fixed, flexible, very-flexible',
      },
      default: 'fixed',
    },

    // Do you need quiet time after this
    recoveryNeeded: {
      type: Boolean,
      default: false,
    },

    // Protected breathing space in minutes
    bufferBefore: {
      type: Number,
      min: [0, 'Buffer cannot be negative'],
      default: 0,
    },

    bufferAfter: {
      type: Number,
      min: [0, 'Buffer cannot be negative'],
      default: 0,
    },

    // Does this serve your goals
    valueAlignment: {
      type: String,
      enum: {
        values: ['aligned', 'neutral', 'misaligned'],
        message: 'valueAlignment must be one of: aligned, neutral, misaligned',
      },
      default: 'neutral',
    },

    // Is this from someone else asking for your time
    isIncomingRequest: {
      type: Boolean,
      default: false,
    },

    reminder: {
      type: Number,
      min: [0, 'Reminder cannot be negative'],
      default: 15, // minutes before
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast date-based queries per user
commitmentSchema.index({ user: 1, date: 1 });

const Commitment = mongoose.model('Commitment', commitmentSchema);

module.exports = Commitment;
