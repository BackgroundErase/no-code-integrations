"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundErase = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const API_BASE_URL = 'https://api.backgrounderase.com';
const mimeByFormat = {
    png: 'image/png',
    webp: 'image/webp',
    jpg: 'image/jpeg',
};
function normalizeBaseName(value, fallback) {
    const raw = (value || fallback).trim();
    const withoutPath = raw.split(/[\\/]/).pop() || fallback;
    const withoutExtension = withoutPath.replace(/\.[^/.]+$/, '');
    const cleaned = withoutExtension.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
    return cleaned || fallback;
}
function outputExtensionFor(options) {
    return options.channels === 'alpha' ? 'png' : options.format;
}
function buildOutputName(baseName, options) {
    return `${normalizeBaseName(baseName, 'backgrounderase-output')}_output.${outputExtensionFor(options)}`;
}
function getHeader(headers, headerName) {
    if (!headers)
        return undefined;
    const match = Object.keys(headers).find((key) => key.toLowerCase() === headerName.toLowerCase());
    const value = match ? headers[match] : undefined;
    if (Array.isArray(value))
        return String(value[0]);
    if (value === undefined || value === null)
        return undefined;
    return String(value);
}
function outputMimeFor(options, headers) {
    const responseContentType = getHeader(headers, 'content-type');
    if (responseContentType)
        return responseContentType.split(';')[0].trim();
    return options.channels === 'alpha' ? 'image/png' : mimeByFormat[options.format];
}
function responseBodyToBuffer(body) {
    if (Buffer.isBuffer(body))
        return body;
    if (body instanceof ArrayBuffer)
        return Buffer.from(body);
    if (ArrayBuffer.isView(body))
        return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    if (typeof body === 'string')
        return Buffer.from(body, 'binary');
    throw new n8n_workflow_1.ApplicationError('BackgroundErase returned an unsupported binary response.');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isHttpRequestError(error) {
    var _a;
    if (!isRecord(error))
        return false;
    const response = error.response;
    const cause = error.cause;
    return (error instanceof n8n_workflow_1.NodeApiError ||
        typeof error.httpCode === 'number' ||
        typeof error.httpCode === 'string' ||
        typeof error.statusCode === 'number' ||
        typeof error.status === 'number' ||
        (isRecord(response) &&
            (typeof response.status === 'number' || typeof response.statusCode === 'number')) ||
        (isRecord(cause) && ((_a = cause.constructor) === null || _a === void 0 ? void 0 : _a.name) === 'AxiosError'));
}
function parseJsonParameter(value, fieldName) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'object' && !Array.isArray(value))
        return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            throw new n8n_workflow_1.ApplicationError(`${fieldName} must be a valid JSON object.`);
        }
    }
    throw new n8n_workflow_1.ApplicationError(`${fieldName} must be a valid JSON object.`);
}
function stripApiKeyHeader(headers) {
    if (!headers)
        return undefined;
    return Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'x-api-key'));
}
function buildApiUrl(path) {
    const baseUrl = new URL(API_BASE_URL);
    const url = new URL(path || '/', API_BASE_URL);
    if (url.origin !== baseUrl.origin) {
        throw new n8n_workflow_1.ApplicationError('URL must be a path relative to the BackgroundErase API.');
    }
    return url.toString();
}
function appendProcessingOptions(form, options) {
    form.append('channels', options.channels);
    form.append('format', options.format);
    form.append('size', options.size);
    form.append('crop', String(options.crop));
    form.append('despill', String(options.despill));
    if (options.bgColor) {
        form.append('bg_color', options.bgColor);
    }
}
function hasOwnBody(method, body) {
    return !['GET', 'DELETE'].includes(method) && body !== undefined;
}
function getProcessingOptions(context, itemIndex) {
    const bgColor = context.getNodeParameter('bgColor', itemIndex, '');
    return {
        channels: context.getNodeParameter('channels', itemIndex),
        format: context.getNodeParameter('format', itemIndex),
        size: context.getNodeParameter('size', itemIndex),
        crop: context.getNodeParameter('crop', itemIndex, false),
        despill: context.getNodeParameter('despill', itemIndex, false),
        bgColor: bgColor || undefined,
    };
}
async function requestProcessedImage(context, form, options, outputBaseName, outputBinaryPropertyName, itemIndex, sourceUrl) {
    const response = (await context.helpers.httpRequestWithAuthentication.call(context, 'backgroundEraseApi', {
        method: 'POST',
        url: `${API_BASE_URL}/v2`,
        body: form,
        encoding: 'arraybuffer',
        returnFullResponse: true,
    }));
    const outputBuffer = responseBodyToBuffer(response.body);
    const outputName = buildOutputName(outputBaseName, options);
    const mimeType = outputMimeFor(options, response.headers);
    const binary = {};
    binary[outputBinaryPropertyName] = (await context.helpers.prepareBinaryData(outputBuffer, outputName, mimeType));
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
async function removeBackgroundFromFile(context, itemIndex) {
    var _a;
    const inputBinaryPropertyName = context.getNodeParameter('inputBinaryPropertyName', itemIndex, 'data');
    const outputBinaryPropertyName = context.getNodeParameter('outputBinaryPropertyName', itemIndex, 'data');
    const item = context.getInputData(itemIndex)[0];
    const incomingBinary = (_a = item.binary) === null || _a === void 0 ? void 0 : _a[inputBinaryPropertyName];
    if (!incomingBinary) {
        throw new n8n_workflow_1.NodeOperationError(context.getNode(), `No binary data found on property "${inputBinaryPropertyName}".`, { itemIndex });
    }
    const fileBuffer = await context.helpers.getBinaryDataBuffer(itemIndex, inputBinaryPropertyName);
    const fileNameParameter = context.getNodeParameter('fileName', itemIndex, '');
    const fileName = fileNameParameter || incomingBinary.fileName || 'backgrounderase-input';
    const mimeType = incomingBinary.mimeType || 'application/octet-stream';
    const options = getProcessingOptions(context, itemIndex);
    const fileArrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
    const fileArrayView = new Uint8Array(fileArrayBuffer);
    const form = new FormData();
    fileArrayView.set(fileBuffer);
    form.append('image_file', new Blob([fileArrayBuffer], { type: mimeType }), fileName);
    appendProcessingOptions(form, options);
    return await requestProcessedImage(context, form, options, fileName, outputBinaryPropertyName, itemIndex);
}
async function removeBackgroundFromImageUrl(context, itemIndex) {
    const imageUrl = context.getNodeParameter('imageUrl', itemIndex);
    const outputBaseName = context.getNodeParameter('outputBaseName', itemIndex, 'backgrounderase-image');
    const outputBinaryPropertyName = context.getNodeParameter('outputBinaryPropertyName', itemIndex, 'data');
    const options = getProcessingOptions(context, itemIndex);
    const form = new FormData();
    form.append('image_url', imageUrl);
    appendProcessingOptions(form, options);
    return await requestProcessedImage(context, form, options, outputBaseName, outputBinaryPropertyName, itemIndex, imageUrl);
}
async function makeApiCall(context, itemIndex) {
    const method = context.getNodeParameter('method', itemIndex, 'GET');
    const requestBody = parseJsonParameter(context.getNodeParameter('body', itemIndex, '{}'), 'Body');
    const headers = stripApiKeyHeader(parseJsonParameter(context.getNodeParameter('headers', itemIndex, '{}'), 'Headers'));
    const qs = parseJsonParameter(context.getNodeParameter('qs', itemIndex, '{}'), 'Query String');
    const requestOptions = {
        method: method,
        url: buildApiUrl(context.getNodeParameter('url', itemIndex)),
        headers,
        qs,
        returnFullResponse: true,
        json: true,
    };
    if (hasOwnBody(method, requestBody)) {
        requestOptions.body = requestBody;
    }
    const response = (await context.helpers.httpRequestWithAuthentication.call(context, 'backgroundEraseApi', requestOptions));
    return {
        json: {
            body: response.body,
            headers: response.headers || {},
            statusCode: response.statusCode,
        },
        pairedItem: {
            item: itemIndex,
        },
    };
}
class BackgroundErase {
    constructor() {
        this.description = {
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
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
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
                            description: 'Download an image from a public or signed URL and return the processed image',
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
                    description: 'Optional output filename base. If left blank, n8n uses the incoming binary filename.',
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
                    description: 'A publicly reachable URL or signed URL for the image to process. Private URLs may fail.',
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
                    description: 'PNG is recommended for transparent output. Alpha mask output is always returned as PNG.',
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
                    description: 'Optional. Use a hex color like #FFFFFF or a named color like white. Leave empty for transparent output.',
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
                    description: 'Optional JSON object. Do not include x-api-key; n8n adds it from the credential.',
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
                    description: 'Optional JSON request body. Use the dedicated image operations for normal background removal workflows.',
                },
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnItems = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const operation = this.getNodeParameter('operation', itemIndex);
                if (operation === 'removeBackgroundFromFile') {
                    returnItems.push(await removeBackgroundFromFile(this, itemIndex));
                }
                else if (operation === 'removeBackgroundFromImageUrl') {
                    returnItems.push(await removeBackgroundFromImageUrl(this, itemIndex));
                }
                else {
                    returnItems.push(await makeApiCall(this, itemIndex));
                }
            }
            catch (error) {
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
                if (error instanceof n8n_workflow_1.NodeApiError || error instanceof n8n_workflow_1.NodeOperationError)
                    throw error;
                if (isHttpRequestError(error)) {
                    throw new n8n_workflow_1.NodeApiError(this.getNode(), error, { itemIndex });
                }
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, { itemIndex });
            }
        }
        return [returnItems];
    }
}
exports.BackgroundErase = BackgroundErase;
//# sourceMappingURL=BackgroundErase.node.js.map