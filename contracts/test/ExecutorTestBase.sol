// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CobiaAdapterRegistry} from "../src/CobiaAdapterRegistry.sol";
import {CobiaExecutorV1} from "../src/CobiaExecutorV1.sol";
import {ICobiaExecutorV1} from "../src/interfaces/ICobiaExecutorV1.sol";

interface ExecutorVm {
    function addr(uint256 privateKey) external returns (address);
    function chainId(uint256 newChainId) external;
    function deal(address account, uint256 newBalance) external;
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract MockSixDecimalToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract MockRouteProtocol {
    error DeliberateFailure();

    function supply(address token, address receiptToken, uint256 amount, address beneficiary) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        MockSixDecimalToken(receiptToken).mint(beneficiary, amount);
    }

    function fail() external pure {
        revert DeliberateFailure();
    }
}

contract MockReentrantProtocol {
    bytes private payload;

    function setPayload(bytes calldata value) external {
        payload = value;
    }

    function attack(address executor) external {
        (bool success,) = executor.call(payload);
        require(success, "reentry rejected");
    }
}

abstract contract ExecutorTestBase {
    ExecutorVm internal constant vm = ExecutorVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant VERIFIER_KEY = 0xA11CE;
    uint256 internal constant WRONG_KEY = 0xB0B;
    bytes32 internal constant AAVE_ID = keccak256("aave-v3@1");
    bytes32 internal constant NONCE = keccak256("nonce-1");
    uint128 internal constant ROUTE_CAP = 10_000_000;

    address internal owner = address(0xCAFE);
    address internal other = address(0xBEEF);
    MockSixDecimalToken internal inputToken;
    MockSixDecimalToken internal otherInputToken;
    MockSixDecimalToken internal receiptToken;
    MockRouteProtocol internal protocol;
    MockReentrantProtocol internal reentrantProtocol;
    CobiaAdapterRegistry internal registry;
    CobiaExecutorV1 internal executor;

    function setUp() public virtual {
        vm.chainId(196);
        inputToken = new MockSixDecimalToken("USDG", "USDG");
        otherInputToken = new MockSixDecimalToken("USDt0", "USDt0");
        receiptToken = new MockSixDecimalToken("aUSDG", "aUSDG");
        protocol = new MockRouteProtocol();
        reentrantProtocol = new MockReentrantProtocol();
        registry = new CobiaAdapterRegistry(address(this));

        address[] memory inputs = new address[](2);
        inputs[0] = address(inputToken);
        inputs[1] = address(otherInputToken);
        address[] memory constraints = new address[](1);
        constraints[0] = address(receiptToken);
        executor = new CobiaExecutorV1(address(this), address(registry), vm.addr(VERIFIER_KEY), inputs, constraints);
        executor.setSelectedWallet(owner, true);
        _activate(AAVE_ID, address(protocol), protocol.supply.selector);
        _activate(AAVE_ID, address(protocol), protocol.fail.selector);
        _activate(AAVE_ID, address(reentrantProtocol), reentrantProtocol.attack.selector);
        vm.warp(block.timestamp + 48 hours);
        _activateProposals();

        inputToken.mint(owner, 1_000_000_000);
        otherInputToken.mint(owner, 1_000_000_000);
        vm.prank(owner);
        inputToken.approve(address(executor), type(uint256).max);
        vm.prank(owner);
        otherInputToken.approve(address(executor), type(uint256).max);
    }

    function _route(bytes32 nonce, uint128 inputAmount)
        internal
        view
        returns (ICobiaExecutorV1.ExecutionRouteV1 memory route)
    {
        ICobiaExecutorV1.StepV1[] memory steps = new ICobiaExecutorV1.StepV1[](1);
        steps[0] = ICobiaExecutorV1.StepV1({
            adapterId: AAVE_ID,
            target: address(protocol),
            spendToken: address(inputToken),
            spendAmount: inputAmount,
            data: abi.encodeCall(protocol.supply, (address(inputToken), address(receiptToken), inputAmount, owner))
        });
        ICobiaExecutorV1.BalanceConstraintV1[] memory constraints = new ICobiaExecutorV1.BalanceConstraintV1[](1);
        constraints[0] = ICobiaExecutorV1.BalanceConstraintV1({
            token: address(receiptToken), account: owner, minimumIncrease: inputAmount
        });
        route = ICobiaExecutorV1.ExecutionRouteV1({
            policyHash: keccak256("policy"),
            snapshotHash: keccak256("snapshot"),
            bundleHash: keccak256("bundle"),
            routeHash: bytes32(0),
            simulationHash: keccak256("simulation"),
            owner: owner,
            inputToken: address(inputToken),
            inputAmount: inputAmount,
            deadline: uint64(block.timestamp + 5 minutes),
            nonce: nonce,
            steps: steps,
            constraints: constraints
        });
        route.routeHash = executor.hashRoute(route);
    }

    function _authorization(ICobiaExecutorV1.ExecutionRouteV1 memory route)
        internal
        pure
        returns (ICobiaExecutorV1.VerifierAuthorizationV1 memory)
    {
        return ICobiaExecutorV1.VerifierAuthorizationV1({routeHash: route.routeHash, validUntil: route.deadline});
    }

    function _signature(
        ICobiaExecutorV1.ExecutionRouteV1 memory route,
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization,
        uint256 key
    ) internal returns (bytes memory) {
        bytes32 digest = executor.authorizationDigest(route, authorization);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _execute(ICobiaExecutorV1.ExecutionRouteV1 memory route) internal {
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization = _authorization(route);
        bytes memory signature = _signature(route, authorization, VERIFIER_KEY);
        vm.prank(owner);
        executor.execute(route, authorization, signature);
    }

    function _expectExecutionRevert(ICobiaExecutorV1.ExecutionRouteV1 memory route, bytes4 selector) internal {
        ICobiaExecutorV1.VerifierAuthorizationV1 memory authorization = _authorization(route);
        bytes memory signature = _signature(route, authorization, VERIFIER_KEY);
        vm.prank(owner);
        vm.expectRevert(selector);
        executor.execute(route, authorization, signature);
    }

    bytes32[] private proposalKeys;

    function _activate(bytes32 adapterId, address target, bytes4 selector) private {
        proposalKeys.push(registry.propose(adapterId, target, selector, target.codehash));
    }

    function _activateProposals() private {
        for (uint256 index; index < proposalKeys.length; ++index) {
            registry.activate(proposalKeys[index]);
        }
    }
}
