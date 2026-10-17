#!/usr/bin/env python3
"""Double-fork daemon spawn (macOS-safe) so services survive IDE shell exit."""
from __future__ import annotations

import os
import subprocess
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: detach_daemon.py <logfile> -- <command...>", file=sys.stderr)
        return 2
    logfile = sys.argv[1]
    if sys.argv[2] != "--":
        print("missing -- before command", file=sys.stderr)
        return 2
    cmd = sys.argv[3:]
    if not cmd:
        print("empty command", file=sys.stderr)
        return 2

    pid = os.fork()
    if pid > 0:
        print(pid)
        return 0

    os.setsid()
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)

    with open(logfile, "a", encoding="utf-8") as logfh:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=logfh,
            stderr=subprocess.STDOUT,
            env=os.environ.copy(),
        )
    os._exit(0)


if __name__ == "__main__":
    raise SystemExit(main())
