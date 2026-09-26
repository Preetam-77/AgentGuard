import { useState } from 'react'
import { BrowserProvider } from 'ethers'
import './App.css'

function App() {
  const [limit, setLimit] = useState(20)

  const [contracts, setContracts] = useState([
    'Uniswap',
    'AgentGuard Treasury',
  ])

  const [contractInput, setContractInput] = useState('')

  const [walletAddress, setWalletAddress] = useState('')
  const [network, setNetwork] = useState('')
  const [walletConnected, setWalletConnected] = useState(false)

  const addContract = () => {
    if (contractInput.trim() === '') return

    setContracts([...contracts, contractInput.trim()])
    setContractInput('')
  }

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask first.')
      return
    }

    try {
      const provider = new BrowserProvider(window.ethereum)

      const accounts = await provider.send('eth_requestAccounts', [])

      const address = accounts[0]

      const networkInfo = await provider.getNetwork()

      setWalletAddress(address)
      setNetwork(networkInfo.name)
      setWalletConnected(true)
    } catch (error) {
      console.error('Wallet connection failed:', error)
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
            <p className="balance">100 USDC</p>
            <p>Available balance</p>
          </>
        ) : (
          <>
            <p className="balance">100 USDC</p>
            <p>Connect your wallet to continue.</p>
          </>
        )}

        <button type="button" onClick={connectWallet}>
          {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
        </button>
      </section>

      <section className="limit-card">
        <h2>Spending Limit</h2>

        <p className="limit">${limit} / day</p>

        <p>
          Maximum amount the agent can spend automatically.
        </p>

        <button type="button" onClick={() => setLimit(50)}>
          Set Limit to $50
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
          placeholder="Enter contract name or address"
        />

        <button type="button" onClick={addContract}>
          Add Contract
        </button>
      </section>

      <section className="security-card">
        <h2>Security Status</h2>

        <p className="status">
          {walletConnected ? 'Protected' : 'Wallet not connected'}
        </p>

        <p>
          Transactions are checked before execution.
        </p>
      </section>
    </main>
  )
}

export default App