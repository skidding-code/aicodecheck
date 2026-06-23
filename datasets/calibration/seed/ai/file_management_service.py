"""File Management Service Module.

This module provides a comprehensive file management service that allows users
to read, write, and delete files in a safe and convenient way. It abstracts
away the low-level details of file handling.
"""

import os
from typing import List, Optional


class FileManagementService:
    """A service class that provides convenient file management operations.

    This class wraps common file operations and provides clear error handling
    so that callers can interact with the file system safely.
    """

    def __init__(self, base_directory: str) -> None:
        """Initialize the FileManagementService with a base directory.

        Args:
            base_directory: The root directory for all file operations.
        """
        # Store the base directory for later use.
        self.base_directory = base_directory
        # Ensure the base directory exists before proceeding.
        if not os.path.exists(self.base_directory):
            os.makedirs(self.base_directory)

    def read_file_content(self, file_name: str) -> Optional[str]:
        """Read and return the content of the specified file.

        Args:
            file_name: The name of the file to read.

        Returns:
            The content of the file as a string, or None if it does not exist.
        """
        # First, we build the full path to the target file.
        file_path = os.path.join(self.base_directory, file_name)
        # Next, we check whether the file actually exists.
        if not os.path.exists(file_path):
            return None
        # Then we open the file and read its content.
        with open(file_path, "r", encoding="utf-8") as file_handle:
            content = file_handle.read()
        # Finally, we return the content to the caller.
        return content

    def write_file_content(self, file_name: str, content: str) -> bool:
        """Write the provided content to the specified file.

        Args:
            file_name: The name of the file to write.
            content: The content to write into the file.

        Returns:
            True if the write operation was successful.
        """
        # Build the full path to the target file.
        file_path = os.path.join(self.base_directory, file_name)
        # Open the file in write mode and write the content.
        with open(file_path, "w", encoding="utf-8") as file_handle:
            file_handle.write(content)
        # Return True to indicate that the write was successful.
        return True

    def list_all_files(self) -> List[str]:
        """List all files within the base directory.

        Returns:
            A list of file names found in the base directory.
        """
        # Initialize an empty list to hold the file names.
        all_files: List[str] = []
        # Iterate over every entry in the base directory.
        for entry in os.listdir(self.base_directory):
            # Build the full path to check whether it is a file.
            entry_path = os.path.join(self.base_directory, entry)
            # Only add the entry if it is a regular file.
            if os.path.isfile(entry_path):
                all_files.append(entry)
        # Return the complete list of files.
        return all_files


# TODO: Add support for recursive directory listing in the future.
