// utils/logger.js
// Cross-platform logger utility for React Native/Expo and Node.js
// Usage: import logger from './utils/logger';

const logger = {
  info: (...args) => {
    console.log('[INFO]', ...args);
  },
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },
  debug: (...args) => {
    console.debug('[DEBUG]', ...args);
  }
};

export default logger;
