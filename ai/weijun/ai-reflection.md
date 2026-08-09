# AI Reflection — Wei Jun

## 1. How I Used AI

For my part of the project, I mainly worked on the **Coverage, Calendar & Scheduling-Rules** area. This included working-day calculations, country-specific weekends, public holidays, staffing coverage, minimum staffing rules, blackout periods and the AI-2 coverage feature.

I used AI mainly as a helper when I was planning features, understanding the existing code and checking my implementation. Since this was a group project, I also had to work with code written by other members, so being able to ask AI to explain how different services connected was useful.

I did not just copy the code or suggestions from AI. I used the suggestions as a starting point, then checked whether they actually fitted our project structure and requirements.

## 2. What AI Helped Me With

### Planning the scheduling and coverage features

At the start, I used AI to break down the M4 requirements into smaller parts. This helped me understand that the scheduling logic should not all be placed in one large function.

For example, the working-day calculation, weekend configuration, coverage calculation and staffing rules could be handled separately. This made the overall implementation easier to understand and also reduced the chance of having the same calculation written in different places.

AI also helped me think about edge cases that I might not have considered immediately. These included public holidays inside a leave period, different working weeks depending on the country, leave periods with no working days, overlapping leave and situations where staffing falls below the required minimum.

### Designing AI-2

I also used AI when planning the AI-2 Smart Coverage Analyzer.

One thing I wanted to make sure of was that AI-2 would not become responsible for making the actual leave decision. The coverage numbers and minimum staffing rules should still be calculated by the application.

The approach I used was to keep the actual calculation in the backend and use AI-2 mainly to explain the result to the user. For example, if approving a leave request would cause staffing to fall below the minimum, AI-2 could explain why there is a coverage issue and suggest possible alternative dates.

I found this useful because it made the role of AI clearer. AI was helping with the explanation, while the important business rules were still controlled by the system.

## 3. Using AI While Coding

During the coding stage, AI helped me with the working-day calculation and country-specific weekend configuration.

The main idea was to have a shared calculation service instead of calculating leave days separately in every route. The service could check whether a date was a working day, exclude public holidays and calculate the working days within a date range.

I agreed with this approach because having one shared calculation makes the result more consistent across the application.

I also used AI when working on the coverage and staffing logic. It helped me think about how to calculate daily staffing from approved leave and compare it against the minimum staffing requirement.

For blackout periods, I needed to handle different rules. A blackout could either completely block leave or require special approval. AI helped me think through the situation where multiple blackout periods overlap, including which rule should take priority.

## 4. Where I Changed AI's Suggestions

One thing I learned was that I should not automatically use an AI suggestion just because the code looked reasonable.

For example, AI could suggest putting a calculation directly inside a particular feature because it would be simpler for that feature. However, I did not want to duplicate the working-day calculation because other parts of the application also needed the same logic.

Instead, I kept the calculation in the shared service and adapted the suggestion to fit the existing project structure.

I also made sure that AI-2 did not control important business decisions. AI can provide an explanation, but it should not decide whether a leave request is approved, calculate the final leave balance or override the minimum staffing rules.

This was one of the main areas where I modified the AI's suggestions rather than using them exactly as provided.

## 5. Testing and Debugging

During testing, I used AI to help me think about how my features would interact with the rest of the application.

I checked cases such as:

- normal leave requests;
- leave periods containing public holidays;
- leave overlapping with approved leave from other team members;
- coverage falling below the minimum staffing level;
- blackout periods that block leave;
- blackout periods requiring special approval;
- and countries with different working-week configurations.

I also looked at the leave request flow to make sure the important checks were being performed on the server.

This was important because frontend warnings alone are not enough for business-critical rules. A user should not be able to bypass a coverage or blackout restriction simply by changing something on the frontend.

One thing I learned from this testing was that a function can work correctly on its own but still cause problems when it interacts with another part of the system. Because of this, I had to think about integration rather than only testing my individual functions.

## 6. What I Learned From Using AI

The biggest thing I learned is that AI is useful as a **development assistant**, but I still need to understand and check the code myself.

AI was useful for:

- explaining existing code;
- breaking large requirements into smaller tasks;
- suggesting possible implementations;
- identifying edge cases;
- helping with repetitive coding;
- and thinking of testing scenarios.

At the same time, AI did not automatically know all the specific rules and structure of our project. I still had to compare its suggestions with our requirements and existing code.

I also learned that shared services need to be handled carefully. A small change to something like the working-day calculation could affect leave balances, calendars and coverage calculations in other parts of the system.

## 7. What I Would Do Differently

If I were doing the project again, I would spend more time agreeing on the shared services and responsibilities before everyone started coding.

For my part, I would define earlier which service should be responsible for working days, public holidays, weekend configuration, staffing and coverage. This would make it easier for different team members to integrate their work later.

I would also keep better records of my AI usage while developing. Since I lost my original AI logs, I had to reconstruct my workflow afterwards. Keeping the prompts and decisions as I worked would have made the final documentation much easier and more accurate.

I would also test integration between team members' features earlier instead of waiting until the later stages of the project.

## 8. Conclusion

Overall, AI helped me save time and gave me another way to approach problems when I was unsure about the implementation. It was especially useful when I was dealing with date calculations, coverage rules and the different edge cases involved in scheduling.

However, I learned that using AI does not mean I can just accept everything it produces. I still need to understand the requirements, check the existing code, test the changes and decide whether the suggestion actually fits the project.

For me, the most useful way to use AI was as someone I could ask for ideas and explanations, while I remained responsible for deciding what actually went into the project.
