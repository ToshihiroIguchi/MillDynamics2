# scripts/fit_closure.py
"""
Fit the 2D Darcy viscous closure constant A_2D(eps) from MEASURED micro-scale RVE
permeabilities (experiment E6) and write docs/closure_table.json.

Input:  results/E6_rve.csv, produced by `npm run experiments:rve`.
Output: docs/closure_table.json

This script will REFUSE to run if the measurement file is absent. That is
deliberate. The version of this file that shipped before 2026-08-15 produced the
closure table from three hard-coded algebraic expressions:

    A_2D    = 45.0 + 80.0 * phi**2
    B_2D    = 0.75 + 1.2 * phi
    C_gamma = 0.85 + 0.3 * (1.0 - eps)

with no simulation input of any kind, under a comment claiming the factors were
"measured from RVE simulation". They were not measured, and docs/closure_table.json
was consequently fabricated. See docs/VALIDATION.md section 5.2.

Scope of what this script legitimately calibrates:
  * A_2D(eps)  -- yes. It follows directly from the measured Stokes permeability
                  via K = eps^3 dp^2 / (A_2D (1-eps)^2).
  * B_2D       -- NO. The Forchheimer inertial constant requires a Reynolds-number
                  sweep into the inertial regime, which E6 as run does not cover.
  * C_gamma    -- NO. The pore shear-rate constant requires the non-Newtonian
                  RVE cases (n != 1, tau_y > 0), which E6 as run does not cover.
Both uncalibrated constants are emitted with their 3D Ergun placeholder values
and an explicit "calibrated": false flag, so the macro solver and any reader can
tell measured values from placeholders.
"""

import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
IN_PATH = os.path.join(ROOT, "results", "E6_rve.csv")
OUT_PATH = os.path.join(ROOT, "docs", "closure_table.json")

# Below this many cells across the inter-disc gap the Stokes solution is not
# resolved (measured: 2.9 cells gives K/K_Gebart = 0.04). Points under the
# threshold are still written out but flagged, never silently averaged in.
MIN_GAP_CELLS = 5.0


def read_measurements(path):
    if not os.path.exists(path):
        sys.exit(
            f"ERROR: {os.path.relpath(path, ROOT)} not found.\n"
            "Run `npm run experiments:rve` first. This script does not invent\n"
            "closure constants; without measurements there is nothing to fit."
        )
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            reader = csv.DictReader([line] + f.readlines())
            for r in reader:
                rows.append(r)
            break
    if not rows:
        sys.exit(f"ERROR: no data rows in {os.path.relpath(path, ROOT)}")
    return rows


def main():
    rows = read_measurements(IN_PATH)

    dp = None
    with open(IN_PATH, encoding="utf-8") as f:
        for line in f:
            if line.startswith("# dp_m="):
                dp = float(line.split("dp_m=")[1].split()[0])
                break
    if dp is None:
        sys.exit("ERROR: could not read dp_m from the E6 header")

    table = {
        "version": 2,
        "description": (
            "2D Darcy viscous closure measured from micro-scale RVE Stokes flow "
            "(experiment E6). A_2D is calibrated; B_2D and C_gamma are NOT and "
            "carry their 3D Ergun placeholder values."
        ),
        "provenance": {
            "verified": False,
            "verification_status": (
                "A_2D is derived from a measured permeability, but the measurement is "
                "NOT yet verified. Two configurations that should agree (same geometry, "
                "both Stokes, both with the viscous diffusion number bounded below 1) "
                "differ by ~4.5x at phi=0.65. Until that is explained these values are "
                "provisional. See docs/VALIDATION.md section 5.5."
            ),
            "source": "results/E6_rve.csv",
            "method": "K = eps^3 dp^2 / (A_2D (1-eps)^2), solved for A_2D from the "
                      "measured Stokes permeability of a square disc array",
            "verification": "each point is reported against Gebart (1992) transverse "
                            "permeability for the same array; see K_ratio_vs_gebart",
            "min_gap_cells_for_resolved": MIN_GAP_CELLS,
        },
        "dp_reference_m": dp,
        "uncalibrated": {
            "B_2D": {
                "value": 1.75,
                "calibrated": False,
                "reason": "Forchheimer inertial constant needs a Re_p sweep into the "
                          "inertial regime; E6 as run is Stokes only. 1.75 is the 3D "
                          "Ergun placeholder.",
            },
            "C_gamma": {
                "value": 1.0,
                "calibrated": False,
                "reason": "Pore shear-rate constant needs the non-Newtonian RVE cases "
                          "(n != 1, tau_y > 0), which E6 as run does not cover.",
            },
        },
        "points": [],
    }

    print("--- 2D RVE closure fit from measured permeabilities ---")
    print(f"input: {os.path.relpath(IN_PATH, ROOT)}")
    print("phi    eps    gap[cells]  K_meas[m2]     A_2D      K/K_Gebart  resolved")

    n_resolved = 0
    for r in rows:
        phi = float(r["phi"])
        eps = float(r["epsilon"])
        gap = float(r["gap_cells"])
        K = float(r["K_measured_m2"])
        A_2D = float(r["A_2D"])
        ratio = float(r["K_ratio"])
        resolved = gap >= MIN_GAP_CELLS
        if resolved:
            n_resolved += 1

        table["points"].append({
            "solid_fraction_phi": round(phi, 3),
            "porosity_epsilon": round(eps, 3),
            "A_2D": round(A_2D, 2),
            "K_perm_m2": float(f"{K:.4e}"),
            "K_ratio_vs_gebart": round(ratio, 4),
            "gap_cells": round(gap, 2),
            "resolved": resolved,
        })
        print(f"{phi:.2f}   {eps:.2f}   {gap:8.1f}   {K:.4e}   {A_2D:8.1f}   "
              f"{ratio:8.3f}   {'yes' if resolved else 'NO'}")

    table["provenance"]["n_points"] = len(rows)
    table["provenance"]["n_resolved"] = n_resolved

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(table, f, indent=2)
    print(f"\nWrote {os.path.relpath(OUT_PATH, ROOT)} "
          f"({n_resolved}/{len(rows)} points meet the gap-resolution threshold)")
    if n_resolved < len(rows):
        print("NOTE: unresolved points are marked \"resolved\": false. Do not use them.")


if __name__ == "__main__":
    main()
