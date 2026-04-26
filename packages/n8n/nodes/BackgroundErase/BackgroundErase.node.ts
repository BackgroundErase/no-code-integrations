import type {
	IBinaryData,
	IBinaryKeyData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { ApplicationError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const API_BASE_URL = 'https://api.backgrounderase.com';

type Operation = 'removeBackgroundFromFile' | 'removeBackgroundFromImageUrl' | 'makeApiCall';
type OutputChannels = 'rgba' | 'alpha';
type OutputFormat = 'png' | 'webp' | 'jpg';
type OutputSize = 'preview' | 'medium' | 'hd' | 'full' | 'auto';

interface ProcessingOptions {
	channels: OutputChannels;
	format: OutputFormat;
	size: OutputSize;
	crop: boolean;
	despill: boolean;
	bgColor?: string;
}

interface FullResponse {
	body: unknown;
	headers?: IDataObject;
	statusCode?: number;
	statusMessage?: string;
}

const mimeByFormat: Record<OutputFormat, string> = {
	png: 'image/png',
	webp: 'image/webp',
	jpg: 'image/jpeg',
};

function normalizeBaseName(value: string | undefined, fallback: string): string {
	const raw = (value || fallback).trim();
	const withoutPath = raw.split(/[\\/]/).pop() || fallback;
	const withoutExtension = withoutPath.replace(/\.[^/.]+$/, '');
	const cleaned = withoutExtension.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');

	return cleaned || fallback;
}

function outputExtensionFor(options: ProcessingOptions): string {
	return options.channels === 'alpha' ? 'png' : options.format;
}

function buildOutputName(baseName: string, options: ProcessingOptions): string {
	return `${normalizeBaseName(baseName, 'backgrounderase-output')}_output.${outputExtensionFor(options)}`;
}

function getHeader(headers: IDataObject | undefined, headerName: string): string | undefined {
	if (!headers) return undefined;

	const match = Object.keys(headers).find((key) => key.toLowerCase() === headerName.toLowerCase());
	const value = match ? headers[match] : undefined;

	if (Array.isArray(value)) return String(value[0]);
	if (value === undefined || value === null) return undefined;

	return String(value);
}

function outputMimeFor(options: ProcessingOptions, headers?: IDataObject): string {
	const responseContentType = getHeader(headers, 'content-type');
	if (responseContentType) return responseContentType.split(';')[0].trim();

	return options.channels === 'alpha' ? 'image/png' : mimeByFormat[options.format];
}

function responseBodyToBuffer(body: unknown): Buffer {
	if (Buffer.isBuffer(body)) return body;
	if (body instanceof ArrayBuffer) return Buffer.from(body);
	if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	if (typeof body === 'string') return Buffer.from(body, 'binary');

	throw new ApplicationError('BackgroundErase returned an unsupported binary response.');
}

function parseJsonParameter(value: unknown, fieldName: string): IDataObject | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'object' && !Array.isArray(value)) return value as IDataObject;

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
				return parsed as IDataObject;
			}
		} catch {
				throw new ApplicationError(`${fieldName} must be a valid JSON object.`);
		}
	}

	throw new ApplicationError(`${fieldName} must be a valid JSON object.`);
}

function stripApiKeyHeader(headers: IDataObject | undefined): IDataObject | undefined {
	if (!headers) return undefined;

	return Object.fromEntries(
		Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'x-api-key'),
	) as IDataObject;
}

function buildApiUrl(path: string): string {
	const baseUrl = new URL(API_BASE_URL);
	const url = new URL(path || '/', API_BASE_URL);

	if (url.origin !== baseUrl.origin) {
		throw new ApplicationError('URL must be a path relative to the BackgroundErase API.');
	}

	return url.toString();
}

function appendProcessingOptions(form: FormData, options: ProcessingOptions): void {
	form.append('channels', options.channels);
	form.append('format', options.format);
	form.append('size', options.size);
	form.append('crop', String(options.crop));
	form.append('despill', String(options.despill));

	if (options.bgColor) {
		form.append('bg_color', options.bgColor);
	}
}

function hasOwnBody(method: string, body: IDataObject | undefined): boolean {
	return !['GET', 'DELETE'].includes(method) && body !== undefined;
}

function getProcessingOptions(context: IExecuteFunctions, itemIndex: number): ProcessingOptions {
	const bgColor = context.getNodeParameter('bgColor', itemIndex, '') as string;

	return {
		channels: context.getNodeParameter('channels', itemIndex) as OutputChannels,
		format: context.getNodeParameter('format', itemIndex) as OutputFormat,
		size: context.getNodeParameter('size', itemIndex) as OutputSize,
		crop: context.getNodeParameter('crop', itemIndex, false) as boolean,
		despill: context.getNodeParameter('despill', itemIndex, false) as boolean,
		bgColor: bgColor || undefined,
	};
}

