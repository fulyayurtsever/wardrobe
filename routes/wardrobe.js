const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { db, defaultUserId } = require('../db');
const { classifyImage, FIELD_NAMES } = require('../lib/classify');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('UNSUPPORTED_IMAGE_TYPE'));
    }
  },
});

const router = express.Router();

const EDITABLE_FIELDS = ['name', ...FIELD_NAMES.filter((f) => f !== 'name')];

function selectItem(id) {
  return db
    .prepare('SELECT * FROM wardrobe_items WHERE id = ? AND user_id = ?')
    .get(id, defaultUserId);
}

router.get('/', (req, res) => {
  try {
    const items = db
      .prepare('SELECT * FROM wardrobe_items WHERE user_id = ? ORDER BY created_at DESC')
      .all(defaultUserId);
    res.json({ items });
  } catch (err) {
    console.error('Failed to list wardrobe items:', err);
    res.status(500).json({ error: 'Could not load wardrobe items.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const item = selectItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    res.json({ item });
  } catch (err) {
    console.error('Failed to fetch wardrobe item:', err);
    res.status(500).json({ error: 'Could not load item.' });
  }
});

router.post('/', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message =
        uploadErr.message === 'UNSUPPORTED_IMAGE_TYPE'
          ? 'Unsupported image type. Please upload a JPEG, PNG, or WEBP image.'
          : uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large (max 8MB).'
          : 'Could not process the uploaded file.';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image was uploaded.' });
    }

    const { buffer, mimetype } = req.file;
    const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');

    let existing;
    try {
      existing = db
        .prepare('SELECT * FROM wardrobe_items WHERE user_id = ? AND image_hash = ?')
        .get(defaultUserId, imageHash);
    } catch (err) {
      console.error('Database error while checking for duplicates:', err);
      return res.status(500).json({ error: 'Database error while saving item.' });
    }

    if (existing) {
      return res.status(200).json({ item: existing, duplicate: true });
    }

    const ext = ALLOWED_MIME_TO_EXT[mimetype];
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    try {
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      console.error('Failed to save uploaded image:', err);
      return res.status(500).json({ error: 'Could not save the uploaded image.' });
    }

    let metadata = null;
    let aiStatus = 'ok';
    let aiError = null;
    try {
      metadata = await classifyImage(buffer, mimetype);
    } catch (err) {
      console.error('AI classification failed:', err);
      aiStatus = 'failed';
      aiError = 'AI classification failed. You can fill in details manually.';
      metadata = Object.fromEntries(FIELD_NAMES.map((f) => [f, null]));
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const imagePath = `/uploads/${filename}`;

    try {
      db.prepare(
        `INSERT INTO wardrobe_items
          (id, user_id, image_path, image_hash, name, category, subcategory, color, pattern,
           material, fit, style, season, occasion, formality, brand, ai_status, ai_error, created_at, updated_at)
         VALUES (@id, @user_id, @image_path, @image_hash, @name, @category, @subcategory, @color, @pattern,
           @material, @fit, @style, @season, @occasion, @formality, @brand, @ai_status, @ai_error, @created_at, @updated_at)`
      ).run({
        id,
        user_id: defaultUserId,
        image_path: imagePath,
        image_hash: imageHash,
        ...metadata,
        ai_status: aiStatus,
        ai_error: aiError,
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      console.error('Database error while saving wardrobe item:', err);
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        /* best effort cleanup */
      }
      return res.status(500).json({ error: 'Database error while saving item.' });
    }

    const item = selectItem(id);
    res.status(201).json({ item, warning: aiStatus === 'failed' ? aiError : undefined });
  });
});

router.patch('/:id', (req, res) => {
  try {
    const item = selectItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const value = req.body[field];
        updates[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No editable fields provided.' });
    }

    const setClause = Object.keys(updates)
      .map((field) => `${field} = @${field}`)
      .join(', ');

    db.prepare(
      `UPDATE wardrobe_items SET ${setClause}, updated_at = @updated_at WHERE id = @id AND user_id = @user_id`
    ).run({ ...updates, updated_at: new Date().toISOString(), id: item.id, user_id: defaultUserId });

    res.json({ item: selectItem(item.id) });
  } catch (err) {
    console.error('Failed to update wardrobe item:', err);
    res.status(500).json({ error: 'Could not save changes.' });
  }
});

module.exports = router;
