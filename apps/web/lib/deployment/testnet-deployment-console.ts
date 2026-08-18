import { keccak256, toBytes, toHex } from "viem";
import type { buildAgentExecutorDeploymentPlanV1 } from "./agent-executor-plan";

type DeploymentPlan = ReturnType<typeof buildAgentExecutorDeploymentPlanV1>;

const GAS_LIMITS = [786_432n, 2_200_000n, 3_200_000n, 100_000n] as const;

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function renderTestnetDeploymentConsole(input: {
  plan: DeploymentPlan;
  maxFeePerGas: bigint;
}) {
  const { plan } = input;
  if (plan.chainId !== 1952 || plan.owner !== plan.deployer ||
    plan.proposalTransactions.length !== 1 ||
    plan.proposalTransactions[0]?.label !== "pause-registry" ||
    plan.activationTransactions.length !== 0 || input.maxFeePerGas <= 0n) {
    throw new Error("Unsafe testnet deployment console input");
  }
  const pause = plan.proposalTransactions[0];
  const sequence = [
    ...plan.deployments.map((deployment, index) => ({
      ...deployment,
      kind: "create" as const,
      gas: toHex(GAS_LIMITS[index]),
    })),
    {
      label: pause.label,
      kind: "call" as const,
      nonce: (BigInt(plan.deployments.at(-1)!.nonce) + 1n).toString(),
      to: pause.to,
      data: pause.data,
      value: pause.value,
      gas: toHex(GAS_LIMITS[3]),
    },
  ];
  const commitment = keccak256(toBytes(JSON.stringify(plan)));
  const consoleInput = safeJson({
    chainId: "0x7a0",
    network: {
      chainId: "0x7a0",
      chainName: "X Layer testnet",
      nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
      rpcUrls: ["https://testrpc.xlayer.tech/terigon"],
      blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer-test"],
    },
    account: plan.deployer.toLowerCase(),
    maxFeePerGas: toHex(input.maxFeePerGas),
    maxPriorityFeePerGas: "0x1",
    commitment,
    sequence,
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'">
<title>Cobia X Layer Testnet deployment</title><style>
:root{font:15px/1.45 ui-sans-serif,system-ui;color:#172019;background:#f3f5f1}body{max-width:920px;margin:auto;padding:32px 18px 72px}
h1{margin-bottom:4px}.muted{color:#647067}.commit{background:#172019;color:#edf7ef;border-radius:12px;padding:16px;margin:20px 0}code{font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}
.grid{display:grid;gap:14px}.card{background:#fff;border:1px solid #dce2dc;border-radius:12px;padding:18px}.row{display:flex;justify-content:space-between;gap:16px}button{border:0;border-radius:8px;padding:10px 14px;font-weight:700;background:#172019;color:#fff}button:disabled{opacity:.35}.ok{color:#16703f}.bad{color:#a12b2b}.warn{color:#946b10}textarea{width:100%;height:82px;font:10px ui-monospace,monospace}
</style></head><body><h1>Cobia X Layer Testnet deployment</h1>
<p class="muted">Local wallet signing · chain 1952 · paused empty deployment</p>
<div class="commit"><b>Canonical commitment</b><br><code>${commitment}</code><br>Operator and owner <code>${plan.deployer}</code><br>Verifier <code>${plan.verifier}</code><br>Canary identity <code>${plan.canaryWallet}</code></div>
<p><button id="connect">Connect Cobia Operator</button> <span id="connection" class="muted">Not connected</span></p>
<div class="grid" id="transactions"></div><p class="muted">Signer stays in OKX Wallet. Every transaction requires a separate confirmation.</p>
<script>
const committed=${consoleInput};const cards=[];let provider,account,completed=0;const receipts=[];
const short=a=>a.slice(0,8)+'…'+a.slice(-6);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function status(i,text,kind='muted'){const el=document.querySelector('#status-'+i);el.className=kind;el.textContent=text}
function walletProvider(){if(window.okxwallet?.request)return window.okxwallet;const list=window.ethereum?.providers||[];return list.find(p=>p.isOkxWallet)||window.ethereum}
function setConnected(){document.querySelector('#connection').textContent='Connected: '+short(account)+' · X Layer Testnet';document.querySelector('#connection').className='ok';document.querySelector('#send-'+completed).disabled=false}
async function assertContext(nonce){
  const chain=await provider.request({method:'eth_chainId'});if(chain.toLowerCase()!==committed.chainId)throw new Error('Wrong chain: expected X Layer Testnet 1952');
  const accounts=await provider.request({method:'eth_accounts'});account=(accounts[0]||'').toLowerCase();if(account!==committed.account)throw new Error('Wrong wallet: select Cobia Operator '+short(committed.account));
  const current=await provider.request({method:'eth_getTransactionCount',params:[account,'latest']});if(BigInt(current)!==BigInt(nonce))throw new Error('Nonce changed: expected '+nonce+', got '+BigInt(current));
}
async function tryAuthorizedAccount(){
  provider=walletProvider();if(!provider)return;const accounts=await provider.request({method:'eth_accounts'});if(!accounts.length)return;
  await assertContext(committed.sequence[completed].nonce);setConnected()
}
async function waitReceipt(hash){for(let i=0;i<150;i++){const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[hash]});if(receipt)return receipt;await sleep(2000)}throw new Error('Receipt timeout; stop and reconcile')}
async function connect(){try{provider=walletProvider();if(!provider)throw new Error('OKX Wallet extension not found');await provider.request({method:'wallet_addEthereumChain',params:[committed.network]});await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:committed.chainId}]});await provider.request({method:'eth_requestAccounts'});await assertContext(committed.sequence[completed].nonce);setConnected()}catch(error){document.querySelector('#connection').textContent=error.message;document.querySelector('#connection').className='bad'}}
async function send(index){const tx=committed.sequence[index],button=document.querySelector('#send-'+index);button.disabled=true;try{
  if(index!==completed)throw new Error('Previous transaction is not verified');await assertContext(tx.nonce);status(index,'Review the exact transaction in OKX Wallet…','warn');
  const request={from:account,data:tx.data,value:tx.value,gas:tx.gas,maxFeePerGas:committed.maxFeePerGas,maxPriorityFeePerGas:committed.maxPriorityFeePerGas};if(tx.kind==='call')request.to=tx.to;
  const hash=await provider.request({method:'eth_sendTransaction',params:[request]});status(index,'Submitted '+hash+' · waiting for receipt','warn');const receipt=await waitReceipt(hash);if(receipt.status!=='0x1')throw new Error('Transaction reverted: '+hash);
  if(tx.kind==='create'&&(receipt.contractAddress||'').toLowerCase()!==tx.expectedContract.toLowerCase())throw new Error('Unexpected contract address; stop immediately');
  receipts.push({label:tx.label,transactionHash:hash,blockNumber:BigInt(receipt.blockNumber).toString(),blockHash:receipt.blockHash});status(index,'Verified receipt '+hash,'ok');completed++;
  if(completed<committed.sequence.length){await assertContext(committed.sequence[completed].nonce);document.querySelector('#send-'+completed).disabled=false}else{document.querySelector('#connection').textContent='Deployment sequence complete. Run the independent verifier.';document.querySelector('#evidence').value=JSON.stringify({commitment:committed.commitment,receipts},null,2)}
}catch(error){status(index,error.message+' — do not retry until reconciled','bad')}}
for(const [i,tx] of committed.sequence.entries()){const node=document.createElement('section');node.className='card';const target=tx.kind==='create'?'Expected '+tx.expectedContract:'Registry '+tx.to;node.innerHTML='<div class="row"><div><b>'+(i+1)+'. '+tx.label+'</b><br><span class="muted">Nonce '+tx.nonce+' · gas cap '+BigInt(tx.gas).toLocaleString()+'</span></div><button id="send-'+i+'" disabled>Confirm</button></div><p>'+target+'</p><p id="status-'+i+'" class="muted">Waiting</p><details><summary>Review calldata</summary><textarea readonly>'+tx.data+'</textarea></details>';document.querySelector('#transactions').append(node);node.querySelector('button').onclick=()=>send(i)}
document.querySelector('#transactions').insertAdjacentHTML('afterend','<h2>Receipt evidence</h2><textarea id="evidence" readonly></textarea>');document.querySelector('#connect').onclick=connect;
provider=walletProvider();if(provider?.on){provider.on('accountsChanged',()=>tryAuthorizedAccount().catch(()=>location.reload()));provider.on('chainChanged',()=>tryAuthorizedAccount().catch(()=>location.reload()))}tryAuthorizedAccount().catch(()=>{});
</script></body></html>`;
}
