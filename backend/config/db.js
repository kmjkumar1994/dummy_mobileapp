const mongoose = require('mongoose');

function getMongoUri() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    process.env.MONGODB_URL;

  return typeof uri === 'string' ? uri.trim() : '';
}

const connectDB = async () => {
  const mongoUri = getMongoUri();

  if (!mongoUri) {
    console.error(
      '❌ MongoDB connection failed: no connection string found.\n' +
        '   Set MONGODB_URI in your Render Environment (Dashboard → your service → Environment).\n' +
        '   Also accepted: MONGO_URI, DATABASE_URL, MONGODB_URL.'
    );
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
