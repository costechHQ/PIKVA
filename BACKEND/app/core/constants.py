"""Shared constants used across the Pikva backend."""

# Daily pickup codes: 32 unambiguous characters (no 0/O/1/I), 8 per code.
PICKUP_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
PICKUP_CODE_LENGTH = 8

# Login rate limits (SRS 11.3): failed attempts per email, all attempts per IP.
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_FAILURE_LIMIT = 5
LOGIN_IP_LIMIT = 30

# Gate rate limit (SRS 11.3): verify and release calls share one budget per staff member.
GATE_WINDOW_SECONDS = 60
GATE_STAFF_LIMIT = 30

# Code request rate limit (SRS 11.3): every request counts, per parent.
CODE_REQUEST_WINDOW_SECONDS = 60 * 60
CODE_REQUEST_LIMIT = 10

# Registration rate limit: every attempt counts, per IP.
REGISTER_WINDOW_SECONDS = 60 * 60
REGISTER_IP_LIMIT = 5
