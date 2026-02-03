import { config } from "./src/config.js";
import { MoltbookClient } from "./src/moltbook.js";

console.log("Checking MoltbookClient configuration...\n");
console.log("config.moltbookApiKey:", config.moltbookApiKey);
console.log();

const client = new MoltbookClient();
console.log("client.apiKey:", client.apiKey);
console.log("client.username:", client.username);
console.log();

console.log("Testing getStatus()...");
try {
  const status = await client.getStatus();
  console.log("Success:", JSON.stringify(status, null, 2));
} catch (error) {
  console.error("Error:", error.message);
}
