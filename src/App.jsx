
import { useState } from 'react'
import { BrowserProvider, Contract, isAddress } from 'ethers'
import AgentGuardABI from './abi/AgentGuard.json'
import './App.css'

const CONTRACT_ADDRESS = '0xd9145CCE52D386f254917e481eB44e9943F39138'

function App() {
  const [limit, setLimit] = useState(20)
  const [contracts, setContracts] = useState([
    'Uniswap',
    'AgentGuard Treasury',
  ])

  const [contractInput, setContractInput] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [network, setNetwork] = useState('')
  const [balance] = useState('0')
  const [walletConnected, setWalletConnected] = useState(false)

  // State for the transaction security check
  const [testAmount, setTestAmount] = useState('10')
  const [testDestination, setTestDestination] = useState('')
  const [securityResult, setSecurityResult] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask first.')
      return
    }

    try {
      const provider = new BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_requestAccounts', [])
      const networkInfo = await provider.getNetwork()

      setWalletAddress(accounts[0])
      setNetwork(networkInfo.name)
      setWalletConnected(true)

      const contract = new Contract(
        CONTRACT_ADDRESS,
        AgentGuardABI,
        provider
      )

      const dailyLimit = await contract.dailyLimit()
      setLimit(Number(dailyLimit))

      console.log('Wallet connected:', accounts[0])
      console.log('Network:', networkInfo.name)
      console.log('Daily limit:', dailyLimit.toString())
    } catch (error) {
      console.error('Wallet connection failed:', error)
    }
  }

  const addContract = async () => {
    const address = contractInput.trim()

    if (!isAddress(address)) {
      alert('Enter a valid contract address.')
      return
    }

    if (!window.ethereum) {
      alert('Please install MetaMask first.')
      return
    }

    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      const contract = new Contract(
        CONTRACT_ADDRESS,
        AgentGuardABI,
        signer
      )

      const transaction = await contract.addAllowedContract(address)
      await transaction.wait()

      setContracts((previous) => [...previous, address])
      setContractInput('')

      console.log('Contract added:', address)
    } catch (error) {
      console.error('Failed to add contract:', error)
    }
  }

  const updateDailyLimit = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask first.')
      return
    }

    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      const contract = new Contract(
        CONTRACT_ADDRESS,
        AgentGuardABI,
        signer
      )

      const transaction = await contract.setDailyLimit(50)
      await transaction.wait()

      setLimit(50)
      console.log('Daily limit updated to 50 units')
    } catch (error) {
      console.error('Failed to update daily limit:', error)
    }
  }

  // Read the smart contract's security decision.
  // This function does not send a transaction or spend funds.
  const checkTransaction = async (amount, destination) => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not available.')
    }

    const provider = new BrowserProvider(window.ethereum)

    const contract = new Contract(
      CONTRACT_ADDRESS,
      AgentGuardABI,
      provider
    )

    return await contract.checkTransaction(
      BigInt(amount),
      destination
    )
  }

  const runSecurityCheck = async () => {
    setSecurityResult('')

    if (!walletConnected) {
      setSecurityResult('Connect your wallet first.')
      return
    }

    if (!/^\d+$/.test(testAmount) || BigInt(testAmount) <= 0n) {
      setSecurityResult('Enter a positive whole-number amount.')
      return
    }

    if (!isAddress(testDestination.trim())) {
      setSecurityResult('Enter a valid destination address.')
      return
    }

    setIsChecking(true)

    try {
      const allowed = await checkTransaction(
        testAmount,
        testDestination.trim()
      )

      setSecurityResult(
        allowed
          ? 'APPROVED: The contract rules allow this transaction.'
          : 'BLOCKED: The amount exceeds the limit or the destination is not allowed.'
      )
    } catch (error) {
      console.error('Security check failed:', error)
      setSecurityResult(
        'Could not complete the check. Verify the contract address, network, and ABI.'
      )
    } finally {
      setIsChecking(false)
    }
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
            <p>Network: {network}</p>
            <p className="balance">{balance} ETH</p>
            <p>Available balance</p>
          </>
        ) : (
          <>
            <p className="balance">--</p>
            <p>Connect your wallet to continue.</p>
          </>
        )}

        <button type="button" onClick={connectWallet}>
          {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
        </button>
      </section>

      <section className="limit-card">
        <h2>Spending Limit</h2>
        <p className="limit">{limit} units / day</p>
        <p>Maximum amount the agent can spend automatically.</p>

        <button type="button" onClick={updateDailyLimit}>
          Set Limit to 50 Units
        </button>
      </section>

      <section className="contracts-card">
        <h2>Allowed Contracts</h2>

        <ul>
          {contracts.map((contract) => (
            <li key={contract}>{contract}</li>
          ))}
        </ul>

        <input
          type="text"
          value={contractInput}
          onChange={(event) => setContractInput(event.target.value)}
          placeholder="Enter contract address"
        />

        <button type="button" onClick={addContract}>
          Add Contract
        </button>
      </section>

      <section className="security-card">
        <h2>Check Transaction</h2>

        <p>
          Test whether the smart contract permits a transaction.
          This check does not send funds.
        </p>

        <label htmlFor="test-amount">Amount (whole-number units)</label>
        <input
          id="test-amount"
          type="number"
          min="1"
          step="1"
          value={testAmount}
          onChange={(event) => setTestAmount(event.target.value)}
          placeholder="Enter amount"
        />

        <label htmlFor="test-destination">Destination contract address</label>
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
          {isChecking ? 'Checking...' : 'Check Transaction'}
        </button>

        {securityResult && (
          <p role="status">{securityResult}</p>
        )}

        <hr />

        <h2>Security Status</h2>
        <p className="status">
          {walletConnected ? 'Wallet Connected' : 'Wallet not connected'}
        </p>
        <p>Transactions can be checked against the contract's configured rules.</p>
      </section>
    </main>
  )
}

export default App
