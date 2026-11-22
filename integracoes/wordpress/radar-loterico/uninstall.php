<?php
/**
 * Remove as configurações e o cache do plugin ao desinstalar.
 */
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
$radar_lista = get_option( 'radar_loterico_chaves_cache', array() );
foreach ( (array) $radar_lista as $radar_chave ) {
	delete_transient( $radar_chave );
	delete_option( $radar_chave . '_reserva' );
}
delete_option( 'radar_loterico_chaves_cache' );
delete_option( 'radar_loterico_config' );
