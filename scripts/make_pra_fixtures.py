"""Generate image-source reference fixtures with pyroomacoustics.

Run once from the repo root:
    python -m pip install pyroomacoustics==0.10.1
    python scripts/make_pra_fixtures.py

Writes src/lib/acoustics/__fixtures__/pra-images.json.
Our frame: x = length, y = up, z = width. pyroomacoustics: x, y = width, z = up.
"""

import json
from pathlib import Path

import numpy as np
import pyroomacoustics as pra

ROOMS = [
    {
        "name": "bedroom",
        "dims": {"length": 4.0, "width": 3.5, "height": 2.6},
        "alpha": {"floor": 0.1, "ceiling": 0.2, "wallX0": 0.3, "wallX1": 0.4, "wallZ0": 0.5, "wallZ1": 0.6},
        "speaker": {"x": 0.6, "y": 1.0, "z": 1.4},
        "listener": {"x": 3.0, "y": 1.1, "z": 1.9},
        "maxOrder": 3,
    },
    {
        "name": "hall",
        "dims": {"length": 12.0, "width": 8.0, "height": 5.0},
        "alpha": {"floor": 0.05, "ceiling": 0.15, "wallX0": 0.25, "wallX1": 0.35, "wallZ0": 0.45, "wallZ1": 0.55},
        "speaker": {"x": 2.0, "y": 1.5, "z": 3.0},
        "listener": {"x": 9.0, "y": 1.2, "z": 5.5},
        "maxOrder": 3,
    },
]

WALL_NAMES = {
    "wallX0": "west",
    "wallX1": "east",
    "wallZ0": "south",
    "wallZ1": "north",
    "floor": "floor",
    "ceiling": "ceiling",
}


def to_pra(p):
    return [p["x"], p["z"], p["y"]]


def run(room):
    d = room["dims"]
    materials = pra.make_materials(**{WALL_NAMES[k]: v for k, v in room["alpha"].items()})
    r = pra.ShoeBox(
        [d["length"], d["width"], d["height"]],
        fs=16000,
        materials=materials,
        max_order=room["maxOrder"],
        air_absorption=False,
    )
    r.add_source(to_pra(room["speaker"]))
    r.add_microphone(to_pra(room["listener"]))
    r.image_source_model()
    src = r.sources[0]
    damping = np.atleast_2d(src.damping)[0]
    images = []
    for k in range(src.images.shape[1]):
        x, y_pra, z_pra = src.images[:, k]
        images.append(
            {
                "pos": {"x": float(x), "y": float(z_pra), "z": float(y_pra)},
                "order": int(src.orders[k]),
                "damping": float(damping[k]),
            }
        )
    return {**room, "images": images}


if __name__ == "__main__":
    out = Path("src/lib/acoustics/__fixtures__/pra-images.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps([run(r) for r in ROOMS], indent=1))
    print(f"wrote {out}")
