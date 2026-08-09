# AI Reflection — Jervis (Member 2)

> **DRAFT — for Jervis to revise before submitting.**
> This was drafted with AI assistance from the events recorded in `ai-logs/`, and
> everything in it is factually accurate to what happened. But the *reasoning* is
> supposed to be yours. Read it, cut what you disagree with, and rewrite the
> judgements in your own words — especially §3 and §5, where a marker is most
> likely to ask you to expand on a claim. Delete this box when you have.

---

## 1. What I used AI for, and what I did not

I used AI heavily for three things: reading unfamiliar code fast, mechanical
transformation across many files, and catching classes of error I would not have
thought to look for.

I did not use it to decide what the system should do. The use cases, the two-tier
approval model, and the choice of which rules matter were settled in the design
phase. Where AI proposed features, I turned most of them down.

The clearest example of that is the improvement list it produced when I first
asked it to review my vertical. It came back with about fifteen items. Some were
real defects I later fixed; several — rate-limiting the AI endpoint, an `.ics`
subscription feed, splitting my 1,900-line Employee page — were perfectly good
engineering advice that I deliberately ignored, because integration was the actual
blocker and a larger half-finished system is worth less than a smaller working one.
Taking all of it would have been the easy thing to do and the wrong call.

## 2. Where AI was genuinely decisive

**The merge.** Three teammates handed me zip files. My instinct was to copy their
folders over mine and fix what broke. That would have destroyed my own work
silently: neither zip contained a single M2 file, because both had branched from a
snapshot taken before my round. Instead of copying, the AI hashed every file
across all the archives, found the common ancestor among older zips still sitting
in my Downloads folder, reconstructed the branch history, and performed a real
three-way merge with each member's tree as a branch.

I could have worked that out eventually. I would not have worked it out before
overwriting something.

**The `gender` bug.** After the merge, gender-restricted leave types — maternity,
NS/reservist — were invisible to every user. The cause was that the authentication
middleware rebuilt the current user from the database but dropped the `gender`
field, and Member 5's feature reads it. Member 1 wrote the middleware. Member 5
wrote the feature. Neither of their working copies contained both halves, so
neither of them could have hit it, no matter how carefully they tested. It only
existed once the code was combined.

That is the most useful thing this project taught me, and it is not about AI at
all: **some defects have no owner.** They are created by the seam between two
correct pieces of work. A per-member test suite, however thorough, cannot see them.

## 3. The moment I stopped trusting output at face value

Partway through, the AI ran a check and told me every variable in the merged
frontend was properly defined. Later, my "Save as draft" button turned out to be
dead — because the merged code referenced `editingDraftId`, a variable that only
existed in a teammate's version of the page.

The earlier check had been wrong. It used a text search that counted the line
`const req = editingDraftId` as a *declaration* of that variable, so it reported a
pass on the exact bug it was supposed to find.

Two things came out of that. The first is obvious in hindsight: a check that
cannot fail is not a check. The second is more useful. Rather than fixing the one
variable, we replaced the check with one that parses the code and tracks scope
properly — and it immediately found **four more** dead controls across the HR and
employee pages, including one in my own draft-edit dialog that I would have
demonstrated live.

What makes this worth writing down is *why* the build never caught any of them. An
undefined variable in JavaScript is only an error when that line actually runs.
The production build compiled all five without complaint. They fail as buttons
that do nothing, which is exactly the failure mode you do not find by clicking
around your own feature — you find it when a marker clicks something else.

I now treat "it builds" and "the tests are green" as evidence about the paths that
ran, and nothing more.

## 4. Where I had to push back

The AI is markedly better at producing code than at producing honest tests for it.
When I asked for the early-return feature, the implementation was sound but the
test fixtures were wrong three times over: they exhausted the employee's leave
balance, then rolled into a year with no balance row, then collided with dates an
existing test already occupied.

The tempting fix — and the one I had to consciously refuse — was to loosen the
assertions until they passed. One test asserted that a balance restore happened in
a scenario where the fixture had never deducted anything in the first place, so the
assertion was simply wrong. Weakening it would have produced a green suite that
proved nothing.

Instead the fixtures were fixed properly: provision the next year's balance, spread
the dates apart, and make a failed fixture print the dates, the HTTP status and the
server's actual message rather than "expected 200, got 400". That last change cost
about ten lines and saved a considerable amount of time immediately afterwards.

## 5. What I would say about AI's value overall

It compressed the parts of the work that are mechanical but unforgiving — a
25-conflict merge, transforming code across dozens of files, generating
documentation from the actual routes and the live database rather than from what I
remembered writing. Those are the tasks where a human is slow *and* error-prone,
and where being 95% right is not good enough.

It was much less useful for judgement. Every genuinely consequential decision in
this phase was one I made: keeping Member 1's fuller two-factor implementation over
Member 3's reduced one, keeping my unified validation instead of the duplicated
copy that had crept back in, modelling an early return as one nullable column on
the existing request instead of a second approval pipeline, and declining most of
the improvement list. The AI supplied the options and the reasoning for each; it
did not know which mattered, and twice it was confidently wrong in a way I only
caught because I checked.

The honest summary is that it changed what I spent my time on rather than how much
time I spent. Less time typing and merging, more time deciding whether something
was right — which is the better trade, but only if you actually do the deciding.

## 6. What I would do differently

- **Put the project in git on day one.** We exchanged zip files for weeks. Every
  hard problem in the integration phase — the destroyed-work risk, reconstructing
  who changed what, proving individual contribution — is a problem git solves for
  free. This is the mistake I would most want back.
- **Agree the seams first.** The `gender` bug, and the duplicated validation that
  crept back in, both came from two members touching the same contract without a
  written agreement about who owned it.
- **Integrate weekly, not at the end.** Every defect found in this phase existed
  for weeks. Finding them at the end made a merge into a crisis; finding them
  weekly would have made each one a ten-minute fix.

---

*Known limitations I am aware of and have not fixed: leave spanning 31 December is
charged entirely to the starting year; the uploaded medical certificate's file type
is taken from the browser rather than verified from the file's own bytes; and the
sick-leave certificate threshold is a constant in code rather than a per-country
policy setting. These are documented rather than hidden because I would rather be
asked about a limitation I already know than be shown one I did not.*
