/**
 * Basic arithmetic utilities.
 * @module demo
 */

/**
 * Adds two numbers.
 *
 * @param {number} a - First addend.
 * @param {number} b - Second addend.
 * @returns {number} Sum of a and b.
 */
function add(a, b) {
  return a + b;
}

/**
 * Subtracts b from a.
 *
 * @param {number} a - Minuend.
 * @param {number} b - Subtrahend.
 * @returns {number} Difference a - b.
 */
function subtract(a, b) {
  return a - b;
}

/**
 * Alias for subtract.
 * @type {function(number, number): number}
 */
const minus = subtract;

/**
 * Multiplies two numbers.
 *
 * @param {number} a - First factor.
 * @param {number} b - Second factor.
 * @returns {number} Product of a and b.
 */
function multiply(a, b) {
  return a * b;
}

console.log('add(1, 2) =', add(1, 2));
console.log('subtract(5, 3) =', subtract(5, 3));
console.log('minus(10, 4) =', minus(10, 4));
console.log('multiply(3, 4) =', multiply(3, 4));
