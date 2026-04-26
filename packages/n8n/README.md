# @backgrounderase/n8n-nodes-backgrounderase

n8n community node for the BackgroundErase background removal API.

The node uses `https://api.backgrounderase.com`, authenticates with the `x-api-key` header, and sends the dedicated image operations to `POST /v2` as `multipart/form-data`.

## Operations

### Remove Background From File

Use this when a previous n8n node provides binary image data, such as Google Drive, Dropbox, an email attachment, a webhook upload, or an HTTP Request download.

Inputs:

- `Input Binary Property`
- `File Name`
- `Output Binary Property`
- `Output Type`
- `Output Format`
- `Size`
- `Crop to Subject`
- `Remove Green Spill`
- `Background Color`

Outputs:

- JSON metadata: `name`, `mime_type`, `billing_model`, `usage_unit`, `billable_units`
- Binary image data on the configured output binary property

### Remove Background From Image URL

Use this when the workflow already has a public or signed image URL, such as an Airtable attachment URL, Shopify product image URL, Webflow CMS image URL, Google Sheets row value, or webhook payload.

The URL must be reachable by BackgroundErase's backend. Private Google Drive links, expired signed URLs, login-protected URLs, or internal network URLs may fail. Use Remove Background From File for those cases.

Inputs:

- `Image URL`
- `Output Base Name`
- `Output Binary Property`
- `Output Type`
- `Output Format`
- `Size`
- `Crop to Subject`
- `Remove Green Spill`
- `Background Color`

Outputs:

- JSON metadata: `name`, `mime_type`, `billing_model`, `usage_unit`, `billable_units`, `source_url`
- Binary image data on the configured output binary property

### Make an API Call

Advanced operation for calling authorized BackgroundErase API endpoints directly. Use `/v2/account` for a quick smoke test.

## Local Development

```bash
cd packages/n8n
nvm use
npm install
npm run build
npm run lint
npm run dev
```

`npm run dev` starts a local n8n instance with this node loaded. Open `http://localhost:5678`, add the BackgroundErase node to a workflow, create a BackgroundErase API credential, and test each operation.

Published package name:

```text
@backgrounderase/n8n-nodes-backgrounderase
```

## Billing Language

BackgroundErase uses metered monthly billing. Each successfully processed image is counted as one billable image. The node output includes `billing_model`, `usage_unit`, and `billable_units` so teams can understand how workflow executions map to BackgroundErase usage.

Do not use credits language for this integration.
