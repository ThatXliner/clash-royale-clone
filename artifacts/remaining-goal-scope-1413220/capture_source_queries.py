#!/usr/bin/env python3
"""Capture read-only source-query outputs for the remaining-goal scope."""
import subprocess
from pathlib import Path

commands = [
    ["rg", "-n", "-F", 'if (attack.attacker.delivery === "melee") {',
     "src/sim/battle-continuation-kernel.js"],
    ["rg", "-n", "-F", "const splashProfile = projectile.splashProfile;",
     "src/sim/battle-continuation-kernel.js"],
    ["rg", "-n", "-F", "planOrdinaryProjectileSplashImpact({",
     "src/sim/battle-continuation-kernel.js"],
    ["rg", "-n", "-F", 'const CURRENT_TROOP_CONTACT_EFFECT = "ordinary-live-contact";',
     "src/sim/battle-continuation-kernel.js"],
    ["rg", "-l", "26000011|self_as_aoe_center", "--glob", "*.json", "--glob", "*.md",
     "reference", "artifacts/cards020k-signature-scope", "artifacts/completion-inventory-current-16",
     "artifacts/completion-inventory-current-18", "artifacts/melee-splash-source-research",
     "artifacts/next-roster-batch-scope"],
    ["rg", "-n", "walking_speed_tweak_percentage|deploy_delay|collision_radius|mass",
     "artifacts/cards020k-stat-semantics-scope/builder/scope.md"],
    ["rg", "--files", "reference/footage"],
    ["rg", "-n", "-F", "Full raw character record —", 
     "artifacts/cards020k-signature-scope/builder/scope.md"],
    ["rg", "-n", "-F", "raw record —", "artifacts/melee-splash-source-research"],
]
parts = []
for args in commands:
    result = subprocess.run(args, capture_output=True, text=True)
    parts.append("$ " + " ".join(args))
    parts.append(f"exit={result.returncode}")
    parts.append(result.stdout.rstrip())
    if result.stderr:
        parts.append("stderr:")
        parts.append(result.stderr.rstrip())
    parts.append("")
Path("artifacts/remaining-goal-scope-1413220/source-query-results.txt").write_text(
    "\n".join(parts)
)
