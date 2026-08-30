const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const FIELD_NAMES = [
  'name', 'category', 'subcategory', 'color', 'pattern', 'material',
  'fit', 'style', 'season', 'occasion', 'formality', 'brand',
];

const RECORD_TOOL = {
  name: 'record_wardrobe_item',
  description: 'Record structured metadata describing the clothing item shown in the image.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: ['string', 'null'], description: 'Short concise item name, e.g. "Blue Denim Jacket".' },
      category: { type: ['string', 'null'], description: 'Broad category, e.g. Top, Bottom, Dress, Outerwear, Footwear, Accessory.' },
      subcategory: { type: ['string', 'null'], description: 'More specific type, e.g. T-shirt, Jeans, Sneakers.' },
      color: { type: ['string', 'null'], description: 'Dominant color(s).' },
      pattern: { type: ['string', 'null'], description: 'Pattern, e.g. Solid, Striped, Floral, Plaid.' },
      material: { type: ['string', 'null'], description: 'Fabric/material if visually identifiable.' },
      fit: { type: ['string', 'null'], description: 'Fit, e.g. Slim, Regular, Oversized.' },
      style: { type: ['string', 'null'], description: 'Style descriptor, e.g. Casual, Streetwear, Formal.' },
      season: { type: ['string', 'null'], description: 'Season(s) suited for, e.g. "Fall, Winter".' },
      occasion: { type: ['string', 'null'], description: 'Occasion(s), e.g. Work, Everyday, Party.' },
      formality: { type: ['string', 'null'], description: 'Formality level, e.g. Casual, Smart Casual, Formal.' },
      brand: { type: ['string', 'null'], description: 'Brand name only if clearly visible (logo/tag), otherwise null.' },
    },
    required: FIELD_NAMES,
  },
};

const SYSTEM_PROMPT = `You are a precise clothing-cataloging assistant. Look at the provided image of a single clothing item and call the record_wardrobe_item tool with structured metadata about it.

Rules:
- Only report what you can visually confirm from the image.
- If a field cannot be determined with reasonable confidence, use null. Never guess or invent details, especially for "brand".
- Keep values short (a few words), not full sentences.
- Call the tool exactly once.`;

/**
 * Classify a clothing image using the configured Anthropic vision model.
 * @param {Buffer} imageBuffer
 * @param {string} mediaType e.g. 'image/jpeg'
 * @returns {Promise<Record<string, string|null>>}
 */
async function classifyImage(imageBuffer, mediaType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_wardrobe_item' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') },
          },
          { type: 'text', text: 'Classify this clothing item.' },
        ],
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || typeof toolUse.input !== 'object') {
    throw new Error('AI response did not include structured metadata.');
  }

  const result = {};
  for (const field of FIELD_NAMES) {
    const value = toolUse.input[field];
    result[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  return result;
}

module.exports = { classifyImage, FIELD_NAMES };
