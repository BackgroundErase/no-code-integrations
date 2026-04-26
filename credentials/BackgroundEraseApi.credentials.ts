import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class BackgroundEraseApi implements ICredentialType {
	name = 'backgroundEraseApi';

	displayName = 'BackgroundErase API';

	icon: Icon = 'file:../nodes/BackgroundErase/backgrounderase.svg';

	documentationUrl = 'https://backgrounderase.com/help/troubleshooting/missing_or_invalid_api_key';

	properties: INodeProperties[] = [
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

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.backgrounderase.com',
			url: '/v2/account',
			method: 'GET',
		},
	};
}
