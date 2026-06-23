/**
 * Temperature Converter Module.
 *
 * This module provides a set of utility functions for converting temperatures
 * between Celsius, Fahrenheit, and Kelvin. Each function is fully typed and
 * documented for ease of use.
 */

/**
 * Converts a temperature from Celsius to Fahrenheit.
 *
 * @param celsiusValue - The temperature in degrees Celsius.
 * @returns The equivalent temperature in degrees Fahrenheit.
 */
export function convertCelsiusToFahrenheit(celsiusValue: number): number {
  // We apply the standard conversion formula and return the result.
  return celsiusValue * (9 / 5) + 32;
}

/**
 * Converts a temperature from Fahrenheit to Celsius.
 *
 * @param fahrenheitValue - The temperature in degrees Fahrenheit.
 * @returns The equivalent temperature in degrees Celsius.
 */
export function convertFahrenheitToCelsius(fahrenheitValue: number): number {
  // We apply the standard conversion formula and return the result.
  return (fahrenheitValue - 32) * (5 / 9);
}

/**
 * Converts a temperature from Celsius to Kelvin.
 *
 * @param celsiusValue - The temperature in degrees Celsius.
 * @returns The equivalent temperature in Kelvin.
 */
export function convertCelsiusToKelvin(celsiusValue: number): number {
  // Kelvin is simply Celsius plus the absolute zero offset.
  return celsiusValue + 273.15;
}

/**
 * Converts a temperature from Kelvin to Celsius.
 *
 * @param kelvinValue - The temperature in Kelvin.
 * @returns The equivalent temperature in degrees Celsius.
 */
export function convertKelvinToCelsius(kelvinValue: number): number {
  // Subtract the absolute zero offset to get Celsius.
  return kelvinValue - 273.15;
}

// TODO: Add support for the Rankine temperature scale in the future.
