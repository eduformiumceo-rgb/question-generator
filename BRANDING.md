# Branding: Eduformium Assessment Studio

| Where | Text |
|---|---|
| Product name | **Assessment Studio** (full: *Eduformium Assessment Studio*) |
| Header lockup | `Eduformium` wordmark, `Assessment Studio` underneath (`AppHeader.jsx`, `.qh-brand-sub`) |
| Hero | title `Assessment Studio`, one line: "Tests, quizzes and exams from the Ghana curriculum, with marking schemes." (`QuestionsGenerator.jsx`) |
| Browser tab / Google | `Eduformium Assessment Studio: Tests, Quizzes & Exams` (52 chars; Google cuts at about 60) |
| Search description | `index.html` meta description (under 170 chars) |
| WhatsApp / Facebook / X preview | `og:*` and `twitter:*` tags in `index.html` |
| Installed app | manifest `name` = Eduformium Assessment Studio, `short_name` = **Assessments** (fits under a phone icon); iOS label via `apple-mobile-web-app-title` |
| Install prompt, payment page | `InstallPrompt.jsx`, `PaymentSuccess.jsx` |
| Shared paper (phone share sheet) | adds the line "Made with Eduformium Assessment Studio" |

`tests/branding.test.jsx` pins all of the above (title length, short-name length, no stale "Questions Generator" or old
tagline in user-facing text), so a later edit cannot quietly bring an old or inconsistent name back.

The service-worker cache was renewed (`eduformium-questions-v2`) so already-installed apps replace the old shell and show
the new name after their next visit. The home-screen label of an app that is already installed only changes when the
person reinstalls it (browsers read the manifest at install time).

## Still to do (cannot be done from the code)

1. **Trademark and domain check** for "Assessment Studio" in education, plus social handles.
2. **Five-second teacher test:** show the header and hero to five teachers, ask "what does this do?".
3. **Link-preview image:** `og:image` needs the absolute URL of the live site (e.g. `https://your-domain/questions-logo.png`).
   Add it to `index.html` once the final domain is known; without it WhatsApp shows text only.
4. Done: the saved-work folder is now **My Assessments** (tile, page, toasts, recovery notices).
