
import { useEffect, useState } from 'react'
import {
  BrowserProvider,
  Contract,
  formatEther,
  isAddress,
} from 'ethers'
import AgentGuardABI from './abi/AgentGuard.json'
import './App.css'

const CONTRACT_ADDRESS = '0xd9145CCE52D386f254917e481eB44e9943F39138'
const SEPOLIA_CHAIN_ID = 11155111n
const HISTORY_KEY = 'agentguard-security-history'
const MAX_HISTORY = 10

function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY)
    const parsed = saved ? JSON.parse(saved) : []

    return Array.isArray(parsed)
      ? parsed.slice(0, MAX_HISTORY)
      : []
  } catch {
    return []
  }
}

function App() {
  const [limit, setLimit] = useState('20')
  const [contracts, setContracts] = useState([])
  const [contractInput, setContractInput] = useState('')

  const [walletAddress, setWalletAddress] = useState('')
  const [network, setNetwork] = useState('')
  const [chainId, setChainId] = useState('')
  const [balance, setBalance] = useState('0')
  const [walletConnected, setWalletConnected] = useState(false)
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false)
  const [walletMessage, setWalletMessage] = useState('')

  const [testAmount, setTestAmount] = useState('10')
  const [testDestination, setTestDestination] = useState('')
  const [securityResult, setSecurityResult] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [simulation, setSimulation] = useState(null)

  const [securityHistory, setSecurityHistory] = useState(loadHistory)

  // Keep recent checks in browser storage.
  useEffect(() => {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(securityHistory)
      )
    } catch (error) {
      console.error('Could not save security history:', error)
    }
  }, [securityHistory])

  // Require Sepolia and deployed contract code for contract operations.
  const getAgentGuardProvider = async () => {
    if (!window.ethereum) {
      throw new Error('Please install MetaMask first.')
    }

    const provider = new BrowserProvider(window.ethereum)
    const networkInfo = await provider.getNetwork()

    if (networkInfo.chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error(
        'Switch MetaMask to Sepolia before using AgentGuard contract features.'
      )
    }

    const code = await provider.getCode(CONTRACT_ADDRESS)

    if (code === '0x') {
      throw new Error(
        'No contract code was found at the configured address on Sepolia.'
      )
    }

    return provider
  }

  // Connect wallet and load its current ETH balance.
  const connectWallet = async () => {
    if (!window.ethereum) {
      setWalletMessage('Please install MetaMask first.')
      return
    }

    try {
      setWalletMessage('')

      const provider = new BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_requestAccounts', [])

      if (!accounts.length) {
        throw new Error('No wallet account was selected.')
      }

      const account = accounts[0]
      const networkInfo = await provider.getNetwork()
      const ethBalance = await provider.getBalance(account)

      setWalletAddress(account)
      setNetwork(networkInfo.name)
      setChainId(networkInfo.chainId.toString())
      setBalance(Number(formatEther(ethBalance)).toFixed(4))
      setWalletConnected(true)

      if (networkInfo.chainId === SEPOLIA_CHAIN_ID) {
        try {
          const providerCode = await provider.getCode(CONTRACT_ADDRESS)

          if (providerCode === '0x') {
            throw new Error(
              'No contract code was found at the configured address.'
            )
          }

          const contract = new Contract(
            CONTRACT_ADDRESS,
            AgentGuardABI,
            provider
          )

          const dailyLimit = await contract.dailyLimit()
          setLimit(dailyLimit.toString())
          setWalletMessage('Connected to Sepolia.')
        } catch (error) {
          console.error('Could not read AgentGuard:', error)
          setWalletMessage(
            'Wallet connected, but AgentGuard could not be read. Verify the deployment address and ABI.'
          )
        }
      } else {
        setWalletMessage(
          'Wallet connected. Switch to Sepolia to use AgentGuard contract features.'
        )
      }
    } catch (error) {
      console.error('Wallet connection failed:', error)
      setWalletMessage(error.message || 'Wallet connection failed.')
    }
  }

  // Refresh the balance without sending a blockchain transaction.
  const refreshBalance = async () => {
    if (!window.ethereum) {
      setWalletMessage('Please install MetaMask first.')
      return
    }

    setIsRefreshingBalance(true)

    try {
      const provider = new BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_accounts', [])

      if (!accounts.length) {
        throw new Error('No connected wallet account found.')
      }

      const account = accounts[0]
      const networkInfo = await provider.getNetwork()
      const ethBalance = await provider.getBalance(account)

      setWalletAddress(account)
      setNetwork(networkInfo.name)
      setChainId(networkInfo.chainId.toString())
      setBalance(Number(formatEther(ethBalance)).toFixed(4))
      setWalletConnected(true)
      setWalletMessage('Balance refreshed.')
    } catch (error) {
      console.error('Balance refresh failed:', error)
      setWalletMessage(error.message || 'Could not refresh balance.')
    } finally {
      setIsRefreshingBalance(false)
    }
  }

  // Add an allowed destination to the deployed contract.
  const addContract = async () => {
    const address = contractInput.trim()

    if (!isAddress(address)) {
      setWalletMessage('Enter a valid contract address.')
      return
    }

    if (!window.ethereum) {
      setWalletMessage('Please install MetaMask first.')
      return
    }

    try {
      setWalletMessage('')

      const provider = await getAgentGuardProvider()
      const signer = await provider.getSigner()

      const contract = new Contract(
        CONTRACT_ADDRESS,
        AgentGuardABI,
        signer
      )

      const transaction = await contract.addAllowedContract(address)
      await transaction.wait()

      setContracts((previous) =>
        previous.some(
          (item) => item.toLowerCase() === address.toLowerCase()
        )
          ? previous
          : [...previous, address]
      )

      setContractInput('')
      setWalletMessage('Contract added to the on-chain allowlist.')
    } catch (error) {
      console.error('Failed to add contract:', error)
      setWalletMessage(
        error.message || 'Could not add contract to the allowlist.'
      )
    }
  }

  // Update the contract's daily limit in integer units.
  const updateDailyLimit = async () => {
    if (!window.ethereum) {
      setWalletMessage('Please install MetaMask first.')
      return
    }

    try {
      setWalletMessage('')

      const provider = await getAgentGuardProvider()
      const signer = await provider.getSigner()

      const contract = new Contract(
        CONTRACT_ADDRESS,
        AgentGuardABI,
        signer
      )

      const transaction = await contract.setDailyLimit(50)
      await transaction.wait()

      const updatedLimit = await contract.dailyLimit()
      setLimit(updatedLimit.toString())
      setWalletMessage('Daily limit updated on-chain.')
    } catch (error) {
      console.error('Failed to update daily limit:', error)
      setWalletMessage(
        error.message || 'Could not update the daily limit.'
      )
    }
  }

  // Read the contract's decision for a proposed transaction.
  const checkTransaction = async (amount, destination) => {
    const provider = await getAgentGuardProvider()

    const contract = new Contract(
      CONTRACT_ADDRESS,
      AgentGuardABI,
      provider
    )

    return contract.checkTransaction(
      BigInt(amount),
      destination
    )
  }

  // Simulate a transaction and calculate a rule-based risk score.
  const runSecurityCheck = async () => {
    setSecurityResult('')
    setSimulation(null)

    if (!walletConnected) {
      setSecurityResult('Connect your wallet first.')
      return
    }

    if (!/^\d+$/.test(testAmount) || BigInt(testAmount) <= 0n) {
      setSecurityResult('Enter a positive whole-number amount.')
      return
    }

    const destination = testDestination.trim()

    if (!isAddress(destination)) {
      setSecurityResult('Enter a valid destination address.')
      return
    }

    setIsChecking(true)

    try {
      const provider = await getAgentGuardProvider()
      const contract = new Contract(
        CONTRACT_ADDRESS,
        AgentGuardABI,
        provider
      )

      const amount = BigInt(testAmount)

      const [allowed, dailyLimit, destinationAllowed] =
        await Promise.all([
          contract.checkTransaction(amount, destination),
          contract.dailyLimit(),
          contract.isAllowedContract(destination),
        ])

      const overLimit = amount > dailyLimit
      const nearLimit =
        dailyLimit > 0n &&
        !overLimit &&
        amount * 100n >= dailyLimit * 80n

      let riskLevel = 'LOW'
      let riskScore = 15
      const reasons = []

      if (overLimit) {
        reasons.push('The requested amount exceeds the daily limit.')
      }

      if (!destinationAllowed) {
        reasons.push('The destination is not on the contract allowlist.')
      }

      if (!allowed) {
        if (reasons.length === 0) {
          reasons.push(
            'The smart contract rejected this request. Check its configured rules.'
          )
        }

        riskLevel = 'HIGH'
        riskScore = 95
      } else if (!destinationAllowed) {
        riskLevel = 'HIGH'
        riskScore = 90
      } else if (nearLimit) {
        reasons.push(
          'The amount uses at least 80% of the daily limit. Human review is recommended.'
        )

        riskLevel = 'MEDIUM'
        riskScore = 55
      } else {
        reasons.push(
          'No configured rule violations were detected. This is not a guarantee of safety.'
        )
      }

      const record = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        amount: testAmount,
        destination,
        verdict: allowed ? 'ALLOWED BY RULES' : 'BLOCKED BY RULES',
        riskLevel,
        riskScore,
        reasons,
        checkedAt: new Date().toLocaleString(),
        chainId: SEPOLIA_CHAIN_ID.toString(),
        humanApproved: false,
      }

      setSimulation(record)

      setSecurityHistory((previous) =>
        [record, ...previous].slice(0, MAX_HISTORY)
      )

      setSecurityResult(
        allowed
          ? 'The contract rules allow this request. No funds were sent.'
          : 'The contract rules block this request. No funds were sent.'
      )
    } catch (error) {
      console.error('Security check failed:', error)
      setSecurityResult(
        error.message ||
          'Could not complete the check. Verify the network, contract address, and ABI.'
      )
    } finally {
      setIsChecking(false)
    }
  }

  // Record a local human-review decision for an allowed simulation.
  // This does not execute a payment or authorize an on-chain transfer.
  const recordHumanReview = () => {
    if (!simulation || simulation.verdict !== 'ALLOWED BY RULES') {
      return
    }

    const reviewedAt = new Date().toLocaleString()

    setSimulation((previous) =>
      previous
        ? {
            ...previous,
            humanApproved: true,
            reviewedAt,
          }
        : previous
    )

    setSecurityHistory((previous) =>
      previous.map((item) =>
        item.id === simulation.id
          ? {
              ...item,
              humanApproved: true,
              reviewedAt,
            }
          : item
      )
    )
  }

  // Export the stored audit history as a spreadsheet-friendly CSV.
  const exportSecurityHistory = () => {
    if (securityHistory.length === 0) {
      setSecurityResult('No security history to export.')
      return
    }

    const headers = [
      'Checked At',
      'Amount',
      'Destination',
      'Decision',
      'Risk Level',
      'Risk Score',
      'Chain ID',
      'Human Review',
      'Reviewed At',
      'Reasons',
    ]

    const escapeCSV = (value) => {
      let text = String(value ?? '').replace(/\r?\n/g, ' ')

      // Reduce formula-injection risk when opening CSV files in spreadsheets.
      if (/^[\s]*[=+\-@]/.test(text)) {
        text = `'${text}`
      }

      return `"${text.replace(/"/g, '""')}"`
    }

    const rows = securityHistory.map((item) =>
      [
        item.checkedAt,
        item.amount,
        item.destination,
        item.verdict,
        item.riskLevel,
        item.riskScore,
        item.chainId,
        item.humanApproved ? 'Recorded' : 'Not recorded',
        item.reviewedAt || '',
        (item.reasons || []).join('; '),
      ]
        .map(escapeCSV)
        .join(',')
    )

    const csv = [
      headers.map(escapeCSV).join(','),
      ...rows,
    ].join('\r\n')

    const blob = new Blob(
      ['\uFEFF', csv],
      { type: 'text/csv;charset=utf-8;' }
    )

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `agentguard-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`

    document.body.appendChild(link)
    link.click()
    link.remove()

    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setSecurityResult('Security history exported to CSV.')
  }

  const clearHistory = () => {
    setSecurityHistory([])
    setSimulation(null)
    setSecurityResult('Security history cleared.')
  }

  return (
    <main className="dashboard">
      <header>
        <h1>AgentGuard</h1>
        <p>Security layer for autonomous AI agents</p>
      </header>

      <section className="wallet-card">
        <h2>Agent Wallet</h2>

        {walletConnected ? (
          <>
            <p className="wallet-address">
              {walletAddress.slice(0, 6)}...
              {walletAddress.slice(-4)}
            </p>

            <p>Network: {network} (chain {chainId})</p>
            <p className="balance">{balance} ETH</p>
            <p>Wallet balance</p>
          </>
        ) : (
          <>
            <p className="balance">--</p>
            <p>Connect your wallet to continue.</p>
          </>
        )}

        <button type="button" onClick={connectWallet}>
          {walletConnected ? 'Reconnect Wallet' : 'Connect Wallet'}
        </button>

        <button
          type="button"
          onClick={refreshBalance}
          disabled={isRefreshingBalance}
        >
          {isRefreshingBalance ? 'Refreshing...' : 'Refresh Balance'}
        </button>

        {walletMessage && <p role="status">{walletMessage}</p>}
      </section>

      <section className="limit-card">
        <h2>Spending Limit</h2>
        <p className="limit">{limit} units / day</p>
        <p>
          This is the integer limit enforced by the contract,
          not a USD or USDC balance.
        </p>

        <button type="button" onClick={updateDailyLimit}>
          Set Limit to 50 Units
        </button>
      </section>

      <section className="contracts-card">
        <h2>Allowed Contracts</h2>
        <p>
          Addresses added during this session appear below.
          The on-chain allowlist remains the source of truth.
        </p>

        {contracts.length > 0 ? (
          <ul>
            {contracts.map((address) => (
              <li key={address}>{address}</li>
            ))}
          </ul>
        ) : (
          <p>No contracts added during this session.</p>
        )}

        <label htmlFor="allowed-contract-address">
          Contract address
        </label>

        <input
          id="allowed-contract-address"
          type="text"
          value={contractInput}
          onChange={(event) => setContractInput(event.target.value)}
          placeholder="0x..."
        />

        <button type="button" onClick={addContract}>
          Add Contract
        </button>
      </section>

      <section className="security-card">
        <h2>Transaction Simulation</h2>
        <p>
          Evaluate a proposed amount and destination against
          configured smart-contract rules. No funds are transferred.
        </p>

        <label htmlFor="test-amount">
          Amount (whole-number contract units)
        </label>

        <input
          id="test-amount"
          type="number"
          min="1"
          step="1"
          value={testAmount}
          onChange={(event) => setTestAmount(event.target.value)}
          placeholder="Enter amount"
        />

        <label htmlFor="test-destination">
          Destination contract address
        </label>

        <input
          id="test-destination"
          type="text"
          value={testDestination}
          onChange={(event) => setTestDestination(event.target.value)}
          placeholder="0x..."
        />

        <button
          type="button"
          onClick={runSecurityCheck}
          disabled={isChecking}
        >
          {isChecking ? 'Assessing Risk...' : 'Simulate Transaction'}
        </button>

        {securityResult && <p role="status">{securityResult}</p>}

        {simulation && (
          <div className="risk-assessment">
            <hr />
            <h3>Risk Assessment</h3>

            <p>
              <strong>Decision:</strong> {simulation.verdict}
            </p>
            <p>
              <strong>Risk level:</strong> {simulation.riskLevel}
            </p>
            <p>
              <strong>Risk score:</strong> {simulation.riskScore}/100
            </p>
            <p>
              <strong>Amount:</strong> {simulation.amount} units
            </p>
            <p>
              <strong>Destination:</strong> {simulation.destination}
            </p>

            <h4>Assessment reasons</h4>
            <ul>
              {simulation.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            {simulation.verdict === 'ALLOWED BY RULES' && (
              simulation.humanApproved ? (
                <p role="status">
                  Human review recorded at {simulation.reviewedAt}.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={recordHumanReview}
                >
                  Record Human Review (Demo)
                </button>
              )
            )}

            <p>
              Human review records a local decision. It does not
              execute a payment or authorize an on-chain transfer.
            </p>
          </div>
        )}
      </section>

      <section className="security-card">
        <h2>Recent Security History</h2>
        <p>
          Up to {MAX_HISTORY} recent checks are saved in this browser.
        </p>

        {securityHistory.length > 0 ? (
          <>
            <ul>
              {securityHistory.map((item) => (
                <li key={item.id}>
                  <p>
                    <strong>{item.verdict}</strong>
                    {' — Risk: '}
                    {item.riskLevel} ({item.riskScore}/100)
                  </p>
                  <p>Amount: {item.amount} units</p>
                  <p>
                    Destination: {item.destination.slice(0, 8)}...
                    {item.destination.slice(-6)}
                  </p>
                  <p>Checked: {item.checkedAt}</p>
                  <p>
                    Human review:{' '}
                    {item.humanApproved ? 'Recorded' : 'Not recorded'}
                  </p>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={exportSecurityHistory}
            >
              Export History to CSV
            </button>

            <button type="button" onClick={clearHistory}>
              Clear History
            </button>
          </>
        ) : (
          <p>No transaction checks recorded yet.</p>
        )}
      </section>

      <footer>
        <p>
          AgentGuard is a prototype. Risk scores are heuristic,
          not an independent security audit. Never approve a wallet
          transaction when MetaMask displays an unexplained security warning.
        </p>
      </footer>
    </main>
  )
}

export default App
