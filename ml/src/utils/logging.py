import logging
from typing import Optional

_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def get_logger(name: Optional[str] = None) -> logging.Logger:
    logging.basicConfig(format=_LOG_FORMAT, level=logging.INFO)
    return logging.getLogger(name or __name__)
