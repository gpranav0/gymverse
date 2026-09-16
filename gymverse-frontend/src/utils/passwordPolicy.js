// Mirrors the backend's passwordRule, so people are told here instead of after a round trip.
export const passwordProblem = (password) => {
  if (!password || password.length < 8) return 'Password must be at least 8 characters long';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
};
