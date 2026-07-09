'use client';

import { useEffect, useState } from 'react';
import { useCalculator } from '@/lib/useCalculator';
import { formatNumber, formatCurrency, parseNumber } from '@/lib/format';
import { PAYMENT_METHODS_AR, MERCADO_PAGO_METHOD, WALLET_METHODS, calcPaymentMethod, getCheapestMethodIds } from '@/lib/calculator';

const WALLETS = [
  { value: 'arq', label: 'ARQ / DollarApp' },
  { value: 'payoneer', label: 'Payoneer' },
];

export default function Page() {
  const {
    pygAmount,
    setPygAmount,
    rateCustom,
    setRateCustom,
    arsRates,
    arsStatus,
    isArsLoading,
    isError,
    pygUsdRate,
    pygRateStatus,
    fetchPygRate,
    showOptionalArs,
    setShowOptionalArs,
    expansions,
    toggleExpansion,
    selectedWallet,
    setSelectedWallet,
  } = useCalculator();

  const [isRefreshingPyg, setIsRefreshingPyg] = useState(false);

  const handleRefreshPygRate = async () => {
    setIsRefreshingPyg(true);
    await fetchPygRate(true);
    setIsRefreshingPyg(false);
  };

  // Casas de cambio de referencia (Fase 3)
  const [chacoRateInput, setChacoRateInput] = useState('');
  const [maxiRateInput, setMaxiRateInput] = useState('');

  useEffect(() => {
    const chaco = localStorage.getItem('chaco_rate');
    const maxi = localStorage.getItem('maxi_rate');
    if (chaco) setChacoRateInput(chaco);
    if (maxi) setMaxiRateInput(maxi);
  }, []);

  const handleChacoRateChange = (value: string) => {
    const formatted = formatNumber(value);
    setChacoRateInput(formatted);
    if (formatted) localStorage.setItem('chaco_rate', formatted);
    else localStorage.removeItem('chaco_rate');
  };

  const handleMaxiRateChange = (value: string) => {
    const formatted = formatNumber(value);
    setMaxiRateInput(formatted);
    if (formatted) localStorage.setItem('maxi_rate', formatted);
    else localStorage.removeItem('maxi_rate');
  };

  const handleAmountChange = (value: string) => setPygAmount(formatNumber(value));
  const handleRateChange = (setter: (value: string) => void, value: string) => setter(formatNumber(value));

  const pygAmountRaw = parseNumber(pygAmount);
  const hasTouristDiscount = pygAmountRaw > 0;

  // Conversión automática PYG → USD vía API (Fase 1)
  const usdAmount = pygAmountRaw > 0 && pygUsdRate > 0 ? pygAmountRaw / pygUsdRate : 0;
  const hasAmount = usdAmount > 0;

  const oficialARS = hasAmount && arsRates.oficial ? usdAmount * arsRates.oficial : null;
  const tarjetaARS = hasAmount && arsRates.tarjeta ? usdAmount * arsRates.tarjeta : null;

  // Tasa personalizada del local (₲), alternativa opcional a la tasa automática
  const customPygRateVal = parseNumber(rateCustom);
  const customUsdAmount = hasAmount && customPygRateVal > 0 ? pygAmountRaw / customPygRateVal : 0;
  const customPygARS = customUsdAmount > 0 && arsRates.oficial ? customUsdAmount * arsRates.oficial : null;

  // Métodos de pago argentinos (Fase 2) — orden fijo: Tarjeta banco, Mercado Pago, [billetera elegida], Efectivo USD
  const arsRatesForPayment = arsRates.oficial && arsRates.tarjeta
    ? { oficial: arsRates.oficial, tarjeta: arsRates.tarjeta }
    : null;
  const tarjetaBancoMethod = PAYMENT_METHODS_AR.find((m) => m.id === 'tarjeta-banco')!;
  const efectivoUsdMethod = PAYMENT_METHODS_AR.find((m) => m.id === 'efectivo-usd')!;
  const walletMethod = WALLET_METHODS[selectedWallet === 'payoneer' ? 'payoneer' : 'arq'];
  const paymentCards = [tarjetaBancoMethod, MERCADO_PAGO_METHOD, walletMethod, efectivoUsdMethod];
  const cheapestIds = hasAmount && arsRatesForPayment
    ? getCheapestMethodIds(usdAmount, arsRatesForPayment, paymentCards)
    : [];

  const renderEfectivoUsdRates = () => {
    if (!chacoRateInput && !maxiRateInput) {
      return (
        <div className="conv-expand-row">
          <span className="conv-expand-label">Consultá tasas al pie ↓</span>
        </div>
      );
    }
    return (
      <>
        <div className="conv-expand-row">
          <span className="conv-expand-label">Gastarías comprando guaraníes en:</span>
        </div>
        {chacoRateInput && (
          <div className="conv-expand-row">
            <span className="conv-expand-label">• Cambios Chaco: ₲{chacoRateInput}/USD</span>
          </div>
        )}
        {maxiRateInput && (
          <div className="conv-expand-row">
            <span className="conv-expand-label">• Maxicambios: ₲{maxiRateInput}/USD</span>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="container">
      <div className="header">
        <h1>💱 Calculadora PYG</h1>
      </div>

      <div className="calculator-body">
        <div className="flag-accent" />

        <div className="section">
          <label htmlFor="pyg-display">Monto en Guaraníes</label>
          <div className="input-wrapper">
            <span className="currency-symbol">₲</span>
            <input
              id="pyg-display"
              type="text"
              placeholder="0"
              inputMode="numeric"
              value={pygAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
            />
          </div>
        </div>

        <div className="divider" />

        <div className="pyg-auto-section">
          <div className="result-box">
            <div className="result-box-left">
              <span className="result-box-symbol">U$D</span>
              <span className="result-box-value">{hasAmount ? formatCurrency(usdAmount) : '0,00'}</span>
            </div>
            {isRefreshingPyg ? (
              <span className="result-box-label">⏳ actualizando...</span>
            ) : pygRateStatus === 'live' ? (
              <span className="result-box-label">🟢 en vivo</span>
            ) : pygRateStatus === 'cached' ? (
              <button type="button" className="pyg-refresh-btn" onClick={handleRefreshPygRate}>
                🔄 Actualizar
              </button>
            ) : (
              <span className="result-box-label pyg-refresh-fallback">
                🔴 sin conexión
                <button
                  type="button"
                  className="pyg-refresh-icon-btn"
                  onClick={handleRefreshPygRate}
                  aria-label="Actualizar tasa"
                >
                  🔄
                </button>
              </span>
            )}
          </div>

          <div className="result-box">
            <div className="result-box-left">
              <span className="result-box-symbol">AR$</span>
              <span className="result-box-value">{formatCurrency(oficialARS)}</span>
            </div>
            <span className="result-box-label">Dólar Oficial</span>
          </div>

          <div className="result-box">
            <div className="result-box-left">
              <span className="result-box-symbol">AR$</span>
              <span className="result-box-value">{formatCurrency(tarjetaARS)}</span>
            </div>
            <span className="result-box-label">Tarjeta +30%</span>
          </div>

          <button
            type="button"
            className="pyg-auto-custom-toggle"
            onClick={() => toggleExpansion('customPygRate')}
          >
            {expansions.customPygRate ? 'El local usa otra tasa ▲' : '⚙️ El local usa otra tasa ▼'}
          </button>
          {expansions.customPygRate && (
            <div className="pyg-auto-custom-input">
              <div className="input-wrapper">
                <span className="currency-symbol">₲</span>
                <input
                  type="text"
                  className="rate-input"
                  placeholder="6.200"
                  inputMode="numeric"
                  value={rateCustom}
                  onChange={(e) => handleRateChange(setRateCustom, e.target.value)}
                />
              </div>
            </div>
          )}
          {customPygARS != null && (
            <div className="result-box result-box--custom">
              <div className="result-box-left">
                <span className="result-box-symbol">AR$</span>
                <span className="result-box-value">{formatCurrency(customPygARS)}</span>
              </div>
              <span className="result-box-label">Tasa personalizada</span>
            </div>
          )}
        </div>

        <div className="divider" />

        <div className="ars-section">
          <div className="ars-header">
            <span className="ars-title">Tasas USD → ARS</span>
            <span className={`ars-status ${isArsLoading ? 'loading' : isError ? 'error' : ''}`}>{arsStatus}</span>
          </div>

          <div className="wallet-selector-wrapper">
            <label>Billetera Virtual</label>
            <select
              className="wallet-select"
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
            >
              {WALLETS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>

          <div className="ars-rates-compact">
            <div className="ars-rate-compact-item">
              <div className="ars-rate-compact-label">Oficial</div>
              <div className="ars-rate-compact-value">
                {arsRates.oficial ? `AR$${arsRates.oficial.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
              </div>
            </div>
            <div className="ars-rate-compact-item">
              <div className="ars-rate-compact-label">Tarjeta</div>
              <div className="ars-rate-compact-value">
                {arsRates.tarjeta ? `AR$${arsRates.tarjeta.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
              </div>
            </div>
          </div>

          <div className="ars-optional">
            <button
              type="button"
              className="ars-optional-toggle"
              onClick={() => setShowOptionalArs(!showOptionalArs)}
            >
              {showOptionalArs ? 'Ocultar MEP y Cripto ▲' : 'Mostrar MEP y Cripto ▼'}
            </button>
            <div className={`ars-optional-rates ${showOptionalArs ? 'visible' : ''}`}>
              <div className="ars-rate-item">
                <div className="ars-rate-name">MEP</div>
                <div className="ars-rate-value">
                  {arsRates.mep ? `AR$${arsRates.mep.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                </div>
              </div>
              <div className="ars-rate-item">
                <div className="ars-rate-name">Cripto</div>
                <div className="ars-rate-value">
                  {arsRates.cripto ? `AR$${arsRates.cripto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* ¿Cómo vas a pagar? */}
        <div className="section-title">¿Cómo vas a pagar?</div>
        {!hasAmount ? (
          <div className="empty-state-mini">
            Ingresá un monto en guaraníes para calcular
          </div>
        ) : (
          <div className="results-compact">
            {paymentCards.map((method) => {
              const isCheapest = cheapestIds.includes(method.id);
              const isMarket = method.rateType === 'market';
              const rawValue = isMarket
                ? usdAmount
                : arsRatesForPayment
                  ? calcPaymentMethod(method, usdAmount, arsRatesForPayment)
                  : null;
              const touristValue = rawValue != null ? rawValue * 0.9 : null;

              const feeLabel = method.fee > 0 ? `+${method.fee}%` : '0% comisión';
              const networkFeeLabel = method.network ? `${method.network} · ${feeLabel}` : feeLabel;
              const rateLabel =
                method.rateType === 'tarjeta' ? 'Dólar Tarjeta +30%' :
                method.rateType === 'market' ? 'Valor en dólares cash' :
                method.fee > 0 ? `Tasa Mastercard +${method.fee}%` : 'Tasa interbancaria';

              const mainValueDisplay = isMarket
                ? `U$D ${formatCurrency(rawValue)}`
                : `AR$${formatCurrency(rawValue)}`;
              const touristValueDisplay = isMarket
                ? `U$D ${formatCurrency(touristValue)}`
                : `AR$${formatCurrency(touristValue)}`;

              return (
                <div key={method.id} className={`payment-card ${isCheapest ? 'cheapest' : ''}`}>
                  <button
                    type="button"
                    className="payment-card-header"
                    onClick={() => toggleExpansion(method.id)}
                  >
                    <div className="payment-card-info">
                      <div className="payment-card-title-row">
                        <span className="payment-card-icon">{method.icon}</span>
                        <span className="payment-card-title">{method.name}</span>
                        {isCheapest && <span className="cheapest-badge">⭐ Más barato</span>}
                      </div>
                      <div className="payment-card-network">{networkFeeLabel}</div>
                      <div className={`payment-card-value${isMarket ? ' usd' : ''}`}>{mainValueDisplay}</div>
                      <div className="payment-card-label">{rateLabel}</div>
                    </div>
                    <span className="conv-card-chevron">{expansions[method.id] ? '▲' : '▼'}</span>
                  </button>
                  {expansions[method.id] && (
                    <div className="payment-expand">
                      <div className="payment-expand-note">ℹ️ {method.note}</div>
                      {method.id === 'efectivo-usd' && renderEfectivoUsdRates()}
                      {hasTouristDiscount && touristValue != null && (
                        <div className="payment-expand-tourist">
                          💰 Con -10% turista: {touristValueDisplay}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tasas de casas de cambio (Fase 3) */}
        <div className="casa-cambio-section">
          <button
            type="button"
            className="casa-cambio-header"
            onClick={() => toggleExpansion('casaCambio')}
          >
            <span>🏦 Tasas de casas de cambio</span>
            <span>{expansions.casaCambio ? '▲' : '▼'}</span>
          </button>
          {expansions.casaCambio && (
            <div className="casa-cambio-body">
              <p className="casa-cambio-intro">Para cambiar USD físicos a guaraníes</p>

              <div>
                <div className="casa-cambio-market-rate">
                  Tasa de mercado hoy: ₲{pygUsdRate.toLocaleString('es-PY', { maximumFractionDigits: 2 })} / USD
                </div>
                <div className="casa-cambio-market-rate">🟢 Actualizada automáticamente</div>
              </div>

              <div className="casa-cambio-input-row">
                <span className="casa-cambio-input-label">Cambios Chaco</span>
                <div className="input-wrapper">
                  <span className="currency-symbol">₲</span>
                  <input
                    type="text"
                    className="rate-input"
                    placeholder="6.200"
                    inputMode="numeric"
                    value={chacoRateInput}
                    onChange={(e) => handleChacoRateChange(e.target.value)}
                  />
                </div>
              </div>
              <div className="casa-cambio-input-row">
                <span className="casa-cambio-input-label">Maxicambios</span>
                <div className="input-wrapper">
                  <span className="currency-symbol">₲</span>
                  <input
                    type="text"
                    className="rate-input"
                    placeholder="6.200"
                    inputMode="numeric"
                    value={maxiRateInput}
                    onChange={(e) => handleMaxiRateChange(e.target.value)}
                  />
                </div>
              </div>

              <div className="casa-cambio-widget">
                <button
                  type="button"
                  className="casa-cambio-widget-toggle"
                  onClick={() => toggleExpansion('casaCambioChacoWidget')}
                >
                  <span>🏦 Cambios Chaco</span>
                  <span className="conv-card-chevron">{expansions.casaCambioChacoWidget ? '▲' : '▼'}</span>
                </button>
                <iframe
                  className={`widget-frame ${expansions.casaCambioChacoWidget ? 'expanded' : ''}`}
                  src="https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es"
                  title="Cambios Chaco"
                />
              </div>

              <div className="casa-cambio-widget">
                <button
                  type="button"
                  className="casa-cambio-widget-toggle"
                  onClick={() => toggleExpansion('casaCambioMaxiWidget')}
                >
                  <span>💵 Maxicambios</span>
                  <span className="conv-card-chevron">{expansions.casaCambioMaxiWidget ? '▲' : '▼'}</span>
                </button>
                <iframe
                  className={`widget-frame ${expansions.casaCambioMaxiWidget ? 'expanded' : ''}`}
                  src="https://www.maxicambios.com.py/share"
                  title="Maxicambios"
                />
              </div>

              <div className="casa-cambio-help">
                ℹ️ Mirá el valor &quot;Compra USD&quot; en cada casa de cambio y escribilo acá.
                Se guarda automáticamente en tu app.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="footer">Tasas ARS en vivo desde DolarApi.com</div>
    </div>
  );
}
