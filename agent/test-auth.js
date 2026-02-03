import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), "../.env") });

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";
const apiKey = process.env.MOLTBOOK_API_KEY;

console.log("Testing Moltbook authentication...\n");
console.log(`API Key: ${apiKey}`);
console.log(`Endpoint: ${MOLTBOOK_API}/agents/status`);
console.log();

// Test with Authorization header
async function testAuth() {
  try {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };
    
    console.log("Request headers:", JSON.stringify(headers, null, 2));
    console.log();
    
    const response = await fetch(`${MOLTBOOK_API}/agents/status`, {
      headers,
    });
    
    console.log(`Response status: ${response.status}`);
    const result = await response.json();
    console.log("Response body:", JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Test without www subdomain
async function testWithoutWWW() {
  try {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };
    
    console.log("\n--- Testing without www subdomain ---");
    const response = await fetch(`https://moltbook.com/api/v1/agents/status`, {
      headers,
    });
    
    console.log(`Response status: ${response.status}`);
    const result = await response.json();
    console.log("Response body:", JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

console.log("=== Test 1: With www subdomain ===");
await testAuth();

console.log("\n=== Test 2: Without www subdomain ===");
await testWithoutWWW();
