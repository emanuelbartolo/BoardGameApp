const {onRequest, onCall} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params"); // Corrected: Use defineSecret
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");
const crypto = require("crypto");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Corrected: Define the OpenRouter API key as a SECRET
const openrouterApiKey = defineSecret("OPENROUTER_API_KEY");

// --- Password Hashing Utilities ---
// Using PBKDF2 for password hashing (built into Node crypto, no extra deps)
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = "sha512";

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

function generateSalt() {
  return crypto.randomBytes(32).toString("hex");
}

// --- Set Password Cloud Function ---
// Callable function: setPassword({ username, password })
exports.setPassword = onCall(async (request) => {
  const { username, password } = request.data;

  if (!username || typeof username !== "string") {
    throw new Error("Username is required.");
  }
  if (!password || typeof password !== "string" || password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const userRef = db.collection("users").doc(username);
  await userRef.set({
    passwordHash,
    passwordSalt: salt,
    hasPassword: true,
  }, { merge: true });

  logger.info(`Password set for user: ${username}`);
  return { success: true };
});

// --- Validate Password Cloud Function ---
// Callable function: validatePassword({ username, password })
exports.validatePassword = onCall(async (request) => {
  const { username, password } = request.data;

  if (!username || typeof username !== "string") {
    throw new Error("Username is required.");
  }
  if (!password || typeof password !== "string") {
    throw new Error("Password is required.");
  }

  const userRef = db.collection("users").doc(username);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return { valid: false, error: "User not found." };
  }

  const userData = userDoc.data();
  if (!userData.hasPassword || !userData.passwordHash || !userData.passwordSalt) {
    // User has no password set - allow login without password
    return { valid: true, noPassword: true };
  }

  const hash = await hashPassword(password, userData.passwordSalt);
  const valid = hash === userData.passwordHash;

  return { valid };
});

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
      // Allow caller to override model via request body, else use env var, else default
      const modelName = (request.body && request.body.model) ? String(request.body.model) : (process.env.OPENROUTER_MODEL || "google/gemma-3-27b-it:free");
      logger.info(`Using model: ${modelName}`);

      const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "model": modelName,
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

// Callable LLM helper: generateAiChat
// Client can call via `functions.httpsCallable('generateAiChat')` to avoid CORS issues.
exports.generateAiChat = onCall(async (request) => {
  const { prompt, model } = request.data || {};
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Missing prompt');
  }

  const apiKey = openrouterApiKey.value();
  if (!apiKey) {
    throw new Error('API key not configured');
  }

  try {
    const modelName = model ? String(model) : (process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it:free');
    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: prompt }] })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      throw new Error(`OpenRouter error: ${apiResponse.status} ${errText}`);
    }

    const data = await apiResponse.json();
    const summary = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content ? data.choices[0].message.content : '';
    return { summary };
  } catch (err) {
    logger.error('generateAiChat error', err);
    throw new Error('AI request failed');
  }
});
