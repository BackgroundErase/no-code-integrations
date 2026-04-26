const removeBackgroundFromFile = require('../creates/remove_image_background');
const removeBackgroundFromUrl = require('../creates/remove_background_from_image_url');
const makeApiCall = require('../creates/make_api_call');
const authentication = require('../authentication');

const createZapierHarness = () => {
  const z = {
    request: jest.fn(async (request) => {
      if (/^https:\/\/files\.zapier\.com\//.test(request.url)) {
        return {
          body: Buffer.from('source-image'),
          headers: {
            'content-type': 'image/jpeg',
          },
          status: 200,
        };
      }

      return {
        body: Buffer.from('processed-image'),
        headers: {
          'content-type': 'image/png',
        },
        status: 200,
        data: undefined,
        content: '',
      };
    }),
    stashFile: jest.fn(async () => 'https://zapier-dev-files.example/output.png'),
    JSON,
    errors: {
      Error,
    },
  };

  return z;
};

const formBodyAsText = (form) =>
  form._streams.map((part) => (typeof part === 'function' ? '' : String(part))).join('\n');

describe('Remove Background from File', () => {
  it('uploads a Zapier file object to /v2 as multipart form data', async () => {
    const z = createZapierHarness();
    const bundle = {
      authData: { api_key: 'be_test_key' },
      inputData: {
        file_name: 'shirt.jpg',
        file_data: 'https://files.zapier.com/shirt.jpg',
        channels: 'rgba',
        format: 'png',
        size: 'full',
        crop: false,
        despill: false,
      },
    };

    const result = await removeBackgroundFromFile.operation.perform(z, bundle);
    const downloadRequest = z.request.mock.calls[0][0];
    const processRequest = z.request.mock.calls[1][0];
    const bodyText = formBodyAsText(processRequest.body);

    expect(downloadRequest).toEqual({
      url: 'https://files.zapier.com/shirt.jpg',
      method: 'GET',
      raw: true,
    });
    expect(processRequest.url).toBe('https://api.backgrounderase.com/v2');
    expect(processRequest.method).toBe('POST');
    expect(processRequest.raw).toBe(true);
    expect(processRequest.headers['x-api-key']).toBe('be_test_key');
    expect(processRequest.headers['content-type']).toContain('multipart/form-data');
    expect(processRequest.headers['content-type']).toContain('boundary=');
    expect(bodyText).toContain('name="image_file"; filename="shirt.jpg"');
    expect(bodyText).toContain('name="channels"');
    expect(bodyText).toContain('rgba');
    expect(bodyText).toContain('name="format"');
    expect(bodyText).toContain('png');
    expect(z.stashFile).toHaveBeenCalledWith(
      Buffer.from('processed-image'),
      undefined,
      'shirt_output.png',
      'image/png',
    );
    expect(result).toEqual({
      name: 'shirt_output.png',
      data: 'https://zapier-dev-files.example/output.png',
      mime_type: 'image/png',
      billing_model: 'metered_monthly',
      usage_unit: 'image',
      billable_units: 1,
    });
  });

  it('uses PNG output naming for alpha masks', async () => {
    const z = createZapierHarness();
    const bundle = {
      authData: { api_key: 'be_test_key' },
      inputData: {
        file_name: 'portrait.jpeg',
        file_data: 'https://files.zapier.com/portrait.jpeg',
        channels: 'alpha',
        format: 'jpg',
        size: 'medium',
      },
    };

    const result = await removeBackgroundFromFile.operation.perform(z, bundle);

    expect(result.name).toBe('portrait_output.png');
    expect(z.stashFile.mock.calls[0][2]).toBe('portrait_output.png');
  });
});

describe('Remove Background from Image URL', () => {
  it('sends image_url through the multipart /v2 path and includes source_url output', async () => {
    const z = createZapierHarness();
    const bundle = {
      authData: { api_key: 'be_test_key' },
      inputData: {
        image_url: 'https://example.com/images/shirt.jpg',
        output_base_name: 'catalog-shirt',
        channels: 'rgba',
        format: 'webp',
        size: 'hd',
        crop: true,
        despill: true,
        bg_color: '#FFFFFF',
      },
    };

    const result = await removeBackgroundFromUrl.operation.perform(z, bundle);
    const request = z.request.mock.calls[0][0];
    const bodyText = formBodyAsText(request.body);

    expect(request.url).toBe('https://api.backgrounderase.com/v2');
    expect(request.headers['x-api-key']).toBe('be_test_key');
    expect(bodyText).toContain('name="image_url"');
    expect(bodyText).toContain('https://example.com/images/shirt.jpg');
    expect(bodyText).toContain('name="bg_color"');
    expect(bodyText).toContain('#FFFFFF');
    expect(result).toMatchObject({
      name: 'catalog-shirt_output.webp',
      source_url: 'https://example.com/images/shirt.jpg',
      billing_model: 'metered_monthly',
      usage_unit: 'image',
      billable_units: 1,
    });
  });
});

describe('Make an API Call', () => {
  it('adds auth, restricts calls to the BackgroundErase API, and returns status data', async () => {
    const z = createZapierHarness();
    z.request.mockResolvedValueOnce({
      data: { status: 'ok' },
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
    const bundle = {
      authData: { api_key: 'be_test_key' },
      inputData: {
        url: '/v2/account',
        method: 'GET',
        headers: '{"x-custom":"yes"}',
        qs: '{"include":"usage"}',
      },
    };

    const result = await makeApiCall.operation.perform(z, bundle);
    const request = z.request.mock.calls[0][0];

    expect(request.url).toBe('https://api.backgrounderase.com/v2/account');
    expect(request.headers).toEqual({
      'x-custom': 'yes',
      'x-api-key': 'be_test_key',
    });
    expect(request.params).toEqual({ include: 'usage' });
    expect(request.skipThrowForStatus).toBe(true);
    expect(result).toEqual({
      body: { status: 'ok' },
      headers: { 'content-type': 'application/json' },
      statusCode: 200,
    });
  });

  it('rejects absolute URLs outside the BackgroundErase API', async () => {
    const z = createZapierHarness();
    const bundle = {
      authData: { api_key: 'be_test_key' },
      inputData: {
        url: 'https://example.com/v2/account',
        method: 'GET',
      },
    };

    await expect(makeApiCall.operation.perform(z, bundle)).rejects.toThrow(
      'URL must be a path relative to the BackgroundErase API.',
    );
    expect(z.request).not.toHaveBeenCalled();
  });
});

describe('Authentication', () => {
  it('tests API keys against /v2/account and exposes a connection label email', async () => {
    const z = createZapierHarness();
    z.request.mockResolvedValueOnce({
      data: {
        status: 'ok',
        api_key: { fingerprint: 'tok_fp_abc' },
        account: {
          email: 'user@example.com',
          plan: 'Business',
          subscription_status: 'active',
          billing_model: 'metered_monthly',
          usage_unit: 'image',
        },
      },
    });

    const result = await authentication.test(z, {
      authData: { api_key: 'be_test_key' },
    });

    expect(z.request).toHaveBeenCalledWith({
      url: 'https://api.backgrounderase.com/v2/account',
      method: 'GET',
      headers: {
        'x-api-key': 'be_test_key',
      },
    });
    expect(result).toMatchObject({
      email: 'user@example.com',
      plan: 'Business',
      billing_model: 'metered_monthly',
      usage_unit: 'image',
      api_key_fingerprint: 'tok_fp_abc',
    });
  });
});
