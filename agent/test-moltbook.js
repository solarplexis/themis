import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;
const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

async function testAgentProfile() {
  console.log("Testing /agents/me endpoint...");
  console.log(`API Key: ${MOLTBOOK_API_KEY?.substring(0, 20)}...`);
  
  try {
    const response = await fetch(`${MOLTBOOK_API}/agents/me`, {
      headers: {
        "Authorization": `Bearer ${MOLTBOOK_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    console.log(`Response Status: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: ${error}`);
      return;
    }

    const data = await response.json();
    console.log("\nFull Response:");
    console.log(JSON.stringify(data, null, 2));
    
    if (data.agent) {
      console.log(`\nAgent Name: ${data.agent.name}`);
      console.log(`Agent ID: ${data.agent.id}`);
    }
    
    if (data.recentPosts) {
      console.log(`\nRecent Posts: ${data.recentPosts.length}`);
      data.recentPosts.forEach((post, i) => {
        console.log(`\nPost ${i + 1}:`);
        console.log(`  ID: ${post.id}`);
        console.log(`  Title: ${post.title || 'N/A'}`);
        console.log(`  Content: ${post.content?.substring(0, 100)}...`);
      });
    } else {
      console.log("\nNo recentPosts in response");
    }
    
  } catch (error) {
    console.error(`Fetch failed: ${error.message}`);
  }
}

testAgentProfile();
