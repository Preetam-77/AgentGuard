import './App.css'

function App() {
  return (
    <main className="dashboard">
      <header>
        <h1>AgentGuard</h1>
        <p>Security layer for autonomous AI agents</p>
      </header>

      <section className="wallet-card">
        <h2>Agent Wallet</h2>
        <p className="balance">100 USDC</p>
        <p>Available balance</p>

        <button type="button">Connect Wallet</button>
      </section>

      <section className="limit-card">
        <h2>Spending Limit</h2>
        <p className="limit">$20 / day</p>
        <p>Maximum amount the agent can spend automatically.</p>
      </section>

      <section className="security-card">
        <h2>Security Status</h2>
        <p>Protected</p>
        <p>Transactions are checked before execution.</p>
      </section>
    </main>
  )
}

export default App