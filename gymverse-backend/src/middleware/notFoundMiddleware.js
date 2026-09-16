const { AppError } = require('../utils/AppError');

const notFound = (req, res, next) => {
  next(new AppError(`Not Found - ${req.method} ${req.originalUrl}`, 404));
};

module.exports = { notFound };
