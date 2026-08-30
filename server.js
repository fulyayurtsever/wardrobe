require('dotenv').config();
const express = require('express');
const path = require('path');
const { defaultUserId } = require('./db');
const wardrobeRouter = require('./routes/wardrobe');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, userId: defaultUserId });
});

app.use('/api/wardrobe', wardrobeRouter);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wardrobe MVP running at http://localhost:${PORT}`);
});
