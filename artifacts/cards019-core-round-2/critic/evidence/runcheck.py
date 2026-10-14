#!/usr/bin/env python3
import datetime, json, pathlib, subprocess, sys
name=sys.argv[1]
cwd=pathlib.Path(sys.argv[2])
command=sys.argv[3:]
outdir=pathlib.Path(__file__).parent
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
log=outdir/(name+'.raw.log')
meta=outdir/(name+'.json')
proc=subprocess.Popen(command,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
meta.write_text(json.dumps({"name":name,"cwd":str(cwd),"command":command,"pid":proc.pid,"startedUtc":started,"status":"running"},indent=2)+"\n")
with log.open('wb') as f:
    for chunk in iter(lambda: proc.stdout.read(4096), b''):
        f.write(chunk); f.flush()
        sys.stdout.buffer.write(chunk); sys.stdout.buffer.flush()
rc=proc.wait()
record={"name":name,"cwd":str(cwd),"command":command,"pid":proc.pid,"startedUtc":started,"finishedUtc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"exitCode":rc,"rawOutput":str(log)}
meta.write_text(json.dumps(record,indent=2)+"\n")
print(json.dumps(record,sort_keys=True),flush=True)
sys.exit(rc)
