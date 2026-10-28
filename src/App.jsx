import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserProvider, Contract, formatEther, isAddress } from 'ethers'
import AgentGuardABI from './abi/AgentGuard.json'
import './App.css'

const CONTRACT_ADDRESS = '0xd9145CCE52D386f254917e481eB44e9943F39138'
const SEPOLIA_CHAIN_ID = 11155111n
const SEPOLIA_HEX = '0xaa36a7'
const EXPLORER = 'https://sepolia.etherscan.io'
const HISTORY_KEY = 'agentguard-security-history'
const MAX_HISTORY = 25

const shorten = (a = '', head = 6, tail = 4) =>
  a ? `${a.slice(0, head)}…${a.slice(-tail)}` : ''

function friendlyError(error) {
  if (error?.code === 'ACTION_REJECTED' || error?.code === 4001)
    return 'You rejected the request in MetaMask.'
  return error?.shortMessage || error?.reason || error?.message || 'Something went wrong.'
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

// Pure rule-based scoring, kept outside the component so it is easy to test.
function assess({ amount, dailyLimit, allowed, destinationAllowed }) {
  const overLimit = amount > dailyLimit
  const nearLimit = dailyLimit > 0n && !overLimit && amount * 100n >= dailyLimit * 80n
  const reasons = []

  if (overLimit) reasons.push('The amount exceeds the daily limit.')
  if (!destinationAllowed) reasons.push('The destination is not on the allowlist.')
  if (!allowed && reasons.length === 0)
    reasons.push('The contract rejected this request. Review its configured rules.')

  if (!allowed) return { riskLevel: 'HIGH', riskScore: 95, reasons }
  if (!destinationAllowed) return { riskLevel: 'HIGH', riskScore: 90, reasons }
  if (nearLimit) {
    reasons.push('The amount uses 80% or more of the daily limit. Review it before approving.')
    return { riskLevel: 'MEDIUM', riskScore: 55, reasons }
  }
  reasons.push('No rule violations found. This is not a guarantee of safety.')
  return { riskLevel: 'LOW', riskScore: 15, reasons }
}

function RiskMeter({ score, level }) {
  return (
    <div className="meter" role="img" aria-label={`Risk ${score} out of 100, ${level}`}>
      <div className="meter-track">
        <div className={`meter-fill ${level.toLowerCase()}`} style={{ width: `${score}%` }} />
      </div>
      <div className="meter-scale"><span>0</span><span>50</span><span>100</span></div>
    </div>
  )
}

export default function App() {
  const [wallet, setWallet] = useState(null) // { address, chainId, network, balance }
  const [limit, setLimit] = useState('—')
  const [newLimit, setNewLimit] = useState('50')
  const [contracts, setContracts] = useState([])
  const [contractInput, setContractInput] = useState('')
  const [testAmount, setTestAmount] = useState('10')
  const [testDestination, setTestDestination] = useState('')
  const [simulation, setSimulation] = useState(null)
  const [history, setHistory] = useState(loadHistory)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState(null) // { type, text, hash? }
  const toastTimer = useRef()

  const onSepolia = wallet?.chainId === SEPOLIA_CHAIN_ID.toString()

  const notify = useCallback((type, text, hash) => {
    clearTimeout(toastTimer.current)
    setToast({ type, text, hash })
    if (type !== 'error') toastTimer.current = setTimeout(() => setToast(null), 7000)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch (e) {
      console.error('Could not save history:', e)
    }
  }, [history])

  // Runs an async action with a busy flag and unified error handling.
  const run = async (key, fn) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      console.error(`${key} failed:`, e)
      notify('error', friendlyError(e))
    } finally {
      setBusy('')
    }
  }

  // Read-only guard: Sepolia + deployed code. Returns a provider.
  const getProvider = async () => {
    if (!window.ethereum) throw new Error('Install MetaMask to continue.')
    const provider = new BrowserProvider(window.ethereum)
    const { chainId } = await provider.getNetwork()
    if (chainId !== SEPOLIA_CHAIN_ID) throw new Error('Switch MetaMask to Sepolia first.')
    if ((await provider.getCode(CONTRACT_ADDRESS)) === '0x')
      throw new Error('No contract found at the configured address on Sepolia.')
    return provider
  }

  // One function for connect, reconnect, account change and chain change.
  const syncWallet = useCallback(async (requestAccess = false) => {
    if (!window.ethereum) return
    const provider = new BrowserProvider(window.ethereum)
    const accounts = await provider.send(requestAccess ? 'eth_requestAccounts' : 'eth_accounts', [])
    if (!accounts.length) {
      setWallet(null)
      return
    }
    const [net, bal] = await Promise.all([provider.getNetwork(), provider.getBalance(accounts[0])])
    setWallet({
      address: accounts[0],
      chainId: net.chainId.toString(),
      network: net.name === 'unknown' ? `chain ${net.chainId}` : net.name,
      balance: Number(formatEther(bal)).toFixed(4),
    })
    if (net.chainId === SEPOLIA_CHAIN_ID) {
      try {
        const contract = new Contract(CONTRACT_ADDRESS, AgentGuardABI, provider)
        setLimit((await contract.dailyLimit()).toString())
      } catch (e) {
        console.error('Could not read AgentGuard:', e)
        notify('error', 'Connected, but the contract could not be read. Check the address and ABI.')
      }
    }
  }, [notify])

  // Restore a previous session and follow MetaMask changes.
  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return
    const refresh = () => syncWallet(false).catch(console.error)
    refresh()
    eth.on?.('accountsChanged', refresh)
    eth.on?.('chainChanged', refresh)
    return () => {
      eth.removeListener?.('accountsChanged', refresh)
      eth.removeListener?.('chainChanged', refresh)
    }
  }, [syncWallet])

  const connect = () =>
    run('connect', async () => {
      if (!window.ethereum) throw new Error('Install MetaMask to continue.')
      await syncWallet(true)
    })

  const refreshBalance = () =>
    run('refresh', async () => {
      await syncWallet(false)
      notify('success', 'Balance refreshed.')
    })

  const switchToSepolia = () =>
    run('switch', async () => {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SEPOLIA_HEX }],
        })
      } catch (e) {
        if (e?.code !== 4902) throw e
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: SEPOLIA_HEX,
            chainName: 'Sepolia',
            nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: [EXPLORER],
          }],
        })
      }
    })

  const getSignerContract = async () => {
    const provider = await getProvider()
    return new Contract(CONTRACT_ADDRESS, AgentGuardABI, await provider.getSigner())
  }

  const addContract = () =>
    run('allow', async () => {
      const address = contractInput.trim()
      if (!isAddress(address)) throw new Error('Enter a valid contract address.')
      const contract = await getSignerContract()
      const tx = await contract.addAllowedContract(address)
      notify('info', 'Waiting for confirmation…', tx.hash)
      await tx.wait()
      setContracts((prev) =>
        prev.some((a) => a.toLowerCase() === address.toLowerCase()) ? prev : [...prev, address]
      )
      setContractInput('')
      notify('success', 'Address added to the on-chain allowlist.', tx.hash)
    })

  const updateDailyLimit = () =>
    run('limit', async () => {
      if (!/^\d+$/.test(newLimit) || BigInt(newLimit) <= 0n)
        throw new Error('Enter a positive whole number for the limit.')
      const contract = await getSignerContract()
      const tx = await contract.setDailyLimit(BigInt(newLimit))
      notify('info', 'Waiting for confirmation…', tx.hash)
      await tx.wait()
      setLimit((await contract.dailyLimit()).toString())
      notify('success', 'Daily limit updated on-chain.', tx.hash)
    })

  const simulate = () =>
    run('simulate', async () => {
      setSimulation(null)
      if (!wallet) throw new Error('Connect your wallet first.')
      if (!/^\d+$/.test(testAmount) || BigInt(testAmount) <= 0n)
        throw new Error('Enter a positive whole-number amount.')
      const destination = testDestination.trim()
      if (!isAddress(destination)) throw new Error('Enter a valid destination address.')

      const provider = await getProvider()
      const contract = new Contract(CONTRACT_ADDRESS, AgentGuardABI, provider)
      const amount = BigInt(testAmount)

      const [allowed, dailyLimit, destinationAllowed] = await Promise.all([
        contract.checkTransaction(amount, destination),
        contract.dailyLimit(),
        contract.isAllowedContract(destination),
      ])

      const record = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        amount: testAmount,
        destination,
        verdict: allowed ? 'ALLOWED' : 'BLOCKED',
        ...assess({ amount, dailyLimit, allowed, destinationAllowed }),
        checkedAt: new Date().toLocaleString(),
        chainId: SEPOLIA_CHAIN_ID.toString(),
        humanApproved: false,
      }
      setSimulation(record)
      setHistory((prev) => [record, ...prev].slice(0, MAX_HISTORY))
      notify(allowed ? 'success' : 'error', allowed
        ? 'Rules allow this request. No funds were sent.'
        : 'Rules block this request. No funds were sent.')
    })

  // Local record only. It never moves funds.
  const recordReview = () => {
    if (simulation?.verdict !== 'ALLOWED') return
    const patch = { humanApproved: true, reviewedAt: new Date().toLocaleString() }
    setSimulation((s) => ({ ...s, ...patch }))
    setHistory((prev) => prev.map((i) => (i.id === simulation.id ? { ...i, ...patch } : i)))
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      notify('success', 'Copied to clipboard.')
    } catch {
      notify('error', 'Could not copy. Select the text and copy it manually.')
    }
  }

  const exportCsv = () => {
    if (!history.length) return notify('error', 'No history to export.')
    const esc = (v) => {
      let t = String(v ?? '').replace(/\r?\n/g, ' ')
      if (/^\s*[=+\-@]/.test(t)) t = `'${t}` // block spreadsheet formula injection
      return `"${t.replace(/"/g, '""')}"`
    }
    const head = ['Checked At', 'Amount', 'Destination', 'Decision', 'Risk Level', 'Risk Score', 'Chain ID', 'Human Review', 'Reviewed At', 'Reasons']
    const rows = history.map((i) =>
      [i.checkedAt, i.amount, i.destination, i.verdict, i.riskLevel, i.riskScore, i.chainId,
        i.humanApproved ? 'Recorded' : 'Not recorded', i.reviewedAt || '', (i.reasons || []).join('; ')]
        .map(esc).join(',')
    )
    const blob = new Blob(['\uFEFF', [head.map(esc).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `agentguard-history-${new Date().toISOString().slice(0, 10)}.csv`,
    })
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('success', 'History exported.')
  }

  const clearHistory = () => {
    setHistory([])
    setSimulation(null)
    notify('success', 'History cleared.')
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>AgentGuard</h1>
          <p>Spending rules for autonomous AI agents</p>
        </div>
        {wallet && (
          <span className={`pill ${onSepolia ? 'ok' : 'warn'}`}>
            {onSepolia ? 'Sepolia' : `Wrong network: ${wallet.network}`}
          </span>
        )}
      </header>

      {toast && (
        <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          <span>
            {toast.text}{' '}
            {toast.hash && (
              <a href={`${EXPLORER}/tx/${toast.hash}`} target="_blank" rel="noreferrer">View transaction</a>
            )}
          </span>
          <button className="ghost" onClick={() => setToast(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <main className="grid">
        <aside className="col">
          <section className="card">
            <h2>Agent wallet</h2>
            {wallet ? (
              <>
                <div className="row">
                  <code className="addr">{shorten(wallet.address)}</code>
                  <button className="ghost" onClick={() => copy(wallet.address)}>Copy</button>
                </div>
                <p className="big">{wallet.balance} <small>ETH</small></p>
                {!onSepolia && (
                  <button onClick={switchToSepolia} disabled={busy === 'switch'}>
                    {busy === 'switch' ? 'Switching…' : 'Switch to Sepolia'}
                  </button>
                )}
                <button className="secondary" onClick={refreshBalance} disabled={busy === 'refresh'}>
                  {busy === 'refresh' ? 'Refreshing…' : 'Refresh balance'}
                </button>
              </>
            ) : (
              <>
                <p className="muted">Connect MetaMask to read limits and run checks.</p>
                <button onClick={connect} disabled={busy === 'connect'}>
                  {busy === 'connect' ? 'Connecting…' : 'Connect wallet'}
                </button>
              </>
            )}
          </section>

          <section className="card">
            <h2>Daily limit</h2>
            <p className="big">{limit} <small>units / day</small></p>
            <p className="muted">An integer enforced by the contract. It is not a USD or USDC amount.</p>
            <label htmlFor="new-limit">New limit</label>
            <input id="new-limit" type="number" min="1" step="1" value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)} />
            <button onClick={updateDailyLimit} disabled={!onSepolia || busy === 'limit'}>
              {busy === 'limit' ? 'Updating…' : 'Update limit'}
            </button>
          </section>

          <section className="card">
            <h2>Allowlist</h2>
            <p className="muted">The contract is the source of truth. This list shows addresses added in this session.</p>
            {contracts.length > 0 ? (
              <ul className="plain">
                {contracts.map((a) => (
                  <li key={a} className="row"><code>{shorten(a, 8, 6)}</code>
                    <button className="ghost" onClick={() => copy(a)}>Copy</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Nothing added yet. Paste a contract address to allow it.</p>
            )}
            <label htmlFor="allow-address">Contract address</label>
            <input id="allow-address" value={contractInput} placeholder="0x…" spellCheck="false"
              onChange={(e) => setContractInput(e.target.value)} />
            <button onClick={addContract} disabled={!onSepolia || busy === 'allow'}>
              {busy === 'allow' ? 'Adding…' : 'Add to allowlist'}
            </button>
          </section>
        </aside>

        <div className="col">
          <section className="card">
            <h2>Check a transaction</h2>
            <p className="muted">Test an amount and destination against the contract rules. No funds move.</p>
            <div className="fields">
              <div>
                <label htmlFor="amount">Amount (contract units)</label>
                <input id="amount" type="number" min="1" step="1" value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)} />
              </div>
              <div>
                <label htmlFor="destination">Destination address</label>
                <input id="destination" value={testDestination} placeholder="0x…" spellCheck="false"
                  onChange={(e) => setTestDestination(e.target.value)} />
              </div>
            </div>
            <button onClick={simulate} disabled={!wallet || !onSepolia || busy === 'simulate'}>
              {busy === 'simulate' ? 'Checking…' : 'Check transaction'}
            </button>

            {simulation && (
              <div className={`result ${simulation.riskLevel.toLowerCase()}`}>
                <div className="row">
                  <h3>{simulation.verdict === 'ALLOWED' ? 'Allowed by rules' : 'Blocked by rules'}</h3>
                  <span className={`pill ${simulation.riskLevel.toLowerCase()}`}>
                    {simulation.riskLevel} risk · {simulation.riskScore}/100
                  </span>
                </div>
                <RiskMeter score={simulation.riskScore} level={simulation.riskLevel} />
                <dl>
                  <dt>Amount</dt><dd>{simulation.amount} units</dd>
                  <dt>Destination</dt><dd><code>{simulation.destination}</code></dd>
                </dl>
                <ul className="reasons">
                  {simulation.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
                {simulation.verdict === 'ALLOWED' &&
                  (simulation.humanApproved ? (
                    <p className="muted">Review recorded {simulation.reviewedAt}.</p>
                  ) : (
                    <button className="secondary" onClick={recordReview}>Record my review</button>
                  ))}
                <p className="muted small">A recorded review is a local note. It does not send or authorize a payment.</p>
              </div>
            )}
          </section>

          <section className="card">
            <div className="row">
              <h2>History</h2>
              {history.length > 0 && (
                <div className="row gap">
                  <button className="secondary" onClick={exportCsv}>Export CSV</button>
                  <button className="ghost" onClick={clearHistory}>Clear</button>
                </div>
              )}
            </div>
            <p className="muted">The last {MAX_HISTORY} checks are saved in this browser.</p>
            {history.length > 0 ? (
              <ul className="plain history">
                {history.map((i) => (
                  <li key={i.id}>
                    <span className={`dot ${i.riskLevel.toLowerCase()}`} aria-hidden="true" />
                    <div>
                      <strong>{i.verdict === 'ALLOWED' ? 'Allowed' : 'Blocked'}</strong>
                      {' · '}{i.amount} units to <code>{shorten(i.destination, 8, 6)}</code>
                      <div className="muted small">
                        {i.riskLevel} risk ({i.riskScore}) · {i.checkedAt} ·{' '}
                        {i.humanApproved ? 'Reviewed' : 'Not reviewed'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">No checks yet. Run one above and it will appear here.</p>
            )}
          </section>
        </div>
      </main>

      <footer>
        AgentGuard is a prototype. Scores come from simple rules, not a security audit.
        Never approve a MetaMask prompt that shows an unexplained warning.
      </footer>
    </div>
  )
}