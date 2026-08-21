/**
 * Global centralized error handler middleware.
 * Ensures consistent JSON error responses without leaking stack traces.
 */
function errorHandler(err, req, res, next) {
  // Check for common error codes from our service layer
  const errorCode = err.code || 'INTERNAL_ERROR';
  const statusCode = err.statusCode || 500;

  console.error(`[ErrorHandler] [${errorCode}] ${err.message}`);

  switch (errorCode) {
    case 'PRIVATE_ACCOUNT':
      return res.status(403).json({
        success: false,
        error: 'PRIVATE_ACCOUNT',
        message: 'This Instagram account is private.',
      });

    case 'ACCOUNT_NOT_FOUND':
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'Instagram account was not found.',
      });

    case 'INVALID_USERNAME':
      return res.status(400).json({
        success: false,
        error: 'INVALID_USERNAME',
        message: err.message || 'Invalid Instagram username format.',
      });

    case 'FETCH_FAILED':
    case 'TIMEOUT':
    case 'UPSTREAM_ERROR':
    default:
      return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 502).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Unable to fetch public stories at this time.',
      });
  }
}

module.exports = {
  errorHandler,
};
