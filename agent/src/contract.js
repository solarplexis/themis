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

  // Write functions
  "function release(uint256 _escrowId)",
  "function refund(uint256 _escrowId)",
  "function resolveDispute(uint256 _escrowId, bool _releaseTo)",
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
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.contract = new ethers.Contract(
      config.contractAddress,
      ABI,
      this.wallet
    );
  }

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

  // Listen for new escrows
  onEscrowCreated(callback) {
    this.contract.on("EscrowCreated", (escrowId, buyer, seller, token, amount, taskCID, deadline, event) => {
      callback({
        escrowId: Number(escrowId),
        buyer,
        seller,
        token,
        amount,
        taskCID,
        deadline: Number(deadline),
        transactionHash: event.log.transactionHash,
      });
    });
  }

  onEscrowDisputed(callback) {
    this.contract.on("EscrowDisputed", (escrowId, event) => {
      callback({
        escrowId: Number(escrowId),
        transactionHash: event.log.transactionHash,
      });
    });
  }

  // Get past events
  async getPastEscrows(fromBlock = 0) {
    const filter = this.contract.filters.EscrowCreated();
    const events = await this.contract.queryFilter(filter, fromBlock);
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
}
