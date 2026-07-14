const morgan = require('morgan');

const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    skip: (req) => req.url === '/health',
  }
);

module.exports = requestLogger;
