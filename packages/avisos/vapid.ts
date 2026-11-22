import { gerarChavesVapid } from './push';

/**
 * Gera um par de chaves VAPID para o Web Push. Copie para o .env do servidor (web e worker);
 * NUNCA para o repositório. Trocar as chaves invalida as inscrições dos aparelhos.
 */
const k = gerarChavesVapid();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
console.log('VAPID_ASSUNTO=mailto:contato@seu-dominio.com.br');
