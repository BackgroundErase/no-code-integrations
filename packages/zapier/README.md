# BackgroundErase Zapier Integration

Zapier CLI integration for the BackgroundErase background removal API.

The app uses the production API at `https://api.backgrounderase.com` and authenticates with the `x-api-key` header. The dedicated image actions call `POST /v2` with `multipart/form-data`, matching the Make.com integration structure.

## Actions

### Remove Background from File

Use this when a previous Zap step provides a file object, such as Google Drive, Dropbox, OneDrive, an email attachment, or an HTTP download.

Inputs:

- `file_name`
- `file_data`
- `channels`
- `format`
- `size`
- `crop`
- `despill`
- `bg_color`

Outputs:

- `name`
- `data`
- `mime_type`
- `billing_model`
- `usage_unit`
- `billable_units`

### Remove Background from Image URL

Use this when the workflow already has a public or signed image URL, such as an Airtable attachment URL, Shopify product image URL, Webflow CMS image URL, or webhook payload.

The URL must be reachable by BackgroundErase's backend. Private Google Drive links, expired signed URLs, login-protected URLs, or internal network URLs may fail. Use Remove Background from File for those cases.

Inputs:

- `image_url`
- `output_base_name`
- `channels`
- `format`
- `size`
- `crop`
- `despill`
- `bg_color`

Outputs:

- `name`
- `data`
- `mime_type`
- `billing_model`
- `usage_unit`
- `billable_units`
- `source_url`

### Make an API Call

Advanced action for calling authorized BackgroundErase API endpoints directly. Use `/v2/account` for a quick smoke test.

## Local Development

```bash
cd packages/zapier
npm install
npm test
npm run validate
```

To test auth locally with the Zapier CLI:

```bash
zapier-platform invoke auth test
```

To run the image URL action locally:

```bash
zapier-platform invoke create removeBackgroundFromUrl --inputData '{"image_url":"https://example.com/image.jpg","channels":"rgba","format":"png","size":"full"}'
```

## Billing Language

BackgroundErase uses metered monthly billing. Each successfully processed image is counted as one billable image. The action output includes `billing_model`, `usage_unit`, and `billable_units` so teams can understand how Zap runs map to BackgroundErase usage.

Do not use credits language for this integration.
