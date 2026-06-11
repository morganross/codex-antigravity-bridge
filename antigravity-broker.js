import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

// Configuration paths
const CAM_HOME = path.join(os.homedir(), ".codex-agent-manager");
const CONFIG_FILE = path.join(CAM_HOME, "config.json");
const TOKEN_FILE = path.join(CAM_HOME, "secrets", "local-api-token");

const MAPPINGS_FILE = "C:\\Users\\kjhgf\\.gemini\\antigravity\\scratch\\broker_mappings.json";
const AGY_EXE = "C:\\Users\\kjhgf\\AppData\\Local\\Programs\\Antigravity\\resources\\bin\\language_server.exe";
const BRAIN_DIR = "C:\\Users\\kjhgf\\.gemini\\antigravity\\brain";

const AGENT_NAME = "antigravity";
let lastProcessedMessageId = null;
let isProcessing = false;

// Helpers to get CAM config and token
function getCamConfig() {
  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return { port: 37631 };
  }
}

function getCamToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch (e) {
    return "";
  }
}

// Load/Save mappings
function loadMappings() {
  try {
    if (fs.existsSync(MAPPINGS_FILE)) {
      return JSON.parse(fs.readFileSync(MAPPINGS_FILE, "utf8"));
    }
  } catch (e) {}
  return {};
}

function saveMappings(mappings) {
  try {
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), "utf8");
  } catch (e) {}
}

