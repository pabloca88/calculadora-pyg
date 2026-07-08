'use client';

import { useEffect, useState } from 'react';
import { useCalculator } from '@/lib/useCalculator';
import { formatNumber, formatARSRate, validateARSRate, formatCurrency, parseNumber } from '@/lib/format';
import { PAYMENT_METHODS_AR, calcPaymentMethod, getCheapestMethodIds } from '@/lib/calculator';

const WALLETS = ['DollarApp', 'Wallbit', 'Wise', 'Binance', 'Otra'];

const PYG_STATUS_LABEL: Record<string, string> = {
  live: '🟢 en vivo',
  cached: '🟡 en caché',
  fallback: '🔴 sin conexión',
};

export default function Page() {
  const {
    pygAmount,
    setPygAmount,
    rateCustom,
    setRateCustom,
    rateArsCustom,
    setRateArsCustom,
    arsRates,
    arsStatus,
    isArsLoading,
    isError,
    pygUsdRate,
    pygRateStatus,
    showOptionalArs,
    setShowOptionalArs,
    expansions,
    toggleExpansion,
    selectedWallet,
    setSelectedWallet,
    customWalletName,
    setCustomWalletName,
  } = useCalculator();

  const walletDisplayName =
    selectedWallet === 'Otra'
      ? (customWalletName.trim() || 'Billetera Virtual')
      : selectedWallet;

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
  const handleArsCustomChange = (value: string) => setRateArsCustom(formatARSRate(value));

  const arsCustomValidation = rateArsCustom ? validateARSRate(rateArsCustom) : null;

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

  // Métodos de pago argentinos (Fase 2)
  const arsRatesForPayment = arsRates.oficial && arsRates.tarjeta
    ? { oficial: arsRates.oficial, tarjeta: arsRates.tarjeta }
    : null;
  const cheapestIds = hasAmount && arsRatesForPayment
    ? getCheapestMethodIds(usdAmount, arsRatesForPayment)
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
          <div className="pyg-auto-usd-row">
            <span className="pyg-auto-usd-value">
              U$D {hasAmount ? formatCurrency(usdAmount) : '0,00'}
            </span>
            <span className="pyg-auto-status">{PYG_STATUS_LABEL[pygRateStatus]}</span>
          </div>

          <div className="pyg-auto-ars-row">
            <span className="pyg-auto-ars-value">
              AR${formatCurrency(oficialARS)}
            </span>
            <span className="pyg-auto-ars-label">Dólar Oficial</span>
          </div>
          <div className="pyg-auto-ars-row">
            <span className="pyg-auto-ars-value">
              AR${formatCurrency(tarjetaARS)}
            </span>
            <span className="pyg-auto-ars-label">Tarjeta +30%</span>
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
            <div className="pyg-auto-ars-row">
              <span className="pyg-auto-ars-value">
                AR${formatCurrency(customPygARS)}
              </span>
              <span className="pyg-auto-ars-label">Tasa personalizada</span>
            </div>
          )}
        </div>

        <div className="divider" />

        <div className="ars-section">
          <div className="ars-header">
            <span className="ars-title">Tasas USD → ARS</span>
            <span className={`ars-status ${isArsLoading ? 'loading' : isError ? 'error' : ''}`}>{arsStatus}</span>
          </div>

          <div className="ars-rates">
            <div className="ars-rate-item">
              <div className="ars-rate-name">Oficial</div>
              <div className="ars-rate-value">
                {arsRates.oficial ? `AR$${arsRates.oficial.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
              </div>
            </div>
            <div className="ars-rate-item">
              <div className="ars-rate-name">Tarjeta</div>
              <div className="ars-rate-value">
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

          <div className="wallet-selector-wrapper">
            <label>Billetera Virtual</label>
            <select
              className="wallet-select"
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
            >
              {WALLETS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            {selectedWallet === 'Otra' && (
              <input
                type="text"
                className="wallet-custom-input"
                placeholder="Nombre de tu billetera"
                value={customWalletName}
                onChange={(e) => setCustomWalletName(e.target.value)}
              />
            )}
          </div>

          <div className="custom-ars-rate">
            <label htmlFor="rate-ars-custom">Tasa {walletDisplayName}</label>
            <div className="input-wrapper">
              <span className="currency-symbol">AR$</span>
              <input
                id="rate-ars-custom"
                type="text"
                className={`rate-input${arsCustomValidation ? (arsCustomValidation.isValid ? ' valid' : ' error') : ''}`}
                placeholder="1.471,41"
                inputMode="decimal"
                value={rateArsCustom}
                onChange={(e) => handleArsCustomChange(e.target.value)}
                aria-label="Tasa en pesos argentinos"
              />
            </div>
            {arsCustomValidation && !arsCustomValidation.isValid ? (
              <div className="input-error">⚠️ {arsCustomValidation.message}</div>
            ) : (
              <div className="input-helper">💡 Formato: 1.471,41 (punto miles, coma decimales)</div>
            )}
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
            {PAYMENT_METHODS_AR.map((method) => {
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
              <p>Para cambiar USD físicos a guaraníes antes de comprar</p>

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

              <div className="casa-cambio-links">
                <a
                  href="https://www.cambioschaco.com.py/widgets/cotizacion/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="casa-cambio-link-btn"
                >
                  🌐 Ver tasas Cambios Chaco
                </a>
                <a
                  href="https://www.maxicambios.com.py/share"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="casa-cambio-link-btn"
                >
                  🌐 Ver tasas Maxicambios
                </a>
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
