/**
 * Franja en la que la Mac pushea Chaco (launchd): lunes a sábado,
 * 08:00–19:00 hora Paraguay (19:00 incluido). Compartida por
 * scripts/push-chaco.ts y el test live, para que ambos usen la misma regla.
 */
export const isPyBusinessHours = (date = new Date()): boolean => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Asuncion',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  return get('weekday') !== 'Sun' && minutes >= 8 * 60 && minutes <= 19 * 60;
};
