const functions = require('firebase-functions');
const logger = require('firebase-functions/logger');

// BGG Proxy Function - fetches BGG XML collection bypassing CORS (v1 for free Spark plan)
exports.bggProxy = functions.runWith({ maxInstances: 10 }).https.onRequest((request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET');
  response.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }
  
  const username = request.query.username;
  
  if (!username) {
    response.status(400).send("Missing 'username' query parameter");
    return;
  }
  
  const bggUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1`;
  
  fetch(bggUrl)
    .then(bggResponse => {
      if (!bggResponse.ok) {
        throw new Error(`BGG API error: ${bggResponse.status}`);
      }
      return bggResponse.text();
    })
    .then(xmlText => {
      logger.info(`Fetched BGG collection for ${username}`);
      response.set('Content-Type', 'text/xml');
      response.send(xmlText);
    })
    .catch(error => {
      logger.error("BGG Proxy error:", error);
      response.status(500).send(`Error fetching BGG data: ${error.message}`);
    });
});
