const DEFAULT_API_BASE_URL = 'https://api.backgrounderase.com';

const getApiBaseUrl = () =>
  process.env.BACKGROUNDERASE_API_BASE_URL || DEFAULT_API_BASE_URL;

module.exports = {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
};
