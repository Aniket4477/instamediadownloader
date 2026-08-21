/**
 * Validates Instagram username format according to Instagram naming guidelines:
 * - 1 to 30 characters
 * - Only letters, numbers, periods, and underscores
 * - Cannot start or end with a period
 * - Cannot have consecutive periods
 * 
 * @param {string} username
 * @returns {{ isValid: boolean, cleanedUsername?: string, error?: string }}
 */
function validateInstagramUsername(username) {
  if (!username || typeof username !== 'string') {
    return {
      isValid: false,
      error: 'Username is required and must be a string.',
    };
  }

  const cleaned = username.trim().toLowerCase();

  if (cleaned.length === 0) {
    return {
      isValid: false,
      error: 'Username cannot be empty.',
    };
  }

  if (cleaned.length > 30) {
    return {
      isValid: false,
      error: 'Username cannot exceed 30 characters.',
    };
  }

  // Instagram username regex
  const usernameRegex = /^(?!.*\.\.)(?!.*\.$)[^\W][\w.]{0,29}$/;
  if (!usernameRegex.test(cleaned)) {
    return {
      isValid: false,
      error: 'Invalid Instagram username format. Only letters, numbers, periods, and underscores are allowed.',
    };
  }

  return {
    isValid: true,
    cleanedUsername: cleaned,
  };
}

module.exports = {
  validateInstagramUsername,
};
