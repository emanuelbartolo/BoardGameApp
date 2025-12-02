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
