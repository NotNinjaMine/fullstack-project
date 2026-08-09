# AI Reflection — Wei Jun

## 1. My Use of AI During Development

During the development of the leave management system, I used AI mainly as a development assistant for my assigned area, which focused on **coverage, calendar and scheduling rules**. My responsibilities included implementing and improving the logic related to working days, weekends, public holidays, staffing coverage, blackout periods and coverage analysis.

AI was particularly useful when I needed to understand existing code before making changes. Because the project was developed by multiple team members, some of the functions I worked with were connected to features implemented by other members. I used AI to help trace how information moved between the frontend, backend routes and service functions so that I could understand the existing structure before modifying it.

However, I did not treat AI-generated code as automatically correct. I used it mainly to generate possible implementations, explain unfamiliar logic and identify potential edge cases. I still had to test the behaviour and decide whether the suggested implementation actually matched the requirements of the application.

## 2. Where AI Added Genuine Value

### Understanding Existing Scheduling Logic

One area where AI was useful was understanding the existing date and scheduling calculations. Working-day calculations can look simple at first, but the application needed to account for different weekend configurations, public holidays and country-specific rules.

AI helped me break down the existing calculation logic and identify where different parts of the application depended on these calculations. This made it easier to understand why scheduling logic should be centralised instead of having different features calculate working days independently.

This was especially important because another part of the application relied on the calculation service when employees applied for leave. Having a shared calculation method helped prevent different parts of the system from producing different numbers of leave days.

### Handling Edge Cases

AI was also useful for identifying edge cases that were easy to overlook when implementing scheduling functionality.

Examples included:

- weekends that differ depending on the employee's country;
- public holidays being excluded from working-day calculations;
- leave periods that contain both working and non-working days;
- blackout periods that affect staffing;
- coverage dropping below the required threshold;
- boundary dates when calculating leave periods.

Instead of only testing the normal case, AI encouraged me to consider what would happen at the boundaries of the rules. I then verified these cases myself and modified the implementation where necessary.

### Coverage Analysis and AI-2

Another important area was the **AI-2 coverage analysis feature**. The purpose of AI-2 was to analyse potential staffing coverage issues and provide an explanation rather than simply returning a number.

AI helped me develop the structure for generating the analysis and consider how the result should be presented to the user. However, I treated the AI analysis as advisory rather than allowing it to make the final scheduling decision.

This was important because coverage calculations need to remain deterministic. The actual working-day, staffing and coverage calculations should come from the application's rules, while AI can help explain the results in a more understandable way.

### Faster Development

AI also reduced the amount of time spent writing repetitive code. Once the structure of a service or route was established, AI could help generate similar functions or suggest modifications following the same pattern.

This allowed me to spend more time reviewing the logic and testing the interactions between features rather than manually writing every repetitive section.

## 3. Where I Did Not Fully Accept AI Suggestions

Although AI was useful, I learned that a technically reasonable suggestion is not necessarily appropriate for the application.

One important lesson was that scheduling rules should have **one consistent source of truth**. AI could suggest implementing a calculation directly inside a feature because it was simpler locally. However, duplicating the calculation would create a risk that the feature would eventually behave differently from the rest of the system.

For example, if one feature calculated weekends as Saturday and Sunday while another feature used the configured weekend rules for a particular country, the two features could produce different leave-day calculations.

Because of this, I preferred using the existing shared calculation and configuration services rather than creating another independent implementation.

I also rejected suggestions when they introduced unnecessary complexity or duplicated functionality that already existed elsewhere in the system. The goal was not simply to add more code, but to maintain consistency with the architecture of the project.

## 4. Testing AI-Generated Solutions

One of the biggest lessons I learned was that code that looks correct is not necessarily code that works correctly.

I therefore tested AI-generated changes against the existing application rather than assuming that a successful implementation meant the feature was complete.

For scheduling-related functionality, I checked normal cases as well as boundary cases involving weekends, public holidays and different date ranges. I also considered how changes to shared services could affect other members' features.

This was particularly important because my work was not isolated. The calculation and scheduling services were used by other parts of the leave application. A small change to a shared function could therefore cause unexpected behaviour somewhere else.

This taught me that testing should not only ask:

> "Does my feature work?"

It should also ask:

> "Does my change continue to work correctly with the rest of the system?"

## 5. What I Learned About Using AI

My experience showed me that AI is most useful when it is treated as a **development assistant rather than a replacement for developer judgement**.

AI was very effective at:

- explaining unfamiliar code;
- suggesting possible implementations;
- identifying potential edge cases;
- generating repetitive code;
- helping structure coverage analysis;
- and speeding up development.

However, AI did not automatically understand all of the business rules and relationships between the different parts of our system.

The most important responsibility remained with me: understanding the requirements, checking the generated code, testing the result and deciding whether the implementation was actually appropriate.

I also learned that changes to shared services require extra caution. A locally correct solution can still cause problems if it conflicts with the assumptions made by another part of the application.

## 6. What I Would Do Differently

If I were developing the project again, I would establish the shared scheduling contracts earlier.

In particular, I would define from the beginning which service should be responsible for:

- calculating working days;
- determining country-specific weekends;
- handling public holidays;
- evaluating staffing coverage;
- and determining blackout periods.

This would reduce the possibility of duplicated calculations and make integration between team members easier.

I would also integrate the different team members' work more frequently. Since scheduling and coverage rules are shared by several features, testing them only near the end of development increases the chance of discovering integration problems late.

Finally, I would keep more detailed AI usage records during development. The submission requirements specifically expect AI logs to record the phase, prompt, AI output and what was done with the output. Keeping these records continuously would make the final reflection more accurate and easier to write.

## 7. Conclusion

Overall, AI helped me develop my part of the application faster and gave me useful support when working with unfamiliar code and complex scheduling rules. It was particularly useful for identifying edge cases and suggesting ways to structure coverage analysis.

At the same time, I learned that AI-generated solutions still need to be reviewed and tested carefully. The most important decisions were not simply about whether code could be generated, but whether the code followed the application's existing architecture, business rules and shared service contracts.

My main takeaway is that AI can significantly improve development efficiency, but the developer remains responsible for the final result. I had to understand the requirements, question AI's suggestions, test the implementation and modify solutions when they did not fit the wider system. This made AI most valuable as a tool for improving my development process rather than as a replacement for my own reasoning.
