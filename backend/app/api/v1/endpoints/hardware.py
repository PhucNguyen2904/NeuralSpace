"""Hardware monitoring and GPU settings endpoints."""

import os
import platform
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hardware", tags=["hardware"])

# In-memory GPU settings store (replace with DB persistence if needed)
_gpu_settings: dict = {
    "vramLimit": 12,
    "computePriority": "BALANCED",
    "cudaEnabled": True,
    "performanceProfile": "balanced",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class HardwareStats(BaseModel):
    cpu: float
    gpu: float
    ram: float | str


class GpuSettings(BaseModel):
    vramLimit: int
    computePriority: str
    cudaEnabled: bool
    performanceProfile: str


class DriverCheckResponse(BaseModel):
    available: bool
    currentVersion: str
    newVersion: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read_cpu_percent() -> float:
    """Read CPU usage % from /proc/stat (Linux) or return 0 on other OS."""
    try:
        if platform.system() != "Linux":
            return 0.0

        def _read_stat():
            with open("/proc/stat") as f:
                line = f.readline()
            fields = list(map(int, line.split()[1:]))
            idle = fields[3]
            total = sum(fields)
            return total, idle

        t1, i1 = _read_stat()
        import time
        time.sleep(0.1)
        t2, i2 = _read_stat()

        delta_total = t2 - t1
        delta_idle = i2 - i1
        if delta_total == 0:
            return 0.0
        return round((1 - delta_idle / delta_total) * 100, 1)
    except Exception as e:
        logger.warning(f"Cannot read CPU stats: {e}")
        return 0.0


def _read_ram_percent() -> float:
    """Read RAM usage % from /proc/meminfo (Linux) or return 0 on other OS."""
    try:
        if platform.system() != "Linux":
            return 0.0

        meminfo: dict[str, int] = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    meminfo[parts[0].rstrip(":")] = int(parts[1])

        total = meminfo.get("MemTotal", 0)
        available = meminfo.get("MemAvailable", 0)
        if total == 0:
            return 0.0
        used = total - available
        return round(used / total * 100, 1)
    except Exception as e:
        logger.warning(f"Cannot read RAM stats: {e}")
        return 0.0


def _read_gpu_percent() -> float:
    """Try to read GPU usage via nvidia-smi if available."""
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=2
        )
        if result.returncode == 0:
            return float(result.stdout.strip().split("\n")[0])
    except Exception:
        pass
    return 0.0


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=HardwareStats)
async def get_hardware_stats():
    """Return real-time CPU, GPU, and RAM usage percentages."""
    return HardwareStats(
        cpu=_read_cpu_percent(),
        gpu=_read_gpu_percent(),
        ram=_read_ram_percent(),
    )


@router.get("/gpu/settings", response_model=GpuSettings)
async def get_gpu_settings():
    """Return current GPU configuration settings."""
    return GpuSettings(**_gpu_settings)


@router.put("/gpu/settings", response_model=dict)
async def update_gpu_settings(settings: GpuSettings):
    """Update GPU configuration settings."""
    global _gpu_settings
    _gpu_settings = settings.model_dump()
    logger.info(f"GPU settings updated: {_gpu_settings}")
    return {"success": True}


@router.get("/gpu/driver/check-updates", response_model=DriverCheckResponse)
async def check_driver_updates():
    """Check if a GPU driver update is available."""
    current_version = "Unknown"
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=2
        )
        if result.returncode == 0:
            current_version = result.stdout.strip()
    except Exception:
        pass

    return DriverCheckResponse(
        available=False,
        currentVersion=current_version,
        newVersion=None,
    )
