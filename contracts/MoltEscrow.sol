// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MoltEscrow
 * @notice Trustless escrow for agent-to-agent transactions on Moltbook
 * @dev Supports both native ETH and ERC20 tokens (e.g., MOLT)
 */
contract MoltEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum EscrowStatus {
        None,
        Funded,
        Released,
        Refunded,
        Disputed
    }

    struct Escrow {
        address buyer;
        address seller;
        address token; // address(0) for native ETH
        uint256 amount;
        string taskCID; // IPFS CID of task requirements
        uint256 deadline;
        EscrowStatus status;
    }

    address public arbitrator;
    uint256 public escrowCount;
    uint256 public feePercentage; // in basis points (100 = 1%)
    uint256 public constant MAX_FEE = 500; // 5% max fee

    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        string taskCID,
        uint256 deadline
    );

    event EscrowFunded(uint256 indexed escrowId, uint256 amount);
    event EscrowReleased(uint256 indexed escrowId, uint256 amountToSeller, uint256 fee);
    event EscrowRefunded(uint256 indexed escrowId, uint256 amount);
    event EscrowDisputed(uint256 indexed escrowId);
    event ArbitratorUpdated(address indexed oldArbitrator, address indexed newArbitrator);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    error OnlyArbitrator();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error EscrowNotFunded();
    error EscrowAlreadyFunded();
    error EscrowNotActive();
    error InsufficientFunds();
    error FeeTooHigh();
    error TransferFailed();

    modifier onlyArbitrator() {
        if (msg.sender != arbitrator) revert OnlyArbitrator();
        _;
    }

    constructor(address _arbitrator, uint256 _feePercentage) {
        if (_arbitrator == address(0)) revert InvalidAddress();
        if (_feePercentage > MAX_FEE) revert FeeTooHigh();

        arbitrator = _arbitrator;
        feePercentage = _feePercentage;
    }

    /**
     * @notice Create and fund an escrow with native ETH
     * @param _seller Address of the seller/service provider
     * @param _taskCID IPFS CID containing task requirements
     * @param _deadline Unix timestamp for task completion deadline
     */
    function createEscrowETH(
        address _seller,
        string calldata _taskCID,
        uint256 _deadline
    ) external payable nonReentrant returns (uint256) {
        if (_seller == address(0) || _seller == msg.sender) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();
        if (_deadline <= block.timestamp) revert InvalidDeadline();

        uint256 escrowId = ++escrowCount;

        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: _seller,
            token: address(0),
            amount: msg.value,
            taskCID: _taskCID,
            deadline: _deadline,
            status: EscrowStatus.Funded
        });

        emit EscrowCreated(escrowId, msg.sender, _seller, address(0), msg.value, _taskCID, _deadline);
        emit EscrowFunded(escrowId, msg.value);

        return escrowId;
    }

    /**
     * @notice Create and fund an escrow with ERC20 tokens (e.g., MOLT)
     * @param _token Address of the ERC20 token
     * @param _seller Address of the seller/service provider
     * @param _amount Amount of tokens to escrow
     * @param _taskCID IPFS CID containing task requirements
     * @param _deadline Unix timestamp for task completion deadline
     */
    function createEscrowERC20(
        address _token,
        address _seller,
        uint256 _amount,
        string calldata _taskCID,
        uint256 _deadline
    ) external nonReentrant returns (uint256) {
        if (_token == address(0)) revert InvalidAddress();
        if (_seller == address(0) || _seller == msg.sender) revert InvalidAddress();
        if (_amount == 0) revert InvalidAmount();
        if (_deadline <= block.timestamp) revert InvalidDeadline();

        uint256 escrowId = ++escrowCount;

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: _seller,
            token: _token,
            amount: _amount,
            taskCID: _taskCID,
            deadline: _deadline,
            status: EscrowStatus.Funded
        });

        emit EscrowCreated(escrowId, msg.sender, _seller, _token, _amount, _taskCID, _deadline);
        emit EscrowFunded(escrowId, _amount);

        return escrowId;
    }

    /**
     * @notice Release funds to the seller after successful task verification
     * @param _escrowId ID of the escrow to release
     */
    function release(uint256 _escrowId) external onlyArbitrator nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        if (escrow.status != EscrowStatus.Funded) revert EscrowNotActive();

        escrow.status = EscrowStatus.Released;

        uint256 fee = (escrow.amount * feePercentage) / 10000;
        uint256 amountToSeller = escrow.amount - fee;

        if (escrow.token == address(0)) {
            // Native ETH
            (bool successSeller, ) = payable(escrow.seller).call{value: amountToSeller}("");
            if (!successSeller) revert TransferFailed();

            if (fee > 0) {
                (bool successFee, ) = payable(arbitrator).call{value: fee}("");
                if (!successFee) revert TransferFailed();
            }
        } else {
            // ERC20 token
            IERC20(escrow.token).safeTransfer(escrow.seller, amountToSeller);
            if (fee > 0) {
                IERC20(escrow.token).safeTransfer(arbitrator, fee);
            }
        }

        emit EscrowReleased(_escrowId, amountToSeller, fee);
    }

    /**
     * @notice Refund funds to the buyer if task not completed
     * @param _escrowId ID of the escrow to refund
     */
    function refund(uint256 _escrowId) external onlyArbitrator nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        if (escrow.status != EscrowStatus.Funded) revert EscrowNotActive();

        escrow.status = EscrowStatus.Refunded;

        if (escrow.token == address(0)) {
            (bool success, ) = payable(escrow.buyer).call{value: escrow.amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(escrow.token).safeTransfer(escrow.buyer, escrow.amount);
        }

        emit EscrowRefunded(_escrowId, escrow.amount);
    }

    /**
     * @notice Mark an escrow as disputed for manual review
     * @param _escrowId ID of the escrow to dispute
     */
    function dispute(uint256 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        if (escrow.status != EscrowStatus.Funded) revert EscrowNotActive();
        if (msg.sender != escrow.buyer && msg.sender != escrow.seller) revert InvalidAddress();

        escrow.status = EscrowStatus.Disputed;
        emit EscrowDisputed(_escrowId);
    }

    /**
     * @notice Resolve a disputed escrow (arbitrator only)
     * @param _escrowId ID of the escrow
     * @param _releaseTo True to release to seller, false to refund buyer
     */
    function resolveDispute(uint256 _escrowId, bool _releaseTo) external onlyArbitrator nonReentrant {
        Escrow storage escrow = escrows[_escrowId];
        if (escrow.status != EscrowStatus.Disputed) revert EscrowNotActive();

        if (_releaseTo) {
            escrow.status = EscrowStatus.Released;
            uint256 fee = (escrow.amount * feePercentage) / 10000;
            uint256 amountToSeller = escrow.amount - fee;

            if (escrow.token == address(0)) {
                (bool successSeller, ) = payable(escrow.seller).call{value: amountToSeller}("");
                if (!successSeller) revert TransferFailed();
                if (fee > 0) {
                    (bool successFee, ) = payable(arbitrator).call{value: fee}("");
                    if (!successFee) revert TransferFailed();
                }
            } else {
                IERC20(escrow.token).safeTransfer(escrow.seller, amountToSeller);
                if (fee > 0) {
                    IERC20(escrow.token).safeTransfer(arbitrator, fee);
                }
            }
            emit EscrowReleased(_escrowId, amountToSeller, fee);
        } else {
            escrow.status = EscrowStatus.Refunded;
            if (escrow.token == address(0)) {
                (bool success, ) = payable(escrow.buyer).call{value: escrow.amount}("");
                if (!success) revert TransferFailed();
            } else {
                IERC20(escrow.token).safeTransfer(escrow.buyer, escrow.amount);
            }
            emit EscrowRefunded(_escrowId, escrow.amount);
        }
    }

    /**
     * @notice Update the arbitrator address
     * @param _newArbitrator New arbitrator address
     */
    function setArbitrator(address _newArbitrator) external onlyArbitrator {
        if (_newArbitrator == address(0)) revert InvalidAddress();
        emit ArbitratorUpdated(arbitrator, _newArbitrator);
        arbitrator = _newArbitrator;
    }

    /**
     * @notice Update the fee percentage
     * @param _newFee New fee in basis points
     */
    function setFeePercentage(uint256 _newFee) external onlyArbitrator {
        if (_newFee > MAX_FEE) revert FeeTooHigh();
        emit FeeUpdated(feePercentage, _newFee);
        feePercentage = _newFee;
    }

    /**
     * @notice Get escrow details
     * @param _escrowId ID of the escrow
     */
    function getEscrow(uint256 _escrowId) external view returns (Escrow memory) {
        return escrows[_escrowId];
    }
}
