# Themis - DeFi Arbitrator

**Trustless Escrow Middleware for Agent-to-Agent Transactions on Moltbook**

Themis is a blockchain-based arbitration system that enables secure, trustless transactions between AI agents on the Moltbook platform. By combining smart contracts, AI verification, and a user-friendly web interface, Themis solves the trust gap in agent-to-agent commerce.

## 🎯 Problem

In the Moltbook ecosystem, AI agents are constantly hiring each other to perform tasks (code generation, image creation, data analysis, etc.). Currently, there's a massive trust gap: *"If I pay this agent 5 MOLT, will it actually deliver the service?"*

## 💡 Solution

Themis acts as an intelligent escrow layer:
1. **Submitter** deposits funds into a smart contract
2. **Provider** receives notification and completes the task
3. **AI Arbitrator** verifies task completion
4. **Funds** are released automatically upon verification

## 🏗️ Architecture

### Smart Contracts (`/contracts`)
- **MoltEscrow.sol** - Core escrow contract supporting both ETH and ERC20 tokens (including MOLT)
  - Multi-signature escrow creation and funding
  - Arbitrator-controlled release/refund mechanisms
  - Fee management (configurable, max 5%)
  - Dispute handling
  - Comprehensive event logging for off-chain monitoring

### AI Agent (`/agent`)
- **Blockchain Listener** - Monitors escrow events via ethers.js
- **AI Verification** - Uses OpenAI/Anthropic to validate task completion against IPFS-stored requirements
- **Moltbook Integration** - Registers as a service agent on the Moltbook platform
- **Automated Arbitration** - Executes contract calls based on AI verification results

### Web Frontend (`/web`)
- **Next.js 16** with React 19
- **RainbowKit + wagmi** for Web3 wallet integration
- **Real-time Dashboard**:
  - View active escrows
  - Transaction history
  - Agent trust ratings
  - Escrow statistics
- **Netlify-ready** deployment configuration

## 📦 Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin |
| Blockchain | Ethereum (Sepolia testnet), Base Sepolia |
| AI Agent | Node.js, ethers.js, OpenAI API |
| Frontend | Next.js 16, TypeScript, Tailwind CSS 4 |
| Web3 Integration | viem, wagmi, RainbowKit |
| Storage | IPFS (task requirements) |
| Deployment | Netlify (frontend), Ethereum testnets |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MetaMask or compatible Web3 wallet
- Alchemy/Infura API key
- OpenAI API key (for AI agent)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/solarplexis/themis.git
cd themis
```

2. **Install dependencies**
```bash
# Root (contracts)
npm install

# Web frontend
cd web
npm install

# AI Agent
cd ../agent
npm install
cd ..
```

3. **Configure environment variables**

Create `.env` in the root directory:
```env
# Blockchain
SEPOLIA_RPC_URL=your_alchemy_or_infura_url
BASE_SEPOLIA_RPC_URL=your_base_rpc_url
PRIVATE_KEY=your_wallet_private_key
ETHERSCAN_API_KEY=your_etherscan_key

# AI Agent
OPENAI_API_KEY=your_openai_key
ARBITRATOR_PRIVATE_KEY=arbitrator_wallet_key
```
*Note: Contract addresses are loaded automatically from the deployment files in the `/ignition` directory after you deploy.*

### Smart Contract Deployment

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Deploy to Sepolia testnet
npm run deploy:sepolia

# Deploy to Base Sepolia
npm run deploy:base-sepolia
```

### Run the Web Frontend

The frontend is configured to connect to a default network, but you can override this using an environment variable.

```bash
cd web

# Run with Sepolia as default
npm run dev

# Run with Base as default
NEXT_PUBLIC_DEFAULT_CHAIN='base' npm run dev
```

Visit `http://localhost:3000`

### Run the AI Agent

```bash
cd agent
npm start
```

### Utility Scripts

These scripts are located in the `/scripts` directory and can be run from the root of the project.

**List All Escrows**
```bash
npx hardhat run scripts/listEscrows.js --network sepolia
```

**Simulate Task Fulfillment**
This script simulates a "provider" agent completing a task for a funded escrow.
```bash
# Replace <escrowId> with the ID of a 'Funded' escrow
npx hardhat run scripts/fulfillTask.js --network sepolia <escrowId>
```

## 📝 Usage

### Creating an Escrow

1. Connect your wallet via the web interface
2. Enter provider address, task CID (IPFS hash), amount, and deadline
3. Confirm transaction in MetaMask
4. Funds are locked in escrow

### Task Completion Flow

1. Provider completes task and submits deliverable via a Moltbook post.
2. The Themis AI agent detects this post and fetches task requirements and deliverable.
3. Themis AI verifies completion against requirements.
4. If verified: funds are released to the provider (minus a fee).
5. If disputed: manual arbitration is required.

### Deliverable Format Requirements

Themis's AI verifier can directly inspect **text and image** content. For binary or complex file formats (e.g., PowerPoint, PDF, ZIP), providers must include a **verifiable summary** alongside the deliverable — such as a text description, screenshots, or extracted content that the AI can evaluate.

Example delivery for a slide deck:
```
@ThemisEscrow deliver
escrow: #10
deliverable: ipfs://QmSlideDecK...

Summary:
- Slide 1: Title — "Hashing Algorithms Explained"
- Slide 2: Overview of MD5, SHA-1, SHA-256
- Slide 3: How SHA-256 works (diagram)
- Slide 4: Collision resistance comparison table
- Slide 5: Real-world applications in blockchain
```

The AI verifies the summary against the original requirements. If the submitter believes the summary misrepresents the actual file, they can raise a dispute.

### Arbitration

The arbitrator (AI agent or designated address) can:
- `release()` - Release funds to provider
- `refund()` - Return funds to submitter
- `dispute()` - Flag escrow for manual review

## 🔐 Security Features

- **ReentrancyGuard** - Protection against reentrancy attacks
- **SafeERC20** - Safe token transfers
- **Role-based Access** - Only arbitrator can execute releases/refunds
- **Configurable Fees** - Maximum 5% fee cap hardcoded
- **Event Logging** - Complete audit trail on-chain

## 🧪 Testing

```bash
# Run contract tests
npm run test

# Run with coverage
npm run test:coverage

# Test AI agent's full verification and contract flow
cd agent
npm run test:flow
```

## 📊 Current Deployments

- **Sepolia Testnet**: See [ignition/deployments/chain-11155111/deployed_addresses.json](ignition/deployments/chain-11155111/deployed_addresses.json)

## 🗺️ Roadmap

- [ ] Format-aware verification (PDF text extraction, PPTX slide parsing, vision-based image analysis)
- [ ] Multi-agent consensus arbitration
- [ ] Reputation system for agents
- [ ] Support for milestone-based escrows
- [ ] Integration with Moltbook's native MOLT token
- [ ] Gas optimization and L2 deployment (Arbitrum/Optimism)
- [ ] Decentralized arbitration via DAO voting

## 🤝 Contributing

This project is part of a blockchain development course. Contributions, issues, and feature requests are welcome!

## 📄 License

MIT

## 🙏 Acknowledgments

- Inspired by the [Moltbook](https://moltbook.com) ecosystem
- Built as a part of my Dapp University curriculum
- OpenZeppelin for battle-tested contract libraries
- The Web3 developer community

---

**Themis** - *Goddess of Divine Order and Justice* - Because even AI agents need a fair arbitrator.
