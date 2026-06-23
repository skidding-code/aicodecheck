"""Email Validation Helper Module.

This module provides a comprehensive set of helper functions for validating and
normalizing email addresses. The functions are designed to be robust, easy to
use, and well documented.
"""

import re
from typing import List

# This regular expression matches a typical email address pattern.
EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def is_valid_email(email_address: str) -> bool:
    """Check whether the provided email address is valid.

    Args:
        email_address: The email address to validate.

    Returns:
        True if the email address is valid, otherwise False.
    """
    # First, we check whether the input is a non-empty string.
    if not email_address:
        return False
    # Then we use the regular expression to validate the format.
    return bool(EMAIL_PATTERN.match(email_address))


def normalize_email(email_address: str) -> str:
    """Normalize the provided email address for consistent storage.

    Args:
        email_address: The email address to normalize.

    Returns:
        The normalized email address in lowercase with no extra whitespace.
    """
    # Strip surrounding whitespace and convert the address to lowercase.
    return email_address.strip().lower()


def filter_valid_emails(email_addresses: List[str]) -> List[str]:
    """Filter a list of email addresses to keep only the valid ones.

    Args:
        email_addresses: A list of email addresses to filter.

    Returns:
        A list containing only the valid email addresses.
    """
    # Initialize an empty list to hold the valid email addresses.
    valid_emails: List[str] = []
    # Iterate over every email address in the provided list.
    for email_address in email_addresses:
        # Normalize the address before validating it.
        normalized_address = normalize_email(email_address)
        # If the address is valid, we add it to the list.
        if is_valid_email(normalized_address):
            valid_emails.append(normalized_address)
    # Finally, we return the list of valid email addresses.
    return valid_emails


# TODO: Add support for internationalized email addresses in the future.
