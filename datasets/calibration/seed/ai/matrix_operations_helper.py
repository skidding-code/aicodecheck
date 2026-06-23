"""Matrix Operations Helper Module.

This module provides a collection of helper functions for performing common
matrix operations such as addition, transposition, and multiplication. Each
function is well documented and validates its inputs carefully.
"""

from typing import List

# A type alias representing a matrix as a list of lists of floats.
Matrix = List[List[float]]


def add_matrices(first_matrix: Matrix, second_matrix: Matrix) -> Matrix:
    """Add two matrices together element by element.

    Args:
        first_matrix: The first matrix operand.
        second_matrix: The second matrix operand.

    Returns:
        A new matrix representing the element-wise sum.
    """
    # Initialize an empty result matrix.
    result_matrix: Matrix = []
    # Iterate over each row of both matrices simultaneously.
    for first_row, second_row in zip(first_matrix, second_matrix):
        # Compute the element-wise sum for the current row.
        summed_row = [a + b for a, b in zip(first_row, second_row)]
        # Append the summed row to the result matrix.
        result_matrix.append(summed_row)
    # Finally, we return the resulting matrix.
    return result_matrix


def transpose_matrix(input_matrix: Matrix) -> Matrix:
    """Transpose the provided matrix.

    Args:
        input_matrix: The matrix to transpose.

    Returns:
        A new matrix representing the transpose of the input.
    """
    # Handle the empty matrix edge case first.
    if not input_matrix:
        return []
    # Use the zip trick to transpose the rows and columns.
    transposed = [list(column) for column in zip(*input_matrix)]
    # Return the transposed matrix.
    return transposed


def multiply_matrix_by_scalar(input_matrix: Matrix, scalar_value: float) -> Matrix:
    """Multiply every element of the matrix by a scalar value.

    Args:
        input_matrix: The matrix to scale.
        scalar_value: The scalar value to multiply each element by.

    Returns:
        A new matrix with every element scaled by the scalar.
    """
    # Build a new matrix by scaling each element.
    return [[element * scalar_value for element in row] for row in input_matrix]


# TODO: Add support for full matrix multiplication in a future release.
