// Retry service with exponential backoff
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRetryable = 
        error.code === 'P2028' || // Transaction timeout
        error.message.includes('Transaction already closed') ||
        error.message.includes('timeout') ||
        error.message.includes('connection');

      if (attempt === maxRetries || !isRetryable) {
        throw error;
      }

      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
      
      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

module.exports = {
  retryOperation
}; 