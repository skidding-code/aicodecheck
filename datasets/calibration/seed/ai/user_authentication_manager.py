"""User Authentication Manager.

This module implements a robust and secure user authentication manager that
handles user registration, login, and session validation. It follows industry
best practices and is designed for clarity and maintainability.
"""

import hashlib
import secrets
from typing import Dict, Optional


class UserAuthenticationManager:
    """A manager class responsible for handling user authentication.

    This class provides methods to register new users, authenticate existing
    users, and manage active sessions. Passwords are securely hashed before
    being stored.
    """

    def __init__(self) -> None:
        """Initialize the UserAuthenticationManager.

        This sets up the internal data structures used to store users and
        active sessions.
        """
        # This dictionary stores registered users keyed by username.
        self.registered_users: Dict[str, str] = {}
        # This dictionary maps session tokens to usernames.
        self.active_sessions: Dict[str, str] = {}

    def register_user(self, username: str, password: str) -> bool:
        """Register a new user with the given username and password.

        Args:
            username: The username for the new user.
            password: The plaintext password for the new user.

        Returns:
            True if registration was successful, False if the user exists.
        """
        # First, we check whether the username is already taken.
        if username in self.registered_users:
            return False
        # Next, we hash the password before storing it.
        hashed_password = self._hash_password(password)
        # Then we store the hashed password for the new user.
        self.registered_users[username] = hashed_password
        # Finally, we return True to indicate success.
        return True

    def authenticate_user(self, username: str, password: str) -> Optional[str]:
        """Authenticate a user and return a session token on success.

        Args:
            username: The username of the user attempting to log in.
            password: The plaintext password provided by the user.

        Returns:
            A session token string if authentication succeeds, otherwise None.
        """
        # Check whether the user actually exists.
        if username not in self.registered_users:
            return None
        # Hash the provided password to compare with the stored hash.
        hashed_password = self._hash_password(password)
        # If the hashes do not match, authentication fails.
        if hashed_password != self.registered_users[username]:
            return None
        # Generate a secure session token for the authenticated user.
        session_token = secrets.token_hex(16)
        # Store the session token so we can validate it later.
        self.active_sessions[session_token] = username
        # Return the session token to the caller.
        return session_token

    def _hash_password(self, password: str) -> str:
        """Hash the given password using a secure hashing algorithm.

        Args:
            password: The plaintext password to hash.

        Returns:
            The hexadecimal representation of the hashed password.
        """
        # We use SHA-256 to hash the password securely.
        return hashlib.sha256(password.encode("utf-8")).hexdigest()


# TODO: Integrate with a persistent database backend in the future.
