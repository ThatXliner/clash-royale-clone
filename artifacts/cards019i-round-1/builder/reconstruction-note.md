# Candidate source recovery note

This arena candidate is based on accepted D/H1 commit `049ce5087c57864d842c85b7550001131648aedf`. The private pre-rebase WIP was reset before its tracked edits were preserved. The saved 33 KB `difft` output was display text, not an applicable patch; the owned UI and test changes were rebuilt from that displayed addition text and the current accepted source. This is a tested fresh reconstruction, and no byte-equivalence claim is made against the discarded WIP.

The reconstructed candidate was then verified with the actual project suites and real Chrome integration below. The first browser pointer-rounding failure and first full projection trust-boundary failure are retained as raw receipts.
