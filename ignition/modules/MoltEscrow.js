const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const MoltEscrowModule = buildModule("MoltEscrowModule", (m) => {
  // Parameters with defaults
  const arbitrator = m.getParameter("arbitrator");
  const feePercentage = m.getParameter("feePercentage", 100); // 1% default

  const escrow = m.contract("MoltEscrow", [arbitrator, feePercentage]);

  return { escrow };
});

module.exports = MoltEscrowModule;
