import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Square, Zap, Link2 } from 'lucide-react';
import { motion } from 'framer-motion';
import useTradeStore from '../store/useTradeStore';
import useConnectionStore from '../store/useConnectionStore';
import useConfigStore from '../store/useConfigStore';
import tradeEngine from '../lib/tradeEngine';
import derivWS from '../lib/derivWS';
import { MARKET_LABELS } from '../lib/marketScanner';
import useAccountStore from '../store/useAccountStore';

export default function BotControl() {
  const navigate = useNavigate();
  const botRunning = useTradeStore(s => s.botRunning);
  const stopReason = useTradeStore(s => s.stopReason);
  const status = useConnectionStore(s => s.status);
  const activeMarket = useConnectionStore(s => s.activeMarket);
  const account = useConnectionStore(s => s.account);
  const config = useConfigStore();
  
  const setBotRunning = useTradeStore(s => s.setBotRunning);
  const setStopReason = useTradeStore(s => s.setStopReason);
  const setActiveMarket = useConnectionStore(s => s.setActiveMarket);
  const addTrade = useTradeStore(s => s.addTrade);
  const resetSession = useTradeStore(s => s.resetSession);

  const handleToggle = useCallback(() => {
    if (botRunning) {
      tradeEngine.stop('User stopped');
      setBotRunning(false);
    } else {
      if (status !== 'authorized') return;
      resetSession();

      tradeEngine.onTradeUpdate = (trade) => addTrade(trade);
      tradeEngine.onBotStop = (reason) => { setStopReason(reason); };
      tradeEngine.onMarketSwitch = (market) => setActiveMarket(market);

      tradeEngine.start({
        strategy: config.strategy,
        baseStake: config.baseStake,
        maxSteps: config.maxSteps,
        martMultiplier: config.martMultiplier,
        recoveryEnabled: config.recoveryEnabled,
        switchAfterLosses: config.switchAfterLosses,
        stopLoss: config.stopLoss,
        takeProfit: config.takeProfit,
        cooldownMs: config.cooldownMs,
        minConfidence: config.minConfidence,
      });
      setBotRunning(true);
    }
  }, [botRunning, status, config, setBotRunning, setStopReason, setActiveMarket, addTrade, resetSession]);

  const canStart = status === 'authorized' && !botRunning;

  const buttonJSX = status !== 'authorized' ? (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate('/settings')}
      style={{
        width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: 'var(--cyan)', color: '#000', fontSize: 16, fontWeight: 700,
        boxShadow: '0 0 30px rgba(0, 167, 158, 0.4)',
      }}
    >
      <Link2 size={20} />
      CONNECT ACCOUNT
    </motion.button>
  ) : (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={handleToggle}
      style={{
        width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
        cursor: canStart || botRunning ? 'pointer' : 'not-allowed',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: botRunning ? 'var(--crimson)' : 'var(--cyan)', 
        color: botRunning ? '#fff' : '#000', fontSize: 16, fontWeight: 800, letterSpacing: '1px',
        boxShadow: 'none',
        transition: 'background 0.3s'
      }}
    >
      {botRunning ? (
        <><Square size={18} fill="#fff" /> STOP TRADING</>
      ) : (
        <><Play size={18} fill="#000" /> START TRADING</>
      )}
    </motion.button>
  );

  return (
    <>
      {/* Desktop: normal flow inside glass card */}
      <div className="hidden md:flex glass" style={{ padding: '16px 20px', flexDirection: 'column', gap: 12 }}>
        {buttonJSX}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {botRunning && activeMarket && (
              <>
                <Zap size={12} color="var(--cyan)" />
                <span className="font-data" style={{ color: 'var(--cyan)', fontWeight: 600 }}>{MARKET_LABELS[activeMarket] || activeMarket}</span>
                <span>• {config.strategy === 'BOTH5' ? 'Over/Under 5' : 'Even/Odd'}</span>
              </>
            )}
            {!botRunning && stopReason && (
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{stopReason}</span>
            )}
            {!botRunning && !stopReason && status === 'authorized' && (
              <span style={{ color: 'var(--text-secondary)' }}>Ready to execute strategy.</span>
            )}
            {status !== 'authorized' && (
              <span style={{ color: 'var(--text-muted)' }}>Bot is currently offline.</span>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: floating at bottom center */}
      <div className="md:hidden" style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        width: '90%', maxWidth: 360, zIndex: 200,
      }}>
        {buttonJSX}
      </div>
    </>
  );
}
