const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params"); // Corrected: Use defineSecret
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");

// Corrected: Define the OpenRouter API key as a SECRET
const openrouterApiKey = defineSecret("OPENROUTER_API_KEY");

exports.generateAiSummary = onRequest({secrets: [openrouterApiKey]}, async (request, response) => {
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        // Handle preflight requests
        response.status(204).send('');
        return;
    }

    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    const {prompt} = request.body;
    if (!prompt) {
      response.status(400).send("Missing prompt in request body");
      return;
    }

    // Access the secret's value using .value()
    const apiKey = openrouterApiKey.value();
    if (!apiKey) {
      logger.error("OPENROUTER_API_KEY secret is not available.");
      response.status(500).send("API key is not configured.");
      return;
    }

    try {
      const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "model": "google/gemma-3-27b-it:free",
          "messages": [{ "role": "user", "content": prompt }],
        }),
      });

      if (!apiResponse.ok) {
        const errorBody = await apiResponse.text();
        logger.error("OpenRouter API error:", apiResponse.status, errorBody);
        response.status(apiResponse.status).send("Error from OpenRouter API.");
        return;
      }

      const data = await apiResponse.json();
      const summary = data.choices[0].message.content;

      response.status(200).json({ summary });
    } catch (error) {
      logger.error("Internal function error:", error);
      response.status(500).send("An internal error occurred.");
    }
});
