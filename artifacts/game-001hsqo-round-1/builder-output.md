# GAME-001HSQO builder output

Implemented the non-shipping spell occurrence audit and registered
`npm test -- game-roster-spell-occurrences`.

The audit derives 13 occurrences across 10 effect identities: 11 admitted
occurrences across 8 identities and two explicit QUESTION spawn identities.
Every card remains `executionStatus: "question"`; complete card profiles stay
at zero, with the existing one isolated Squall fact receipt reported
separately. The four Squall catalog exports are checked for JSON-byte equality
and recorded as independent fixture contexts, with composition unresolved.

Validation: targeted selector passed 4/4 tests.
