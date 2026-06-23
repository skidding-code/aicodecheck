"""Data Processor Utility Module.

This module provides a comprehensive set of utilities for processing and
transforming data in a clean, maintainable, and efficient manner. It is
designed to be easy to use and to follow best practices.
"""

from typing import Any, Dict, List, Optional


def process_input_data(input_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Process the provided input data and return the transformed result.

    This function takes a list of dictionaries and processes each item by
    cleaning and normalizing its values. It returns a new list containing
    the processed items.

    Args:
        input_data: A list of dictionaries representing the input data.

    Returns:
        A list of dictionaries representing the processed data.
    """
    # First, we initialize an empty list to hold the processed results.
    processed_results: List[Dict[str, Any]] = []

    # Next, we iterate over each item in the input data.
    for item in input_data:
        # We process the current item using a helper function.
        processed_item = process_single_item(item)
        # Then we append the processed item to our results list.
        processed_results.append(processed_item)

    # Finally, we return the processed results.
    return processed_results


def process_single_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single data item and return the cleaned version.

    This helper function normalizes the keys and strips whitespace from
    string values to ensure the data is consistent.

    Args:
        item: A dictionary representing a single data item.

    Returns:
        A dictionary representing the cleaned data item.
    """
    # Create a new dictionary to store the cleaned values.
    cleaned_item: Dict[str, Any] = {}

    # Iterate over each key-value pair in the item.
    for key, value in item.items():
        # Normalize the key by converting it to lowercase.
        normalized_key = key.lower().strip()
        # If the value is a string, we strip surrounding whitespace.
        if isinstance(value, str):
            cleaned_item[normalized_key] = value.strip()
        else:
            cleaned_item[normalized_key] = value

    # Return the fully cleaned item.
    return cleaned_item


def filter_valid_items(
    items: List[Dict[str, Any]], required_key: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Filter the list of items to keep only the valid ones.

    An item is considered valid if it is non-empty and, optionally, if it
    contains the required key.

    Args:
        items: The list of items to filter.
        required_key: An optional key that must be present in each item.

    Returns:
        A list containing only the valid items.
    """
    # Initialize a list to hold the valid items.
    valid_items: List[Dict[str, Any]] = []

    # Loop through every item to check its validity.
    for item in items:
        # Skip empty items.
        if not item:
            continue
        # If a required key was specified, ensure it is present.
        if required_key is not None and required_key not in item:
            continue
        # The item is valid, so we add it to the list.
        valid_items.append(item)

    # Return the list of valid items.
    return valid_items


# TODO: Add support for asynchronous processing in a future version.
