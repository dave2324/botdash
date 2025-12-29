/**
 * Utility functions for input validation
 */

/**
 * Validates an email address format
 * @param {string} email - Email address to validate
 * @returns {boolean} - Whether the email is valid
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Simple email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates a phone number format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} - Whether the phone number is valid
 */
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }
  
  // Remove all non-digit characters except +
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // Valid formats: +251912345678 or 0912345678
  return /^(\+)?[0-9]{10,15}$/.test(cleaned);
};

module.exports = {
  validateEmail,
  validatePhoneNumber
};