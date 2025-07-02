/**
 * Currency utility functions for country-specific price filtering
 */

/**
 * Get currency value based on country ID and item type
 * @param {Object} item - Product or PriceOption object
 * @param {number} countryId - User's country ID
 * @param {string} type - 'product' or 'priceOption'
 * @returns {number} The appropriate currency value
 */
const getCurrencyValue = (item, countryId, type) => {
  switch (countryId) {
    case 1:
      // Country ID 1: Use base value
      return type === 'product' ? item.unit_cost : item.value;
    case 2:
      // Country ID 2: Use TZS value
      return type === 'product' ? item.unit_cost_tzs : item.value_tzs;
    case 3:
      // Country ID 3: Use NGN value
      return type === 'product' ? item.unit_cost_ngn : item.value_ngn;
    default:
      // Fallback to base value
      return type === 'product' ? item.unit_cost : item.value;
  }
};

/**
 * Get currency symbol and formatting info based on country ID
 * @param {number} countryId - User's country ID
 * @returns {Object} Currency formatting information
 */
const getCurrencyInfo = (countryId) => {
  switch (countryId) {
    case 1:
      return {
        symbol: 'KES',
        position: 'before',
        decimalPlaces: 2,
        name: 'Kenyan Shilling'
      };
    case 2:
      return {
        symbol: 'TZS',
        position: 'after',
        decimalPlaces: 0,
        name: 'Tanzania Shilling'
      };
    case 3:
      return {
        symbol: '₦',
        position: 'before',
        decimalPlaces: 2,
        name: 'Nigerian Naira'
      };
    default:
      return {
        symbol: 'KES',
        position: 'before',
        decimalPlaces: 2,
        name: 'Kenyan Shilling'
      };
  }
};

/**
 * Format currency value with appropriate symbol and positioning
 * @param {number} amount - The amount to format
 * @param {number} countryId - User's country ID
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, countryId) => {
  const currencyInfo = getCurrencyInfo(countryId);
  const formattedAmount = Number(amount).toFixed(currencyInfo.decimalPlaces);
  
  if (currencyInfo.position === 'before') {
    return `${currencyInfo.symbol} ${formattedAmount}`;
  } else {
    return `${formattedAmount} ${currencyInfo.symbol}`;
  }
};

module.exports = {
  getCurrencyValue,
  getCurrencyInfo,
  formatCurrency
}; 