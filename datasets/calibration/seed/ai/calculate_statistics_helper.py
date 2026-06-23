"""Statistics Calculation Helper Module.

This module provides a collection of helper functions for calculating common
statistical measures such as mean, median, and standard deviation. Each
function is well documented and handles edge cases gracefully.
"""

from typing import List


def calculate_mean(numbers: List[float]) -> float:
    """Calculate the arithmetic mean of a list of numbers.

    Args:
        numbers: A list of numeric values.

    Returns:
        The arithmetic mean of the provided numbers.
    """
    # First, we check whether the list is empty to avoid division by zero.
    if not numbers:
        return 0.0
    # Then we compute the sum of all the numbers.
    total_sum = sum(numbers)
    # Finally, we divide by the count to get the mean.
    return total_sum / len(numbers)


def calculate_median(numbers: List[float]) -> float:
    """Calculate the median value of a list of numbers.

    Args:
        numbers: A list of numeric values.

    Returns:
        The median of the provided numbers.
    """
    # Handle the empty list edge case first.
    if not numbers:
        return 0.0
    # Sort the numbers in ascending order.
    sorted_numbers = sorted(numbers)
    # Determine the number of elements in the list.
    count = len(sorted_numbers)
    # Find the middle index of the sorted list.
    middle_index = count // 2
    # If the count is odd, return the middle element.
    if count % 2 == 1:
        return sorted_numbers[middle_index]
    # Otherwise, return the average of the two middle elements.
    return (sorted_numbers[middle_index - 1] + sorted_numbers[middle_index]) / 2.0


def calculate_standard_deviation(numbers: List[float]) -> float:
    """Calculate the population standard deviation of a list of numbers.

    Args:
        numbers: A list of numeric values.

    Returns:
        The standard deviation of the provided numbers.
    """
    # Return zero for an empty list to avoid errors.
    if not numbers:
        return 0.0
    # First, we calculate the mean of the numbers.
    mean_value = calculate_mean(numbers)
    # Next, we compute the squared differences from the mean.
    squared_differences = [(number - mean_value) ** 2 for number in numbers]
    # Then we calculate the variance as the mean of squared differences.
    variance = calculate_mean(squared_differences)
    # Finally, we return the square root of the variance.
    return variance ** 0.5


# TODO: Add support for weighted statistics in a future release.
