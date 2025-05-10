// Utility functions for the Kanban App

/**
 * Generates a unique ID
 * @returns {string} A unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Formats a date string for display
 * @param {string} dateString - The date string to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  // Use UTC date to avoid timezone issues
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString();
}

/**
 * Prevents default browser behavior for an event
 * @param {Event} e - The event object
 */
function preventDefault(e) {
  e.preventDefault();
}

// Export utils
export { generateId, formatDate, preventDefault };
