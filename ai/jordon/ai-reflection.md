# AI Reflection — Jordon

# Where AI added genuine value

# Providing Suggestions and Ideas

One of the main ways AI added genuine value to my work was by providing suggestions after completing a task. These suggestions gave me additional ideas about what could be improved or added to the application. Instead of only helping me complete the feature I originally asked for, AI often suggested related improvements or additional functionality that I could consider implementing.

This allowed me to expand the application's capabilities beyond my initial requirements. However, I still had to decide which suggestions were actually useful for the application rather than blindly implementing everything that was suggested. This made AI more useful as a source of ideas and possible improvements rather than simply a tool that generated code.

# Handling Repetitive Code Structures

AI was particularly useful when implementing features that followed an established structure. Once the structure of an endpoint had been decided, subsequent endpoints usually followed a similar pattern, such as Yup validation, role guards, try/catch error handling and audit logging.

For example, features such as invitation resend and cancellation, account actions, and announcement CRUD operations followed similar structures but used different fields and requirements. AI was able to generate these repetitive sections quickly and consistently. This saved time and reduced the amount of repetitive code that I had to write manually.

This was especially valuable because manually reproducing the same structure multiple times can be both slow and prone to small mistakes. AI allowed me to focus more of my time on the parts of the application that required actual design decisions and testing.

# Faster Development

Another major benefit was the speed at which AI could generate code. Instead of writing every function and endpoint from scratch, I could use AI to produce an initial implementation and then review, test and modify it.

This significantly reduced the time required to implement individual features. As a result, I was able to spend more time developing additional functionality rather than spending most of the project writing repetitive code. AI therefore acted as a development accelerator, while I remained responsible for checking whether the generated implementation actually worked correctly within the application.

# Understanding Unfamiliar Code

AI also added value by helping me understand parts of the code that I was less familiar with. When I encountered code or programming concepts that I did not fully understand, I could ask AI to explain what the code was doing and why certain approaches were being used.

This was useful because I was not only copying generated code into the application. I could ask questions about specific functions, variables and logic to better understand how they worked. This helped me make more informed decisions when modifying the generated code and made it easier to identify whether an AI suggestion was actually suitable for my application.

As a result, AI acted not only as a coding tool but also as a learning aid. It helped me understand the code I was working with, which gave me more confidence when making changes and deciding whether to accept or reject its suggestions.


---

Although AI was useful for generating code quickly, I found that generated code could sometimes appear complete while still being incorrect when tested in the actual application. This meant that I could not rely on the generated implementation without testing it and understanding how it interacted with the rest of the system.

# Code That Looked Finished but Was Not Actually Working

There were situations where a feature appeared to have been implemented successfully in the code and was also visible in the application, but the feature did not actually complete its intended function.

One example was the invitation feature. The invitation button appeared to work and the application displayed a message indicating that the invitation had been sent. However, when I checked the recipient's email, there was no invitation message.

This showed me that a feature appearing to work on the frontend does not necessarily mean that the complete process is functioning correctly. I had to investigate the problem and modify the AI-generated implementation so that the actual email-sending process worked correctly.

Testing the feature myself was therefore necessary before considering it finished.

# Accidentally Removing Existing Functionality

Another issue occurred with the announcement banner. The banner was functioning correctly before additional changes were made, but after several prompts and modifications, it suddenly stopped working.

Instead of simply accepting the latest AI-generated changes, I had to backtrack and identify what had changed. I then modified the implementation so that the announcement banner continued to function together with the newer features.

I therefore had to treat existing working features as constraints when evaluating AI's suggestions.

# Implementing What Was Asked Instead of What Was Actually Needed

A more significant issue occurred with the leave approval system. I initially asked AI to allow Supervisors and Managers to apply for their own leave. AI implemented this requirement as requested, but testing the complete workflow revealed a security and authorisation problem: there was no restriction preventing someone from approving their own leave request.

For example, a Supervisor could submit their own leave request and potentially approve that same request themselves. Although the generated code technically followed the original instruction, it did not account for the wider business rule that users should not approve their own leave.

The solution therefore required more than simply modifying a line of code. I had to consider how the approval hierarchy should work. The final design routes a Supervisor's own leave request to their Manager, while a Manager's or HR Admin's own leave request is routed to HR Admin. Self-approval is also prevented within the authorisation layer for both pending queues and individual or bulk approval actions.

AI was able to implement the instruction, but I had to identify the missing business rule through testing and reasoning about the system.

# Two Features That Silently Performed the Same Function

Another issue occurred with the "Run year-end carry-forward" and "Apply bulk entitlement" features. Both features were individually reasonable, but they ended up producing the same numbers because both calculated the new entitlement using the country's statutory minimum.

This created a more serious problem than simply having duplicate functionality. The carry-forward feature could cause employees who were entitled to more than the statutory minimum to lose their additional entitlement. For example, a manager with 21 days of annual leave could have their entitlement reduced to 14 days.

The problem was not obvious when looking at either function individually. It became apparent only when considering how the two features were supposed to work together. I therefore had to significantly modify the features so that their purposes and outputs were properly differentiated.

# Features Becoming Out of Sync

There were also cases where different features used their own variables or calculations instead of relying on the same source of information. This caused different parts of the application to display different values.

For example, the annual leave remaining shown in the staff detail table could become inconsistent with the actual leave information maintained elsewhere in the application. This could result in users being shown incorrect information.

I had to modify these features so that they remained synchronised with the rest of the application and used consistent values and calculations. This was important because correctness in an application is not only about whether an individual feature works, but also whether different features agree with each other.

# 3. What I Learned From Using AI

Overall, using AI taught me that generating code and developing a working application are two different things. AI was very effective at producing code quickly, especially when the required structure was repetitive or already well established. However, it could not always understand the full context of the application, the relationships between features, or the business rules that were not explicitly stated in the prompt.

Because of this, I learned that AI-generated code should be treated as a starting point rather than a final solution. I needed to test the functionality, check how it interacted with existing features, and question whether the implementation actually achieved the intended outcome.

The examples involving self-approval, leave entitlement, email invitations and synchronisation were particularly important because the problems were not always visible from the generated code alone. They only became clear when I tested the application and considered the behaviour from the user's perspective.

---

# 4. Conclusion

AI provided significant value throughout the development of my application by speeding up coding, handling repetitive structures and suggesting additional improvements. It allowed me to implement more features within the available time and reduced the amount of repetitive code that I needed to write manually.

At the same time, my experience showed me that AI should not be relied upon blindly. Some suggestions looked complete but failed during actual testing, while others followed my instructions but did not account for important business rules or interactions with existing features. In these situations, I had to reject, modify or redesign the AI-generated solutions based on testing and my understanding of the application's requirements.

The biggest lesson I took from using AI is that AI can generate solutions quickly, but the developer still needs to determine whether those solutions are correct. My role was not simply to accept the code produced by AI, but to test it, identify problems, understand why they occurred and make the necessary decisions to ensure the final application worked as intended.