"""Small concurrency-safe helpers for expensive UrbanLens cache misses.

functools.lru_cache is thread-safe as a container, but it intentionally allows
multiple callers to execute the wrapped function concurrently when they all miss
the same key. GIS builds are expensive enough that this behaviour is undesirable.
`singleflight` serialises only callers for the same logical key while unrelated
cities continue to compute in parallel.
"""
from __future__ import annotations

from collections import defaultdict
from contextlib import contextmanager
from threading import Lock, RLock
from typing import Hashable, Iterator

_guard = Lock()
_locks: dict[Hashable, RLock] = defaultdict(RLock)


@contextmanager
def singleflight(key: Hashable) -> Iterator[None]:
    with _guard:
        lock = _locks[key]
    with lock:
        yield
