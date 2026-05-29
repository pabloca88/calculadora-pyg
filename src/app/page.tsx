'use client';

import { useCalculator } from '@/lib/useCalculator';
import { formatNumber, formatARSRate, validateARSRate, formatCurrency, parseNumber } from '@/lib/format';

const WALLETS = ['DollarApp', 'Wallbit', 'Wise', 'Binance', 'Otra'];

export default function Page() {
  const {
    pygAmount,
    setPygAmount,
    rateChaco,
    setRateChaco,
    rateMaxi,
    setRateMaxi,
    rateCustom,
    setRateCustom,
    rateArsCustom,
    setRateArsCustom,
    selectedFee,
    feeCustomValue,
    arsRates,
    arsStatus,
    isArsLoading,
    isError,
    showOptionalArs,
    setShowOptionalArs,
    showCustomFee,
    expansions,
    results,
    showEmptyState,
    toggleExpansion,
    handleFeeSelect,
    handleFeeCustomChange,
    selectedWallet,
    setSelectedWallet,
    customWalletName,
    setCustomWalletName,
    selectedExchange,
    setSelectedExchange,
  } = useCalculator();

  const walletDisplayName =
    selectedWallet === 'Otra'
      ? (customWalletName.trim() || 'Billetera Virtual')
      : selectedWallet;

  const handleAmountChange = (value: string) => setPygAmount(formatNumber(value));
  const handleRateChange = (setter: (value: string) => void, value: string) => setter(formatNumber(value));
  const handleArsCustomChange = (value: string) => setRateArsCustom(formatARSRate(value));

  const arsCustomValidation = rateArsCustom ? validateARSRate(rateArsCustom) : null;

  const pygAmountRaw = parseNumber(pygAmount);
  const hasTouristDiscount = pygAmountRaw > 0;

  const feeIsActive = typeof selectedFee === 'number' && selectedFee > 0;

  // Pick the conversion for the selected exchange
  const selectedConv = showEmptyState ? null :
    results.find(r =>
      selectedExchange === 'chaco' ? r.source === 'Cambios Chaco' :
      selectedExchange === 'maxi' ? r.source === 'Maxicambios' :
      r.source === 'Personalizada'
    ) ?? null;

  const selectedExchangeName =
    selectedExchange === 'chaco' ? 'Cambios Chaco' :
    selectedExchange === 'maxi' ? 'Maxicambios' :
    'Personalizada';

  // "Más barato" — compare everything in ARS
  const efectivoInARS = (selectedConv && arsRates.oficial)
    ? selectedConv.usd * arsRates.oficial
    : Infinity;
  const billeteraInARS = selectedConv
    ? (feeIsActive && selectedConv.arsRates.customWithFee != null
        ? selectedConv.arsRates.customWithFee
        : selectedConv.arsRates.custom ?? Infinity)
    : Infinity;

  const bothAvailable = efectivoInARS < Infinity && billeteraInARS < Infinity;
  const isCheapestBilletera = bothAvailable && billeteraInARS < efectivoInARS;
  const isCheapestEfectivoTarjeta = bothAvailable && efectivoInARS <= billeteraInARS;

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

        <div className="section">
          <div className="section-title">Tasas PYG → USD</div>

          <div className="widget-compact">
            <div className="widget-header">
              <span className="widget-name">🏦 Cambios Chaco</span>
              <button type="button" className="widget-toggle" onClick={() => toggleExpansion('chaco')}>
                Ver tasas
              </button>
            </div>
            <iframe
              className={`widget-frame ${expansions.chaco ? 'expanded' : ''}`}
              src="https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es"
              title="Cambios Chaco"
            />
          </div>

          <div className="widget-compact">
            <div className="widget-header">
              <span className="widget-name">💵 Maxicambios</span>
              <button type="button" className="widget-toggle" onClick={() => toggleExpansion('maxi')}>
                Ver tasas
              </button>
            </div>
            <iframe
              className={`widget-frame ${expansions.maxi ? 'expanded' : ''}`}
              src="https://www.maxicambios.com.py/share"
              title="Maxicambios"
            />
          </div>

          <div className="rate-inputs">
            <div className="rate-input-compact">
              <label>Cambios Chaco</label>
              <div className="input-wrapper">
                <span className="currency-symbol">₲</span>
                <input
                  type="text"
                  className="rate-input"
                  placeholder="6.200"
                  inputMode="numeric"
                  value={rateChaco}
                  onChange={(e) => handleRateChange(setRateChaco, e.target.value)}
                />
              </div>
            </div>
            <div className="rate-input-compact">
              <label>Maxicambios</label>
              <div className="input-wrapper">
                <span className="currency-symbol">₲</span>
                <input
                  type="text"
                  className="rate-input"
                  placeholder="6.200"
                  inputMode="numeric"
                  value={rateMaxi}
                  onChange={(e) => handleRateChange(setRateMaxi, e.target.value)}
                />
              </div>
            </div>
          </div>
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

        {/* ¿Qué tasa usa el local? */}
        <div className="section">
          <div className="section-title">¿Qué tasa usa el local?</div>
          <div className="exchange-options">
            <label className={`exchange-option ${selectedExchange === 'chaco' ? 'active' : ''}`}>
              <input
                type="radio"
                name="exchange"
                value="chaco"
                checked={selectedExchange === 'chaco'}
                onChange={() => setSelectedExchange('chaco')}
              />
              <div className="exchange-option-content">
                <span className="exchange-option-name">Cambios Chaco</span>
                {rateChaco && <span className="exchange-option-rate">₲{rateChaco}</span>}
              </div>
            </label>
            <label className={`exchange-option ${selectedExchange === 'maxi' ? 'active' : ''}`}>
              <input
                type="radio"
                name="exchange"
                value="maxi"
                checked={selectedExchange === 'maxi'}
                onChange={() => setSelectedExchange('maxi')}
              />
              <div className="exchange-option-content">
                <span className="exchange-option-name">Maxicambios</span>
                {rateMaxi && <span className="exchange-option-rate">₲{rateMaxi}</span>}
              </div>
            </label>
            <label className={`exchange-option ${selectedExchange === 'custom' ? 'active' : ''}`}>
              <input
                type="radio"
                name="exchange"
                value="custom"
                checked={selectedExchange === 'custom'}
                onChange={() => setSelectedExchange('custom')}
              />
              <div className="exchange-option-content">
                <span className="exchange-option-name">Personalizada</span>
                {selectedExchange === 'custom' ? (
                  <div
                    className="exchange-custom-rate"
                    onClick={(e) => e.stopPropagation()}
                  >
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
                ) : rateCustom ? (
                  <span className="exchange-option-rate">₲{rateCustom}</span>
                ) : null}
              </div>
            </label>
          </div>
        </div>

        <div className="divider" />

        {/* Conversiones */}
        <div className="section-title">Conversiones</div>
        {showEmptyState ? (
          <div className="empty-state-mini">
            Ingresá un monto en guaraníes y las tasas PYG para calcular
          </div>
        ) : !selectedConv ? (
          <div className="empty-state-mini">
            {selectedExchange === 'custom'
              ? 'Ingresá la tasa personalizada para calcular'
              : `Ingresá la tasa de ${selectedExchangeName} para calcular`}
          </div>
        ) : (
          <div className="results-compact">

            {/* Efectivo USD */}
            <div className="conv-card">
              <button
                type="button"
                className="conv-card-header"
                onClick={() => toggleExpansion('efectivo')}
              >
                <div className="conv-card-info">
                  <div className="conv-card-row">
                    <span className="conv-card-name">💵 Efectivo USD</span>
                    {isCheapestEfectivoTarjeta && <span className="cheapest-badge">⭐ Más barato</span>}
                  </div>
                  <div className="conv-card-main-value">U$D {formatCurrency(selectedConv.usd)}</div>
                  <div className="conv-card-subtitle">Cambiando en {selectedExchangeName}</div>
                </div>
                <span className="conv-card-chevron">{expansions.efectivo ? '▲' : '▼'}</span>
              </button>
              {expansions.efectivo && (
                <div className="conv-card-expand">
                  {results.map((conv, i) => (
                    <div key={i} className="conv-expand-row">
                      <span className="conv-expand-label">• {conv.source}</span>
                      <span className="conv-expand-value-usd">U$D {formatCurrency(conv.usd)}</span>
                    </div>
                  ))}
                  {hasTouristDiscount && (
                    <div className="conv-tourist">
                      <div className="conv-tourist-title">💰 Con descuento turista (-10%)</div>
                      <div className="conv-expand-row">
                        <span className="conv-expand-label">{selectedExchangeName}</span>
                        <span className="conv-expand-value-usd">U$D {formatCurrency(selectedConv.usd * 0.9)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tarjeta Argentina */}
            {selectedConv.arsRates.tarjeta != null && (
              <div className="conv-card">
                <button
                  type="button"
                  className="conv-card-header"
                  onClick={() => toggleExpansion('tarjeta')}
                >
                  <div className="conv-card-info">
                    <div className="conv-card-row">
                      <span className="conv-card-name">💳 Tarjeta Argentina</span>
                      {isCheapestEfectivoTarjeta && <span className="cheapest-badge">⭐ Más barato</span>}
                    </div>
                    <div className="conv-card-main-value">
                      AR${formatCurrency(selectedConv.arsRates.oficial ?? selectedConv.arsRates.tarjeta)}
                    </div>
                    <div className="conv-card-subtitle">
                      {selectedConv.arsRates.oficial ? 'Dólar Oficial' : 'Dólar Tarjeta +30%'}
                    </div>
                  </div>
                  <span className="conv-card-chevron">{expansions.tarjeta ? '▲' : '▼'}</span>
                </button>
                {expansions.tarjeta && (
                  <div className="conv-card-expand">
                    {selectedConv.arsRates.oficial != null && (
                      <div className="conv-expand-row">
                        <span className="conv-expand-label">Dólar Oficial (pagás con USD)</span>
                        <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.oficial)}</span>
                      </div>
                    )}
                    <div className="conv-expand-row">
                      <span className="conv-expand-label">Dólar Tarjeta +30% (pagás con ARS)</span>
                      <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.tarjeta)}</span>
                    </div>
                    <div className="result-official-info">
                      💡 <strong>Dólar Oficial:</strong> si pagás tu tarjeta con USD<br />
                      <strong>Dólar Tarjeta +30%:</strong> si pagás con pesos argentinos
                    </div>
                    {hasTouristDiscount && selectedConv.arsRates.oficial != null && (
                      <div className="conv-tourist">
                        <div className="conv-tourist-title">💰 Con descuento turista (-10%)</div>
                        <div className="conv-expand-row">
                          <span className="conv-expand-label">Oficial (con USD)</span>
                          <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.oficial * 0.9)}</span>
                        </div>
                        <div className="conv-expand-row">
                          <span className="conv-expand-label">Tarjeta +30% (con ARS)</span>
                          <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.tarjeta * 0.9)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Billetera Virtual */}
            {selectedConv.arsRates.custom != null && (
              <div className="conv-card">
                <button
                  type="button"
                  className="conv-card-header"
                  onClick={() => toggleExpansion('billetera')}
                >
                  <div className="conv-card-info">
                    <div className="conv-card-row">
                      <span className="conv-card-name">💰 {walletDisplayName}</span>
                      {isCheapestBilletera && <span className="cheapest-badge">⭐ Más barato</span>}
                    </div>
                    <div className="conv-card-main-value">
                      AR${formatCurrency(
                        feeIsActive && selectedConv.arsRates.customWithFee != null
                          ? selectedConv.arsRates.customWithFee
                          : selectedConv.arsRates.custom
                      )}
                    </div>
                    <div className="conv-card-subtitle">
                      {walletDisplayName} · {feeIsActive ? `+${selectedFee}% recargo` : 'Sin recargo'}
                    </div>
                  </div>
                  <span className="conv-card-chevron">{expansions.billetera ? '▲' : '▼'}</span>
                </button>
                {expansions.billetera && (
                  <div className="conv-card-expand">
                    <div className="conv-expand-row">
                      <span className="conv-expand-label">Sin recargo</span>
                      <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.custom)}</span>
                    </div>
                    {selectedConv.arsRates.customWithFee != null && (
                      <div className="conv-expand-row">
                        <span className="conv-expand-label">Con recargo +{selectedFee}%</span>
                        <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.customWithFee)}</span>
                      </div>
                    )}
                    <div className="conv-fee-section">
                      <div className="conv-fee-label">Recargo tarjeta billetera</div>
                      <div className="fee-options">
                        <button
                          type="button"
                          className={`fee-option ${selectedFee === 0 ? 'active' : ''}`}
                          onClick={() => handleFeeSelect(0)}
                        >
                          <span className="fee-option-label">Sin recargo</span>
                        </button>
                        <button
                          type="button"
                          className={`fee-option ${selectedFee === 2 ? 'active' : ''}`}
                          onClick={() => handleFeeSelect(2)}
                        >
                          <span className="fee-option-label">2%</span>
                        </button>
                        <button
                          type="button"
                          className={`fee-option ${selectedFee === 3 ? 'active' : ''}`}
                          onClick={() => handleFeeSelect(3)}
                        >
                          <span className="fee-option-label">3%</span>
                        </button>
                        <button
                          type="button"
                          className={`fee-option ${selectedFee === 'custom' ? 'active' : ''}`}
                          onClick={() => handleFeeSelect('custom')}
                        >
                          <span className="fee-option-label">Custom</span>
                        </button>
                      </div>
                      {showCustomFee && (
                        <div className="fee-custom-input visible">
                          <input
                            type="number"
                            placeholder="Ingresá %"
                            inputMode="decimal"
                            step="0.1"
                            min="0"
                            max="100"
                            value={feeCustomValue}
                            onChange={(e) => handleFeeCustomChange(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    {hasTouristDiscount && (
                      <div className="conv-tourist">
                        <div className="conv-tourist-title">💰 Con descuento turista (-10%)</div>
                        <div className="conv-expand-row">
                          <span className="conv-expand-label">Sin recargo</span>
                          <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.custom! * 0.9)}</span>
                        </div>
                        {feeIsActive && selectedConv.arsRates.customWithFee != null && (
                          <div className="conv-expand-row">
                            <span className="conv-expand-label">Con recargo +{selectedFee}%</span>
                            <span className="conv-expand-value-ars">AR${formatCurrency(selectedConv.arsRates.customWithFee * 0.9)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="footer">Tasas ARS en vivo desde DolarApi.com</div>
    </div>
  );
}
