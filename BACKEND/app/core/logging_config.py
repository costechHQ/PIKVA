"""Application logging setup (SRS 27 "appropriate logging", 28).

Only the "app" logger is configured; the root logger and uvicorn's own
loggers are left alone. Messages still propagate, so test log capture works.
"""

import logging
import sys
from typing import TextIO

HANDLER_NAME = "pikva"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging(level: str, stream: TextIO | None = None) -> None:
    """Send app log lines at or above level to stream (default stderr).

    Safe to call more than once: the previous Pikva handler is replaced, so
    lines are never written twice.
    """

    logger = logging.getLogger("app")
    logger.handlers[:] = [h for h in logger.handlers if h.name != HANDLER_NAME]

    handler = logging.StreamHandler(stream or sys.stderr)
    handler.name = HANDLER_NAME
    handler.setFormatter(logging.Formatter(LOG_FORMAT))

    logger.addHandler(handler)
    logger.setLevel(level)
