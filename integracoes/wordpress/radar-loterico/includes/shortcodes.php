<?php
/**
 * Shortcodes do Radar Lotérico. Todo texto que vem da API é escapado na saída.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_shortcode( 'radar_raio_x', 'radar_loterico_sc_raio_x' );
add_shortcode( 'radar_ranking', 'radar_loterico_sc_ranking' );
add_shortcode( 'radar_boloes', 'radar_loterico_sc_boloes' );
add_shortcode( 'radar_painel', 'radar_loterico_sc_painel' );

function radar_loterico_moeda( $v ) {
	return 'R$ ' . number_format( (float) $v, 2, ',', '.' );
}

function radar_loterico_pct( $v ) {
	return null === $v ? '—' : number_format( 100 * (float) $v, 0, ',', '.' ) . '%';
}

function radar_loterico_atraso( $s ) {
	if ( null === $s ) {
		return '—';
	}
	$s = (int) round( (float) $s );
	return $s < 60 ? '+' . $s . ' s' : sprintf( '+%d min %02d s', intdiv( $s, 60 ), $s % 60 );
}

/** Mensagem de erro: detalhe só para quem administra o site; o público vê um aviso discreto. */
function radar_loterico_erro( $erro ) {
	wp_enqueue_style( 'radar-loterico' );
	$msg = current_user_can( 'manage_options' ) ? $erro->get_error_message() : __( 'Informações indisponíveis no momento.', 'radar-loterico' );
	return '<div class="radar-loterico radar-aviso">' . esc_html( $msg ) . '</div>';
}

function radar_loterico_rodape( $aviso ) {
	return $aviso ? '<p class="radar-rodape">' . esc_html( $aviso ) . '</p>' : '';
}

