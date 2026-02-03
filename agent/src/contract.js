import { ethers } from "ethers";
import { config } from "./config.js";

// MoltEscrow ABI (only the functions/events we need)
const ABI = [
  // Events
  "event EscrowCreated(uint256 indexed escrowId, address indexed buyer, address indexed seller, address token, uint256 amount, string taskCID, uint256 deadline)",
  "event EscrowFunded(uint256 indexed escrowId, uint256 amount)",
  "event EscrowReleased(uint256 indexed escrowId, uint256 amountToSeller, uint256 fee)",
  "event EscrowRefunded(uint256 indexed escrowId, uint256 amount)",
  "event EscrowDisputed(uint256 indexed escrowId)",

  // Read functions
  "function getEscrow(uint256 _escrowId) view returns (tuple(address buyer, address seller, address token, uint256 amount, string taskCID, uint256 deadline, uint8 status))",
  "function escrowCount() view returns (uint256)",
  "function arbitrator() view returns (address)",

  // Write functions - ETH
  "function createEscrowETH(address _seller, string _taskCID, uint256 _deadline) payable returns (uint256)",

  // Write functions - ERC20
  "function createEscrowERC20(address _token, address _seller, uint256 _amount, string _taskCID, uint256 _deadline) returns (uint256)",

  // Management functions
  "function release(uint256 _escrowId)",
  "function refund(uint256 _escrowId)",
  "function resolveDispute(uint256 _escrowId, bool _releaseTo)",
];

// ERC20 ABI for token approval
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Escrow status enum
export const EscrowStatus = {
  None: 0,
  Funded: 1,
  Released: 2,
  Refunded: 3,
  Disputed: 4,
};

