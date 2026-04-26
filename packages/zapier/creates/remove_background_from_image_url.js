const {
  appendProcessingOptions,
  createMultipartForm,
  fileOutputFields,
  processingOptionFields,
  stashProcessedImage,
} = require('./common');

const perform = async (z, bundle) => {
  const form = createMultipartForm();
  const outputBaseName =
    bundle.inputData.output_base_name || 'backgrounderase-image';

  form.append('image_url', bundle.inputData.image_url);
  appendProcessingOptions(form, bundle.inputData);

  return stashProcessedImage(z, bundle, form, outputBaseName, {
    source_url: bundle.inputData.image_url,
  });
};

module.exports = {
  key: 'removeBackgroundFromUrl',
  noun: 'Image',
  display: {
    label: 'Remove Background From Image URL',
    description:
      'Downloads an image from a public or signed URL, removes the background, and returns the processed image as a file.',
  },
  operation: {
    inputFields: [
      {
        key: 'image_url',
        type: 'string',
        label: 'Image URL',
        required: true,
        helpText:
          'A publicly reachable URL or signed URL for the image to process. Private Google Drive links, expired signed URLs, login-protected URLs, or internal network URLs may fail.',
      },
      {
        key: 'output_base_name',
        type: 'string',
        label: 'Output Base Name',
        required: false,
        helpText:
          'Optional. If provided, this is used as the output filename base. If left blank, the output filename defaults to backgrounderase-image_output.',
      },
      ...processingOptionFields,
    ],
    perform,
    sample: {
      name: 'shirt_output.png',
      data: 'https://zapier-dev-files.s3.amazonaws.com/example/shirt_output.png',
      mime_type: 'image/png',
      billing_model: 'metered_monthly',
      usage_unit: 'image',
      billable_units: 1,
      source_url: 'https://example.com/images/shirt.jpg',
    },
    outputFields: [
      ...fileOutputFields,
      { key: 'source_url', type: 'string', label: 'Source URL' },
    ],
  },
};
