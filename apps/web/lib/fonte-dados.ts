import { FonteSimuladaRaioX, type FonteDadosRaioX } from './dados';
import { FontePostgresRaioX } from './dados-postgres';

const GLOBAL = globalThis as unknown as { __radarFonteWeb?: FonteDadosRaioX };

/**
 * Fonte única do processo (sobrevive ao hot reload do Next em dev).
 * RADAR_FONTE_WEB=postgres|simulada; sem a variável: Postgres se houver DATABASE_URL.
 */
export function fonteDeDados(): FonteDadosRaioX {
  if (!GLOBAL.__radarFonteWeb) {
    const escolha = process.env.RADAR_FONTE_WEB ?? (process.env.DATABASE_URL ? 'postgres' : 'simulada');
    GLOBAL.__radarFonteWeb = escolha === 'postgres' ? new FontePostgresRaioX(process.env.DATABASE_URL!) : new FonteSimuladaRaioX();
  }
  return GLOBAL.__radarFonteWeb;
}

/** Para testes: injeta uma fonte. */
export function definirFonteDeDados(f: FonteDadosRaioX | undefined) {
  GLOBAL.__radarFonteWeb = f;
}
