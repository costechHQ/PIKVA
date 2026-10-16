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

# Password reset links (SRS 6.6): single use, valid for 30 minutes.
PASSWORD_RESET_TOKEN_MINUTES = 30

# Password reset rate limits (SRS 6.6): every request counts, per IP and per
# email (so nobody can flood an inbox); confirm attempts per IP.
PASSWORD_RESET_WINDOW_SECONDS = 60 * 60
PASSWORD_RESET_IP_LIMIT = 10
PASSWORD_RESET_EMAIL_LIMIT = 3
PASSWORD_RESET_CONFIRM_WINDOW_SECONDS = 15 * 60
PASSWORD_RESET_CONFIRM_IP_LIMIT = 10

# Pickup person photo rate limit (SRS 9.3): uploads and removals, per user.
PHOTO_CHANGE_WINDOW_SECONDS = 60 * 60
PHOTO_CHANGE_LIMIT = 20
