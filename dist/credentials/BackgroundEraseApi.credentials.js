"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundEraseApi = void 0;
class BackgroundEraseApi {
    constructor() {
        this.name = 'backgroundEraseApi';
        this.displayName = 'BackgroundErase API';
        this.icon = 'file:../nodes/BackgroundErase/backgrounderase.svg';
        this.documentationUrl = 'https://backgrounderase.com/help/troubleshooting/missing_or_invalid_api_key';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                required: true,
                description: 'Paste your BackgroundErase API key.',
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    'x-api-key': '={{$credentials.apiKey}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: 'https://api.backgrounderase.com',
                url: '/v2/account',
                method: 'GET',
            },
        };
    }
}
exports.BackgroundEraseApi = BackgroundEraseApi;
//# sourceMappingURL=BackgroundEraseApi.credentials.js.map