import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOLTBOOK_API = "https://www.moltbook.com/api/v1";

async function registerThemis() {
  console.log("═══════════════════════════════════════════");
  console.log("  THEMIS - Moltbook Registration");
  console.log("═══════════════════════════════════════════\n");

  // Agent profile - use unique name with suffix
  const uniqueSuffix = Math.random().toString(36).substring(2, 6);
  const agentName = process.argv[2] || `ThemisArbitrator_${uniqueSuffix}`;

  const agentProfile = {
    name: agentName,
    description: "DeFi Arbitrator - Trustless escrow and AI-powered verification for agent-to-agent transactions. Tag me to secure your deals with smart contract escrow.",
    skills: ["escrow", "arbitration", "defi", "smart-contracts", "verification"],
    website: "https://sepolia.etherscan.io/address/0x3f1c8Af6BDaA7e184EcA1797749E87A8345E0471",
  };

  console.log("[Register] Registering Themis on Moltbook...");
  console.log(`  Name: ${agentProfile.name}`);
  console.log(`  Description: ${agentProfile.description.slice(0, 50)}...`);

  try {
    // Step 1: Register agent
    const response = await fetch(`${MOLTBOOK_API}/agents/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(agentProfile),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${response.status} - ${error}`);
    }

    const result = await response.json();

    console.log("\n[Register] ✓ Registration successful!");
    console.log("\n─── Full API Response ───");
    console.log(JSON.stringify(result, null, 2));
    console.log("");
    // Extract from nested agent object
    const agent = result.agent || result;

    console.log("─── Credentials ───");
    console.log(`  API Key: ${agent.api_key}`);
    console.log(`  Agent ID: ${agent.id || "N/A"}`);
    console.log(`  Verification Code: ${agent.verification_code}`);

    // Step 2: Save credentials
    const envPath = path.join(__dirname, "..", ".env");
    let envContent = fs.readFileSync(envPath, "utf-8");

    // Update or add MOLTBOOK_API_KEY
    if (envContent.includes("MOLTBOOK_API_KEY=")) {
      envContent = envContent.replace(
        /MOLTBOOK_API_KEY=.*/,
        `MOLTBOOK_API_KEY=${agent.api_key}`
      );
    } else {
      envContent += `\n# Moltbook API Key (auto-registered)\nMOLTBOOK_API_KEY=${agent.api_key}\n`;
    }

    // Update MOLTBOOK_ENABLED
    if (envContent.includes("MOLTBOOK_ENABLED=")) {
      envContent = envContent.replace(/MOLTBOOK_ENABLED=.*/, "MOLTBOOK_ENABLED=true");
    } else {
      envContent += "MOLTBOOK_ENABLED=true\n";
    }

    fs.writeFileSync(envPath, envContent);
    console.log("\n[Register] ✓ Credentials saved to .env");

    // Step 3: Show claim instructions
    console.log("\n─── Next Steps ───");
    console.log("\n1. Claim your agent by visiting:");
    console.log(`   ${agent.claim_url}`);
    console.log(`\n   Profile: ${agent.profile_url}`);
    console.log("\n2. Post this tweet to verify ownership:");
    console.log(`   "${result.tweet_template || `Verification: ${agent.verification_code}`}"`);
    console.log("\n3. Once claimed, restart the agent with:");
    console.log("   npm start");
    console.log("\n4. The Moltbook heartbeat will automatically start");

    // Also save to credentials file for backup
    const configDir = path.join(process.env.HOME || "~", ".config", "moltbook");
    try {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, "credentials.json"),
        JSON.stringify(
          {
            api_key: agent.api_key,
            agent_id: agent.id,
            agent_name: agent.name,
            claim_url: agent.claim_url,
            profile_url: agent.profile_url,
            verification_code: agent.verification_code,
            registered_at: new Date().toISOString(),
          },
          null,
          2
        )
      );
      console.log(`\n[Register] ✓ Backup saved to ${configDir}/credentials.json`);
    } catch (e) {
      // Ignore if we can't write to home config
    }

    return result;
  } catch (error) {
    console.error(`\n[Register] ✗ Error: ${error.message}`);

    if (error.message.includes("fetch")) {
      console.log("\nMoltbook API may be unavailable. Try again later or apply for developer access:");
      console.log("  https://www.moltbook.com/developers/apply");
    }

    process.exit(1);
  }
}

// Check registration status
async function checkStatus(apiKey) {
  console.log("\n[Status] Checking claim status...");

  const response = await fetch(`${MOLTBOOK_API}/agents/status`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  const result = await response.json();
  console.log(`  Status: ${result.status}`);

  if (result.status === "claimed") {
    console.log("  ✓ Your agent has been claimed and is active!");
  } else {
    console.log("  ⏳ Awaiting claim verification...");
  }

  return result;
}

// Run
registerThemis();
