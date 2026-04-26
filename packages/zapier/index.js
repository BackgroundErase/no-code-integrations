const authentication = require('./authentication');
const removeBackgroundFromFile = require('./creates/remove_image_background');
const removeBackgroundFromUrl = require('./creates/remove_background_from_image_url');
const makeApiCall = require('./creates/make_api_call');

const App = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  authentication,

  flags: {
    cleanInputData: false,
  },

  beforeRequest: [],
  afterResponse: [],

  resources: {},
  triggers: {},
  searches: {},
  creates: {
    [removeBackgroundFromFile.key]: removeBackgroundFromFile,
    [removeBackgroundFromUrl.key]: removeBackgroundFromUrl,
    [makeApiCall.key]: makeApiCall,
  },
};

module.exports = App;
