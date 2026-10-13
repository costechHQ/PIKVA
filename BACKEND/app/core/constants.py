"""Shared constants used across the Pikva backend."""

# Daily pickup codes: 32 unambiguous characters (no 0/O/1/I), 8 per code.
PICKUP_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
PICKUP_CODE_LENGTH = 8

# Login rate limits (SRS 11.3): failed attempts per email, all attempts per IP.
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_FAILURE_LIMIT = 5
LOGIN_IP_LIMIT = 30
