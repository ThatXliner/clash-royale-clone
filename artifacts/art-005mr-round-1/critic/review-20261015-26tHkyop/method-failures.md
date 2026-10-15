# Preserved method failures

- The first test-output wrapper assigned to zsh's reserved, read-only `status` variable after Node had run. It did not capture a trustworthy child exit code. The test was rerun once with `test_exit_code`; the retained direct run evidence is `focused-test.stdout.raw`, `focused-test.stderr.raw`, and `focused-test.exit.txt` (exit 0). The audit counts that retained proof as one focused test pass.
- The first local server attempt on port 8765 failed because the address was already in use. A private static server was started from the exact candidate clone on 57123 and the installed Chrome app loaded that URL.
- `createBrowserTab("chrome", ...)` returned `Browser is not available: chrome`; binding Google Chrome by its installed app bundle ID (`com.google.Chrome`) and navigating through CUA succeeded. This CUA render visibly reported 13.00 CSS px baseline and prototype body heights.
