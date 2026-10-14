import pathlib, subprocess, sys

name, cwd = sys.argv[1], pathlib.Path(sys.argv[2])
evidence = pathlib.Path(__file__).parent
command = ["npm", "run", "test:game-restart"]
result = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(evidence / f"{name}.tap").write_bytes(result.stdout)
(evidence / f"{name}.exit-code.txt").write_text(f"{result.returncode}\n")
(evidence / f"{name}.command.txt").write_text(f"cwd={cwd}\ncommand={' '.join(command)}\n")
print(f"{name}: exit={result.returncode}, output-bytes={len(result.stdout)}")
sys.exit(0)