// Run language_server.exe
function runAgyCommand(args) {
  return new Promise((resolve, reject) => {
    const fullArgs = ["agentapi", ...args];
    console.log(`[AGY CLI] Running language_server.exe ${fullArgs.join(" ")}`);
    const child = spawn(AGY_EXE, fullArgs, {
      cwd: "C:\\Users\\kjhgf\\.gemini\\antigravity\\scratch",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Exit code ${code}. Stderr: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse response JSON: ${e.message}. Raw: ${stdout}`));
      }
    });
  });
}

// Watch transcript.jsonl natively
async function pollAgyTranscript(conversationId, startByte = 0) {
  const logDir = path.join(BRAIN_DIR, conversationId, ".system_generated", "logs");
  const logFile = path.join(logDir, "transcript.jsonl");
  console.log(`[BROKER] Watching transcript: ${logFile} from byte ${startByte}`);

  // Wait up to 10 seconds for the directory to be created
  let attempts = 0;
  while (!fs.existsSync(logDir) && attempts < 20) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  if (!fs.existsSync(logDir)) {
    throw new Error(`Directory ${logDir} was never created.`);
  }

  return new Promise((resolve, reject) => {
    let watcher;
    const timeout = setTimeout(() => {
      if (watcher) watcher.close();
      reject(new Error("Timeout waiting for Antigravity response"));
    }, 120000); // 2 min timeout

    // Check if the file already has the response appended since startByte
    if (fs.existsSync(logFile)) {
      const currentSize = fs.statSync(logFile).size;
      if (currentSize > startByte) {
        const buffer = Buffer.alloc(currentSize - startByte);
        const fd = fs.openSync(logFile, "r");
        fs.readSync(fd, buffer, 0, buffer.length, startByte);
        fs.closeSync(fd);
        
        startByte = currentSize; // update startByte
        
        const text = buffer.toString("utf8");
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const step = JSON.parse(line);
            if (step.source === "MODEL" && step.type === "PLANNER_RESPONSE" && step.status === "DONE") {
              clearTimeout(timeout);
              console.log(`[BROKER] Found Antigravity response: "${step.content}"`);
              resolve(step.content);
              return;
            }
          } catch (e) {}
        }
      }
    }

    watcher = fs.watch(logDir, (eventType, filename) => {
      if (filename !== "transcript.jsonl") return;
      if (!fs.existsSync(logFile)) return;

      const currentSize = fs.statSync(logFile).size;
      if (currentSize > startByte) {
        const buffer = Buffer.alloc(currentSize - startByte);
        const fd = fs.openSync(logFile, "r");
        fs.readSync(fd, buffer, 0, buffer.length, startByte);
        fs.closeSync(fd);
        
        startByte = currentSize;
        
        const text = buffer.toString("utf8");
        const lines = text.split(/\r?\n/).filter(Boolean);
        
        for (const line of lines) {
          try {
            const step = JSON.parse(line);
            if (step.source === "MODEL" && step.type === "PLANNER_RESPONSE" && step.status === "DONE") {
              clearTimeout(timeout);
              watcher.close();
              console.log(`[BROKER] Found Antigravity response: "${step.content}"`);
              resolve(step.content);
              return;
            }
          } catch (e) {}
        }
      }
    });
  });
}

// Send message natively to CAM via REST
async function sendCamResponse(targetAgent, messageText) {
  const config = getCamConfig();
  const token = getCamToken();
  const url = `http://localhost:${config.port}/send`;

  console.log(`[CAM API] Sending reply back to ${targetAgent}...`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      targetAgent: targetAgent,
      message: messageText,
      sourceAgent: AGENT_NAME
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to send response via API: ${response.status} ${err}`);
  }
  
  const json = await response.json();
  console.log(`[CAM API] Successfully delivered message!`);
  return json;
}

// Process an incoming Codex message
async function processMessage(msg) {
  isProcessing = true;
  console.log(`\n--- [NEW INCOMING MESSAGE] ---`);
  console.log(`ID: ${msg.messageId}`);
  console.log(`From: ${msg.sourceAgent} @ ${msg.sourceNode}`);
  console.log(`Body: "${msg.body}"`);
  console.log(`-----------------------------`);

  try {
    const mappings = loadMappings();
    let conversationId = mappings[msg.sourceAgent];
    let startByte = 0;

    if (conversationId) {
      console.log(`[BROKER] Reusing conversation: ${conversationId}`);
      const logFile = path.join(BRAIN_DIR, conversationId, ".system_generated", "logs", "transcript.jsonl");
      if (fs.existsSync(logFile)) startByte = fs.statSync(logFile).size;
      
      await runAgyCommand(["send-message", conversationId, msg.body]);
    } else {
      console.log(`[BROKER] Creating new conversation...`);
      const result = await runAgyCommand(["new-conversation", msg.body]);
      conversationId = result.response.newConversation.conversationId;
      console.log(`[BROKER] Created conversation: ${conversationId}`);
      mappings[msg.sourceAgent] = conversationId;
      saveMappings(mappings);
    }

    const reply = await pollAgyTranscript(conversationId, startByte);
    await sendCamResponse(msg.sourceAgent, reply);

  } catch (error) {
    console.error(`[BROKER] Error processing message:`, error.message);
  } finally {
    isProcessing = false;
  }
}

// Main polling function natively calling /agents/read
async function checkInbox() {
  if (isProcessing) return;

  try {
    const config = getCamConfig();
    const token = getCamToken();
    const url = `http://localhost:${config.port}/agents/read?name=${AGENT_NAME}`;

    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      console.error("[BROKER] Fetch error:", res.status, await res.text());
      return;
    }
    
    const data = await res.json();
    if (!data.agent || !data.agent.lastDelivery) return;

    const msg = data.agent.lastDelivery;

    if (lastProcessedMessageId === null) {
      lastProcessedMessageId = msg.messageId;
      console.log(`[BROKER] Initialized baseline messageId to: ${msg.messageId}`);
      return;
    }

    if (msg.messageId !== lastProcessedMessageId) {
      lastProcessedMessageId = msg.messageId;
      await processMessage(msg);
    }

  } catch (e) {
    console.error("[BROKER] Fetch error:", e.message);
  }
}

console.log(`\n==================================================`);
console.log(`[BROKER] Antigravity-Codex Broker Daemon starting (Native Mode)...`);
console.log(`==================================================\n`);

// Perform initial check to set baseline
checkInbox();

// Poll every 1.5 seconds
setInterval(checkInbox, 1500);
