<?php
/**
 * Cliente da API pública do Radar Lotérico (/api/publica/v1), com cache em transients.
 * Se a API cair, mostra a última resposta boa (guardada por 7 dias) em vez de quebrar a página.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const RADAR_LOTERICO_OPCAO = 'radar_loterico_config';

/** Configuração salva (URL do sistema, chave, minutos de cache, verificar SSL). */
function radar_loterico_config() {
	$c = get_option( RADAR_LOTERICO_OPCAO, array() );
	return wp_parse_args(
		is_array( $c ) ? $c : array(),
		array(
			'url'           => '',
			'chave'         => '',
			'cache_minutos' => 10,
			'verificar_ssl' => 1,
		)
	);
}

/** URL base do sistema, sem barra no fim. */
function radar_loterico_url_base() {
	return untrailingslashit( (string) radar_loterico_config()['url'] );
}

/**
 * GET na API pública. Devolve array (JSON decodificado) ou WP_Error.
 *
 * @param string $recurso conta | raio-x | ranking | boloes
 * @param array  $params  parâmetros da consulta
 * @param bool   $usar_cache false ignora o cache (botão "Testar conexão")
 */
function radar_loterico_api( $recurso, $params = array(), $usar_cache = true ) {
	$cfg = radar_loterico_config();
	if ( '' === $cfg['url'] || '' === $cfg['chave'] ) {
		return new WP_Error( 'radar_sem_config', __( 'Configure a URL do sistema e a chave da API em Configurações › Radar Lotérico.', 'radar-loterico' ) );
	}
	$params = array_filter( array_map( 'strval', $params ), 'strlen' );
	ksort( $params );
	$url   = add_query_arg( array_map( 'rawurlencode', $params ), radar_loterico_url_base() . '/api/publica/v1/' . rawurlencode( $recurso ) );
	$chave = 'radar_lot_' . md5( $url . '|' . $cfg['chave'] );

	if ( $usar_cache ) {
		$cache = get_transient( $chave );
		if ( false !== $cache ) {
			return $cache;
		}
	}

	$resposta = wp_remote_get(
		$url,
		array(
			'timeout'    => 8,
			'sslverify'  => (bool) $cfg['verificar_ssl'],
			'headers'    => array(
				'Authorization' => 'Bearer ' . $cfg['chave'],
				'Accept'        => 'application/json',
			),
			'user-agent' => 'RadarLotericoWordPress/' . RADAR_LOTERICO_VERSAO,
		)
	);

	$erro = null;
	if ( is_wp_error( $resposta ) ) {
		$erro = $resposta;
	} else {
		$codigo = (int) wp_remote_retrieve_response_code( $resposta );
		$dados  = json_decode( wp_remote_retrieve_body( $resposta ), true );
		if ( 200 !== $codigo || ! is_array( $dados ) ) {
			$msg  = is_array( $dados ) && isset( $dados['erro'] ) ? (string) $dados['erro'] : sprintf( 'HTTP %d', $codigo );
			$erro = new WP_Error( 'radar_api', $msg, array( 'status' => $codigo ) );
		}
	}

	if ( $erro ) {
		$reserva = get_option( $chave . '_reserva' );
		return is_array( $reserva ) ? $reserva : $erro;
	}

	$minutos = max( 1, (int) $cfg['cache_minutos'] );
	set_transient( $chave, $dados, $minutos * MINUTE_IN_SECONDS );
	// cópia de reserva (não expira sozinha; é sobrescrita a cada resposta boa)
	update_option( $chave . '_reserva', $dados, false );
	radar_loterico_lembrar_chave( $chave );
	return $dados;
}

/** Guarda os nomes das chaves de cache para poder limpar tudo depois. */
function radar_loterico_lembrar_chave( $chave ) {
	$lista = get_option( 'radar_loterico_chaves_cache', array() );
	if ( ! is_array( $lista ) ) {
		$lista = array();
	}
	if ( ! in_array( $chave, $lista, true ) ) {
		$lista[] = $chave;
		update_option( 'radar_loterico_chaves_cache', array_slice( $lista, -200 ), false );
	}
}

function radar_loterico_limpar_cache() {
	$lista = get_option( 'radar_loterico_chaves_cache', array() );
	foreach ( (array) $lista as $chave ) {
		delete_transient( $chave );
		delete_option( $chave . '_reserva' );
	}
	delete_option( 'radar_loterico_chaves_cache' );
}
