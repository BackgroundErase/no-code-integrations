const { getApiBaseUrl } = require('./constants');

const test = async (z, bundle) => {
  const response = await z.request({
    url: `${getApiBaseUrl()}/v2/account`,
    method: 'GET',
    headers: {
      'x-api-key': bundle.authData.api_key,
    },
  });

  const account = response.data && response.data.account ? response.data.account : {};
  const apiKey = response.data && response.data.api_key ? response.data.api_key : {};

  return {
    status: response.data && response.data.status,
    email: account.email,
    plan: account.plan,
    subscription_status: account.subscription_status,
    billing_model: account.billing_model,
    usage_unit: account.usage_unit,
    api_key_fingerprint: apiKey.fingerprint,
  };
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      type: 'password',
      required: true,
      label: 'API Key',
      helpText:
        'Paste your BackgroundErase API key. Help: https://backgrounderase.com/help/troubleshooting/missing_or_invalid_api_key',
    },
  ],
  test,
  connectionLabel: '{{email}}',
};
