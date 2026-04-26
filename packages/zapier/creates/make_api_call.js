const { getApiBaseUrl } = require('../constants');

const METHOD_CHOICES = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
};

const parseJsonField = (z, value, fallback, fieldLabel) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return z.JSON.parse(value);
  } catch (error) {
    throw new z.errors.Error(
      `${fieldLabel} must be valid JSON.`,
      'InvalidJsonInput',
      400,
    );
  }
};

const buildApiUrl = (path) => {
  const base = getApiBaseUrl();
  const baseUrl = new URL(base);
  const url = new URL(path || '/', base);

  if (url.origin !== baseUrl.origin) {
    throw new Error('URL must be a path relative to the BackgroundErase API.');
  }

  return url.toString();
};

const perform = async (z, bundle) => {
  const method = (bundle.inputData.method || 'GET').toUpperCase();
  const headers = parseJsonField(z, bundle.inputData.headers, {}, 'Headers');
  const params = parseJsonField(z, bundle.inputData.qs, {}, 'Query String');
  const body = parseJsonField(z, bundle.inputData.body, undefined, 'Body');
  const hasBody = !['GET', 'DELETE'].includes(method) && body !== undefined;

  const request = {
    url: buildApiUrl(bundle.inputData.url),
    method,
    headers: {
      ...headers,
      'x-api-key': bundle.authData.api_key,
    },
    params,
    skipThrowForStatus: true,
  };

  if (hasBody) {
    request.body = body;
  }

  const response = await z.request(request);

  return {
    body:
      response.data !== undefined && response.data !== null
        ? response.data
        : response.content,
    headers: response.headers,
    statusCode: response.status,
  };
};

module.exports = {
  key: 'makeApiCall',
  noun: 'API Call',
  display: {
    label: 'Make an API Call',
    description: 'Performs an arbitrary authorized API call.',
  },
  operation: {
    inputFields: [
      {
        key: 'url',
        type: 'string',
        label: 'URL',
        required: true,
        default: '/v2/account',
        helpText:
          'Enter a path relative to the BackgroundErase API. For example: /v2/account',
      },
      {
        key: 'method',
        type: 'string',
        label: 'Method',
        required: true,
        default: 'GET',
        choices: METHOD_CHOICES,
      },
      {
        key: 'headers',
        type: 'json',
        label: 'Headers',
        required: false,
        default: '{}',
        helpText:
          'Optional JSON object. You do not need to add the BackgroundErase API key header; it is added automatically by the connection.',
      },
      {
        key: 'qs',
        type: 'json',
        label: 'Query String',
        required: false,
        default: '{}',
        helpText: 'Optional JSON object of query string parameters.',
      },
      {
        key: 'body',
        type: 'json',
        label: 'Body',
        required: false,
        helpText:
          'Optional JSON request body. Use the dedicated image actions for normal background removal workflows.',
      },
    ],
    perform,
    sample: {
      body: {
        status: 'ok',
        api_key: {
          valid: true,
          mode: 'live',
          fingerprint: 'tok_fp_example',
        },
        account: {
          email: 'user@example.com',
          plan: 'Business',
          subscription_status: 'active',
          billing_model: 'metered_monthly',
          usage_unit: 'image',
        },
      },
      headers: {
        'content-type': 'application/json',
      },
      statusCode: 200,
    },
    outputFields: [
      { key: 'body', dict: true, label: 'Body' },
      { key: 'headers', dict: true, label: 'Headers' },
      { key: 'statusCode', type: 'integer', label: 'Status Code' },
    ],
  },
};
