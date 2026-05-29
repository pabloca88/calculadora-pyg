'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ARSRates, Conversion } from './types';
import { loadCalculatorData, saveCalculatorData, loadARSCache } from './storage';
import { fetchARSRates, getARSStatus } from './rates';
import { calculateConversions, hasValidInputs } from './calculator';
import { parseNumber } from './format';

const DEFAULT_ARS_RATES: ARSRates = {
  oficial: null,
  tarjeta: null,
  mep: null,
  cripto: null,
  custom: null,
};

export const useCalculator = () => {
  const [pygAmount, setPygAmount] = useState('');
  const [rateChaco, setRateChaco] = useState('');
  const [rateMaxi, setRateMaxi] = useState('');
  const [rateCustom, setRateCustom] = useState('');
  const [rateArsCustom, setRateArsCustom] = useState('');
  const [selectedFee, setSelectedFee] = useState<number | 'custom'>(0);
  const [feeCustomValue, setFeeCustomValue] = useState('');
  const [selectedWallet, setSelectedWallet] = useState('DollarApp');
  const [customWalletName, setCustomWalletName] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<'chaco' | 'maxi' | 'custom'>('chaco');
  const [arsRates, setArsRates] = useState<ARSRates>(DEFAULT_ARS_RATES);
  const [arsStatus, setArsStatus] = useState('Cargando...');
  const [isArsLoading, setIsArsLoading] = useState(true);
  const [showOptionalArs, setShowOptionalArs] = useState(false);
  const [showCustomFee, setShowCustomFee] = useState(false);
  const [expansions, setExpansions] = useState<Record<string, boolean>>({ chaco: false, maxi: false });
  const [results, setResults] = useState<Conversion[]>([]);
  const [showEmptyState, setShowEmptyState] = useState(true);
  const [isError, setIsError] = useState(false);

  const loadSavedData = useCallback(() => {
    const saved = loadCalculatorData();
    if (!saved) return;

    if (saved.amount) setPygAmount(saved.amount.toLocaleString('es-PY'));
    if (saved.rateChaco) setRateChaco(saved.rateChaco.toLocaleString('es-PY'));
    if (saved.rateMaxi) setRateMaxi(saved.rateMaxi.toLocaleString('es-PY'));
    if (saved.customRate) setRateCustom(saved.customRate.toLocaleString('es-PY'));
    if (saved.arsCustomRate) setRateArsCustom(saved.arsCustomRate);
    if (saved.selectedFee !== undefined) {
      if (saved.selectedFee === 'custom') {
        setSelectedFee('custom');
        setShowCustomFee(true);
        if (saved.customFeeValue) setFeeCustomValue(saved.customFeeValue);
      } else {
        setSelectedFee(saved.selectedFee);
      }
    }
    if (saved.selectedWallet) setSelectedWallet(saved.selectedWallet);
    if (saved.customWalletName != null) setCustomWalletName(saved.customWalletName);
    if (saved.selectedExchange) setSelectedExchange(saved.selectedExchange);
  }, []);

  const fetchRates = useCallback(async () => {
    setIsArsLoading(true);
    setIsError(false);
    setArsStatus('Cargando...');

    let data = await fetchARSRates();
    if (!data.tarjeta && !data.oficial) {
      const cached = loadARSCache();
      if (cached) data = cached;
    }

    const error = !data.tarjeta && !data.oficial;
    setArsRates(data);
    setIsError(error);
    setIsArsLoading(false);
    setArsStatus(getARSStatus(false, error));
  }, []);

  const calculate = useCallback(() => {
    const conversions = calculateConversions(
      pygAmount,
      rateChaco,
      rateMaxi,
      rateCustom,
      rateArsCustom,
      arsRates,
      selectedFee
    );
    setResults(conversions);
    setShowEmptyState(!hasValidInputs(pygAmount, rateChaco, rateMaxi, rateCustom));
    saveCalculatorData({
      amount: parseNumber(pygAmount),
      rateChaco: parseNumber(rateChaco),
      rateMaxi: parseNumber(rateMaxi),
      customRate: parseNumber(rateCustom),
      arsCustomRate: rateArsCustom,
      selectedFee,
      customFeeValue: feeCustomValue,
      selectedWallet,
      customWalletName,
      selectedExchange,
    });
  }, [pygAmount, rateChaco, rateMaxi, rateCustom, rateArsCustom, arsRates, selectedFee, feeCustomValue, selectedWallet, customWalletName, selectedExchange]);

  useEffect(() => {
    loadSavedData();
    fetchRates();
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadSavedData, fetchRates]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  const toggleExpansion = (widget: string) => {
    setExpansions((prev) => ({ ...prev, [widget]: !prev[widget] }));
  };

  const handleFeeSelect = (fee: number | 'custom') => {
    setSelectedFee(fee);
    setShowCustomFee(fee === 'custom');
  };

  const handleFeeCustomChange = (value: string) => {
    setFeeCustomValue(value);
    setSelectedFee(parseFloat(value) || 0);
  };

  return {
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
    showOptionalArs,
    setShowOptionalArs,
    showCustomFee,
    expansions,
    results,
    showEmptyState,
    toggleExpansion,
    handleFeeSelect,
    handleFeeCustomChange,
    setSelectedFee,
    setShowCustomFee,
    setResults,
    setShowEmptyState,
    setArsRates,
    isError,
    selectedWallet,
    setSelectedWallet,
    customWalletName,
    setCustomWalletName,
    selectedExchange,
    setSelectedExchange,
  };
};
