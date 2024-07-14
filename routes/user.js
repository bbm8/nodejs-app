const express = require('express');

const router = express.Router();

// GET /user Router
router.get('/', (req, res) => {
  res.render('user', { title: 'User Information' });
});

module.exports = router;
