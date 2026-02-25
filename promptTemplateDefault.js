export const DEFAULT_PROMPT_TEMPLATE = `Dark pattern list with definition:
Dark Pattern Type: Disguised ad; Definition: Presents advertisements as legitimate interface elements, making it more likely that users will click on them;
Dark Pattern Type: False hierarchy; Definition: Manipulates the visual prominence or layout order of interface elements to mislead users about their importance or recommended choice;
Dark Pattern Type: Preselection; Definition: Makes certain options that benefit the platform automatically checked, toggled on, or selected by default without user's explicit consent;
Dark Pattern Type: Pop-up ad; Definition: Makes certain options that benefit the platform automatically checked, toggled on, or selected by default without user's explicit consent;
Dark Pattern Type: Trick wording; Definition: Uses confusing, tricky wording, such as double negative language, to manipulate users into taking actions they did not intend;
Dark Pattern Type: Confirm shaming; Definition: Uses emotionally manipulative or guilt-inducing language to pressure users into making a particular choice, typically one that benefits the platform;
Dark Pattern Type: Fake social proof; Definition: Creates a false impression of popularity, trust, or credibility by displaying fabricated or misleading social signals, such as fake reviews or testimonials;
Dark Pattern Type: Forced Action; Definition: Compels users to perform an unwanted or unrelated action, such as creating an account, downloading an app, as a prerequisite for completing their desired task;
Dark Pattern Type: Hidden information; Definition: Conceals or obscures important options, costs, or information that are relevant to the user's decision-making process;

Assume you are a judger for dark pattern, identify the top 3 most obvious dark pattern in the home page, using the screenshot of the page. Use the truncated HTML below as a secondary support to help you identify the dark patterns. Using the terminology in the dark pattern list.

Page URL: {{URL}}
Page Title: {{TITLE}}
Captured At: {{TIME}}
Screenshot File: {{SCREENSHOT_FILENAME}}

Truncated HTML:
{{TRUNCATED_HTML}}
`;