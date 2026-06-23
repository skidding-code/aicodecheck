/**
 * Calculator Service Class.
 *
 * This class provides a clean and robust implementation of a calculator
 * service that supports basic arithmetic operations such as addition,
 * subtraction, multiplication, and division. It is designed to be easy to use
 * and maintain.
 */

public class CalculatorService {

    /**
     * Adds two numbers together and returns the result.
     *
     * @param firstNumber   the first number to add
     * @param secondNumber  the second number to add
     * @return the sum of the two numbers
     */
    public double addNumbers(double firstNumber, double secondNumber) {
        // Simply add the two numbers and return the result.
        return firstNumber + secondNumber;
    }

    /**
     * Subtracts the second number from the first and returns the result.
     *
     * @param firstNumber   the number to subtract from
     * @param secondNumber  the number to subtract
     * @return the difference of the two numbers
     */
    public double subtractNumbers(double firstNumber, double secondNumber) {
        // Subtract the second number from the first and return the result.
        return firstNumber - secondNumber;
    }

    /**
     * Multiplies two numbers together and returns the result.
     *
     * @param firstNumber   the first number to multiply
     * @param secondNumber  the second number to multiply
     * @return the product of the two numbers
     */
    public double multiplyNumbers(double firstNumber, double secondNumber) {
        // Multiply the two numbers and return the result.
        return firstNumber * secondNumber;
    }

    /**
     * Divides the first number by the second and returns the result.
     *
     * @param firstNumber   the dividend
     * @param secondNumber  the divisor
     * @return the quotient of the two numbers
     * @throws IllegalArgumentException if the divisor is zero
     */
    public double divideNumbers(double firstNumber, double secondNumber) {
        // First, we validate that the divisor is not zero.
        if (secondNumber == 0) {
            throw new IllegalArgumentException("Cannot divide by zero.");
        }
        // Then we divide the first number by the second and return the result.
        return firstNumber / secondNumber;
    }

    // TODO: Add support for advanced operations such as exponentiation.
}
