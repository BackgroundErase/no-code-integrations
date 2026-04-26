const FormData = require('form-data');

const { getApiBaseUrl } = require('../constants');

const CHANNEL_CHOICES = {
  rgba: 'Transparent Image',
  alpha: 'Alpha Mask',
};

const FORMAT_CHOICES = {
  png: 'PNG',
  webp: 'WebP',
  jpg: 'JPG',
};

const SIZE_CHOICES = {
  preview: 'Preview',
  medium: 'Medium',
  hd: 'HD',
  full: 'Full',
  auto: 'Auto',
};

const MIME_BY_FORMAT = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
};

const processingOptionFields = [
  {
    key: 'channels',
    type: 'string',
    label: 'Output Type',
    required: true,
    default: 'rgba',
    choices: CHANNEL_CHOICES,
  },
  {
    key: 'format',
    type: 'string',
    label: 'Output Format',
    required: true,
    default: 'png',
    choices: FORMAT_CHOICES,
    helpText:
      'PNG is recommended for transparent output. Alpha mask output is always returned as PNG.',
  },
  {
    key: 'size',
    type: 'string',
    label: 'Size',
    required: true,
    default: 'full',
    choices: SIZE_CHOICES,
  },
  {
    key: 'crop',
    type: 'boolean',
    label: 'Crop to Subject',
    required: false,
    default: 'false',
    helpText:
      'When enabled, BackgroundErase crops the output to the detected foreground subject.',
  },
  {
    key: 'despill',
    type: 'boolean',
    label: 'Remove Green Spill',
    required: false,
    default: 'false',
    helpText: 'Helps clean green-screen color spill around the subject edges.',
  },
  {
    key: 'bg_color',
    type: 'string',
    label: 'Background Color',
    required: false,
    helpText:
      'Optional. Use a hex color like #FFFFFF or a named color like white. Leave empty for transparent output.',
  },
];

const fileOutputFields = [
  { key: 'name', type: 'string', label: 'File Name' },
  { key: 'data', type: 'file', label: 'File Data' },
  { key: 'mime_type', type: 'string', label: 'MIME Type' },
  { key: 'billing_model', type: 'string', label: 'Billing Model' },
  { key: 'usage_unit', type: 'string', label: 'Usage Unit' },
  { key: 'billable_units', type: 'integer', label: 'Billable Units' },
];

const normalizeBaseName = (value, fallback) => {
  const raw = String(value || fallback || 'backgrounderase-output').trim();
  const withoutPath = raw.split(/[\\/]/).pop();
  const withoutExtension = withoutPath.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExtension.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');

  return cleaned || fallback || 'backgrounderase-output';
};

const outputExtensionFor = (inputData = {}) =>
  inputData.channels === 'alpha' ? 'png' : inputData.format || 'png';

const outputMimeFor = (inputData = {}, responseHeaders = {}) => {
  const responseContentType =
    responseHeaders['content-type'] || responseHeaders['Content-Type'];
  if (responseContentType) {
    return String(responseContentType).split(';')[0].trim();
  }

  return MIME_BY_FORMAT[outputExtensionFor(inputData)] || 'image/png';
};

const buildOutputName = (baseName, inputData) =>
  `${normalizeBaseName(baseName, 'backgrounderase-output')}_output.${outputExtensionFor(
    inputData,
  )}`;

const appendIfPresent = (form, key, value) => {
  if (value === undefined || value === null || value === '') {
    return;
  }

  form.append(key, String(value));
};

const coerceBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
  }

  return false;
};

const appendProcessingOptions = (form, inputData = {}) => {
  appendIfPresent(form, 'channels', inputData.channels || 'rgba');
  appendIfPresent(form, 'format', inputData.format || 'png');
  appendIfPresent(form, 'size', inputData.size || 'full');
  appendIfPresent(form, 'crop', coerceBoolean(inputData.crop));
  appendIfPresent(form, 'despill', coerceBoolean(inputData.despill));
  appendIfPresent(form, 'bg_color', inputData.bg_color);
};

const createMultipartForm = () => new FormData();

const stashProcessedImage = async (z, bundle, form, outputBaseName, extraOutput = {}) => {
  const response = await z.request({
    url: `${getApiBaseUrl()}/v2`,
    method: 'POST',
    headers: form.getHeaders({
      'x-api-key': bundle.authData.api_key,
    }),
    body: form,
    raw: true,
  });

  const name = buildOutputName(outputBaseName, bundle.inputData);
  const mimeType = outputMimeFor(bundle.inputData, response.headers || {});
  const data = await z.stashFile(response.body, undefined, name, mimeType);

  return {
    name,
    data,
    mime_type: mimeType,
    billing_model: 'metered_monthly',
    usage_unit: 'image',
    billable_units: 1,
    ...extraOutput,
  };
};

module.exports = {
  appendProcessingOptions,
  buildOutputName,
  createMultipartForm,
  fileOutputFields,
  normalizeBaseName,
  outputExtensionFor,
  outputMimeFor,
  processingOptionFields,
  stashProcessedImage,
};
