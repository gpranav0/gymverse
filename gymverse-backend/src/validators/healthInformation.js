const { body } = require('express-validator');

const healthConditionsRule = () => body('health_conditions')
  .optional({ values: 'null' })
  .isString().withMessage('Health information must be text').bail()
  .trim()
  .isLength({ max: 1000 }).withMessage('Health information must be at most 1000 characters')
  .customSanitizer(value => value || null);

module.exports = { healthConditionsRule };
