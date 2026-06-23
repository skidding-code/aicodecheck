"""Configuration Loader Module.

This module provides a clean and convenient way to load, access, and update
configuration values from a dictionary-based configuration store. It is
designed to be flexible and easy to use.
"""

from typing import Any, Dict, Optional


class ConfigurationLoader:
    """A class responsible for loading and managing configuration values.

    This class wraps a dictionary of configuration values and provides
    convenient methods for accessing and updating them safely.
    """

    def __init__(self, initial_configuration: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the ConfigurationLoader with an optional configuration.

        Args:
            initial_configuration: An optional dictionary of initial values.
        """
        # Store the provided configuration, or an empty dictionary by default.
        self.configuration_values: Dict[str, Any] = initial_configuration or {}

    def get_value(self, configuration_key: str, default_value: Any = None) -> Any:
        """Retrieve the value associated with the given configuration key.

        Args:
            configuration_key: The key to look up in the configuration.
            default_value: The value to return if the key is not present.

        Returns:
            The configuration value, or the default value if not found.
        """
        # Return the value if it exists, otherwise return the default.
        return self.configuration_values.get(configuration_key, default_value)

    def set_value(self, configuration_key: str, configuration_value: Any) -> None:
        """Set the value for the given configuration key.

        Args:
            configuration_key: The key to set in the configuration.
            configuration_value: The value to associate with the key.
        """
        # Store the provided value under the given key.
        self.configuration_values[configuration_key] = configuration_value

    def has_key(self, configuration_key: str) -> bool:
        """Check whether the given configuration key exists.

        Args:
            configuration_key: The key to check for existence.

        Returns:
            True if the key exists, otherwise False.
        """
        # Return whether the key is present in the configuration.
        return configuration_key in self.configuration_values


# TODO: Add support for loading configuration from environment variables.