export class MoltEscrowContract {
  constructor(moltbook = null) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.contract = new ethers.Contract(
      config.contractAddress,
      ABI,
      this.wallet
    );
    this.moltbook = moltbook;
  }

  // ============ READ FUNCTIONS ============

  async getEscrow(escrowId) {
    const escrow = await this.contract.getEscrow(escrowId);
    return {
      buyer: escrow[0],
      seller: escrow[1],
      token: escrow[2],
      amount: escrow[3],
      taskCID: escrow[4],
      deadline: escrow[5],
      status: Number(escrow[6]),
    };
  }

  async getEscrowCount() {
    return await this.contract.escrowCount();
  }

  // ============ CREATE ESCROW FUNCTIONS ============

  /**
   * Create an escrow with ETH
   * @param {string} seller - Seller's address
   * @param {string} taskCID - IPFS CID or task requirements
   * @param {number} deadlineHours - Hours from now until deadline
   * @param {string} amountEth - Amount in ETH (e.g., "0.01")
   * @returns {Promise<{escrowId: number, txHash: string}>}
   */
  async createEscrowETH(seller, taskCID, deadlineHours, amountEth) {
    const deadline = Math.floor(Date.now() / 1000) + (deadlineHours * 3600);
    const value = ethers.parseEther(amountEth);

    console.log(`[Contract] Creating ETH escrow...`);
    console.log(`  Seller: ${seller}`);
    console.log(`  Amount: ${amountEth} ETH`);
    console.log(`  Deadline: ${new Date(deadline * 1000).toISOString()}`);

    const tx = await this.contract.createEscrowETH(seller, taskCID, deadline, { value });
    const receipt = await tx.wait();

    // Parse the EscrowCreated event to get the escrow ID
    const event = receipt.logs.find(log => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        return parsed?.name === "EscrowCreated";
      } catch {
        return false;
      }
    });

    const escrowId = event ? Number(this.contract.interface.parseLog(event).args[0]) : null;

    console.log(`[Contract] ETH Escrow created! ID: ${escrowId}, Tx: ${receipt.hash}`);

    await this._announceOnMoltbook(escrowId, this.wallet.address, seller, amountEth, "ETH", receipt.hash);

    return { escrowId, txHash: receipt.hash };
  }

  /**
   * Create an escrow with MOLT tokens
   * @param {string} seller - Seller's address
   * @param {string} taskCID - IPFS CID or task requirements
   * @param {number} deadlineHours - Hours from now until deadline
   * @param {string} amountMolt - Amount in MOLT (e.g., "100")
   * @returns {Promise<{escrowId: number, txHash: string}>}
   */
  async createEscrowMOLT(seller, taskCID, deadlineHours, amountMolt) {
    const moltAddress = config.moltTokenAddress;
    if (!moltAddress) {
      throw new Error("MOLT token not available on this network");
    }

    const deadline = Math.floor(Date.now() / 1000) + (deadlineHours * 3600);
    const amount = ethers.parseUnits(amountMolt, 18);

    // First, approve the contract to spend MOLT
    const moltContract = new ethers.Contract(moltAddress, ERC20_ABI, this.wallet);

    // Check current allowance
    const allowance = await moltContract.allowance(this.wallet.address, config.contractAddress);

    if (allowance < amount) {
      console.log(`[Contract] Approving MOLT spend...`);
      const approveTx = await moltContract.approve(config.contractAddress, amount);
      await approveTx.wait();
      console.log(`[Contract] MOLT approved!`);
    }

    console.log(`[Contract] Creating MOLT escrow...`);
    console.log(`  Seller: ${seller}`);
    console.log(`  Amount: ${amountMolt} MOLT`);
    console.log(`  Deadline: ${new Date(deadline * 1000).toISOString()}`);

    const tx = await this.contract.createEscrowERC20(
      moltAddress,
      seller,
      amount,
      taskCID,
      deadline
    );
    const receipt = await tx.wait();

    // Parse the EscrowCreated event to get the escrow ID
    const event = receipt.logs.find(log => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        return parsed?.name === "EscrowCreated";
      } catch {
        return false;
      }
    });

    const escrowId = event ? Number(this.contract.interface.parseLog(event).args[0]) : null;

    console.log(`[Contract] MOLT Escrow created! ID: ${escrowId}, Tx: ${receipt.hash}`);

    await this._announceOnMoltbook(escrowId, this.wallet.address, seller, amountMolt, "MOLT", receipt.hash);

    return { escrowId, txHash: receipt.hash };
  }

  /**
   * Get MOLT token balance for an address
   * @param {string} address - Address to check
   * @returns {Promise<string>} Balance in MOLT
   */
  async getMOLTBalance(address) {
    const moltAddress = config.moltTokenAddress;
    if (!moltAddress) {
      return "0";
    }

    const moltContract = new ethers.Contract(moltAddress, ERC20_ABI, this.provider);
    const balance = await moltContract.balanceOf(address);
    return ethers.formatUnits(balance, 18);
  }

  // ============ MOLTBOOK ANNOUNCEMENT ============

  async _announceOnMoltbook(escrowId, buyer, seller, amount, token, txHash) {
    if (!this.moltbook) return;

    const explorer = config.chainId === 8453
      ? `https://basescan.org/tx/${txHash}`
      : `https://sepolia.etherscan.io/tx/${txHash}`;

    const content =
      `## New Escrow Created\n\n` +
      `**Escrow #${escrowId}** is now funded and active.\n\n` +
      `- **Buyer**: \`${buyer}\`\n` +
      `- **Seller**: \`${seller}\`\n` +
      `- **Amount**: ${amount} ${token}\n\n` +
      `[View transaction](${explorer})\n\n` +
      `Seller: submit your deliverable by tagging \`@ThemisEscrow deliver\` with the escrow ID and deliverable link.\n\n` +
      `---\n*Secured by Themis*`;

    try {
      await this.moltbook.createPost(content, {
        title: `Escrow #${escrowId} Created — ${amount} ${token}`,
        submolt: "blockchain",
      });
      console.log(`[Contract] Posted escrow #${escrowId} to Moltbook`);
    } catch (error) {
      console.warn(`[Contract] Failed to post to Moltbook: ${error.message}`);
    }
  }

  // ============ MANAGEMENT FUNCTIONS ============

  async release(escrowId) {
    console.log(`[Contract] Releasing escrow #${escrowId}...`);
    const tx = await this.contract.release(escrowId);
    const receipt = await tx.wait();
    console.log(`[Contract] Released! Tx: ${receipt.hash}`);
    return receipt;
  }

  async refund(escrowId) {
    console.log(`[Contract] Refunding escrow #${escrowId}...`);
    const tx = await this.contract.refund(escrowId);
    const receipt = await tx.wait();
    console.log(`[Contract] Refunded! Tx: ${receipt.hash}`);
    return receipt;
  }

  async resolveDispute(escrowId, releaseTo) {
    console.log(
      `[Contract] Resolving dispute #${escrowId} in favor of ${releaseTo ? "seller" : "buyer"}...`
    );
    const tx = await this.contract.resolveDispute(escrowId, releaseTo);
    const receipt = await tx.wait();
    console.log(`[Contract] Resolved! Tx: ${receipt.hash}`);
    return receipt;
  }

  // ============ EVENT QUERIES (polling-based, for public RPCs) ============

  /**
   * Query events by name within a block range
   * @param {string} eventName - "EscrowCreated" or "EscrowDisputed"
   * @param {number} fromBlock - Start block
   * @param {number} toBlock - End block
   */
  async queryEvents(eventName, fromBlock, toBlock) {
    const filter = this.contract.filters[eventName]();
    const events = await this.contract.queryFilter(filter, fromBlock, toBlock);

    if (eventName === "EscrowCreated") {
      return events.map((event) => ({
        escrowId: Number(event.args[0]),
        buyer: event.args[1],
        seller: event.args[2],
        token: event.args[3],
        amount: event.args[4],
        taskCID: event.args[5],
        deadline: Number(event.args[6]),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      }));
    }

    if (eventName === "EscrowDisputed") {
      return events.map((event) => ({
        escrowId: Number(event.args[0]),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      }));
    }

    return events;
  }

  // Get past events (all history)
  async getPastEscrows(fromBlock = 0) {
    return this.queryEvents("EscrowCreated", fromBlock, "latest");
  }
}
