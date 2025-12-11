# Board Game Group Planner

A lightweight web app for weekly board game groups.

## Features

*   Sync with a BoardGameGeek (BGG) collection
*   Shortlist games
*   Voting on games
*   Calendar events
*   Export plans to messaging apps

## Tech Stack

*   **Hosting:** GitHub Pages
*   **Frontend:** HTML, CSS, Vanilla JavaScript
*   **UI Framework:** Bootstrap 5
*   **Backend:** Firebase Firestore
*   **Proxy:** Firebase Cloud Function (for BGG API)

## Development

This project is set up to be developed with VS Code. Simply open the folder and start a local server to view the `index.html` file.

## Deployment to GitHub Pages & Cloudflare

### 1. GitHub Repository Setup
*   **Create a GitHub Repository:** Create a new repository on GitHub and push the project files to it.
*   **Enable GitHub Pages:** In the repository settings, go to the "Pages" section and enable GitHub Pages for the `main` branch. Your site will be live at `https://<your-username>.github.io/<your-repo-name>`.

### 2. Firebase Configuration
*   Create a new project on the [Firebase Console](https://console.firebase.google.com/).
*   Create a new Web App and copy the `firebaseConfig` object.
*   Paste your config into `js/firebase-config.js`.
*   In the Firebase console, go to **Build > Firestore Database** and create a database. Start in **test mode**.

### 3. BGG Proxy with Cloudflare Workers (Permanent Fix)
The BGG API has CORS issues, so a proxy is required. Public proxies are unreliable. Follow these steps to create your own free, permanent proxy.

1.  **Sign up for Cloudflare:** Create a free account at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2.  **Navigate to Workers:** In the sidebar, go to **Workers & Pages**.
3.  **Create a Worker:**
    *   Click **Create application**, then **Create Worker**.
    *   Give your worker a name (e.g., `bgg-proxy`). This will be part of its URL.
    *   Click **Deploy**.
4.  **Edit the Worker Code:**
    *   Click **Edit code**.
    *   Delete all the boilerplate code in the editor.
    *   Copy and paste the following code into the editor:

    ```javascript
    export default {
      async fetch(request) {
        const url = new URL(request.url);
        const bggUrl = url.searchParams.get('url'); // Get BGG URL from query param

        if (!bggUrl) {
          return new Response('Missing url query parameter', { status: 400 });
        }

        const response = await fetch(bggUrl);
        const newResponse = new Response(response.body, response);

        // Add CORS headers to allow requests from your GitHub Pages site
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        
        return newResponse;
      },
    };
    ```
5.  **Save and Deploy:** Click **Save and deploy**.
6.  **Get Your Worker URL:** Go back to the worker's overview page. Your worker's URL will be displayed (e.g., `https://bgg-proxy.<your-name>.workers.dev`).
7.  **Update `js/bgg.js`:**
    *   Open the `js/bgg.js` file in this project.
    *   Replace the placeholder `YOUR_WORKER_URL_HERE` with your actual worker URL.
    *   Your final code should look like this: `const proxyUrl = 'https://bgg-proxy.<your-name>.workers.dev/?url=';`
8.  **Commit and Push:** Save the changes to `js/bgg.js`, then commit and push them to GitHub.

Your app will now be live and fully functional with a stable BGG connection.

## Environment variables (.env)

This project uses a small set of environment variables for the Cloud Function and runtime configuration. Do NOT commit your real secret keys to the repository. Instead, copy the included `.env.example` to `.env` and fill in your values locally:

1. Copy template:

```powershell
cp .env.example .env
```

2. Edit `.env` and set your values, for example:

```env
# OpenRouter API key (secret)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional: override default LLM model used by the function
OPENROUTER_MODEL=google/gemma-3-27b-it:free
```

Notes:
- The `.env` file is intended for local development only and is ignored by Git. For production, set the `OPENROUTER_MODEL` (and other runtime env vars) in the Cloud Functions environment via the Google Cloud Console or `gcloud` CLI.
- The callable Cloud Function will prioritise a `model` field in the request body, then `OPENROUTER_MODEL` from the runtime environment, and finally a sensible default.

If you need help setting environment variables in your Firebase/Google Cloud deployment, I can add a short guide for `gcloud` commands.

## Set environment variables in Google Cloud Console

You can set runtime environment variables for your deployed Cloud Function from the Google Cloud Console. This is the recommended way to configure non-secret values like `OPENROUTER_MODEL` in production.

1. Open the Cloud Functions page in the Google Cloud Console: https://console.cloud.google.com/functions
2. Click the function name (e.g. `generateAiSummary`) and choose **Edit**.
3. Expand **Runtime, build, connections and security** and open **Runtime environment variables**.
4. Add or update keys (for example `OPENROUTER_MODEL`) and save. The function will be redeployed.

CLI examples (replace region/project as needed):

PowerShell (gen1):
```powershell
gcloud functions deploy generateAiSummary `
  --region=us-central1 `
  --update-env-vars OPENROUTER_MODEL="google/gemma-3-27b-it:free"
```

PowerShell (gen2):
```powershell
gcloud functions deploy generateAiSummary `
  --region=us-central1 `
  --set-env-vars OPENROUTER_MODEL="google/gemma-3-27b-it:free"
```

Secrets (API keys)

For sensitive values such as `OPENROUTER_API_KEY`, use Secret Manager instead of plain env vars:

- Console: https://console.cloud.google.com/security/secret-manager
- Create a secret and add a version (your API key). Then grant the function's service account the Secret Manager Secret Accessor role.
- In Firebase Functions v2 you can continue to use `defineSecret()` in code and bind the secret via the console.

If you want, I can add exact `gcloud secrets` and IAM commands for your project.
