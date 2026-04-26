const {
  appendProcessingOptions,
  createMultipartForm,
  fileOutputFields,
  processingOptionFields,
  stashProcessedImage,
} = require('./common');

const getZapierFileBody = async (z, fileInput) => {
  if (typeof fileInput === 'string' && /^https?:\/\//i.test(fileInput)) {
    const response = await z.request({
      url: fileInput,
      method: 'GET',
      raw: true,
    });

    return response.body;
  }

  return fileInput;
};

const perform = async (z, bundle) => {
  const form = createMultipartForm();
  const fileName = bundle.inputData.file_name || 'backgrounderase-input';
  const fileBody = await getZapierFileBody(z, bundle.inputData.file_data);

  form.append('image_file', fileBody, {
    filename: fileName,
  });
  appendProcessingOptions(form, bundle.inputData);

  return stashProcessedImage(z, bundle, form, fileName);
};

module.exports = {
  key: 'removeBackgroundFromFile',
  noun: 'Image',
  display: {
    label: 'Remove Background From File',
    description:
      'Uploads an image file to BackgroundErase and returns the processed image.',
  },
  operation: {
    inputFields: [
      {
        key: 'file_name',
        type: 'string',
        label: 'File Name',
        required: true,
        helpText: 'The original filename of the image to process.',
      },
      {
        key: 'file_data',
        type: 'file',
        label: 'File Data',
        required: true,
        helpText: 'Map the file object from a previous Zap step.',
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
    },
    outputFields: fileOutputFields,
  },
};