async function requestProcessedImage(
	context: IExecuteFunctions,
	form: FormData,
	options: ProcessingOptions,
	outputBaseName: string,
	outputBinaryPropertyName: string,
	itemIndex: number,
	sourceUrl?: string,
): Promise<INodeExecutionData> {
	const response = (await context.helpers.httpRequestWithAuthentication.call(
		context,
		'backgroundEraseApi',
		{
			method: 'POST',
			url: `${API_BASE_URL}/v2`,
			body: form,
			encoding: 'arraybuffer',
			returnFullResponse: true,
		},
	)) as FullResponse;

	const outputBuffer = responseBodyToBuffer(response.body);
	const outputName = buildOutputName(outputBaseName, options);
	const mimeType = outputMimeFor(options, response.headers);
	const binary: IBinaryKeyData = {};
	binary[outputBinaryPropertyName] = (await context.helpers.prepareBinaryData(
		outputBuffer,
		outputName,
		mimeType,
	)) as IBinaryData;

	return {
		json: {
			name: outputName,
			mime_type: mimeType,
			billing_model: 'metered_monthly',
			usage_unit: 'image',
			billable_units: 1,
			...(sourceUrl ? { source_url: sourceUrl } : {}),
		},
		binary,
		pairedItem: {
			item: itemIndex,
		},
	};
}

