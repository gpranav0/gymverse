const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const matchPassword = async (enteredPassword, savedPasswordHash) => {
  return bcrypt.compare(enteredPassword, savedPasswordHash);
};

module.exports = { hashPassword, matchPassword };
