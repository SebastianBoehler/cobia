// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CobiaAdapterRegistry} from "../../src/CobiaAdapterRegistry.sol";
import {CobiaExecutorV1} from "../../src/CobiaExecutorV1.sol";

interface ExecutorVm {
    function addr(uint256 privateKey) external returns (address);
    function etch(address target, bytes calldata code) external;
    function expectRevert(bytes4 revertData) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract MockToken {
    string public symbol;
    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    constructor(string memory tokenSymbol) {
        symbol = tokenSymbol;
    }

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address owner, address recipient, uint256 amount)
        external
        returns (bool)
    {
        uint256 approved = allowance[owner][msg.sender];
        require(approved >= amount, "allowance");
        if (approved != type(uint256).max) allowance[owner][msg.sender] = approved - amount;
        _transfer(owner, recipient, amount);
        return true;
    }

    function _transfer(address owner, address recipient, uint256 amount) private {
        require(balanceOf[owner] >= amount, "balance");
        balanceOf[owner] -= amount;
        balanceOf[recipient] += amount;
    }
}

contract MockProtocol {
    bool public failNext;

    function setFailNext(bool value) external {
        failNext = value;
    }

    function supply(
        MockToken input,
        MockToken receipt,
        address beneficiary,
        uint256 amount
    ) external {
        if (failNext) revert("protocol failure");
        input.transferFrom(msg.sender, address(this), amount);
        receipt.mint(beneficiary, amount);
    }

    function supplyPartial(
        MockToken input,
        MockToken receipt,
        address beneficiary,
        uint256 amount
    ) external {
        input.transferFrom(msg.sender, address(this), amount - 1);
        receipt.mint(beneficiary, amount - 1);
    }

    function profitableRoundTrip(MockToken token, uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        token.mint(msg.sender, amount + 1);
    }

    function callExecutor(address target, bytes calldata payload) external {
        (bool success,) = target.call(payload);
        require(success, "nested execution failed");
    }
}

abstract contract ExecutorTestBase {
    ExecutorVm internal constant vm = ExecutorVm(
        address(uint160(uint256(keccak256("hevm cheat code"))))
    );
    bytes32 internal constant AAVE_ID = keccak256("aave-v3@1");
    uint256 internal constant VERIFIER_KEY = 0xA11CE;
    uint128 internal constant ROUTE_CAP = 10_000_000;
    address internal constant OWNER = address(0xC0B1A);

    CobiaAdapterRegistry internal registry;
    CobiaExecutorV1 internal executor;
    MockToken internal input;
    MockToken internal receipt;
    MockProtocol internal protocol;

    function setUp() public virtual {
        registry = new CobiaAdapterRegistry(address(this));
        input = new MockToken("USDG");
        receipt = new MockToken("aUSDG");
        protocol = new MockProtocol();
        bytes32 key = registry.permissionKey(AAVE_ID, address(protocol), protocol.supply.selector);
        registry.propose(AAVE_ID, address(protocol), protocol.supply.selector, address(protocol).codehash);
        vm.warp(block.timestamp + 48 hours);
        registry.activate(key);

        address[] memory supported = new address[](2);
        supported[0] = address(input);
        supported[1] = address(receipt);
        executor = new CobiaExecutorV1(
            address(this),
            registry,
            vm.addr(VERIFIER_KEY),
            supported
        );
        executor.setWalletAllowed(OWNER, true);
        executor.setPaused(false);
        input.mint(OWNER, 100_000_000);
        vm.prank(OWNER);
        input.approve(address(executor), type(uint256).max);
    }

    function route(uint128 amount)
        internal
        view
        returns (CobiaExecutorV1.ExecutionRouteV1 memory value)
    {
        CobiaExecutorV1.StepV1[] memory steps = new CobiaExecutorV1.StepV1[](1);
        steps[0] = CobiaExecutorV1.StepV1({
            adapterId: AAVE_ID,
            target: address(protocol),
            spendToken: address(input),
            spendAmount: amount,
            data: abi.encodeCall(protocol.supply, (input, receipt, OWNER, amount))
        });
        CobiaExecutorV1.BalanceConstraintV1[] memory constraints =
            new CobiaExecutorV1.BalanceConstraintV1[](1);
        constraints[0] = CobiaExecutorV1.BalanceConstraintV1({
            token: address(receipt),
            account: OWNER,
            minimumIncrease: amount
        });
        value = CobiaExecutorV1.ExecutionRouteV1({
            policyHash: keccak256("policy"),
            snapshotHash: keccak256("snapshot"),
            bundleHash: keccak256("bundle"),
            routeHash: keccak256("route"),
            simulationHash: keccak256("simulation"),
            owner: OWNER,
            inputToken: address(input),
            inputAmount: amount,
            deadline: uint64(block.timestamp + 300),
            nonce: keccak256(abi.encode("nonce", amount)),
            steps: steps,
            constraints: constraints
        });
    }

    function authorization(CobiaExecutorV1.ExecutionRouteV1 memory value)
        internal
        view
        returns (CobiaExecutorV1.VerifierAuthorizationV1 memory)
    {
        return CobiaExecutorV1.VerifierAuthorizationV1({
            executor: address(executor),
            chainId: block.chainid,
            routeCommitment: executor.executionRouteHash(value),
            policyHash: value.policyHash,
            snapshotHash: value.snapshotHash,
            bundleHash: value.bundleHash,
            routeHash: value.routeHash,
            simulationHash: value.simulationHash,
            constraintsHash: executor.balanceConstraintsHash(value.constraints),
            owner: value.owner,
            inputToken: value.inputToken,
            inputAmount: value.inputAmount,
            deadline: value.deadline,
            nonce: value.nonce
        });
    }

    function sign(CobiaExecutorV1.VerifierAuthorizationV1 memory value)
        internal
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            VERIFIER_KEY,
            executor.authorizationDigest(value)
        );
        return abi.encodePacked(r, s, v);
    }
}
