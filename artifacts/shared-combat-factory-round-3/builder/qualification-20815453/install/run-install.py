import pathlib,subprocess,os,json,hashlib,sys
p=pathlib.Path('/private/tmp/game-001htjx-round3-builder-20815453');r=pathlib.Path(__file__).parent
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=p,text=True).strip()=='20815453f94d405963952a974a979179b7808c65'
assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=p)
env=dict(os.environ,PATH='/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1',npm_config_update_notifier='false')
argv=['/Users/me/.hermes/node/bin/npm','ci'];(r/'invocation.json').write_text(json.dumps({'argv':argv,'cwd':str(p),'env':{k:env[k] for k in ['PATH','PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD','npm_config_update_notifier']},'runner_sha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()},indent=2)+'\n')
for name in ['package.json','package-lock.json']:(r/name).write_bytes((p/name).read_bytes())
with (r/'stdout.raw').open('wb') as out,(r/'stderr.raw').open('wb') as err:
 proc=subprocess.Popen(argv,cwd=p,env=env,stdout=out,stderr=err);(r/'pid.txt').write_text(str(proc.pid)+'\n');print('npm ci direct PID',proc.pid,flush=True);rc=proc.wait()
(r/'exit.txt').write_text(str(rc)+'\n');(r/'after-status.txt').write_bytes(subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=p));assert (p/'package-lock.json').read_bytes()==(r/'package-lock.json').read_bytes();print('npm ci exit',rc,flush=True);sys.exit(rc)
