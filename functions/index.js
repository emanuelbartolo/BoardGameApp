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

// Configurable server-side limits and LLM params (environment variables)
const SERVER_MAX_INPUT_CHARS = parseInt(process.env.OPENROUTER_MAX_INPUT_CHARS || '1200000', 10); // default 1.2M chars
const OPENROUTER_DEFAULT_TEMPERATURE = parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.0');
const OPENROUTER_DEFAULT_MAX_OUTPUT = parseInt(process.env.OPENROUTER_MAX_OUTPUT_TOKENS || '256', 10);

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

      // Guard input size
      if (String(prompt).length > SERVER_MAX_INPUT_CHARS) {
        response.status(413).send(`Prompt too large (>${SERVER_MAX_INPUT_CHARS} chars).`);
        return;
      }

      // Prepare OpenRouter request with timeout
      const controller = new AbortController();
      const timeoutMs = parseInt(process.env.OPENROUTER_REQUEST_TIMEOUT_MS || '120000', 10); // default 120s
      const to = setTimeout(() => controller.abort(), timeoutMs);

      const apiBody = {
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: OPENROUTER_DEFAULT_TEMPERATURE,
        max_output_tokens: OPENROUTER_DEFAULT_MAX_OUTPUT
      };

      const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiBody),
        signal: controller.signal
      });
      clearTimeout(to);

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

// New callable chat function with history support: generateAiChatV2
// Accepts { messages: [{role,content}, ...], conversationId?, model? }
// Persists messages under ai_chats/{conversationId}/messages and returns { summary, conversationId }
// Ensure the OpenRouter secret is available to this callable function
// Increase timeout for long-running LLM requests
exports.generateAiChatV2 = onCall({ secrets: [openrouterApiKey], timeoutSeconds: 540 }, async (request) => {
  const data = request.data || {};
  const incoming = Array.isArray(data.messages) ? data.messages
                    : (data.prompt ? [{ role: 'user', content: String(data.prompt) }] : null);
  const providedConvoId = data.conversationId ? String(data.conversationId) : null;
  const modelName = data.model ? String(data.model) : (process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it:free');

  if (!incoming || !incoming.length) {
    throw new Error('Missing messages or prompt');
  }

  // Basic size guard (configurable)
  const totalLength = incoming.reduce((acc, m) => acc + (m && m.content ? String(m.content).length : 0), 0);
  if (totalLength > SERVER_MAX_INPUT_CHARS) {
    throw new Error(`Message payload too large (>${SERVER_MAX_INPUT_CHARS} chars)`);
  }

  const apiKey = openrouterApiKey.value();
  if (!apiKey) {
    throw new Error('API key not configured');
  }

  const normalized = incoming.map(m => ({ role: (m.role || 'user'), content: String(m.content || '') }));

  // determine conversation id (create new if needed)
  let conversationId = providedConvoId;
  if (!conversationId) conversationId = crypto.randomBytes(10).toString('hex');

  const chatCol = db.collection('ai_chats').doc(conversationId).collection('messages');

  try {
    // Persist incoming messages (batched)
    const batch = db.batch();
    normalized.forEach((m, idx) => {
      const docRef = chatCol.doc(); // auto ID
      batch.set(docRef, {
        role: m.role,
        content: m.content,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: { fromClient: true, index: idx }
      });
    });
    await batch.commit();

    // Forward full messages to OpenRouter with controlled params and timeout
    const controller = new AbortController();
    const timeoutMs = parseInt(process.env.OPENROUTER_REQUEST_TIMEOUT_MS || '120000', 10);
    const to = setTimeout(() => controller.abort(), timeoutMs);

    const apiBody = {
      model: modelName,
      messages: normalized,
      temperature: OPENROUTER_DEFAULT_TEMPERATURE,
      max_output_tokens: OPENROUTER_DEFAULT_MAX_OUTPUT
    };

    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apiBody),
      signal: controller.signal
    });
    clearTimeout(to);

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      logger.error('OpenRouter error', apiResponse.status, errText);
      // Return a structured error instead of throwing to make debugging easier for clients
      return { error: 'OpenRouter API error', details: `status:${apiResponse.status} body:${errText}` };
    }

    const apiData = await apiResponse.json();
    const assistantText = apiData.choices && apiData.choices[0] && apiData.choices[0].message && apiData.choices[0].message.content
                          ? apiData.choices[0].message.content
                          : '';

    // Persist assistant reply
    await chatCol.add({
      role: 'assistant',
      content: assistantText,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: { fromServer: true }
    });

    return { summary: assistantText, conversationId };
  } catch (err) {
    logger.error('generateAiChatV2 error', err);
    // Return structured error info instead of throwing so the client can display details
    return { error: 'AI request failed', details: (err && err.message) ? String(err.message) : String(err) };
  }
});

// Note: conversation deletion is performed client-side to avoid extra callable/CORS complexity.
