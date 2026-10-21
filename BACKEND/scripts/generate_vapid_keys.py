"""Make the key pair for push notifications (SRS 13) and print it for .env.

    uv run python scripts/generate_vapid_keys.py

Run once per environment. Keep VAPID_PRIVATE_KEY secret. Changing the pair
later stops every saved subscription working until admins turn
notifications on again.
"""

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02, b64urlencode

vapid = Vapid02()
vapid.generate_keys()

private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
public = vapid.public_key.public_bytes(
    serialization.Encoding.X962,
    serialization.PublicFormat.UncompressedPoint,
)

print(f"VAPID_PUBLIC_KEY={b64urlencode(public)}")
print(f"VAPID_PRIVATE_KEY={b64urlencode(private)}")
print("VAPID_SUBJECT=mailto:you@example.com")
