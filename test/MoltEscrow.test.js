const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MoltEscrow", function () {
  const FEE_PERCENTAGE = 100; // 1%
  const ESCROW_AMOUNT = ethers.parseEther("1.0");
  const TASK_CID = "QmTaskRequirementsCID123";

  async function deployFixture() {
    const [arbitrator, buyer, seller, other] = await ethers.getSigners();

    const MoltEscrow = await ethers.getContractFactory("MoltEscrow");
    const escrow = await MoltEscrow.deploy(arbitrator.address, FEE_PERCENTAGE);

    // Deploy a mock ERC20 token for testing
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy("Mock MOLT", "MOLT", ethers.parseEther("1000000"));

    // Transfer some tokens to buyer
    await token.transfer(buyer.address, ethers.parseEther("10000"));

    const deadline = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now

    return { escrow, token, arbitrator, buyer, seller, other, deadline };
  }

  describe("Deployment", function () {
    it("Should set the correct arbitrator", async function () {
      const { escrow, arbitrator } = await loadFixture(deployFixture);
      expect(await escrow.arbitrator()).to.equal(arbitrator.address);
    });

    it("Should set the correct fee percentage", async function () {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.feePercentage()).to.equal(FEE_PERCENTAGE);
    });

    it("Should reject zero address arbitrator", async function () {
      const MoltEscrow = await ethers.getContractFactory("MoltEscrow");
      await expect(
        MoltEscrow.deploy(ethers.ZeroAddress, FEE_PERCENTAGE)
      ).to.be.revertedWithCustomError(MoltEscrow, "InvalidAddress");
    });

    it("Should reject fee higher than MAX_FEE", async function () {
      const [arbitrator] = await ethers.getSigners();
      const MoltEscrow = await ethers.getContractFactory("MoltEscrow");
      await expect(
        MoltEscrow.deploy(arbitrator.address, 600) // 6% > 5% max
      ).to.be.revertedWithCustomError(MoltEscrow, "FeeTooHigh");
    });
  });

  describe("ETH Escrow", function () {
    it("Should create an ETH escrow", async function () {
      const { escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
          value: ESCROW_AMOUNT,
        })
      )
        .to.emit(escrow, "EscrowCreated")
        .withArgs(1, buyer.address, seller.address, ethers.ZeroAddress, ESCROW_AMOUNT, TASK_CID, deadline);

      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.buyer).to.equal(buyer.address);
      expect(escrowData.seller).to.equal(seller.address);
      expect(escrowData.amount).to.equal(ESCROW_AMOUNT);
      expect(escrowData.status).to.equal(1); // Funded
    });

    it("Should reject escrow with zero value", async function () {
      const { escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
          value: 0,
        })
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });

    it("Should reject escrow with past deadline", async function () {
      const { escrow, buyer, seller } = await loadFixture(deployFixture);
      const pastDeadline = Math.floor(Date.now() / 1000) - 100;

      await expect(
        escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, pastDeadline, {
          value: ESCROW_AMOUNT,
        })
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
    });

    it("Should reject escrow where buyer is seller", async function () {
      const { escrow, buyer, deadline } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(buyer).createEscrowETH(buyer.address, TASK_CID, deadline, {
          value: ESCROW_AMOUNT,
        })
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });
  });

  describe("ERC20 Escrow", function () {
    it("Should create an ERC20 escrow", async function () {
      const { escrow, token, buyer, seller, deadline } = await loadFixture(deployFixture);

      // Approve tokens first
      await token.connect(buyer).approve(escrow.target, ESCROW_AMOUNT);

      await expect(
        escrow.connect(buyer).createEscrowERC20(
          token.target,
          seller.address,
          ESCROW_AMOUNT,
          TASK_CID,
          deadline
        )
      )
        .to.emit(escrow, "EscrowCreated")
        .withArgs(1, buyer.address, seller.address, token.target, ESCROW_AMOUNT, TASK_CID, deadline);

      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.token).to.equal(token.target);
      expect(escrowData.amount).to.equal(ESCROW_AMOUNT);
    });
  });

  describe("Release", function () {
    it("Should release funds to seller with fee", async function () {
      const { escrow, arbitrator, buyer, seller, deadline } = await loadFixture(deployFixture);

      // Create escrow
      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      const arbitratorBalanceBefore = await ethers.provider.getBalance(arbitrator.address);

      // Release
      const tx = await escrow.connect(arbitrator).release(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const expectedFee = ESCROW_AMOUNT * BigInt(FEE_PERCENTAGE) / BigInt(10000);
      const expectedToSeller = ESCROW_AMOUNT - expectedFee;

      expect(await ethers.provider.getBalance(seller.address)).to.equal(
        sellerBalanceBefore + expectedToSeller
      );

      // Arbitrator balance increases by fee minus gas
      expect(await ethers.provider.getBalance(arbitrator.address)).to.equal(
        arbitratorBalanceBefore + expectedFee - gasUsed
      );

      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.status).to.equal(2); // Released
    });

    it("Should only allow arbitrator to release", async function () {
      const { escrow, buyer, seller, other, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      await expect(escrow.connect(other).release(1)).to.be.revertedWithCustomError(
        escrow,
        "OnlyArbitrator"
      );
    });
  });

  describe("Refund", function () {
    it("Should refund funds to buyer", async function () {
      const { escrow, arbitrator, buyer, seller, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      await escrow.connect(arbitrator).refund(1);

      expect(await ethers.provider.getBalance(buyer.address)).to.equal(
        buyerBalanceBefore + ESCROW_AMOUNT
      );

      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.status).to.equal(3); // Refunded
    });

    it("Should only allow arbitrator to refund", async function () {
      const { escrow, buyer, seller, other, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      await expect(escrow.connect(other).refund(1)).to.be.revertedWithCustomError(
        escrow,
        "OnlyArbitrator"
      );
    });
  });

  describe("Dispute", function () {
    it("Should allow buyer to dispute", async function () {
      const { escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      await expect(escrow.connect(buyer).dispute(1))
        .to.emit(escrow, "EscrowDisputed")
        .withArgs(1);

      const escrowData = await escrow.getEscrow(1);
      expect(escrowData.status).to.equal(4); // Disputed
    });

    it("Should allow seller to dispute", async function () {
      const { escrow, buyer, seller, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      await expect(escrow.connect(seller).dispute(1))
        .to.emit(escrow, "EscrowDisputed")
        .withArgs(1);
    });

    it("Should not allow others to dispute", async function () {
      const { escrow, buyer, seller, other, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      await expect(escrow.connect(other).dispute(1)).to.be.revertedWithCustomError(
        escrow,
        "InvalidAddress"
      );
    });
  });

  describe("Resolve Dispute", function () {
    it("Should resolve dispute in favor of seller", async function () {
      const { escrow, arbitrator, buyer, seller, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      await escrow.connect(buyer).dispute(1);

      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

      await escrow.connect(arbitrator).resolveDispute(1, true);

      const expectedFee = ESCROW_AMOUNT * BigInt(FEE_PERCENTAGE) / BigInt(10000);
      const expectedToSeller = ESCROW_AMOUNT - expectedFee;

      expect(await ethers.provider.getBalance(seller.address)).to.equal(
        sellerBalanceBefore + expectedToSeller
      );
    });

    it("Should resolve dispute in favor of buyer", async function () {
      const { escrow, arbitrator, buyer, seller, deadline } = await loadFixture(deployFixture);

      await escrow.connect(buyer).createEscrowETH(seller.address, TASK_CID, deadline, {
        value: ESCROW_AMOUNT,
      });

      await escrow.connect(buyer).dispute(1);

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      await escrow.connect(arbitrator).resolveDispute(1, false);

      expect(await ethers.provider.getBalance(buyer.address)).to.equal(
        buyerBalanceBefore + ESCROW_AMOUNT
      );
    });
  });

  describe("Admin Functions", function () {
    it("Should update arbitrator", async function () {
      const { escrow, arbitrator, other } = await loadFixture(deployFixture);

      await expect(escrow.connect(arbitrator).setArbitrator(other.address))
        .to.emit(escrow, "ArbitratorUpdated")
        .withArgs(arbitrator.address, other.address);

      expect(await escrow.arbitrator()).to.equal(other.address);
    });

    it("Should update fee percentage", async function () {
      const { escrow, arbitrator } = await loadFixture(deployFixture);

      await expect(escrow.connect(arbitrator).setFeePercentage(200))
        .to.emit(escrow, "FeeUpdated")
        .withArgs(FEE_PERCENTAGE, 200);

      expect(await escrow.feePercentage()).to.equal(200);
    });
  });
});
