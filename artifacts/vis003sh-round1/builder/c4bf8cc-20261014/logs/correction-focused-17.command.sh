#!/bin/sh
printf '%s\n' "$$" > /private/tmp/vis003sh-focused-correction.pid
cd /private/tmp/vis003sh-builder-5ed9d7c || exit 125
node --test tests/ui-combat-effects.test.js tests/cards021-integration.test.js > /private/tmp/vis003sh-focused-correction.tap 2>&1
status=$?
cat /private/tmp/vis003sh-focused-correction.tap
printf '%s\n' "$status" > /private/tmp/vis003sh-focused-correction.exit
exit "$status"
