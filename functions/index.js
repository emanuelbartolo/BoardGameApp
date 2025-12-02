const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");

exports.bggProxy = functions.https.onRequest(async (request, response) => {
  // Set CORS headers for the browser
  response.set("Access-Control-Allow-Origin", "*");

  if (request.method === "OPTIONS") {
    response.set("Access-Control-Allow-Methods", "GET");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.set("Access-Control-Max-Age", "3600");
    response.status(204).send("");
    return;
  }

  const username = request.query.username;
  if (!username) {
    response.status(400).send("Missing 'username' query parameter");
    return;
  }

  const bggUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1`;

  // These headers make our server's request look like it's from a real browser,
  // which is necessary to get past BGG's anti-bot security.
  const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://boardgamegeek.com/',
    'Connection': 'keep-alive',
  };

  try {
    logger.info(`Fetching BGG collection for: ${username} with full headers.`);
    const bggResponse = await fetch(bggUrl, { headers: requestHeaders });

    if (!bggResponse.ok) {
      throw new Error(`BGG API error! status: ${bggResponse.status} ${bggResponse.statusText}`);
    }

    const xmlText = await bggResponse.text();
    response.set("Content-Type", "text/xml");
    response.send(xmlText);

  } catch (error) {
    logger.error("BGG Proxy error:", error);
    response.status(500).send(`Error fetching BGG data: ${error.message}`);
  }
});