from pathlib import Path
import shlex
import subprocess

builder_dir = Path(__file__).resolve().parent
repo = builder_dir.parents[2]
run_id = "focused-helper-04"
command = ["node", "--test", "tests/aether-well-battle-art.test.js"]
(builder_dir / f"{run_id}.command.txt").write_text(shlex.join(command) + "\n", encoding="utf-8")
result = subprocess.run(command, cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
(builder_dir / f"{run_id}.stdout.raw").write_bytes(result.stdout)
(builder_dir / f"{run_id}.stderr.raw").write_bytes(result.stderr)
(builder_dir / f"{run_id}.exit.txt").write_text(f"{result.returncode}\n", encoding="utf-8")
print(f"{run_id} actual exit: {result.returncode}")
print(result.stdout.decode("utf-8", errors="replace"))
if result.stderr:
    print(result.stderr.decode("utf-8", errors="replace"))
raise SystemExit(result.returncode)
