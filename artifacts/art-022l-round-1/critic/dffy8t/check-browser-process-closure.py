import subprocess
lines=subprocess.run(['ps','-axo','pid=,ppid=,command='],check=True,text=True,capture_output=True).stdout.splitlines()
left=[line for line in lines if 'playwright_chromiumdev_profile-' in line and 'Google Chrome' in line]
print('Playwright temporary Chrome profiles still running:')
print('\n'.join(left) if left else '(none)')
raise SystemExit(1 if left else 0)
