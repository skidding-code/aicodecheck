/**
 * String Utility Functions Module.
 *
 * This module provides a collection of helpful utility functions for working
 * with strings in a clean and reusable way. Each function is well documented
 * and handles edge cases gracefully.
 */

/**
 * Capitalizes the first letter of the provided string.
 *
 * @param {string} inputString - The string to capitalize.
 * @returns {string} The capitalized string.
 */
function capitalizeFirstLetter(inputString) {
  // First, we check whether the input string is empty.
  if (!inputString) {
    return '';
  }
  // Next, we capitalize the first character and append the rest.
  return inputString.charAt(0).toUpperCase() + inputString.slice(1);
}

/**
 * Reverses the characters in the provided string.
 *
 * @param {string} inputString - The string to reverse.
 * @returns {string} The reversed string.
 */
function reverseString(inputString) {
  // Handle the empty string edge case first.
  if (!inputString) {
    return '';
  }
  // Split the string into an array, reverse it, and join it back.
  return inputString.split('').reverse().join('');
}

/**
 * Counts the number of words in the provided string.
 *
 * @param {string} inputString - The string to analyze.
 * @returns {number} The number of words in the string.
 */
function countWords(inputString) {
  // Return zero for an empty or whitespace-only string.
  if (!inputString || inputString.trim().length === 0) {
    return 0;
  }
  // Split the string on whitespace and count the resulting parts.
  const words = inputString.trim().split(/\s+/);
  // Finally, we return the number of words.
  return words.length;
}

/**
 * Truncates the provided string to the given maximum length.
 *
 * @param {string} inputString - The string to truncate.
 * @param {number} maximumLength - The maximum allowed length.
 * @returns {string} The truncated string with an ellipsis if needed.
 */
function truncateString(inputString, maximumLength) {
  // If the string is already short enough, return it unchanged.
  if (inputString.length <= maximumLength) {
    return inputString;
  }
  // Otherwise, truncate the string and append an ellipsis.
  return inputString.slice(0, maximumLength) + '...';
}

// TODO: Add support for localization in a future version.

module.exports = {
  capitalizeFirstLetter,
  reverseString,
  countWords,
  truncateString,
};
