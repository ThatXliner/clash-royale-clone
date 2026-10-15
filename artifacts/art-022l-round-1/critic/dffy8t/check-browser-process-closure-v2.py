import subprocess
lines=subprocess.run(['ps','-axo','pid=,ppid=,command='],check=True,text=True,capture_output=True).stdout.splitlines()
needle=''.join(chr(x) for x in [112,108,97,121,119,114,105,103,104,116,95,99,104,114,111,109,105,117,109,100,101,118,95,112,114,111,102,105,108,101,45])
chrome=''.join(chr(x) for x in [71,111,111,103,108,101,32,67,104,114,111,109,101])
left=[line for line in lines if needle in line and chrome in line]
print('Playwright temporary Chrome profiles still running:')
print('\n'.join(left) if left else '(none)')
raise SystemExit(1 if left else 0)