function radar_loterico_sc_raio_x( $atts ) {
	$a = shortcode_atts(
		array(
			'loterica' => '',
			'semanas'  => '4',
			'titulo'   => '',
		),
		$atts,
		'radar_raio_x'
	);
	$d = radar_loterico_api(
		'raio-x',
		array(
			'loterica' => $a['loterica'],
			'semanas'  => (string) max( 1, min( 13, (int) $a['semanas'] ) ),
		)
	);
	if ( is_wp_error( $d ) ) {
		return radar_loterico_erro( $d );
	}
	wp_enqueue_style( 'radar-loterico' );
	$l      = isset( $d['loterica'] ) ? $d['loterica'] : array();
	$r      = isset( $d['resumo'] ) ? $d['resumo'] : array();
	$chance = isset( $d['chanceAmanha']['chance'] ) ? $d['chanceAmanha']['chance'] : null;
	$titulo = '' !== $a['titulo'] ? $a['titulo'] : sprintf( 'Raio-X de Abertura: %s', isset( $l['nome'] ) ? $l['nome'] : '' );
	ob_start();
	?>
	<div class="radar-loterico radar-raio-x">
		<h3 class="radar-titulo"><?php echo esc_html( $titulo ); ?></h3>
		<p class="radar-sub"><?php echo esc_html( trim( ( isset( $l['cidade'] ) ? $l['cidade'] : '' ) . '/' . ( isset( $l['uf'] ) ? $l['uf'] : '' ), '/' ) ); ?> · <?php echo esc_html( sprintf( 'últimas %d semanas', (int) $d['semanas'] ) ); ?></p>
		<div class="radar-cartoes">
			<div class="radar-cartao"><span><?php esc_html_e( 'Aberturas', 'radar-loterico' ); ?></span><strong><?php echo esc_html( (int) $r['participacoes'] . '/' . (int) $r['aberturasOcorridas'] ); ?></strong></div>
			<div class="radar-cartao"><span><?php esc_html_e( 'Atraso mediano', 'radar-loterico' ); ?></span><strong><?php echo esc_html( radar_loterico_atraso( $r['atrasoMedianoS'] ) ); ?></strong></div>
			<div class="radar-cartao"><span><?php esc_html_e( 'Melhor colocação', 'radar-loterico' ); ?></span><strong><?php echo esc_html( null === $r['melhorPosicao'] ? '—' : (int) $r['melhorPosicao'] . 'º' ); ?></strong></div>
			<div class="radar-cartao"><span><?php esc_html_e( 'Na página 1', 'radar-loterico' ); ?></span><strong><?php echo esc_html( radar_loterico_pct( $r['pctPagina1'] ) ); ?></strong></div>
			<div class="radar-cartao"><span><?php esc_html_e( 'Chance de abrir amanhã', 'radar-loterico' ); ?></span><strong><?php echo esc_html( radar_loterico_pct( $chance ) ); ?></strong></div>
		</div>
		<?php if ( ! empty( $d['ultimasEntradas'] ) ) : ?>
			<table class="radar-tabela">
				<thead><tr><th><?php esc_html_e( 'Dia', 'radar-loterico' ); ?></th><th><?php esc_html_e( 'Loteria', 'radar-loterico' ); ?></th><th><?php esc_html_e( '1º bolão', 'radar-loterico' ); ?></th><th><?php esc_html_e( 'Colocação', 'radar-loterico' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( array_slice( $d['ultimasEntradas'], 0, 7 ) as $e ) : ?>
					<tr>
						<td><?php echo esc_html( implode( '/', array_reverse( array_slice( explode( '-', (string) $e['dia'] ), 1 ) ) ) ); ?></td>
						<td><?php echo esc_html( isset( $e['nomeModalidade'] ) ? (string) $e['nomeModalidade'] : ucwords( str_replace( '-', ' ', (string) $e['modalidade'] ) ) ); ?></td>
						<td><?php echo esc_html( substr( (string) $e['hora'], 0, 8 ) . ' (' . radar_loterico_atraso( $e['atrasoS'] ) . ')' ); ?></td>
						<td><?php echo esc_html( (int) $e['posicao'] . 'º, pág. ' . (int) $e['pagina'] ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
		<?php echo radar_loterico_rodape( isset( $d['aviso'] ) ? $d['aviso'] : '' ); // phpcs:ignore WordPress.Security.EscapeOutput -- já escapado ?>
	</div>
	<?php
	return ob_get_clean();
}

function radar_loterico_sc_ranking( $atts ) {
	$a = shortcode_atts(
		array(
			'uf'       => '',
			'cidade'   => '',
			'semanas'  => '4',
			'criterio' => 'mais_aberturas',
			'limite'   => '10',
			'titulo'   => '',
		),
		$atts,
		'radar_ranking'
	);
	$criterios = array(
		'mais_aberturas' => 'Quem abriu mais',
		'mais_rapida'    => 'Quem chega mais rápido',
		'mais_pagina1'   => 'Quem mais fica na pág. 1',
	);
	$criterio  = isset( $criterios[ $a['criterio'] ] ) ? $a['criterio'] : 'mais_aberturas';
	$d         = radar_loterico_api(
		'ranking',
		array(
			'uf'       => strtoupper( substr( $a['uf'], 0, 2 ) ),
			'cidade'   => $a['cidade'],
			'semanas'  => (string) max( 1, min( 13, (int) $a['semanas'] ) ),
			'criterio' => $criterio,
			'limite'   => (string) max( 1, min( 50, (int) $a['limite'] ) ),
		)
	);
	if ( is_wp_error( $d ) ) {
		return radar_loterico_erro( $d );
	}
	wp_enqueue_style( 'radar-loterico' );
	$local  = trim( $a['cidade'] . ( $a['uf'] ? '/' . strtoupper( $a['uf'] ) : '' ), '/' );
	$titulo = '' !== $a['titulo'] ? $a['titulo'] : 'Ranking da abertura' . ( $local ? ': ' . $local : '' );
	ob_start();
	?>
	<div class="radar-loterico radar-ranking">
		<h3 class="radar-titulo"><?php echo esc_html( $titulo ); ?></h3>
		<p class="radar-sub"><?php echo esc_html( $criterios[ $criterio ] . sprintf( ' · últimas %d semanas', (int) $a['semanas'] ) ); ?></p>
		<table class="radar-tabela">
			<thead><tr><th>#</th><th><?php esc_html_e( 'Lotérica', 'radar-loterico' ); ?></th><th><?php esc_html_e( 'Aberturas', 'radar-loterico' ); ?></th><th><?php esc_html_e( 'Atraso mediano', 'radar-loterico' ); ?></th><th><?php esc_html_e( 'Pág. 1', 'radar-loterico' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( (array) $d['linhas'] as $l ) : ?>
				<tr>
					<td><?php echo esc_html( (string) (int) $l['posicao'] ); ?></td>
					<td><?php echo esc_html( $l['loterica']['nome'] ); ?> <small><?php echo esc_html( $l['loterica']['cidade'] . '/' . $l['loterica']['uf'] ); ?></small></td>
					<td><?php echo esc_html( (int) $l['participacoes'] . '/' . (int) $l['aberturasOcorridas'] ); ?></td>
					<td><?php echo esc_html( radar_loterico_atraso( $l['atrasoMedianoS'] ) ); ?></td>
					<td><?php echo esc_html( radar_loterico_pct( $l['pctPagina1'] ) ); ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<?php echo radar_loterico_rodape( isset( $d['aviso'] ) ? $d['aviso'] : '' ); // phpcs:ignore WordPress.Security.EscapeOutput -- já escapado ?>
	</div>
	<?php
	return ob_get_clean();
}

function radar_loterico_sc_boloes( $atts ) {
	$a = shortcode_atts(
		array(
			'loja'   => '',
			'modo'   => 'lista',
			'altura' => '900',
			'limite' => '24',
			'titulo' => 'Bolões à venda',
		),
		$atts,
		'radar_boloes'
	);
	$d = radar_loterico_api( 'boloes', array( 'loja' => $a['loja'] ) );
	if ( is_wp_error( $d ) ) {
		return radar_loterico_erro( $d );
	}
	wp_enqueue_style( 'radar-loterico' );
	$loja = isset( $d['loja'] ) ? $d['loja'] : array();
	$site = isset( $loja['site'] ) ? (string) $loja['site'] : '';
	if ( 'iframe' === $a['modo'] && '' !== $site ) {
		$altura = max( 300, min( 4000, (int) $a['altura'] ) );
		return '<div class="radar-loterico radar-iframe"><iframe src="' . esc_url( $site ) . '" title="' . esc_attr( isset( $loja['nome'] ) ? $loja['nome'] : 'Bolões' ) . '" loading="lazy" style="height:' . (int) $altura . 'px" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
	}
	$boloes = array_slice( (array) $d['boloes'], 0, max( 1, min( 100, (int) $a['limite'] ) ) );
	$zap    = isset( $loja['whatsapp'] ) ? preg_replace( '/\D/', '', (string) $loja['whatsapp'] ) : '';
	ob_start();
	?>
	<div class="radar-loterico radar-boloes">
		<h3 class="radar-titulo"><?php echo esc_html( $a['titulo'] ); ?></h3>
		<?php if ( empty( $boloes ) ) : ?>
			<p class="radar-sub"><?php esc_html_e( 'Nenhum bolão à venda agora. Volte mais tarde!', 'radar-loterico' ); ?></p>
		<?php else : ?>
			<div class="radar-grade">
				<?php foreach ( $boloes as $b ) : ?>
					<?php
					$texto = sprintf( 'Olá! Quero cota do bolão %s %d (%s), R$ %s.', $b['nomeModalidade'], (int) $b['concurso'], $b['formato'], number_format( (float) $b['valorCota'], 2, ',', '.' ) );
					$link  = $zap ? 'https://wa.me/' . $zap . '?text=' . rawurlencode( $texto ) : $site;
					?>
					<div class="radar-bolao">
						<strong><?php echo esc_html( $b['nomeModalidade'] . ' ' . (int) $b['concurso'] ); ?></strong>
						<span><?php echo esc_html( $b['formato'] ); ?></span>
						<span class="radar-preco"><?php echo esc_html( radar_loterico_moeda( $b['valorCota'] ) ); ?> <small><?php esc_html_e( 'por cota', 'radar-loterico' ); ?></small></span>
						<span><?php echo esc_html( (int) $b['disponiveis'] . ' de ' . (int) $b['cotasTotal'] . ' cotas disponíveis' ); ?></span>
						<?php if ( $link ) : ?>
							<a class="radar-botao" href="<?php echo esc_url( $link ); ?>" target="_blank" rel="noopener"><?php echo esc_html( $zap ? 'Quero pelo WhatsApp' : 'Ver no site' ); ?></a>
						<?php endif; ?>
					</div>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>
		<?php if ( '' !== $site ) : ?>
			<p class="radar-rodape"><a href="<?php echo esc_url( $site ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Ver todos os bolões', 'radar-loterico' ); ?></a></p>
		<?php endif; ?>
	</div>
	<?php
	return ob_get_clean();
}

function radar_loterico_sc_painel( $atts ) {
	$a    = shortcode_atts(
		array(
			'texto'    => 'Entrar no painel',
			'nova_aba' => 'nao',
		),
		$atts,
		'radar_painel'
	);
	$base = radar_loterico_url_base();
	if ( '' === $base ) {
		return radar_loterico_erro( new WP_Error( 'radar_sem_config', __( 'Configure a URL do sistema em Configurações › Radar Lotérico.', 'radar-loterico' ) ) );
	}
	wp_enqueue_style( 'radar-loterico' );
	$alvo = 'sim' === $a['nova_aba'] ? ' target="_blank" rel="noopener"' : '';
	return '<a class="radar-loterico radar-botao radar-painel" href="' . esc_url( $base . '/entrar' ) . '"' . $alvo . '>' . esc_html( $a['texto'] ) . '</a>';
}
