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

## Deployment to GitHub Pages

1.  **Create a GitHub Repository:** Create a new repository on GitHub and push the project files to it.
2.  **Enable GitHub Pages:** In the repository settings, go to the "Pages" section and enable GitHub Pages for the `main` branch.
3.  **Configure Firebase:**
    *   Create a new project on the [Firebase Console](https://console.firebase.google.com/).
    *   Create a new Web App in your Firebase project.
    *   Copy the Firebase config object and paste it into `js/firebase-config.js`.
    *   **Important:** For a production app, use Firebase Hosting environment variables to store your API keys and other sensitive information.
4.  **Set up the BGG Proxy:**
    *   The BGG XML API does not support CORS, so a proxy is needed. A Firebase Cloud Function is a good option.
    *   Initialize Firebase for Cloud Functions in your project.
    *   Create a simple HTTP-triggered function that fetches data from the BGG API.
    *   Deploy the function and replace the `YOUR_PROXY_URL_HERE` placeholder in `js/bgg.js` with the URL of your deployed function.
    *   An example of a proxy function can be found in the Firebase documentation.

Once these steps are completed, your app will be live on GitHub Pages.
