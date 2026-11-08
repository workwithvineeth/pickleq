type DeviceHints = { deviceMemory?: number; hardwareConcurrency?: number };
/** Conservative low-end hint, not a blanket phone/coarse-pointer rule. */
export function needsPlainGlass(device: DeviceHints): boolean {
  return (typeof device.deviceMemory === 'number' && device.deviceMemory > 0 && device.deviceMemory <= 2)
    || (typeof device.hardwareConcurrency === 'number' && device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 4);
}
export function applyDisplayEffects() {
  if (!document.documentElement.hasAttribute('data-pq-effects') && needsPlainGlass(navigator as Navigator & DeviceHints)) document.documentElement.dataset.pqEffects = 'off';
}
