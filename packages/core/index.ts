// Domínio
export * from './dominio/constantes';
export * from './dominio/modalidades';
export * from './dominio/tipos';
export * from './dominio/codigo-bolao';
export * from './dominio/loterica';
export * from './dominio/jogo';
export * from './tempo/fuso';
export * from './util/estatistica';
export * from './util/aleatorio';

// Regras
export * from './regras/fila';
export * from './regras/posicao';
export * from './regras/ordem-vitrine';
export * from './regras/financeiro';
export * from './regras/franquia';
export * from './mercado/agregar';
export * from './mercado/vitrine';
export * from './mercado/filas';
export * from './mercado/estatisticas';
export * from './mercado/previsao';
export * from './mercado/referencias';

// Motor de dados
export * from './eventos/estado';
export * from './coleta/plano';
export * from './coleta/estrategia';
export * from './coleta/calendario';

// Abertura e Raio-X
export * from './abertura/participacao';
export * from './raio-x/semanal';
export * from './raio-x/ranking';
export * from './raio-x/elite';
export * from './contas/permissoes';

// Adaptador da fonte (contrato, varredura, saúde, cliente HTTP)
export * from './fonte';
export * from './raio-x/busca';

// Conferência (Fase 3)
export * from './conferencia/resultado';
export * from './conferencia/premios';
export * from './conferencia/probabilidade';

// Minha lotérica (Fase 3)
export * from './minha/financeiro-mkp';
export * from './minha/posicao';
export * from './sugestoes/otimizador';
export * from './abertura/simulador-posicao';
export * from './site/site';
export * from './simulador/bolao';
export * from './loteca/marcacao';
export * from './calendario/sorteios';
