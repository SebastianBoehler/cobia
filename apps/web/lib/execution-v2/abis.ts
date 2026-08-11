import { parseAbi } from "viem";

// Minimal interfaces pinned to official sources:
// https://eips.ethereum.org/EIPS/eip-20
// https://github.com/aave-dao/aave-v3-origin/blob/cff15de6d1271b0c800fc001f4aea4c263e8a597/src/contracts/interfaces/IPool.sol
// https://github.com/Uniswap/swap-router-contracts/blob/70bc2e40dfca294c1cea9bf67a4036732ee54303/contracts/interfaces/IV3SwapRouter.sol
// https://github.com/Uniswap/swap-router-contracts/blob/70bc2e40dfca294c1cea9bf67a4036732ee54303/contracts/interfaces/IMulticallExtended.sol
export const ERC20_APPROVE_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const ERC20_STATE_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

export const ERC20_APPROVAL_EVENT_ABI = parseAbi([
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

export const AAVE_POOL_SUPPLY_ABI = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
]);

export const AAVE_EXECUTION_STATE_ABI = parseAbi([
  "function getReserveNormalizedIncome(address asset) view returns (uint256)",
]);

export const A_TOKEN_EXECUTION_STATE_ABI = parseAbi([
  "function scaledBalanceOf(address user) view returns (uint256)",
]);

export const AAVE_SUPPLY_EVENT_ABI = parseAbi([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
]);

export const A_TOKEN_MINT_EVENT_ABI = parseAbi([
  "event Mint(address indexed caller, address indexed onBehalfOf, uint256 value, uint256 balanceIncrease, uint256 index)",
]);

export const SWAP_ROUTER02_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
]);

export const UNISWAP_SWAP_EVENT_ABI = parseAbi([
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
]);

export const NONFUNGIBLE_POSITION_MANAGER_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function ownerOf(uint256 tokenId) view returns (address owner)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

export const NONFUNGIBLE_POSITION_MANAGER_EVENT_ABI = parseAbi([
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

export const ERC721_TRANSFER_EVENT_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);
