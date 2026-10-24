#!/usr/bin/env python3
"""Generate a batch of simulated ICU vital readings for the Node.js service."""

import json
import math
import random
import sys


def js_round(value):
    return math.floor(value + 0.5)


def clamp(value, low, high):
    return max(low, min(high, value))


def generate(item):
    patient = item["patient"]
    last = item.get("lastVital") or {}
    tick = item["tick"]
    profile = patient.get("simulation_profile")

    if profile == "critical_demo":
        hr_wave = math.sin(tick * 0.4)
        bp_wave = math.cos(tick * 0.35)
        return {
            "heart_rate": 132 + math.floor(hr_wave * 16) + (8 if random.random() > 0.6 else -4),
            "blood_pressure_sys": 176 + math.floor(bp_wave * 18),
            "blood_pressure_dia": 104 + math.floor(bp_wave * 9),
            "spo2": 87 + math.floor(math.sin(tick * 0.5) * 4),
            "respiration_rate": 28 + math.floor(random.random() * 4),
            "temperature": 38.7 + math.sin(tick * 0.2) * 0.4,
        }

    if profile == "arrhythmia":
        base_hr = last.get("heart_rate") or 82
        draw = random.random()
        jump = (24 if random.random() > 0.5 else -18) if draw > 0.75 else (random.random() * 4 - 2)
        return {
            "heart_rate": clamp(js_round(base_hr + jump), 50, 125),
            "blood_pressure_sys": 122 + math.floor(random.random() * 6 - 3),
            "blood_pressure_dia": 78 + math.floor(random.random() * 4 - 2),
            "spo2": 97 + math.floor(random.random() * 2),
            "respiration_rate": 16 + math.floor(random.random() * 3 - 1),
            "temperature": 36.9 + (random.random() * 0.2 - 0.1),
        }

    if profile == "respiratory_distress":
        return {
            "heart_rate": 92 + math.floor(random.random() * 8 - 4),
            "blood_pressure_sys": 130 + math.floor(random.random() * 8 - 4),
            "blood_pressure_dia": 82 + math.floor(random.random() * 4 - 2),
            "spo2": 93 + math.floor(random.random() * 3 - 1),
            "respiration_rate": 23 + math.floor(random.random() * 3 - 1),
            "temperature": 37.3 + (random.random() * 0.2 - 0.1),
        }

    def drift(value, low, high, delta):
        return clamp(value + (random.random() * (delta * 2) - delta), low, high)

    return {
        "heart_rate": js_round(drift(last.get("heart_rate") or 74, 60, 95, 2)),
        "blood_pressure_sys": js_round(drift(last.get("blood_pressure_sys") or 120, 105, 135, 3)),
        "blood_pressure_dia": js_round(drift(last.get("blood_pressure_dia") or 76, 65, 85, 2)),
        "spo2": min(100, js_round(drift(last.get("spo2") or 98, 95, 99, 1))),
        "respiration_rate": js_round(drift(last.get("respiration_rate") or 16, 13, 19, 1)),
        "temperature": drift(last.get("temperature") or 36.8, 36.4, 37.4, 0.1),
    }


def main():
    inputs = json.load(sys.stdin)
    json.dump([generate(item) for item in inputs], sys.stdout)


if __name__ == "__main__":
    main()