async function removeBackgroundFromFile(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const inputBinaryPropertyName = context.getNodeParameter(
		'inputBinaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const outputBinaryPropertyName = context.getNodeParameter(
		'outputBinaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const item = context.getInputData(itemIndex)[0];
	const incomingBinary = item.binary?.[inputBinaryPropertyName];

	if (!incomingBinary) {
		throw new NodeOperationError(
			context.getNode(),
			`No binary data found on property "${inputBinaryPropertyName}".`,
			{ itemIndex },
		);
	}

	const fileBuffer = await context.helpers.getBinaryDataBuffer(itemIndex, inputBinaryPropertyName);
	const fileNameParameter = context.getNodeParameter('fileName', itemIndex, '') as string;
	const fileName = fileNameParameter || incomingBinary.fileName || 'backgrounderase-input';
	const mimeType = incomingBinary.mimeType || 'application/octet-stream';
	const options = getProcessingOptions(context, itemIndex);
	const fileArrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
	const fileArrayView = new Uint8Array(fileArrayBuffer);
	const form = new FormData();

	fileArrayView.set(fileBuffer);
	form.append('image_file', new Blob([fileArrayBuffer], { type: mimeType }), fileName);
	appendProcessingOptions(form, options);

	return await requestProcessedImage(
		context,
		form,
		options,
		fileName,
		outputBinaryPropertyName,
		itemIndex,
	);
}

async function removeBackgroundFromImageUrl(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const imageUrl = context.getNodeParameter('imageUrl', itemIndex) as string;
	const outputBaseName = context.getNodeParameter(
		'outputBaseName',
		itemIndex,
		'backgrounderase-image',
	) as string;
	const outputBinaryPropertyName = context.getNodeParameter(
		'outputBinaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const options = getProcessingOptions(context, itemIndex);
	const form = new FormData();

	form.append('image_url', imageUrl);
	appendProcessingOptions(form, options);

	return await requestProcessedImage(
		context,
		form,
		options,
		outputBaseName,
		outputBinaryPropertyName,
		itemIndex,
		imageUrl,
	);
}

async function makeApiCall(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const method = context.getNodeParameter('method', itemIndex, 'GET') as string;
	const requestBody = parseJsonParameter(context.getNodeParameter('body', itemIndex, '{}'), 'Body');
	const headers = stripApiKeyHeader(
		parseJsonParameter(context.getNodeParameter('headers', itemIndex, '{}'), 'Headers'),
	);
	const qs = parseJsonParameter(context.getNodeParameter('qs', itemIndex, '{}'), 'Query String');
	const requestOptions: IHttpRequestOptions = {
		method: method as IHttpRequestOptions['method'],
		url: buildApiUrl(context.getNodeParameter('url', itemIndex) as string),
		headers,
		qs,
		returnFullResponse: true,
		json: true,
	};

	if (hasOwnBody(method, requestBody)) {
		requestOptions.body = requestBody;
	}

	const response = (await context.helpers.httpRequestWithAuthentication.call(
		context,
		'backgroundEraseApi',
		requestOptions,
	)) as FullResponse;

	return {
		json: {
			body: response.body,
			headers: response.headers || {},
			statusCode: response.statusCode,
		} as IDataObject,
		pairedItem: {
			item: itemIndex,
		},
	};
}

export class BackgroundErase implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BackgroundErase',
		name: 'backgroundErase',
		icon: 'file:backgrounderase.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Remove image backgrounds with BackgroundErase',
		defaults: {
			name: 'BackgroundErase',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'backgroundEraseApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Make an API Call',
						value: 'makeApiCall',
						description: 'Perform an arbitrary authorized BackgroundErase API call',
						action: 'Make an API call',
					},
					{
						name: 'Remove Background From File',
						value: 'removeBackgroundFromFile',
						description: 'Upload an image file to BackgroundErase and return the processed image',
						action: 'Remove background from file',
					},
					{
						name: 'Remove Background From Image URL',
						value: 'removeBackgroundFromImageUrl',
						description:
							'Download an image from a public or signed URL and return the processed image',
						action: 'Remove background from image URL',
					},
				],
				default: 'removeBackgroundFromFile',
			},
			{
				displayName: 'Input Binary Property',
				name: 'inputBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile'],
					},
				},
				description: 'Name of the incoming binary property that contains the image file',
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile'],
					},
				},
				description:
					'Optional output filename base. If left blank, n8n uses the incoming binary filename.',
			},
			{
				displayName: 'Image URL',
				name: 'imageUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromImageUrl'],
					},
				},
				description:
					'A publicly reachable URL or signed URL for the image to process. Private URLs may fail.',
			},
			{
				displayName: 'Output Base Name',
				name: 'outputBaseName',
				type: 'string',
				default: 'backgrounderase-image',
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromImageUrl'],
					},
				},
				description: 'Filename base used for the processed output image',
			},
			{
				displayName: 'Output Binary Property',
				name: 'outputBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile', 'removeBackgroundFromImageUrl'],
					},
				},
				description: 'Name of the output binary property that contains the processed image',
			},
			{
				displayName: 'Output Type',
				name: 'channels',
				type: 'options',
				options: [
					{
						name: 'Alpha Mask',
						value: 'alpha',
					},
					{
						name: 'Transparent Image',
						value: 'rgba',
					},
				],
				default: 'rgba',
				required: true,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile', 'removeBackgroundFromImageUrl'],
					},
				},
			},
			{
				displayName: 'Output Format',
				name: 'format',
				type: 'options',
				options: [
					{
						name: 'JPG',
						value: 'jpg',
					},
					{
						name: 'PNG',
						value: 'png',
					},
					{
						name: 'WebP',
						value: 'webp',
					},
				],
				default: 'png',
				required: true,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile', 'removeBackgroundFromImageUrl'],
					},
				},
				description:
					'PNG is recommended for transparent output. Alpha mask output is always returned as PNG.',
			},
			{
				displayName: 'Size',
				name: 'size',
				type: 'options',
				options: [
					{
						name: 'Auto',
						value: 'auto',
					},
					{
						name: 'Full',
						value: 'full',
					},
					{
						name: 'HD',
						value: 'hd',
					},
					{
						name: 'Medium',
						value: 'medium',
					},
					{
						name: 'Preview',
						value: 'preview',
					},
				],
				default: 'full',
				required: true,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile', 'removeBackgroundFromImageUrl'],
					},
				},
			},
			{
				displayName: 'Crop to Subject',
				name: 'crop',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile', 'removeBackgroundFromImageUrl'],
					},
				},
				description: 'Whether to crop the output to the detected foreground subject',
			},
			{
				displayName: 'Remove Green Spill',
				name: 'despill',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile', 'removeBackgroundFromImageUrl'],
					},
				},
				description: 'Whether to reduce green-screen color spill around subject edges',
			},
			{
				displayName: 'Background Color',
				name: 'bgColor',
				type: 'color',
				default: '',
				displayOptions: {
					show: {
						operation: ['removeBackgroundFromFile', 'removeBackgroundFromImageUrl'],
					},
				},
				description:
					'Optional. Use a hex color like #FFFFFF or a named color like white. Leave empty for transparent output.',
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '/v2/account',
				required: true,
				displayOptions: {
					show: {
						operation: ['makeApiCall'],
					},
				},
				description: 'Path relative to the BackgroundErase API, such as /v2/account',
			},
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
				],
				default: 'GET',
				required: true,
				displayOptions: {
					show: {
						operation: ['makeApiCall'],
					},
				},
			},
			{
				displayName: 'Headers',
				name: 'headers',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						operation: ['makeApiCall'],
					},
				},
				description:
					'Optional JSON object. Do not include x-api-key; n8n adds it from the credential.',
			},
			{
				displayName: 'Query String',
				name: 'qs',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						operation: ['makeApiCall'],
					},
				},
				description: 'Optional JSON object of query string parameters',
			},
			{
				displayName: 'Body',
				name: 'body',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						operation: ['makeApiCall'],
					},
				},
				description:
					'Optional JSON request body. Use the dedicated image operations for normal background removal workflows.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as Operation;

				if (operation === 'removeBackgroundFromFile') {
					returnItems.push(await removeBackgroundFromFile(this, itemIndex));
				} else if (operation === 'removeBackgroundFromImageUrl') {
					returnItems.push(await removeBackgroundFromImageUrl(this, itemIndex));
				} else {
					returnItems.push(await makeApiCall(this, itemIndex));
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnItems.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: {
							item: itemIndex,
						},
					});
					continue;
				}

				if (error instanceof NodeOperationError) throw error;
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnItems];
	}
}
