# AI Reflection — Nabil Hady (Member 5)

**Vertical:** HR Admin, Analytics & Automation
**Tools used:** Claude Code (Claude Opus) for implementation, run in the project working directory with file and shell access

---

## How I used AI

I used Claude Code as an implementation partner across the build, most heavily in Phase 3 and Phase 4 when my vertical went from configuration screens to analytics, automated email, and the leave-type catalogue.

The pattern that worked was: describe the outcome in domain terms, let the model propose an implementation, then interrogate the proposal against things the model could not see — our division of labour, the constraint that I could not edit teammates' files, and what would actually happen on stage during a live demo. Across the 8 August session I accepted 3 of 10 substantial proposals as offered, accepted 5 after imposing constraints of my own, and rejected 2 outright.

I did not use AI to decide what to build. The use cases came from the challenge brief and our team planning. I used it to get from a decision to working code faster, and to have something concrete to argue with.

---

## Where it added the most value

**Surfacing the enforcement gap I would have shipped.** My prompt for configurable leave types asked only that HR be able to configure who can apply for what. The model proposed enforcing the rule server-side on all three write paths — apply, draft update, and draft submit — not just filtering the dropdown. A UI-only filter would have looked identical in a demo and been bypassable with a single `curl`. That is a security-shaped mistake I was on course to make, and having it raised unprompted was the single most valuable moment of the session.

**Compressing the distance between an idea and something I could judge.** The long-weekend finder went from a sentence to a working component in about ten minutes. That mattered less because it saved typing and more because I cannot evaluate a feature I have only described. Once it was on screen I could see immediately that its coverage logic was wrong — which I could not have seen from a specification.

**Verification I would not have had the patience to do by hand.** The forfeiture reminder was checked by triggering it in a real browser, then querying MySQL directly to confirm 10 notifications and 10 correctly-tiered audit rows, then confirming the email rendered its own subject line rather than falling through to the generic fallback. That last check is exactly the kind of thing that passes a smoke test and looks wrong in someone's inbox. I would not have thought to check it; I would certainly not have checked it at 8pm.

---

## Where I overrode it, and why

**The team leave timeline — rejected.** Working code, thrown away, because it duplicated Wei Jun's team availability view. The model could see my repository but not our task allocation document, so the conflict was structurally invisible to it. Two people shipping overlapping features is worse than one shipping nothing: it raises the question of who owns coverage, and it means two implementations of the same logic are free to disagree in front of the client. Catching it required knowing what my teammates were building, which is not a thing I can delegate.

**The long-weekend coverage rule — rejected twice.** The first version hid any suggestion where a teammate had leave booked. Plausible, ran cleanly, would have demoed fine. Also wrong in both directions: on a large team one colleague's absence is irrelevant, and on a small team the feature erases itself the moment one person acts. It took me three rounds of "but what if" to get to the version that calls the existing coverage endpoint and shows the real answer as a warning. Nothing automated would have caught this. It is not a bug — the code did what it was written to do — it is a product-logic error, and the only defence against it is someone who understands what the feature is for.

**Placement decisions.** I moved the forfeiture reminder button from the Employees tab to the Audit trail, because every run writes to the trail and the trail is where you check whether it worked. I moved the AI insights panel from its own tab to the top of the dashboard, because at an AI challenge a judge could otherwise sit through the entire HR walkthrough without seeing the AI feature. Neither changed a line of logic. Both changed whether the work is visible, and the model has no view of the room I am presenting in.

**Constraints I set that were not offered.** That `gender` on `users` be nullable, because sixty seeded accounts exist without it. That the eligibility rule fail closed rather than open. That the forfeiture reminder be manually triggered rather than scheduled, because an automatic mailer is one that fires during a demo, or twice, or at 3am to sixty people. That the eligibility heatmap carry symbols rather than relying on colour alone, so it survives a projector. That an employee whose country has no policy row be skipped rather than defaulted, because a guessed cap puts a wrong number in a real person's inbox.

---

## What I learned about working this way

**The model optimises for the prompt in front of it, not the project around it.** Both of my rejections came from context it had no access to: a task allocation document and a five-person division of labour. It could see every file in my repository and still had no idea Wei Jun existed. Holding the shape of the whole project is the part that stayed mine, and it is the part that caught the two most expensive mistakes of the session.

**Plausible and correct are different failure modes, and only one of them is loud.** A syntax error announces itself. A coverage rule that hides the wrong suggestions runs silently, passes tests, and demos convincingly on seeded data. Reviewing AI output for whether it *runs* is nearly useless. Reviewing it for whether it does the right thing is the actual work, and it requires understanding the domain at least as well as if I had written the code myself.

**Iterating is cheap enough that it changes what is worth asking.** Rejecting a working component twice cost me maybe twenty minutes. That economics is genuinely new — it makes "this isn't quite right, what if…" the default move rather than something you settle for avoiding. The risk is the mirror image: accepting a first answer because it works is now the path of least resistance, and it is where most of the bad decisions would come from.

**Refactoring for testability was worth doing properly.** The eligibility rule started as a private function inside a route handler, which meant testing it required Express, MySQL, a seeded user, and a JWT just to assert on a boolean. Extracting it into a pure module gave me 82 fast unit tests, removed a duplicated security rule, and made every boundary assertable exactly rather than sampled. The AI wrote most of the tests; deciding that the rules needed to be extractable at all was mine.

**Writing the tests found three defects that months of clicking had not.** A forfeiture calculation implemented three different ways in my own vertical — only one of which read the country's configured cap. And two AI-4 classifier failures: the plural "anomalies" matched nothing, and a question explicitly about forfeiture routed to the wrong report because of how the keyword scoring adds up. All three produce plausible behaviour in a browser. All three would have been found the first time a marker asked the chatbot a slightly differently-worded question, or the first time HR edited a carry-forward cap. That hour of test-writing was the first time all project that anything read my code rather than my screen.

---

## What I would do differently

- **Write the tests earlier.** They arrived at the end, after the features were verified by clicking through a browser — and they immediately found three defects that clicking never would have. Several of them encode decisions I made mid-session (the `[]` versus `NULL` case, the fail-closed rule, the tier boundaries); having them in place while I made those decisions would have made the reasoning explicit instead of retrospective. This is the single change I would make.
- **Cover the endpoints, not just the rules.** My tests assert the decisions. They do not assert that the decisions are wired up, that the mailer sends, or that the audit row is written. That verification was done by hand against a live database. Automating it needs a seeded test database and a mail stub, and it is the obvious next thing.
- **Share a repository from day one.** The whole of Phase 4 exists because five people worked in parallel and exchanged zip files, so the verticals were not combined until the end. Almost every defect that phase surfaced lived in the seam between two people's work. Faster individual output made this worse rather than better — we each built more before anything was integrated.
- **Log decisions as they happen.** Reconstructing this reflection from a session transcript was possible only because Claude Code keeps one. The reasoning behind the rejections was still in my head on the day; a week later it would not have been.
- **Commit my own work.** Every commit in the team repository is authored by one person, because we integrated by handing over zip files. My contributions are real and traceable in the code, but not in the history — which is exactly the kind of evidence a repository exists to provide, and I did not produce it.

---

## On the honest limits of this

The code in my vertical was substantially AI-generated. I am not going to dress that up. What was mine: the constraints, the rejections, the placement calls, the insistence on server-side enforcement and fail-closed defaults, and the judgement about which working code to throw away.

That distinction matters more than the line count. I can explain every design decision in my vertical and defend the ones that went against the first answer I was given — which is a different thing from having typed them, and, I think, the thing the assessment is actually asking about.
