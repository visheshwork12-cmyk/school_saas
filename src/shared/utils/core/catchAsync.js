// src/shared/utils/core/catchAsync.js

/**
 * @description Wrapper for async functions to catch errors and pass to next.
 * 
 * @param {Function} fn - The async function to wrap.
 * @returns {Function} Wrapped function.
 * 
 * @example
 * const getData = catchAsync(async (req, res) => { ... });
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

export default catchAsync;