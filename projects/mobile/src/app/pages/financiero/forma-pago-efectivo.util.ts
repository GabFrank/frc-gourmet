/**
 * Re-export del helper compartido (vive en `src/app/shared/utils/` para que el
 * escritorio también lo use). Se mantiene este archivo para no tocar los ~10
 * imports relativos de la PWA.
 */
export { formaPagoEfectivo } from '@frc/shared-core';
