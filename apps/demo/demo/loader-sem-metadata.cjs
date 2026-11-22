/**
 * Pré-carregador do webpack (só na demonstração): as páginas do apps/web rodam no navegador, onde o
 * Next não aceita `export const metadata`/`dynamic` nem `generateMetadata`. Tira apenas o `export`
 * (as constantes ficam sem uso); o código-fonte do apps/web não muda.
 */
module.exports = function semMetadata(fonte) {
  return fonte
    .replace(/export const (metadata|dynamic|dynamicParams|revalidate|runtime)\b/g, 'const $1')
    .replace(/export (async )?function generateMetadata\b/g, '$1function generateMetadata');
};
