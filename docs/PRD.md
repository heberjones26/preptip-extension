# Teacher Prep Tip Chrome Extension PRD

# Problem Summary

Teachers often struggle when adapting standard software to their unique needs, as they must spend limited time learning complex features that are not specific to educators. Consequently, they are forced to either invest significant time mastering professional tools or resort to time-consuming workarounds. For example, a teacher using Canva may be overwhelmed by the infinite options. Instead of creating a custom style guide, they could be directed to use pre-made teacher-specific templates to save time.

# Scope

Must Have:

1. A Chrome extension that’s easy to download and use  
2. Provides helpful tips depending on what website you’re on  
3. Simple setup instructions  
4. Detect redirects  
5. Download video helper for youtube and potentially other sites

Should Have:

1. Ability to search for tasks and how to do them  
2. A section that allows the kids to learn how to use the technology  
3. A home page that is a bigger version of the extension   
4. Ad/malicious website blocker 

Could Have:

1. An AI chatbot in the extension that helps understand what tips they need.  
2. Test in different Wi-Fi environments with different latency, ping, assume the worst possible connection to see if anything breaks  
3. A tool that will distract the kids with the screen while they troubleshoot  
4. Easier ways to test links and material at home to see if they will work on the school wifi and blockers there  
5. Button to summarize websites  
6. Provide summary of content

Won’t have:

1. In depth services on how to use their tech  
2. A timer that gets the kids to count down how long it’s been broken  
3. Make the kids compete to solve a tech issue and whoever solves it gets extra credit  
4. Make Canvas more detailed making teachers have to spend more time learning how to use it

# Behavioral Requirements

**Section 3: Behavioral Requirements**

1. The system installs as a Chromium-based browser extension without requiring third-party software downloads.  
2. When a user clicks the extension icon for the first time, the system displays step-by-step setup instructions.  
3. When a user navigates to a supported educational website, the system displays a side panel containing active teaching tips for that specific URL.  
4. The system provides specific teaching tips and insights based on the active URL.  
5. When a user navigates to an unsupported or unrecognized website, the system hides the tips panel and displays a "No tips available for this site" message.  
6. When a website triggers a background URL redirect, the system analyzes the destination URL before loading the page.  
7. When the system detects a redirect to a flagged or malicious URL, the system blocks the redirect and displays a warning prompt.  
8. When a user navigates to a YouTube video page, the system displays a 'Download for Slides' button below the video player.  
9. When a user clicks the 'Download' button, the system downloads the video file locally in MP4 format.  
10. When a user attempts to download an age-restricted or private video, the system displays an error message stating "Video cannot be downloaded due to restrictions."

**AI Disclosure Statement:** *In the preparation of this PRD, AI (Google Gemini) was used solely as a review and editing tool, in accordance with the assignment's AI Usage Policy. Specifically, Gemini was provided with the completed first draft of the PRD and the assignment rubric. It was asked to (1) check for spelling and grammatical errors, and (2) evaluate the draft against the rubric to identify any logical gaps or missing requirements (such as identifying a scope mismatch where a "Could Have" feature was accidentally included in the Must-Have requirements). AI was not used to brainstorm ideas, generate the problem statement, decide on scope, or write the initial draft. A complete transcript of the AI input and output is included \[attached to this PDF / via the following link: [https\://share.gemini.google/wAHWb0NGBX3x](https://share.gemini.google/wAHWb0NGBX3x)\].*

## AI Screen Specs

#### Screen 1 \- Launch the extension in context

This screen represents the initial entry point where a teacher (like Mrs. Nelly) lands on a web tool (e.g., Google Sheets) and hits a wall while trying to accomplish a specific task. The user interacts with the extension via an icon/button in the browser toolbar. Upon landing on or interacting with the site, the extension detects the current website and displays a badge or notification indicating available how-to resources and tips specific to that tool. Opening the extension immediately provides contextual help rather than a generic landing page, ensuring the user feels supported right away without leaving their current task.

#### Screen 2 \- Top tips and search

When the user initiates the extension window, it opens a side panel displaying predetermined tutorials and top tips tailored specifically to the detected website (such as common tasks teachers struggle with on Google Sheets, like conditional formatting or entering formulas). Each tip includes a brief summary, step count, and estimated time to complete so users can evaluate options at a glance. A search bar allows teachers to look up specific instructions or tasks directly. If no tips exist for the site or a search returns no results, the interface offers helpful next steps or a way to request a tip rather than leaving a dead end.

#### Screen 3 \- Tip detail and where to start

Once a teacher selects a specific tip (e.g., "Color-code grades automatically"), this screen provides a concise, plain-language explanation of what the feature does and identifies where it lives in the web tool's menu structure. On the actual website interface, the extension overlays a visual highlight and a guide cursor pointing to the initial starting element (for example, highlighting the "Format" menu in Google Sheets) to direct the user on where to click first without interrupting their workflow.

#### Screen 4 \- Guided walkthrough

As the user clicks through the menu options, the interactive guide tracks their actions and advances step-by-step. The extension highlights subsequent target areas on the website (such as pointing to "Conditional formatting" within the open Format menu) while providing real-time instructions in the side panel. If the user accidentally opens the wrong menu (e.g., Data instead of Format), off-track recovery prompts automatically detect the mistake, explain the mix-up in simple terms, and re-highlight the correct path to guide them back seamlessly.

#### Screen 5 \- Complete the task with guidance

The guided walkthrough leads the user directly to the final target tool or dialog window (such as the Conditional format rules panel in Google Sheets or a template filter in Canva). Because the final step requires customized user input (such as choosing specific cell ranges or custom formatting rules), the extension remains open alongside the tool, displaying numbered reference pins, clear instructions, and practical examples matching the on-screen options to help the teacher complete and apply the task on their own.

#### Screen 6 \- Was this helpful?

After the task is completed and the requested formatting or feature is applied, the extension presents a quick wrap-up screen to collect feedback. It features quick rating options (such as thumbs up/down or a helpfulness checkmark), a brief optional text input field for detailed suggestions, and a submit button. The prompt is designed to be fast, low-effort, and completely skippable so busy teachers are never blocked from returning to their work.